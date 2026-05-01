import asyncio
import json
import time
from typing import Dict, Any, List, Optional
import ollama

from gdvg.config import get_env
from gdvg.clients.supabase_client import (
    get_items_needing_enrichment,
    update_item_enrichment,
    log_processing_status
)
from gdvg.workflows.sources import tmdb, wikidata, wikipedia, search

# Configuration
BATCH_SIZE = int(get_env("BATCH_SIZE", "100"))
OLLAMA_HOST = get_env("OLLAMA_HOST", "http://localhost:11434")
ENRICHMENT_MODEL = "llama3.1:8b"

# Initialize Ollama client pointing to our native Windows server
ollama_client = ollama.AsyncClient(host=OLLAMA_HOST)

async def collect_data_for_content(tmdb_id: int, content_type: str) -> Dict[str, Any]:
    """Collect raw data from all 4 sources for a content item."""
    data = {"tmdb": None, "wikidata": None, "wikipedia_summary": None, "wikipedia_article": None, "searxng": []}
    
    # 1. TMDB
    data["tmdb"] = await tmdb.fetch_content_details(tmdb_id, content_type)
    if not data["tmdb"]:
        return data
        
    title = data["tmdb"].get("title") or data["tmdb"].get("name")
    if not title:
        return data

    imdb_id = data["tmdb"].get("external_ids", {}).get("imdb_id")
    
    # 2. Wikidata
    data["wikidata"] = await wikidata.get_wikidata_by_tmdb_id(tmdb_id, content_type, imdb_id)
    
    # Determine Wiki title
    wiki_title = title
    if data["wikidata"] and data["wikidata"].get("wikipedia_title"):
        wiki_title = data["wikidata"].get("wikipedia_title")

    # 3. Wikipedia (REST + Action APIs)
    if wiki_title:
        # Run both Wiki fetches concurrently
        summary_task = wikipedia.get_content_summary(wiki_title)
        article_task = wikipedia.parse_article_for_content(wiki_title)
        
        data["wikipedia_summary"], parsed_article = await asyncio.gather(summary_task, article_task, return_exceptions=True)
        
        # Handle potential exceptions from gather
        if isinstance(parsed_article, Exception):
            data["wikipedia_article"] = None
        else:
            data["wikipedia_article"] = vars(parsed_article)

    # 4. SearXNG
    search_query = f"{title} {content_type} reviews production details"
    data["searxng"] = await search.search(search_query, num_results=3)
    
    return data

def build_llm_prompt(raw_data: Dict[str, Any]) -> str:
    """Construct the prompt for llama3.1:8b to synthesize the collected data."""
    tmdb_data = raw_data.get("tmdb") or {}
    wiki_article = raw_data.get("wikipedia_article") or {}
    
    prompt = f"""You are an expert entertainment metadata curator. Your task is to synthesize raw data from TMDB, Wikidata, Wikipedia, and web search into structured fields for a database.

Focus on creating rich, accurate, and concise summaries for these specific fields based ONLY on the provided raw data. Do not hallucinate. If data for a field is not present in the sources, output null.

Title: {tmdb_data.get('title') or tmdb_data.get('name')}
Type: {tmdb_data.get('media_type', 'unknown')}
Overview: {tmdb_data.get('overview')}

--- RAW DATA SOURCES ---
1. WIKIPEDIA SECTIONS:
Plot: {wiki_article.get('wiki_plot', 'N/A')}
Production: {wiki_article.get('wiki_production', 'N/A')}
Cast/Characters: {wiki_article.get('wiki_cast_notes', 'N/A')}
Accolades: {wiki_article.get('wiki_accolades', 'N/A')}
Reception: {wiki_article.get('wiki_reception', 'N/A')}
Soundtrack: {wiki_article.get('wiki_soundtrack', 'N/A')}

2. WEB SEARCH OVERVIEW:
{json.dumps(raw_data.get('searxng', []), indent=2)}

--- INSTRUCTIONS ---
Extract and synthesize the raw data into a JSON object with strictly these keys:
- "wiki_plot": A cohesive plot summary (combine TMDB overview + Wikipedia plot if available).
- "wiki_production": Details about filming, development, and creation.
- "wiki_cast_notes": Interesting notes about casting choices or character backgrounds.
- "wiki_accolades": Summary of major awards and nominations.
- "wiki_reception": Summary of critical reception, box office, and ratings.
- "wiki_soundtrack": Details about the musical score and soundtrack.

Return ONLY the raw JSON object. Do not format with Markdown blocks like ```json.
"""
    return prompt

async def process_item(item: Dict[str, Any]) -> bool:
    """Process a single item through the enrichment pipeline."""
    content_id = item["entity_id"]
    tmdb_id = item.get("tmdb_id")
    content_type = item.get("content_type", "movie")
    start_time = time.time()
    
    print(f"🔄 Enriching {content_type} (TMDB ID: {tmdb_id})...")
    
    try:
        # Mark as running
        await log_processing_status(content_id, "content", "enrich", "running", ENRICHMENT_MODEL)
        
        # 1. Collect Data
        raw_data = await collect_data_for_content(tmdb_id, content_type)
        
        # 2. LLM Synthesis
        prompt = build_llm_prompt(raw_data)
        
        print("  🧠 Sending data to llama3.1:8b for synthesis...")
        response = await ollama_client.generate(model=ENRICHMENT_MODEL, prompt=prompt, format="json")
        
        try:
            llm_output = json.loads(response['response'])
        except json.JSONDecodeError:
            print("  ❌ Failed to parse LLM valid JSON output.")
            await log_processing_status(content_id, "content", "enrich", "failed", ENRICHMENT_MODEL, error_message="LLM JSON Decode Error")
            return False
            
        # 3. Database Update
        # Prepare the update payload matching the content table schema
        update_data = {
            "wiki_plot": llm_output.get("wiki_plot"),
            "wiki_production": llm_output.get("wiki_production"),
            "wiki_cast_notes": llm_output.get("wiki_cast_notes"),
            "wiki_accolades": llm_output.get("wiki_accolades"),
            "wiki_reception": llm_output.get("wiki_reception"),
            "wiki_soundtrack": llm_output.get("wiki_soundtrack"),
            "enriched_at": "now()"
        }
        
        # Remove nulls to avoid overwriting existing good data with null
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        if update_data:
            await update_item_enrichment(content_id, update_data)
            
        duration_ms = int((time.time() - start_time) * 1000)
        # Assuming typical token counts for these summaries to avoid complex token counting logic
        await log_processing_status(content_id, "content", "enrich", "completed", ENRICHMENT_MODEL, duration_ms=duration_ms, tokens_used=1500)
        
        print(f"  ✅ Enrichment successful ({duration_ms}ms).")
        return True
        
    except Exception as e:
        print(f"  ❌ Enrichment failed: {e}")
        duration_ms = int((time.time() - start_time) * 1000)
        await log_processing_status(content_id, "content", "enrich", "failed", ENRICHMENT_MODEL, duration_ms=duration_ms, error_message=str(e))
        return False

async def main():
    print(f"🚀 Starting GDVG Enrichment Pipeline (Model: {ENRICHMENT_MODEL})")
    
    # Verify model is available
    try:
        await ollama_client.show(ENRICHMENT_MODEL)
    except ollama.ResponseError as e:
        if e.status_code == 404:
            print(f"❌ Model '{ENRICHMENT_MODEL}' not found. Please run 'ollama pull {ENRICHMENT_MODEL}'.")
            return
        raise

    items = await get_items_needing_enrichment("content", limit=BATCH_SIZE)
    
    if not items:
        print("✨ Queue is empty. Nothing to enrich.")
        return
        
    print(f"📋 Found {len(items)} items to enrich.")
    
    success_count = 0
    for i, item in enumerate(items, 1):
        print(f"\n--- Item {i}/{len(items)} ---")
        if await process_item(item):
            success_count += 1
            
    print("\n" + "="*40)
    print("📊 ENRICHMENT SUMMARY")
    print("="*40)
    print(f"Total Processed: {len(items)}")
    print(f"✅ Successful:    {success_count}")
    print(f"❌ Failed:        {len(items) - success_count}")
    print("="*40)

if __name__ == "__main__":
    asyncio.run(main())

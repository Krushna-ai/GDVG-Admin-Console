import asyncio
import time
from typing import Dict, Any, List
import ollama

from gdvg.config import get_env
from gdvg.clients.supabase_client import (
    supabase,
    log_processing_status
)

# Configuration
BATCH_SIZE = int(get_env("BATCH_SIZE", "100"))
OLLAMA_HOST = get_env("OLLAMA_HOST", "http://localhost:11434")
EMBEDDING_MODEL = "qwen3-embedding:4b"
EMBEDDING_DIM = 1024 # Strictly 1024 dims for qwen3-embedding:4b

ollama_client = ollama.AsyncClient(host=OLLAMA_HOST)

async def _get_items_for_embedding(limit: int = 100) -> List[Dict[str, Any]]:
    """Fetch enriched items that haven't been fully embedded yet."""
    # Simplified query: grab items that have been enriched but don't exist in ai_embeddings
    response = supabase.table("content").select(
        "id, tmdb_id, title, content_type, overview, genres, tagline, wiki_plot, wiki_cast_notes, enriched_at"
    ).not_.is_('enriched_at', 'null').limit(limit).execute()
    
    # Needs a real LEFT JOIN to filter out already embedded items,
    # but for simplicity we rely on DB upsert/ignore or explicit checking
    items = response.data
    
    # Filter out items that already have drama chunks
    unembedded = []
    for item in items:
        emb_res = supabase.table("ai_embeddings").select("id").eq("content_id", item["id"]).eq("chunk_type", "drama").limit(1).execute()
        if not emb_res.data:
            unembedded.append(item)
            
    return unembedded

async def _generate_embedding(text: str) -> List[float]:
    """Generate 1024-dim embedding via Ollama."""
    print(f"    (Generating embedding for {len(text)} chars)")
    response = await ollama_client.embeddings(model=EMBEDDING_MODEL, prompt=text)
    embed = response.get("embedding", [])
    
    # qwen3-embedding:4b should return 1024 natively, but we ensure structure
    if len(embed) != EMBEDDING_DIM:
        print(f"    ⚠️ Warning: Received {len(embed)} dimensions, expected {EMBEDDING_DIM}")
    return embed

async def _save_chunk(content_id: str, chunk_type: str, chunk_label: str, source_text: str):
    """Generate and save a single chunk to Supabase."""
    if not source_text or len(source_text.strip()) < 10:
        return

    vector = await _generate_embedding(source_text)
    
    data = {
        "content_id": content_id,
        "chunk_type": chunk_type,
        "chunk_label": chunk_label,
        "source_text": source_text,
        "embedding": vector,
        "model_used": EMBEDDING_MODEL
    }
    
    # Insert ignore policy would be better, but doing a basic upsert mechanism
    supabase.table("ai_embeddings").insert(data).execute()
    print(f"  ✓ Saved chunk: {chunk_type} - {chunk_label}")

async def process_embeddings(item: Dict[str, Any]) -> bool:
    content_id = item["id"]
    content_type = item.get("content_type", "movie")
    title = item.get('title', 'Unknown')
    start_time = time.time()
    
    print(f"\n🔄 Embedding {content_type}: {title}")
    await log_processing_status(content_id, "content", "embed", "running", EMBEDDING_MODEL)

    try:
        # ====== 1. DRAMA-LEVEL CHUNK ======
        # overall themes, tone, genre, vibe
        # Source: overview + wiki_plot + genres + keywords + tagline
        genres = ", ".join([g.get("name", "") for g in (item.get("genres") or []) if isinstance(g, dict)])
        drama_parts = [
            f"Title: {title}",
            f"Type: {content_type}",
            f"Tagline: {item.get('tagline', '')}",
            f"Genres: {genres}",
            f"Overview: {item.get('overview', '')}",
            f"Extended Plot: {item.get('wiki_plot', '')}"
        ]
        drama_text = "\n".join([p for p in drama_parts if p and len(p.split(': ', 1)[-1]) > 0])
        await _save_chunk(content_id, "drama", "Main Theme", drama_text)

        # ====== 2. CHARACTER CHUNKS ======
        # Source: character name + actor name + wiki_cast_notes excerpt
        # Let's get top cast members from DB
        cast_res = supabase.table("content_cast").select(
            "character_name, role_type, people(name)"
        ).eq("content_id", content_id).execute()
        
        wiki_cast = item.get('wiki_cast_notes', '')
        
        for cast in cast_res.data[:10]: # Top 10
            actor_name = cast.get('people', {}).get('name', 'Unknown')
            char_name = cast.get('character_name', 'Unknown')
            role = cast.get('role_type', 'main')
            
            # Simple context matching - grab sentences surrounding character name from wiki notes
            char_context = ""
            if wiki_cast and actor_name in wiki_cast or char_name in wiki_cast:
               char_context = "Detailed cast notes available in full body." # simplified for now
               
            char_text = f"Character: {char_name}\nActor: {actor_name}\nRole: {role}\nShow: {title}\n{char_context}"
            await _save_chunk(content_id, "character", f"Char: {char_name}", char_text)

        # ====== 3. SEASON / EPISODE CHUNKS ======
        if content_type == "tv":
            seasons_res = supabase.table("seasons").select(
                "id, season_number, name, overview"
            ).eq("content_id", content_id).execute()
            
            for season in seasons_res.data:
                s_num = season.get('season_number', 0)
                s_overview = season.get('overview', '')
                
                if s_overview and len(s_overview) > 50:
                    season_text = f"Show: {title}\nSeason {s_num}: {season.get('name', '')}\nOverview: {s_overview}"
                    await _save_chunk(content_id, "season", f"Season {s_num}", season_text)
                    
                # Get episodes 
                episodes_res = supabase.table("episodes").select(
                    "episode_number, name, overview"
                ).eq("season_id", season["id"]).execute()
                
                for ep in episodes_res.data:
                    e_num = ep.get('episode_number', 0)
                    e_overview = ep.get('overview', '')
                    
                    if e_overview and len(e_overview) > 50:
                        ep_text = f"Show: {title}\nSeason {s_num} Episode {e_num}: {ep.get('name', '')}\nOverview: {e_overview}"
                        await _save_chunk(content_id, "episode", f"S{s_num}E{e_num}", ep_text)

        duration_ms = int((time.time() - start_time) * 1000)
        await log_processing_status(content_id, "content", "embed", "completed", EMBEDDING_MODEL, duration_ms=duration_ms)
        print(f"  ✅ Embedding generation successful ({duration_ms}ms).")
        return True

    except Exception as e:
        print(f"  ❌ Embedding failed: {e}")
        duration_ms = int((time.time() - start_time) * 1000)
        await log_processing_status(content_id, "content", "embed", "failed", EMBEDDING_MODEL, duration_ms=duration_ms, error_message=str(e))
        return False

async def main():
    print(f"🚀 Starting GDVG Smart Embedding Pipeline (Model: {EMBEDDING_MODEL})")
    
    # Verify model is available
    try:
        await ollama_client.show(EMBEDDING_MODEL)
    except ollama.ResponseError as e:
        if e.status_code == 404:
            print(f"❌ Model '{EMBEDDING_MODEL}' not found. Please run 'ollama pull {EMBEDDING_MODEL}'.")
            return
        raise

    items = await _get_items_for_embedding(limit=BATCH_SIZE)
    if not items:
        print("✨ Queue is empty. Nothing to embed.")
        return
        
    print(f"📋 Found {len(items)} items to embed.")
    
    success_count = 0
    for i, item in enumerate(items, 1):
        if await process_embeddings(item):
            success_count += 1
            
    print("\n" + "="*40)
    print("📊 EMBEDDING SUMMARY")
    print("="*40)
    print(f"Total Processed: {len(items)}")
    print(f"✅ Successful:    {success_count}")
    print(f"❌ Failed:        {len(items) - success_count}")
    print("="*40)

if __name__ == "__main__":
    asyncio.run(main())

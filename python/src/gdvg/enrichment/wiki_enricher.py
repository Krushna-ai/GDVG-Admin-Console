"""Wikipedia and Wikidata content enrichment engine.

Enhances TMDB content data with:
- Wikipedia summaries (often richer than TMDB overviews)
- Wikidata metadata (genres, networks, screenwriters, locations)
- Wikipedia categories (merged with TMDB keywords)
"""

import logging
from typing import Optional, Any, Literal

from gdvg.clients.wikipedia import create_wikipedia_client
from gdvg.clients.wikidata import create_wikidata_client

logger = logging.getLogger(__name__)


class WikiEnricher:
    """Wikipedia and Wikidata content enrichment engine.
    
    Strategy:
    1. Look up Wikidata entity by TMDB ID
    2. Get Wikipedia title from Wikidata
    3. Fetch Wikipedia summary (use if better than TMDB)
    4. Fetch Wikipedia categories (merge with keywords)
    5. Extract Wikidata properties (genres, networks, etc.)
    """
    
    def __init__(self):
        self.stats = {
            "wikidata_found": 0,
            "wikipedia_found": 0,
            "overview_enhanced": 0,
            "genres_merged": 0,
            "categories_added": 0,
        }
    
    async def enrich_content(
        self,
        tmdb_id: int,
        content_type: Literal["movie", "tv"],
        current_overview: Optional[str] = None,
        current_genres: Optional[list[str]] = None,
        current_keywords: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Enrich content with Wikipedia and Wikidata data.
        
        Args:
            tmdb_id: TMDB ID
            content_type: 'movie' or 'tv'
            current_overview: Existing TMDB overview
            current_genres: Existing TMDB genres
            current_keywords: Existing TMDB keywords dict
            
        Returns:
            Dict with updated fields (overview, genres, keywords, etc.)
        """
        enrichment = {}
        
        # Step 1: Look up Wikidata entity
        async with create_wikidata_client() as wikidata:
            wikidata_entity = await wikidata.get_by_tmdb_id(tmdb_id, content_type)
            
            if not wikidata_entity:
                logger.debug(f"No Wikidata entity found for {content_type} {tmdb_id}")
                return enrichment
            
            self.stats["wikidata_found"] += 1
            
            wikidata_id = wikidata_entity["wikidata_id"]
            wikipedia_title = wikidata_entity.get("wikipedia_title")
            wikipedia_url = wikidata_entity.get("wikipedia_url")
            
            enrichment["wikidata_id"] = wikidata_id
            enrichment["wikipedia_url"] = wikipedia_url
            
            # Step 2 & 3: Fetch Wikipedia data
            if wikipedia_title:
                async with create_wikipedia_client() as wiki:
                    # Get summary
                    summary = await wiki.get_page_summary(wikipedia_title, language="en")
                    
                    if summary:
                        self.stats["wikipedia_found"] += 1
                        wiki_overview = summary.get("extract", "")
                        
                        # Use Wikipedia overview if:
                        # 1. No TMDB overview exists, OR
                        # 2. Wikipedia overview is significantly longer (2x+)
                        use_wiki_overview = False
                        if not current_overview:
                            use_wiki_overview = True
                        elif wiki_overview and len(wiki_overview) > len(current_overview) * 2:
                            use_wiki_overview = True
                        
                        if use_wiki_overview and wiki_overview:
                            enrichment["overview"] = wiki_overview
                            enrichment["overview_source"] = "wikipedia"
                            self.stats["overview_enhanced"] += 1
                        
                        # Get categories for keyword merging
                        categories = await wiki.get_page_categories(
                            wikipedia_title,
                            language="en",
                            limit=50
                        )
                        
                        if categories:
                            # Filter and clean category names
                            # Remove "Category:" prefix and common meta-categories
                            cleaned_categories = []
                            skip_patterns = [
                                "Articles",
                                "Pages",
                                "Wikipedia",
                                "Webarchive",
                                "CS1",
                                "All articles",
                                "Use dmy dates",
                                "Use mdy dates",
                            ]
                            
                            for cat in categories:
                                # Remove "Category:" prefix
                                cat_name = cat.replace("Category:", "").strip()
                                
                                # Skip meta-categories
                                if any(pattern in cat_name for pattern in skip_patterns):
                                    continue
                                
                                cleaned_categories.append(cat_name)
                            
                            # Merge with existing keywords
                            merged_keywords = current_keywords.copy() if current_keywords else {"keywords": []}
                            existing_keyword_names = {
                                kw["name"].lower() 
                                for kw in merged_keywords.get("keywords", [])
                            }
                            
                            # Add new categories as keywords
                            new_keywords = []
                            for cat_name in cleaned_categories[:20]:  # Limit to top 20
                                if cat_name.lower() not in existing_keyword_names:
                                    new_keywords.append({
                                        "id": None,  # No TMDB ID for Wikipedia categories
                                        "name": cat_name,
                                        "source": "wikipedia",
                                    })
                            
                            if new_keywords:
                                merged_keywords["keywords"] = [
                                    *merged_keywords.get("keywords", []),
                                    *new_keywords,
                                ]
                                enrichment["keywords"] = merged_keywords
                                self.stats["categories_added"] += len(new_keywords)
            
            # Step 4: Extract Wikidata properties
            wikidata_metadata = await wikidata.get_entity_metadata(wikidata_id)
            
            if wikidata_metadata:
                # Merge genres (Wikidata P136 + TMDB genres)
                wikidata_genres = wikidata_metadata.get("genre", [])
                if isinstance(wikidata_genres, str):
                    wikidata_genres = [wikidata_genres]
                
                if wikidata_genres:
                    current_genres_set = set(current_genres or [])
                    merged_genres = list(current_genres_set | set(wikidata_genres))
                    
                    if len(merged_genres) > len(current_genres_set):
                        enrichment["genres"] = merged_genres
                        self.stats["genres_merged"] += 1
                
                # Extract network (P449) - important for TV shows
                network = wikidata_metadata.get("original_network")
                if network:
                    if isinstance(network, list):
                        enrichment["network"] = network[0] if network else None
                    else:
                        enrichment["network"] = network
                
                # Extract screenwriter (P58)
                screenwriter = wikidata_metadata.get("screenwriter")
                if screenwriter:
                    enrichment["screenwriter"] = screenwriter
                
                # Extract director (P57)
                director = wikidata_metadata.get("director")
                if director:
                    enrichment["director"] = director
                
                # Extract creator (P170) - for TV shows
                creator = wikidata_metadata.get("creator")
                if creator:
                    enrichment["creator"] = creator
                
                # Extract country of origin (P495)
                country = wikidata_metadata.get("country_of_origin")
                if country:
                    enrichment["country_of_origin"] = country
                
                # Extract locations
                narrative_location = wikidata_metadata.get("narrative_location")
                if narrative_location:
                    enrichment["narrative_location"] = narrative_location
                
                filming_location = wikidata_metadata.get("filming_location")
                if filming_location:
                    enrichment["filming_location"] = filming_location
                
                # Extract duration (P2047) - might be more accurate than TMDB
                duration = wikidata_metadata.get("duration")
                if duration:
                    enrichment["duration_minutes"] = duration
        
        return enrichment
    
    async def enrich_content_batch(
        self,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Enrich multiple content items with Wikipedia/Wikidata data.
        
        Args:
            items: List of content dicts with tmdb_id, content_type, overview, genres, keywords
            
        Returns:
            List of enrichment dicts
        """
        enrichments = []
        
        for item in items:
            enrichment = await self.enrich_content(
                tmdb_id=item["tmdb_id"],
                content_type=item["content_type"],
                current_overview=item.get("overview"),
                current_genres=item.get("genres"),
                current_keywords=item.get("keywords"),
            )
            
            enrichments.append({
                "tmdb_id": item["tmdb_id"],
                "content_type": item["content_type"],
                **enrichment,
            })
        
        return enrichments


async def enrich_content_with_wiki(
    tmdb_id: int,
    content_type: Literal["movie", "tv"],
    current_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Enrich a single content item with Wikipedia/Wikidata.
    
    Convenience function for single-item enrichment.
    
    Args:
        tmdb_id: TMDB ID
        content_type: 'movie' or 'tv'
        current_data: Current content data (with overview, genres, keywords)
        
    Returns:
        Enrichment dict
    """
    enricher = WikiEnricher()
    
    current_data = current_data or {}
    
    return await enricher.enrich_content(
        tmdb_id=tmdb_id,
        content_type=content_type,
        current_overview=current_data.get("overview"),
        current_genres=current_data.get("genres"),
        current_keywords=current_data.get("keywords"),
    )

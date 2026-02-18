"""TMDB people enrichment engine with comprehensive data extraction.

Extracts ALL fields from TMDB person detail responses including:
- Biography, birthday, deathday, place_of_birth
- Also known as (name variations)
- Combined credits (full filmography for cross-linking)
- Images (profile photos + tagged images from movies)
- External IDs (IMDb, Wikidata, social media)
- Main profile photo selection
- Wikipedia biography enrichment (with name variation matching)
"""

import asyncio
import logging
from typing import Optional, Any
from datetime import datetime

from gdvg.clients.tmdb import create_tmdb_client, TMDBClient
from gdvg.clients.wikipedia import create_wikipedia_client
from gdvg.db.people import upsert_people_bulk
from gdvg.db.queue import get_enrichment_queue_batch, mark_enrichment_queue_completed

logger = logging.getLogger(__name__)


class PeopleEnricher:
    """TMDB people enrichment engine.
    
    Fetches complete TMDB person data using append_to_response and
    transforms it into our database schema.
    """
    
    def __init__(self):
        self.stats = {
            "processed": 0,
            "success": 0,
            "failed": 0,
            "skipped": 0,
        }
    
    def _extract_basic_fields(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract basic person fields from TMDB data.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            Dict with basic person fields
        """
        fields = {
            "tmdb_id": tmdb_data.get("id"),
            "name": tmdb_data.get("name"),
            "biography": tmdb_data.get("biography"),
            "birthday": tmdb_data.get("birthday"),
            "deathday": tmdb_data.get("deathday"),
            "place_of_birth": tmdb_data.get("place_of_birth"),
            "homepage": tmdb_data.get("homepage"),
            "popularity": tmdb_data.get("popularity"),
            "gender": tmdb_data.get("gender"),  # 0=unknown, 1=female, 2=male, 3=non-binary
            "known_for_department": tmdb_data.get("known_for_department"),
            "adult": tmdb_data.get("adult", False),
        }
        
        # Also known as (name variations)
        also_known_as = tmdb_data.get("also_known_as", [])
        if also_known_as:
            fields["also_known_as"] = also_known_as
        
        # Profile path (main profile photo)
        if tmdb_data.get("profile_path"):
            fields["profile_path"] = f"https://image.tmdb.org/t/p/original{tmdb_data['profile_path']}"
        
        return fields
    
    def _extract_images(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract ALL images (profiles + tagged images) from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with all images
        """
        images_data = tmdb_data.get("images", {})
        tagged_images_data = tmdb_data.get("tagged_images", {})
        
        profiles = [
            {
                "file_path": f"https://image.tmdb.org/t/p/original{img.get('file_path')}",
                "width": img.get("width"),
                "height": img.get("height"),
                "aspect_ratio": img.get("aspect_ratio"),
                "vote_average": img.get("vote_average"),
                "vote_count": img.get("vote_count"),
            }
            for img in images_data.get("profiles", [])
        ]
        
        # Tagged images (person in movie stills)
        tagged = [
            {
                "file_path": f"https://image.tmdb.org/t/p/original{img.get('file_path')}",
                "width": img.get("width"),
                "height": img.get("height"),
                "aspect_ratio": img.get("aspect_ratio"),
                "vote_average": img.get("vote_average"),
                "vote_count": img.get("vote_count"),
                "media_type": img.get("media_type"),
                "media_id": img.get("id"),
            }
            for img in tagged_images_data.get("results", [])
        ]
        
        # Select main profile photo (highest voted or first)
        main_profile = None
        if profiles:
            # Sort by vote_average (descending), then vote_count
            sorted_profiles = sorted(
                profiles,
                key=lambda x: (x.get("vote_average", 0), x.get("vote_count", 0)),
                reverse=True,
            )
            main_profile = sorted_profiles[0]["file_path"]
        
        return {
            "profiles": profiles,
            "tagged_images": tagged,
            "main_profile_photo": main_profile,
        }
    
    def _extract_external_ids(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract external IDs from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            Dict with external ID fields
        """
        external_ids = tmdb_data.get("external_ids", {})
        
        return {
            "imdb_id": external_ids.get("imdb_id"),
            "wikidata_id": external_ids.get("wikidata_id"),
            "facebook_id": external_ids.get("facebook_id"),
            "instagram_id": external_ids.get("instagram_id"),
            "twitter_id": external_ids.get("twitter_id"),
            "tiktok_id": external_ids.get("tiktok_id"),
            "youtube_id": external_ids.get("youtube_id"),
        }
    
    def _extract_combined_credits(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract combined credits (full filmography) from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            Dict with cast and crew credits for cross-linking
        """
        combined_credits = tmdb_data.get("combined_credits", {})
        
        cast_credits = [
            {
                "tmdb_id": credit.get("id"),
                "title": credit.get("title") or credit.get("name"),
                "media_type": credit.get("media_type"),
                "character": credit.get("character"),
                "episode_count": credit.get("episode_count"),
                "release_date": credit.get("release_date") or credit.get("first_air_date"),
            }
            for credit in combined_credits.get("cast", [])
        ]
        
        crew_credits = [
            {
                "tmdb_id": credit.get("id"),
                "title": credit.get("title") or credit.get("name"),
                "media_type": credit.get("media_type"),
                "job": credit.get("job"),
                "department": credit.get("department"),
                "episode_count": credit.get("episode_count"),
                "release_date": credit.get("release_date") or credit.get("first_air_date"),
            }
            for credit in combined_credits.get("crew", [])
        ]
        
        return {
            "cast_credits": cast_credits,
            "crew_credits": crew_credits,
            "total_credits": len(cast_credits) + len(crew_credits),
        }
    
    def _generate_name_variations(self, name: str, also_known_as: list[str] = None) -> list[str]:
        """Generate name variations for Wikipedia lookup.
        
        Handles romanization variants and also_known_as names.
        
        Args:
            name: Primary name
            also_known_as: Alternative names from TMDB
            
        Returns:
            List of name variations to try
        """
        variations = [name]
        
        # Add also_known_as names
        if also_known_as:
            variations.extend(also_known_as[:5])  # Limit to top 5
        
        # Generate romanization variants (hyphenated vs space-separated)
        # E.g., "Song Joong-ki" → ["Song Joong-ki", "Song Joong ki"]
        if "-" in name:
            variations.append(name.replace("-", " "))
        elif " " in name:
            # Try hyphenated versions for multi-word names
            parts = name.split()
            if len(parts) >= 2:
                # Try hyphenating last two parts (common for Korean names)
                # "Song Joong Ki" → "Song Joong-Ki"
                variations.append(" ".join(parts[:-2] + ["-".join(parts[-2:])]))
        
        return variations
    
    async def _enrich_biography_from_wikipedia(
        self,
        name: str,
        also_known_as: list[str] = None,
        tmdb_biography: str = None,
    ) -> dict[str, Any]:
        """Enrich person biography from Wikipedia.
        
        Tries multiple name variations to find Wikipedia page.
        Uses Wikipedia summary if richer than TMDB biography.
        
        Args:
            name: Person's name
            also_known_as: Alternative names
            tmdb_biography: Existing TMDB biography
            
        Returns:
            Dict with biography, bio_source, wikipedia_url
        """
        enrichment = {}
        
        # Generate name variations
        name_variations = self._generate_name_variations(name, also_known_as)
        
        async with create_wikipedia_client() as wiki:
            wikipedia_bio = None
            wikipedia_url = None
            
            # Try each name variation
            for name_variant in name_variations:
                try:
                    # First try exact lookup
                    summary = await wiki.get_page_summary(name_variant, language="en")
                    
                    if summary and summary.get("extract"):
                        wikipedia_bio = summary.get("extract")
                        wikipedia_url = summary.get("content_urls", {}).get("desktop", {}).get("page")
                        break
                    
                    # If no exact match, try search
                    search_results = await wiki.search_pages(name_variant, language="en", limit=3)
                    
                    if search_results:
                        # Get summary of first result
                        first_result = search_results[0]
                        summary = await wiki.get_page_summary(first_result, language="en")
                        
                        if summary and summary.get("extract"):
                            wikipedia_bio = summary.get("extract")
                            wikipedia_url = summary.get("content_urls", {}).get("desktop", {}).get("page")
                            break
                
                except Exception as e:
                    logger.debug(f"Wikipedia lookup failed for {name_variant}: {e}")
                    continue
            
            # Use Wikipedia bio if:
            # 1. No TMDB biography exists, OR
            # 2. Wikipedia bio is significantly longer (2x+)
            if wikipedia_bio:
                use_wiki_bio = False
                
                if not tmdb_biography or len(tmdb_biography.strip()) == 0:
                    use_wiki_bio = True
                elif len(wikipedia_bio) > len(tmdb_biography) * 2:
                    use_wiki_bio = True
                
                if use_wiki_bio:
                    enrichment["biography"] = wikipedia_bio
                    enrichment["bio_source"] = "wikipedia"
                
                # Always store Wikipedia URL if found
                if wikipedia_url:
                    enrichment["wikipedia_url"] = wikipedia_url
        
        return enrichment
    
    async def enrich_person(
        self,
        tmdb_id: int,
        tmdb_client: Optional[TMDBClient] = None,
    ) -> Optional[dict[str, Any]]:
        """Enrich a single person with ALL TMDB data.

        Args:
            tmdb_id: TMDB person ID
            tmdb_client: Optional shared TMDBClient. If None, creates a new one.

        Returns:
            Complete person dict ready for DB upsert, or None if failed
        """
        try:
            if tmdb_client is not None:
                tmdb_data = await tmdb_client.get_person_details(tmdb_id)
            else:
                async with create_tmdb_client() as tmdb:
                    tmdb_data = await tmdb.get_person_details(tmdb_id)

            if not tmdb_data:
                logger.warning(f"No data returned for person {tmdb_id}")
                return None

            # Extract all fields
            person = self._extract_basic_fields(tmdb_data)

            # Images and main profile photo
            images_data = self._extract_images(tmdb_data)
            person["images"] = {
                "profiles": images_data["profiles"],
                "tagged_images": images_data["tagged_images"],
            }
            person["main_profile_photo"] = images_data["main_profile_photo"]

            # External IDs
            external_ids = self._extract_external_ids(tmdb_data)
            person.update(external_ids)

            # Combined credits (for cross-linking)
            credits_data = self._extract_combined_credits(tmdb_data)
            person["combined_credits"] = {
                "cast": credits_data["cast_credits"],
                "crew": credits_data["crew_credits"],
            }
            person["combined_credits_count"] = credits_data["total_credits"]

            # Store credits separately for processing
            person["_cast_credits"] = credits_data["cast_credits"]
            person["_crew_credits"] = credits_data["crew_credits"]

            # Metadata
            person["enriched_at"] = datetime.utcnow().isoformat()
            person["bio_source"] = "tmdb"

            return person

        except Exception as e:
            logger.error(f"Error enriching person {tmdb_id}: {e}", exc_info=True)
            return None
    
    async def enrich_batch(
        self,
        tmdb_ids: list[int],
        max_concurrent: int = 20,
    ) -> list[dict[str, Any]]:
        """Enrich multiple people concurrently.

        Uses a single shared TMDBClient with a semaphore to cap concurrency.
        TMDB rate limiter (50ms/req) is enforced inside the shared client.

        Args:
            tmdb_ids: List of TMDB person IDs
            max_concurrent: Max simultaneous TMDB requests (default: 20)

        Returns:
            List of enriched person dicts (failures excluded)
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        enriched: list[Optional[dict[str, Any]]] = [None] * len(tmdb_ids)

        async with create_tmdb_client() as shared_tmdb:
            async def fetch_one(idx: int, tmdb_id: int) -> None:
                async with semaphore:
                    result = await self.enrich_person(tmdb_id, tmdb_client=shared_tmdb)
                    if result:
                        self.stats["success"] += 1
                    else:
                        self.stats["failed"] += 1
                    self.stats["processed"] += 1
                    enriched[idx] = result

            tasks = [fetch_one(i, tid) for i, tid in enumerate(tmdb_ids)]
            await asyncio.gather(*tasks)

        return [r for r in enriched if r is not None]


async def enrich_from_queue(
    batch_size: int = 300,
) -> dict[str, int]:
    """Process people from enrichment queue and enrich.
    
    Args:
        batch_size: Number of items to process
        
    Returns:
        Statistics dict
    """
    # Get batch from queue
    queue_items = get_enrichment_queue_batch(
        batch_size=batch_size,
        queue_type="people",
    )
    
    if queue_items.empty:
        logger.info("No people in enrichment queue")
        return {"processed": 0, "success": 0, "failed": 0}
    
    logger.info(f"Processing {len(queue_items)} people from enrichment queue")
    
    # Prepare items for enrichment
    tmdb_ids = queue_items["tmdb_id"].tolist()
    
    # Enrich
    enricher = PeopleEnricher()
    enriched_df = await enricher.enrich_batch(tmdb_ids)
    
    if not enriched_df.empty:
        # Remove temporary credit fields before DB upsert
        if "_cast_credits" in enriched_df.columns:
            enriched_df = enriched_df.drop(columns=["_cast_credits", "_crew_credits"])
        
        # Bulk upsert to DB
        upsert_people_bulk(enriched_df)
        
        # Mark queue items as completed
        queue_ids = queue_items["id"].tolist()
        mark_enrichment_queue_completed(queue_ids)
    
    return enricher.stats


async def enrich_people_list(
    tmdb_ids: list[int],
) -> pd.DataFrame:
    """Enrich a list of people (convenience function).
    
    Args:
        tmdb_ids: List of TMDB person IDs
        
    Returns:
        DataFrame with enriched people
    """
    enricher = PeopleEnricher()
    return await enricher.enrich_batch(tmdb_ids)

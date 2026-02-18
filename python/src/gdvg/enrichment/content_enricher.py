"""TMDB content enrichment engine with comprehensive data extraction.

Extracts ALL fields from TMDB detail responses including all append_to_response
sub-resources: credits, keywords, videos, images, watch/providers, external_ids,
content_ratings, alternative_titles, translations, reviews, recommendations, similar.
"""

import asyncio
import logging
from typing import Optional, Any, Literal
from datetime import datetime


from gdvg.clients.tmdb import create_tmdb_client, TMDBClient
from gdvg.db.content import upsert_content_bulk
from gdvg.db.queue import get_import_queue_batch, mark_import_queue_completed

logger = logging.getLogger(__name__)


class ContentEnricher:
    """TMDB content enrichment engine.
    
    Fetches complete TMDB data using append_to_response and transforms
    it into our database schema.
    """
    
    def __init__(self):
        self.stats = {
            "processed": 0,
            "success": 0,
            "failed": 0,
            "skipped": 0,
        }
    
    def _extract_basic_fields(
        self,
        tmdb_data: dict[str, Any],
        content_type: Literal["movie", "tv"],
    ) -> dict[str, Any]:
        """Extract basic content fields from TMDB data.
        
        Args:
            tmdb_data: Raw TMDB API response
            content_type: 'movie' or 'tv'
            
        Returns:
            Dict with basic content fields
        """
        fields = {
            "tmdb_id": tmdb_data.get("id"),
            "content_type": content_type,
            "title": tmdb_data.get("title" if content_type == "movie" else "name"),
            "original_title": tmdb_data.get("original_title" if content_type == "movie" else "original_name"),
            "overview": tmdb_data.get("overview"),
            "tagline": tmdb_data.get("tagline"),
            "status": tmdb_data.get("status"),
            "original_language": tmdb_data.get("original_language"),
            "homepage": tmdb_data.get("homepage"),
            "popularity": tmdb_data.get("popularity"),
            "vote_average": tmdb_data.get("vote_average"),
            "vote_count": tmdb_data.get("vote_count"),
            "adult": tmdb_data.get("adult", False),
        }
        
        # Date fields
        if content_type == "movie":
            fields["release_date"] = tmdb_data.get("release_date")
            fields["runtime"] = tmdb_data.get("runtime")
            fields["budget"] = tmdb_data.get("budget")
            fields["revenue"] = tmdb_data.get("revenue")
        else:
            fields["first_air_date"] = tmdb_data.get("first_air_date")
            fields["last_air_date"] = tmdb_data.get("last_air_date")
            fields["number_of_seasons"] = tmdb_data.get("number_of_seasons")
            fields["number_of_episodes"] = tmdb_data.get("number_of_episodes")
            fields["episode_run_time"] = tmdb_data.get("episode_run_time", [None])[0] if tmdb_data.get("episode_run_time") else None
            fields["in_production"] = tmdb_data.get("in_production")
            fields["type"] = tmdb_data.get("type")
        
        # Poster and backdrop
        if tmdb_data.get("poster_path"):
            fields["poster_path"] = f"https://image.tmdb.org/t/p/original{tmdb_data['poster_path']}"
        if tmdb_data.get("backdrop_path"):
            fields["backdrop_path"] = f"https://image.tmdb.org/t/p/original{tmdb_data['backdrop_path']}"
        
        return fields
    
    def _extract_genres(self, tmdb_data: dict[str, Any]) -> list[str]:
        """Extract genre names from TMDB data.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            List of genre names
        """
        genres = tmdb_data.get("genres", [])
        return [g["name"] for g in genres if g.get("name")]
    
    def _extract_keywords(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract keywords from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with keyword data
        """
        keywords_data = tmdb_data.get("keywords", {})
        
        # Movies use 'keywords', TV uses 'results'
        keyword_list = keywords_data.get("keywords") or keywords_data.get("results", [])
        
        return {
            "keywords": [
                {"id": kw.get("id"), "name": kw.get("name")}
                for kw in keyword_list
            ]
        }
    
    def _extract_videos(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract ALL videos (trailers, teasers, clips, etc.) from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with all videos
        """
        videos_data = tmdb_data.get("videos", {})
        results = videos_data.get("results", [])
        
        return {
            "videos": [
                {
                    "id": v.get("id"),
                    "key": v.get("key"),
                    "name": v.get("name"),
                    "site": v.get("site"),
                    "type": v.get("type"),  # Trailer, Teaser, Clip, etc.
                    "size": v.get("size"),
                    "official": v.get("official"),
                    "published_at": v.get("published_at"),
                }
                for v in results
            ]
        }
    
    def _extract_images(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract ALL images (posters, backdrops, logos) from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with all images
        """
        images_data = tmdb_data.get("images", {})
        
        return {
            "posters": [
                {
                    "file_path": f"https://image.tmdb.org/t/p/original{img.get('file_path')}",
                    "width": img.get("width"),
                    "height": img.get("height"),
                    "vote_average": img.get("vote_average"),
                    "vote_count": img.get("vote_count"),
                    "iso_639_1": img.get("iso_639_1"),
                }
                for img in images_data.get("posters", [])
            ],
            "backdrops": [
                {
                    "file_path": f"https://image.tmdb.org/t/p/original{img.get('file_path')}",
                    "width": img.get("width"),
                    "height": img.get("height"),
                    "vote_average": img.get("vote_average"),
                    "vote_count": img.get("vote_count"),
                }
                for img in images_data.get("backdrops", [])
            ],
            "logos": [
                {
                    "file_path": f"https://image.tmdb.org/t/p/original{img.get('file_path')}",
                    "width": img.get("width"),
                    "height": img.get("height"),
                }
                for img in images_data.get("logos", [])
            ],
        }
    
    def _extract_watch_providers(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract watch/providers from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with all regional watch providers
        """
        providers_data = tmdb_data.get("watch/providers", {})
        results = providers_data.get("results", {})
        
        # Structure: {region: {flatrate: [...], rent: [...], buy: [...]}}
        return {
            "providers": {
                region: {
                    "flatrate": [
                        {
                            "provider_id": p.get("provider_id"),
                            "provider_name": p.get("provider_name"),
                            "logo_path": f"https://image.tmdb.org/t/p/original{p.get('logo_path')}" if p.get("logo_path") else None,
                        }
                        for p in data.get("flatrate", [])
                    ],
                    "rent": [
                        {
                            "provider_id": p.get("provider_id"),
                            "provider_name": p.get("provider_name"),
                            "logo_path": f"https://image.tmdb.org/t/p/original{p.get('logo_path')}" if p.get("logo_path") else None,
                        }
                        for p in data.get("rent", [])
                    ],
                    "buy": [
                        {
                            "provider_id": p.get("provider_id"),
                            "provider_name": p.get("provider_name"),
                            "logo_path": f"https://image.tmdb.org/t/p/original{p.get('logo_path')}" if p.get("logo_path") else None,
                        }
                        for p in data.get("buy", [])
                    ],
                }
                for region, data in results.items()
            }
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
            "tvdb_id": external_ids.get("tvdb_id"),
        }
    
    def _extract_content_ratings(
        self,
        tmdb_data: dict[str, Any],
        content_type: Literal["movie", "tv"],
    ) -> Optional[str]:
        """Extract primary content rating.
        
        Args:
            tmdb_data: Raw TMDB API response
            content_type: 'movie' or 'tv'
            
        Returns:
            Primary content rating (US rating preferred)
        """
        if content_type == "movie":
            releases = tmdb_data.get("release_dates", {}).get("results", [])
            # Find US rating
            for release in releases:
                if release.get("iso_3166_1") == "US":
                    release_dates = release.get("release_dates", [])
                    if release_dates:
                        return release_dates[0].get("certification")
        else:
            # TV shows
            ratings = tmdb_data.get("content_ratings", {}).get("results", [])
            for rating in ratings:
                if rating.get("iso_3166_1") == "US":
                    return rating.get("rating")
        
        return None
    
    def _extract_alternative_titles(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract alternative titles from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with alternative titles
        """
        alt_titles_data = tmdb_data.get("alternative_titles", {})
        
        # Movies use 'titles', TV uses 'results'
        titles_list = alt_titles_data.get("titles") or alt_titles_data.get("results", [])
        
        return {
            "alternative_titles": [
                {
                    "title": title.get("title"),
                    "iso_3166_1": title.get("iso_3166_1"),
                    "type": title.get("type"),
                }
                for title in titles_list
            ]
        }
    
    def _extract_credits(self, tmdb_data: dict[str, Any]) -> tuple[list[dict], list[dict]]:
        """Extract cast and crew from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            Tuple of (cast_list, crew_list) with all credit data
        """
        credits = tmdb_data.get("credits", {})
        
        cast = [
            {
                "tmdb_id": member.get("id"),
                "name": member.get("name"),
                "character": member.get("character"),
                "order": member.get("order"),
                "profile_path": f"https://image.tmdb.org/t/p/original{member.get('profile_path')}" if member.get("profile_path") else None,
            }
            for member in credits.get("cast", [])
        ]
        
        crew = [
            {
                "tmdb_id": member.get("id"),
                "name": member.get("name"),
                "job": member.get("job"),
                "department": member.get("department"),
                "profile_path": f"https://image.tmdb.org/t/p/original{member.get('profile_path')}" if member.get("profile_path") else None,
            }
            for member in credits.get("crew", [])
        ]
        
        return cast, crew
    
    def _extract_translations(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract translations from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with all translations
        """
        translations_data = tmdb_data.get("translations", {})
        translations = translations_data.get("translations", [])
        
        return {
            "translations": [
                {
                    "iso_3166_1": t.get("iso_3166_1"),
                    "iso_639_1": t.get("iso_639_1"),
                    "name": t.get("name"),
                    "english_name": t.get("english_name"),
                    "data": t.get("data", {}),
                }
                for t in translations
            ]
        }
    
    def _extract_recommendations(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract recommended content from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with recommendations
        """
        recommendations = tmdb_data.get("recommendations", {})
        results = recommendations.get("results", [])
        
        return {
            "recommendations": [
                {
                    "tmdb_id": r.get("id"),
                    "title": r.get("title") or r.get("name"),
                    "media_type": r.get("media_type"),
                }
                for r in results[:20]  # Limit to top 20
            ]
        }
    
    def _extract_similar(self, tmdb_data: dict[str, Any]) -> dict[str, Any]:
        """Extract similar content from append_to_response.
        
        Args:
            tmdb_data: Raw TMDB API response
            
        Returns:
            JSONB-ready dict with similar content
        """
        similar = tmdb_data.get("similar", {})
        results = similar.get("results", [])
        
        return {
            "similar": [
                {
                    "tmdb_id": s.get("id"),
                    "title": s.get("title") or s.get("name"),
                }
                for s in results[:20]  # Limit to top 20
            ]
        }
    
    async def enrich_content(
        self,
        tmdb_id: int,
        content_type: Literal["movie", "tv"],
        tmdb_client: Optional[TMDBClient] = None,
    ) -> Optional[dict[str, Any]]:
        """Enrich a single content item with ALL TMDB data.

        Args:
            tmdb_id: TMDB ID
            content_type: 'movie' or 'tv'
            tmdb_client: Optional shared TMDBClient. If None, creates a new one.

        Returns:
            Complete content dict ready for DB upsert, or None if failed
        """
        async def _fetch(tmdb: TMDBClient) -> Optional[dict[str, Any]]:
            if content_type == "movie":
                return await tmdb.get_movie_details(tmdb_id)
            else:
                return await tmdb.get_tv_details(tmdb_id)

        try:
            if tmdb_client is not None:
                # Use shared client — no context manager needed
                tmdb_data = await _fetch(tmdb_client)
            else:
                async with create_tmdb_client() as tmdb:
                    tmdb_data = await _fetch(tmdb)

            if not tmdb_data:
                logger.warning(f"No data returned for {content_type} {tmdb_id}")
                return None

            # Extract all fields
            content = self._extract_basic_fields(tmdb_data, content_type)

            # Genres as array
            content["genres"] = self._extract_genres(tmdb_data)

            # JSONB fields
            content["keywords"] = self._extract_keywords(tmdb_data)
            content["videos"] = self._extract_videos(tmdb_data)
            content["images"] = self._extract_images(tmdb_data)
            content["watch_providers"] = self._extract_watch_providers(tmdb_data)
            content["alternative_titles"] = self._extract_alternative_titles(tmdb_data)
            content["translations"] = self._extract_translations(tmdb_data)
            content["recommendations"] = self._extract_recommendations(tmdb_data)
            content["similar_content"] = self._extract_similar(tmdb_data)

            # External IDs
            external_ids = self._extract_external_ids(tmdb_data)
            content.update(external_ids)

            # Content rating
            content["content_rating"] = self._extract_content_ratings(tmdb_data, content_type)

            # Extract credits (for separate processing)
            cast, crew = self._extract_credits(tmdb_data)
            content["_cast"] = cast
            content["_crew"] = crew

            # Metadata
            content["enriched_at"] = datetime.utcnow().isoformat()
            content["overview_source"] = "tmdb"

            return content

        except Exception as e:
            logger.error(f"Error enriching {content_type} {tmdb_id}: {e}", exc_info=True)
            return None
    
    async def enrich_batch(
        self,
        items: list[tuple[int, Literal["movie", "tv"]]],
        max_concurrent: int = 20,
    ) -> list[dict[str, Any]]:
        """Enrich multiple content items concurrently.

        Uses a single shared TMDBClient with a semaphore to cap concurrency.
        TMDB rate limiter (50ms/req) is enforced inside the shared client.

        Args:
            items: List of (tmdb_id, content_type) tuples
            max_concurrent: Max simultaneous TMDB requests (default: 20)

        Returns:
            List of enriched content dicts (failures excluded)
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        enriched: list[Optional[dict[str, Any]]] = [None] * len(items)

        async with create_tmdb_client() as shared_tmdb:
            async def fetch_one(idx: int, tmdb_id: int, content_type: str) -> None:
                async with semaphore:
                    result = await self.enrich_content(
                        tmdb_id, content_type, tmdb_client=shared_tmdb
                    )
                    if result:
                        self.stats["success"] += 1
                    else:
                        self.stats["failed"] += 1
                    self.stats["processed"] += 1
                    enriched[idx] = result

            tasks = [
                fetch_one(i, tmdb_id, ct)
                for i, (tmdb_id, ct) in enumerate(items)
            ]
            await asyncio.gather(*tasks)

        # Filter out None (failed) results
        return [r for r in enriched if r is not None]


async def enrich_from_queue(
    batch_size: int = 100,
    content_type: Optional[Literal["movie", "tv"]] = None,
) -> dict[str, int]:
    """Process content from import queue and enrich.
    
    Args:
        batch_size: Number of items to process
        content_type: Filter by content type (optional)
        
    Returns:
        Statistics dict
    """
    # Get batch from queue
    queue_items = get_import_queue_batch(
        limit=batch_size,
        content_type=content_type,
    )
    
    if queue_items.empty:
        logger.info("No items in import queue")
        return {"processed": 0, "success": 0, "failed": 0}
    
    logger.info(f"Processing {len(queue_items)} items from import queue")
    
    # Prepare items for enrichment
    items = [
        (row["tmdb_id"], row["content_type"])
        for _, row in queue_items.iterrows()
    ]
    
    # Enrich
    enricher = ContentEnricher()
    enriched_df = await enricher.enrich_batch(items)
    
    if not enriched_df.empty:
        # Remove temporary credit fields before DB upsert
        if "_cast" in enriched_df.columns:
            enriched_df = enriched_df.drop(columns=["_cast", "_crew"])
        
        # Bulk upsert to DB
        upsert_content_bulk(enriched_df)
        
        # Mark queue items as completed
        queue_ids = queue_items["id"].tolist()
        mark_import_queue_completed(queue_ids)
    
    return enricher.stats

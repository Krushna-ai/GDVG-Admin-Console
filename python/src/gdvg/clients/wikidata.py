"""Wikidata API client (SPARQL + REST API) with batch query support."""

import asyncio
import logging
from typing import Optional, Any, Literal
from urllib.parse import quote

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from gdvg.config import WIKI_USER_AGENT, WIKIDATA_RATE_LIMIT_DELAY_MS

logger = logging.getLogger(__name__)


# Wikidata property IDs for content enrichment
WIKIDATA_PROPERTIES = {
    "P136": "genre",
    "P449": "original_network",
    "P58": "screenwriter",
    "P161": "cast_member",
    "P57": "director",
    "P170": "creator",
    "P495": "country_of_origin",
    "P577": "publication_date",
    "P840": "narrative_location",
    "P915": "filming_location",
    "P2047": "duration",
    "P3383": "film_poster",
    "P18": "image",
    "P345": "imdb_id",
    "P4947": "tmdb_id_movie",
    "P4983": "tmdb_id_tv",
}


class WikidataClient:
    """Wikidata API client supporting SPARQL and REST APIs.
    
    SPARQL for complex queries and batch lookups.
    REST API for single entity fetches (faster).
    """
    
    def __init__(self):
        self.sparql_endpoint = "https://query.wikidata.org/sparql"
        self.rest_base_url = "https://www.wikidata.org/wiki/Special:EntityData"
        self.headers = {
            "User-Agent": WIKI_USER_AGENT,
        }
        self.rate_delay_ms = WIKIDATA_RATE_LIMIT_DELAY_MS
        self.last_request_time: Optional[float] = None
        self._lock = asyncio.Lock()
        self._client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        self._client = httpx.AsyncClient(
            headers=self.headers,
            timeout=60.0,  # SPARQL can be slow
            follow_redirects=True,
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()
    
    async def _rate_limit(self) -> None:
        """Apply rate limiting (1 req/sec for SPARQL)."""
        async with self._lock:
            if self.last_request_time:
                import time
                elapsed_ms = (time.time() - self.last_request_time) * 1000
                wait_ms = max(0, self.rate_delay_ms - elapsed_ms)
                if wait_ms > 0:
                    await asyncio.sleep(wait_ms / 1000)
            
            import time
            self.last_request_time = time.time()
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _query_sparql(self, query: str) -> dict[str, Any]:
        """Execute SPARQL query.
        
        Args:
            query: SPARQL query string
            
        Returns:
            Query results as dict
        """
        if not self._client:
            raise RuntimeError("WikidataClient must be used as async context manager")
        
        await self._rate_limit()
        
        params = {
            "query": query,
            "format": "json",
        }
        
        try:
            response = await self._client.get(self.sparql_endpoint, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Wikidata SPARQL error: {e.response.status_code}")
            raise
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _get_entity_rest(
        self,
        entity_id: str,
        languages: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Get entity data via REST API (faster for single entities).
        
        Args:
            entity_id: Wikidata entity ID (e.g., 'Q42')
            languages: Languages to include (default: ['en'])
            
        Returns:
            Entity data
        """
        if not self._client:
            raise RuntimeError("WikidataClient must be used as async context manager")
        
        await self._rate_limit()
        
        if languages is None:
            languages = ["en"]
        
        url = f"{self.rest_base_url}/{entity_id}.json"
        
        try:
            response = await self._client.get(url)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.debug(f"Wikidata entity not found: {entity_id}")
                return {}
            logger.error(f"Wikidata REST API error: {e.response.status_code}")
            raise
    
    # ============================================
    # TMDB ID LOOKUPS
    # ============================================
    
    async def get_by_tmdb_id(
        self,
        tmdb_id: int,
        content_type: Literal["movie", "tv"],
    ) -> Optional[dict[str, Any]]:
        """Get Wikidata entity by TMDB ID.
        
        Args:
            tmdb_id: TMDB ID
            content_type: 'movie' or 'tv'
            
        Returns:
            Entity data with wikidata_id, wikipedia_title, properties
        """
        property_id = "P4947" if content_type == "movie" else "P4983"
        
        query = f"""
        SELECT ?item ?itemLabel ?article WHERE {{
          ?item wdt:{property_id} "{tmdb_id}".
          ?article schema:about ?item;
                   schema:isPartOf <https://en.wikipedia.org/>.
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        LIMIT 1
        """
        
        result = await self._query_sparql(query)
        bindings = result.get("results", {}).get("bindings", [])
        
        if not bindings:
            return None
        
        item = bindings[0]
        wikidata_id = item["item"]["value"].split("/")[-1]
        wikipedia_url = item.get("article", {}).get("value")
        
        # Extract Wikipedia title from URL
        wikipedia_title = None
        if wikipedia_url:
            wikipedia_title = wikipedia_url.split("/wiki/")[-1].replace("_", " ")
        
        return {
            "wikidata_id": wikidata_id,
            "wikipedia_title": wikipedia_title,
            "wikipedia_url": wikipedia_url,
            "label": item.get("itemLabel", {}).get("value"),
        }
    
    async def batch_lookup_tmdb_ids(
        self,
        tmdb_ids: list[int],
        content_type: Literal["movie", "tv"],
    ) -> dict[int, dict[str, Any]]:
        """Batch lookup Wikidata entities by TMDB IDs.
        
        This is a MAJOR upgrade from TS version - queries 50-100 IDs at once!
        
        Args:
            tmdb_ids: List of TMDB IDs
            content_type: 'movie' or 'tv'
            
        Returns:
            Dict mapping tmdb_id -> entity data
        """
        if not tmdb_ids:
            return {}
        
        property_id = "P4947" if content_type == "movie" else "P4983"
        
        # Build VALUES clause for batch query
        values_clause = " ".join([f'"{tid}"' for tid in tmdb_ids])
        
        query = f"""
        SELECT ?tmdbId ?item ?itemLabel ?article WHERE {{
          VALUES ?tmdbId {{ {values_clause} }}
          ?item wdt:{property_id} ?tmdbId.
          OPTIONAL {{
            ?article schema:about ?item;
                     schema:isPartOf <https://en.wikipedia.org/>.
          }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        """
        
        result = await self._query_sparql(query)
        bindings = result.get("results", {}).get("bindings", [])
        
        # Map results by TMDB ID
        lookup = {}
        for item in bindings:
            tmdb_id = int(item["tmdbId"]["value"])
            wikidata_id = item["item"]["value"].split("/")[-1]
            wikipedia_url = item.get("article", {}).get("value")
            
            wikipedia_title = None
            if wikipedia_url:
                wikipedia_title = wikipedia_url.split("/wiki/")[-1].replace("_", " ")
            
            lookup[tmdb_id] = {
                "wikidata_id": wikidata_id,
                "wikipedia_title": wikipedia_title,
                "wikipedia_url": wikipedia_url,
                "label": item.get("itemLabel", {}).get("value"),
            }
        
        return lookup
    
    # ============================================
    # ENTITY METADATA EXTRACTION
    # ============================================
    
    async def get_entity_metadata(
        self,
        wikidata_id: str,
        properties: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Get comprehensive entity metadata.
        
        Args:
            wikidata_id: Wikidata ID (e.g., 'Q42')
            properties: Property IDs to extract (default: all content properties)
            
        Returns:
            Dict with extracted property values
        """
        if properties is None:
            # Default: all content-relevant properties
            properties = [
                "P136",  # genre
                "P449",  # network
                "P58",   # screenwriter
                "P161",  # cast
                "P57",   # director
                "P170",  # creator
                "P495",  # country
                "P577",  # publication_date
                "P840",  # narrative_location
                "P915",  # filming_location
                "P2047", # duration
                "P3383", # poster
                "P18",   # image
                "P345",  # imdb_id
            ]
        
        # Build SPARQL query to extract all properties
        property_patterns = []
        for prop in properties:
            property_patterns.append(f"OPTIONAL {{ wd:{wikidata_id} wdt:{prop} ?{prop} . }}")
        
        optional_clauses = "\n  ".join(property_patterns)
        
        query = f"""
        SELECT * WHERE {{
          {optional_clauses}
        }}
        """
        
        result = await self._query_sparql(query)
        bindings = result.get("results", {}).get("bindings", [])
        
        if not bindings:
            return {}
        
        # Parse results
        metadata = {}
        for binding in bindings:
            for prop in properties:
                if prop in binding:
                    value = binding[prop]["value"]
                    prop_name = WIKIDATA_PROPERTIES.get(prop, prop)
                    
                    # Extract entity IDs from URIs
                    if value.startswith("http://www.wikidata.org/entity/"):
                        value = value.split("/")[-1]
                    
                    # Collect multiple values for properties that can have many
                    if prop_name not in metadata:
                        metadata[prop_name] = []
                    metadata[prop_name].append(value)
        
        # Simplify single-value properties
        for key, value in metadata.items():
            if len(value) == 1:
                metadata[key] = value[0]
        
        return metadata
    
    async def get_entity_labels(
        self,
        entity_ids: list[str],
        language: str = "en",
    ) -> dict[str, str]:
        """Get labels for entity IDs in batch.
        
        Args:
            entity_ids: List of Wikidata entity IDs
            language: Language code
            
        Returns:
            Dict mapping entity_id -> label
        """
        if not entity_ids:
            return {}
        
        values_clause = " ".join([f"wd:{eid}" for eid in entity_ids])
        
        query = f"""
        SELECT ?item ?itemLabel WHERE {{
          VALUES ?item {{ {values_clause} }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "{language}". }}
        }}
        """
        
        result = await self._query_sparql(query)
        bindings = result.get("results", {}).get("bindings", [])
        
        labels = {}
        for item in bindings:
            entity_id = item["item"]["value"].split("/")[-1]
            label = item.get("itemLabel", {}).get("value", entity_id)
            labels[entity_id] = label
        
        return labels
    
    # ============================================
    # CONVENIENCE METHODS
    # ============================================
    
    async def get_content_enrichment_data(
        self,
        tmdb_id: int,
        content_type: Literal["movie", "tv"],
    ) -> Optional[dict[str, Any]]:
        """Get comprehensive enrichment data for content.
        
        Combines lookup + metadata extraction + label resolution.
        
        Args:
            tmdb_id: TMDB ID
            content_type: 'movie' or 'tv'
            
        Returns:
            Dict with wikidata_id, wikipedia info, genres, networks, etc.
        """
        # Look up Wikidata entity
        entity = await self.get_by_tmdb_id(tmdb_id, content_type)
        if not entity:
            return None
        
        wikidata_id = entity["wikidata_id"]
        
        # Get metadata
        metadata = await self.get_entity_metadata(wikidata_id)
        
        # Resolve entity IDs to labels for genres, networks, etc.
        entity_ids_to_resolve = []
        for key in ["genre", "original_network", "country_of_origin"]:
            if key in metadata:
                values = metadata[key] if isinstance(metadata[key], list) else [metadata[key]]
                entity_ids_to_resolve.extend([v for v in values if v.startswith("Q")])
        
        labels = {}
        if entity_ids_to_resolve:
            labels = await self.get_entity_labels(entity_ids_to_resolve)
        
        # Replace entity IDs with labels
        for key in ["genre", "original_network", "country_of_origin"]:
            if key in metadata:
                values = metadata[key] if isinstance(metadata[key], list) else [metadata[key]]
                metadata[key] = [labels.get(v, v) for v in values]
        
        return {
            **entity,
            **metadata,
        }
    
    async def get_person_enrichment_data(
        self,
        wikidata_id: str,
    ) -> dict[str, Any]:
        """Get enrichment data for a person.
        
        Args:
            wikidata_id: Wikidata person ID
            
        Returns:
            Dict with person metadata
        """
        # Person-specific properties
        properties = [
            "P569",  # date_of_birth
            "P570",  # date_of_death
            "P19",   # place_of_birth
            "P106",  # occupation
            "P735",  # given_name
            "P734",  # family_name
            "P18",   # image
            "P345",  # imdb_id
        ]
        
        metadata = await self.get_entity_metadata(wikidata_id, properties)
        
        return metadata


def create_wikidata_client() -> WikidataClient:
    """Create a new Wikidata client instance.
    
    Usage:
        async with create_wikidata_client() as wikidata:
            data = await wikidata.get_by_tmdb_id(550, "movie")
    """
    return WikidataClient()

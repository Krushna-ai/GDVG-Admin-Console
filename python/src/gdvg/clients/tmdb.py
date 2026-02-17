"""Async TMDB API client with rate limiting and retry logic."""

import asyncio
import logging
from typing import Optional, Any, Literal
from datetime import datetime, timedelta

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from gdvg.config import (
    TMDB_BASE_URL,
    TMDB_ACCESS_TOKEN,
    TMDB_RATE_LIMIT_DELAY_MS,
    TMDB_MAX_RETRIES,
    TMDB_RETRY_BACKOFF_FACTOR,
    TMDB_CONTENT_APPEND,
    TMDB_PERSON_APPEND,
)

logger = logging.getLogger(__name__)


class TMDBRateLimiter:
    """Adaptive rate limiter that respects TMDB's 429 responses."""
    
    def __init__(self, base_delay_ms: int = TMDB_RATE_LIMIT_DELAY_MS):
        self.base_delay_ms = base_delay_ms
        self.current_delay_ms = base_delay_ms
        self.last_request_time: Optional[datetime] = None
        self._lock = asyncio.Lock()
    
    async def acquire(self) -> None:
        """Wait for rate limit before making request."""
        async with self._lock:
            if self.last_request_time:
                elapsed = (datetime.now() - self.last_request_time).total_seconds() * 1000
                wait_time = max(0, self.current_delay_ms - elapsed)
                if wait_time > 0:
                    await asyncio.sleep(wait_time / 1000)
            
            self.last_request_time = datetime.now()
    
    def increase_delay(self) -> None:
        """Increase delay after 429 response."""
        self.current_delay_ms = min(self.current_delay_ms * 2, 5000)
        logger.warning(f"Rate limit hit, increasing delay to {self.current_delay_ms}ms")
    
    def reset_delay(self) -> None:
        """Reset delay to base value after successful requests."""
        if self.current_delay_ms > self.base_delay_ms:
            self.current_delay_ms = max(
                self.current_delay_ms * 0.9,
                self.base_delay_ms
            )


class TMDBClient:
    """Async TMDB API client with comprehensive endpoint coverage."""
    
    def __init__(self):
        self.base_url = TMDB_BASE_URL
        self.headers = {
            "Authorization": f"Bearer {TMDB_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        }
        self.rate_limiter = TMDBRateLimiter()
        self._client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        self._client = httpx.AsyncClient(
            headers=self.headers,
            timeout=30.0,
            follow_redirects=True,
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()
    
    @retry(
        stop=stop_after_attempt(TMDB_MAX_RETRIES),
        wait=wait_exponential(multiplier=TMDB_RETRY_BACKOFF_FACTOR, min=1, max=30),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Make rate-limited request to TMDB API with retry logic.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (e.g., '/movie/550')
            params: Query parameters
            
        Returns:
            JSON response as dict
            
        Raises:
            httpx.HTTPStatusError: For non-2xx responses
        """
        if not self._client:
            raise RuntimeError("TMDBClient must be used as async context manager")
        
        await self.rate_limiter.acquire()
        
        url = f"{self.base_url}{endpoint}"
        
        try:
            response = await self._client.request(method, url, params=params)
            
            # Handle rate limiting
            if response.status_code == 429:
                self.rate_limiter.increase_delay()
                raise httpx.HTTPStatusError(
                    "Rate limit exceeded",
                    request=response.request,
                    response=response,
                )
            
            response.raise_for_status()
            self.rate_limiter.reset_delay()
            
            return response.json()
            
        except httpx.HTTPStatusError as e:
            logger.error(f"TMDB API error: {e.response.status_code} - {endpoint}")
            raise
        except Exception as e:
            logger.error(f"TMDB request failed: {e} - {endpoint}")
            raise
    
    # ============================================
    # DISCOVER ENDPOINTS
    # ============================================
    
    async def discover_tv(
        self,
        page: int = 1,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Discover TV shows with filters.
        
        Args:
            page: Page number (1-based)
            **kwargs: Additional filters (with_origin_country, sort_by, etc.)
            
        Returns:
            Discovery results with 'results' array and 'total_pages'
        """
        params = {"page": page, **kwargs}
        return await self._request("GET", "/discover/tv", params=params)
    
    async def discover_movies(
        self,
        page: int = 1,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Discover movies with filters.
        
        Args:
            page: Page number (1-based)
            **kwargs: Additional filters (with_origin_country, sort_by, etc.)
            
        Returns:
            Discovery results with 'results' array and 'total_pages'
        """
        params = {"page": page, **kwargs}
        return await self._request("GET", "/discover/movie", params=params)
    
    # ============================================
    # DETAIL ENDPOINTS (with append_to_response)
    # ============================================
    
    async def get_movie_details(self, movie_id: int) -> dict[str, Any]:
        """Get comprehensive movie details.
        
        Includes: credits, keywords, videos, images, watch/providers,
        external_ids, content_ratings, alternative_titles, translations,
        reviews, recommendations, similar.
        
        Args:
            movie_id: TMDB movie ID
            
        Returns:
            Complete movie data
        """
        params = {"append_to_response": TMDB_CONTENT_APPEND}
        return await self._request("GET", f"/movie/{movie_id}", params=params)
    
    async def get_tv_details(self, tv_id: int) -> dict[str, Any]:
        """Get comprehensive TV show details.
        
        Includes: credits, keywords, videos, images, watch/providers,
        external_ids, content_ratings, alternative_titles, translations,
        reviews, recommendations, similar.
        
        Args:
            tv_id: TMDB TV show ID
            
        Returns:
            Complete TV show data
        """
        params = {"append_to_response": TMDB_CONTENT_APPEND}
        return await self._request("GET", f"/tv/{tv_id}", params=params)
    
    async def get_person_details(self, person_id: int) -> dict[str, Any]:
        """Get comprehensive person details.
        
        Includes: combined_credits, images, external_ids, tagged_images.
        
        Args:
            person_id: TMDB person ID
            
        Returns:
            Complete person data with filmography
        """
        params = {"append_to_response": TMDB_PERSON_APPEND}
        return await self._request("GET", f"/person/{person_id}", params=params)
    
    # ============================================
    # CHANGES ENDPOINTS (for sync)
    # ============================================
    
    async def get_movie_changes(
        self,
        page: int = 1,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get recently changed movie IDs.
        
        Args:
            page: Page number
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            
        Returns:
            Changed movie IDs
        """
        params = {"page": page}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        
        return await self._request("GET", "/movie/changes", params=params)
    
    async def get_tv_changes(
        self,
        page: int = 1,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get recently changed TV show IDs.
        
        Args:
            page: Page number
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            
        Returns:
            Changed TV show IDs
        """
        params = {"page": page}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        
        return await self._request("GET", "/tv/changes", params=params)
    
    async def get_person_changes(
        self,
        page: int = 1,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get recently changed person IDs.
        
        Args:
            page: Page number
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            
        Returns:
            Changed person IDs
        """
        params = {"page": page}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        
        return await self._request("GET", "/person/changes", params=params)
    
    # ============================================
    # LATEST ID ENDPOINTS (for sequential scan)
    # ============================================
    
    async def get_latest_movie(self) -> dict[str, Any]:
        """Get latest movie added to TMDB.
        
        Returns:
            Latest movie data (use 'id' field for max ID)
        """
        return await self._request("GET", "/movie/latest")
    
    async def get_latest_tv(self) -> dict[str, Any]:
        """Get latest TV show added to TMDB.
        
        Returns:
            Latest TV show data (use 'id' field for max ID)
        """
        return await self._request("GET", "/tv/latest")
    
    # ============================================
    # BATCH OPERATIONS (for efficient processing)
    # ============================================
    
    async def get_content_details_batch(
        self,
        content_items: list[tuple[int, Literal["movie", "tv"]]],
        max_concurrent: int = 5,
    ) -> list[dict[str, Any]]:
        """Fetch multiple content details concurrently.
        
        Args:
            content_items: List of (tmdb_id, content_type) tuples
            max_concurrent: Max concurrent requests (default: 5)
            
        Returns:
            List of content detail dicts (same order as input)
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def fetch_one(tmdb_id: int, content_type: str) -> dict[str, Any]:
            async with semaphore:
                if content_type == "movie":
                    return await self.get_movie_details(tmdb_id)
                else:
                    return await self.get_tv_details(tmdb_id)
        
        tasks = [
            fetch_one(tmdb_id, content_type)
            for tmdb_id, content_type in content_items
        ]
        
        return await asyncio.gather(*tasks, return_exceptions=False)
    
    async def get_people_details_batch(
        self,
        person_ids: list[int],
        max_concurrent: int = 5,
    ) -> list[dict[str, Any]]:
        """Fetch multiple people details concurrently.
        
        Args:
            person_ids: List of TMDB person IDs
            max_concurrent: Max concurrent requests (default: 5)
            
        Returns:
            List of person detail dicts (same order as input)
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def fetch_one(person_id: int) -> dict[str, Any]:
            async with semaphore:
                return await self.get_person_details(person_id)
        
        tasks = [fetch_one(person_id) for person_id in person_ids]
        
        return await asyncio.gather(*tasks, return_exceptions=False)


# Convenience function for non-async code
def create_tmdb_client() -> TMDBClient:
    """Create a new TMDB client instance.
    
    Usage:
        async with create_tmdb_client() as tmdb:
            details = await tmdb.get_movie_details(550)
    """
    return TMDBClient()

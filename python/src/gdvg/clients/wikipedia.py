"""Wikipedia API client (REST + Action API) with multi-language support."""

import asyncio
import logging
from typing import Optional, Any
from urllib.parse import quote

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from gdvg.config import WIKI_USER_AGENT, WIKIPEDIA_RATE_LIMIT_DELAY_MS

logger = logging.getLogger(__name__)


class WikipediaClient:
    """Wikipedia API client supporting REST and Action APIs.
    
    Uses REST API for summaries (fast, modern).
    Uses Action API for categories, images, full content.
    Supports multi-language fallback for non-English content.
    """
    
    def __init__(self):
        self.rest_base_url = "https://{lang}.wikipedia.org/api/rest_v1"
        self.action_base_url = "https://{lang}.wikipedia.org/w/api.php"
        self.headers = {
            "User-Agent": WIKI_USER_AGENT,
        }
        self.rate_delay_ms = WIKIPEDIA_RATE_LIMIT_DELAY_MS
        self.last_request_time: Optional[float] = None
        self._lock = asyncio.Lock()
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
    
    async def _rate_limit(self) -> None:
        """Apply rate limiting between requests."""
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
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _request_rest(
        self,
        endpoint: str,
        language: str = "en",
    ) -> dict[str, Any]:
        """Make request to Wikipedia REST API.
        
        Args:
            endpoint: API endpoint (e.g., '/page/summary/Python_(programming_language)')
            language: Language code (en, ko, ja, zh, etc.)
            
        Returns:
            JSON response
        """
        if not self._client:
            raise RuntimeError("WikipediaClient must be used as async context manager")
        
        await self._rate_limit()
        
        base_url = self.rest_base_url.format(lang=language)
        url = f"{base_url}{endpoint}"
        
        try:
            response = await self._client.get(url)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.debug(f"Wikipedia page not found: {endpoint} (lang: {language})")
                return {}
            logger.error(f"Wikipedia REST API error: {e.response.status_code} - {endpoint}")
            raise
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _request_action(
        self,
        params: dict[str, Any],
        language: str = "en",
    ) -> dict[str, Any]:
        """Make request to Wikipedia Action API.
        
        Args:
            params: Query parameters
            language: Language code
            
        Returns:
            JSON response
        """
        if not self._client:
            raise RuntimeError("WikipediaClient must be used as async context manager")
        
        await self._rate_limit()
        
        base_url = self.action_base_url.format(lang=language)
        
        # Add required parameters
        params = {
            "format": "json",
            "formatversion": "2",
            **params,
        }
        
        try:
            response = await self._client.get(base_url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Wikipedia Action API error: {e.response.status_code}")
            raise
    
    # ============================================
    # REST API METHODS
    # ============================================
    
    async def get_page_summary(
        self,
        title: str,
        language: str = "en",
    ) -> Optional[dict[str, Any]]:
        """Get Wikipedia page summary (REST API).
        
        Args:
            title: Page title (spaces and special chars allowed)
            language: Language code
            
        Returns:
            Summary dict with 'extract', 'extract_html', 'thumbnail', etc.
            None if page not found.
        """
        # URL encode the title
        encoded_title = quote(title.replace(" ", "_"), safe="")
        endpoint = f"/page/summary/{encoded_title}"
        
        result = await self._request_rest(endpoint, language)
        
        if not result or result.get("type") == "https://mediawiki.org/wiki/HyperSwitch/errors/not_found":
            return None
        
        return result
    
    async def get_page_summary_multilang(
        self,
        title: str,
        languages: Optional[list[str]] = None,
    ) -> Optional[dict[str, Any]]:
        """Get page summary with multi-language fallback.
        
        Tries languages in order until one succeeds.
        
        Args:
            title: Page title
            languages: Language codes to try (default: ['en', 'ko', 'ja', 'zh'])
            
        Returns:
            Summary dict with added 'language' field, or None
        """
        if languages is None:
            languages = ["en", "ko", "ja", "zh"]
        
        for lang in languages:
            result = await self.get_page_summary(title, lang)
            if result:
                result["language"] = lang
                return result
        
        return None
    
    # ============================================
    # ACTION API METHODS
    # ============================================
    
    async def get_page_content(
        self,
        title: str,
        language: str = "en",
    ) -> Optional[dict[str, Any]]:
        """Get full Wikipedia page content (Action API).
        
        Args:
            title: Page title
            language: Language code
            
        Returns:
            Page data with 'extract' (plain text) and 'revisions' (wikitext)
        """
        params = {
            "action": "query",
            "prop": "extracts",
            # NOTE: Do NOT include exintro — omitting it returns the full article.
            # Setting exintro=False sends "False" which Wikipedia treats as truthy (intro only).
            "explaintext": True,  # Plain text with == Section == headers, not HTML
            "titles": title,
        }
        
        result = await self._request_action(params, language)
        
        pages = result.get("query", {}).get("pages", [])
        if not pages or pages[0].get("missing"):
            return None
        
        return pages[0]
    
    async def get_page_categories(
        self,
        title: str,
        language: str = "en",
        limit: int = 100,
    ) -> list[str]:
        """Get page categories (Action API).
        
        Args:
            title: Page title
            language: Language code
            limit: Max categories to return
            
        Returns:
            List of category titles
        """
        params = {
            "action": "query",
            "prop": "categories",
            "titles": title,
            "cllimit": min(limit, 500),  # API max is 500
        }
        
        result = await self._request_action(params, language)
        
        pages = result.get("query", {}).get("pages", [])
        if not pages or pages[0].get("missing"):
            return []
        
        categories = pages[0].get("categories", [])
        return [cat["title"] for cat in categories]
    
    async def get_page_images(
        self,
        title: str,
        language: str = "en",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get page images (Action API).
        
        Args:
            title: Page title
            language: Language code
            limit: Max images to return
            
        Returns:
            List of image dicts with 'title' and 'url'
        """
        params = {
            "action": "query",
            "prop": "images",
            "titles": title,
            "imlimit": min(limit, 500),
        }
        
        result = await self._request_action(params, language)
        
        pages = result.get("query", {}).get("pages", [])
        if not pages or pages[0].get("missing"):
            return []
        
        images = pages[0].get("images", [])
        
        # Get image URLs
        image_data = []
        for img in images:
            img_title = img["title"]
            # Get image info to get URL
            info_params = {
                "action": "query",
                "prop": "imageinfo",
                "titles": img_title,
                "iiprop": "url|size",
            }
            info_result = await self._request_action(info_params, language)
            info_pages = info_result.get("query", {}).get("pages", [])
            if info_pages and "imageinfo" in info_pages[0]:
                imageinfo = info_pages[0]["imageinfo"][0]
                image_data.append({
                    "title": img_title,
                    "url": imageinfo.get("url"),
                    "width": imageinfo.get("width"),
                    "height": imageinfo.get("height"),
                })
        
        return image_data
    
    async def search_pages(
        self,
        query: str,
        language: str = "en",
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search for Wikipedia pages (Action API).
        
        Useful for fuzzy matching when exact title lookup fails.
        
        Args:
            query: Search query
            language: Language code
            limit: Max results to return
            
        Returns:
            List of search results with 'title', 'snippet', 'pageid'
        """
        params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": min(limit, 50),
        }
        
        result = await self._request_action(params, language)
        
        search_results = result.get("query", {}).get("search", [])
        return search_results
    
    # ============================================
    # CONVENIENCE METHODS
    # ============================================
    
    async def get_content_overview(
        self,
        title: str,
        tmdb_title: Optional[str] = None,
        languages: Optional[list[str]] = None,
    ) -> Optional[dict[str, Any]]:
        """Get content overview for movies/TV shows.
        
        Tries exact title match, then search if not found.
        
        Args:
            title: Primary title to search
            tmdb_title: Alternative TMDB title
            languages: Languages to try
            
        Returns:
            Dict with 'extract', 'url', 'language', 'source'
        """
        if languages is None:
            languages = ["en", "ko", "ja", "zh"]
        
        # Try exact match on primary title
        result = await self.get_page_summary_multilang(title, languages)
        if result:
            return {
                "extract": result.get("extract"),
                "url": result.get("content_urls", {}).get("desktop", {}).get("page"),
                "language": result.get("language"),
                "source": "exact_match",
            }
        
        # Try TMDB title if different
        if tmdb_title and tmdb_title != title:
            result = await self.get_page_summary_multilang(tmdb_title, languages)
            if result:
                return {
                    "extract": result.get("extract"),
                    "url": result.get("content_urls", {}).get("desktop", {}).get("page"),
                    "language": result.get("language"),
                    "source": "tmdb_title",
                }
        
        # Try search as last resort
        for lang in languages:
            search_results = await self.search_pages(title, lang, limit=5)
            if search_results:
                # Get summary of first result
                first_result_title = search_results[0]["title"]
                summary = await self.get_page_summary(first_result_title, lang)
                if summary:
                    return {
                        "extract": summary.get("extract"),
                        "url": summary.get("content_urls", {}).get("desktop", {}).get("page"),
                        "language": lang,
                        "source": "search",
                    }
        
        return None
    
    async def get_person_bio(
        self,
        name: str,
        name_variants: Optional[list[str]] = None,
        languages: Optional[list[str]] = None,
    ) -> Optional[dict[str, Any]]:
        """Get person biography with name variant matching.
        
        Args:
            name: Primary name
            name_variants: Alternative name spellings/romanizations
            languages: Languages to try
            
        Returns:
            Dict with 'extract', 'url', 'language', 'matched_name'
        """
        if languages is None:
            languages = ["en", "ko", "ja", "zh"]
        
        if name_variants is None:
            name_variants = []
        
        all_names = [name] + name_variants
        
        for trial_name in all_names:
            result = await self.get_page_summary_multilang(trial_name, languages)
            if result:
                return {
                    "extract": result.get("extract"),
                    "url": result.get("content_urls", {}).get("desktop", {}).get("page"),
                    "language": result.get("language"),
                    "matched_name": trial_name,
                }
        
        return None


def create_wikipedia_client() -> WikipediaClient:
    """Create a new Wikipedia client instance.
    
    Usage:
        async with create_wikipedia_client() as wiki:
            summary = await wiki.get_page_summary("Python (programming language)")
    """
    return WikipediaClient()

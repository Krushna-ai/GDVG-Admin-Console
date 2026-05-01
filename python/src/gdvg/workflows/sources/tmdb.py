import os
import httpx
from typing import Dict, Any, Optional

TMDB_BASE_URL = 'https://api.themoviedb.org/3'

async def tmdb_fetch(endpoint: string, params: Optional[Dict[str, str]] = None) -> Any:
    """Make requests to the TMDB API."""
    token = os.environ.get('TMDB_ACCESS_TOKEN')
    if not token:
        raise ValueError('Missing TMDB_ACCESS_TOKEN environment variable')
    
    url = f"{TMDB_BASE_URL}{endpoint}"
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()

async def get_movie_details(tmdb_id: int) -> Any:
    """Fetch comprehensive movie details including credits and keywords."""
    return await tmdb_fetch(
        f'/movie/{tmdb_id}',
        params={'append_to_response': 'credits,keywords,videos,images,watch/providers,external_ids,release_dates,content_ratings,alternative_titles,translations,recommendations,similar,reviews'}
    )

async def get_tv_details(tmdb_id: int) -> Any:
    """Fetch comprehensive TV show details including credits and keywords."""
    return await tmdb_fetch(
        f'/tv/{tmdb_id}',
        params={'append_to_response': 'credits,aggregate_credits,keywords,videos,images,watch/providers,external_ids,content_ratings,alternative_titles,translations,recommendations,similar,reviews'}
    )

async def fetch_content_details(tmdb_id: int, content_type: str) -> Optional[Any]:
    """Helper to fetch either movie or TV details based on content_type."""
    try:
        if content_type == 'movie':
            return await get_movie_details(tmdb_id)
        elif content_type == 'tv':
            return await get_tv_details(tmdb_id)
        else:
            raise ValueError(f"Unknown content_type: {content_type}")
    except Exception as e:
        print(f"Error fetching {content_type} {tmdb_id}: {e}")
        return None

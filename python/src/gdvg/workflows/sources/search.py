import httpx
from typing import Dict, Any, List

SEARXNG_URL = "http://127.0.0.1:8888"

async def search(query: str, num_results: int = 3) -> List[Dict[str, str]]:
    """
    Search the web using local SearXNG instance.
    Returns a list of dictionaries with 'title', 'url', and 'content'.
    """
    params = {
        'q': query,
        'format': 'json',
        'engines': 'google,duckduckgo',
        'language': 'en'
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                SEARXNG_URL,
                params=params,
                timeout=15.0
            )
            response.raise_for_status()
            data = response.json()
            
            results = []
            for item in data.get('results', [])[:num_results]:
                results.append({
                    'title': item.get('title', ''),
                    'url': item.get('url', ''),
                    'content': item.get('content', '')
                })
                
            return results
    except Exception as e:
        print(f"SearXNG search error for '{query}': {e}")
        return []

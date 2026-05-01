import httpx
import asyncio
from typing import Dict, Any, List, Optional
import urllib.parse
from gdvg.config import get_env

WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
WIKIDATA_REST_BASE_URL = 'https://www.wikidata.org/w/rest.php/wikibase/v0'
USER_AGENT = 'GDVG-Admin/1.0 (github.com/Krushna-ai/GDVG-Admin-Console)'

async def delay(ms: int):
    """Rate limiting delay."""
    await asyncio.sleep(ms / 1000.0)

async def execute_sparql_query(query: str) -> Dict[str, Any]:
    """Execute a SPARQL query against Wikidata."""
    await delay(1000) # 1 request/second recommended rate limit
    
    headers = {
        'Accept': 'application/sparql-results+json',
        'User-Agent': USER_AGENT
    }
    
    # Send as form-urlencoded which is standard for SPARQL endpoints
    data = {'query': query}
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            WIKIDATA_SPARQL_ENDPOINT, 
            data=data, 
            headers=headers,
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()

def extract_value(binding: Optional[Dict[str, Any]]) -> Optional[str]:
    """Extract value from Wikidata binding."""
    if not binding or 'value' not in binding:
        return None
    return binding['value']

def extract_entity_id(uri: str) -> str:
    """Extract label from Wikidata entity URI."""
    if not uri:
        return ""
    parts = uri.split('/')
    return parts[-1] if parts else ""

def _build_tmdb_query(property_id: str, value: str) -> str:
    """Helper to build SPARQL query for TMDB ID lookup."""
    return f"""
    SELECT ?item ?itemLabel ?wikipediaUrl ?originalNetworkLabel ?screenwritersLabel 
           ?genresLabel ?inception ?end_time ?platformsLabel ?awardsLabel ?mcId ?mdlId
           ?productionCompaniesLabel ?countryLabel ?languageLabel ?duration ?filmingStart 
           ?filmingEnd ?aspectRatio ?distributorsLabel
    WHERE {{
      ?item wdt:{property_id} "{value}".
      
      OPTIONAL {{
        ?article schema:about ?item;
                 schema:isPartOf <https://en.wikipedia.org/>.
        BIND(str(?article) AS ?wikipediaUrl)
      }}
      
      OPTIONAL {{ ?item wdt:P449 ?originalNetwork. }}
      OPTIONAL {{ ?item wdt:P58 ?screenwriters. }}
      OPTIONAL {{ ?item wdt:P136 ?genres. }}
      OPTIONAL {{ ?item wdt:P580 ?inception. }}
      OPTIONAL {{ ?item wdt:P582 ?end_time. }}
      OPTIONAL {{ ?item wdt:P750 ?platforms. }}
      OPTIONAL {{ ?item wdt:P166 ?awards. }}
      OPTIONAL {{ ?item wdt:P1712 ?mcId. }}
      OPTIONAL {{ ?item wdt:P11460 ?mdlId. }}
      OPTIONAL {{ ?item wdt:P272 ?productionCompanies. }}
      OPTIONAL {{ ?item wdt:P495 ?country. }}
      OPTIONAL {{ ?item wdt:P364 ?language. }}
      OPTIONAL {{ ?item wdt:P2047 ?duration. }}
      OPTIONAL {{ ?item wdt:P9367 ?filmingStart. }}
      OPTIONAL {{ ?item wdt:P9368 ?filmingEnd. }}
      OPTIONAL {{ ?item wdt:P2061 ?aspectRatio. }}
      OPTIONAL {{ ?item wdt:P750 ?distributors. }}
      
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    """

async def get_wikidata_by_tmdb_id(tmdb_id: int, content_type: str, imdb_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get Wikidata information by TMDB ID."""
    
    # Try TMDB ID first
    # P4947 = TMDB movie ID, P4983 = TMDB TV series ID
    tmdb_prop = 'P4947' if content_type == 'movie' else 'P4983'
    query = _build_tmdb_query(tmdb_prop, str(tmdb_id))
    
    try:
        data = await execute_sparql_query(query)
        bindings = data.get('results', {}).get('bindings', [])
        
        # If no results and we have imdb_id, fallback to IMDb
        if not bindings and imdb_id:
            query = _build_tmdb_query('P345', imdb_id)
            data = await execute_sparql_query(query)
            bindings = data.get('results', {}).get('bindings', [])
            
        if not bindings:
            return None
            
        # Helper to extract unique values for list fields
        def get_all_values(key: str) -> List[str]:
            values = set()
            for b in bindings:
                val = extract_value(b.get(key))
                if val and not val.startswith('http'): # Skip un-resolved URIs
                    values.add(val)
            return list(values)
            
        def get_value(key: str) -> Optional[str]:
            for b in bindings:
                val = extract_value(b.get(key))
                if val: return val
            return None

        first = bindings[0]
        item_uri = extract_value(first.get('item'))
        wikidata_id = extract_entity_id(item_uri) if item_uri else None
        
        wiki_url = get_value('wikipediaUrl')
        wiki_title = urllib.parse.unquote(wiki_url.split('/')[-1]).replace('_', ' ') if wiki_url else None
        
        return {
            'wikidata_id': wikidata_id,
            'wikipedia_title': wiki_title,
            'wikipedia_url': wiki_url,
            'original_network': get_value('originalNetworkLabel'),
            'screenwriters': get_all_values('screenwritersLabel'),
            'genres': get_all_values('genresLabel'),
            'inception': get_value('inception'),
            'end_time': get_value('end_time'),
            'platforms': get_all_values('platformsLabel'),
            'awards': get_all_values('awardsLabel'),
            'mc_id': get_value('mcId'),
            'mdl_id': get_value('mdlId'),
            'production_companies': get_all_values('productionCompaniesLabel'),
            'country_of_origin': get_all_values('countryLabel'),
            'original_language': get_all_values('languageLabel'),
            'duration': get_value('duration'),
            'filming_start': get_value('filmingStart'),
            'filming_end': get_value('filmingEnd'),
            'aspect_ratio': get_value('aspectRatio'),
            'distributors': get_all_values('distributorsLabel')
        }
        
    except Exception as e:
        print(f"Error querying Wikidata for TMDB {tmdb_id}: {e}")
        return None

async def get_entity_by_id_rest(wikidata_id: str, languages: List[str] = None) -> Optional[Dict[str, Any]]:
    """Fetch entity directly from Wikidata REST API."""
    if not languages:
        languages = ['en']
        
    await delay(100) # REST API allows slightly faster requests
    
    url = f"{WIKIDATA_REST_BASE_URL}/entities/items/{wikidata_id}"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                url, 
                headers={'User-Agent': USER_AGENT},
                timeout=10.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Wikidata REST error for {wikidata_id}: {e}")
            return None

def extract_wikipedia_title_from_entity(entity: Dict[str, Any], language: str = 'en') -> Optional[str]:
    """Extract Wikipedia title from Wikidata entity."""
    site_id = f"{language}wiki"
    sitelinks = entity.get('sitelinks', {})
    
    if site_id in sitelinks:
        return sitelinks[site_id].get('title')
    return None

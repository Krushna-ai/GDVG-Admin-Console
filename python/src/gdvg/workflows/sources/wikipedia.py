import httpx
import asyncio
import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

USER_AGENT = 'GDVG-Admin/1.0 (github.com/Krushna-ai/GDVG-Admin-Console)'
RATE_LIMIT_DELAY_MS = 100

@dataclass
class WikiArticleData:
    wiki_plot: Optional[str] = None
    wiki_production: Optional[str] = None
    wiki_cast_notes: Optional[str] = None
    wiki_accolades: Optional[str] = None
    wiki_reception: Optional[str] = None
    wiki_soundtrack: Optional[str] = None
    wiki_release: Optional[str] = None
    wiki_episode_guide: Optional[str] = None

SECTION_MAP = [
    {'keywords': ['plot', 'synopsis', 'story', 'storyline', 'narrative'], 'column': 'wiki_plot'},
    {'keywords': ['production', 'development', 'creation'], 'column': 'wiki_production'},
    {'keywords': ['cast', 'characters', 'casting'], 'column': 'wiki_cast_notes'},
    {'keywords': ['accolades', 'awards', 'recognition', 'honors'], 'column': 'wiki_accolades'},
    {'keywords': ['reception', 'critical', 'reviews', 'response'], 'column': 'wiki_reception'},
    {'keywords': ['soundtrack', 'music', 'ost', 'score'], 'column': 'wiki_soundtrack'},
    {'keywords': ['release', 'broadcast', 'distribution', 'premiere'], 'column': 'wiki_release'},
    {'keywords': ['episode', 'episodes', 'episode guide', 'series overview'], 'column': 'wiki_episode_guide'},
]

async def delay(ms: int):
    """Rate limiting delay."""
    await asyncio.sleep(ms / 1000.0)

def encode_title(title: str) -> str:
    """URL-encode a title for Wikipedia API."""
    # Replace spaces with underscores and URI encode
    encoded = urllib.parse.quote(title.replace(' ', '_'))
    # Wikipedia API expects ? to be %3F
    return encoded.replace('?', '%3F')

async def fetch_wikipedia_summary(title: str, language: str = 'en') -> Optional[Dict[str, Any]]:
    """Fetch Wikipedia page summary via REST API."""
    await delay(RATE_LIMIT_DELAY_MS)
    
    encoded_title = encode_title(title)
    url = f"https://{language}.wikipedia.org/api/rest_v1/page/summary/{encoded_title}"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                url, 
                headers={'User-Agent': USER_AGENT},
                timeout=10.0
            )
            
            # Follow redirects (Wikipedia uses standard HTTP redirects for some pages)
            if response.status_code in [301, 302] and 'Location' in response.headers:
                response = await client.get(
                    response.headers['Location'],
                    headers={'User-Agent': USER_AGENT},
                    timeout=10.0
                )
                
            if response.status_code == 404:
                return None
                
            response.raise_for_status()
            data = response.json()
            
            # Skip disambiguation pages
            if data.get('type') == 'disambiguation':
                return None
                
            return data
            
        except httpx.HTTPError:
            return None

async def get_content_summary(title: str, language: str = 'en') -> Optional[Dict[str, Any]]:
    """Get Wikipedia summary for content (movie/TV show)."""
    return await fetch_wikipedia_summary(title, language)

# ============================================
# MEDIAWIKI ACTION API & PARSING
# ============================================

async def get_article_sections(title: str, language: str = 'en') -> List[Dict[str, str]]:
    """Get the table of contents / sections of a Wikipedia article."""
    await delay(100)
    url = f"https://{language}.wikipedia.org/w/api.php"
    params = {
        'action': 'parse',
        'page': title,
        'prop': 'sections',
        'format': 'json',
        'origin': '*'
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params, headers={'User-Agent': USER_AGENT})
            if not response.is_success:
                return []
                
            data = response.json()
            if 'error' in data or 'parse' not in data or 'sections' not in data['parse']:
                return []
                
            return [
                {'index': sec['index'], 'line': sec['line'], 'anchor': sec['anchor']}
                for sec in data['parse']['sections']
            ]
        except:
            return []

def strip_html(html: str) -> str:
    """Clean Wikipedia HTML response into plain text."""
    # Remove HTML tags
    text = re.sub(r'<[^>]*>?', '', html)
    # Remove [edit], [1], [2] citation markers
    text = text.replace('[edit]', '')
    text = re.sub(r'\[\d+\]', '', text)
    # Collapse multiple whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Cap at 8000 chars
    if len(text) > 8000:
        text = text[:8000] + '...'
        
    return text

async def fetch_section(title: str, section_index: str, language: str = 'en') -> Optional[str]:
    """Fetch a specific section's HTML content and clean it."""
    await delay(200)
    url = f"https://{language}.wikipedia.org/w/api.php"
    params = {
        'action': 'parse',
        'page': title,
        'section': section_index,
        'prop': 'text',
        'format': 'json',
        'origin': '*'
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params, headers={'User-Agent': USER_AGENT})
            if not response.is_success:
                return None
                
            data = response.json()
            if 'error' in data or 'parse' not in data or 'text' not in data['parse']:
                return None
                
            html = data['parse']['text'].get('*')
            if not html:
                return None
                
            return strip_html(html)
        except:
            return None

async def parse_article_for_content(title: str, language: str = 'en') -> WikiArticleData:
    """Download and parse a whole Wikipedia article into our 8 predefined sections."""
    sections = await get_article_sections(title, language)
    result = WikiArticleData()
    
    for section in sections:
        line_lower = section['line'].lower()
        
        # Skip housekeeping sections
        skip_words = ['see also', 'references', 'external links', 'notes', 'further reading', 'disambiguation']
        if any(word in line_lower for word in skip_words):
            continue
            
        # Try to map section to one of our target fields
        for smap in SECTION_MAP:
            if any(kw in line_lower for kw in smap['keywords']):
                # Only populate if not already found (takes first match)
                if getattr(result, smap['column']) is None:
                    content = await fetch_section(title, section['index'], language)
                    if content:
                        setattr(result, smap['column'], content)
                break
                
    return result

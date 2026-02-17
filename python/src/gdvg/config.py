"""Configuration and constants for GDVG enrichment pipelines."""

import os
from pathlib import Path
from typing import Final

from dotenv import load_dotenv

# Load environment variables from project root .env.local
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
ENV_PATH = PROJECT_ROOT / ".env.local"
load_dotenv(ENV_PATH)

# ============================================
# ENVIRONMENT VARIABLES
# ============================================

# Supabase
SUPABASE_URL: Final[str] = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: Final[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError(
        "Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and "
        "SUPABASE_SERVICE_ROLE_KEY are set in .env.local"
    )

# TMDB
TMDB_ACCESS_TOKEN: Final[str] = os.getenv("TMDB_ACCESS_TOKEN", "")

if not TMDB_ACCESS_TOKEN:
    raise ValueError("Missing TMDB_ACCESS_TOKEN in .env.local")

# Wikipedia/Wikidata
WIKI_USER_AGENT: Final[str] = os.getenv(
    "WIKI_USER_AGENT", "GDVG-Admin/1.0 (github.com/Krushna-ai/GDVG-Admin-Console)"
)

# GitHub (optional, for workflow triggers)
GITHUB_TOKEN: Final[str] = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO_OWNER: Final[str] = os.getenv("GITHUB_REPO_OWNER", "Krushna-ai")
GITHUB_REPO_NAME: Final[str] = os.getenv("GITHUB_REPO_NAME", "GDVG-Admin-Console")

# ============================================
# API RATE LIMITS
# ============================================

# TMDB: ~40 req/sec soft limit, respect 429
TMDB_RATE_LIMIT_DELAY_MS: Final[int] = 50  # 50ms = ~20 req/sec (conservative)
TMDB_MAX_RETRIES: Final[int] = 5
TMDB_RETRY_BACKOFF_FACTOR: Final[float] = 2.0

# Wikipedia REST API: 200 req/sec
WIKIPEDIA_RATE_LIMIT_DELAY_MS: Final[int] = 100  # 100ms = 10 req/sec (very safe)

# Wikipedia Action API: 500 req/hr unauthenticated
WIKIPEDIA_ACTION_DELAY_MS: Final[int] = 8000  # 8 sec = ~450 req/hr

# Wikidata SPARQL: ~5 concurrent, 1 req/sec recommended
WIKIDATA_RATE_LIMIT_DELAY_MS: Final[int] = 1000  # 1 second between requests

# ============================================
# BATCH PROCESSING CONSTANTS
# ============================================

# Database batch sizes for bulk operations
DB_BATCH_SIZE_UPSERT: Final[int] = 500  # Rows per upsert batch
DB_BATCH_SIZE_READ: Final[int] = 1000  # Rows per read batch

# Enrichment queue processing limits
ENRICH_CONTENT_BATCH_SIZE: Final[int] = 500  # Items per enrichment run
ENRICH_PEOPLE_BATCH_SIZE: Final[int] = 300  # Items per people enrichment run

# Harvest limits
HARVEST_MAX_PAGES_PER_REGION: Final[int] = 500  # Max pages to fetch per region/type
HARVEST_DEDUP_CHUNK_SIZE: Final[int] = 10000  # IDs to check at once for duplicates

# ============================================
# REGION CONFIGURATIONS
# ============================================

# Priority: Higher = imported/enriched first
COUNTRY_PRIORITY: Final[dict[str, int]] = {
    "KR": 10,  # Korea
    "CN": 9,
    "TW": 9,
    "HK": 9,  # Greater China
    "TH": 8,  # Thailand
    "TR": 7,  # Turkey
    "JP": 6,  # Japan
    "IN": 4,  # India
    "US": 2,
    "GB": 2,
    "CA": 2,
    "AU": 2,  # Western English
    "FR": 2,
    "DE": 2,
    "ES": 2,
    "IT": 2,  # Western European
    "BR": 2,
    "MX": 2,  # Latin America
    "PH": 1,
    "ID": 1,
    "VN": 1,
    "MY": 1,  # Southeast Asia
}

# Region configurations for discovery
REGION_CONFIGS: Final[list[dict]] = [
    {"code": "KR", "countries": ["KR"]},
    {"code": "CN", "countries": ["CN", "TW", "HK"]},
    {"code": "TH", "countries": ["TH"]},
    {"code": "TR", "countries": ["TR"]},
    {"code": "JP", "countries": ["JP"]},
    {"code": "IN", "countries": ["IN"]},
    {"code": "WESTERN", "countries": ["US", "GB", "FR", "DE", "ES", "IT"]},
    {"code": "LATAM", "countries": ["BR", "MX", "AR", "CO"]},
    {"code": "SEA", "countries": ["PH", "ID", "VN", "MY", "SG"]},
]

# Content type priority
CONTENT_TYPE_PRIORITY: Final[dict[str, int]] = {
    "drama": 10,
    "tv": 8,
    "movie": 6,
    "anime": 5,
}

# ============================================
# TMDB API CONFIGURATION
# ============================================

# TMDB base URL
TMDB_BASE_URL: Final[str] = "https://api.themoviedb.org/3"

# TMDB append_to_response for maximum data extraction
TMDB_CONTENT_APPEND: Final[str] = (
    "credits,keywords,videos,images,watch/providers,external_ids,"
    "content_ratings,alternative_titles,translations,reviews,"
    "recommendations,similar"
)

TMDB_PERSON_APPEND: Final[str] = (
    "combined_credits,images,external_ids,tagged_images"
)

# Discovery sort orders (rotate to get diverse content)
TMDB_SORT_ORDERS: Final[list[str]] = [
    "popularity.desc",
    "vote_count.desc",
    "first_air_date.desc",
    "release_date.desc",
    "revenue.desc",
    "title.asc",
    "original_title.asc",
]

# ============================================
# ENRICHMENT CYCLE CONFIGURATION
# ============================================

# Enrichment cycles (0-8, round-robin)
ENRICHMENT_CYCLE_MAX: Final[int] = 8

# GDVG Python Enrichment Pipelines

Python-based scraping, importing, and enrichment pipelines for GDVG content and people data.

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment variables from project root
# The Python scripts will automatically load from ../.env.local
```

## Structure

- `src/gdvg/` - Main package
  - `clients/` - API clients (TMDB, Wikipedia, Wikidata, Supabase)
  - `db/` - Database operations (Pandas-friendly)
  - `enrichment/` - Content and people enrichment pipelines
  - `harvester/` - Mass TMDB ID collection
  - `linker/` - Cast/crew relationship linking
  - `quality/` - Data quality analysis
  - `sync/` - Change tracking and synchronization

## Environment Variables

Required in `.env.local` (project root):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TMDB_ACCESS_TOKEN`
- `WIKI_USER_AGENT`

## Running Scripts

Each pipeline has a CLI entrypoint in `src/gdvg/`:
- `harvester/run_harvest.py` - Harvest TMDB IDs
- `enrichment/run_enrich_content.py` - Enrich content
- `enrichment/run_enrich_people.py` - Enrich people
- `quality/data_quality.py` - Generate quality reports

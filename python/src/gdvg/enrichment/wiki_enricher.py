"""Wikipedia and Wikidata content enrichment engine.

Enhances TMDB content data with:
- Wikipedia FULL article content (plot, synopsis, episode guide, production, reception)
- Wikipedia summary (intro paragraph — used as overview if better than TMDB)
- Wikipedia categories (merged with TMDB keywords)
- Wikidata metadata (genres, networks, screenwriters, filming locations, etc.)

Wikipedia article sections stored in `wikipedia_content` JSONB column:
  {
    "plot": "...",
    "synopsis": "...",
    "episode_guide": "...",
    "production": "...",
    "reception": "...",
    "cast_notes": "...",
    "soundtrack": "...",
    "release": "...",
    "accolades": "...",
    "raw_sections": {"Section Title": "content", ...}
  }
"""

import logging
import re
from typing import Optional, Any, Literal

from gdvg.clients.wikipedia import create_wikipedia_client
from gdvg.clients.wikidata import create_wikidata_client

logger = logging.getLogger(__name__)


# Section title patterns → canonical key mapping
# Wikipedia uses many variations of the same section name
SECTION_KEY_MAP: dict[str, str] = {
    # Plot / Synopsis
    "plot": "plot",
    "plot summary": "plot",
    "synopsis": "synopsis",
    "story": "plot",
    "storyline": "plot",
    "narrative": "plot",

    # Episodes
    "episodes": "episode_guide",
    "episode list": "episode_guide",
    "episode guide": "episode_guide",
    "series overview": "episode_guide",
    "season overview": "episode_guide",
    "seasons": "episode_guide",

    # Production
    "production": "production",
    "development": "production",
    "filming": "production",
    "pre-production": "production",
    "post-production": "production",
    "writing": "production",
    "direction": "production",
    "cinematography": "production",
    "visual effects": "production",

    # Cast
    "cast": "cast_notes",
    "cast and characters": "cast_notes",
    "characters": "cast_notes",
    "casting": "cast_notes",

    # Reception
    "reception": "reception",
    "critical reception": "reception",
    "critical response": "reception",
    "box office": "reception",
    "ratings": "reception",
    "audience reception": "reception",
    "reviews": "reception",

    # Soundtrack
    "soundtrack": "soundtrack",
    "music": "soundtrack",
    "score": "soundtrack",

    # Release
    "release": "release",
    "distribution": "release",
    "broadcast": "release",
    "premiere": "release",
    "streaming": "release",

    # Accolades
    "accolades": "accolades",
    "awards": "accolades",
    "awards and nominations": "accolades",
    "recognition": "accolades",
}

# Meta-category patterns to skip when merging Wikipedia categories as keywords
SKIP_CATEGORY_PATTERNS = [
    "Articles", "Pages", "Wikipedia", "Webarchive",
    "CS1", "All articles", "Use dmy dates", "Use mdy dates",
    "Infobox", "Commons", "Wikidata",
]


def _parse_wikipedia_sections(full_content: str) -> dict[str, str]:
    """Parse Wikipedia article text into named sections.

    Args:
        full_content: Plain text of the full Wikipedia article

    Returns:
        Dict mapping canonical section key → section text
    """
    if not full_content:
        return {}

    # Split on section headers (== Header == or === Sub-header ===)
    # Pattern: one or more = signs, then the title, then the same = signs
    section_pattern = re.compile(r"^(={2,4})\s*(.+?)\s*\1\s*$", re.MULTILINE)

    sections: dict[str, str] = {}
    raw_sections: dict[str, str] = {}

    # Find all section boundaries
    matches = list(section_pattern.finditer(full_content))

    if not matches:
        # No sections — entire article is the intro/plot
        sections["plot"] = full_content.strip()
        return sections

    # Extract intro (text before first section)
    intro = full_content[: matches[0].start()].strip()
    if intro:
        sections["intro"] = intro

    # Extract each section
    for i, match in enumerate(matches):
        title = match.group(2).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_content)
        content = full_content[start:end].strip()

        if not content:
            continue

        # Store raw section
        raw_sections[title] = content

        # Map to canonical key
        canonical = SECTION_KEY_MAP.get(title.lower())
        if canonical:
            # Append if multiple sections map to same key (e.g. multiple "Production" subsections)
            if canonical in sections:
                sections[canonical] = sections[canonical] + "\n\n" + content
            else:
                sections[canonical] = content

    sections["raw_sections"] = raw_sections
    return sections


class WikiEnricher:
    """Wikipedia and Wikidata content enrichment engine.

    Strategy:
    1. Look up Wikidata entity by TMDB ID (1 SPARQL query → gets wikidata_id + wikipedia_title)
    2. Fetch Wikipedia FULL article (plot, episodes, production, reception, etc.)
    3. Fetch Wikipedia summary (use as overview if richer than TMDB)
    4. Fetch Wikipedia categories (merge with keywords)
    5. Extract Wikidata properties (genres, networks, screenwriters, locations)
    """

    def __init__(self):
        self.stats = {
            "wikidata_found": 0,
            "wikipedia_found": 0,
            "overview_enhanced": 0,
            "full_content_fetched": 0,
            "genres_merged": 0,
            "categories_added": 0,
        }

    async def enrich_content(
        self,
        tmdb_id: int,
        content_type: Literal["movie", "tv"],
        current_overview: Optional[str] = None,
        current_genres: Optional[list[str]] = None,
        current_keywords: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Enrich content with full Wikipedia article + Wikidata metadata.

        Args:
            tmdb_id: TMDB ID
            content_type: 'movie' or 'tv'
            current_overview: Existing TMDB overview
            current_genres: Existing TMDB genres
            current_keywords: Existing TMDB keywords dict

        Returns:
            Dict with updated fields (overview, wikipedia_content, genres, keywords, etc.)
        """
        enrichment: dict[str, Any] = {}

        # Step 1: Look up Wikidata entity (1 SPARQL call → wikidata_id + wikipedia_title)
        async with create_wikidata_client() as wikidata:
            wikidata_entity = await wikidata.get_by_tmdb_id(tmdb_id, content_type)

            if not wikidata_entity:
                logger.debug(f"No Wikidata entity found for {content_type} {tmdb_id}")
                return enrichment

            self.stats["wikidata_found"] += 1

            wikidata_id = wikidata_entity["wikidata_id"]
            wikipedia_title = wikidata_entity.get("wikipedia_title")
            wikipedia_url = wikidata_entity.get("wikipedia_url")

            enrichment["wikidata_id"] = wikidata_id
            enrichment["wikipedia_url"] = wikipedia_url

            # Steps 2–4: Fetch full Wikipedia content + summary + categories
            if wikipedia_title:
                async with create_wikipedia_client() as wiki:
                    # --- Full article content (plot, episodes, production, etc.) ---
                    full_page = await wiki.get_page_content(wikipedia_title, language="en")

                    if full_page:
                        self.stats["wikipedia_found"] += 1
                        raw_text = full_page.get("extract", "")

                        if raw_text:
                            self.stats["full_content_fetched"] += 1
                            sections = _parse_wikipedia_sections(raw_text)

                            # Write each section into its own dedicated DB column
                            # App developers read wiki_plot, wiki_episode_guide, etc. directly
                            _SECTION_TO_COLUMN = {
                                "plot":         "wiki_plot",
                                "synopsis":     "wiki_synopsis",
                                "episode_guide":"wiki_episode_guide",
                                "production":   "wiki_production",
                                "cast_notes":   "wiki_cast_notes",
                                "reception":    "wiki_reception",
                                "soundtrack":   "wiki_soundtrack",
                                "release":      "wiki_release",
                                "accolades":    "wiki_accolades",
                            }
                            for section_key, col_name in _SECTION_TO_COLUMN.items():
                                val = sections.get(section_key)
                                if val:
                                    enrichment[col_name] = val

                            # Use intro or plot as overview if better than TMDB
                            wiki_overview = sections.get("intro") or sections.get("plot", "")
                            if wiki_overview:
                                use_wiki = (
                                    not current_overview
                                    or len(wiki_overview) > len(current_overview) * 2
                                )
                                if use_wiki:
                                    enrichment["overview"] = wiki_overview
                                    enrichment["overview_source"] = "wikipedia"
                                    self.stats["overview_enhanced"] += 1

                    # --- Summary (fallback if full content not available) ---
                    elif not full_page:
                        summary = await wiki.get_page_summary(wikipedia_title, language="en")
                        if summary:
                            self.stats["wikipedia_found"] += 1
                            wiki_overview = summary.get("extract", "")
                            if wiki_overview:
                                use_wiki = (
                                    not current_overview
                                    or len(wiki_overview) > len(current_overview) * 2
                                )
                                if use_wiki:
                                    enrichment["overview"] = wiki_overview
                                    enrichment["overview_source"] = "wikipedia"
                                    self.stats["overview_enhanced"] += 1

                    # --- Categories → merge with keywords ---
                    categories = await wiki.get_page_categories(
                        wikipedia_title, language="en", limit=50
                    )

                    if categories:
                        cleaned = []
                        for cat in categories:
                            cat_name = cat.replace("Category:", "").strip()
                            if any(p in cat_name for p in SKIP_CATEGORY_PATTERNS):
                                continue
                            cleaned.append(cat_name)

                        merged_keywords = (
                            current_keywords.copy() if current_keywords else {"keywords": []}
                        )
                        existing_names = {
                            kw["name"].lower()
                            for kw in merged_keywords.get("keywords", [])
                        }

                        new_keywords = [
                            {"id": None, "name": cat_name, "source": "wikipedia"}
                            for cat_name in cleaned[:20]
                            if cat_name.lower() not in existing_names
                        ]

                        if new_keywords:
                            merged_keywords["keywords"] = [
                                *merged_keywords.get("keywords", []),
                                *new_keywords,
                            ]
                            enrichment["keywords"] = merged_keywords
                            self.stats["categories_added"] += len(new_keywords)

            # Step 5: Extract Wikidata properties
            wikidata_metadata = await wikidata.get_entity_metadata(wikidata_id)

            if wikidata_metadata:
                # Genres (P136) — merge with TMDB genres
                wikidata_genres = wikidata_metadata.get("genre", [])
                if isinstance(wikidata_genres, str):
                    wikidata_genres = [wikidata_genres]
                if wikidata_genres:
                    merged_genres = list(set(current_genres or []) | set(wikidata_genres))
                    if len(merged_genres) > len(current_genres or []):
                        enrichment["genres"] = merged_genres
                        self.stats["genres_merged"] += 1

                # Network (P449) — important for TV shows
                network = wikidata_metadata.get("original_network")
                if network:
                    enrichment["network"] = network[0] if isinstance(network, list) else network

                # Screenwriter (P58)
                screenwriter = wikidata_metadata.get("screenwriter")
                if screenwriter:
                    enrichment["screenwriter"] = screenwriter

                # Director (P57)
                director = wikidata_metadata.get("director")
                if director:
                    enrichment["director"] = director

                # Creator (P170) — TV shows
                creator = wikidata_metadata.get("creator")
                if creator:
                    enrichment["creator"] = creator

                # Country of origin (P495)
                country = wikidata_metadata.get("country_of_origin")
                if country:
                    enrichment["country_of_origin"] = country

                # Filming location (P915)
                filming_location = wikidata_metadata.get("filming_location")
                if filming_location:
                    enrichment["filming_location"] = filming_location

                # Narrative location (P840)
                narrative_location = wikidata_metadata.get("narrative_location")
                if narrative_location:
                    enrichment["narrative_location"] = narrative_location

                # Duration (P2047)
                duration = wikidata_metadata.get("duration")
                if duration:
                    enrichment["duration_minutes"] = duration

        return enrichment

    async def enrich_content_batch(
        self,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Enrich multiple content items with Wikipedia/Wikidata data.

        Args:
            items: List of content dicts with tmdb_id, content_type, overview, genres, keywords

        Returns:
            List of enrichment dicts
        """
        enrichments = []

        for item in items:
            enrichment = await self.enrich_content(
                tmdb_id=item["tmdb_id"],
                content_type=item["content_type"],
                current_overview=item.get("overview"),
                current_genres=item.get("genres"),
                current_keywords=item.get("keywords"),
            )

            enrichments.append({
                "tmdb_id": item["tmdb_id"],
                "content_type": item["content_type"],
                **enrichment,
            })

        return enrichments


async def enrich_content_with_wiki(
    tmdb_id: int,
    content_type: Literal["movie", "tv"],
    current_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Enrich a single content item with Wikipedia/Wikidata.

    Args:
        tmdb_id: TMDB ID
        content_type: 'movie' or 'tv'
        current_data: Current content data (with overview, genres, keywords)

    Returns:
        Enrichment dict
    """
    enricher = WikiEnricher()
    current_data = current_data or {}

    return await enricher.enrich_content(
        tmdb_id=tmdb_id,
        content_type=content_type,
        current_overview=current_data.get("overview"),
        current_genres=current_data.get("genres"),
        current_keywords=current_data.get("keywords"),
    )

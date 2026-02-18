"""TMDB change tracking system for keeping data fresh.

Monitors TMDB's /changes endpoints to find recently modified items:
- /movie/changes - Movies updated in last 24 hours
- /tv/changes - TV shows updated in last 24 hours
- /person/changes - People updated in last 24 hours

Cross-references with our database and queues matching items for re-enrichment.
"""

import logging
from typing import Literal, Optional
from datetime import datetime, timedelta

from gdvg.clients.tmdb import create_tmdb_client
from gdvg.db.content import get_all_content_tmdb_ids
from gdvg.db.people import get_all_people_tmdb_ids
from gdvg.db.queue import bulk_add_to_enrichment_queue

logger = logging.getLogger(__name__)


class ChangeTracker:
    """Tracks TMDB changes and queues items for re-enrichment."""

    def __init__(self):
        self.stats = {
            "movies_changed": 0,
            "tv_changed": 0,
            "people_changed": 0,
            "movies_queued": 0,
            "tv_queued": 0,
            "people_queued": 0,
        }

    async def track_content_changes(
        self,
        content_type: Literal["movie", "tv"],
        days: int = 1,
    ) -> list[int]:
        """Track content changes from TMDB.

        Args:
            content_type: 'movie' or 'tv'
            days: Number of days to look back (default: 1)

        Returns:
            List of changed TMDB IDs
        """
        logger.info(f"Tracking {content_type} changes from last {days} day(s)")

        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        changed_ids = []

        async with create_tmdb_client() as tmdb:
            page = 1
            max_pages = 10  # Limit to prevent excessive API calls

            while page <= max_pages:
                try:
                    if content_type == "movie":
                        changes = await tmdb.get_movie_changes(
                            start_date=start_date.strftime("%Y-%m-%d"),
                            end_date=end_date.strftime("%Y-%m-%d"),
                            page=page,
                        )
                    else:
                        changes = await tmdb.get_tv_changes(
                            start_date=start_date.strftime("%Y-%m-%d"),
                            end_date=end_date.strftime("%Y-%m-%d"),
                            page=page,
                        )

                    if not changes or not changes.get("results"):
                        break

                    page_ids = [item.get("id") for item in changes["results"] if item.get("id")]
                    changed_ids.extend(page_ids)

                    total_pages = changes.get("total_pages", 1)
                    if page >= total_pages:
                        break

                    page += 1

                except Exception as e:
                    logger.error(f"Error fetching {content_type} changes page {page}: {e}")
                    break

        logger.info(f"Found {len(changed_ids)} changed {content_type} items")

        if content_type == "movie":
            self.stats["movies_changed"] = len(changed_ids)
        else:
            self.stats["tv_changed"] = len(changed_ids)

        return changed_ids

    async def track_people_changes(
        self,
        days: int = 1,
    ) -> list[int]:
        """Track people changes from TMDB.

        Args:
            days: Number of days to look back (default: 1)

        Returns:
            List of changed TMDB person IDs
        """
        logger.info(f"Tracking people changes from last {days} day(s)")

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        changed_ids = []

        async with create_tmdb_client() as tmdb:
            page = 1
            max_pages = 10

            while page <= max_pages:
                try:
                    changes = await tmdb.get_person_changes(
                        start_date=start_date.strftime("%Y-%m-%d"),
                        end_date=end_date.strftime("%Y-%m-%d"),
                        page=page,
                    )

                    if not changes or not changes.get("results"):
                        break

                    page_ids = [item.get("id") for item in changes["results"] if item.get("id")]
                    changed_ids.extend(page_ids)

                    total_pages = changes.get("total_pages", 1)
                    if page >= total_pages:
                        break

                    page += 1

                except Exception as e:
                    logger.error(f"Error fetching people changes page {page}: {e}")
                    break

        logger.info(f"Found {len(changed_ids)} changed people")
        self.stats["people_changed"] = len(changed_ids)

        return changed_ids

    def match_and_queue_content(
        self,
        changed_ids: list[int],
        content_type: Literal["movie", "tv"],
    ) -> int:
        """Match changed IDs against our DB and queue for re-enrichment.

        Args:
            changed_ids: List of TMDB IDs that changed
            content_type: 'movie' or 'tv'

        Returns:
            Number of items queued
        """
        if not changed_ids:
            return 0

        # FIX B7: get_all_content_tmdb_ids() returns set[int], not DataFrame
        # Pass content_type to filter at DB level (avoids loading all content types)
        existing_ids: set[int] = get_all_content_tmdb_ids(content_type=content_type)

        if not existing_ids:
            logger.info(f"No existing {content_type} in database")
            return 0

        # Match changed IDs against our DB
        matched_ids = [tmdb_id for tmdb_id in changed_ids if tmdb_id in existing_ids]

        if not matched_ids:
            logger.info(f"No {content_type} changes match our database")
            return 0

        logger.info(f"Matched {len(matched_ids)} {content_type} items in our DB")

        # FIX B6: use bulk_add_to_enrichment_queue (resolves tmdb_ids → UUID entity_ids)
        queued = bulk_add_to_enrichment_queue(
            tmdb_ids=matched_ids,
            queue_type="content",
            content_type=content_type,
            priority=5,
        )

        if content_type == "movie":
            self.stats["movies_queued"] = queued
        else:
            self.stats["tv_queued"] = queued

        return queued

    def match_and_queue_people(
        self,
        changed_ids: list[int],
    ) -> int:
        """Match changed person IDs against our DB and queue for re-enrichment.

        Args:
            changed_ids: List of TMDB person IDs that changed

        Returns:
            Number of items queued
        """
        if not changed_ids:
            return 0

        # FIX B8: get_all_people_tmdb_ids() returns set[int], not DataFrame
        existing_ids: set[int] = get_all_people_tmdb_ids()

        if not existing_ids:
            logger.info("No existing people in database")
            return 0

        # Match changed IDs against our DB
        matched_ids = [tmdb_id for tmdb_id in changed_ids if tmdb_id in existing_ids]

        if not matched_ids:
            logger.info("No people changes match our database")
            return 0

        logger.info(f"Matched {len(matched_ids)} people in our DB")

        # FIX B6: use bulk_add_to_enrichment_queue (resolves tmdb_ids → UUID entity_ids)
        queued = bulk_add_to_enrichment_queue(
            tmdb_ids=matched_ids,
            queue_type="people",
            priority=5,
        )

        self.stats["people_queued"] = queued

        return queued


async def sync_all_changes(days: int = 1) -> dict[str, int]:
    """Sync all TMDB changes (movies, TV, people).

    Args:
        days: Number of days to look back

    Returns:
        Statistics dict
    """
    tracker = ChangeTracker()

    # Track movies
    movie_changes = await tracker.track_content_changes("movie", days=days)
    tracker.match_and_queue_content(movie_changes, "movie")

    # Track TV
    tv_changes = await tracker.track_content_changes("tv", days=days)
    tracker.match_and_queue_content(tv_changes, "tv")

    # Track people
    people_changes = await tracker.track_people_changes(days=days)
    tracker.match_and_queue_people(people_changes)

    return tracker.stats


async def sync_content_changes(
    content_type: Literal["movie", "tv"],
    days: int = 1,
) -> dict[str, int]:
    """Sync content changes only.

    Args:
        content_type: 'movie' or 'tv'
        days: Number of days to look back

    Returns:
        Statistics dict
    """
    tracker = ChangeTracker()

    changed_ids = await tracker.track_content_changes(content_type, days=days)
    tracker.match_and_queue_content(changed_ids, content_type)

    return tracker.stats


async def sync_people_changes(days: int = 1) -> dict[str, int]:
    """Sync people changes only.

    Args:
        days: Number of days to look back

    Returns:
        Statistics dict
    """
    tracker = ChangeTracker()

    changed_ids = await tracker.track_people_changes(days=days)
    tracker.match_and_queue_people(changed_ids)

    return tracker.stats

"""Mass TMDB ID collection engine with multi-strategy harvesting.

This replaces the limited auto-import.ts with a comprehensive approach
that harvests ALL TMDB IDs without quality filters.
"""

import asyncio
import logging
from typing import Literal, Optional
from datetime import datetime, timedelta

import pandas as pd

from gdvg.clients.tmdb import create_tmdb_client
from gdvg.db.content import get_all_content_tmdb_ids
from gdvg.db.queue import add_to_import_queue
from gdvg.config import (
    REGION_CONFIGS,
    TMDB_SORT_ORDERS,
    HARVEST_MAX_PAGES_PER_REGION,
    HARVEST_DEDUP_CHUNK_SIZE,
)

logger = logging.getLogger(__name__)


class IDHarvester:
    """Mass TMDB ID collection engine.
    
    Three complementary strategies:
    1. Discover API - All regions × all sort orders × all pages
    2. Sequential Scan - ID 1 through latest_id
    3. Changes API - Recently added/modified content
    """
    
    def __init__(self):
        self.harvested_ids: set[tuple[int, str]] = set()  # (tmdb_id, content_type)
        self.stats = {
            "discover_ids": 0,
            "sequential_ids": 0,
            "changes_ids": 0,
            "duplicates_skipped": 0,
            "new_ids_queued": 0,
        }
    
    # ============================================
    # STRATEGY 1: DISCOVER API
    # ============================================
    
    async def harvest_discover(
        self,
        content_type: Literal["movie", "tv"],
        regions: Optional[list[str]] = None,
        sort_orders: Optional[list[str]] = None,
        max_pages_per_combo: int = HARVEST_MAX_PAGES_PER_REGION,
    ) -> set[int]:
        """Harvest IDs using Discover API.
        
        Iterates ALL regions × ALL sort orders × ALL pages.
        NO quality filters - gets everything!
        
        Args:
            content_type: 'movie' or 'tv'
            regions: Region codes (default: all from config)
            sort_orders: Sort orders (default: all from config)
            max_pages_per_combo: Max pages per region/sort combo
            
        Returns:
            Set of discovered TMDB IDs
        """
        if regions is None:
            # Use all regions from config
            regions = []
            for region_config in REGION_CONFIGS:
                regions.extend(region_config["countries"])
        
        if sort_orders is None:
            sort_orders = TMDB_SORT_ORDERS
        
        discovered_ids: set[int] = set()
        
        async with create_tmdb_client() as tmdb:
            for region in regions:
                for sort_order in sort_orders:
                    logger.info(
                        f"Harvesting {content_type} for region={region}, "
                        f"sort={sort_order}"
                    )
                    
                    # Discover with NO quality filters
                    discover_params = {
                        "with_origin_country": region,
                        "sort_by": sort_order,
                        "include_adult": False,
                        # NO vote_count, vote_average, or popularity filters!
                    }
                    
                    page = 1
                    while page <= max_pages_per_combo:
                        try:
                            if content_type == "movie":
                                result = await tmdb.discover_movies(
                                    page=page,
                                    **discover_params
                                )
                            else:
                                result = await tmdb.discover_tv(
                                    page=page,
                                    **discover_params
                                )
                            
                            results = result.get("results", [])
                            if not results:
                                break
                            
                            # Extract IDs
                            for item in results:
                                tmdb_id = item.get("id")
                                if tmdb_id:
                                    discovered_ids.add(tmdb_id)
                            
                            total_pages = result.get("total_pages", 0)
                            logger.debug(
                                f"Page {page}/{min(total_pages, max_pages_per_combo)}: "
                                f"found {len(results)} items"
                            )
                            
                            # Stop if we've reached the last page
                            if page >= total_pages:
                                break
                            
                            page += 1
                            
                        except Exception as e:
                            logger.error(
                                f"Error harvesting {content_type} "
                                f"region={region} sort={sort_order} page={page}: {e}"
                            )
                            break
                    
                    logger.info(
                        f"Completed {region}/{sort_order}: "
                        f"{len(discovered_ids)} unique IDs so far"
                    )
        
        self.stats["discover_ids"] += len(discovered_ids)
        return discovered_ids
    
    # ============================================
    # STRATEGY 2: SEQUENTIAL SCAN
    # ============================================
    
    async def harvest_sequential(
        self,
        content_type: Literal["movie", "tv"],
        start_id: int = 1,
        end_id: Optional[int] = None,
        batch_size: int = 100,
    ) -> set[int]:
        """Harvest IDs via sequential scan.
        
        TMDB IDs are sequential integers. We can scan 1 to latest_id
        checking which IDs exist.
        
        Args:
            content_type: 'movie' or 'tv'
            start_id: Starting ID
            end_id: Ending ID (default: get from latest endpoint)
            batch_size: IDs to check per batch
            
        Returns:
            Set of valid TMDB IDs
        """
        valid_ids: set[int] = set()
        
        async with create_tmdb_client() as tmdb:
            # Get latest ID if not provided
            if end_id is None:
                try:
                    if content_type == "movie":
                        latest = await tmdb.get_latest_movie()
                    else:
                        latest = await tmdb.get_latest_tv()
                    
                    end_id = latest.get("id", start_id + 10000)
                    logger.info(
                        f"Latest {content_type} ID from TMDB: {end_id}"
                    )
                except Exception as e:
                    logger.error(f"Error getting latest ID: {e}")
                    end_id = start_id + 10000  # Fallback
            
            logger.info(
                f"Sequential scan {content_type} from {start_id} to {end_id}"
            )
            
            # Scan in batches
            for batch_start in range(start_id, end_id + 1, batch_size):
                batch_end = min(batch_start + batch_size - 1, end_id)
                ids_to_check = list(range(batch_start, batch_end + 1))
                
                # Batch fetch details
                items = [(id, content_type) for id in ids_to_check]
                
                try:
                    results = await tmdb.get_content_details_batch(
                        items,
                        max_concurrent=5
                    )
                    
                    for i, result in enumerate(results):
                        if result and result.get("id"):
                            valid_ids.add(result["id"])
                    
                    logger.debug(
                        f"Scanned {batch_start}-{batch_end}: "
                        f"{len([r for r in results if r])} valid IDs"
                    )
                    
                except Exception as e:
                    logger.error(
                        f"Error in sequential scan {batch_start}-{batch_end}: {e}"
                    )
        
        self.stats["sequential_ids"] += len(valid_ids)
        return valid_ids
    
    # ============================================
    # STRATEGY 3: CHANGES API
    # ============================================
    
    async def harvest_changes(
        self,
        content_type: Literal["movie", "tv"],
        days_back: int = 1,
        max_pages: int = 50,
    ) -> set[int]:
        """Harvest IDs from changes API.
        
        Gets recently added/modified content.
        
        Args:
            content_type: 'movie' or 'tv'
            days_back: How many days to look back
            max_pages: Max pages to fetch
            
        Returns:
            Set of changed TMDB IDs
        """
        changed_ids: set[int] = set()
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
        
        async with create_tmdb_client() as tmdb:
            logger.info(
                f"Harvesting {content_type} changes from {start_date_str} "
                f"to {end_date_str}"
            )
            
            page = 1
            while page <= max_pages:
                try:
                    if content_type == "movie":
                        result = await tmdb.get_movie_changes(
                            page=page,
                            start_date=start_date_str,
                            end_date=end_date_str,
                        )
                    else:
                        result = await tmdb.get_tv_changes(
                            page=page,
                            start_date=start_date_str,
                            end_date=end_date_str,
                        )
                    
                    results = result.get("results", [])
                    if not results:
                        break
                    
                    for item in results:
                        tmdb_id = item.get("id")
                        if tmdb_id:
                            changed_ids.add(tmdb_id)
                    
                    total_pages = result.get("total_pages", 0)
                    if page >= total_pages:
                        break
                    
                    page += 1
                    
                except Exception as e:
                    logger.error(
                        f"Error harvesting {content_type} changes page {page}: {e}"
                    )
                    break
        
        self.stats["changes_ids"] += len(changed_ids)
        return changed_ids
    
    # ============================================
    # DEDUPLICATION & QUEUEING
    # ============================================
    
    async def deduplicate_and_queue(
        self,
        harvested_ids: set[int],
        content_type: Literal["movie", "tv"],
        priority: int = 5,
    ) -> int:
        """Deduplicate against existing content and queue new IDs.
        
        Args:
            harvested_ids: Set of harvested TMDB IDs
            content_type: 'movie' or 'tv'
            priority: Queue priority (0-10)
            
        Returns:
            Number of new IDs queued
        """
        if not harvested_ids:
            return 0
        
        logger.info(
            f"Deduplicating {len(harvested_ids)} {content_type} IDs "
            f"against existing content"
        )
        
        # Get all existing TMDB IDs from DB
        existing_ids = get_all_content_tmdb_ids(content_type)
        
        # Find new IDs
        new_ids = harvested_ids - existing_ids
        
        self.stats["duplicates_skipped"] += len(harvested_ids) - len(new_ids)
        
        if not new_ids:
            logger.info("No new IDs to queue")
            return 0
        
        logger.info(
            f"Found {len(new_ids)} new {content_type} IDs to queue "
            f"(skipped {len(existing_ids & harvested_ids)} duplicates)"
        )
        
        # Queue in database
        queued = add_to_import_queue(
            tmdb_ids=list(new_ids),
            content_type=content_type,
            priority=priority,
        )
        
        self.stats["new_ids_queued"] += queued
        
        return queued
    
    # ============================================
    # ORCHESTRATION
    # ============================================
    
    async def harvest_all_strategies(
        self,
        content_type: Literal["movie", "tv"],
        strategies: Optional[list[str]] = None,
    ) -> dict[str, int]:
        """Run all harvesting strategies and queue results.
        
        Args:
            content_type: 'movie' or 'tv'
            strategies: List of strategies to run
                        (default: ['discover', 'changes'])
                        Available: 'discover', 'sequential', 'changes'
            
        Returns:
            Statistics dict
        """
        if strategies is None:
            # Default: discover + changes (sequential is very slow)
            strategies = ["discover", "changes"]
        
        all_ids: set[int] = set()
        
        # Run strategies
        if "discover" in strategies:
            logger.info(f"Running DISCOVER strategy for {content_type}")
            discover_ids = await self.harvest_discover(content_type)
            all_ids.update(discover_ids)
            logger.info(f"Discover strategy found {len(discover_ids)} IDs")
        
        if "sequential" in strategies:
            logger.info(f"Running SEQUENTIAL strategy for {content_type}")
            sequential_ids = await self.harvest_sequential(content_type)
            all_ids.update(sequential_ids)
            logger.info(f"Sequential strategy found {len(sequential_ids)} IDs")
        
        if "changes" in strategies:
            logger.info(f"Running CHANGES strategy for {content_type}")
            changes_ids = await self.harvest_changes(content_type)
            all_ids.update(changes_ids)
            logger.info(f"Changes strategy found {len(changes_ids)} IDs")
        
        # Deduplicate and queue
        queued = await self.deduplicate_and_queue(all_ids, content_type)
        
        logger.info(
            f"Harvest complete for {content_type}: "
            f"{len(all_ids)} total IDs, {queued} new IDs queued"
        )
        
        return {
            "total_harvested": len(all_ids),
            "new_queued": queued,
            **self.stats,
        }


async def run_harvest(
    content_types: Optional[list[str]] = None,
    strategies: Optional[list[str]] = None,
) -> dict[str, dict[str, int]]:
    """Run ID harvesting for specified content types.
    
    Args:
        content_types: Types to harvest (default: ['movie', 'tv'])
        strategies: Strategies to use (default: ['discover', 'changes'])
        
    Returns:
        Statistics per content type
    """
    if content_types is None:
        content_types = ["movie", "tv"]
    
    results = {}
    
    for content_type in content_types:
        harvester = IDHarvester()
        stats = await harvester.harvest_all_strategies(
            content_type,  # type: ignore
            strategies=strategies,
        )
        results[content_type] = stats
    
    return results

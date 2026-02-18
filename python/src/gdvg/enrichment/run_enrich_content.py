"""CLI entrypoint for content enrichment.

Processes content from enrichment_queue or import_queue with:
- TMDB enrichment (all fields + append_to_response)
- Wikipedia/Wikidata enrichment (overview, genres, keywords, metadata)
- Batch processing with configurable limits
- Cycle-based round-robin (0-8 cycles for even coverage)
- Resume capability

Usage:
    python -m gdvg.enrichment.run_enrich_content --batch-size 100 --cycle 0
    python -m gdvg.enrichment.run_enrich_content --source import-queue --batch-size 50
"""

import asyncio
import argparse
import logging
import sys
from datetime import datetime
from typing import Literal

import pandas as pd

from gdvg.enrichment.content_enricher import ContentEnricher
from gdvg.enrichment.wiki_enricher import WikiEnricher
from gdvg.db.content import (
    get_content_needing_enrichment,
    update_content_enrichment_cycle,
    upsert_content_bulk,
)
from gdvg.db.queue import (
    get_import_queue_batch,
    mark_import_queue_completed,
)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger(__name__)


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Enrich content with TMDB + Wikipedia/Wikidata",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process 100 items from enrichment queue (cycle 0)
  python -m gdvg.enrichment.run_enrich_content --batch-size 100 --cycle 0
  
  # Process from import queue
  python -m gdvg.enrichment.run_enrich_content --source import-queue --batch-size 50
  
  # Process only movies, cycle 3
  python -m gdvg.enrichment.run_enrich_content --content-type movie --cycle 3
  
  # TMDB only (skip Wikipedia/Wikidata)
  python -m gdvg.enrichment.run_enrich_content --tmdb-only --batch-size 200
        """,
    )
    
    parser.add_argument(
        "--source",
        choices=["enrichment-queue", "import-queue"],
        default="enrichment-queue",
        help="Source to pull items from (default: enrichment-queue)",
    )
    
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of items to process (default: 100)",
    )
    
    parser.add_argument(
        "--content-type",
        choices=["movie", "tv"],
        help="Filter by content type (default: both)",
    )
    
    parser.add_argument(
        "--cycle",
        type=int,
        choices=range(9),
        help="Enrichment cycle (0-8) for round-robin (default: no filter)",
    )
    
    parser.add_argument(
        "--tmdb-only",
        action="store_true",
        help="Skip Wikipedia/Wikidata enrichment (faster)",
    )
    
    parser.add_argument(
        "--wiki-only",
        action="store_true",
        help="Only do Wikipedia/Wikidata enrichment (requires existing content)",
    )
    
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    
    return parser.parse_args()


async def enrich_from_enrichment_queue(
    batch_size: int,
    content_type: str = None,
    cycle: int = None,
    tmdb_only: bool = False,
) -> dict[str, int]:
    """Process content from enrichment_queue.
    
    Args:
        batch_size: Number of items to process
        content_type: Filter by content type
        cycle: Filter by enrichment cycle
        tmdb_only: Skip Wikipedia/Wikidata
        
    Returns:
        Statistics dict
    """
    # Get batch from enrichment queue
    content_df = get_content_needing_enrichment(
        limit=batch_size,
        content_type=content_type,
        cycle=cycle,
    )
    
    if content_df.empty:
        logger.info("No content needing enrichment")
        return {"processed": 0, "success": 0, "failed": 0}
    
    logger.info(f"Processing {len(content_df)} items from enrichment queue")
    
    stats = {
        "processed": 0,
        "success": 0,
        "failed": 0,
        "tmdb_enriched": 0,
        "wiki_enriched": 0,
    }
    
    # Enrich each item
    tmdb_enricher = ContentEnricher()
    wiki_enricher = WikiEnricher()
    
    enriched_items = []
    
    for _, row in content_df.iterrows():
        tmdb_id = row["tmdb_id"]
        content_type_val = row["content_type"]
        
        try:
            # TMDB enrichment
            tmdb_data = await tmdb_enricher.enrich_content(tmdb_id, content_type_val)
            
            if not tmdb_data:
                stats["failed"] += 1
                stats["processed"] += 1
                continue
            
            stats["tmdb_enriched"] += 1
            
            # Wikipedia/Wikidata enrichment (unless tmdb-only)
            if not tmdb_only:
                wiki_data = await wiki_enricher.enrich_content(
                    tmdb_id=tmdb_id,
                    content_type=content_type_val,
                    current_overview=tmdb_data.get("overview"),
                    current_genres=tmdb_data.get("genres"),
                    current_keywords=tmdb_data.get("keywords"),
                )
                
                if wiki_data:
                    # Merge wiki data into tmdb data
                    tmdb_data.update(wiki_data)
                    stats["wiki_enriched"] += 1
            
            # Remove temporary credit fields
            tmdb_data.pop("_cast", None)
            tmdb_data.pop("_crew", None)
            
            enriched_items.append(tmdb_data)
            stats["success"] += 1
            
        except Exception as e:
            logger.error(f"Error enriching {content_type_val} {tmdb_id}: {e}")
            stats["failed"] += 1
        
        stats["processed"] += 1
    
    # Bulk upsert enriched content
    if enriched_items:
        enriched_df = pd.DataFrame(enriched_items)
        upsert_content_bulk(enriched_df)
        
        # Update enrichment cycles
        tmdb_ids = [item["tmdb_id"] for item in enriched_items]
        content_types_list = [item["content_type"] for item in enriched_items]
        
        for tmdb_id, ct in zip(tmdb_ids, content_types_list):
            update_content_enrichment_cycle(tmdb_id, ct)
    
    return stats


async def enrich_from_import_queue(
    batch_size: int,
    content_type: str = None,
    tmdb_only: bool = False,
) -> dict[str, int]:
    """Process content from import_queue.
    
    Args:
        batch_size: Number of items to process
        content_type: Filter by content type
        tmdb_only: Skip Wikipedia/Wikidata
        
    Returns:
        Statistics dict
    """
    # Get batch from import queue
    queue_df = get_import_queue_batch(
        limit=batch_size,
        content_type=content_type,
    )
    
    if queue_df.empty:
        logger.info("No items in import queue")
        return {"processed": 0, "success": 0, "failed": 0}
    
    logger.info(f"Processing {len(queue_df)} items from import queue")
    
    stats = {
        "processed": 0,
        "success": 0,
        "failed": 0,
        "tmdb_enriched": 0,
        "wiki_enriched": 0,
    }
    
    # Enrich each item
    tmdb_enricher = ContentEnricher()
    wiki_enricher = WikiEnricher()
    
    enriched_items = []
    queue_ids_to_complete = []
    
    for _, row in queue_df.iterrows():
        tmdb_id = row["tmdb_id"]
        content_type_val = row["content_type"]
        queue_id = row["id"]
        
        try:
            # TMDB enrichment
            tmdb_data = await tmdb_enricher.enrich_content(tmdb_id, content_type_val)
            
            if not tmdb_data:
                stats["failed"] += 1
                stats["processed"] += 1
                continue
            
            stats["tmdb_enriched"] += 1
            
            # Wikipedia/Wikidata enrichment (unless tmdb-only)
            if not tmdb_only:
                wiki_data = await wiki_enricher.enrich_content(
                    tmdb_id=tmdb_id,
                    content_type=content_type_val,
                    current_overview=tmdb_data.get("overview"),
                    current_genres=tmdb_data.get("genres"),
                    current_keywords=tmdb_data.get("keywords"),
                )
                
                if wiki_data:
                    tmdb_data.update(wiki_data)
                    stats["wiki_enriched"] += 1
            
            # Remove temporary credit fields
            tmdb_data.pop("_cast", None)
            tmdb_data.pop("_crew", None)
            
            enriched_items.append(tmdb_data)
            queue_ids_to_complete.append(queue_id)
            stats["success"] += 1
            
        except Exception as e:
            logger.error(f"Error enriching {content_type_val} {tmdb_id}: {e}")
            stats["failed"] += 1
        
        stats["processed"] += 1
    
    # Bulk upsert enriched content
    if enriched_items:
        enriched_df = pd.DataFrame(enriched_items)
        upsert_content_bulk(enriched_df)
        
        # Mark queue items as completed
        mark_import_queue_completed(queue_ids_to_complete)
    
    return stats


async def main():
    """Main entrypoint."""
    args = parse_args()
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    logger.info("=" * 60)
    logger.info("Content Enrichment Runner")
    logger.info("=" * 60)
    logger.info(f"Source: {args.source}")
    logger.info(f"Batch Size: {args.batch_size}")
    if args.content_type:
        logger.info(f"Content Type: {args.content_type}")
    if args.cycle is not None:
        logger.info(f"Enrichment Cycle: {args.cycle}")
    logger.info(f"TMDB Only: {args.tmdb_only}")
    logger.info(f"Wiki Only: {args.wiki_only}")
    logger.info("=" * 60)
    
    start_time = datetime.now()
    
    try:
        if args.source == "enrichment-queue":
            stats = await enrich_from_enrichment_queue(
                batch_size=args.batch_size,
                content_type=args.content_type,
                cycle=args.cycle,
                tmdb_only=args.tmdb_only,
            )
        else:
            stats = await enrich_from_import_queue(
                batch_size=args.batch_size,
                content_type=args.content_type,
                tmdb_only=args.tmdb_only,
            )
        
        # Print results
        logger.info("")
        logger.info("=" * 60)
        logger.info("ENRICHMENT COMPLETE")
        logger.info("=" * 60)
        logger.info(f"Processed:       {stats['processed']:,}")
        logger.info(f"Success:         {stats['success']:,}")
        logger.info(f"Failed:          {stats['failed']:,}")
        logger.info(f"TMDB Enriched:   {stats.get('tmdb_enriched', 0):,}")
        logger.info(f"Wiki Enriched:   {stats.get('wiki_enriched', 0):,}")
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"\nElapsed Time: {elapsed:.1f} seconds")
        logger.info("=" * 60)
        
        return 0
        
    except Exception as e:
        logger.error(f"Enrichment failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

"""CLI entrypoint for people enrichment.

Processes people from enrichment_queue with:
- TMDB enrichment (biography, images, credits, external IDs)
- Wikipedia enrichment (richer biographies with name matching)
- Batch processing with configurable limits
- Cycle-based round-robin (0-8 cycles for even coverage)
- Resume capability

Usage:
    python -m gdvg.enrichment.run_enrich_people --batch-size 300
    python -m gdvg.enrichment.run_enrich_people --cycle 0 --tmdb-only
"""

import asyncio
import argparse
import logging
import sys
from datetime import datetime

from gdvg.enrichment.people_enricher import PeopleEnricher
from gdvg.db.people import (
    get_people_needing_enrichment,
    update_people_enrichment_cycle,
    upsert_people_bulk,
)
from gdvg.db.queue import (
    get_enrichment_queue_batch,
    mark_enrichment_queue_completed,
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
        description="Enrich people with TMDB + Wikipedia",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process 300 from enrichment queue
  python -m gdvg.enrichment.run_enrich_people --batch-size 300
  
  # Process cycle 0
  python -m gdvg.enrichment.run_enrich_people --cycle 0
  
  # TMDB only (skip Wikipedia, faster)
  python -m gdvg.enrichment.run_enrich_people --tmdb-only --batch-size 500
        """,
    )
    
    parser.add_argument(
        "--batch-size",
        type=int,
        default=300,
        help="Number of people to process (default: 300)",
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
        help="Skip Wikipedia enrichment (faster)",
    )
    
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    
    return parser.parse_args()


async def enrich_from_enrichment_queue(
    batch_size: int,
    cycle: int = None,
    tmdb_only: bool = False,
) -> dict[str, int]:
    """Process people from enrichment queue.
    
    Args:
        batch_size: Number of items to process
        cycle: Filter by enrichment cycle
        tmdb_only: Skip Wikipedia enrichment
        
    Returns:
        Statistics dict
    """
    # Get batch from enrichment queue
    people_df = get_people_needing_enrichment(
        limit=batch_size,
        cycle=cycle,
    )
    
    if people_df.empty:
        logger.info("No people needing enrichment")
        return {"processed": 0, "success": 0, "failed": 0}
    
    logger.info(f"Processing {len(people_df)} people from enrichment queue")
    
    stats = {
        "processed": 0,
        "success": 0,
        "failed": 0,
        "tmdb_enriched": 0,
        "wiki_enriched": 0,
    }
    
    # Enrich each person
    enricher = PeopleEnricher()
    enriched_items = []
    
    for _, row in people_df.iterrows():
        tmdb_id = row["tmdb_id"]
        
        try:
            # Enrich with TMDB + Wikipedia
            person = await enricher.enrich_person(
                tmdb_id,
                enrich_with_wikipedia=not tmdb_only,
            )
            
            if not person:
                stats["failed"] += 1
                stats["processed"] += 1
                continue
            
            stats["tmdb_enriched"] += 1
            
            # Check if Wikipedia was used
            if person.get("bio_source") == "wikipedia":
                stats["wiki_enriched"] += 1
            
            # Remove temporary credit fields
            person.pop("_cast_credits", None)
            person.pop("_crew_credits", None)
            
            enriched_items.append(person)
            stats["success"] += 1
            
        except Exception as e:
            logger.error(f"Error enriching person {tmdb_id}: {e}")
            stats["failed"] += 1
        
        stats["processed"] += 1
    
    # Bulk upsert enriched people
    if enriched_items:
        import pandas as pd
        enriched_df = pd.DataFrame(enriched_items)
        upsert_people_bulk(enriched_df)
        
        # Update enrichment cycles
        tmdb_ids = [item["tmdb_id"] for item in enriched_items]
        
        for tmdb_id in tmdb_ids:
            update_people_enrichment_cycle(tmdb_id)
    
    return stats


async def main():
    """Main entrypoint."""
    args = parse_args()
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    logger.info("=" * 60)
    logger.info("People Enrichment Runner")
    logger.info("=" * 60)
    logger.info(f"Batch Size: {args.batch_size}")
    if args.cycle is not None:
        logger.info(f"Enrichment Cycle: {args.cycle}")
    logger.info(f"TMDB Only: {args.tmdb_only}")
    logger.info("=" * 60)
    
    start_time = datetime.now()
    
    try:
        stats = await enrich_from_enrichment_queue(
            batch_size=args.batch_size,
            cycle=args.cycle,
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

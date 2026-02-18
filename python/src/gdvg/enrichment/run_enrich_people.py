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

import pandas as pd

from gdvg.enrichment.people_enricher import PeopleEnricher
from gdvg.db.people import (
    get_people_needing_enrichment,
    update_people_enrichment_cycle,
    upsert_people_bulk,
)
from gdvg.db.queue import (
    get_current_enrichment_cycle,
    advance_enrichment_cycle,
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

    Phase 1: Fetch all TMDB data concurrently (20 parallel requests).
    Phase 2: Enrich with Wikipedia sequentially (rate-limited to 100ms/req).
    """
    people_df = get_people_needing_enrichment(
        limit=batch_size,
        cycle=cycle,
    )

    if people_df.empty:
        logger.info("No people needing enrichment")
        return {"processed": 0, "success": 0, "failed": 0}

    logger.info(f"Processing {len(people_df)} people from enrichment queue")

    stats = {"processed": 0, "success": 0, "failed": 0, "tmdb_enriched": 0, "wiki_enriched": 0}

    tmdb_ids = [int(row["tmdb_id"]) for _, row in people_df.iterrows()]

    # --- Phase 1: Concurrent TMDB fetch ---
    enricher = PeopleEnricher()
    tmdb_results = await enricher.enrich_batch(tmdb_ids, max_concurrent=20)
    stats["tmdb_enriched"] = len(tmdb_results)
    stats["processed"] = len(tmdb_ids)
    stats["failed"] = len(tmdb_ids) - len(tmdb_results)

    if not tmdb_results:
        return stats

    # --- Phase 2: Sequential Wikipedia enrichment (rate-limited by client) ---
    enriched_items = []
    if not tmdb_only:
        for person in tmdb_results:
            try:
                wiki_data = await enricher._enrich_biography_from_wikipedia(
                    name=person["name"],
                    also_known_as=person.get("also_known_as"),
                    tmdb_biography=person.get("biography"),
                )
                if wiki_data:
                    person.update(wiki_data)
                    if person.get("bio_source") == "wikipedia":
                        stats["wiki_enriched"] += 1
            except Exception as e:
                logger.warning(f"Wikipedia enrichment failed for {person.get('name')}: {e}")

            person.pop("_cast_credits", None)
            person.pop("_crew_credits", None)
            enriched_items.append(person)
    else:
        for person in tmdb_results:
            person.pop("_cast_credits", None)
            person.pop("_crew_credits", None)
            enriched_items.append(person)

    stats["success"] = len(enriched_items)

    # Bulk upsert
    if enriched_items:
        enriched_df = pd.DataFrame(enriched_items)
        upsert_people_bulk(enriched_df)

        for item in enriched_items:
            update_people_enrichment_cycle(item["tmdb_id"])

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
        # Resolve active cycle: use --cycle if explicitly passed, else read from DB
        active_cycle = args.cycle
        if active_cycle is None:
            active_cycle = get_current_enrichment_cycle("people")
            logger.info(f"Auto-resolved enrichment cycle: {active_cycle}")

        stats = await enrich_from_enrichment_queue(
            batch_size=args.batch_size,
            cycle=active_cycle,
            tmdb_only=args.tmdb_only,
        )

        # Advance cycle tracker
        if stats["processed"] > 0:
            advance_enrichment_cycle("people", stats["processed"])
            logger.info(f"Advanced enrichment cycle for 'people' by {stats['processed']} items")
        
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

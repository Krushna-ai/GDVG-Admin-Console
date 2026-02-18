"""CLI entrypoint for TMDB ID harvesting.

Usage:
    python -m gdvg.harvester.run_harvest --content-type movie tv --strategy discover changes
    python -m gdvg.harvester.run_harvest --content-type movie --strategy sequential --start-id 1 --end-id 10000
"""

import asyncio
import argparse
import logging
import sys
from datetime import datetime

from gdvg.harvester.id_harvester import run_harvest


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
        description="Harvest TMDB IDs for mass import",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Harvest movies and TV with discover + changes strategies (default, fast)
  python -m gdvg.harvester.run_harvest
  
  # Harvest only movies with all strategies
  python -m gdvg.harvester.run_harvest --content-type movie --strategy discover sequential changes
  
  # Harvest with only discover strategy, limited regions
  python -m gdvg.harvester.run_harvest --strategy discover --regions KR CN JP
  
  # Harvest with only changes strategy (daily sync)
  python -m gdvg.harvester.run_harvest --strategy changes --days-back 1
        """,
    )
    
    parser.add_argument(
        "--content-type",
        nargs="+",
        choices=["movie", "tv"],
        default=["movie", "tv"],
        help="Content types to harvest (default: movie tv)",
    )
    
    parser.add_argument(
        "--strategy",
        nargs="+",
        choices=["discover", "sequential", "changes"],
        default=["discover", "changes"],
        help="Harvesting strategies to use (default: discover changes)",
    )
    
    parser.add_argument(
        "--regions",
        nargs="+",
        help="Specific regions to harvest (default: all from config)",
    )
    
    parser.add_argument(
        "--max-pages",
        type=int,
        default=500,
        help="Max pages per region/sort combo for discover strategy (default: 500)",
    )
    
    parser.add_argument(
        "--start-id",
        type=int,
        default=1,
        help="Start ID for sequential strategy (default: 1)",
    )
    
    parser.add_argument(
        "--end-id",
        type=int,
        help="End ID for sequential strategy (default: latest from API)",
    )
    
    parser.add_argument(
        "--days-back",
        type=int,
        default=1,
        help="Days to look back for changes strategy (default: 1)",
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't queue IDs, just show stats",
    )
    
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    
    return parser.parse_args()


async def main():
    """Main entrypoint."""
    args = parse_args()
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    logger.info("=" * 60)
    logger.info("TMDB ID Harvester")
    logger.info("=" * 60)
    logger.info(f"Content Types: {', '.join(args.content_type)}")
    logger.info(f"Strategies: {', '.join(args.strategy)}")
    if args.regions:
        logger.info(f"Regions: {', '.join(args.regions)}")
    logger.info(f"Max Pages (discover): {args.max_pages}")
    if "sequential" in args.strategy:
        logger.info(f"ID Range (sequential): {args.start_id} to {args.end_id or 'latest'}")
    if "changes" in args.strategy:
        logger.info(f"Days Back (changes): {args.days_back}")
    logger.info(f"Dry Run: {args.dry_run}")
    logger.info("=" * 60)
    
    start_time = datetime.now()
    
    try:
        # Run harvesting
        results = await run_harvest(
            content_types=args.content_type,
            strategies=args.strategy,
            max_pages=args.max_pages,
            regions=args.regions,
            days_back=args.days_back,
            start_id=args.start_id,
            end_id=args.end_id,
            dry_run=args.dry_run,
        )
        
        # Print results
        logger.info("")
        logger.info("=" * 60)
        logger.info("HARVEST COMPLETE")
        logger.info("=" * 60)
        
        for content_type, stats in results.items():
            logger.info(f"\n{content_type.upper()} Statistics:")
            logger.info(f"  Total Harvested:     {stats['total_harvested']:,}")
            logger.info(f"  New IDs Queued:      {stats['new_queued']:,}")
            logger.info(f"  Duplicates Skipped:  {stats['duplicates_skipped']:,}")
            if stats.get('discover_ids'):
                logger.info(f"  From Discover:       {stats['discover_ids']:,}")
            if stats.get('sequential_ids'):
                logger.info(f"  From Sequential:     {stats['sequential_ids']:,}")
            if stats.get('changes_ids'):
                logger.info(f"  From Changes:        {stats['changes_ids']:,}")
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"\nElapsed Time: {elapsed:.1f} seconds")
        logger.info("=" * 60)
        
        # Calculate totals
        total_harvested = sum(s['total_harvested'] for s in results.values())
        total_queued = sum(s['new_queued'] for s in results.values())
        
        logger.info(f"\nGrand Total: {total_harvested:,} IDs harvested, {total_queued:,} new IDs queued")
        
        return 0
        
    except Exception as e:
        logger.error(f"Harvest failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

"""CLI entrypoint for TMDB change sync.

Tracks recent TMDB changes and queues matching items for re-enrichment.

Usage:
    python -m gdvg.sync.run_sync_changes --days 1
    python -m gdvg.sync.run_sync_changes --type movie --days 2
"""

import asyncio
import argparse
import logging
import sys
from datetime import datetime

from gdvg.sync.change_tracker import (
    sync_all_changes,
    sync_content_changes,
    sync_people_changes,
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
        description="Sync TMDB changes to enrichment queue",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Sync all changes from last 24 hours
  python -m gdvg.sync.run_sync_changes
  
  # Sync last 2 days
  python -m gdvg.sync.run_sync_changes --days 2
  
  # Sync only movies
  python -m gdvg.sync.run_sync_changes --type movie
  
  # Sync only people
  python -m gdvg.sync.run_sync_changes --type people
        """,
    )
    
    parser.add_argument(
        "--days",
        type=int,
        default=1,
        help="Number of days to look back (default: 1)",
    )
    
    parser.add_argument(
        "--type",
        choices=["all", "movie", "tv", "people"],
        default="all",
        help="Type of changes to sync (default: all)",
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
    logger.info("TMDB Change Sync")
    logger.info("=" * 60)
    logger.info(f"Days to look back: {args.days}")
    logger.info(f"Sync type: {args.type}")
    logger.info("=" * 60)
    
    start_time = datetime.now()
    
    try:
        # Sync based on type
        if args.type == "all":
            stats = await sync_all_changes(days=args.days)
        elif args.type == "movie":
            stats = await sync_content_changes("movie", days=args.days)
        elif args.type == "tv":
            stats = await sync_content_changes("tv", days=args.days)
        else:  # people
            stats = await sync_people_changes(days=args.days)
        
        # Print results
        logger.info("")
        logger.info("=" * 60)
        logger.info("SYNC COMPLETE")
        logger.info("=" * 60)
        
        if args.type in ["all", "movie"]:
            logger.info(f"Movies Changed:  {stats.get('movies_changed', 0):,}")
            logger.info(f"Movies Queued:   {stats.get('movies_queued', 0):,}")
        
        if args.type in ["all", "tv"]:
            logger.info(f"TV Changed:      {stats.get('tv_changed', 0):,}")
            logger.info(f"TV Queued:       {stats.get('tv_queued', 0):,}")
        
        if args.type in ["all", "people"]:
            logger.info(f"People Changed:  {stats.get('people_changed', 0):,}")
            logger.info(f"People Queued:   {stats.get('people_queued', 0):,}")
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"\nElapsed Time: {elapsed:.1f} seconds")
        logger.info("=" * 60)
        
        return 0
        
    except Exception as e:
        logger.error(f"Sync failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

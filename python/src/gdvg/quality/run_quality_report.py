"""CLI entrypoint for data quality report generation.

Generates comprehensive quality reports for content and people data.

Usage:
    python -m gdvg.quality.run_quality_report
    python -m gdvg.quality.run_quality_report --save
"""

import argparse
import io
import json
import logging
import sys
from datetime import datetime

# Force UTF-8 output on Windows (avoids cp1252 UnicodeEncodeError for non-ASCII names)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from gdvg.quality.data_quality import DataQualityAnalyzer, generate_quality_report


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
        description="Generate data quality report",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate and print report
  python -m gdvg.quality.run_quality_report
  
  # Generate and save to database
  python -m gdvg.quality.run_quality_report --save
        """,
    )
    
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save report to database (already done in generate_quality_report)",
    )
    
    parser.add_argument(
        "--queue-poor-quality",
        action="store_true",
        help="After generating report, push poor-quality items back into enrichment_queue (priority 8)",
    )
    
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    
    return parser.parse_args()


def print_report(report: dict):
    """Print formatted report to console."""
    print("\n" + "=" * 80)
    print("DATA QUALITY REPORT")
    print("=" * 80)
    print(f"Generated: {report['generated_at']}")
    print("=" * 80)
    
    # Content quality
    content = report.get("content", {})
    if content.get("total_items", 0) > 0:
        print("\n[CONTENT] CONTENT QUALITY")
        print("-" * 80)
        print(f"Total Items: {content['total_items']:,}")
        print(f"  - Movies:   {content.get('content_by_type', {}).get('movies', 0):,}")
        print(f"  - TV Shows: {content.get('content_by_type', {}).get('tv_shows', 0):,}")
        print(f"\nAverage Completeness: {content.get('average_completeness', 0):.1f}%")
        
        print("\nCompleteness Distribution:")
        for range_name, count in content.get("completeness_distribution", {}).items():
            percentage = (count / content['total_items'] * 100) if content['total_items'] > 0 else 0
            print(f"  {range_name:>10}: {count:>6,} items ({percentage:>5.1f}%)")
        
        print("\nField Coverage:")
        for field, stats in content.get("field_coverage", {}).items():
            print(f"  {field:.<25} {stats['count']:>6,} ({stats['percentage']:>5.1f}%)")
        
        cast_crew = content.get("cast_crew_stats", {})
        print("\nCast & Crew Linkage:")
        print(f"  Total Cast Links:        {cast_crew.get('total_cast_links', 0):>6,}")
        print(f"  Total Crew Links:        {cast_crew.get('total_crew_links', 0):>6,}")
        print(f"  Content with Cast:       {cast_crew.get('content_with_cast', 0):>6,}")
        print(f"  Content with Crew:       {cast_crew.get('content_with_crew', 0):>6,}")
        
        high_priority = content.get("high_priority_items", [])
        if high_priority:
            print(f"\n[!] High Priority Items (Low Quality, Top {len(high_priority)}):")
            for item in high_priority[:10]:  # Show first 10
                print(f"  - {item.get('title', 'Unknown')[:50]:.<50} (Score: {item.get('completeness_score', 0):.0f}%)")
    
    # People quality
    people = report.get("people", {})
    if people.get("total_items", 0) > 0:
        print("\n\n[PEOPLE] PEOPLE QUALITY")
        print("-" * 80)
        print(f"Total Items: {people['total_items']:,}")
        print(f"\nAverage Completeness: {people.get('average_completeness', 0):.1f}%")
        
        print("\nCompleteness Distribution:")
        for range_name, count in people.get("completeness_distribution", {}).items():
            percentage = (count / people['total_items'] * 100) if people['total_items'] > 0 else 0
            print(f"  {range_name:>10}: {count:>6,} items ({percentage:>5.1f}%)")
        
        print("\nField Coverage:")
        for field, stats in people.get("field_coverage", {}).items():
            print(f"  {field:.<25} {stats['count']:>6,} ({stats['percentage']:>5.1f}%)")
        
        high_priority = people.get("high_priority_items", [])
        if high_priority:
            print(f"\n[!] High Priority Items (Low Quality, Top {len(high_priority)}):")
            for item in high_priority[:10]:  # Show first 10
                print(f"  - {item.get('name', 'Unknown')[:50]:.<50} (Score: {item.get('completeness_score', 0):.0f}%)")
    
    print("\n" + "=" * 80)


def main():
    """Main entrypoint."""
    args = parse_args()
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    start_time = datetime.now()
    
    try:
        # Generate report (also saves to DB via generate_quality_report)
        analyzer = DataQualityAnalyzer()
        report = analyzer.generate_report()
        analyzer.save_report(report)
        
        # Print report
        print_report(report)
        
        # Optionally queue poor-quality items for re-enrichment
        if args.queue_poor_quality:
            logger.info("Queuing poor-quality items for re-enrichment...")
            content_queued = analyzer.queue_poor_quality_content(
                report.get("content", {}).get("high_priority_items", [])
            )
            people_queued = analyzer.queue_poor_quality_people(
                report.get("people", {}).get("high_priority_items", [])
            )
            logger.info(f"Re-queued: {content_queued} content, {people_queued} people")
        
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"\nReport generated in {elapsed:.1f} seconds")
        print("Report saved to quality_reports table [OK]")
        
        return 0
        
    except Exception as e:
        logger.error(f"Error generating quality report: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())

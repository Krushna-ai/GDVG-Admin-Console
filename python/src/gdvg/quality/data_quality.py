"""Data quality analyzer using Pandas for comprehensive database analysis.

Analyzes entire content and people tables for:
- Missing fields (poster, overview, biography, profile_path, etc.)
- Completeness scores (0-100% per item)
- Coverage statistics (% of database with each field)
- High-priority items needing re-enrichment

Generates reports for monitoring data quality over time.
"""

import logging
from typing import Any, Optional
from datetime import datetime

import pandas as pd

from gdvg.clients.supabase_client import get_supabase
from gdvg.db.queue import bulk_add_to_enrichment_queue

logger = logging.getLogger(__name__)


class DataQualityAnalyzer:
    """Analyzes data quality across content and people tables."""
    
    def __init__(self):
        self.supabase = get_supabase()
        self.report = {
            "generated_at": datetime.utcnow().isoformat(),
            "content": {},
            "people": {},
        }
    
    def _fetch_all_content(self) -> pd.DataFrame:
        """Fetch all content from database using pagination (100 rows/page).

        Excludes large JSONB blobs (videos, images, watch_providers) — those
        are counted separately via _fetch_content_jsonb_counts().
        
        Returns:
            DataFrame with all content records
        """
        try:
            all_rows = []
            page_size = 100
            offset = 0

            while True:
                result = (
                    self.supabase.table("content")
                    .select(
                        "id,tmdb_id,content_type,title,popularity,"
                        "poster_path,overview,genres,backdrop_path,tagline,"
                        "imdb_id,content_rating"
                    )
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                if not result.data:
                    break
                all_rows.extend(result.data)
                if len(result.data) < page_size:
                    break
                offset += page_size

            return pd.DataFrame(all_rows) if all_rows else pd.DataFrame()
        
        except Exception as e:
            logger.error(f"Error fetching content: {e}")
            return pd.DataFrame()

    def _fetch_content_jsonb_counts(self) -> dict[str, int]:
        """Count non-empty values for large JSONB content columns separately."""
        counts = {"Videos": 0, "Images": 0, "Watch Providers": 0, "Keywords": 0}
        try:
            for field, label in [
                ("videos", "Videos"),
                ("images", "Images"),
                ("watch_providers", "Watch Providers"),
                ("keywords", "Keywords"),
            ]:
                # Count rows where the JSONB field is not null and not empty array/object
                result = (
                    self.supabase.table("content")
                    .select("id", count="exact")
                    .not_.is_(field, "null")
                    .execute()
                )
                counts[label] = result.count or 0
        except Exception as e:
            logger.warning(f"Error fetching content JSONB counts: {e}")
        return counts
    
    def _fetch_all_people(self) -> pd.DataFrame:
        """Fetch all people from database using pagination (100 rows/page).

        Excludes large JSONB blobs (images, combined_credits) — those
        are counted separately via _fetch_people_jsonb_counts().
        
        Returns:
            DataFrame with all people records
        """
        try:
            all_rows = []
            page_size = 100
            offset = 0

            while True:
                result = (
                    self.supabase.table("people")
                    .select(
                        "id,tmdb_id,name,popularity,"
                        "profile_path,biography,birthday,place_of_birth,"
                        "imdb_id"
                    )
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                if not result.data:
                    break
                all_rows.extend(result.data)
                if len(result.data) < page_size:
                    break
                offset += page_size

            return pd.DataFrame(all_rows) if all_rows else pd.DataFrame()
        
        except Exception as e:
            logger.error(f"Error fetching people: {e}")
            return pd.DataFrame()

    def _fetch_people_jsonb_counts(self) -> dict[str, int]:
        """Count non-empty values for large JSONB people columns separately."""
        counts = {"Also Known As": 0, "Images": 0, "Combined Credits": 0}
        try:
            for field, label in [
                ("also_known_as", "Also Known As"),
                ("images", "Images"),
                ("combined_credits", "Combined Credits"),
            ]:
                result = (
                    self.supabase.table("people")
                    .select("id", count="exact")
                    .not_.is_(field, "null")
                    .execute()
                )
                counts[label] = result.count or 0
        except Exception as e:
            logger.warning(f"Error fetching people JSONB counts: {e}")
        return counts
    
    def _fetch_cast_crew_stats(self) -> dict[str, Any]:
        """Fetch cast/crew linkage statistics.
        
        Returns:
            Dict with cast/crew stats
        """
        stats = {
            "total_cast_links": 0,
            "total_crew_links": 0,
            "content_with_cast": 0,
            "content_with_crew": 0,
        }
        
        try:
            # Count total cast links
            cast_result = (
                self.supabase.table("content_cast")
                .select("*", count="exact")
                .execute()
            )
            stats["total_cast_links"] = cast_result.count or 0
            
            # Count total crew links
            crew_result = (
                self.supabase.table("content_crew")
                .select("*", count="exact")
                .execute()
            )
            stats["total_crew_links"] = crew_result.count or 0
            
            # Count unique content with cast (content_cast has content_id UUID, not content_tmdb_id)
            cast_content = (
                self.supabase.table("content_cast")
                .select("content_id")
                .execute()
            )
            if cast_content.data:
                stats["content_with_cast"] = len(
                    {row["content_id"] for row in cast_content.data}
                )
            
            # Count unique content with crew
            crew_content = (
                self.supabase.table("content_crew")
                .select("content_id")
                .execute()
            )
            if crew_content.data:
                stats["content_with_crew"] = len(
                    {row["content_id"] for row in crew_content.data}
                )
        
        except Exception as e:
            logger.error(f"Error fetching cast/crew stats: {e}")
        
        return stats
    
    def analyze_content_quality(self) -> dict[str, Any]:
        """Analyze content data quality.
        
        Returns:
            Dict with content quality metrics
        """
        logger.info("Analyzing content quality...")
        
        content_df = self._fetch_all_content()
        
        if content_df.empty:
            return {"total_items": 0}
        
        total = len(content_df)
        
        # Define critical fields (present in DataFrame)
        critical_fields = {
            "poster_path": "Poster",
            "overview": "Overview",
            "genres": "Genres",
        }
        
        # Define optional fields present in DataFrame
        optional_fields_df = {
            "backdrop_path": "Backdrop",
            "tagline": "Tagline",
            "imdb_id": "IMDb ID",
            "content_rating": "Content Rating",
        }
        
        # Calculate field coverage from DataFrame columns
        field_coverage = {}
        
        for field, label in {**critical_fields, **optional_fields_df}.items():
            if field in content_df.columns:
                if field == "genres":
                    non_empty = content_df[field].apply(
                        lambda x: x is not None and isinstance(x, list) and len(x) > 0
                    ).sum()
                else:
                    non_empty = content_df[field].notna().sum()
                
                coverage = (non_empty / total * 100) if total > 0 else 0
                field_coverage[label] = {
                    "count": int(non_empty),
                    "percentage": round(coverage, 2),
                }
        
        # Merge JSONB counts (fetched separately to avoid timeout)
        jsonb_counts = self._fetch_content_jsonb_counts()
        for label, count in jsonb_counts.items():
            field_coverage[label] = {
                "count": count,
                "percentage": round(count / total * 100, 2) if total > 0 else 0,
            }
        
        # Calculate completeness scores (only from columns present in DataFrame)
        content_df["completeness_score"] = 0
        
        # Critical fields: 15 points each (45 total)
        for field in critical_fields.keys():
            if field in content_df.columns:
                if field == "genres":
                    content_df["completeness_score"] += content_df[field].apply(
                        lambda x: 15 if (x and len(x) > 0) else 0
                    )
                else:
                    content_df["completeness_score"] += content_df[field].notna().astype(int) * 15
        
        # Optional fields in DataFrame: 5 points each
        for field in optional_fields_df.keys():
            if field in content_df.columns:
                content_df["completeness_score"] += content_df[field].notna().astype(int) * 5
        
        # Cast/crew stats
        cast_crew_stats = self._fetch_cast_crew_stats()
        
        # Completeness distribution
        score_ranges = {
            "0-25%": (content_df["completeness_score"] <= 25).sum(),
            "26-50%": ((content_df["completeness_score"] > 25) & (content_df["completeness_score"] <= 50)).sum(),
            "51-75%": ((content_df["completeness_score"] > 50) & (content_df["completeness_score"] <= 75)).sum(),
            "76-100%": (content_df["completeness_score"] > 75).sum(),
        }
        
        # High-priority items (low completeness)
        low_quality = content_df[content_df["completeness_score"] < 50]
        high_priority_items = []
        
        if not low_quality.empty:
            # Get top 100 most popular low-quality items
            if "popularity" in low_quality.columns:
                top_low = low_quality.nlargest(100, "popularity")
            else:
                top_low = low_quality.head(100)
            
            high_priority_items = top_low[["tmdb_id", "content_type", "title", "completeness_score"]].to_dict("records")
        
        return {
            "total_items": int(total),
            "field_coverage": field_coverage,
            "average_completeness": round(content_df["completeness_score"].mean(), 2),
            "completeness_distribution": {k: int(v) for k, v in score_ranges.items()},
            "cast_crew_stats": cast_crew_stats,
            "high_priority_items": high_priority_items,
            "content_by_type": {
                "movies": int((content_df["content_type"] == "movie").sum()),
                "tv_shows": int((content_df["content_type"] == "tv").sum()),
            },
        }
    
    def analyze_people_quality(self) -> dict[str, Any]:
        """Analyze people data quality.
        
        Returns:
            Dict with people quality metrics
        """
        logger.info("Analyzing people quality...")
        
        people_df = self._fetch_all_people()
        
        if people_df.empty:
            return {"total_items": 0}
        
        total = len(people_df)
        
        # Define critical fields (present in DataFrame)
        critical_fields = {
            "profile_path": "Profile Photo",
            "biography": "Biography",
        }
        
        # Define optional fields present in DataFrame
        optional_fields_df = {
            "birthday": "Birthday",
            "place_of_birth": "Place of Birth",
            "imdb_id": "IMDb ID",
            "wikidata_id": "Wikidata ID",
        }
        
        # Calculate field coverage from DataFrame columns
        field_coverage = {}
        
        for field, label in {**critical_fields, **optional_fields_df}.items():
            if field in people_df.columns:
                non_empty = people_df[field].notna().sum()
                coverage = (non_empty / total * 100) if total > 0 else 0
                field_coverage[label] = {
                    "count": int(non_empty),
                    "percentage": round(coverage, 2),
                }
        
        # Merge JSONB counts (fetched separately to avoid timeout)
        jsonb_counts = self._fetch_people_jsonb_counts()
        for label, count in jsonb_counts.items():
            field_coverage[label] = {
                "count": count,
                "percentage": round(count / total * 100, 2) if total > 0 else 0,
            }
        
        # Calculate completeness scores (only from columns present in DataFrame)
        people_df["completeness_score"] = 0
        
        # Critical fields: 30 points each (60 total)
        for field in critical_fields.keys():
            if field in people_df.columns:
                people_df["completeness_score"] += people_df[field].notna().astype(int) * 30
        
        # Optional fields in DataFrame: 5 points each
        for field in optional_fields_df.keys():
            if field in people_df.columns:
                people_df["completeness_score"] += people_df[field].notna().astype(int) * 5
        
        # Completeness distribution
        score_ranges = {
            "0-25%": (people_df["completeness_score"] <= 25).sum(),
            "26-50%": ((people_df["completeness_score"] > 25) & (people_df["completeness_score"] <= 50)).sum(),
            "51-75%": ((people_df["completeness_score"] > 50) & (people_df["completeness_score"] <= 75)).sum(),
            "76-100%": (people_df["completeness_score"] > 75).sum(),
        }
        
        # High-priority items
        low_quality = people_df[people_df["completeness_score"] < 50]
        high_priority_items = []
        
        if not low_quality.empty:
            if "popularity" in low_quality.columns:
                top_low = low_quality.nlargest(50, "popularity")
            else:
                top_low = low_quality.head(50)
            
            high_priority_items = top_low[["tmdb_id", "name", "completeness_score"]].to_dict("records")
        
        return {
            "total_items": int(total),
            "field_coverage": field_coverage,
            "average_completeness": round(people_df["completeness_score"].mean(), 2),
            "completeness_distribution": {k: int(v) for k, v in score_ranges.items()},
            "high_priority_items": high_priority_items,
        }
    
    def generate_report(self) -> dict[str, Any]:
        """Generate comprehensive data quality report.
        
        Returns:
            Complete quality report
        """
        logger.info("Generating data quality report...")
        
        self.report["content"] = self.analyze_content_quality()
        self.report["people"] = self.analyze_people_quality()
        
        return self.report
    
    def save_report(self, report: dict[str, Any]) -> bool:
        """Save report to quality_reports table.

        Inserts two rows — one for 'content', one for 'people' — mapped to
        the actual quality_reports schema columns.

        Args:
            report: Quality report dict

        Returns:
            True if successful
        """
        try:
            rows = []

            for entity_type in ("content", "people"):
                section = report.get(entity_type, {})
                total_checked = section.get("total_items", 0)
                if total_checked == 0:
                    continue

                dist = section.get("completeness_distribution", {})
                total_complete = dist.get("76-100%", 0)
                total_issues = dist.get("0-25%", 0) + dist.get("26-50%", 0)

                rows.append({
                    "report_type": entity_type,
                    "total_checked": total_checked,
                    "total_complete": total_complete,
                    "total_issues": total_issues,
                    "issues_by_field": section.get("field_coverage", {}),
                    "priority_items": section.get("high_priority_items", []),
                })

            if rows:
                self.supabase.table("quality_reports").insert(rows).execute()
                logger.info(f"Quality report saved ({len(rows)} rows) to quality_reports table")
            return True

        except Exception as e:
            logger.error(f"Error saving quality report: {e}")
            return False

    def queue_poor_quality_content(self, high_priority_items: list[dict]) -> int:
        """Push poor-quality content items back into enrichment_queue.

        Args:
            high_priority_items: List of dicts with 'tmdb_id' and 'content_type'

        Returns:
            Number of items queued
        """
        if not high_priority_items:
            return 0

        total_queued = 0
        # Group by content_type so bulk_add_to_enrichment_queue gets the right filter
        by_type: dict[str, list[int]] = {}
        for item in high_priority_items:
            ct = item.get("content_type", "movie")
            by_type.setdefault(ct, []).append(int(item["tmdb_id"]))

        for content_type, tmdb_ids in by_type.items():
            queued = bulk_add_to_enrichment_queue(
                tmdb_ids=tmdb_ids,
                queue_type="content",
                content_type=content_type,
                priority=8,
            )
            total_queued += queued
            logger.info(f"Queued {queued} poor-quality {content_type} items for re-enrichment")

        return total_queued

    def queue_poor_quality_people(self, high_priority_items: list[dict]) -> int:
        """Push poor-quality people items back into enrichment_queue.

        Args:
            high_priority_items: List of dicts with 'tmdb_id'

        Returns:
            Number of items queued
        """
        if not high_priority_items:
            return 0

        tmdb_ids = [int(item["tmdb_id"]) for item in high_priority_items]
        queued = bulk_add_to_enrichment_queue(
            tmdb_ids=tmdb_ids,
            queue_type="people",
            priority=8,
        )
        logger.info(f"Queued {queued} poor-quality people for re-enrichment")
        return queued


def generate_quality_report() -> dict[str, Any]:
    """Generate and save quality report (convenience function).
    
    Returns:
        Quality report dict
    """
    analyzer = DataQualityAnalyzer()
    report = analyzer.generate_report()
    analyzer.save_report(report)
    return report

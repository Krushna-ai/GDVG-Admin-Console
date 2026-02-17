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
        """Fetch all content from database.
        
        Returns:
            DataFrame with all content records
        """
        try:
            result = (
                self.supabase.table("content")
                .select("*")
                .execute()
            )
            
            if result.data:
                return pd.DataFrame(result.data)
            return pd.DataFrame()
        
        except Exception as e:
            logger.error(f"Error fetching content: {e}")
            return pd.DataFrame()
    
    def _fetch_all_people(self) -> pd.DataFrame:
        """Fetch all people from database.
        
        Returns:
            DataFrame with all people records
        """
        try:
            result = (
                self.supabase.table("people")
                .select("*")
                .execute()
            )
            
            if result.data:
                return pd.DataFrame(result.data)
            return pd.DataFrame()
        
        except Exception as e:
            logger.error(f"Error fetching people: {e}")
            return pd.DataFrame()
    
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
            
            # Count unique content with cast
            cast_content = (
                self.supabase.table("content_cast")
                .select("content_tmdb_id,content_type")
                .execute()
            )
            if cast_content.data:
                cast_df = pd.DataFrame(cast_content.data)
                stats["content_with_cast"] = len(
                    cast_df.drop_duplicates(subset=["content_tmdb_id", "content_type"])
                )
            
            # Count unique content with crew
            crew_content = (
                self.supabase.table("content_crew")
                .select("content_tmdb_id,content_type")
                .execute()
            )
            if crew_content.data:
                crew_df = pd.DataFrame(crew_content.data)
                stats["content_with_crew"] = len(
                    crew_df.drop_duplicates(subset=["content_tmdb_id", "content_type"])
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
        
        # Define critical fields
        critical_fields = {
            "poster_path": "Poster",
            "overview": "Overview",
            "genres": "Genres",
        }
        
        # Define optional but important fields
        optional_fields = {
            "backdrop_path": "Backdrop",
            "tagline": "Tagline",
            "keywords": "Keywords",
            "videos": "Videos",
            "images": "Images",
            "watch_providers": "Watch Providers",
            "imdb_id": "IMDb ID",
            "content_rating": "Content Rating",
        }
        
        # Calculate field coverage
        field_coverage = {}
        
        for field, label in {**critical_fields, **optional_fields}.items():
            if field in content_df.columns:
                # Count non-null, non-empty values
                if field in ["genres", "keywords", "videos", "images", "watch_providers"]:
                    # For JSONB/array fields, check if not null and not empty
                    non_empty = content_df[field].apply(
                        lambda x: x is not None and (
                            (isinstance(x, list) and len(x) > 0) or
                            (isinstance(x, dict) and len(x) > 0)
                        )
                    ).sum()
                else:
                    non_empty = content_df[field].notna().sum()
                
                coverage = (non_empty / total * 100) if total > 0 else 0
                field_coverage[label] = {
                    "count": int(non_empty),
                    "percentage": round(coverage, 2),
                }
        
        # Calculate completeness scores
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
        
        # Optional fields: 5 points each (max 55)
        for field in optional_fields.keys():
            if field in content_df.columns:
                if field in ["keywords", "videos", "images", "watch_providers"]:
                    content_df["completeness_score"] += content_df[field].apply(
                        lambda x: 5 if (x and len(x) > 0) else 0
                    )
                else:
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
        
        # Define critical fields
        critical_fields = {
            "profile_path": "Profile Photo",
            "biography": "Biography",
        }
        
        # Define optional fields
        optional_fields = {
            "birthday": "Birthday",
            "place_of_birth": "Place of Birth",
            "also_known_as": "Also Known As",
            "images": "Images",
            "combined_credits": "Combined Credits",
            "imdb_id": "IMDb ID",
            "wikidata_id": "Wikidata ID",
        }
        
        # Calculate field coverage
        field_coverage = {}
        
        for field, label in {**critical_fields, **optional_fields}.items():
            if field in people_df.columns:
                if field in ["also_known_as", "images", "combined_credits"]:
                    non_empty = people_df[field].apply(
                        lambda x: x is not None and (
                            (isinstance(x, list) and len(x) > 0) or
                            (isinstance(x, dict) and len(x) > 0)
                        )
                    ).sum()
                else:
                    non_empty = people_df[field].notna().sum()
                
                coverage = (non_empty / total * 100) if total > 0 else 0
                field_coverage[label] = {
                    "count": int(non_empty),
                    "percentage": round(coverage, 2),
                }
        
        # Calculate completeness scores
        people_df["completeness_score"] = 0
        
        # Critical fields: 30 points each (60 total)
        for field in critical_fields.keys():
            if field in people_df.columns:
                people_df["completeness_score"] += people_df[field].notna().astype(int) * 30
        
        # Optional fields: 5 points each (max 40)
        for field in optional_fields.keys():
            if field in people_df.columns:
                if field in ["also_known_as", "images", "combined_credits"]:
                    people_df["completeness_score"] += people_df[field].apply(
                        lambda x: 5 if (x and len(x) > 0) else 0
                    )
                else:
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
        
        Args:
            report: Quality report dict
            
        Returns:
            True if successful
        """
        try:
            self.supabase.table("quality_reports").insert({
                "generated_at": report["generated_at"],
                "report_data": report,
            }).execute()
            
            logger.info("Quality report saved to database")
            return True
        
        except Exception as e:
            logger.error(f"Error saving quality report: {e}")
            return False


def generate_quality_report() -> dict[str, Any]:
    """Generate and save quality report (convenience function).
    
    Returns:
        Quality report dict
    """
    analyzer = DataQualityAnalyzer()
    report = analyzer.generate_report()
    analyzer.save_report(report)
    return report

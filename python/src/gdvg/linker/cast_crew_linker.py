"""Cast and crew linker for connecting people to content.

Processes TMDB credits in bulk using Pandas DataFrames:
1. Upserts all cast/crew people (batch)
2. Creates content_cast links (batch)
3. Creates content_crew links (batch)

FAR more efficient than one-by-one processing (200+ cast, 100+ crew per content).
"""

import logging
from typing import Any, Literal

import pandas as pd

from gdvg.clients.supabase_client import get_supabase
from gdvg.db.people import upsert_people_bulk
from gdvg.db.content import get_all_content_tmdb_ids

logger = logging.getLogger(__name__)


class CastCrewLinker:
    """Links cast and crew to content via content_cast and content_crew tables."""
    
    def __init__(self):
        self.supabase = get_supabase()
        self.stats = {
            "people_upserted": 0,
            "cast_links_created": 0,
            "crew_links_created": 0,
        }
    
    def _prepare_people_from_credits(
        self,
        cast: list[dict[str, Any]],
        crew: list[dict[str, Any]],
    ) -> pd.DataFrame:
        """Extract unique people from cast and crew credits.
        
        Args:
            cast: List of cast credits
            crew: List of crew credits
            
        Returns:
            DataFrame with unique people to upsert
        """
        people = []
        
        # Extract from cast
        for member in cast:
            if member.get("tmdb_id"):
                people.append({
                    "tmdb_id": member["tmdb_id"],
                    "name": member.get("name"),
                    "profile_path": member.get("profile_path"),
                })
        
        # Extract from crew
        for member in crew:
            if member.get("tmdb_id"):
                people.append({
                    "tmdb_id": member["tmdb_id"],
                    "name": member.get("name"),
                    "profile_path": member.get("profile_path"),
                })
        
        if not people:
            return pd.DataFrame()
        
        # Create DataFrame and deduplicate
        people_df = pd.DataFrame(people)
        people_df = people_df.drop_duplicates(subset=["tmdb_id"])
        
        return people_df
    
    def _prepare_cast_links(
        self,
        content_tmdb_id: int,
        content_type: Literal["movie", "tv"],
        cast: list[dict[str, Any]],
    ) -> pd.DataFrame:
        """Prepare content_cast link records.
        
        Args:
            content_tmdb_id: Content TMDB ID
            content_type: 'movie' or 'tv'
            cast: List of cast credits
            
        Returns:
            DataFrame with cast links
        """
        if not cast:
            return pd.DataFrame()
        
        links = []
        for member in cast:
            if member.get("tmdb_id"):
                links.append({
                    "content_tmdb_id": content_tmdb_id,
                    "content_type": content_type,
                    "person_tmdb_id": member["tmdb_id"],
                    "character": member.get("character"),
                    "order": member.get("order", 999),  # Default high order if missing
                })
        
        return pd.DataFrame(links)
    
    def _prepare_crew_links(
        self,
        content_tmdb_id: int,
        content_type: Literal["movie", "tv"],
        crew: list[dict[str, Any]],
    ) -> pd.DataFrame:
        """Prepare content_crew link records.
        
        Args:
            content_tmdb_id: Content TMDB ID
            content_type: 'movie' or 'tv'
            crew: List of crew credits
            
        Returns:
            DataFrame with crew links
        """
        if not crew:
            return pd.DataFrame()
        
        links = []
        for member in crew:
            if member.get("tmdb_id"):
                links.append({
                    "content_tmdb_id": content_tmdb_id,
                    "content_type": content_type,
                    "person_tmdb_id": member["tmdb_id"],
                    "job": member.get("job"),
                    "department": member.get("department"),
                })
        
        return pd.DataFrame(links)
    
    def _upsert_cast_links(self, cast_df: pd.DataFrame) -> int:
        """Bulk upsert cast links to content_cast table.
        
        Args:
            cast_df: DataFrame with cast link records
            
        Returns:
            Number of links created
        """
        if cast_df.empty:
            return 0
        
        # Convert to list of dicts for Supabase
        records = cast_df.to_dict("records")
        
        # Batch upsert (500 at a time)
        batch_size = 500
        total_upserted = 0
        
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            
            try:
                result = (
                    self.supabase.table("content_cast")
                    .upsert(
                        batch,
                        on_conflict="content_tmdb_id,content_type,person_tmdb_id",
                    )
                    .execute()
                )
                total_upserted += len(batch)
            except Exception as e:
                logger.error(f"Error upserting cast links: {e}")
        
        return total_upserted
    
    def _upsert_crew_links(self, crew_df: pd.DataFrame) -> int:
        """Bulk upsert crew links to content_crew table.
        
        Args:
            crew_df: DataFrame with crew link records
            
        Returns:
            Number of links created
        """
        if crew_df.empty:
            return 0
        
        # Convert to list of dicts for Supabase
        records = crew_df.to_dict("records")
        
        # Batch upsert (500 at a time)
        batch_size = 500
        total_upserted = 0
        
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            
            try:
                result = (
                    self.supabase.table("content_crew")
                    .upsert(
                        batch,
                        on_conflict="content_tmdb_id,content_type,person_tmdb_id,job",
                    )
                    .execute()
                )
                total_upserted += len(batch)
            except Exception as e:
                logger.error(f"Error upserting crew links: {e}")
        
        return total_upserted
    
    def link_credits_to_content(
        self,
        content_tmdb_id: int,
        content_type: Literal["movie", "tv"],
        cast: list[dict[str, Any]],
        crew: list[dict[str, Any]],
    ) -> dict[str, int]:
        """Link cast and crew to content (bulk operation).
        
        Process:
        1. Extract unique people from credits
        2. Bulk upsert people to people table
        3. Bulk create cast links in content_cast
        4. Bulk create crew links in content_crew
        
        Args:
            content_tmdb_id: Content TMDB ID
            content_type: 'movie' or 'tv'
            cast: List of cast credits from TMDB
            crew: List of crew credits from TMDB
            
        Returns:
            Statistics dict
        """
        stats = {
            "people_upserted": 0,
            "cast_links": 0,
            "crew_links": 0,
        }
        
        # Step 1: Extract and upsert people
        people_df = self._prepare_people_from_credits(cast, crew)
        
        if not people_df.empty:
            upsert_people_bulk(people_df)
            stats["people_upserted"] = len(people_df)
            self.stats["people_upserted"] += len(people_df)
        
        # Step 2: Create cast links
        cast_df = self._prepare_cast_links(content_tmdb_id, content_type, cast)
        if not cast_df.empty:
            cast_count = self._upsert_cast_links(cast_df)
            stats["cast_links"] = cast_count
            self.stats["cast_links_created"] += cast_count
        
        # Step 3: Create crew links
        crew_df = self._prepare_crew_links(content_tmdb_id, content_type, crew)
        if not crew_df.empty:
            crew_count = self._upsert_crew_links(crew_df)
            stats["crew_links"] = crew_count
            self.stats["crew_links_created"] += crew_count
        
        return stats
    
    def link_person_to_content(
        self,
        person_tmdb_id: int,
        person_name: str,
        cast_credits: list[dict[str, Any]],
        crew_credits: list[dict[str, Any]],
    ) -> dict[str, int]:
        """Link a person to existing content using their combined_credits.
        
        Reverse linkage: matches person's filmography against our content table
        and creates missing content_cast/content_crew links.
        
        This fills gaps where content exists but cast/crew links are missing.
        
        Process:
        1. Get all existing content TMDB IDs from our DB
        2. Match person's credits against existing content
        3. Create cast links for matched content
        4. Create crew links for matched content
        
        Args:
            person_tmdb_id: Person's TMDB ID
            person_name: Person's name
            cast_credits: List of cast credits from combined_credits
            crew_credits: List of crew credits from combined_credits
            
        Returns:
            Statistics dict with links created
        """
        stats = {
            "cast_links": 0,
            "crew_links": 0,
            "matched_content": 0,
        }
        
        # Get all existing content TMDB IDs
        existing_content = get_all_content_tmdb_ids()
        if existing_content.empty:
            logger.warning("No existing content in database")
            return stats
        
        # Create lookup sets for fast matching
        movie_ids = set(
            existing_content[
                existing_content["content_type"] == "movie"
            ]["tmdb_id"].tolist()
        )
        tv_ids = set(
            existing_content[
                existing_content["content_type"] == "tv"
            ]["tmdb_id"].tolist()
        )
        
        # Prepare cast links for matched content
        cast_links = []
        for credit in cast_credits:
            tmdb_id = credit.get("tmdb_id")
            media_type = credit.get("media_type")
            
            if not tmdb_id or not media_type:
                continue
            
            # Check if content exists in our DB
            content_type = "movie" if media_type == "movie" else "tv"
            content_exists = (
                tmdb_id in movie_ids if content_type == "movie"
                else tmdb_id in tv_ids
            )
            
            if content_exists:
                cast_links.append({
                    "content_tmdb_id": tmdb_id,
                    "content_type": content_type,
                    "person_tmdb_id": person_tmdb_id,
                    "character": credit.get("character"),
                    "order": 999,  # No order info in combined_credits
                })
        
        # Prepare crew links for matched content
        crew_links = []
        for credit in crew_credits:
            tmdb_id = credit.get("tmdb_id")
            media_type = credit.get("media_type")
            job = credit.get("job")
            
            if not tmdb_id or not media_type or not job:
                continue
            
            # Check if content exists in our DB
            content_type = "movie" if media_type == "movie" else "tv"
            content_exists = (
                tmdb_id in movie_ids if content_type == "movie"
                else tmdb_id in tv_ids
            )
            
            if content_exists:
                crew_links.append({
                    "content_tmdb_id": tmdb_id,
                    "content_type": content_type,
                    "person_tmdb_id": person_tmdb_id,
                    "job": job,
                    "department": credit.get("department"),
                })
        
        # Bulk create cast links
        if cast_links:
            cast_df = pd.DataFrame(cast_links)
            cast_count = self._upsert_cast_links(cast_df)
            stats["cast_links"] = cast_count
            self.stats["cast_links_created"] += cast_count
        
        # Bulk create crew links
        if crew_links:
            crew_df = pd.DataFrame(crew_links)
            crew_count = self._upsert_crew_links(crew_df)
            stats["crew_links"] = crew_count
            self.stats["crew_links_created"] += crew_count
        
        stats["matched_content"] = len(set(
            [link["content_tmdb_id"] for link in cast_links] +
            [link["content_tmdb_id"] for link in crew_links]
        ))
        
        return stats
    
    def link_credits_bulk(
        self,
        content_credits: list[dict[str, Any]],
    ) -> dict[str, int]:
        """Process credits for multiple content items in bulk.
        
        Args:
            content_credits: List of dicts with:
                - content_tmdb_id
                - content_type
                - cast (list)
                - crew (list)
            
        Returns:
            Aggregate statistics
        """
        for item in content_credits:
            self.link_credits_to_content(
                content_tmdb_id=item["content_tmdb_id"],
                content_type=item["content_type"],
                cast=item.get("cast", []),
                crew=item.get("crew", []),
            )
        
        return self.stats


def link_content_credits(
    content_tmdb_id: int,
    content_type: Literal["movie", "tv"],
    cast: list[dict[str, Any]],
    crew: list[dict[str, Any]],
) -> dict[str, int]:
    """Link cast and crew to content (convenience function).
    
    Args:
        content_tmdb_id: Content TMDB ID
        content_type: 'movie' or 'tv'
        cast: List of cast credits
        crew: List of crew credits
        
    Returns:
        Statistics dict
    """
    linker = CastCrewLinker()
    return linker.link_credits_to_content(
        content_tmdb_id,
        content_type,
        cast,
        crew,
    )


def link_multiple_content_credits(
    content_credits: list[dict[str, Any]],
) -> dict[str, int]:
    """Process credits for multiple content items (convenience function).
    
    Args:
        content_credits: List of content credit dicts
        
    Returns:
        Aggregate statistics
    """
    linker = CastCrewLinker()
    return linker.link_credits_bulk(content_credits)


def link_person_credits(
    person_tmdb_id: int,
    person_name: str,
    cast_credits: list[dict[str, Any]],
    crew_credits: list[dict[str, Any]],
) -> dict[str, int]:
    """Reverse-link person to existing content (convenience function).
    
    Matches person's filmography against existing content and creates
    missing cast/crew links.
    
    Args:
        person_tmdb_id: Person's TMDB ID
        person_name: Person's name
        cast_credits: List of cast credits from combined_credits
        crew_credits: List of crew credits from combined_credits
        
    Returns:
        Statistics dict
    """
    linker = CastCrewLinker()
    return linker.link_person_to_content(
        person_tmdb_id,
        person_name,
        cast_credits,
        crew_credits,
    )

"""People table database operations with Pandas DataFrames."""

from typing import Optional
import pandas as pd
from gdvg.clients.supabase_client import get_supabase
from gdvg.config import DB_BATCH_SIZE_UPSERT, DB_BATCH_SIZE_READ


def get_people_by_tmdb_ids(tmdb_ids: list[int]) -> pd.DataFrame:
    """Fetch people by TMDB IDs, returns Pandas DataFrame.
    
    Args:
        tmdb_ids: List of TMDB person IDs to fetch
        
    Returns:
        DataFrame with people rows, empty if none found
    """
    if not tmdb_ids:
        return pd.DataFrame()
    
    supabase = get_supabase()
    response = supabase.table("people").select("*").in_("tmdb_id", tmdb_ids).execute()
    
    if not response.data:
        return pd.DataFrame()
    
    return pd.DataFrame(response.data)


def get_all_people_tmdb_ids() -> set[int]:
    """Get all existing TMDB IDs from people table.
    
    Useful for deduplication during imports.
    
    Returns:
        Set of TMDB person IDs
    """
    supabase = get_supabase()
    
    all_ids: set[int] = set()
    offset = 0
    
    while True:
        response = supabase.table("people").select(
            "tmdb_id"
        ).range(offset, offset + DB_BATCH_SIZE_READ - 1).execute()
        
        if not response.data:
            break
        
        batch_ids = {row["tmdb_id"] for row in response.data}
        all_ids.update(batch_ids)
        
        if len(response.data) < DB_BATCH_SIZE_READ:
            break
        
        offset += DB_BATCH_SIZE_READ
    
    return all_ids


def upsert_people_bulk(people_df: pd.DataFrame) -> int:
    """Bulk upsert people from Pandas DataFrame.
    
    Upserts based on tmdb_id uniqueness.
    Processes in batches to avoid payload size limits.
    
    Args:
        people_df: DataFrame with people data matching DB schema
        
    Returns:
        Number of rows upserted
    """
    if people_df.empty:
        return 0
    
    supabase = get_supabase()
    total_upserted = 0
    
    # Convert DataFrame to list of dicts, replacing NaN with None
    records = people_df.where(pd.notnull(people_df), None).to_dict("records")
    
    # Process in batches
    for i in range(0, len(records), DB_BATCH_SIZE_UPSERT):
        batch = records[i:i + DB_BATCH_SIZE_UPSERT]
        
        # Upsert with conflict resolution on tmdb_id
        supabase.table("people").upsert(
            batch,
            on_conflict="tmdb_id"
        ).execute()
        
        total_upserted += len(batch)
    
    return total_upserted


def get_people_needing_enrichment(
    limit: int = 300,
    cycle: Optional[int] = None
) -> pd.DataFrame:
    """Get people that need enrichment, returns DataFrame.
    
    Prioritizes people with missing data (no biography, no profile photo).
    Uses enrichment_cycle for round-robin processing.
    
    Args:
        limit: Max number of people to return
        cycle: Optional enrichment cycle (0-8) for round-robin
        
    Returns:
        DataFrame with people needing enrichment
    """
    supabase = get_supabase()
    
    query = supabase.table("people").select("*").or_(
        "biography.is.null,"
        "profile_path.is.null,"
        "birthday.is.null,"
        "wikipedia_url.is.null"
    )
    
    if cycle is not None:
        query = query.eq("enrichment_cycle", cycle)
    
    response = query.limit(limit).execute()
    
    if not response.data:
        return pd.DataFrame()
    
    return pd.DataFrame(response.data)


def update_people_enrichment_cycle(people_ids: list[str], new_cycle: int) -> None:
    """Update enrichment cycle for people.
    
    Args:
        people_ids: List of people database IDs (UUIDs)
        new_cycle: New cycle number (0-8)
    """
    if not people_ids:
        return
    
    supabase = get_supabase()
    
    for i in range(0, len(people_ids), DB_BATCH_SIZE_UPSERT):
        batch_ids = people_ids[i:i + DB_BATCH_SIZE_UPSERT]
        
        supabase.table("people").update(
            {"enrichment_cycle": new_cycle}
        ).in_("id", batch_ids).execute()


def get_people_stats() -> dict:
    """Get people table statistics.
    
    Returns:
        Dict with total count, incomplete count, etc.
    """
    supabase = get_supabase()
    
    # Total count
    total_response = supabase.table("people").select("id", count="exact").execute()
    total = total_response.count or 0
    
    # Count with missing data
    incomplete_response = supabase.table("people").select(
        "id", count="exact"
    ).or_(
        "biography.is.null,"
        "profile_path.is.null"
    ).execute()
    incomplete = incomplete_response.count or 0
    
    return {
        "total": total,
        "incomplete": incomplete,
        "complete": total - incomplete,
    }

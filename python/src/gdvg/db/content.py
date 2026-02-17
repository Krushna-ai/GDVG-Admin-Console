"""Content table database operations with Pandas DataFrames."""

from typing import Optional, Literal
import pandas as pd
from gdvg.clients.supabase_client import get_supabase
from gdvg.config import DB_BATCH_SIZE_UPSERT, DB_BATCH_SIZE_READ


ContentType = Literal["movie", "tv"]


def get_content_by_tmdb_ids(
    tmdb_ids: list[int],
    content_type: Optional[ContentType] = None
) -> pd.DataFrame:
    """Fetch content by TMDB IDs, returns Pandas DataFrame.
    
    Args:
        tmdb_ids: List of TMDB IDs to fetch
        content_type: Optional filter by 'movie' or 'tv'
        
    Returns:
        DataFrame with content rows, empty if none found
    """
    if not tmdb_ids:
        return pd.DataFrame()
    
    supabase = get_supabase()
    query = supabase.table("content").select("*").in_("tmdb_id", tmdb_ids)
    
    if content_type:
        query = query.eq("content_type", content_type)
    
    response = query.execute()
    
    if not response.data:
        return pd.DataFrame()
    
    return pd.DataFrame(response.data)


def get_all_content_tmdb_ids(content_type: Optional[ContentType] = None) -> set[int]:
    """Get all existing TMDB IDs from content table.
    
    Useful for deduplication during mass imports.
    
    Args:
        content_type: Optional filter by 'movie' or 'tv'
        
    Returns:
        Set of TMDB IDs
    """
    supabase = get_supabase()
    
    # Fetch in batches to avoid memory issues
    all_ids: set[int] = set()
    offset = 0
    
    while True:
        query = supabase.table("content").select("tmdb_id")
        
        if content_type:
            query = query.eq("content_type", content_type)
        
        response = query.range(offset, offset + DB_BATCH_SIZE_READ - 1).execute()
        
        if not response.data:
            break
        
        batch_ids = {row["tmdb_id"] for row in response.data}
        all_ids.update(batch_ids)
        
        if len(response.data) < DB_BATCH_SIZE_READ:
            break
        
        offset += DB_BATCH_SIZE_READ
    
    return all_ids


def upsert_content_bulk(content_df: pd.DataFrame) -> int:
    """Bulk upsert content from Pandas DataFrame.
    
    Upserts based on (tmdb_id, content_type) uniqueness.
    Processes in batches to avoid payload size limits.
    
    Args:
        content_df: DataFrame with content data matching DB schema
        
    Returns:
        Number of rows upserted
    """
    if content_df.empty:
        return 0
    
    supabase = get_supabase()
    total_upserted = 0
    
    # Convert DataFrame to list of dicts, replacing NaN with None
    records = content_df.where(pd.notnull(content_df), None).to_dict("records")
    
    # Process in batches
    for i in range(0, len(records), DB_BATCH_SIZE_UPSERT):
        batch = records[i:i + DB_BATCH_SIZE_UPSERT]
        
        # Upsert with conflict resolution on tmdb_id + content_type
        supabase.table("content").upsert(
            batch,
            on_conflict="tmdb_id,content_type"
        ).execute()
        
        total_upserted += len(batch)
    
    return total_upserted


def get_content_needing_enrichment(
    limit: int = 500,
    cycle: Optional[int] = None,
    content_type: Optional[ContentType] = None
) -> pd.DataFrame:
    """Get content items that need enrichment, returns DataFrame.
    
    Prioritizes items with missing data (no poster, no overview, etc).
    Uses enrichment_cycle for round-robin processing.
    
    Args:
        limit: Max number of items to return
        cycle: Optional enrichment cycle (0-8) for round-robin
        content_type: Optional filter by 'movie' or 'tv'
        
    Returns:
        DataFrame with content items needing enrichment
    """
    supabase = get_supabase()
    
    # Build query for incomplete content
    query = supabase.table("content").select("*").or_(
        "poster_path.is.null,"
        "overview.is.null,"
        "backdrop_path.is.null,"
        "videos.is.null,"
        "images.is.null"
    )
    
    if cycle is not None:
        query = query.eq("enrichment_cycle", cycle)
    
    if content_type:
        query = query.eq("content_type", content_type)
    
    response = query.limit(limit).execute()
    
    if not response.data:
        return pd.DataFrame()
    
    return pd.DataFrame(response.data)


def update_content_enrichment_cycle(content_ids: list[str], new_cycle: int) -> None:
    """Update enrichment cycle for content items.
    
    Args:
        content_ids: List of content database IDs (UUIDs)
        new_cycle: New cycle number (0-8)
    """
    if not content_ids:
        return
    
    supabase = get_supabase()
    
    # Batch update
    for i in range(0, len(content_ids), DB_BATCH_SIZE_UPSERT):
        batch_ids = content_ids[i:i + DB_BATCH_SIZE_UPSERT]
        
        supabase.table("content").update(
            {"enrichment_cycle": new_cycle}
        ).in_("id", batch_ids).execute()


def get_content_stats() -> dict:
    """Get content table statistics.
    
    Returns:
        Dict with counts by type, totals, etc.
    """
    supabase = get_supabase()
    
    # Total count
    total_response = supabase.table("content").select("id", count="exact").execute()
    total = total_response.count or 0
    
    # Count by type
    movie_response = supabase.table("content").select(
        "id", count="exact"
    ).eq("content_type", "movie").execute()
    movies = movie_response.count or 0
    
    tv_response = supabase.table("content").select(
        "id", count="exact"
    ).eq("content_type", "tv").execute()
    tv = tv_response.count or 0
    
    # Count with missing data
    incomplete_response = supabase.table("content").select(
        "id", count="exact"
    ).or_(
        "poster_path.is.null,"
        "overview.is.null,"
        "backdrop_path.is.null"
    ).execute()
    incomplete = incomplete_response.count or 0
    
    return {
        "total": total,
        "movies": movies,
        "tv": tv,
        "incomplete": incomplete,
        "complete": total - incomplete,
    }

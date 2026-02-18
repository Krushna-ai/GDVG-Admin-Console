"""Queue tables database operations (import_queue, enrichment_queue)."""

from typing import Optional, Literal
import pandas as pd
from datetime import datetime
from gdvg.clients.supabase_client import get_supabase
from gdvg.config import DB_BATCH_SIZE_UPSERT


QueueType = Literal["content", "people"]
QueueStatus = Literal["pending", "processing", "completed", "failed"]


def add_to_import_queue(
    tmdb_ids: list[int],
    content_type: Literal["movie", "tv"],
    priority: int = 5
) -> int:
    """Add TMDB IDs to import queue in bulk.

    Args:
        tmdb_ids: List of TMDB IDs to queue for import
        content_type: Type of content ('movie' or 'tv')
        priority: Priority level (0-10, higher = more important)

    Returns:
        Number of items queued
    """
    if not tmdb_ids:
        return 0

    supabase = get_supabase()

    # Create records
    now = datetime.utcnow().isoformat()
    records = [
        {
            "tmdb_id": tmdb_id,
            "content_type": content_type,
            "priority": priority,
            "status": "pending",
            "created_at": now,
        }
        for tmdb_id in tmdb_ids
    ]

    total_queued = 0

    # Insert in batches, ignore conflicts (already queued)
    for i in range(0, len(records), DB_BATCH_SIZE_UPSERT):
        batch = records[i:i + DB_BATCH_SIZE_UPSERT]

        # Upsert to avoid duplicates
        supabase.table("import_queue").upsert(
            batch,
            on_conflict="tmdb_id,content_type"
        ).execute()

        total_queued += len(batch)

    return total_queued


def get_import_queue_batch(
    content_type: Optional[Literal["movie", "tv"]] = None,
    limit: int = 500
) -> pd.DataFrame:
    """Get pending items from import queue.

    Returns items ordered by priority (desc), then created_at (asc).

    Args:
        content_type: Optional filter by 'movie' or 'tv'
        limit: Max items to return

    Returns:
        DataFrame with queue items
    """
    supabase = get_supabase()

    query = supabase.table("import_queue").select("*").eq("status", "pending")

    if content_type:
        query = query.eq("content_type", content_type)

    response = query.order("priority", desc=True).order(
        "created_at", desc=False
    ).limit(limit).execute()

    if not response.data:
        return pd.DataFrame()

    return pd.DataFrame(response.data)


def mark_import_queue_completed(queue_ids: list[str]) -> None:
    """Mark import queue items as completed.

    Args:
        queue_ids: List of import_queue database IDs (UUIDs)
    """
    if not queue_ids:
        return

    supabase = get_supabase()

    for i in range(0, len(queue_ids), DB_BATCH_SIZE_UPSERT):
        batch_ids = queue_ids[i:i + DB_BATCH_SIZE_UPSERT]

        # FIX B1: import_queue has 'processed_at', not 'completed_at'
        supabase.table("import_queue").update(
            {
                "status": "completed",
                "processed_at": datetime.utcnow().isoformat()
            }
        ).in_("id", batch_ids).execute()


def add_to_enrichment_queue(
    queue_type: QueueType,
    entity_ids: list[str],
    priority: int = 5,
    cycle: int = 0
) -> int:
    """Add entities to enrichment queue by UUID entity_id.

    Args:
        queue_type: Type of entity ('content' or 'people')
        entity_ids: List of database IDs (UUIDs) to enrich
        priority: Priority level (0-10)
        cycle: Enrichment cycle (0-8)

    Returns:
        Number of items queued
    """
    if not entity_ids:
        return 0

    supabase = get_supabase()

    now = datetime.utcnow().isoformat()
    records = [
        {
            "queue_type": queue_type,
            "entity_id": entity_id,
            "priority": priority,
            "status": "pending",
            "created_at": now,
        }
        for entity_id in entity_ids
    ]

    total_queued = 0

    for i in range(0, len(records), DB_BATCH_SIZE_UPSERT):
        batch = records[i:i + DB_BATCH_SIZE_UPSERT]

        supabase.table("enrichment_queue").upsert(
            batch,
            on_conflict="queue_type,entity_id"
        ).execute()

        total_queued += len(batch)

    return total_queued


def bulk_add_to_enrichment_queue(
    tmdb_ids: list[int],
    queue_type: QueueType,
    content_type: Optional[Literal["movie", "tv"]] = None,
    priority: int = 5,
) -> int:
    """Add entities to enrichment queue by tmdb_id (resolves to UUID entity_id).

    Looks up the UUID primary key from content or people table by tmdb_id,
    then inserts into enrichment_queue with the correct entity_id.

    Args:
        tmdb_ids: List of TMDB IDs to queue for enrichment
        queue_type: 'content' or 'people'
        content_type: Required when queue_type='content' ('movie' or 'tv')
        priority: Priority level (0-10)

    Returns:
        Number of items queued
    """
    if not tmdb_ids:
        return 0

    supabase = get_supabase()

    # Resolve tmdb_ids → UUID entity_ids
    entity_ids = []

    for i in range(0, len(tmdb_ids), DB_BATCH_SIZE_UPSERT):
        batch_tmdb_ids = tmdb_ids[i:i + DB_BATCH_SIZE_UPSERT]

        if queue_type == "content":
            query = supabase.table("content").select("id").in_("tmdb_id", batch_tmdb_ids)
            if content_type:
                query = query.eq("content_type", content_type)
        else:
            query = supabase.table("people").select("id").in_("tmdb_id", batch_tmdb_ids)

        response = query.execute()
        if response.data:
            entity_ids.extend([row["id"] for row in response.data])

    if not entity_ids:
        return 0

    return add_to_enrichment_queue(
        queue_type=queue_type,
        entity_ids=entity_ids,
        priority=priority,
    )


def get_enrichment_queue_batch(
    queue_type: QueueType,
    cycle: Optional[int] = None,
    limit: int = 500
) -> pd.DataFrame:
    """Get pending items from enrichment queue.

    Args:
        queue_type: Type to fetch ('content' or 'people')
        cycle: Optional cycle filter (0-8)
        limit: Max items to return

    Returns:
        DataFrame with queue items
    """
    supabase = get_supabase()

    query = supabase.table("enrichment_queue").select(
        "*"
    ).eq("queue_type", queue_type).eq("status", "pending")

    if cycle is not None:
        query = query.eq("cycle", cycle)

    response = query.order("priority", desc=True).order(
        "created_at", desc=False
    ).limit(limit).execute()

    if not response.data:
        return pd.DataFrame()

    return pd.DataFrame(response.data)


def mark_enrichment_queue_completed(queue_ids: list[str]) -> None:
    """Mark enrichment queue items as completed.

    Args:
        queue_ids: List of enrichment_queue database IDs (UUIDs)
    """
    if not queue_ids:
        return

    supabase = get_supabase()

    for i in range(0, len(queue_ids), DB_BATCH_SIZE_UPSERT):
        batch_ids = queue_ids[i:i + DB_BATCH_SIZE_UPSERT]

        supabase.table("enrichment_queue").update(
            {
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat()
            }
        ).in_("id", batch_ids).execute()


def get_queue_stats() -> dict:
    """Get queue statistics.

    Returns:
        Dict with counts for import_queue and enrichment_queue
    """
    supabase = get_supabase()

    # Import queue stats
    import_pending = supabase.table("import_queue").select(
        "id", count="exact"
    ).eq("status", "pending").execute()

    # Enrichment queue stats
    enrich_content_pending = supabase.table("enrichment_queue").select(
        "id", count="exact"
    ).eq("queue_type", "content").eq("status", "pending").execute()

    enrich_people_pending = supabase.table("enrichment_queue").select(
        "id", count="exact"
    ).eq("queue_type", "people").eq("status", "pending").execute()

    return {
        "import_queue_pending": import_pending.count or 0,
        "enrichment_queue_content_pending": enrich_content_pending.count or 0,
        "enrichment_queue_people_pending": enrich_people_pending.count or 0,
    }

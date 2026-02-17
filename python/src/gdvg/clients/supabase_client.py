"""Singleton Supabase client for database operations."""

from typing import Optional

from supabase import Client, create_client

from gdvg.config import SUPABASE_URL, SUPABASE_SERVICE_KEY


class SupabaseClient:
    """Singleton Supabase client instance.
    
    Uses service role key for full database access.
    Bypasses Row Level Security (RLS) policies.
    """
    
    _instance: Optional["SupabaseClient"] = None
    _client: Optional[Client] = None
    
    def __new__(cls) -> "SupabaseClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self) -> None:
        if self._client is None:
            self._client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    @property
    def client(self) -> Client:
        """Get the Supabase client instance."""
        if self._client is None:
            raise RuntimeError("Supabase client not initialized")
        return self._client


# Global singleton instance
_supabase_client = SupabaseClient()


def get_supabase() -> Client:
    """Get the global Supabase client instance.
    
    Returns:
        Supabase client configured with service role key.
        
    Example:
        >>> from gdvg.clients.supabase_client import get_supabase
        >>> supabase = get_supabase()
        >>> result = supabase.table("content").select("*").limit(10).execute()
    """
    return _supabase_client.client

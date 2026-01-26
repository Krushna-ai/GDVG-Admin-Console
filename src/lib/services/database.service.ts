// Database Service - Helper functions for Supabase operations
import { createClient } from '@/lib/supabase/server';

// ============================================
// TYPES
// ============================================

export interface Content {
    id: string;
    tmdb_id: number;
    imdb_id?: string;
    content_type: 'movie' | 'tv' | 'drama' | 'anime' | 'variety' | 'documentary';
    title: string;
    original_title?: string;
    overview?: string;
    poster_path?: string;
    backdrop_path?: string;
    release_date?: string;
    first_air_date?: string;
    status: 'draft' | 'published' | 'archived';
    original_language?: string;
    origin_country?: string[];
    genres?: any;
    popularity?: number;
    vote_average?: number;
    vote_count?: number;
    runtime?: number;
    number_of_seasons?: number;
    number_of_episodes?: number;
    tagline?: string;
    homepage?: string;
    budget?: number;
    revenue?: number;
    production_companies?: any;
    networks?: any;
    tmdb_status?: string;
    // New fields for Phase 6
    content_rating?: string | null;
    keywords?: any;
    alternative_titles?: any;
    videos?: any;
    watch_providers?: any;
    wikidata_id?: string | null;
    tvdb_id?: number | null;
    created_at: string;
    updated_at: string;
}

export interface Person {
    id: string;
    tmdb_id: number;
    imdb_id?: string;
    name: string;
    biography?: string;
    birthday?: string;
    deathday?: string;
    place_of_birth?: string;
    profile_path?: string;
    known_for_department?: string;
    popularity?: number;
    gender?: number;
    also_known_as?: string[];
    homepage?: string;
    adult?: boolean;
    created_at: string;
    updated_at: string;
}

export interface ImportQueueItem {
    id: string;
    tmdb_id: number;
    content_type: string;
    priority: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    batch_name?: string;
    source?: string;
    attempts: number;
    error_message?: string;
    metadata?: any;
    created_at: string;
    updated_at: string;
    processed_at?: string;
}

export interface ContentListParams {
    page?: number;
    limit?: number;
    contentType?: string;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PeopleListParams {
    page?: number;
    limit?: number;
    department?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

// ============================================
// CONTENT FUNCTIONS
// ============================================

// Upsert content (insert or update based on tmdb_id)
export async function upsertContent(data: Partial<Content>): Promise<Content> {
    const supabase = await createClient();

    const { data: result, error } = await supabase
        .from('content')
        .upsert({
            ...data,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'tmdb_id',
            ignoreDuplicates: false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error upserting content:', error);
        throw error;
    }

    return result;
}

// Get content by TMDB ID
export async function getContentByTmdbId(tmdbId: number): Promise<Content | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('content')
        .select('*')
        .eq('tmdb_id', tmdbId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Error getting content by TMDB ID:', error);
        throw error;
    }

    return data;
}

// Get content by internal ID
export async function getContentById(id: string): Promise<Content | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('content')
        .select('*')
        .eq('id', id)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error getting content by ID:', error);
        throw error;
    }

    return data;
}

// Get content list with filtering and pagination
export async function getContentList(params: ContentListParams = {}): Promise<{
    data: Content[];
    count: number;
}> {
    const { page = 1, limit = 20, contentType, status, search, sortBy = 'created_at', sortOrder = 'desc' } = params;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    let query = supabase
        .from('content')
        .select('*', { count: 'exact' });

    // Filters
    if (contentType) query = query.eq('content_type', contentType);
    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('title', `%${search}%`);

    // Sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error getting content list:', error);
        throw error;
    }

    return { data: data || [], count: count || 0 };
}

// Update content status
export async function updateContentStatus(id: string, status: 'draft' | 'published' | 'archived'): Promise<Content> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('content')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating content status:', error);
        throw error;
    }

    return data;
}

// ============================================
// PEOPLE FUNCTIONS
// ============================================

// Upsert person (insert or update based on tmdb_id)
export async function upsertPerson(data: Partial<Person>): Promise<Person> {
    const supabase = await createClient();

    const { data: result, error } = await supabase
        .from('people')
        .upsert({
            ...data,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'tmdb_id',
            ignoreDuplicates: false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error upserting person:', error);
        throw error;
    }

    return result;
}

// Get person by TMDB ID
export async function getPersonByTmdbId(tmdbId: number): Promise<Person | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('tmdb_id', tmdbId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error getting person by TMDB ID:', error);
        throw error;
    }

    return data;
}

// Get person by internal ID
export async function getPersonById(id: string): Promise<Person | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('id', id)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error getting person by ID:', error);
        throw error;
    }

    return data;
}

// Get people list with filtering and pagination
export async function getPeopleList(params: PeopleListParams = {}): Promise<{
    data: Person[];
    count: number;
}> {
    const { page = 1, limit = 20, department, search, sortBy = 'popularity', sortOrder = 'desc' } = params;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    let query = supabase
        .from('people')
        .select('*', { count: 'exact' });

    // Filters
    if (department) query = query.eq('known_for_department', department);
    if (search) query = query.ilike('name', `%${search}%`);

    // Sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc', nullsFirst: false });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error getting people list:', error);
        throw error;
    }

    return { data: data || [], count: count || 0 };
}

// ============================================
// CAST/CREW LINKING FUNCTIONS
// ============================================

// Link cast member to content (ignore duplicates)
export async function linkCast(
    contentId: string,
    personId: string,
    characterName: string,
    orderIndex: number,
    roleType: 'main' | 'support' | 'guest' = 'support'
): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('content_cast')
        .upsert({
            content_id: contentId,
            person_id: personId,
            character_name: characterName,
            order_index: orderIndex,
            role_type: roleType,
        }, {
            onConflict: 'content_id,person_id,character_name',
            ignoreDuplicates: true,
        });

    if (error) {
        console.error('Error linking cast:', error);
        throw error;
    }
}

// Link crew member to content (ignore duplicates)
export async function linkCrew(
    contentId: string,
    personId: string,
    job: string,
    department: string
): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('content_crew')
        .upsert({
            content_id: contentId,
            person_id: personId,
            job,
            department,
        }, {
            onConflict: 'content_id,person_id,job',
            ignoreDuplicates: true,
        });

    if (error) {
        console.error('Error linking crew:', error);
        throw error;
    }
}

// Get cast for content
export async function getContentCast(contentId: string): Promise<any[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('content_cast')
        .select(`
      *,
      person:people(id, tmdb_id, name, profile_path, known_for_department)
    `)
        .eq('content_id', contentId)
        .order('order_index', { ascending: true });

    if (error) {
        console.error('Error getting content cast:', error);
        throw error;
    }

    return data || [];
}

// Get crew for content
export async function getContentCrew(contentId: string): Promise<any[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('content_crew')
        .select(`
      *,
      person:people(id, tmdb_id, name, profile_path, known_for_department)
    `)
        .eq('content_id', contentId);

    if (error) {
        console.error('Error getting content crew:', error);
        throw error;
    }

    return data || [];
}

// ============================================
// IMPORT QUEUE FUNCTIONS
// ============================================

// Get queue items with filtering
export async function getQueueItems(
    status?: string,
    limit: number = 50
): Promise<ImportQueueItem[]> {
    const supabase = await createClient();

    let query = supabase
        .from('import_queue')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error getting queue items:', error);
        throw error;
    }

    return data || [];
}

// Bulk insert queue items
export async function bulkInsertQueue(items: Array<{
    tmdb_id: number;
    content_type: string;
    priority?: number;
    batch_name?: string;
    source?: string;
    metadata?: any;
}>): Promise<{ inserted: number; skipped: number }> {
    const supabase = await createClient();

    const queueItems = items.map(item => ({
        tmdb_id: item.tmdb_id,
        content_type: item.content_type,
        priority: item.priority || 0,
        batch_name: item.batch_name,
        source: item.source || 'manual',
        metadata: item.metadata,
        status: 'pending',
        attempts: 0,
    }));

    // Use upsert to skip duplicates
    const { data, error } = await supabase
        .from('import_queue')
        .upsert(queueItems, {
            onConflict: 'tmdb_id,content_type',
            ignoreDuplicates: true,
        })
        .select();

    if (error) {
        console.error('Error bulk inserting queue:', error);
        throw error;
    }

    return {
        inserted: data?.length || 0,
        skipped: items.length - (data?.length || 0),
    };
}

// Update import queue status
export async function updateImportQueueStatus(
    tmdbId: number,
    contentType: string,
    status: string,
    errorMessage?: string
): Promise<void> {
    const supabase = await createClient();

    const updateData: any = {
        status,
        error_message: errorMessage || null,
        updated_at: new Date().toISOString(),
    };

    // Set processed_at if completed or failed
    if (status === 'completed' || status === 'failed') {
        updateData.processed_at = new Date().toISOString();
    }

    const { error } = await supabase
        .from('import_queue')
        .update(updateData)
        .eq('tmdb_id', tmdbId)
        .eq('content_type', contentType);

    if (error) {
        console.error('Error updating import queue:', error);
        throw error;
    }
}

// Get queue statistics
export async function getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
}> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('import_queue')
        .select('status');

    if (error) {
        console.error('Error getting queue stats:', error);
        throw error;
    }

    const stats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: data?.length || 0,
    };

    data?.forEach(item => {
        if (item.status in stats) {
            stats[item.status as keyof typeof stats]++;
        }
    });

    return stats;
}

// Clear completed queue items
export async function clearCompletedQueue(): Promise<number> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('import_queue')
        .delete()
        .eq('status', 'completed')
        .select();

    if (error) {
        console.error('Error clearing completed queue:', error);
        throw error;
    }

    return data?.length || 0;
}

// Retry failed queue items
export async function retryFailedQueue(): Promise<number> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('import_queue')
        .update({
            status: 'pending',
            error_message: null,
            updated_at: new Date().toISOString(),
        })
        .eq('status', 'failed')
        .select();

    if (error) {
        console.error('Error retrying failed queue:', error);
        throw error;
    }

    return data?.length || 0;
}


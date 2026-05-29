import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '../../../../scripts/lib/cloudflare-ai';

interface ContentResult {
  id: string;
  gdvg_id?: string;
  title: string;
  content_type: string;
  poster_path?: string;
  overview?: string;
  genres?: unknown;
  vote_average?: number;
  origin_country?: string[];
  similarity_score: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, limit = 20 }: { query: string; limit?: number } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Keyword search — ILIKE on title and overview
    const { data: keywordResults, error: keywordError } = await supabase
      .from('content')
      .select('id, gdvg_id, title, content_type, poster_path, overview, genres, vote_average, origin_country')
      .or(`title.ilike.%${query}%,overview.ilike.%${query}%`)
      .eq('status', 'published')
      .limit(20);

    if (keywordError) {
      console.error('Keyword search error:', keywordError);
    }

    const keywordItems: ContentResult[] = (keywordResults || []).map(item => ({
      ...item,
      similarity_score: 0,
    }));

    // 2. Generate embedding for semantic search
    const embedding = await generateEmbedding(query);
    let vectorItems: ContentResult[] = [];
    let semantic = false;

    if (embedding) {
      semantic = true;
      const embeddingVector = `[${embedding.join(',')}]`;

      // Vector similarity search via RPC (requires search_content_by_embedding Postgres function)
      const { data: vectorResults, error: vectorError } = await supabase.rpc(
        'search_content_by_embedding',
        {
          query_embedding: embeddingVector,
          match_threshold: 0.4,
          match_count: 20,
        }
      );

      if (vectorError) {
        console.error('Vector search error:', vectorError);
      } else {
        vectorItems = (vectorResults || []).map((item: {
          id: string;
          gdvg_id?: string;
          title: string;
          content_type: string;
          poster_path?: string;
          overview?: string;
          genres?: unknown;
          vote_average?: number;
          origin_country?: string[];
          similarity: number;
        }) => ({
          id: item.id,
          gdvg_id: item.gdvg_id,
          title: item.title,
          content_type: item.content_type,
          poster_path: item.poster_path,
          overview: item.overview,
          genres: item.genres,
          vote_average: item.vote_average,
          origin_country: item.origin_country,
          similarity_score: item.similarity,
        }));
      }
    }

    // 3. Merge — vector matches ranked first, keyword-only appended, deduplicate by id
    const seen = new Set<string>();
    const results: ContentResult[] = [];

    for (const item of vectorItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        results.push(item);
      }
    }

    for (const item of keywordItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        results.push(item);
      }
    }

    const sliced = results.slice(0, limit);

    return NextResponse.json({
      results: sliced,
      total: sliced.length,
      query,
      semantic,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

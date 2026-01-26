// TMDB Daily Exports Service
// Downloads and parses TMDB daily export files for bulk import

import { createClient } from '@/lib/supabase/server';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

export interface ExportItem {
  id: number;
  original_title?: string;
  popularity: number;
  adult?: boolean;
}

export interface ExportResult {
  items: ExportItem[];
  totalCount: number;
  filteredCount: number;
  date: string;
}

/**
 * Get the export file URL for a specific date
 */
function getExportUrl(type: 'movie' | 'tv', date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  
  const fileType = type === 'movie' ? 'movie_ids' : 'tv_series_ids';
  return `http://files.tmdb.org/p/exports/${fileType}_${month}_${day}_${year}.json.gz`;
}

/**
 * Download and decompress a TMDB export file
 */
export async function downloadExportFile(
  type: 'movie' | 'tv',
  date?: Date
): Promise<string> {
  const url = getExportUrl(type, date);
  
  console.log(`Downloading TMDB export from: ${url}`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    // Try yesterday's file if today's isn't available yet
    if (!date) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return downloadExportFile(type, yesterday);
    }
    throw new Error(`Failed to download export file: ${response.status}`);
  }
  
  const buffer = await response.arrayBuffer();
  const decompressed = await gunzip(Buffer.from(buffer));
  
  return decompressed.toString('utf-8');
}

/**
 * Parse the newline-delimited JSON export file
 */
export function parseExportFile(data: string): ExportItem[] {
  const lines = data.trim().split('\n');
  const items: ExportItem[] = [];
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const item = JSON.parse(line);
        items.push({
          id: item.id,
          original_title: item.original_title,
          popularity: item.popularity || 0,
          adult: item.adult,
        });
      } catch (e) {
        // Skip malformed lines
      }
    }
  }
  
  return items;
}

/**
 * Filter export items by popularity threshold
 */
export function filterByPopularity(
  items: ExportItem[],
  minPopularity: number = 10,
  excludeAdult: boolean = true
): ExportItem[] {
  return items.filter(item => {
    if (excludeAdult && item.adult) return false;
    return item.popularity >= minPopularity;
  });
}

/**
 * Download, parse, and filter export file
 */
export async function getFilteredExport(
  type: 'movie' | 'tv',
  options: {
    minPopularity?: number;
    maxItems?: number;
    excludeAdult?: boolean;
  } = {}
): Promise<ExportResult> {
  const { minPopularity = 10, maxItems = 500, excludeAdult = true } = options;
  
  const rawData = await downloadExportFile(type);
  const allItems = parseExportFile(rawData);
  
  // Filter and sort by popularity
  let filtered = filterByPopularity(allItems, minPopularity, excludeAdult);
  filtered.sort((a, b) => b.popularity - a.popularity);
  
  // Limit to max items
  if (maxItems > 0) {
    filtered = filtered.slice(0, maxItems);
  }
  
  return {
    items: filtered,
    totalCount: allItems.length,
    filteredCount: filtered.length,
    date: new Date().toISOString().split('T')[0],
  };
}

/**
 * Queue items from export to import_queue table
 */
export async function queueFromExport(
  items: ExportItem[],
  contentType: 'movie' | 'tv',
  batchName: string
): Promise<{ queued: number; skipped: number }> {
  const supabase = await createClient();
  
  let queued = 0;
  let skipped = 0;
  
  // Get existing TMDB IDs in content table
  const { data: existingContent } = await supabase
    .from('content')
    .select('tmdb_id')
    .eq('content_type', contentType);
  
  const existingIds = new Set((existingContent || []).map(c => c.tmdb_id));
  
  // Get existing queue items
  const { data: existingQueue } = await supabase
    .from('import_queue')
    .select('tmdb_id')
    .eq('content_type', contentType);
  
  const queuedIds = new Set((existingQueue || []).map(q => q.tmdb_id));
  
  // Prepare items to insert
  const toInsert = items
    .filter(item => !existingIds.has(item.id) && !queuedIds.has(item.id))
    .map((item, index) => ({
      tmdb_id: item.id,
      content_type: contentType,
      priority: Math.floor(item.popularity), // Higher popularity = higher priority
      status: 'pending',
      batch_name: batchName,
      source: 'daily_export',
      metadata: {
        original_title: item.original_title,
        popularity: item.popularity,
      },
    }));
  
  skipped = items.length - toInsert.length;
  
  if (toInsert.length > 0) {
    // Insert in batches of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase
        .from('import_queue')
        .insert(batch);
      
      if (error) {
        console.error('Error inserting queue batch:', error);
      } else {
        queued += batch.length;
      }
    }
  }
  
  return { queued, skipped };
}

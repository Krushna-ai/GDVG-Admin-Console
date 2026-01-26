// Admin Supabase client with service role key
// Bypasses RLS for admin operations like queue processing

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

let adminClient: ReturnType<typeof createSupabaseClient> | null = null;

/**
 * Get admin Supabase client with service role key
 * This bypasses RLS for admin operations
 */
export function getAdminClient() {
    if (!adminClient) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing NEXT_SUPABASE_SERVICE_ROLE_KEY environment variable');
        }

        adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }

    return adminClient;
}

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function testCounts() {
    console.log("Querying content (exact without head)...");
    const { data: d1, count: c1, error: e1 } = await supabase
        .from('content')
        .select('id', { count: 'exact' })
        .limit(1);
    console.log("Total Content:", c1, "Error:", JSON.stringify(e1));

    console.log("Querying content (status = published)...");
    const { count: c3, error: e3 } = await supabase
        .from('content')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published');
    console.log("Published Content:", c3, "Error:", JSON.stringify(e3));
}

testCounts().catch(console.error);

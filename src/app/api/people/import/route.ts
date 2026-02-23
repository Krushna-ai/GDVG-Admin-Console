import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getPersonDetails } from '@/lib/tmdb/client';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { tmdb_id } = body;

        if (!tmdb_id) {
            return NextResponse.json({ error: 'tmdb_id is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Check if person already exists to prevent duplicate calls
        const { data: existingPerson } = await supabase
            .from('people')
            .select('*')
            .eq('tmdb_id', tmdb_id)
            .single();

        if (existingPerson) {
            return NextResponse.json({ person: existingPerson, message: 'Person already exists' }, { status: 200 });
        }

        // 2. Fetch full details from TMDB
        const tmdbPerson = await getPersonDetails(parseInt(tmdb_id.toString(), 10));

        if (!tmdbPerson) {
            return NextResponse.json({ error: 'Person not found on TMDB' }, { status: 404 });
        }

        // 3. Map to our database schema
        const personRecord = {
            tmdb_id: tmdbPerson.id,
            imdb_id: tmdbPerson.imdb_id || null,
            name: tmdbPerson.name,
            biography: tmdbPerson.biography || null,
            birthday: tmdbPerson.birthday || null,
            deathday: tmdbPerson.deathday || null,
            place_of_birth: tmdbPerson.place_of_birth || null,
            profile_path: tmdbPerson.profile_path || null,
            known_for_department: tmdbPerson.known_for_department || null,
            popularity: tmdbPerson.popularity || 0,
            gender: tmdbPerson.gender || 0,
            adult: tmdbPerson.adult || false,
            also_known_as: tmdbPerson.also_known_as || [],
            homepage: tmdbPerson.homepage || null
        };

        // 4. Insert into database
        const { data: insertedPerson, error: insertError } = await supabase
            .from('people')
            .insert(personRecord)
            .select()
            .single();

        if (insertError) {
            console.error('Database insertion error:', insertError);
            return NextResponse.json({ error: 'Failed to insert person into database' }, { status: 500 });
        }

        return NextResponse.json({ person: insertedPerson, message: 'Person imported successfully' }, { status: 201 });

    } catch (error: any) {
        console.error('Error importing person:', error);
        return NextResponse.json({ error: error.message || 'Failed to import person' }, { status: 500 });
    }
}

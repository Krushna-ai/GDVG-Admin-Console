import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import util from 'util';

const execFileAsync = util.promisify(execFile);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { url } = body;

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        let language = 'en';
        let title = '';

        try {
            const parsedUrl = new URL(url);

            // Extract language from hostname (e.g., en.wikipedia.org -> en)
            const hostParts = parsedUrl.hostname.split('.');
            if (hostParts.length >= 3 && hostParts[1] === 'wikipedia') {
                language = hostParts[0];
            }

            // Extract title from pathname (e.g., /wiki/Dune_(2021_film) -> Dune_(2021_film))
            const pathParts = parsedUrl.pathname.split('/');
            if (pathParts.length >= 3 && pathParts[1] === 'wiki') {
                title = decodeURIComponent(pathParts.slice(2).join('/'));
            } else {
                return NextResponse.json({ error: 'Invalid Wikipedia URL format. Must include /wiki/' }, { status: 400 });
            }

        } catch (e) {
            return NextResponse.json({ error: 'Invalid URL string' }, { status: 400 });
        }

        if (!title) {
            return NextResponse.json({ error: 'Could not extract article title from URL' }, { status: 400 });
        }

        // Execute Python Scraper
        const scriptPath = path.join(process.cwd(), 'scripts', 'python', 'wiki_movie_scraper.py');

        try {
            // We pass the raw Wikipedia URL to the python script
            const { stdout, stderr } = await execFileAsync('python', [scriptPath, url]);

            if (stderr && !stdout) {
                console.error('Python Scraper Stderr:', stderr);
            }

            const result = JSON.parse(stdout);

            if (!result.success) {
                return NextResponse.json({ error: result.error || 'Python script failed' }, { status: 500 });
            }

            return NextResponse.json({ data: result.data }, { status: 200 });

        } catch (execError: any) {
            console.error('Failed to execute python script:', execError);
            return NextResponse.json({ error: 'Extraction service unavailable or failed' }, { status: 500 });
        }

    } catch (error: any) {
        console.error('Error extracting Wikipedia data:', error);
        return NextResponse.json({ error: error.message || 'Failed to extract data' }, { status: 500 });
    }
}

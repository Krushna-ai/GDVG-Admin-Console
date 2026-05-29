const CLOUDFLARE_AI_MODEL = '@cf/baai/bge-large-en-v1.5';
const RATE_LIMIT_DELAY_MS = 100;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// ============================================
// INTERNAL FETCH WITH RETRY
// ============================================

async function fetchEmbedding(text: string): Promise<number[] | null> {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken) throw new Error('Missing CLOUDFLARE_API_TOKEN environment variable');
    if (!accountId) throw new Error('Missing CLOUDFLARE_ACCOUNT_ID environment variable');

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_AI_MODEL}`;

    await delay(RATE_LIMIT_DELAY_MS);

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: [text] }),
            });

            if (!res.ok) {
                if (res.status === 429) {
                    if (attempt === maxAttempts) {
                        console.warn(`Cloudflare AI rate limited (429) — retries exhausted`);
                        return null;
                    }
                    const waitTime = 1000 * Math.pow(2, attempt);
                    console.log(`  ⏳ Rate limited (429), waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
                    await delay(waitTime);
                    continue;
                }

                if (res.status === 500 || res.status === 503) {
                    if (attempt === maxAttempts) {
                        console.warn(`Cloudflare AI server error (${res.status}) — retries exhausted`);
                        return null;
                    }
                    const waitTime = 1000 * attempt;
                    console.log(`  ⚠️ Server error (${res.status}), waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
                    await delay(waitTime);
                    continue;
                }

                console.warn(`Cloudflare AI API error: ${res.status} ${res.statusText}`);
                return null;
            }

            const data = await res.json();
            const values: number[] = data?.result?.data?.[0];

            if (!Array.isArray(values) || values.length === 0) {
                console.warn(`Empty or malformed embedding response from Cloudflare AI`);
                return null;
            }

            return values;
        } catch (error: any) {
            if (attempt === maxAttempts) {
                console.error(`Cloudflare AI network error after ${maxAttempts} attempts: ${error?.message || error}`);
                return null;
            }
            const waitTime = 500 * attempt;
            console.log(`  🔌 Network error, waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
            await delay(waitTime);
        }
    }

    return null;
}

// ============================================
// PUBLIC API
// ============================================

export async function generateEmbedding(text: string): Promise<number[] | null> {
    return fetchEmbedding(text);
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/workflows/trigger
 * Trigger GitHub Actions workflows manually from the admin dashboard
 * 
 * Supported workflows:
 * - enrich-content: Content enrichment workflow
 * - enrich-people: People enrichment workflow  
 * - data-quality: Data quality validation workflow
 */

const GITHUB_API_URL = 'https://api.github.com';
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'Krushna-ai';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'GDVG-Admin-Console';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Map workflow names to their file names
const WORKFLOW_FILES: Record<string, string> = {
    'auto-import': 'auto-import.yml',
    'process-imports': 'process-imports.yml',
    'enrich-content': 'enrich-content.yml',
    'enrich-people': 'enrich-people.yml',
    'validate-content': 'validate-content.yml',
    'refresh-queue': 'refresh-queue.yml',
};

export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get workflow name from request body
        const body = await request.json();
        const { workflow } = body;

        if (!workflow || !WORKFLOW_FILES[workflow]) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid workflow name',
                    supported: Object.keys(WORKFLOW_FILES)
                },
                { status: 400 }
            );
        }

        // Check if GitHub token is configured
        if (!GITHUB_TOKEN) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'GitHub token not configured. Please set GITHUB_TOKEN environment variable.'
                },
                { status: 500 }
            );
        }

        // Trigger the workflow via GitHub API
        const workflowFile = WORKFLOW_FILES[workflow];
        const dispatchUrl = `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowFile}/dispatches`;

        const response = await fetch(dispatchUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ref: 'main', // Branch to run workflow on
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('GitHub API error:', errorText);

            return NextResponse.json(
                {
                    success: false,
                    error: `Failed to trigger workflow: ${response.statusText}`,
                    details: errorText
                },
                { status: response.status }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Workflow '${workflow}' triggered successfully`,
            workflow: workflowFile,
        });

    } catch (error) {
        console.error('Error triggering workflow:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

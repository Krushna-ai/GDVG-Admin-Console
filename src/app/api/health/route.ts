import { NextResponse } from 'next/server';

// Health check endpoint for Railway
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'GDVG Admin Console'
    });
}

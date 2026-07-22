import { NextRequest, NextResponse } from 'next/server';
import { getProtectedResourceMetadata } from '@/lib/mcp/oauth/metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return NextResponse.json(getProtectedResourceMetadata(request), {
    headers: {
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

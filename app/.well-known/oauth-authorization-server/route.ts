import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationServerMetadata } from '@/lib/mcp/oauth/metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return NextResponse.json(getAuthorizationServerMetadata(request), {
    headers: {
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

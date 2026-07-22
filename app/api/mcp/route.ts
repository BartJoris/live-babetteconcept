import { NextRequest, NextResponse } from 'next/server';
import { authorizeMcpRequest } from '@/lib/mcp-auth';
import { handleReadOnlyMcpRequest } from '@/lib/mcp-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: NextRequest): Promise<Response> {
  const auth = authorizeMcpRequest(request.headers.get('authorization'));

  switch (auth) {
    case 'disabled':
      return NextResponse.json(
        { error: 'MCP endpoint disabled: MCP_API_TOKEN is not configured' },
        { status: 503 }
      );
    case 'unauthorized':
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    case 'ok':
      return handleReadOnlyMcpRequest(request);
    default: {
      const _exhaustive: never = auth;
      return NextResponse.json(
        { error: `Unexpected auth result: ${_exhaustive}` },
        { status: 500 }
      );
    }
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function DELETE(request: NextRequest) {
  return handle(request);
}

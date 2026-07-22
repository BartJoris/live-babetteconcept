import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { executeTool, getToolsByAccess } from '@/lib/mcp/tools';

/** Read-only MCP server for the remote HTTP endpoint. */
export function createReadOnlyMcpServer(): McpServer {
  const server = new McpServer({
    name: 'babetteconcept',
    version: '1.0.0',
  });

  for (const tool of getToolsByAccess('read')) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
      },
      async (params) => {
        try {
          const result = await executeTool(
            tool.name,
            params as Record<string, unknown>,
            { allowedAccess: 'read' }
          );
          return { content: [{ type: 'text' as const, text: result }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

/**
 * Handles one Streamable HTTP MCP request in stateless mode.
 * Creates a fresh server + transport per request (safe for Next.js).
 */
export async function handleReadOnlyMcpRequest(request: Request): Promise<Response> {
  const server = createReadOnlyMcpServer();
  // JSON responses (not SSE) so the body is complete before we tear down
  // the per-request transport — required for Next.js route handlers.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

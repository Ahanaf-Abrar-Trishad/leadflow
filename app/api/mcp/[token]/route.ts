import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createLeadflowMcpServer } from "@/lib/ai/mcpServer";
import { mcpTokenMatches } from "@/lib/ai/mcpAuth";

/*
 * The MCP endpoint Claude (Cowork or Claude Code) connects to. It sits
 * outside proxy.ts's session gate on purpose - Claude has no LeadFlow login -
 * and is protected instead by the secret token in its path, the same way an
 * unsubscribe link carries its own signed token. With MCP_ACCESS_TOKEN unset
 * the endpoint does not exist (404).
 *
 * Stateless: every request gets a fresh server and transport, so this works
 * behind any number of app instances with no session store.
 */
export const dynamic = "force-dynamic";

async function handle(request: Request, context: RouteContext<"/api/mcp/[token]">): Promise<Response> {
  const { token } = await context.params;
  if (!mcpTokenMatches(token)) {
    return new Response("Not found", { status: 404 });
  }

  const server = createLeadflowMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // JSON responses are complete once handleRequest resolves.
    await server.close();
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

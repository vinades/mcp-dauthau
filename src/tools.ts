/**
 * Đăng ký tool MCP với SDK TypeScript.
 *
 * **Quan trọng:** wrapper KHÔNG hardcode schema 22 tool. Thay vào đó query động
 * `tools/list` lên gateway khi MCP client gọi → gateway là source of truth.
 * Khi backend thêm/sửa tool, wrapper KHÔNG cần release version mới.
 *
 * Trade-off: cold-start có thêm 1 round-trip lên gateway. Chấp nhận được vì
 * MCP client cache tools/list sau lần đầu trong session.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from "@modelcontextprotocol/sdk/types.js";

import type { Config } from "./config.js";
import { forwardJsonRpc } from "./forward.js";
import { logError, logInfo } from "./log.js";

/**
 * registerProxyHandlers gắn 2 handler quan trọng:
 *   - tools/list  → forward GET lên gateway, trả nguyên schema.
 *   - tools/call  → forward POST lên gateway, trả nguyên response.
 *
 * Các method khác (initialize, ping, ...) MCP SDK lo nội bộ.
 */
export function registerProxyHandlers(server: Server, cfg: Config): void {
  server.setRequestHandler(ListToolsRequestSchema, async (req: ListToolsRequest) => {
    logInfo("forward tools/list");
    const { status, body } = await forwardJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: req.params ?? {},
      },
      cfg,
    );
    if (status !== 200) {
      logError("tools/list non-200", { status });
      throw new Error(`tools/list gateway returned ${status}`);
    }
    const result = extractResult(body);
    // as never: MCP SDK handler typing quá strict, workaround safe vì result là dynamic từ gateway
    return result as never;
  });

  server.setRequestHandler(CallToolRequestSchema, async (req: CallToolRequest) => {
    const toolName = req.params.name;
    logInfo("forward tools/call", { tool: toolName });
    const { status, body } = await forwardJsonRpc(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: req.params,
      },
      cfg,
    );
    if (status !== 200) {
      logError("tools/call non-200", { tool: toolName, status });
      // Forward error JSON nguyên về client (DauThau backend trả code 1003/1004/1006/1007 cần hiển thị)
      const errBody = extractResult(body) ?? { error: { code: status, message: "gateway error" } };
      return errBody as never;
    }
    return extractResult(body) as never;
  });
}

/** Bóc tách `result` từ JSON-RPC envelope. Nếu là raw object (gateway trả non-JSON-RPC), trả nguyên. */
function extractResult(body: unknown): unknown {
  if (body && typeof body === "object" && "result" in (body as Record<string, unknown>)) {
    return (body as { result: unknown }).result;
  }
  return body;
}

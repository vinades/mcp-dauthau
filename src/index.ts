#!/usr/bin/env node
/**
 * Entrypoint @dauthau/mcp-dauthau — chạy MCP server stdio local, forward HTTPS lên gateway.
 *
 * Xem README.md cho hướng dẫn cài đặt và mẫu config `.mcp.json`.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { logError, logInfo, logWarn, setLogLevel } from "./log.js";
import { loadInstructions } from "./prompts.js";
import { registerProxyHandlers } from "./tools.js";

// package.json version — injected khi build (sau publish: process.env.npm_package_version).
const VERSION = process.env.npm_package_version ?? "0.1.8";

async function main(): Promise<void> {
  // Handle --version / --help trước khi load config (cho nhanh).
  const arg = process.argv[2];
  if (arg === "--version" || arg === "-v") {
    process.stdout.write(`@dauthau/mcp-dauthau ${VERSION}\n`);
    return;
  }
  if (arg === "--help" || arg === "-h") {
    process.stdout.write(helpText());
    return;
  }

  let cfg;
  try {
    cfg = loadConfig();
    setLogLevel(cfg.logLevel);
  } catch (err) {
    process.stderr.write(`[fatal] ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (arg === "--diagnose") {
    const { runDiagnose } = await import("./diagnose.js");
    const ok = await runDiagnose(cfg);
    process.exit(ok ? 0 : 1);
  }

  logInfo("@dauthau/mcp-dauthau starting", {
    version: VERSION,
    gateway: cfg.gatewayUrl,
    hash_algo: cfg.hashAlgo,
    node: process.version,
  });

  // Load shared prompt từ dist/assets/ (copy từ sibling repo Go lúc build)
  let instructions: string | undefined;
  try {
    instructions = loadInstructions();
    logInfo("loaded mcp-instructions.md", { length: instructions.length });
  } catch (err) {
    logWarn("không load được mcp-instructions.md, chạy không có instructions", {
      err: (err as Error).message,
    });
  }

  const server = new Server(
    { name: "dauthau-mcp-wrapper", version: VERSION },
    {
      capabilities: {
        tools: {},
      },
      ...(instructions ? { instructions } : {}),
    },
  );

  registerProxyHandlers(server, cfg);

  // Graceful shutdown — Claude Code / Cursor đóng stdio khi user reload.
  const shutdown = async (signal: string): Promise<void> => {
    logInfo("shutdown", { signal });
    try {
      await server.close();
    } catch (err) {
      logError("shutdown error", { err: (err as Error).message });
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logInfo("@dauthau/mcp-dauthau connected, waiting for client", {});
}

function helpText(): string {
  return [
    "@dauthau/mcp-dauthau — Node.js MCP wrapper cho dịch vụ tra cứu đấu thầu DauThau",
    "",
    "Env bắt buộc:",
    "  DAUTHAU_APIKEY     Apikey từ tài khoản DauThau",
    "  DAUTHAU_APISECRET  Apisecret (giữ local, sign hashsecret mỗi request)",
    "  MCP_GATEWAY_URL    URL gateway DauThau cấp",
    "  MCP_GATEWAY_KEY    Gateway subscription key DauThau cấp",
    "",
    "Env tuỳ chọn:",
    "  DAUTHAU_METHOD             password_verify (default) | md5_verify",
    "  LOG_LEVEL                  debug | info (default) | warn | error",
    "  MCP_GATEWAY_TIMEOUT_MS    1000-120000 (default 30000)",
    "  MCP_GATEWAY_RETRY_MAX     0-10 (default 3, retry khi 5xx)",
    "  MCP_GATEWAY_RETRY_BASE_MS 50-5000 (default 200, exponential backoff)",
    "",
    "Cờ:",
    "  --version  / -v   in version",
    "  --help     / -h   in help",
    "  --diagnose        chẩn đoán kết nối gateway (DNS, TLS, tools/list)",
    "",
  ].join("\n");
}

main().catch((err) => {
  process.stderr.write(`[fatal] ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});

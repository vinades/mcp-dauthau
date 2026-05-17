/**
 * Log structured JSON ra **stderr**. CẤM log ra stdout — stdout dành cho MCP JSON-RPC stdio framing.
 *
 * Quy tắc:
 *   - KHÔNG log apikey, apisecret, hashsecret, gatewayKey, raw body.
 *   - Log: tool name, latency, status, error message.
 *   - Tôn trọng LOG_LEVEL từ env (debug | info | warn | error).
 */

const levelOrder = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type LevelName = keyof typeof levelOrder;

let currentLevel: LevelName = "info";

export function setLogLevel(level: LevelName): void {
  currentLevel = level;
}

function log(level: LevelName, msg: string, fields: Record<string, unknown> = {}): void {
  if (levelOrder[level] < levelOrder[currentLevel]) {
    return;
  }
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
  process.stderr.write(line + "\n");
}

export const logDebug = (msg: string, fields?: Record<string, unknown>): void =>
  log("debug", msg, fields);
export const logInfo = (msg: string, fields?: Record<string, unknown>): void =>
  log("info", msg, fields);
export const logWarn = (msg: string, fields?: Record<string, unknown>): void =>
  log("warn", msg, fields);
export const logError = (msg: string, fields?: Record<string, unknown>): void =>
  log("error", msg, fields);

/**
 * Forward MCP request lên gateway HTTPS DauThau.
 *
 * Wrapper sign hashsecret local, gateway forward nguyên xuống backend API.
 *
 * 4 header bắt buộc:
 *   X-MCP-API-Key:          gateway subscription
 *   X-Dauthau-Apikey:       apikey của user
 *   X-Dauthau-Hashsecret:   hashsecret đã sign per-request (md5 hex hoặc bcrypt $2y$)
 *   X-Dauthau-Timestamp:    Unix seconds dùng khi sign — backend verify lại
 *
 * KHÔNG log apikey/apisecret/hashsecret/body — chỉ log latency + status (stderr).
 */

import type { Config } from "./config.js";
import { logInfo, logError, logWarn } from "./log.js";
import { signHashsecret, nowUnix } from "./sign.js";

export interface ForwardResult {
  status: number;
  body: unknown;
}

export interface ForwardOptions {
  /** Cho phép caller override timestamp (chỉ dùng cho test). Mặc định nowUnix(). */
  timestamp?: number;
  /** Cho phép caller cung cấp fetch mock (chỉ dùng cho test). */
  fetchImpl?: typeof fetch;
}

/**
 * forwardJsonRpc gửi 1 JSON-RPC envelope (đã được MCP SDK build sẵn) lên gateway.
 * Retry exponential backoff nếu 5xx. KHÔNG retry cho 4xx (lỗi client).
 *
 * @param jsonRpcBody  body JSON-RPC từ MCP SDK (initialize / tools/list / tools/call ...).
 * @param cfg          config đã load qua loadConfig().
 * @param opts         tuỳ chọn override cho test.
 */
export async function forwardJsonRpc(
  jsonRpcBody: unknown,
  cfg: Config,
  opts: ForwardOptions = {},
): Promise<ForwardResult> {
  const ts = opts.timestamp ?? nowUnix();
  const hashsecret = await signHashsecret(cfg.hashAlgo, cfg.apisecret, ts);

  // Serialize body TRƯỚC khi start timer — nếu circular reference sẽ throw sớm, không leak timer.
  const serializedBody = JSON.stringify(jsonRpcBody);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": `@vinades/mcp-dauthau Node/${process.versions.node}`,
    "X-MCP-API-Key": cfg.gatewayKey,
    "X-Dauthau-Apikey": cfg.apikey,
    "X-Dauthau-Hashsecret": hashsecret,
    "X-Dauthau-Timestamp": ts.toString(),
  };
  if (cfg.hashAlgo === "bcrypt") {
    headers["X-Dauthau-Method"] = "password_verify";
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  let lastResult: ForwardResult | undefined;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= cfg.retryMax; attempt++) {
    // Delay exponential backoff trước retry (không delay lần đầu)
    if (attempt > 0) {
      const delayMs = cfg.retryBaseMs * Math.pow(2, attempt - 1);
      logWarn("retry gateway", { attempt, delay_ms: delayMs, max: cfg.retryMax });
      await sleep(delayMs);
    }

    const result = await doFetch(fetchImpl, cfg, headers, serializedBody);

    if (result.type === "success") {
      // 5xx → retry, 4xx/2xx → trả ngay (không retry lỗi client)
      if (result.value.status >= 500 && attempt < cfg.retryMax) {
        lastResult = result.value;
        logWarn("gateway 5xx, sẽ retry", { status: result.value.status, attempt });
        continue;
      }
      return result.value;
    }

    // Network error / timeout → retry
    if (attempt < cfg.retryMax) {
      lastError = result.error;
      continue;
    }
    throw result.error;
  }

  // Nếu hết retry vẫn 5xx → trả response cuối (để caller forward error code)
  if (lastResult) return lastResult;
  throw lastError ?? new Error("gateway unreachable sau retry");
}

/** Kết quả 1 lần fetch: thành công (có HTTP response) hoặc lỗi mạng/timeout. */
type FetchOutcome =
  | { type: "success"; value: ForwardResult }
  | { type: "error"; error: Error };

/** Thực hiện 1 lần POST lên gateway — tách riêng để retry loop gọn. */
async function doFetch(
  fetchImpl: typeof fetch,
  cfg: Config,
  headers: Record<string, string>,
  body: string,
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const start = Date.now();

  try {
    const res = await fetchImpl(cfg.gatewayUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const contentType = res.headers.get("content-type") ?? "";

    const validTypes = ["application/json", "text/event-stream", "text/plain"];
    if (!validTypes.some((t) => contentType.includes(t))) {
      logError("gateway content-type không hợp lệ", { content_type: contentType, status: res.status });
    }

    let responseBody: unknown;
    if (contentType.includes("application/json")) {
      responseBody = await res.json();
    } else {
      const txt = await res.text();
      responseBody = txt ? safeParseJson(txt) : null;
    }

    logInfo("gateway response", { status: res.status, latency_ms: latencyMs, content_type: contentType });

    // Clock skew warning: nếu gateway trả header Date hoặc lỗi timestamp → cảnh báo user
    checkClockSkew(res, responseBody);

    return { type: "success", value: { status: res.status, body: responseBody } };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if ((err as Error).name === "AbortError") {
      logError("gateway timeout", { latency_ms: latencyMs, timeout_ms: cfg.timeoutMs });
      return { type: "error", error: new Error(`gateway timeout sau ${cfg.timeoutMs}ms`) };
    }
    logError("gateway error", { latency_ms: latencyMs, err: (err as Error).message });
    return { type: "error", error: err as Error };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cảnh báo nếu clock client lệch server > 30s. */
function checkClockSkew(res: Response, body: unknown): void {
  // Cách 1: header Date từ server
  const serverDate = res.headers.get("date");
  if (serverDate) {
    const serverTime = Math.floor(new Date(serverDate).getTime() / 1000);
    const clientTime = Math.floor(Date.now() / 1000);
    const skew = Math.abs(serverTime - clientTime);
    if (skew > 30) {
      logWarn("clock skew detected — đồng hồ máy lệch server", {
        skew_seconds: skew,
        hint: "Sync NTP: Windows → 'w32tm /resync', Linux/macOS → 'sudo sntp -sS time.google.com'",
      });
    }
    return;
  }

  // Cách 2: lỗi timestamp từ gateway response body
  if (body && typeof body === "object" && "message" in (body as Record<string, unknown>)) {
    const msg = String((body as Record<string, unknown>).message).toLowerCase();
    if (msg.includes("timestamp") && (msg.includes("expired") || msg.includes("invalid") || msg.includes("lệch"))) {
      logWarn("gateway báo lỗi timestamp — có thể clock skew", {
        hint: "Sync NTP: Windows → 'w32tm /resync', Linux/macOS → 'sudo sntp -sS time.google.com'",
      });
    }
  }
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}

/**
 * Đọc + validate env. Fail-fast với message rõ ràng qua stderr (vì stdout
 * dành cho MCP JSON-RPC framing — KHÔNG được lẫn log vào).
 *
 * KHÔNG log giá trị apikey/apisecret/hashsecret theo .claude/rules/security.md §4
 * (file rule của repo Go nhưng wrapper Node cũng áp dụng).
 */

export type HashAlgo = "md5" | "bcrypt";

export interface Config {
  /** DauThau apikey của khách (giữ trên máy khách, KHÔNG forward lên gateway dưới dạng plaintext). */
  apikey: string;
  /** DauThau apisecret của khách — chỉ ở RAM wrapper, dùng để sign hashsecret mỗi request. */
  apisecret: string;
  /** URL gateway MCP do DauThau cấp khi đăng ký. */
  gatewayUrl: string;
  /** MCP API key do admin cấp — gửi qua header `X-MCP-API-Key`. */
  gatewayKey: string;
  /** Thuật toán sign hashsecret. Default `bcrypt` (khớp NukeViet PASSWORD_DEFAULT). */
  hashAlgo: HashAlgo;
  /** Log level wrapper → stderr. Mặc định `info`. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Timeout request HTTPS lên gateway (ms). Default 30000. */
  timeoutMs: number;
  /** Số lần retry tối đa khi gateway trả 5xx. Default 3. 0 = không retry. */
  retryMax: number;
  /** Base delay (ms) cho exponential backoff. Default 200. Delay = base * 2^attempt. */
  retryBaseMs: number;
}

const REQUIRED_ENV = [
  "DAUTHAU_APIKEY",
  "DAUTHAU_APISECRET",
  "MCP_GATEWAY_URL",
  "MCP_GATEWAY_KEY",
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  ensureNodeVersion();

  const missing = REQUIRED_ENV.filter((k) => !env[k] || env[k]!.trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `Thiếu env: ${missing.join(", ")}. ` +
        `Xem mẫu .mcp.json trong README của repo.`,
    );
  }

  const hashAlgoRaw = (env.DAUTHAU_HASH_ALGO ?? "bcrypt").toLowerCase();
  if (hashAlgoRaw !== "md5" && hashAlgoRaw !== "bcrypt") {
    throw new Error(
      `DAUTHAU_HASH_ALGO chỉ chấp nhận "md5" hoặc "bcrypt", got "${env.DAUTHAU_HASH_ALGO}"`,
    );
  }

  const gatewayUrl = env.MCP_GATEWAY_URL!.trim();
  if (!gatewayUrl.startsWith("https://") && !gatewayUrl.startsWith("http://")) {
    throw new Error(`MCP_GATEWAY_URL phải bắt đầu bằng https:// hoặc http://`);
  }
  validateGatewayUrl(gatewayUrl);

  const logLevelRaw = (env.LOG_LEVEL ?? "info").toLowerCase();
  const logLevel = ["debug", "info", "warn", "error"].includes(logLevelRaw)
    ? (logLevelRaw as Config["logLevel"])
    : "info";

  const timeoutMs = Number.parseInt(env.MCP_GATEWAY_TIMEOUT_MS ?? "30000", 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error(
      `MCP_GATEWAY_TIMEOUT_MS phải là số nguyên 1000-120000 ms, got "${env.MCP_GATEWAY_TIMEOUT_MS}"`,
    );
  }

  const retryMax = Number.parseInt(env.MCP_GATEWAY_RETRY_MAX ?? "3", 10);
  if (!Number.isFinite(retryMax) || retryMax < 0 || retryMax > 10) {
    throw new Error(`MCP_GATEWAY_RETRY_MAX phải là số nguyên 0-10, got "${env.MCP_GATEWAY_RETRY_MAX}"`);
  }

  const retryBaseMs = Number.parseInt(env.MCP_GATEWAY_RETRY_BASE_MS ?? "200", 10);
  if (!Number.isFinite(retryBaseMs) || retryBaseMs < 50 || retryBaseMs > 5000) {
    throw new Error(`MCP_GATEWAY_RETRY_BASE_MS phải là số nguyên 50-5000, got "${env.MCP_GATEWAY_RETRY_BASE_MS}"`);
  }

  return {
    apikey: env.DAUTHAU_APIKEY!.trim(),
    apisecret: env.DAUTHAU_APISECRET!.trim(),
    gatewayUrl,
    gatewayKey: env.MCP_GATEWAY_KEY!.trim(),
    hashAlgo: hashAlgoRaw,
    logLevel,
    timeoutMs,
    retryMax,
    retryBaseMs,
  };
}

function ensureNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0]!, 10);
  if (!Number.isFinite(major) || major < 22) {
    throw new Error(
      `Node.js >= 22 required, đang chạy ${process.version}. Tải LTS tại https://nodejs.org/`,
    );
  }
}

/** Chặn SSRF: không cho MCP_GATEWAY_URL trỏ vào private IP / localhost / metadata endpoint. */
function validateGatewayUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`MCP_GATEWAY_URL không phải URL hợp lệ`);
  }

  const hostname = url.hostname.replace(/^\[/, "").replace(/\]$/, ""); // strip IPv6 brackets

  // Blocklist: localhost, loopback, link-local, private ranges
  const blocked = [
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "169.254.169.254", // AWS/GCP metadata
    "metadata.google.internal",
  ];
  if (blocked.includes(hostname)) {
    throw new Error(`MCP_GATEWAY_URL không được trỏ tới ${hostname} (private/metadata endpoint)`);
  }

  // Chặn private IPv4 ranges: 10.x, 172.16-31.x, 192.168.x, 127.x
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(hostname)) {
    throw new Error(`MCP_GATEWAY_URL không được trỏ tới private IP range (${hostname})`);
  }

  // Chặn link-local IPv4
  if (/^169\.254\./.test(hostname)) {
    throw new Error(`MCP_GATEWAY_URL không được trỏ tới link-local (169.254.x.x)`);
  }
}

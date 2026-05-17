/**
 * Diagnostic mode: chạy 3 check nhanh giúp user xác định lỗi cấu hình / mạng.
 *
 * Output user-friendly (✓ / ✗) ra stdout (OK vì mode này KHÔNG chạy MCP framing).
 */

import { resolve as dnsResolve } from "node:dns/promises";

import type { Config } from "./config.js";
import { signHashsecret, nowUnix } from "./sign.js";

/** Chạy diagnose và in kết quả ra stdout. Return true nếu tất cả pass. */
export async function runDiagnose(cfg: Config): Promise<boolean> {
  const write = (s: string) => process.stdout.write(s + "\n");
  write(`@dauthau/mcp-dauthau — chẩn đoán kết nối`);
  write(`Gateway: ${cfg.gatewayUrl}`);
  write(`Algo: ${cfg.hashAlgo} | Timeout: ${cfg.timeoutMs}ms | Retry: ${cfg.retryMax}`);
  write("---");

  let allOk = true;

  // Check 1: DNS resolve
  const hostname = new URL(cfg.gatewayUrl).hostname;
  const dnsOk = await checkDns(hostname);
  if (dnsOk) {
    write(`✓ DNS resolve ${hostname} → OK`);
  } else {
    write(`✗ DNS resolve ${hostname} → THẤT BẠI. Kiểm tra MCP_GATEWAY_URL hoặc kết nối mạng.`);
    allOk = false;
  }

  // Check 2: HTTPS handshake (timeout 5s)
  const handshakeOk = await checkHandshake(cfg.gatewayUrl);
  if (handshakeOk) {
    write(`✓ HTTPS handshake → OK`);
  } else {
    write(`✗ HTTPS handshake → THẤT BẠI. Gateway có thể đang bảo trì hoặc bị tường lửa chặn.`);
    allOk = false;
  }

  // Check 3: POST tools/list
  const toolsResult = await checkToolsList(cfg);
  if (toolsResult.ok) {
    write(`✓ POST tools/list → HTTP ${toolsResult.status} (${toolsResult.latencyMs}ms)`);
  } else {
    write(`✗ POST tools/list → ${toolsResult.error}. Kiểm tra API key / apisecret / clock.`);
    allOk = false;
  }

  write("---");
  if (allOk) {
    write("Kết luận: tất cả check đều pass. Wrapper sẵn sàng.");
  } else {
    write("Kết luận: có lỗi. Sửa theo hướng dẫn trên rồi thử lại.");
  }

  return allOk;
}

async function checkDns(hostname: string): Promise<boolean> {
  try {
    await dnsResolve(hostname);
    return true;
  } catch {
    return false;
  }
}

async function checkHandshake(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, { method: "HEAD", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface ToolsCheckResult {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

async function checkToolsList(cfg: Config): Promise<ToolsCheckResult> {
  const ts = nowUnix();
  const hashsecret = await signHashsecret(cfg.hashAlgo, cfg.apisecret, ts);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(cfg.gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `@dauthau/mcp-dauthau diagnose Node/${process.versions.node}`,
        "X-MCP-API-Key": cfg.gatewayKey,
        "X-Dauthau-Apikey": cfg.apikey,
        "X-Dauthau-Hashsecret": hashsecret,
        "X-Dauthau-Timestamp": ts.toString(),
        ...(cfg.hashAlgo === "bcrypt" ? { "X-Dauthau-Method": "password_verify" } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    return { ok: res.status === 200, status: res.status, latencyMs };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

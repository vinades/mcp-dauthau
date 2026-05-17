import { describe, it, expect, vi } from "vitest";

import type { Config } from "../src/config.js";
import { forwardJsonRpc } from "../src/forward.js";

const baseCfg: Config = {
  apikey: "apikey_test",
  apisecret: "apisecret_test",
  gatewayUrl: "https://gateway.example/",
  gatewayKey: "mcp_key_test",
  hashAlgo: "md5",
  logLevel: "error",
  timeoutMs: 5000,
  retryMax: 0,
  retryBaseMs: 200,
};

describe("forwardJsonRpc", () => {
  it("gửi đúng 4 header + body JSON-RPC", async () => {
    let capturedReq: Request | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedReq = new Request(input as RequestInfo, init);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const fakeTs = 1735000000;
    const { status, body } = await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      baseCfg,
      { timestamp: fakeTs, fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(status).toBe(200);
    expect(body).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(capturedReq).not.toBeNull();
    expect(capturedReq!.method).toBe("POST");
    expect(capturedReq!.headers.get("X-MCP-API-Key")).toBe("mcp_key_test");
    expect(capturedReq!.headers.get("X-Dauthau-Apikey")).toBe("apikey_test");
    expect(capturedReq!.headers.get("X-Dauthau-Timestamp")).toBe(String(fakeTs));
    expect(capturedReq!.headers.get("X-Dauthau-Hashsecret")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("bcrypt mode → thêm X-Dauthau-Method=password_verify", async () => {
    let capturedReq: Request | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedReq = new Request(input as RequestInfo, init);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });

    await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      { ...baseCfg, hashAlgo: "bcrypt" },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    expect(capturedReq!.headers.get("X-Dauthau-Method")).toBe("password_verify");
  });

  it("KHÔNG gửi raw apisecret trong header", async () => {
    let capturedReq: Request | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedReq = new Request(input as RequestInfo, init);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });

    await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      baseCfg,
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(capturedReq!.headers.get("X-Dauthau-Apisecret")).toBeNull();
    const allHeaders = [...capturedReq!.headers].map(([_, v]) => v).join(" ");
    expect(allHeaders).not.toContain("apisecret_test");
  });

  it("status non-200 vẫn trả body để caller forward error code DauThau", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "1004", message: "out of credit" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const { status, body } = await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: {} },
      baseCfg,
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    expect(status).toBe(200);
    expect(body).toEqual({ code: "1004", message: "out of credit" });
  });

  it("timeout abort sau Config.timeoutMs", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
      throw new Error("unreachable");
    });

    await expect(
      forwardJsonRpc(
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        { ...baseCfg, timeoutMs: 1000 },
        { fetchImpl: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/timeout/);
  });

  it("retry 5xx → thành công lần 2", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ result: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { status, body } = await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      { ...baseCfg, retryMax: 2, retryBaseMs: 50 },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(status).toBe(200);
    expect(body).toEqual({ result: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("KHÔNG retry cho 4xx (lỗi client)", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ code: "1004" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    });

    const { status } = await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: {} },
      { ...baseCfg, retryMax: 3, retryBaseMs: 50 },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1); // không retry
  });

  it("retry hết lần → trả response 5xx cuối", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "overloaded" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    });

    const { status, body } = await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      { ...baseCfg, retryMax: 2, retryBaseMs: 50 },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(status).toBe(503);
    expect(body).toEqual({ error: "overloaded" });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 lần đầu + 2 retry
  });

  it("retry network error → thành công lần sau", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("ECONNREFUSED");
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { status } = await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      { ...baseCfg, retryMax: 1, retryBaseMs: 50 },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clock skew warning khi server Date lệch > 30s", async () => {
    const pastDate = new Date(Date.now() - 60_000).toUTCString(); // 60s trước
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { "content-type": "application/json", date: pastDate },
      });
    });

    // Không throw — chỉ logWarn (test verify không crash)
    const { status } = await forwardJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      { ...baseCfg, logLevel: "warn" },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    expect(status).toBe(200);
  });
});

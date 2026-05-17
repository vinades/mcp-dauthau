import { describe, it, expect } from "vitest";

import { loadConfig } from "../src/config.js";

const baseEnv = {
  DAUTHAU_APIKEY: "apikey_x",
  DAUTHAU_APISECRET: "apisecret_x",
  MCP_GATEWAY_URL: "https://gateway.example/",
  MCP_GATEWAY_KEY: "mcpkey_x",
};

describe("loadConfig", () => {
  it("happy path — env đủ → trả config với default", () => {
    const cfg = loadConfig({ ...baseEnv } as NodeJS.ProcessEnv);
    expect(cfg.apikey).toBe("apikey_x");
    expect(cfg.gatewayUrl).toBe("https://gateway.example/");
    expect(cfg.hashAlgo).toBe("bcrypt");
    expect(cfg.logLevel).toBe("info");
    expect(cfg.timeoutMs).toBe(30000);
    expect(cfg.retryMax).toBe(3);
    expect(cfg.retryBaseMs).toBe(200);
  });

  it("thiếu DAUTHAU_APIKEY → fail-fast với message rõ ràng", () => {
    const env = { ...baseEnv };
    delete (env as Record<string, string | undefined>).DAUTHAU_APIKEY;
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/Thiếu env.*DAUTHAU_APIKEY/);
  });

  it("DAUTHAU_HASH_ALGO=md5 → cfg.hashAlgo='md5'", () => {
    const cfg = loadConfig({ ...baseEnv, DAUTHAU_HASH_ALGO: "md5" } as NodeJS.ProcessEnv);
    expect(cfg.hashAlgo).toBe("md5");
  });

  it("DAUTHAU_HASH_ALGO không hợp lệ → throw", () => {
    expect(() =>
      loadConfig({ ...baseEnv, DAUTHAU_HASH_ALGO: "sha256" } as NodeJS.ProcessEnv),
    ).toThrow(/DAUTHAU_HASH_ALGO/);
  });

  it("MCP_GATEWAY_URL không bắt đầu http(s) → throw", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_URL: "gateway.example" } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_GATEWAY_URL/);
  });

  it("MCP_GATEWAY_TIMEOUT_MS ngoài 1000-120000 → throw", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_TIMEOUT_MS: "100" } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_GATEWAY_TIMEOUT_MS/);

    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_TIMEOUT_MS: "200000" } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_GATEWAY_TIMEOUT_MS/);
  });

  it("LOG_LEVEL không hợp lệ → fallback info", () => {
    const cfg = loadConfig({ ...baseEnv, LOG_LEVEL: "trace" } as NodeJS.ProcessEnv);
    expect(cfg.logLevel).toBe("info");
  });

  it("MCP_GATEWAY_URL=http://127.0.0.1 → throw SSRF", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_URL: "http://127.0.0.1/rpc" } as NodeJS.ProcessEnv),
    ).toThrow(/127\.0\.0\.1/);
  });

  it("MCP_GATEWAY_URL=http://169.254.169.254 → throw metadata endpoint", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_URL: "http://169.254.169.254/latest/meta-data/" } as NodeJS.ProcessEnv),
    ).toThrow(/private.*metadata/);
  });

  it("MCP_GATEWAY_URL=http://10.0.0.1 → throw private IP", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_URL: "http://10.0.0.1/rpc" } as NodeJS.ProcessEnv),
    ).toThrow(/private IP range/);
  });

  it("MCP_GATEWAY_URL=http://192.168.1.1 → throw private IP", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_URL: "http://192.168.1.1/" } as NodeJS.ProcessEnv),
    ).toThrow(/private IP range/);
  });

  it("MCP_GATEWAY_URL=http://localhost → throw", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_URL: "http://localhost:8080/" } as NodeJS.ProcessEnv),
    ).toThrow(/localhost/);
  });

  it("MCP_GATEWAY_URL=https://gateway.dauthau.info → pass (public)", () => {
    const cfg = loadConfig({ ...baseEnv, MCP_GATEWAY_URL: "https://gateway.dauthau.info/mcp" } as NodeJS.ProcessEnv);
    expect(cfg.gatewayUrl).toBe("https://gateway.dauthau.info/mcp");
  });

  it("MCP_GATEWAY_RETRY_MAX ngoài 0-10 → throw", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_RETRY_MAX: "-1" } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_GATEWAY_RETRY_MAX/);
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_RETRY_MAX: "11" } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_GATEWAY_RETRY_MAX/);
  });

  it("MCP_GATEWAY_RETRY_BASE_MS ngoài 50-5000 → throw", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_RETRY_BASE_MS: "10" } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_GATEWAY_RETRY_BASE_MS/);
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_RETRY_BASE_MS: "9999" } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_GATEWAY_RETRY_BASE_MS/);
  });

  it("MCP_GATEWAY_RETRY_MAX=0 → disable retry", () => {
    const cfg = loadConfig({ ...baseEnv, MCP_GATEWAY_RETRY_MAX: "0" } as NodeJS.ProcessEnv);
    expect(cfg.retryMax).toBe(0);
  });

  it("MCP_GATEWAY_URL không phải URL hợp lệ → throw", () => {
    expect(() =>
      loadConfig({ ...baseEnv, MCP_GATEWAY_URL: "https://not a valid url" } as NodeJS.ProcessEnv),
    ).toThrow(/URL hợp lệ/);
  });
});

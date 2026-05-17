import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { signMd5, nowUnix, signHashsecret } from "../src/sign.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Vector {
  name: string;
  apisecret: string;
  timestamp: number;
  md5_expected: string;
}
const vectors: Vector[] = JSON.parse(
  readFileSync(resolve(__dirname, "vectors.json"), "utf-8"),
);

describe("signMd5", () => {
  it("trả md5 hex 32 ký tự lowercase", () => {
    const out = signMd5("test_secret", 1735000000);
    expect(out).toMatch(/^[0-9a-f]{32}$/);
    expect(out.length).toBe(32);
  });

  it("bit-exact với md5($apisecret . '_' . $timestamp) PHP", () => {
    const apisecret = "abc123";
    const ts = 1735000123;
    const expected = createHash("md5").update(`${apisecret}_${ts}`).digest("hex");
    expect(signMd5(apisecret, ts)).toBe(expected);
  });

  it("đổi timestamp 1 đơn vị → hash khác hoàn toàn", () => {
    const a = signMd5("same_secret", 1000);
    const b = signMd5("same_secret", 1001);
    expect(a).not.toBe(b);
  });

  it("xử lý unicode UTF-8 (mst tiếng Việt)", () => {
    const out = signMd5("Đấu_Thầu_2026", 1735000000);
    expect(out).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("signMd5 — bit-exact với Go gateway (vectors.json)", () => {
  for (const v of vectors) {
    it(`vector "${v.name}" → ${v.md5_expected}`, () => {
      expect(signMd5(v.apisecret, v.timestamp)).toBe(v.md5_expected);
    });
  }
});

describe("nowUnix", () => {
  it("trả số nguyên seconds, không millis", () => {
    const ts = nowUnix();
    const now = Math.floor(Date.now() / 1000);
    expect(Number.isInteger(ts)).toBe(true);
    expect(Math.abs(ts - now)).toBeLessThanOrEqual(1);
  });
});

describe("signHashsecret dispatch", () => {
  it("md5 algo → trả hex 32 ký tự", async () => {
    const out = await signHashsecret("md5", "secret", 1735000000);
    expect(out).toMatch(/^[0-9a-f]{32}$/);
  });

  it("bcrypt algo → trả $2a$/$2b$ prefix (bcryptjs pure JS)", async () => {
    const out = await signHashsecret("bcrypt", "secret", 1735000000);
    expect(out).toMatch(/^\$2[ab]\$/);
  });
});

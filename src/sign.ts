/**
 * Sign hashsecret cho request lên DauThau backend.
 *
 * Test vector chung ở test/vectors.json — đảm bảo bit-exact với backend gateway.
 *
 * Algo `md5`:    md5(apisecret + "_" + timestamp) → hex lowercase 32 ký tự.
 * Algo `bcrypt`: bcrypt(apisecret + "_" + timestamp, cost=10) → `$2y$...`.
 *
 * Backend chỉ chấp nhận skew window hẹp (vài giây) — sign per-request, KHÔNG cache.
 */

import { createHash } from "node:crypto";

import type { HashAlgo } from "./config.js";

/** Trả unix timestamp (seconds). */
export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sign md5 hashsecret theo công thức md5(apisecret + "_" + timestamp). */
export function signMd5(apisecret: string, timestamp: number): string {
  return createHash("md5").update(`${apisecret}_${timestamp}`).digest("hex");
}

/**
 * Sign bcrypt hashsecret cho tài khoản có config `password_hash`.
 * Lazy import — chỉ require khi DAUTHAU_HASH_ALGO=bcrypt để giảm cold-start cho user md5.
 */
export async function signBcrypt(apisecret: string, timestamp: number): Promise<string> {
  let bcrypt: { hash(s: string, rounds: number): Promise<string> };
  try {
    bcrypt = (await import("bcrypt")) as unknown as typeof bcrypt;
  } catch (err) {
    throw new Error(
      `DAUTHAU_HASH_ALGO=bcrypt nhưng module bcrypt chưa được cài. ` +
        `Chạy: npm install bcrypt@^5.1.1. Lỗi: ${(err as Error).message}`,
    );
  }
  return bcrypt.hash(`${apisecret}_${timestamp}`, 10);
}

/** Sign theo algo cấu hình. Mỗi request 1 timestamp + 1 hashsecret mới. */
export async function signHashsecret(
  algo: HashAlgo,
  apisecret: string,
  timestamp: number,
): Promise<string> {
  switch (algo) {
    case "md5":
      return signMd5(apisecret, timestamp);
    case "bcrypt":
      return signBcrypt(apisecret, timestamp);
  }
}

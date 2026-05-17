/**
 * Load shared prompt assets (mcp-instructions.md + mcp-prompts-tools.json).
 *
 * Sau build: assets nằm ở `dist/assets/` (cùng thư mục với dist/index.js).
 * Dev mode (tsx src/index.ts): fallback `../dist/assets/` relative tới src/.
 *
 * Source of truth: ../mcp-dauthau/assets/ — KHÔNG sửa file local.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve đường dẫn tới assets/, hỗ trợ cả build và dev mode. */
function resolveAssetsDir(): string {
  // Build mode: dist/assets/ nằm cạnh dist/index.js (cùng thư mục __dirname)
  const buildPath = resolve(__dirname, "assets");
  if (existsSync(buildPath)) {
    return buildPath;
  }

  // Dev mode (tsx src/index.ts): __dirname = src/, thử ../assets/ (committed)
  const localPath = resolve(__dirname, "..", "assets");
  if (existsSync(localPath)) {
    return localPath;
  }

  // Fallback: ../dist/assets/
  const devPath = resolve(__dirname, "..", "dist", "assets");
  if (existsSync(devPath)) {
    return devPath;
  }

  throw new Error(
    `Không tìm thấy thư mục assets/. Chạy "npm run build" trước, hoặc kiểm tra sibling repo mcp-dauthau.`,
  );
}

/** Load system prompt MCP (dùng cho ServerOptions.instructions). */
export function loadInstructions(): string {
  const dir = resolveAssetsDir();
  const file = resolve(dir, "mcp-instructions.md");
  if (!existsSync(file)) {
    throw new Error(`Thiếu file mcp-instructions.md tại ${dir}`);
  }
  return readFileSync(file, "utf-8");
}

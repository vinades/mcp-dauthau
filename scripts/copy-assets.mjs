/**
 * copy-assets.mjs — prebuild step: copy assets vào dist/assets/.
 *
 * Ưu tiên:
 *   1. Sibling repo ../mcp-dauthau/assets/ (source of truth, nếu có)
 *   2. Fallback: assets/ ở root repo này (đã commit vào git)
 *
 * Nếu có sibling repo → cập nhật cả assets/ (commit) lẫn dist/assets/ (build).
 * Nếu không có sibling repo → dùng assets/ đã commit sẵn → copy vào dist/assets/.
 *
 * Chạy bởi `npm run build` trước tsc.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SIBLING_REPO = resolve(ROOT, "..", "mcp-dauthau");
const SIBLING_ASSETS = resolve(SIBLING_REPO, "assets");
const SIBLING_TESTDATA = resolve(SIBLING_REPO, "testdata");
const LOCAL_ASSETS = resolve(ROOT, "assets");
const DIST_ASSETS = resolve(ROOT, "dist", "assets");
const VECTORS_DEST = resolve(ROOT, "test", "vectors.json");

/** File bắt buộc */
const REQUIRED_ASSETS = [
  "mcp-instructions.md",
  "mcp-prompts-tools.json",
];

/** File tuỳ chọn: test vector chia sẻ */
const OPTIONAL_VECTORS = "sign_vectors.json";

function main() {
  // Xác định nguồn assets
  const hasSibling = existsSync(SIBLING_ASSETS);
  const source = hasSibling ? SIBLING_ASSETS : LOCAL_ASSETS;

  if (!existsSync(source)) {
    console.error(
      `[copy-assets] LỖI: Không tìm thấy assets.\n` +
      `  Cần ít nhất 1 trong 2:\n` +
      `    - Sibling repo: cd .. && git clone git@github.com:vinades/mcp-dauthau.git\n` +
      `    - Thư mục assets/ trong repo (đã commit)\n`,
    );
    process.exit(1);
  }

  if (hasSibling) {
    console.error(`[copy-assets] Dùng sibling repo: ${SIBLING_ASSETS}`);
  } else {
    console.error(`[copy-assets] Sibling repo không có, dùng assets/ local`);
  }

  // Tạo thư mục đích
  if (!existsSync(DIST_ASSETS)) {
    mkdirSync(DIST_ASSETS, { recursive: true });
  }
  if (!existsSync(LOCAL_ASSETS)) {
    mkdirSync(LOCAL_ASSETS, { recursive: true });
  }

  // Copy required assets
  for (const file of REQUIRED_ASSETS) {
    const src = resolve(source, file);
    if (!existsSync(src)) {
      console.error(`[copy-assets] LỖI: Thiếu file ${src}`);
      process.exit(1);
    }

    // Luôn copy vào dist/assets/
    copyFileSync(src, resolve(DIST_ASSETS, file));

    // Nếu nguồn là sibling → cập nhật assets/ local (commit)
    if (hasSibling) {
      copyFileSync(src, resolve(LOCAL_ASSETS, file));
    }

    console.error(`[copy-assets] ✓ ${file}`);
  }

  // Copy test vectors (tuỳ chọn)
  if (hasSibling) {
    const vectorsSrc = resolve(SIBLING_TESTDATA, OPTIONAL_VECTORS);
    if (existsSync(vectorsSrc)) {
      copyFileSync(vectorsSrc, VECTORS_DEST);
      console.error(`[copy-assets] ✓ ${OPTIONAL_VECTORS} → test/vectors.json`);
    } else {
      console.error(`[copy-assets] ⚠ ${OPTIONAL_VECTORS} không tìm thấy (bỏ qua)`);
    }
  }

  // Validate JSON
  for (const file of REQUIRED_ASSETS.filter((f) => f.endsWith(".json"))) {
    const dest = resolve(DIST_ASSETS, file);
    try {
      JSON.parse(readFileSync(dest, "utf-8"));
    } catch (err) {
      console.error(`[copy-assets] LỖI: ${file} không phải JSON hợp lệ: ${err.message}`);
      process.exit(1);
    }
  }

  console.error(`[copy-assets] Hoàn tất — ${REQUIRED_ASSETS.length} file vào dist/assets/`);
}

main();

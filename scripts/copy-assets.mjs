/**
 * copy-assets.mjs — prebuild step: copy shared assets từ sibling repo Go.
 *
 * Source of truth: ../dauthau-mcp-service/assets/
 * Destination: dist/assets/ (đi kèm vào npm tarball)
 *
 * Chạy bởi `npm run build` trước tsc.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SIBLING_REPO = resolve(ROOT, "..", "dauthau-mcp-service");
const ASSETS_SRC = resolve(SIBLING_REPO, "assets");
const TESTDATA_SRC = resolve(SIBLING_REPO, "testdata");
const ASSETS_DEST = resolve(ROOT, "dist", "assets");
const VECTORS_DEST = resolve(ROOT, "test", "vectors.json");

/** File bắt buộc copy vào dist/assets/ */
const REQUIRED_ASSETS = [
  "mcp-instructions.md",
  "mcp-prompts-tools.json",
];

/** File tuỳ chọn: test vector chia sẻ */
const OPTIONAL_VECTORS = "sign_vectors.json";

function main() {
  // Kiểm tra sibling repo tồn tại
  if (!existsSync(ASSETS_SRC)) {
    console.error(
      `[copy-assets] LỖI: Không tìm thấy ${ASSETS_SRC}\n` +
      `  Hướng dẫn: git clone sibling repo cạnh thư mục mcp-node-wrapper:\n` +
      `    cd .. && git clone https://github.com/dauthau/dauthau-mcp-service.git\n` +
      `  Cấu trúc mong muốn:\n` +
      `    parent/\n` +
      `    ├── mcp-node-wrapper/     (repo này)\n` +
      `    └── dauthau-mcp-service/  (source of truth assets)\n`,
    );
    process.exit(1);
  }

  // Tạo dist/assets/ nếu chưa có
  if (!existsSync(ASSETS_DEST)) {
    mkdirSync(ASSETS_DEST, { recursive: true });
  }

  // Copy required assets
  for (const file of REQUIRED_ASSETS) {
    const src = resolve(ASSETS_SRC, file);
    const dest = resolve(ASSETS_DEST, file);
    if (!existsSync(src)) {
      console.error(`[copy-assets] LỖI: Thiếu file ${src}`);
      process.exit(1);
    }
    copyFileSync(src, dest);
    console.error(`[copy-assets] ✓ ${file} → dist/assets/`);
  }

  // Copy test vectors (tuỳ chọn)
  const vectorsSrc = resolve(TESTDATA_SRC, OPTIONAL_VECTORS);
  if (existsSync(vectorsSrc)) {
    copyFileSync(vectorsSrc, VECTORS_DEST);
    console.error(`[copy-assets] ✓ ${OPTIONAL_VECTORS} → test/vectors.json`);
  } else {
    console.error(`[copy-assets] ⚠ ${OPTIONAL_VECTORS} không tìm thấy (bỏ qua)`);
  }

  // Validate JSON parse được
  for (const file of REQUIRED_ASSETS.filter((f) => f.endsWith(".json"))) {
    const dest = resolve(ASSETS_DEST, file);
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

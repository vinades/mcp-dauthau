/**
 * copy-assets.mjs — prebuild step: copy assets vào dist/assets/.
 *
 * Chỉ dùng assets/ đã commit sẵn trong repo → copy vào dist/assets/ 
 * để đóng gói khi npm publish (do package.json chỉ include dist/).
 *
 * Chạy bởi `npm run build` trước tsc.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const LOCAL_ASSETS = resolve(ROOT, "assets");
const DIST_ASSETS = resolve(ROOT, "dist", "assets");

/** File bắt buộc */
const REQUIRED_ASSETS = [
  "mcp-instructions.md",
  "mcp-prompts-tools.json",
];

function main() {
  const source = LOCAL_ASSETS;

  if (!existsSync(source)) {
    console.error(`[copy-assets] LỖI: Không tìm thấy thư mục assets/ trong repo.\n`);
    process.exit(1);
  }

  // Tạo thư mục đích
  if (!existsSync(DIST_ASSETS)) {
    mkdirSync(DIST_ASSETS, { recursive: true });
  }

  // Copy required assets
  for (const file of REQUIRED_ASSETS) {
    const src = resolve(source, file);
    if (!existsSync(src)) {
      console.error(`[copy-assets] LỖI: Thiếu file ${src}`);
      process.exit(1);
    }

    // Copy vào dist/assets/
    copyFileSync(src, resolve(DIST_ASSETS, file));
    console.error(`[copy-assets] ✓ ${file}`);
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

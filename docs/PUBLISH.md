# Runbook publish `@vinades/mcp-dauthau` lên npm

## Pre-flight (1 lần duy nhất)

1. **Đăng ký org/scope `@vinades`** tại https://www.npmjs.com/org/create (paid plan KHÔNG cần — public package free trên scope).
2. **Bật 2FA** cho tài khoản npm publisher: https://docs.npmjs.com/configuring-two-factor-authentication.
3. **Tạo automation token** (không cần TOTP mỗi lần publish):
   - npmjs.com → Access Tokens → Generate New → "Granular Access Token"
   - Scope: `Read and write` cho `@vinades/*`.
   - Lưu vào GitHub Secrets: `Settings → Secrets and variables → Actions → New repository secret` tên `NPM_TOKEN`.
4. **Liên kết repo GitHub** trong `package.json` (`repository.url`) — npm sẽ tự pull README và link source.

## Publish thủ công (lần đầu hoặc khi CI fail)

```bash
cd <thư-mục-clone-repo>

# 1. Verify pre-conditions
npm ci
npm run lint        # tsc --noEmit
npm test            # vitest run
npm run build       # tsc → dist/

# 2. Bump version (semver). Major khi breaking, minor khi thêm tool/env, patch khi fix.
npm version patch   # → cập nhật package.json + tag git v0.1.1

# 3. Login (yêu cầu 2FA nếu chưa có automation token local)
npm login

# 4. Dry-run xem file nào sẽ publish (kiểm tra .npmignore không leak src/ test/ env)
npm pack --dry-run

# 5. Publish
npm publish --access public --provenance

# 6. Verify từ máy khác — không cài cứng
npx -y @vinades/mcp-dauthau@latest --version

# 7. Push tag
git push origin main --tags
```

## Publish qua CI (sau khi setup NPM_TOKEN)

```bash
# Tag push → GitHub Actions tự publish (xem .github/workflows/publish.yml)
npm version patch
git push origin main --tags
```

CI workflow `publish.yml` chạy:
1. `npm ci`
2. `npm run lint`
3. `npm test` (Node 20 trên Ubuntu)
4. `npm run build`
5. `npm publish --access public --provenance` (provenance ký SLSA attestation cho supply chain)

## Sau khi publish

- [ ] Cập nhật doc client (`README.md`, doc nội bộ DauThau) với version mới.
- [ ] Test end-to-end: gắn `.mcp.json` mới vào Claude Code, gọi 1 tool bất kỳ → verify response.
- [ ] Theo dõi npm downloads tuần đầu — báo cáo cho team.

## Rollback nếu publish nhầm version lỗi

```bash
# Trong vòng 72 giờ kể từ publish — vĩnh viễn không reuse được version đó.
npm unpublish @vinades/mcp-dauthau@0.1.X

# Hoặc deprecate (an toàn hơn — package vẫn install được nhưng có warning)
npm deprecate @vinades/mcp-dauthau@0.1.X "lỗi nghiêm trọng, dùng 0.1.Y"
```

## Checklist phòng thủ supply chain

- [x] `package.json` pin dependency cụ thể (`"@modelcontextprotocol/sdk": "1.6.0"`, KHÔNG `^`).
- [x] `npm ci` thay `npm install` trong CI để dùng `package-lock.json` chính xác.
- [x] `npm audit --audit-level=moderate` trong CI (`.github/workflows/test.yml`).
- [x] `--provenance` flag khi publish — npm registry verify build artifact ký từ GitHub Actions thật.
- [ ] **Khuyến nghị:** review `package-lock.json` mỗi PR. Tool: `npm audit signatures`.
- [ ] **Khuyến nghị:** cài Snyk / Dependabot alert security advisory.

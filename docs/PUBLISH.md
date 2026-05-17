# Runbook publish `@dauthau/mcp-dauthau` lên npm

## Pre-flight (Thiết lập 1 lần duy nhất)

Do đây là lần đầu xuất bản package lên NPM, bạn cần thực hiện các bước cấu hình tài khoản và cấp quyền cho Github Actions.

### Bước 1: Tạo tài khoản NPM và Organization `@dauthau`
1. Đăng ký/đăng nhập tài khoản cá nhân tại [npmjs.com](https://www.npmjs.com/).
2. Truy cập [trang tạo Organization](https://www.npmjs.com/org/create).
3. Nhập tên organization là `dauthau`. **Lưu ý:** Bạn có thể chọn gói miễn phí (Free plan) vì public package không bị tính phí.
4. Mời các thành viên khác trong team vào Organization (nếu cần) để cấp quyền quản trị/publish.

### Bước 2: Bật bảo mật 2 lớp (2FA)
*NPM bắt buộc tài khoản phải có 2FA để có thể publish.*
1. Bấm vào Avatar góc trên bên phải → chọn **Account**.
2. Kéo xuống mục **Two-Factor Authentication** → chọn **Enable 2FA**.
3. Sử dụng ứng dụng authenticator (Google Authenticator, Authy...) quét mã QR, nhập mã OTP để kích hoạt.

### Bước 3: Tạo NPM Token cho GitHub Actions
*Bước này giúp tự động hoá quy trình publish trên Github CI mà không bị nghẽn ở bước nhập mã OTP.*
1. Tại npmjs.com, bấm Avatar → chọn **Access Tokens**.
2. Bấm **Generate New Token** → chọn **Granular Access Token**.
3. Cấu hình Token:
   - **Token name:** `github-actions-publish` (hoặc tên tuỳ ý).
   - **Expiration:** Chọn thời hạn (ví dụ 1 năm hoặc No expiration tùy chính sách).
   - **Packages and scopes:** Tại mục *Permissions*, chọn **Read and write**. Trong danh sách *Select packages or scopes*, gõ và chọn `@dauthau`.
4. Bấm **Generate Token** ở cuối trang.
5. **COPY NGAY** đoạn mã token vừa hiện ra (mã này chỉ hiển thị một lần duy nhất).

### Bước 4: Lưu Token vào GitHub Secrets
1. Mở repo Github của dự án `mcp-dauthau`.
2. Truy cập **Settings** → **Secrets and variables** (ở menu bên trái) → **Actions**.
3. Bấm nút **New repository secret**.
4. Khai báo:
   - **Name:** Nhập chính xác `NPM_TOKEN`.
   - **Secret:** Dán mã token đã copy ở Bước 3.
5. Bấm **Add secret**.

### Bước 5: Verify liên kết GitHub
- Đảm bảo trong tệp `package.json` đã khai báo trường `"repository"` (điều này đã được làm rồi). NPM sẽ tự động lấy thông tin từ URL Github này để hiển thị `README.md` lên trang chủ của package.

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
npx -y @dauthau/mcp-dauthau@latest --version

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
3. `npm test` (Node 22 trên Ubuntu)
4. `npm run build`
5. `npm publish --access public --provenance` (provenance ký SLSA attestation cho supply chain)

## Sau khi publish

- [ ] Cập nhật doc client (`README.md`, doc nội bộ DauThau) với version mới.
- [ ] Test end-to-end: gắn `.mcp.json` mới vào Claude Code, gọi 1 tool bất kỳ → verify response.
- [ ] Theo dõi npm downloads tuần đầu — báo cáo cho team.

## Rollback nếu publish nhầm version lỗi

```bash
# Trong vòng 72 giờ kể từ publish — vĩnh viễn không reuse được version đó.
npm unpublish @dauthau/mcp-dauthau@0.1.X

# Hoặc deprecate (an toàn hơn — package vẫn install được nhưng có warning)
npm deprecate @dauthau/mcp-dauthau@0.1.X "lỗi nghiêm trọng, dùng 0.1.Y"
```

## Checklist phòng thủ supply chain

- [x] `package.json` pin dependency cụ thể (`"@modelcontextprotocol/sdk": "1.29.0"`, KHÔNG `^`).
- [x] `npm ci` thay `npm install` trong CI để dùng `package-lock.json` chính xác.
- [x] `npm audit --audit-level=high` trong CI (`.github/workflows/test.yml`).
- [x] `--provenance` flag khi publish — npm registry verify build artifact ký từ GitHub Actions thật.
- [ ] **Khuyến nghị:** review `package-lock.json` mỗi PR. Tool: `npm audit signatures`.
- [ ] **Khuyến nghị:** cài Snyk / Dependabot alert security advisory.

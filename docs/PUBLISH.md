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

### Bước 3: Cấu hình Trusted Publishing (OIDC) cho Github Actions
*Bắt đầu từ 2024, NPM khuyến nghị không sử dụng Token nữa mà dùng Trusted Publisher để kết nối thẳng Github với NPM an toàn tuyệt đối và tự động vượt qua 2FA.*
1. Truy cập vào trang quản lý package vừa tạo: `https://www.npmjs.com/package/@dauthau/mcp-dauthau`
2. Bấm sang tab **Settings** → Chọn mục **Publishing access**.
3. Cuộn xuống phần **Trusted Publishers** và bấm **Add Publisher**.
4. Khai báo thông tin kho Github của bạn:
   - **GitHub Organization:** `vinades`
   - **GitHub Repository:** `mcp-dauthau` (nếu tên repo của bạn trên thanh địa chỉ Github đang là `vinades/mcp-dauthau`).
   - **Workflow filename:** `publish.yml`
   - **Environment:** (để trống).
5. Bấm **Save**. Từ nay Github Actions có thể thoải mái publish mà không cần phải tạo hay lưu bất cứ biến Secret nào (và không bao giờ lo lỗi OTP nữa).

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

# 5. Publish thủ công (nhớ thay 123456 bằng mã OTP trên ứng dụng điện thoại)
# CHÚ Ý: KHÔNG dùng cờ --provenance ở đây vì nó chỉ hoạt động trên Github Actions.
npm publish --access public --otp=123456

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

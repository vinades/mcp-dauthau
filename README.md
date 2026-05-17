# @dauthau/mcp-dauthau

Node.js wrapper kết nối AI tool (Claude Code, Cursor, Antigravity, Windsurf...) với dịch vụ tra cứu **đấu thầu công Việt Nam** của DauThau qua giao thức [Model Context Protocol](https://modelcontextprotocol.io/).

Wrapper chạy stdio trên máy bạn, ký request local rồi forward HTTPS lên gateway. **Apisecret KHÔNG bao giờ rời máy bạn.**

[![npm version](https://img.shields.io/npm/v/@dauthau/mcp-dauthau.svg)](https://www.npmjs.com/package/@dauthau/mcp-dauthau)
[![Node.js Version](https://img.shields.io/node/v/@dauthau/mcp-dauthau.svg)](https://nodejs.org/)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](LICENSE)

---

## Tính năng

- 🔐 **Apisecret giữ local** — wrapper ký `hashsecret` per-request bằng `node:crypto` (md5) hoặc `bcrypt`, chỉ gửi chữ ký qua mạng.
- ⚡ **Zero-install** — chạy qua `npx -y @dauthau/mcp-dauthau@latest`, không cài cố định, auto-update.
- 🧩 **Pass-through proxy động** — danh sách tool query từ gateway mỗi session. Khi backend mở rộng tool, bạn KHÔNG cần update wrapper.
- 🛡️ **Tối thiểu dependency** — chỉ 1 runtime dependency (`@modelcontextprotocol/sdk`) + Node stdlib. Mỗi release publish với npm [provenance](https://docs.npmjs.com/generating-provenance-statements) SLSA.
- 🌍 **Cross-platform** — Node.js ≥ 22 trên macOS / Linux / Windows. CI test cả 3 OS × 3 Node version.

---

## Yêu cầu

- **Node.js >= 22** (LTS). Tải tại https://nodejs.org/
- Tài khoản DauThau với apikey + apisecret (đăng ký tại https://dauthau.info).
- MCP gateway key — liên hệ DauThau để được cấp.

---

## Cài đặt

KHÔNG cần `npm install`. Dùng trực tiếp qua `npx`.

### Config `.mcp.json` cho Claude Code / Cursor / Windsurf

```json
{
  "mcpServers": {
    "dauthau": {
      "command": "npx",
      "args": ["-y", "@dauthau/mcp-dauthau@latest"],
      "env": {
        "DAUTHAU_APIKEY":    "<apikey-cua-ban>",
        "DAUTHAU_APISECRET": "<apisecret-cua-ban>",
        "DAUTHAU_METHOD": "md5_verify",
        "MCP_GATEWAY_URL":   "<url-gateway-duoc-cap>",
        "MCP_GATEWAY_KEY":   "<gateway-key-duoc-cap>"
      }
    }
  }
}
```

Sau khi config, restart MCP client (Claude Code / Cursor) để nạp wrapper. AI assistant sẽ tự discover danh sách tool và bắt đầu dùng được.

### Vị trí `.mcp.json` theo client

| Client | Đường dẫn |
|---|---|
| Claude Code | `.mcp.json` trong project root, hoặc `~/.claude.json` (global) |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Antigravity | xem doc client tương ứng |

---

## Biến môi trường

### Bắt buộc

| Env | Mô tả |
|---|---|
| `DAUTHAU_APIKEY` | Apikey từ tài khoản DauThau của bạn |
| `DAUTHAU_APISECRET` | Apisecret tương ứng (giữ local, dùng để ký hashsecret) |
| `MCP_GATEWAY_URL` | URL endpoint gateway (DauThau cấp khi đăng ký) |
| `MCP_GATEWAY_KEY` | Gateway subscription key (DauThau cấp) |

### Tuỳ chọn

| Env | Default | Mô tả |
|---|---|---|
| `DAUTHAU_METHOD` | `password_verify` | Phương thức xác thực chữ ký: `password_verify` (mặc định, dùng bcrypt) hoặc `md5_verify` (dùng md5). |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` — log ra **stderr** (stdout dành cho MCP framing). |
| `MCP_GATEWAY_TIMEOUT_MS` | `30000` | Timeout HTTPS request lên gateway, range 1000-120000. |

---

## Bảo mật

- **Apisecret KHÔNG bao giờ gửi qua mạng.** Wrapper ký `hashsecret = md5(apisecret + "_" + timestamp)` local, chỉ gửi `hashsecret` + `timestamp` (Unix seconds) qua header.
- Wrapper **KHÔNG log** giá trị nhạy cảm: apikey, apisecret, hashsecret, gateway key, raw body. Log chỉ chứa: tool name, latency, status, error message.
- Mọi credential giữ trong RAM scope process — KHÔNG persist ra disk/cache.
- Mỗi request 1 timestamp mới + 1 hashsecret mới — chống replay attack (gateway verify skew window phía server).

### Lưu ý

- Khi bạn paste apisecret vào `.mcp.json`, file đó phải được bảo vệ (chmod 600 trên Unix, ACL hạn chế trên Windows). KHÔNG commit `.mcp.json` chứa apisecret lên git.
- Cold-start `npx` lần đầu mỗi session khoảng 200-500ms để tải package vào cache. Sau đó session sau dùng cache local.

---

## Troubleshooting

### `Thiếu env: DAUTHAU_APIKEY, ...`

Kiểm tra block `env` trong `.mcp.json` đã có đủ 4 biến bắt buộc. Restart MCP client sau khi sửa.

### `Node.js >= 22 required`

Wrapper yêu cầu Node 22+ (LTS). Cài LTS mới nhất tại https://nodejs.org/.

### `gateway timeout sau 30000ms`

Mạng chậm hoặc gateway tạm thời không phản hồi. Tăng timeout qua `MCP_GATEWAY_TIMEOUT_MS=60000` hoặc kiểm tra kết nối internet.

### Clock skew (lỗi liên quan timestamp)

Đồng hồ máy lệch so với server > 60s. Sync NTP:

- **macOS / Linux:** `sudo sntp -sS time.google.com` hoặc `sudo timedatectl set-ntp on`
- **Windows:** mở PowerShell admin, chạy `w32tm /resync`

### Kiểm tra wrapper trước khi tin tưởng

```bash
npx -y @dauthau/mcp-dauthau@latest --version
npx -y @dauthau/mcp-dauthau@latest --help
```

---

## Phát triển local

```bash
git clone https://github.com/vinades/mcp-dauthau.git
cd mcp-dauthau
npm install
npm run lint       # tsc --noEmit
npm test           # vitest unit + integration mock
npm run build      # tsc → dist/
node dist/index.js --version
```

Roadmap chi tiết theo Phase: [docs/Plan.md](docs/Plan.md).
Quy ước code và mental model: [CLAUDE.md](CLAUDE.md).
Hướng dẫn publish npm: [PUBLISH.md](docs/PUBLISH.md).

### Đóng góp

Pull request và issue đều welcome. Trước khi PR:

1. Đảm bảo `npm run lint && npm test` pass.
2. Thêm test cho code mới (vitest, mục tiêu coverage ≥ 85% cho module core).
3. KHÔNG commit `.env`, key thật, hoặc thông tin nhạy cảm.
4. Mô tả PR ngắn gọn, đính kèm test plan.

Báo cáo lỗ hổng bảo mật: vui lòng dùng [GitHub Security Advisory](../../security/advisories/new) (private) trước khi public disclosure.

---

## Liên kết

- [Model Context Protocol](https://modelcontextprotocol.io/) — chuẩn giao thức Anthropic phát triển.
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — TypeScript SDK chính chủ.
- [DauThau](https://dauthau.info) — dịch vụ tra cứu đấu thầu công Việt Nam.

---

## License

GNU General Public License v2.0

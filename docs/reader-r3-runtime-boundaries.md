# R3 — Bản đồ runtime cần cắt ở Code-OSS đã khóa

Đối chiếu local source ngày 05/10/2026, Code-OSS 1.140.0, commit
`07f806f999227108933c2e30515b26eecc1fda74`. Các path dưới đây tương đối với `code-oss/`.
Đây là inventory để lập task plan, chưa là evidence subsystem đã gỡ.
Thiết kế: [spec R3](superpowers/specs/2026-10-05-workspace-reader-r3-design.md).

## 1. Composition roots độc lập

| Tầng | Source | Việc cần kiểm tra/cắt |
| --- | --- | --- |
| Electron bootstrap | `src/main.ts`, `src/mainImpl.ts`, `src/vs/code/electron-main/main.ts` | App startup, crash reporting trước service setup, routing |
| Main application | `src/vs/code/electron-main/app.ts` | `initServices`, `initChannels`, startup/protocol handlers/`afterWindowOpen`; PTY, ext-host starter, MCP, browser/Playwright, remote endpoints |
| Shared-process launcher | `src/vs/platform/sharedProcess/electron-main/sharedProcess.ts` | Process lifecycle và channels core cần giữ |
| Shared implementation | `src/vs/code/electron-utility/sharedProcess/sharedProcessMain.ts` | Auto-sync, gallery/extensions, MCP, Git, remote/tunnel/SSH/container/WSL agent channels |
| Renderer | `src/vs/workbench/workbench.common.main.ts`, `workbench.desktop.main.ts`, `electron-browser/desktop.main.ts` | Contribution imports, eager service registrations, direct service construction |
| Agent/session window | `src/vs/sessions/sessions.desktop.main.ts`, `src/vs/platform/windows/electron-main/windowImpl.ts`, main app routes | Alternate renderer, session-window creation và external URL routes |
| Product build | `build/next/index.ts`, `resources.ts`, `build/lib/esbuild.ts`, `build/gulpfile.vscode.ts`, `build/lib/extensions.ts`, `build/gulpfile.extensions.ts` | Separately emitted hosts/workers, merged extensions/resources/dependencies |

`src/vs/platform/sharedProcess/node/sharedProcess.ts` chỉ là config, không phải toàn bộ shared
implementation. Xóa import renderer không ngắt channel/main service đã tạo ở tầng khác.

## 2. Các bẫy theo subsystem

### Terminal/PTY và shell ngầm

- `src/vs/workbench/contrib/terminal/terminal.all.ts` kéo UI, chat tools, completions, telemetry và signal contributions.
- `terminal/electron-browser/terminal.contribution.ts` đăng ký local PTY service và BlockStartup backend.
- `localTerminalBackend.ts` xin direct PTY message port; main `app.ts` dựng `PtyHostService` và channel.
- `src/vs/platform/terminal/electron-main/electronPtyHostStarter.ts` khởi chạy PTY entrypoint.
- `app.ts.afterWindowOpen` gọi shell environment resolver; `src/vs/platform/shell/node/shellEnv.ts` có shell spawn.
- Compile-cache flags ở main startup còn có đường gọi PTY latency và agent host start.

Decoy Terminal phải là view monospace mới. Không giữ local terminal service, xterm stack hoặc
shell-env discovery chỉ để vẽ prompt. Loại đường startup ngầm, không chỉ nút New Terminal.

### SCM/Git/Debug/Tasks/Testing

- Common main imports `contrib/scm/browser/scm.contribution.ts`, `quickDiff.contribution.ts`, `scm.service.contribution.ts`.
- Debug/tasks/testing contribution đăng ký lifecycle và chat integration; task service còn inject terminal, extension, remote.
- Desktop imports `contrib/tasks/electron-browser/taskService.ts` và extension-host debug adapter integration.
- `extensions/git` không là mọi đường Git: `src/vs/platform/git/node/localGitService.ts` còn chạy trong shared process.

Decoy diff/stack/test tree dùng fixture. Gỡ execution service và discovery/watchers, không subclass
view cũ rồi disable toolbar. Reader bookmark marker không phụ thuộc DebugService.

### AI/chat/agent host/MCP và alternate window

- `contrib/chat/browser/chat.shared.contribution.ts`: startup/restore/eventual contributions và speech service eager.
- `contrib/mcp/browser/mcp.contribution.ts`: eager workbench service, discovery, filesystem/tool broker.
- `services/agentHost/electron-browser/agentHostService.ts`,
  `platform/agentHost/electron-main/electronAgentHostStarter.ts` và main/shared managers/channels là đường độc lập.
- MCP discovery/gateway được tạo phía main; remote agent channels phía shared; session window có entrypoint riêng.

Chat decoy không expose prompt/tool/model provider. Gỡ routes/session creation và binary entrypoints,
không chỉ activity-bar icon hoặc Copilot extension activation.

### Notebook và remote

- `contrib/notebook/browser/notebook.contribution.ts` có BlockStartup/BlockRestore kernels/execution/renderers/workers.
- Notebook document service còn được import riêng ở common main.
- Desktop main dựng remote resolver/socket factory/remote agent và remote filesystem provider trực tiếp.
- Common/desktop/shared còn scanner, remote explorer, tunnel coordinator/remote tunnel và SSH/container/WSL channels.
- Main còn remote-resource protocol, remote/session URLs.

Consumer core giữ lại dùng local-only contract không có remote resolution/socket. Bỏ notebook
worker/resources sau khi đã cắt consumer; không giữ execution notebook cho book EditorPane.

### Extension host, theme/grammar/command barriers

- `services/extensions/electron-browser/nativeExtensionService.ts` Eager; Ready/idle scan và host initialization.
- Factory có local process host, web-worker host và remote host paths.
- `services/themes/browser/workbenchThemeService.ts` chờ `whenInstalledExtensionsRegistered()`.
- `services/language/common/languageService.ts` nhận extension language registration.
- `services/textMate/browser/textMateTokenizationFeatureImpl.ts` nhận grammar contributions.
- `services/commands/common/commandService.ts` có extension activation khi dispatch.

Catalog tĩnh phải cung cấp metadata/theme/icon/grammar/language cần giữ và kết thúc registration
barrier, không có executable main/browser, install/update/scanner/activation/host factory.
Refactor consumer hoặc finite no-host compatibility contract; tránh stub pending vô hạn hoặc
stub success che lỗi. `--disable-extensions` không được coi là cắt host.

### Network/cloud/update/crash reporting

Registration có ở common/desktop main, main app và shared implementation. Desktop còn dựng
DefaultAccountService/account policy. Shared dựng UserDataAutoSyncService. `mainImpl.ts` khởi
crash reporter trước app services và đọc persisted argv config.

Gỡ runtime registrations, channels và startup flags cùng product endpoints. Kiểm tra cả profile
cũ được restore, không chỉ fresh profile tắt telemetry bằng setting.

## 3. Core vẫn cần có và search cần thay

Giữ window/lifecycle/native menus/title/status/editor groups/layout, DI/context/commands/
keybindings/quick input, clipboard/dialog/accessibility/logging, local URI/files/config/storage,
model resolver/EditorPane/themes/icons/font và workers còn phục vụ rendering.

`services/files/electron-browser/diskFileSystemProvider.ts` dùng main cho file operation nhưng
watching có utility workers: giữ watch có scope cho reader nếu cần, không watch project rộng.

IDE Search `services/search/common/searchService.ts` có extension activation; node engines có
ripgrep và fallback `find`. Reader search dùng canonical text/index riêng. Giữ bề mặt search
framework nếu phù hợp, không giữ filesystem engine cho Library.

## 4. Build exclusions là công việc riêng

`build/next/index.ts` emit PTY, agent host/diff worker, extension process/worker hosts,
notebook/language-detection/local-file search workers, shared/CLI/session renderers và các worker khác.
Tree shaking renderer không tự loại các output độc lập này.

`build/gulpfile.vscode.ts` merge `.build/extensions`, production dependencies, Copilot runtime/prebuild,
node-pty/ripgrep. `build/lib/extensions.ts` package local extensions rộng.
`product.json.builtInExtensions` chỉ là downloaded-builtins list; clear nó chưa loại local Git,
authentication/language server/Copilot. Packaging còn kiểm tra Copilot runtime version ở module
load và dựng ripgrep shim, cần sửa build assumptions trước prune dependency.

Tạo manifests rõ cho executable entrypoints, native dependencies, declarative assets, resources,
service/channel capabilities. Mỗi mục removed có consumer rationale và phép thử chứng minh.
Release inventory phải chứng minh binary/module cấm không còn trong package.

## 5. Evidence cho từng task trim

Ghi: base SHA, files/registrations removed, consumers giữ và replacement contract, channels/entrypoints
bị cắt, process activation trước/sau, network audit, package inventory, smoke tests và rollback patch.

Chạy cold startup, restore persisted state cũ, idle, reading/import/search/export/restore và click
mọi decoy/command/keybinding/protocol. Không có process/channel/socket cấm và không có demand
activation phục hồi chúng. Native reader IO/GPU/core worker được allowlist riêng với lý do.

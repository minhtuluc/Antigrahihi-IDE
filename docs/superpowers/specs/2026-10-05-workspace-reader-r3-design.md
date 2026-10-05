# Workspace Reader R3 — Ebook reader bên trong một IDE giả

Ngày 05/10/2026. Thiết kế sản phẩm để review trước implementation.
Người dùng đã chọn **code string/object** làm chế độ ngụy trang mặc định.
Roadmap: [ide-novel-reader-roadmap.md](../../../ide-novel-reader-roadmap.md).

## 1. Kết quả sản phẩm

Một ebook reader offline có thư viện, EPUB/TXT import, mục lục, tiến độ, bookmark,
highlight, ghi chú, search, typography và backup. Màn hình mặc định trông như đang coding:
project tree, source tabs, syntax màu, minimap, status bar và các panel IDE decoy.

Người dùng quản lý sách trong app, không quản lý một đống TXT và tự nhớ dòng đã đọc.
Ba điều cùng phải đạt: đọc như ebook; nhìn lướt giống coding; backend IDE thừa thực sự bị ngắt.
Mở TXT, đổi extension thành `.ts`, hoặc chỉ tắt menu đều chưa đạt.

## 2. Nền hiện có và phương án chọn

Code-OSS 1.140.0, SHA `07f806f999227108933c2e30515b26eecc1fda74`; Node 24.18.0;
Electron target 43.7.3. Môi trường Linux đã cài/build, người dùng đã chạy app.
Chưa có reader, decoy, runtime trim hoặc installer sản phẩm. Không làm lại environment setup.
Windows vẫn là nền đóng gói ưu tiên; Linux dùng phát triển và nghiệm thu local.

| Phương án | Lợi thế | Giới hạn | Quyết định |
| --- | --- | --- | --- |
| Fork, giữ shell/UI, thay chức năng bên trong | Tabs/layout/icon/keybinding giống IDE; tận dụng nền hiện có | Phải cắt dependency ở renderer/main/shared/build | Chọn |
| Extension trên VS Code | Demo nhanh | Giữ nguyên trọng lượng và backend IDE | Không đạt mục tiêu |
| Shell tự dựng giống IDE | Dễ sở hữu dependency | Dựng lại UI và hành vi, bỏ phần nền đã làm | Dự phòng sau spike có số đo |

Giữ workbench layout, editor groups, trees/lists, menus, palette/keybinding framework,
themes/icons, accessibility và services cốt lõi phục vụ reader. Reader đăng ký trực tiếp,
không dựa extension API/host. Không thêm React shell hay CodeMirror.

Một native EditorPane dùng DOM cho chế độ sách; Monaco cho code giả. Hai renderer dùng
cùng canonical book và anchor. Không dùng Monaco text-only làm EPUB renderer.

## 3. Luồng ebook và thư viện

Lần đầu app mở project/code mẫu trung tính. Lệnh `Import Dataset…` trong coding mode
tương ứng `Nhập sách…` trong book mode. File picker → preview metadata/mục lục → chỉnh
chia chương TXT → nhập kho → đọc. File nguồn không bị sửa; nhập dữ liệu không giả làm Git action.

Thư viện có bìa, tên/tác giả, collection/tag, trạng thái chưa đọc/đang đọc/đã đọc, gần đây,
sort/filter và tiếp tục đọc. Dữ liệu thật luôn tồn tại trong store, alias chỉ đổi cách hiển thị.

| Dữ liệu thật | Book mode | Coding mode |
| --- | --- | --- |
| Thư viện | Library với bìa/tên sách | Explorer với project mẫu |
| Một sách | Tên sách, tác giả | Alias như `inventory-service` |
| Tập/chương | TOC và heading thật | `src/modules/module-0042.ts` |
| Bookmark/notes | Danh sách dấu trang/ghi chú | Gutter marker và Outline do reader cung cấp |
| Tiến độ | Chương/phần trăm/vị trí | Status bar có line/column và nhãn trung tính |

Alias mặc định ổn định, đổi được; ordinal sort theo số, không theo alphabet tên giả.
Thao tác xóa/import/export/restore có mô tả dễ hiểu và xác nhận khi cần. Xóa sách và annotation
là API reader thật, không gọi Delete File, Git Reset hay handler IDE.

## 4. Code giả — chế độ mặc định

Ví dụ kiểu trình bày:

```ts
export const module0042 = {
  revision: 42,
  records: [
    "Đêm đã xuống. Con đường phía trước chìm trong sương.",
    "Anh dừng lại trước cánh cửa, lắng nghe tiếng bước chân."
  ]
};
```

Code trang trí ít, nhất quán; câu văn vẫn dễ đọc. Không biến tên nhân vật thành biến hoặc
thay nội dung truyện để trông giống code. Preset chỉnh mật độ code, font, line height,
wrap/minimap và độ rộng đọc; không hy sinh khả năng đọc lâu cho nhiều punctuation.

- Monaco read-only ở model và backend; language riêng `novel-script` dù alias có `.ts`.
- Token provider nội bộ, không TypeScript server/lint/completion/semantic analysis.
- Next/prev, bookmark, highlight, notes, search và progress hoạt động ngay trong code mode.
- Copy mặc định trả text truyện gốc; `Copy Display` là action riêng để copy projection.
- Find tìm canonical text, không trả từ khóa/code trang trí.
- Bookmark/note thể hiện bằng marker/decoration nhỏ, giữ hình dáng editor.

Comment preset là P1; string/object projection là gate của demo và MVP.

## 5. Book mode — ebook thực sự

Chuyển mode bằng action/shortcut cấu hình được, giữ nguyên anchor, selection và annotations.

- Serif/sans/mono, cỡ chữ, khoảng dòng, lề, chiều rộng; theme sáng/tối/sepia.
- Cuộn liên tục hoặc phân trang; một cột/hai trang theo viewport và preference.
- TOC, cover, heading, paragraph, emphasis, ảnh local trong nội dung, hyperlink nội bộ và footnote.
- Chuyển trang/chương bằng click/phím; jump/back về đoạn trước khi tìm hoặc mở TOC.
- Bookmark, highlight nhiều màu, ghi chú theo đoạn; sửa/xóa/tìm lại/xuất.

Số trang tùy layout, không là identity bền. Resize/font đổi vẫn giữ đoạn đọc.
MVP hỗ trợ EPUB reflowable không DRM, thiên về text; PDF/comic/fixed-layout không thuộc MVP.
Table đơn giản được giữ hoặc tuyến tính hóa với báo cáo import; math, complex layout,
script và audio/video embedded không hỗ trợ. Không âm thầm báo một EPUB mất nội dung là import đủ.

## 6. Cover và những đường lộ nhãn

Cover shortcut trong cửa sổ chuyển sang scene code đã preload, đóng/che popup, search,
tooltip, bìa và note do app quản lý. Dừng auto-scroll; checkpoint chạy bất đồng bộ,
không chờ DB/import/index mới chuyển frame. Quay lại đúng anchor.

Startup/session restore vào coding mode; book mode cần thao tác bật rõ ràng. Không có frame
đầu hiện bìa/tên sách rồi mới áp alias. Alias phải áp vào Explorer, tab, breadcrumb, palette,
Quick Open, recent, tooltip, search label/snippet, status, window title và notification.
Dialog nhập/backup được mở chủ động là tương tác riêng, cover vẫn phải xử lý dialog do app quản lý.

Auto-cover mất focus là P1, tắt mặc định; global shortcut là P1, không chặn MVP.
Mục tiêu là người nhìn lướt tưởng coding; người đọc kỹ vẫn có thể nhận ra câu văn trong string.

## 7. Các nút IDE là decoy độc lập

Decoy là scene nhỏ dựng sẵn và view state trong renderer. Click đổi panel/file mẫu/tab,
cuộn log, chọn session mẫu; không chạy shell, Git, test, extension install hay AI.

| Bề mặt giữ | Hành vi decoy | Backend phải mất |
| --- | --- | --- |
| Terminal/prompt/profile dropdown | Monospace scene, command/log mẫu; input echo/replay giới hạn | PTY, shell, terminal process/integration/tasks |
| SCM/branch/diff | Tree/diff read-only, badge từ fixture | Git extension, executable calls, repo discovery/watchers/localGit |
| Run/Debug/variables/stack | Chọn session/marker fixture | Debug adapter/attach, launch execution, tasks |
| Testing | Test tree/kết quả fixture | Discovery/runner/activation |
| Problems/Output | Empty state hoặc scene log nhỏ | Diagnostics/build execution/language servers |
| Extensions | Card/list mẫu, thao tác scene | Gallery/network/install/update/scanner/extension host |
| Chat/assistant | Conversation fixture, không gửi prompt | Copilot/agent host/MCP/tool/model/auth |
| Remote/account/sync affordance | Indicator/menu scene trung tính | SSH/WSL/container/tunnel/login/cloud sync/polling |

Không import/subclass execution-oriented contribution cũ chỉ để lấy icon. View mới đăng ký
bằng component/icon framework gốc. Terminal fixture không cần xterm/PTY nếu DOM monospace đủ.
Không chạy loop log mẫu khi idle. Scene được người dùng chọn, không lấy code của workspace thật.

Command cũ phải unregister hoặc bind sang handler decoy đã kiểm soát; palette/keybinding/menu/
context menu/URI/deep link/IPC không có fallback sang handler upstream. Giữ command framework
và một registry reader/decoy allowlist, không giữ danh sách execution command toàn IDE.

Không trả success giả từ service bị gỡ để che DI. `build succeeded` trong scene là dữ liệu trang trí,
không phải kết quả của task/build service. Consumer giữ lại nhận contract hữu hạn, capability bị
gỡ bị từ chối hoặc consumer bị bỏ; không còn API kích hoạt subsystem theo nhu cầu.

## 8. Ngắt runtime rồi loại artifact

Capability giữ: window/layout/editor groups, tree/menu/palette, settings/UI storage, clipboard,
accessibility, native import/export dialog, reader filesystem/store/IPC/search và VFS read-only.

Mục tiêu release không có extension host. Theme/icon/grammar/language khai báo được đóng thành
catalog tĩnh. Core có barrier `whenInstalledExtensionsRegistered` phải được giải quyết hữu hạn
hoặc refactor consumer; không để một stub treo theme/command/restore.

Nhóm bị cắt: Terminal/PTY; Git/SCM; Debug/Tasks/Testing; language servers/formatter/diagnostics;
Copilot/chat/agents/MCP; notebooks; remote/tunnels/SSH/WSL/devcontainers; extension marketplace/
host; accounts/cloud auth/sync; experiments/survey/telemetry/crash-report upload; updater Microsoft.
Bản đầu cập nhật bằng installer/file phát hành riêng; không có updater mạng của IDE.

Giữ storage/file-dialog/native-host contract còn dùng cho reader. Shared process chỉ giữ khi còn
consumer core có bằng chứng, services/channels bên trong theo allowlist. Electron GPU/utility,
Monaco worker và reader parser worker vẫn có thể cần; không hứa zero child process.

Quy trình cho từng nhóm:

1. Inventory registration/consumer/process/channel/entrypoint/artifact ở source đã khóa.
2. Thay UI bằng decoy độc lập; gỡ consumer, contribution và service registry không cần.
3. Gỡ startup phía main/shared/utility, extension factory, protocol/CLI và handler liên quan.
4. Kiểm tra idle, cold/session restore và click decoy: không activation/process/network của nhóm.
5. Loại entrypoint worker, production dependency, native binary, extension và resource của nhóm
   khỏi product build ngay trong phase cắt nhóm; inspect artifact, không đợi audit cuối release.

Trim bắt đầu sớm, không dồn hết sau tính năng. Gỡ từng nhóm có smoke; tất cả nhóm mục tiêu đạt
trước khi gọi là MVP R3. Xóa folder, product flag hay `--disable-extensions` không đủ bằng chứng.

Dev tooling/compiler/npm có thể còn dependency upstream. Chỉ installed package và runtime
được dùng để báo độ nhẹ, không dùng kích thước source/node_modules phát triển.
Chi tiết nguồn: [runtime boundaries](../../reader-r3-runtime-boundaries.md).

## 9. Kiến trúc và vùng mã

```text
Workbench shell
  Reader Library / TOC / notes / settings
  Book EditorPane (DOM) + Code Editor (Monaco)
  Alias / presentation / cover controller
  Decoy views / scenes / allowlisted actions
                     |
              typed reader IPC
                     |
Reader IO host (utility process theo nhu cầu)
  Store + DB owner + migrations
  Import + bounded parser workers
  Canonical search/index + Unicode maps
  Backup/restore + integrity validation
```

Một owner DB; tác vụ nặng không chặn renderer. Narrow IPC không expose generic spawn/eval/
executeCommand, đọc tùy ý file hoặc tải tùy ý URL cho decoy. Process reader chuyên dụng được
khởi tạo theo contract, không trao quyền tạo shell/extension host.

Vùng đề xuất mới, chưa tồn tại trong upstream:

| Vùng | Trách nhiệm |
| --- | --- |
| `src/vs/workbench/contrib/novelReader/common/` | Book/anchor/service contracts và projection maps |
| `src/vs/workbench/contrib/novelReader/browser/` | Library/TOC/notes, EditorPane, code integration, alias/cover |
| `src/vs/workbench/contrib/novelReader/electron-browser/` | Reader IPC client và native dialogs |
| `src/vs/platform/novelReader/common/` | Typed IPC/capabilities |
| `src/vs/platform/novelReader/node/` | Store/import/index/backup/migration/workers |
| `src/vs/code/electron-utility/novelReader/` | Reader IO entrypoint |
| `src/vs/workbench/contrib/ideDecoy/` | Scene schema/assets/view/action registration |
| `build/reader/` | Product composition, entrypoint/dependency/resource manifests |

Domain/parser không import workbench. Các registration cụ thể được xác minh trong task plan
từng giai đoạn trước khi tạo module; không sửa sâu Monaco nếu API model/decorations đủ.

## 10. Content, identity và persistence

Store giữ content bất biến theo version, raw source cho provenance/export và block schema
cho rendering. DB local giữ metadata/progress/annotations/session; index/projection cache rebuild.
SQLite cần spike binding/owner/IPC/packaging Windows trên Electron đã khóa. Không dùng settings
JSON làm thư viện và không giả định DB workbench có schema ebook sẵn.

Entity chính: Book, BookVersion, Chapter, Block, Asset, Collection, ReadingPosition, Bookmark,
Annotation, DisplayAlias, ReaderSession, ImportJob, SearchIndexMeta, DecoySceneProfile.
Book identity phân biệt file-byte hash và content version, không dùng title/alias làm khóa.

BookVersion bất biến gồm raw-source hash, lựa chọn encoding/decode/chapter split, importer version,
normalizer/Unicode policy version, canonical schema version và hash canonical content/assets.
Byte dedup chỉ tái dùng raw storage; không được bỏ qua preview mới hoặc ghép anchor của hai
version có cấu trúc khác nhau. Sửa metadata/alias không tạo content version mới.

URI `novel://book-id/version-id/chapter-id` nhận diện tài liệu; presentation book/code dùng cùng
identity. Chapter/block ID/ordinal canonical; VFS/backend readonly; note đi qua store API riêng.
Dispose model không xóa sách. Không giữ toàn bộ sách trong mỗi editor tab.

TXT: BOM/encoding preview, heading candidate theo tính nhất quán, sửa split, không heading thì
một chapter hoặc phần kỹ thuật gắn nhãn rõ. Không chỉ một regex quyết định mọi corpus.

EPUB 2 reflowable dùng OPF/spine và NCX; EPUB 3 dùng navigation document và spine. Cả hai thuộc
P0 với fixtures riêng. Spine item vắng trong TOC vẫn đọc được; nếu thiếu navigation dùng spine/
heading để dựng mục lục tối thiểu, báo ở preview. Metadata/cover, paragraph/emphasis/link/ảnh/
footnote vẫn theo schema canonical; không sort ZIP filenames. Chặn script/remote resource/external entity/ZIP traversal/ZIP bomb;
parser chuyển thành schema allowlist, không chạy HTML/CSS/JS tùy ý trong workbench.

Import preview → staging → transaction/manifest commit → Library → index. Cancel/lỗi không
để sách dở. Dedup hash; tái nhập tạo version mới hoặc dùng version đã có với lựa chọn rõ ràng.
Background job có tiến độ và cancel; renderer cover không đợi worker.

## 11. Projection, anchors và search

Canonical text dùng policy UTF-8/LF/Unicode đã công bố, cùng map block ↔ offset UTF-16.
Code projection sinh display text và segments `source`, `escape`, `scaffold`. Scaffold không
có canonical offset; một ký tự canonical có thể tương ứng nhiều display code unit khi escape.

Hai chiều mapping xử lý quote/backslash/newline/surrogate/dấu tổ hợp và range qua nhiều string.
Selection copy bỏ scaffold; selection chỉ scaffold không tự lấy đoạn truyện không liên quan.
Highlight/note range canonical được chia thành decoration hoặc DOM range theo renderer.
Không hard-wrap canonical theo viewport. Soft wrap và code segmentation chỉ đổi display.

Anchor: book version + chapter ID + block ID + UTF-16 offset + quote/context dự phòng.
DOM map text node/range; Monaco map display offset. View state là cache, không nguồn đúng khi
font/window đổi. TOC/search/bookmark/cover/mode switch đều dùng canonical anchor.

Progress theo canonical content nhìn thấy và tương tác đọc, loại code mẫu. Jump/search có
navigation history, không tự mark hoàn thành khi xuống cuối. Debounce 1–2 giây, checkpoint
khoảng 5 giây, flush navigation/normal close; crash về checkpoint đã ghi. Remap version mới
không chắc chắn cần người dùng xác nhận vị trí gợi ý.

Find trong chapter và search toàn Library chạy reader backend, không ripgrep/file search của IDE.
Tìm tiếng Việt không dấu dùng index/map dẫn xuất, không xóa dấu canonical. Result mở đúng anchor;
coding mode hiện alias và snippet code, book mode hiện tên/context thật.

Backup: DB snapshot nhất quán, raw/canonical content, assets, settings/aliases, schema version và
checksums. Chỉ version đã commit, không staging. Restore validate vào staging rồi commit atomically,
lỗi giữ profile cũ nguyên vẹn; test profile sạch. Annotation export JSON/Markdown.

## 12. Scope và kế hoạch delivery

P0 cho MVP: EPUB+TXT, Library/metadata/cover/collections, TOC/navigation/progress/restore,
code string/object+alias, book typography/scroll/pagination/basic image-footnote,
bookmark/highlight/notes/canonical search, cover/decoys, không IDE backend/extension host,
backup/restore/export, product package và runtime/artifact audit.

P1: comment preset, scene/theme thêm, reading stats, global shortcut, auto-cover, auto-scroll,
TTS/dictionary local có budget riêng. P2: PDF/MOBI/AZW/fixed-layout/comic, online/sync.
MVP R3 lớn hơn MVP TXT R2; cắt scene/stats trước nếu cần demo sớm, không bỏ EPUB hoặc tiến độ.

| ID | Công việc | Đầu ra/gate |
| --- | --- | --- |
| R3-00 | Baseline/inventory, binding/parser/EditorPane/extension-free spike | Graph, process/network baseline, budgets và quyết định kỹ thuật từ số đo |
| R3-01 | Reader composition root, catalog tĩnh, decoy infrastructure; cut AI/MCP/remote/cloud và activation host | Boot không agent/extension host/cloud; scene độc lập; host/worker/artifact của nhóm đã cắt vắng trong product build |
| R3-02 | Store/IPC/import TXT+EPUB/Library/TOC/VFS/transactions | Sách thật đúng spine/chapter, restart có Library, cancel không dữ liệu dở |
| R3-03 | Code projection/aliases/progress/bookmark/cover/navigation | Demo: EPUB → code giả → bookmark → cover → restart cùng đoạn |
| R3-04 | Book pane/pagination/ảnh/footnote/notes/highlight/search | Chuyển mode/resize/search giữ anchor; đọc một giờ |
| R3-05 | Terminal/SCM/Debug/Tasks/Testing/language/notebook cuts còn lại, dispatch và artifact audit từng nhóm | Click decoy/call command cũ không process/channel/network mục tiêu; package không chứa artifact của nhóm |
| R3-06 | Backup/restore/migration/crash/import hardening/model lifecycle | Profile sạch restore đúng; cache bounded qua 1.000 chapter switches |
| R3-07 | Final trim dependency/assets còn thừa, cumulative inventory, Windows installer/benchmark/camouflage | MVP R3: reader thật + decoy + toàn bộ runtime cuts + package đã audit |
| R3-08 | Polish/presets/accessibility/đọc thử | 1.0, limitations và số đo công bố |

Nhóm trim dịch lên sớm khi graph cho phép; không giữ PTY đến R3-05 nếu R3-01 đã cắt được.
Mỗi phase cắt runtime đồng thời cắt product artifacts của nhóm. R3-07 là audit toàn bộ và
trim phần thừa bắc cầu cuối cùng, không phải lần đầu bỏ host/worker khỏi bản build.
Demo R3-03 chưa là MVP nhẹ hoàn chỉnh. Mỗi phase có task plan/TDD/ownership/review riêng;
không viết một script xóa hàng loạt service từ roadmap này.

Estimate sơ bộ với 25–30 giờ/tuần: demo 3–5 tuần, MVP 10–16 tuần, 1.0 14–20 tuần.
Không là deadline; cập nhật sau hai phase đầu. Mapping/pagination/service graph là biến số lớn.

## 13. Nghiệm thu

Luồng bắt buộc: spine khác filename → import → footnote → code copy đúng; quote/emoji/dấu tổ hợp
→ highlight/note → mode/font/resize giữ range; search → jump/back không completion giả;
import/index nặng → cover → cancel an toàn; restart/crash → backup/restore đúng content/notes;
click decoy/menu/keybinding/deep link và persisted state cũ không gọi backend đã gỡ.
Fixture EPUB 2 NCX, EPUB 3 nav và spine item không có trong nav đều phải giữ đủ nội dung/đúng thứ tự.
Tái nhập cùng bytes với split/encoding hoặc normalizer policy khác tạo version đúng;
bookmark cũ vẫn gắn version cũ, backup/restore không âm thầm chuyển sang phiên bản mới.

Camouflage: screenshot và thử nhìn lướt 3–5 giây với 3–5 người chưa biết app; ít nhất 80% lượt
nhận định là coding/editor. Đây là sanity check cảm nhận nhỏ, không khẳng định thống kê cho mọi
người quan sát. Audit trung tâm editor và mọi đường lộ nhãn, không chỉ icon. Người dùng đọc được
một giờ; cold/session startup không frame lộ bìa/tên thật.

Đo cùng máy/corpus/release config. Baseline và workload đối chiếu được mô tả rõ; không so product
release với dev build nặng. Process cần Electron/reader được phân biệt bằng channel/activation.

| Chỉ số | Gate/mục tiêu |
| --- | --- |
| Process/channel/activation | Không PTY/extension host/language server/Git/debug/task/test/agent/MCP/remote |
| Network | Fresh/old profile, startup/idle/read/click decoy: không dịch vụ IDE/cloud; không remote EPUB resource |
| Idle | Không polling/timer subsystem cũ; scene không animation/replay liên tục |
| RAM/startup | Total RSS/all-process, cold p50/p95; chốt số budget sau baseline, giảm đo được với workload đối chiếu |
| Chapter | Cached p95 ≤150 ms; chương thường ≤100k ký tự p95 ≤500 ms trên máy baseline |
| Cover | p95 ≤100 ms khi UI phản hồi, kể cả job import/index chạy nền |
| Lifecycle | Cache/model bound rõ, 1.000 switches và 100 cover không tăng RSS vô hạn |
| Package | Installer/installed inventory; entrypoint/native binary/dependency cấm vắng và không reachable |

R3-00 phải ghi số budget RAM/startup/import/asset để phase sau dùng; không để tiêu chí RAM
mãi là một câu chung chung. Electron/Monaco vẫn có trọng lượng nền, không hứa app cực nhỏ vì bỏ menu.

Corpus: TXT 20 MB/10.000 chapter metadata/chapter 500k–1M ký tự, malformed EPUB/ZIP bomb/spine
khác filename, image/footnote, quote/backslash/newline/emoji/dấu tổ hợp, long title/DPI lớn,
checksum lỗi và tắt giữa import/flush.

## 14. Spikes, fork và bàn giao

Spikes phải giải quyết: boot không extension host mà theme/command barrier kết thúc; SQLite
binding/owner/Windows packaging; native book pane selection/pagination; code mapping/copy/find;
decoy không import execution UI; main/shared startup không shell/agent/remote channels.
Nếu không đạt, giảm layout/scaffold hoặc refactor consumer; không quay lại giữ backend chỉ để lấy UI.

Hai vòng spike có phạm vi rõ vẫn không tách được runtime thì lập so sánh shell riêng có số đo,
đưa quyết định review trước khi đổi framework. Không đổi kiến trúc âm thầm giữa task.

Patch branding/reader/decoy/runtime/build tách nhóm; giữ upstream base và policy nâng Electron/
Chromium/security. App ID/protocol/profile/name riêng; license/third-party notices đi kèm.
Root docs hiện ngoài Git checkout vì `.git` gốc readonly; trước implementation đưa spec và
manifest vào repository quản lý phù hợp. Không để feature/patch sống ngoài version control.

Bàn giao reader dùng được, presets/scenes, canonical/store/import/projection contracts,
runtime+artifact allowlist với evidence, corpus/tests/benchmarks, Windows installer,
backup/restore/migration và hướng dẫn sử dụng.

Hoàn thành khi nhập EPUB, đọc/ghi chú qua nhiều phiên, đổi sách/code không mất đoạn; người
nhìn lướt thấy coding; mọi nút decoy không bật IDE backend; package có số đo chứng minh trim.

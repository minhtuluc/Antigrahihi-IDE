# Lộ trình R2 — Fork Code-OSS thành ứng dụng đọc truyện như đọc code

Ngày cập nhật: 05/10/2026. Tên sản phẩm tạm: Workspace Reader.

## 1. Phương án đã chọn

Fork nguồn mở `microsoft/vscode`, giữ workbench và Monaco Editor Core gốc, bổ sung chức năng đọc truyện và giảm các năng lực phát triển phần mềm không cần thiết. Mục tiêu là thừa hưởng giao diện, hành vi tabs, Explorer, keybindings, Quick Open, Command Palette, theme và layout của Code-OSS thay vì dựng lại chúng bằng một frontend khác.

Đây là roadmap kiến trúc và triển khai; chưa phải một repository fork hoặc ứng dụng đã được tạo/build. R2 thay thế lựa chọn React/CodeMirror dựng shell riêng ở R1. Import, progress, bookmark, backup và nguyên tắc lưu nội dung của R1 tiếp tục là yêu cầu sản phẩm.

Giả định: Windows trước; đọc offline; TXT vào MVP; EPUB reflowable không DRM vào 1.0; một developer có kinh nghiệm TypeScript/Electron, 25–30 giờ tập trung/tuần. Việc học codebase và tinh gọn service là biến số lớn; không giữ cứng estimate 12 tuần của hướng dựng shell riêng.

## 2. Phạm vi “giao diện y hệt”

Giữ component, layout engine, theme/icon infrastructure và editor gốc từ một phiên bản Code-OSS đã khóa. Giao diện và hành vi sẽ rất sát VS Code tương ứng với phiên bản đó. Không hứa pixel-perfect với mọi phiên bản VS Code, mọi hệ điều hành/DPI hoặc các chức năng mới trên upstream.

Code-OSS là nguồn mở; bản phân phối Visual Studio Code của Microsoft có thêm branding, code/extension và endpoint dịch vụ riêng. Sản phẩm fork dùng tên, logo, app ID, thư mục user-data, protocol và update channel riêng. Giữ thông báo MIT và ThirdPartyNotices; không sao chép branding Microsoft hoặc mặc định cho rằng Marketplace/dịch vụ Microsoft là một phần được cấp phép của fork.

Chọn một release/tag ổn định sau khi xác minh, ghi commit SHA vào manifest build. Không lấy `main` làm nền liên tục chuyển động. Các đường dẫn kỹ thuật trong tài liệu được đối chiếu với nguồn mặc định ngày 05/10/2026; cần xác minh lại ở commit đã chọn.

## 3. Những thành phần giữ, thay và loại bỏ

| Nhóm | Xử lý | Mục đích |
| --- | --- | --- |
| Workbench layout, title bar, menus | Giữ component; chỉnh action và branding | Duy trì cảm giác IDE |
| Editor groups/tabs/breadcrumb | Giữ; custom resource label | Chương là tài liệu đang mở |
| Monaco Editor Core | Giữ | Render/copy/find/selection/wrap như code |
| Explorer tree | Giữ bằng virtual filesystem hoặc dùng tree component gốc | Bộ sưu tập/truyện/tập/chương |
| Quick Open, Command Palette, keybindings | Giữ framework, thay provider/commands khi cần | Điều hướng bằng bàn phím |
| Themes, icons, accessibility | Giữ | Giao diện nhất quán và dễ sử dụng |
| Settings/configuration/storage/lifecycle | Giữ nền tảng cần thiết | Tùy chỉnh và phục hồi phiên đọc |
| Outline | Giữ panel/framework; provider cho chương/bookmark | Mục lục thay vì symbols của chương trình |
| Search | Giữ UI nếu integration thuận lợi; backend dành cho truyện | Không phụ thuộc search file local của IDE |
| Output | Có thể giữ | Nhật ký import trung tính |
| Terminal | Gỡ khả năng tạo shell/process; panel thay thế nếu cần | Không cần terminal thật cho reader |
| Git/SCM, Debug, Tasks, Testing | Loại contribution/activation và dependency không dùng | Giảm năng lực phát triển phần mềm |
| Language servers/formatter/diagnostics | Không kích hoạt cho tài liệu truyện | Không có lỗi code, autocomplete hay format làm phiền |
| Chat/agent, MCP, notebooks, remote/tunnel | Loại theo nhóm dependency | Không phục vụ luồng đọc offline |
| Marketplace/recommendations/accounts/sync | Tắt UI và kết nối liên quan; gỡ dần implementation | Không có nhu cầu ecosystem extension công khai |
| Telemetry/survey/update Microsoft | Không dùng endpoint Microsoft; cấu hình chính sách của sản phẩm | Phân phối và dữ liệu độc lập |
| Extension host | Quyết định sau spike | Chỉ giữ nếu reader đang dùng extension/grammars cần nó |

Đây là matrix mục tiêu, không phải bằng chứng các service đã gỡ sạch. Mỗi nhóm chỉ được coi là hoàn thành khi build, runtime, process và network được kiểm tra.

## 4. Chiến lược tinh gọn: ba mức khác nhau

### Mức A — Giảm giao diện

Ẩn các view, menu, context menu và command không phục vụ đọc. Dùng context keys/configuration hoặc thay registration phù hợp. Mức này cải thiện UX nhưng không chứng minh giảm memory, process hoặc bundle.

### Mức B — Ngắt runtime

Không đăng ký hoặc kích hoạt contribution/service/extension của các tính năng thừa. Xử lý dependency injection và consumers liên quan; chỉ dùng implementation thay thế tối thiểu khi có consumer bắt buộc, với contract rõ ràng. Không tạo hàng loạt stub trả success giả để che lỗi.

### Mức C — Giảm bản build

Sau khi runtime đã ổn, loại assets, built-in extensions, binaries và modules không còn reachable/cần thiết khỏi pipeline. Đo package size và dependency graph; source folder tồn tại không đồng nghĩa nó đang được bundle, và xóa folder không tự bảo đảm runtime nhẹ.

Thứ tự: build baseline → thêm reader chạy được → ngắt từng nhóm tính năng → đo lại → giảm artifact. Không xóa hàng loạt `contrib` hoặc toàn bộ extension host trước khi có vertical slice.

## 5. Các điểm tích hợp đã xác minh

Repo tổ chức theo `base`, `platform`, `editor`, `workbench`, `code` và các target environment. Workbench dùng services/DI và contributions để lắp tính năng. Hai entrypoint đáng kiểm tra:

- `src/vs/workbench/workbench.common.main.ts`: đăng ký/import core, service và contributions dùng chung.
- `src/vs/workbench/workbench.desktop.main.ts`: phần desktop, native services và contributions.

Nguồn đã kiểm tra có import cho terminal, debug, SCM, chat, notebooks, MCP và các subsystem khác. Ngắt import là một điểm bắt đầu để kiểm soát contribution, chưa phải thao tác duy nhất: core service hoặc contribution giữ lại có thể tham chiếu chúng, và Electron/shared-process/build pipeline có cấu hình riêng.

Các vùng cho developer tìm hiểu trước:

| Vùng | Công việc |
| --- | --- |
| `src/vs/workbench/contrib` | Reader contribution, view, command, editor integration |
| `src/vs/workbench/services` | Resolver, models, labels, search, storage và service integration |
| `src/vs/editor` | Model, rendering, options, tokens, decorations |
| `src/vs/platform` | Filesystem, service contracts, IPC, configuration |
| `src/vs/code` | Desktop startup, main/shared processes |
| `extensions` | Built-ins, language features, themes/grammars và activation |
| `build`, `scripts`, `product.json` | Package, branding, assets và endpoint configuration |

Đặt phần reader vào một khu vực riêng, ví dụ `src/vs/workbench/contrib/novelReader`, với `common`, `browser`, `electron-browser` hoặc target thích hợp. Đây là đường dẫn đề xuất mới, không phải thư mục đã có trong upstream. Domain parser/anchor nên ít phụ thuộc workbench để kiểm thử và bảo trì dễ hơn.

Không thêm React/CodeMirror vào vùng đọc chỉ vì bản R1 dùng chúng. Workbench đã có nền UI và Monaco Core; một lớp frontend nữa sẽ tăng độ phức tạp và dễ lệch hành vi.

## 6. Truyện thành tài liệu IDE

### 6.1 Resource URI và file ảo

Một resource mẫu: `novel://book-id/version-id/chapter-id/module-042.ts`. Đây là URI logic; tên `.ts` là cách trình bày. Chapter ID/version là identity, alias không phải identity.

Provider chỉ đọc trả về cấu trúc folder và nội dung của chương. Explorer, tabs và Quick Open có thể dùng resource này. Provider phải có stat/read/readdir/event/capability semantics đúng; create/write/delete bị từ chối ở backend, không chỉ disable nút UI.

Trong fork, có thể đăng ký filesystem provider nội bộ để không bắt buộc extension host. FileSystemProvider của extension API là một đường khác nếu dùng built-in reader extension trong prototype. Không được trộn hai cơ chế rồi mặc định có thể xóa extension host mà không chuyển integration.

### 6.2 Explorer và sorting

Truyện → tập → chương. Chapter ordinal là số nguyên; filename hiển thị có zero padding nếu cần. Nếu Explorer gốc không giữ được thứ tự/ngữ nghĩa thư viện, xây một reader view bằng tree component gốc thay vì bẻ toàn bộ filesystem logic.

Open resource tạo editor input chỉ đọc. Bookmark, selection, navigation và alias đều trỏ về ID canonical. Đổi tên hiển thị không tạo document mới hoặc mất lịch sử.

### 6.3 Search và Outline

Search file local của VS Code không tự tìm được mọi custom URI. Làm spike search provider cho scheme đã chọn; nếu không phù hợp, giữ phong cách UI nhưng dùng reader search view riêng với backend canonical.

Outline nhận provider mục lục/bookmark riêng. Không đưa nguyên truyện qua TypeScript analyzer để giả document symbols.

## 7. Trông như đọc code nhưng vẫn đọc được lâu

### Chế độ mặc định

- Font mono có dấu tiếng Việt rõ, khởi đầu 15–17 px; line height khoảng 1.5–1.7, cho chỉnh.
- Word wrap bật; số dòng/minimap bật theo preference; tùy chọn giới hạn chiều rộng đọc.
- Selection, scrollbar, find widget, tabs và keybindings giữ cảm giác Monaco.
- Chỉ đọc; không diagnostics, suggestion, format, code action, hover từ language server hoặc semantic analysis trên truyện.
- Đọc một chương mỗi text model; mở nhiều tab không giữ toàn bộ sách trong memory. Chốt model eviction và cache theo số đo.

Các số typography là điểm khởi đầu thử nghiệm, không phải chuẩn cứng. Giữ UI gốc không có nghĩa phải chấp nhận font quá nhỏ hoặc dòng quá dài.

### Comment View

Cách ưu tiên: canonical text giữ nguyên, editor được gán language riêng như `novel-comment` và tô token theo phong cách comment. Một decoration/injected prefix có thể bổ sung `//` ở đầu dòng nếu integration chứng minh ổn, nhưng cần kiểm tra wrap, copy, offset, selection và accessibility.

Không gán ngôn ngữ TypeScript chỉ vì filename ảo kết thúc `.ts`. Language ID phải tách khỏi virtual extension. Nếu cần biến cả câu văn thành object/string JSON hoặc thêm code xen giữa, đó là projection nâng cao với mapping 2 chiều source offset ↔ display offset; chỉ làm sau MVP.

Không hard-wrap văn bản canonical theo chiều rộng màn hình. Line numbers đếm logical lines, còn soft wrap do editor xử lý. Copy mặc định trả về văn bản nguyên bản.

### Tên hiển thị và cover

Alias resolver áp dụng title, Explorer, tabs, breadcrumbs, Quick Open, recent list, palette, tooltips và search labels. Cover chuyển tới editor/workspace mẫu đã có sẵn, đóng transient UI, dừng auto-scroll/TTS nếu có, lưu checkpoint bất đồng bộ và khôi phục đúng anchor.

Cover là che giao diện do app quản lý, không phải cơ chế chống giám sát hoặc xóa ảnh đã chụp. Global shortcut cần phát hiện xung đột và có cấu hình; shortcut trong cửa sổ là yêu cầu cơ bản.

## 8. Content pipeline và persistence

### TXT

Chọn file → decode có preview → candidate headings → cho sửa split → chuẩn hóa → staging → commit → index. UTF-8/UTF-16 BOM trước, encoding khác khi corpus cần. Cancel/lỗi không tạo truyện nửa chừng; dedup theo hash; không sửa file nguồn.

Không heading thì một tài liệu hoặc các phần kỹ thuật được gắn nhãn rõ. Nhận diện chương phải dựa tính nhất quán, không chỉ một regex. Tác vụ decode/parse/index lớn chạy nền; regex tùy chọn có giới hạn thời gian.

### EPUB

Bản 1.0 chỉ EPUB reflowable không DRM, chủ yếu văn bản. Theo spine/navigation, không sort ZIP filenames. Chuyển thành nội dung chuẩn có heading/paragraph/nhấn mạnh cần thiết; xác định giới hạn cho ảnh/footnote/formatting. Chặn script/remote resource, ZIP traversal và tài nguyên giải nén vượt budget.

### Storage

- Canonical chapters bất biến theo version, UTF-8/LF/Unicode policy nhất quán.
- Metadata/progress/bookmark/annotation bằng DB local; SQLite là phương án cần spike native binding và process integration, không mặc định đã có API DB truyện sẵn từ VS Code.
- UI settings/layout có thể dùng storage/configuration workbench. Không lưu toàn bộ sách thành một setting JSON.
- DB có một owner; filesystem/DB/worker bridge đi theo ranh giới process của fork.
- Model editor không phải nguồn lưu trữ bền của truyện; dispose model không làm mất canonical content.

### Data model

Book; Collection; BookVersion; Chapter(id/version/ordinal/hash/path); ReadingPosition; Bookmark; Annotation; DisplayAlias; ImportJob; WorkspaceSession; SearchIndexMeta. Title và alias không làm khóa identity.

### Vị trí đọc

Lưu book version, chapter ID, offset UTF-16 trong canonical text và quote/context dự phòng. Giữ thêm editor view state để phục hồi nhanh khi layout không đổi; khi font/window thay đổi, anchor canonical là nguồn đúng. Offset selection tránh cắt giữa surrogate/grapheme.

Nếu dùng projection, mọi offset hiển thị phải map về canonical trước persist. Tái nhập tạo version mới; remap có thể gần đúng và cần thể hiện rõ. Không tự mark đọc xong chỉ vì search nhảy xuống cuối.

Debounce khoảng 1–2 giây, checkpoint khoảng 5 giây, flush ở navigation/normal close. Crash vẫn có thể mất phần tiến độ chưa ghi; không hứa lưu tuyệt đối. Backup gồm snapshot DB nhất quán, canonical content, settings và manifest/checksum. Index/cache rebuild được.

## 9. Roadmap fork theo cổng nghiệm thu

Mốc sau đây là estimate, chưa benchmark/build thực tế. Prototype đọc bằng UI gốc có thể xuất hiện sớm; việc gỡ subsystem là phần dễ vượt estimate nhất.

| Giai đoạn | Thời gian tham khảo | Đầu việc | Cổng hoàn thành |
| --- | --- | --- | --- |
| A — Baseline fork | Tuần 1–2 | Chọn release/SHA, đọc hướng dẫn repo, build Windows, branding/data dir riêng, ghi baseline | Clean build và packaged app chạy, không chạm user-data VS Code |
| B — Vertical slice | Tuần 3–4 | Reader contribution, một TXT, URI/provider, tree/tab, Monaco read-only, bookmark/progress | Import → đọc → restart về cùng đoạn trên app đóng gói |
| C — Reader workflow | Tuần 5–6 | Chapter splitting preview, Quick Open/commands, settings, navigation, find, alias/comment mode | Corpus thực tế đọc một giờ; đổi font/window vẫn giữ đoạn |
| D — Tinh gọn runtime | Tuần 7–8 | Gỡ theo nhóm Debug/Tasks/SCM/Terminal/AI/Remote và built-ins; menu/command audit | Build ổn; không khởi chạy subsystem mục tiêu; đo process/network |
| E — MVP hardening | Tuần 9–10 | Cover, import cancel/errors, basic export, model/cache lifecycle, dùng thử | MVP TXT cài được, không mất dữ liệu, các tính năng thừa không gọi lại được |
| F — EPUB/search/notes | Tuần 11–13 | EPUB, custom resource search, tiếng Việt, highlight/notes, full backup | Import đúng thứ tự; search mở đúng đoạn; restore hồ sơ sạch |
| G — Artifact trim/release | Tuần 14–16 | Loại bundle/assets/binaries không dùng, migration, installer, upgrade, performance | Bản 1.0 + bảng đo + known limitations + build lặp lại được |

Tổng tham khảo: **MVP 8–10 tuần, 1.0 khoảng 12–16 tuần**, khoảng 300–480 giờ nếu 25–30 giờ/tuần. Bảng dùng đường 16 tuần có dự phòng; nền build quen thuộc và scope gọn có thể ngắn hơn. Developer chưa quen codebase hoặc muốn gỡ sâu extension host/DI ngay đầu có thể cần lâu hơn.

Không trì hoãn chức năng đọc đến khi toàn bộ IDE đã bị gỡ sạch. Đầu ra của B phải dùng được, để phát hiện sớm giới hạn editor/provider.

## 10. Backlog và tiêu chí hoàn thành

| Mức | Tính năng | Nghiệm thu |
| --- | --- | --- |
| P0 | Build/branding/profile độc lập | Chạy đóng gói; app ID, protocol, user-data không đụng VS Code |
| P0 | TXT import | Preview/sửa chương, cancel, dedup, encoding lỗi có phản hồi |
| P0 | File ảo/editor | Open đúng chapter ID, readonly ở UI và provider, alias không thay identity |
| P0 | Đọc/điều hướng | Copy/find/wrap, next/prev, Quick Open, tabs, back/forward |
| P0 | Progress/bookmark | Restart/resize/font đổi vẫn về anchor đúng |
| P0 | Comment mode/alias | Không kích hoạt language server; copy nguyên bản; nhãn đồng bộ |
| P0 | Runtime trim | Tính năng bị gỡ không gọi lại qua palette/keybinding/context menu/deep link |
| P0 | Cover/export | Chuyển nhanh, không đợi job, trở về đúng vị trí; export metadata |
| P1 | EPUB/search | Spine/order đúng; URI search integration; Unicode mapping đúng |
| P1 | Notes/backup/migration | Khôi phục content/progress/annotation và upgrade hồ sơ cũ |
| P1 | Package trim/performance | Số đo baseline vs final; build exclusions đã kiểm tra |
| P2 | Online/sync/TTS | Estimate riêng theo nguồn/backend, không nằm trong 1.0 |

Giữ themes/grammars cần thiết không đồng nghĩa giữ mọi built-in extension. Nếu grammar reader cần extension host, ghi lý do và chi phí trước khi quyết định thay bằng token provider nội bộ.

## 11. Kiểm chứng tối ưu và regression

Đo cùng máy, cùng production configuration, cùng corpus giữa baseline và từng nhóm thay đổi. Tách số đo dev build khỏi release build.

| Chỉ số | Phép đo |
| --- | --- |
| Startup | Cold launch → editor tương tác; p50/p95 |
| CPU idle | App không thao tác, kiểm tra service polling/extension activation |
| Memory | Tổng process sau 1 giờ đọc, 10 tab và 100 lần cover |
| Process count | Extension host/language worker/PTY/task/remote thực sự có khởi chạy không |
| Package size | Installer và installed footprint, asset/native binary inventory |
| Network | Fresh profile, offline launch, idle và các action; endpoint nào vẫn được gọi |
| Model lifetime | Chuyển 1.000 chương, đóng tab; số model/cache có giới hạn |
| Cover | Shortcut → frame cover khi import/index chạy |

Mục tiêu UI tham khảo: cached chapter p95 ≤150 ms; normal chapter ≤100k ký tự p95 ≤500 ms; cover p95 ≤100 ms khi app phản hồi. Chốt memory/startup budget sau baseline, không hứa mức RAM/installer rất nhỏ chỉ vì bỏ menu IDE.

Corpus: TXT 20 MB; 10.000 chapter metadata; chương 500k–1 triệu ký tự; Unicode dấu tổ hợp/emoji; EPUB malformed, spine khác filename; long title và DPI lớn. Search không dấu dùng trường/index dẫn xuất có mapping offsets; không xóa dấu trong canonical.

Tests ưu tiên parser, provider readonly, URI identity, offset mapping, persistence/import transaction, migration và backup. Desktop smoke: import → đọc → bookmark → cover → restart → restore. Sau mỗi nhóm trim kiểm tra tabs, find, palette, settings, theme, Explorer, model disposal và console/service errors.

## 12. Quản lý fork lâu dài

- Giữ upstream remote và commit base rõ ràng; patch sản phẩm theo nhóm nhỏ, dễ review.
- Reader domain/service/contributions tập trung; tránh sửa sâu core editor nếu APIs đã đủ.
- Lưu manifest module/service/built-in extensions giữ và gỡ, kèm consumer/dependency và test chứng minh.
- Có patch branding, build exclusions, reader feature, runtime trim riêng để merge dễ hơn.
- Theo dõi security fixes Electron/Chromium và upstream; update theo release đã đánh giá, không tự động rebase theo `main` mỗi ngày.
- Mỗi upstream update chạy build + smoke + regression corpus; tách update engine với feature reader.
- Không giữ phiên bản Electron cũ vô thời hạn chỉ để tránh merge conflict.

Nếu merge upkeep vượt lợi ích, đánh giá lại mức trim trước khi chuyển framework: một fork ít thay core nhưng tắt activation có thể dễ bảo trì hơn fork xóa sâu toàn bộ service graph.

## 13. Rủi ro và cách xử lý

| Rủi ro | Biện pháp |
| --- | --- |
| Xóa contribution làm mất service consumer cần | Gỡ từng nhóm, trace DI và integration test |
| UI ẩn nhưng subsystem vẫn chạy | Process/activation/network audit, không chỉ screenshot |
| Đặt filename .ts kích hoạt analyzer | Language ID riêng, kiểm tra built-in activation |
| Search gốc bỏ qua file ảo | Provider spike; reader search backend khi cần |
| Comment projection làm lệch progress/copy | Canonical giữ nguyên; tokens/decorations trước; mapping nếu biến đổi |
| Explorer sorting không theo chương | Numeric ordinal; custom view dùng native tree nếu cần |
| Thu nhỏ package nhưng memory không giảm | Đo runtime độc lập với bundle size |
| Fork cũ mất security fixes | Upstream policy, regression corpus, update engine định kỳ |
| Trông giống IDE nhưng đọc mệt | Mono font tiếng Việt, wrap/line height, đọc thử dài |
| App build được nhưng installer lỗi | Baseline packaged spike sớm, CI trên nền tảng đích |

## 14. Đầu ra bàn giao

1. Repository fork khi triển khai thực tế, commit upstream base, build instructions và lockfile.
2. Product manifest/branding/profile riêng; license/notice đi kèm.
3. Reader contribution, canonical model/importers, URI/provider contract và progress service.
4. Matrix giữ/gỡ contribution/services/extensions/binaries và dependency evidence.
5. Corpus/tests cốt lõi; benchmark baseline/final; process/network audit.
6. Installer Windows, backup/restore/migrations, release notes và known limitations.

Tài liệu này cập nhật lộ trình theo ý tưởng fork; các đầu ra code/build trên là công việc cần triển khai, không phải trạng thái đã hoàn thành.

## 15. Nguồn đã kiểm tra

Tra cứu ngày 05/10/2026. Các nhận định kiến trúc dựa trên tài liệu và nguồn được đọc; thời gian, backlog, scheme URI, bố trí reader và performance targets là đề xuất cần spike.

- Repository/README: https://github.com/microsoft/vscode
- MIT license: https://github.com/microsoft/vscode/blob/main/LICENSE.txt
- Source organization/DI/contributions: https://github.com/microsoft/vscode/wiki/Source-Code-Organization
- Code-OSS vs distribution: https://github.com/microsoft/vscode/wiki/Differences-between-the-repository-and-Visual-Studio-Code
- Common entrypoint: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/workbench.common.main.ts
- Desktop entrypoint: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/workbench.desktop.main.ts
- Virtual workspaces: https://code.visualstudio.com/api/extension-guides/virtual-workspaces
- Product configuration: https://github.com/microsoft/vscode/blob/main/product.json

Phương án ưu tiên: **giữ workbench + Monaco gốc; xây reader bằng resource/contribution riêng; ngắt runtime theo nhóm; sau đó tối ưu bản build dựa trên số đo**.

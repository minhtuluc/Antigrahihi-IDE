# Roadmap R3 — Ebook reader trong vỏ IDE, backend IDE được ngắt

Cập nhật: 05/10/2026. Tên tạm: **Workspace Reader**. R3 thay thế R2.

Thiết kế chi tiết để review: [Workspace Reader R3](docs/superpowers/specs/2026-10-05-workspace-reader-r3-design.md).
Bản đồ nguồn/runtime: [Runtime boundaries](docs/reader-r3-runtime-boundaries.md).
Bản cũ: [R2 lưu trữ](docs/archive/ide-novel-reader-roadmap-r2.md).

## 1. Chốt lại mục tiêu

Một ứng dụng ebook offline thật: EPUB/TXT, thư viện/bìa/mục lục, tiến độ và tiếp tục đọc,
bookmark/highlight/ghi chú, search, typography/phân trang, backup/restore.
Giao diện mặc định khiến người nhìn lướt tưởng đang coding. **Người dùng đã chọn nội dung
truyện nằm trong string/object của code giả**, có syntax màu và alias project/source file.

Terminal/Git/Debug/Testing/Extensions/Chat/Remote vẫn có nút và panel làm decoy,
nhưng phía sau không có shell, Git runner, debugger, AI, extension host hoặc kết nối dịch vụ IDE.
Giữ component UI gốc, thay chức năng bằng reader và scene cục bộ; không giữ backend chỉ để giữ nút.

Mở TXT bằng Monaco, thay extension file hay ẩn menu chưa đạt mục tiêu này.

## 2. Khác biệt thấy được so với VS Code

| Khi dùng | Workspace Reader R3 phải làm |
| --- | --- |
| Nhập sách | Nhập EPUB/TXT vào Library, hiểu metadata/cover/spine/chương, không cần extension |
| Đọc | Mục lục, chuyển chương/trang, nhớ đoạn đọc và mở lại đúng vị trí |
| Ngụy trang | Code string/object, project alias, tabs/breadcrumb/search/status đồng bộ |
| Đọc như sách | Chuyển book mode: typography, scroll/pagination, ảnh/footnote cơ bản; giữ anchor |
| Ghi nhớ | Bookmark/highlight/notes/search trên nội dung canonical, không phụ thuộc số dòng giả |
| Cover | Chuyển sang code mẫu ngay, đóng UI lộ nội dung, quay lại đúng đoạn |
| Bấm nút IDE | Chỉ mở/chuyển scene; không gọi subsystem lập trình |
| Dùng lâu | Library/collections, progress/session, backup/restore/export |
| Độ nhẹ | Runtime không khởi tạo subsystem cũ; release loại worker/extension/native binary không dùng |

## 3. Hiện trạng và hướng kiến trúc

Đã có checkout Code-OSS 1.140.0 ở SHA `07f806f999227108933c2e30515b26eecc1fda74`,
Node 24.18.0/Electron target 43.7.3, Linux install/build và app chạy trên host.
Chưa có reader/decoy/trim/installer. Không làm lại bước environment.

Tiếp tục fork: giữ workbench layout, tree/menu/keybindings/themes/icons, editor groups và
Monaco. Thêm book EditorPane native cho ebook, code projection cho coding, một store/anchor
chung. Scene decoy là contribution mới chỉ có dữ liệu/view state, không import service IDE cũ.
Reader đăng ký trực tiếp, không phụ thuộc extension API/host. Windows vẫn là nền đóng gói ưu tiên.

Các registration phải cắt ở renderer, Electron main, shared/utility process, alternate agent
window, CLI/protocol và build pipeline. Không chỉ sửa hai file workbench entrypoint.

## 4. Phạm vi bản đầu

**P0/MVP:** EPUB reflowable không DRM + TXT; Library/metadata/bìa/collections; TOC/navigation;
code string/object + alias toàn UI; book mode scroll/pagination/typography/ảnh-footnote;
progress/bookmark/highlight/notes/search; cover; các panel decoy; không IDE backend/extension
host/cloud; backup/restore/export; installer và audit runtime/artifact/performance.

**P1:** comment preset, scene/theme thêm, reading stats, global shortcut/auto-cover,
auto-scroll/TTS/dictionary local có budget riêng.

**P2:** PDF/MOBI/AZW/comic/fixed-layout, nguồn online và sync. Không thuộc release R3 đầu.

Bản chơi thử có thể đơn giản scene/stats; không biến lại thành TXT viewer để gọi MVP.

## 5. Thứ tự làm và cổng nghiệm thu

| ID | Công việc | Cổng hoàn thành |
| --- | --- | --- |
| R3-00 | Đo baseline, graph services/process/network, spike DB/parser/EditorPane/host-free boot | Có inventory, số budget và lựa chọn từ kết quả thực |
| R3-01 | Composition root reader, catalog assets tĩnh, decoy engine; cut AI/MCP/remote/cloud/host activation | Boot không agent/extension host/cloud; scene độc lập; bỏ artifact của nhóm ngay trong product build |
| R3-02 | Store/IPC/import EPUB+TXT/Library/TOC/VFS/transaction | Sách đúng spine/chương, cancel an toàn, restart còn Library |
| R3-03 | Code projection/alias/progress/bookmark/cover | Demo: EPUB → code giả → bookmark → cover → restart đúng đoạn |
| R3-04 | Book pane/pagination/ảnh/footnote/notes/highlight/search | Đổi mode/font/window không lệch anchor; đọc một giờ |
| R3-05 | Cắt Terminal/SCM/Debug/Tasks/Testing/language/notebook còn lại, dispatch và artifact audit từng nhóm | Click/call command cũ không backend/process/channel/network mục tiêu; package vắng artifact tương ứng |
| R3-06 | Backup/restore/migration/crash/lifecycle hardening | Restore profile sạch đúng content/notes; model/cache bounded |
| R3-07 | Final trim dependencies/assets còn thừa, Windows package, benchmark, camouflage | MVP R3: ebook thật + decoy + tất cả runtime cuts + cumulative package audit |
| R3-08 | Polish/presets/accessibility/đọc thử | 1.0 với số đo và limitations |

Cut nào làm sớm được thì đưa lên R3-01; không chờ reader hoàn thiện mới bắt đầu ngắt runtime.
Mỗi phase trim phải loại luôn host/worker/binary tương ứng khỏi product build; R3-07 chỉ là
trim phần thừa bắc cầu cuối cùng và audit toàn release.
Demo R3-03 chưa được gọi là MVP nhẹ hoàn chỉnh. Từng phase cần task plan/TDD/review riêng;
lượt này chỉ sửa kế hoạch, không thay code app.

Ước tính tham khảo ở 25–30 giờ/tuần: demo 3–5 tuần, MVP 10–16 tuần, 1.0 14–20 tuần;
không là deadline. Cập nhật sau R3-00/R3-01 vì mapping/pagination/service graph dễ vượt estimate.

## 6. Các gate quan trọng nhất

- Cùng một sách và anchor giữa code/book; quote/escape/emoji/dấu tổ hợp không làm lệch copy/find/notes.
- EPUB 2 NCX và EPUB 3 nav đều có fixture; spine item vắng TOC vẫn được đọc đúng thứ tự.
- Cùng bytes nhưng đổi split/encoding/normalizer có version riêng; bookmark cũ không bị ghép sang cấu trúc mới.
- Search/jump không tự đánh dấu đọc xong; đóng/mở và font/resize vẫn đúng đoạn.
- Startup/coding/cover không lóe bìa hoặc tên thật; alias phủ mọi nhãn, tooltip/recent/search/window title.
- Thử nhìn lướt 3–5 giây: ít nhất 80% lượt trong nhóm nhỏ 3–5 người nghĩ là coding; kiểm tra cả khả năng đọc lâu.
- Cold/old profile, click decoy, palette/keybinding/deep link/IPC không phục hồi backend đã gỡ.
- Không PTY/extension host/language server/Git/debug/task/test/agent/MCP/remote runtime; Electron và reader process cần thiết có allowlist.
- Không request dịch vụ IDE/cloud hoặc tải remote EPUB resource; không polling/timer thừa khi idle.
- So baseline/release cùng máy/workload: RAM/startup/CPU/package có số đo; budget cụ thể chốt tại R3-00.
- Backup snapshot nhất quán; restore validation/staging lỗi không phá profile hiện tại.

Giữ Electron/Monaco có chi phí nền. Độ nhẹ phải chứng minh bằng process/activation/network và
installed artifact, không bằng menu đã ẩn hoặc kích thước source checkout.

## 7. Bước triển khai đầu tiên sau khi chốt R3

R3-00: ghi graph ở source đã khóa, đo bản đóng gói baseline và thử các contract khó nhất.
R3-01: dựng reader composition root cùng scene decoy tối thiểu; tách activation/backend nặng.
Sau đó mới thêm Library/import/reader từng slice. Chi tiết hành vi và ranh giới dữ liệu nằm trong
[spec R3](docs/superpowers/specs/2026-10-05-workspace-reader-r3-design.md).

Đầu ra kế hoạch này là hướng sản phẩm và gate reviewable, không phải tuyên bố các chức năng
hoặc runtime cuts đã được hoàn thành.

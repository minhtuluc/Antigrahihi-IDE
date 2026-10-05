# Workspace Reader R3 Implementation Plan

> **For agentic workers:** Use subagent-driven-development; ownership below is binding. Execute TDD before implementation. Only one reviewer per completed delivery pass.

**Goal:** Implement the R3 ebook reader, native Code-OSS workbench composition, canonical code/book presentation, offline decoys and a product build that cannot start the removed IDE subsystems.

**Architecture:** A reader-specific Electron main/preload owns a bounded IO utility process and local SQLite store. The renderer creates the original Workbench from an explicit core registration allowlist, then registers reader EditorPane/views and decoy views; original broad desktop/browser composition roots are never imported. Domain content and canonical anchors are shared by book DOM rendering and Monaco projection.

**Tech Stack:** Pinned Code-OSS1.140.0, Electron43.7.3 (actual embedded Node24.21.0), local build Node24.18.0, TypeScript, native node:sqlite, existing yauzl3.3.1 and fast-xml-parser5.8.0.

**Spec:** `docs/superpowers/specs/2026-10-05-workspace-reader-r3-design.md` and `ide-novel-reader-roadmap.md`.

## Global Constraints

- Worktree `/home/minhtu/Project/NIDE/.worktrees/reader-r3`, branch `work/reader-r3`. Baseline checkout is preserved.
- Reuse installed node_modules read-only; no npm ci through the shared symlink and no changes to upstream lockfile until a separately reviewed dependency decision.
- No extension API/host, PTY, Git/debug/task/test runner, Copilot/agent/MCP/remote/cloud network in product entrypoints.
- Keep original Workbench/layout/editor components, not a hand-built replacement shell.
- Store canonical UTF-16 anchors; generated syntax and line numbers are presentation only.
- TXT and EPUB2/3 reflowable are required; imports/restore transactional and readonly content.
- No unsanitized imported HTML/scripts/remote resources. Native IO operations only through typed reader requests.
- Source assets and product artifacts have explicit manifests. Every detached group is absent from product bundles immediately.
- User approved R3 and requested execution; continue without further routine approval gates.

## Task 1: Repository, baseline and runtime feasibility (coordinator)

**Files:** product docs above, `docs/reader/progress.md`, `build/reader/baseline.json`, `build/reader/product-manifest.json`.

- [x] Create isolated worktree and copy approved roadmap/spec/runtime inventory into its Git history.
- [x] Probe actual Electron: `ELECTRON_RUN_AS_NODE=1 ../code-oss/.build/electron/code-oss -e 'console.log(process.versions, typeof require("node:sqlite").DatabaseSync)'` with path adjusted from workspace. Observed Node24.21.0 and SQLite available.
- [ ] Record source/module inventory, core composition risks, import budgets and Linux baseline measurements; mark absent Windows measurements explicitly.
- [ ] Set initial testable budgets: imported file ≤64MiB, ZIP entries≤20,000, uncompressed total≤256MiB, one asset≤16MiB, chapter text≤2MiB; cap async job/cache concurrency. Stage benchmarks refine performance budgets rather than invent baseline measurements.

## Task 2: Canonical domain, importer and SQLite IO (backend worker)

**Owned paths:** `src/vs/platform/novelReader/common/`, `src/vs/platform/novelReader/node/`, their `test/` subdirectories. No browser/composition/build edits.

**API types:** exported from `common/reader.ts`:

```ts
export type PresentationMode = 'code' | 'book';
export interface ReaderAnchor { bookId: string; versionId: string; chapterId: string; offset: number; blockId?: string; quote?: string }
export interface ReaderMark { start: number; end: number; kind: 'strong' | 'emphasis' | 'link'; href?: string }
export interface ReaderBlock { id: string; kind: 'paragraph' | 'heading' | 'image' | 'footnote' | 'quote' | 'list'; text: string; start: number; end: number; level?: number; marks?: ReaderMark[]; assetId?: string; href?: string }
export interface ReaderChapter { id: string; ordinal: number; title: string; text: string; blocks: ReaderBlock[] }
export interface ReaderAsset { id: string; mime: string; data: string }
export interface ReaderBook { id: string; versionId: string; title: string; author: string; alias: string; chapters: ReaderChapter[]; assets: ReaderAsset[]; coverAssetId?: string }
export interface ReaderBookSummary { id: string; versionId: string; title: string; author: string; alias: string; chapterCount: number; coverAssetId?: string; tags: string[]; status: 'unread' | 'reading' | 'finished'; position?: ReaderAnchor }
export interface ReaderAnnotation { id: string; kind: 'bookmark' | 'highlight' | 'note'; anchor: ReaderAnchor; endOffset?: number; color?: string; note?: string; createdAt: number }
export interface ReaderSearchResult { anchor: ReaderAnchor; endOffset: number; snippet: string }
export interface ReaderImportOptions { encoding?: string; splitPattern?: string; title?: string; author?: string; alias?: string }
export interface ReaderPreferences { fontSize: number; lineHeight: number; bookFont: string; bookTheme: 'dark' | 'light' | 'sepia'; paginated: boolean; columns: 1 | 2; minimap: boolean }
export interface ReaderSession { anchor?: ReaderAnchor; mode: PresentationMode; covered: boolean }
```

`node/readerStore.ts` exports `ReaderStore(root: string)` and async public methods:

```ts
listBooks(): Promise<ReaderBookSummary[]>;
getBook(bookId: string, versionId?: string): Promise<ReaderBook>;
importBook(bytes: Uint8Array, filename: string, options?: ReaderImportOptions): Promise<ReaderBook>;
previewImport(bytes: Uint8Array, filename: string, options?: ReaderImportOptions): Promise<ReaderBook>;
removeBook(bookId: string): Promise<void>;
updateBook(bookId: string, patch: { alias?: string; tags?: string[]; status?: ReaderBookSummary['status'] }): Promise<void>;
savePosition(anchor: ReaderAnchor): Promise<void>;
listAnnotations(bookId?: string): Promise<ReaderAnnotation[]>;
saveAnnotation(annotation: Omit<ReaderAnnotation, 'id' | 'createdAt'>): Promise<ReaderAnnotation>;
removeAnnotation(id: string): Promise<void>;
search(query: string, options?: { bookId?: string; ignoreDiacritics?: boolean }): Promise<ReaderSearchResult[]>;
getSession(): Promise<ReaderSession>;
saveSession(session: ReaderSession): Promise<void>;
getPreferences(): Promise<ReaderPreferences>;
savePreferences(preferences: Partial<ReaderPreferences>): Promise<ReaderPreferences>;
exportBackup(): Promise<Uint8Array>;
restoreBackup(bytes: Uint8Array): Promise<void>;
exportAnnotations(): Promise<string>;
close(): Promise<void>;
```

UI sees only chapter-on-demand and summary data through the IPC facade even if initial store returns a full book. Narrow request DTOs in `common/readerIpc.ts` must reject unknown method, malformed anchor/range and over-budget bytes. Methods above may be reduced to a typed request union instead of exposing arbitrary reflection.

- [ ] Write failing native tests: UTF-8/BOM TXT split; EPUB2NCX/EPUB3nav order; unlisted spine chapter; archive traversal/bombs/remote markup; import options change version; cancelled/failed import no book; SQLite reopen exact anchors; diacritic offset mapping; transactional restore corruption leaves DB unchanged.
- [ ] Run with local Node24 `--test --test-isolation=none`, plus Electron RunAsNode for SQLite compatibility. Observe actual missing behavior failures.
- [ ] Implement stable version fingerprint over raw bytes/import choices/policies and canonical schema; parser yields safe block/asset records and warnings. IO never runs shell or loads remote resources.
- [ ] Implement SQLite migrations/transactions, readonly immutable book storage, annotations/session/preference/search/backup validation and bounded memory; close handles in finally.
- [ ] Run targeted tests and report exact commands, counts, limits and unresolved cases.

## Task 3: Native reader UI, code projection and decoy views (UI worker)

**Owned paths:** `src/vs/workbench/contrib/novelReader/`, `src/vs/workbench/contrib/ideDecoy/` and their tests/CSS. Backend/root composition/build owned elsewhere.

**Consumes:** DTOs above and `window.workspaceReader` facade, methods mirror store plus `chooseImport():Promise<ReaderBook|undefined>`, `chooseBackupExport():Promise<void>`, `chooseBackupRestore():Promise<void>`, `setWindowTitle(alias:string):void`. IPC facade will be provided by runtime worker. Register a browser-local DI service `IReaderService` around the facade; do not import Electron or node into browser.

**Produces:** `browser/novelReader.contribution.ts` registrations; default reader startup contribution at restored lifecycle, custom read-only EditorInput/EditorPane, Library/TOC views; `ideDecoy/browser/ideDecoy.contribution.ts` view registrations. Pure `common/codeProjection.ts` exports mapping/copy utilities and is testable without DOM.

- [ ] Write failing tests for escaped quotes/backslashes/newlines/emoji/combining characters; canonical↔display range mapping; scaffolding ignored in copy; version-specific anchors; mode and cover reducer restores anchor; bounded decoy echo/action registry.
- [ ] Register code language/tokenization internally and read-only Monaco code pane; use original editor component, resource label aliases and editor groups.
- [ ] Build native DOM book EditorPane with sanitized block renderer, marks/images/footnotes, scroll/pagination/font/theme; viewport selection maps to canonical anchors.
- [ ] Library/import preview/TOC/navigation/bookmarks/highlights/notes/search/preferences/export/restore use real facade; errors and empty states tell user next action. Private book labels only visible in book mode or explicitly opened data dialogs.
- [ ] Cover has preload fixture and closes app-managed transient UI without waiting for IO. Startup code mode; save/restore canonical session. Find searches canonical content; Ctrl+C copies source selection.
- [ ] Terminal/SCM/Debug/Testing/Extensions/Chat scene views use original view/tree/icon infrastructure and local fixtures, no backend contributions/imports, idle timers or eval. Register their controlled commands.
- [ ] Targeted tests, component type checks and runtime smoke using coordinator's build; adapt to backend API without overwriting others.

## Task 4: Product composition, Electron main/IO host and artifact allowlist (runtime worker)

**Owned paths:** `src/vs/code/electron-main/readerMain.ts`, `src/vs/code/electron-preload/readerPreload.ts`, `src/vs/code/electron-utility/novelReader/`, `src/vs/workbench/reader.*`, `src/vs/workbench/services/reader/`, `build/reader/` (excluding coordinator baseline/progress), and their tests. No domain or contribution edits unless coordinating ownership.

- [ ] Core source feasibility inventory from architect reviewer: instantiate ORIGINAL Workbench directly with an explicit singleton/import allowlist; avoid broad DesktopMain/BrowserMain/common.main. Original Workbench copies globally registered descriptors, so no broad registration imports then pretend overrides are sufficient.
- [ ] Write failing composition/capability tests: forbidden subsystem imports/worker entrypoints absent; allowlisted IPC validates sender/method/input; external navigation/network denied; unknown IDE command cannot spawn.
- [ ] Reader Electron startup has its own app ID/profile/protocol; no original app.ts/remote/MCP/PTY/crash uploader/extension starter. BrowserWindow uses isolated preload, disabled nodeIntegration and narrow IO; utility process owns ReaderStore. Track only necessary renderer/GPU/reader utility processes.
- [ ] Finite static theme/icon/language catalog satisfies core registration barriers with no extension scanner/factory/activation. Register real core services/components needed for Workbench and reader, explicit local-only contracts where retained consumer requires them.
- [ ] Bundle product renderer/main/preload/IO with existing build esbuild; generate manifest/metafile and inspect that blocked entrypoints/native deps are absent. Load local CSP-protected assets; fonts/icons bundled.
- [ ] Provide product commands `build/reader/build.mjs` and `build/reader/run.mjs`; seed local Electron path from baseline without download. Desktop smoke/screenshot hooks use separate test profile and never user's baseline profile.
- [ ] Validate native startup and forbidden module/activation/socket/channel absence, packaging inventory, targeted type check. Record Windows validation unavailable rather than claiming Windows pass.

## Task 5: Integration, metrics, tests and release workflow (coordinator)

- [ ] Maintain ledger `docs/reader/progress.md` with rulings, completed tasks/tests/reviews and outstanding gates. Never reset completed work after compaction.
- [ ] Integrate backend/facade/contributions/composition; bundle and run headless browser/native smoke. Fix failures via systematic-debugging before patches.
- [ ] Run imported fixtures through code/book/anchor/cover/restart/backup flows; inspect screenshots and CPU/RSS/process/metafile evidence.
- [ ] One code-reviewer reviews the completed delivery; fix material findings, scoped re-review. Commit validated task increments locally; no external push/publish.
- [ ] Update environment launcher/docs so user's run command starts actual reader build, without changing baseline profile. Keep runnable release artifact and tests.
- [ ] Continue remaining R3 gates (hardening/package/accessibility), recording platform/camouflage gates requiring host/user observation honestly; no MVP/1.0 completion claim before required evidence.

# SDD ledger — plan: docs/superpowers/plans/2026-10-05-reader-r3-implementation.md

Plan: `docs/superpowers/plans/2026-10-05-reader-r3-implementation.md`
Spec: `docs/superpowers/specs/2026-10-05-workspace-reader-r3-design.md`

## Completed setup

- User approved R3 and requested execution on 05/10/2026.
- Worktree `.worktrees/reader-r3`, branch `work/reader-r3`, pinned upstream base.
- Approved docs copied into version-controlled product checkout; baseline checkout retained.
- Electron43.7.3 actually embeds Node24.21.0; `node:sqlite.DatabaseSync` available. Probe exit0.
- Installed dependency read-only reuse: yauzl3.3.1, fast-xml-parser5.8.0, xmldom0.8.15, Playwright1.61.1.

## Rulings

- Ruling: own reader Electron composition root — original main/app.ts creates forbidden hosts/channels independently of panels; using a dedicated root severs them rather than masking flags.
- Ruling: use ORIGINAL Workbench with explicit core registrations — BrowserMain/DesktopMain create remote/account services; importing them contradicts R3. If DI spike fails, refactor core consumers, not replace shell silently.
- Ruling: local Node24 uses `--test-isolation=none` in this sandbox; subprocess output capture may require regular files. No test skips for missing behavior.
- Ruling: absent Windows runtime and observer group are external acceptance gaps; continue independent Linux implementation and measurements.
- Ruling: independent domain, UI and runtime tasks execute concurrently under explicit ownership, as the user AGENTS.md requests parallel work for independent tasks. Shared interfaces remain sequentially coordinated; overlapping edits would cost reconciliation.

## Dependency preflight

| Tasks | Shared interface/files | Decision |
| --- | --- | --- |
| Backend/UI | `common/reader.ts` DTOs and facade methods | Backend owns definitions; UI imports them |
| Backend/runtime | `ReaderStore` methods, typed IPC requests | Runtime adapts through explicit allowlist, no reflective generic execution |
| UI/runtime | contribution modules and core singleton registry | Runtime imports owned contributions; UI does not edit roots |
| Runtime/coordinator | build/reader scripts vs metrics/ledger | Runtime owns build commands; coordinator owns evidence/launcher/docs |

| Task | Internal requirements checked | Result |
| --- | --- | --- |
| 1 | Actual runtime probe vs pinned build Node; measurement scope | Electron Node24.21.0 distinct from build Node24.18.0; GUI numbers cannot be invented |
| 2 | Tests/import version/transaction rules vs owned paths | DTO common definitions serve runtime and UI; no browser files needed |
| 3 | Original EditorPane/Monaco vs Book DOM; canonical anchor/copy | Shared projection is browser-independent; original Workbench composition owned by Task4 |
| 4 | Build artifact cuts vs real core parts and local capability contracts | Native retained core must use finite DI contracts; hiding old views insufficient |
| 5 | Native/Windows acceptance vs available managed sandbox | Compiled and tested source can proceed; host/Windows gates explicitly unresolved |

## Current execution

- Task1: baseline inventory recorded in `build/reader/baseline.json`; product capabilities and import budgets in `build/reader/product-manifest.json`.
- Task2: worker `/root/r3_backend`, DTOs and IPC boundary implemented; root boundary test 1/1 passed on Node24.
- Task3: worker `/root/r3_ui`, native contributions and canonical projection in progress.
- Task4: worker `/root/r3_runtime`, explicit Workbench/IO composition in progress.
- Coordinator: shared `build/reader/test.mjs` uses existing esbuild and native Node test runner; build dependency and Electron typings reused read-only.
- Native probe failed before application startup: exit133, Chromium `sandbox_host_linux.cc` shutdown EPERM; independent Python AF_UNIX X0 socket connect also EPERM. No native GUI or timing/RSS claim. Host smoke needs an unrestricted desktop terminal; production security stays enabled.

No implementation task complete yet.

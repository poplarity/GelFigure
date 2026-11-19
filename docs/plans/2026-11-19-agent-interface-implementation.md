# GelFigure Agent Interface Implementation Plan

**Goal:** Local CLI + MCP + portable skill that completes the approved collect/analyze/question/prepare/render workflow without changing web rendering.
**Architecture:** Separate `agent/` package, minimal host page reusing repository JS, stable browser facade, Node runner/path guards/persistent artifacts; pure strict contract and planner with digest/revision gates. The webpage retains no runtime dependencies.
**Tech Stack:** Node22+, pinned Playwright Chromium, official MCP SDK stdio, Node test runner, existing vanilla JS engines and exports.

User approved design on 2026-11-19. `agent/CONTRACT.md` is authoritative implementation contract, including schemas/defaults/state gate. Develop in isolated agent-interface worktree; integrate to dev only. Preserve MIT and original M name placement.

- [x] Baseline web engine verification and new agent package dependencies.
- [x] Pure schema/planner: red tests for required info, evidence conflicts, invalid params, stale revision and tamper; implement and run green.
- [x] Browser facade: load without swallowing errors; isolated storage no UI prompts; stable IDs, summaries, application of allowed annotations and sizing, technical issues, blobs/diagnostic.
- [x] Node service + CLI: path/size guards, serial queue/timeouts, input analyze/project resume, prepare gate, immutable new runs, digest+project identity checked at render, exports+manifest, revision merge and validation.
- [x] End-to-end synthetic tests: TIFF/PNG/protein, unknowns and recorded answers, all formats/project round-trip, marker targeting, no final before ready, tamper/stale/font/quality, outputs/filesystem errors, no network, parallel tasks.
- [x] MCP same service: real SDK client tests tools/list/call and errors; stdout protocol only; bounded results. Skill includes grounded record intake and staged questions; independent realistic review.
- [x] Portable packaging: bundled host Node+managed headless shell+licenses+launchers+skill, verify host zip offline cold-start; CI for other supported platforms, explicit support statement.
- [x] Bilingual user/developer docs and changelog; full original web regression if sources changed; agent full suite + final independent code review.
- [x] Commit/push dev; deliver portable host package and skill with working invocation. No main/tag/release unless requested.

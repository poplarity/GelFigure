# GelFigure Agent interface

[中文](agent-interface.zh-CN.md)

The agent interface prepares DNA/protein gel figures from local images or `.gelfig` projects. CLI and MCP call the same `AgentService`; the normal webpage remains usable independently. Image processing runs locally in a pinned, managed Chromium headless shell. No system Chrome, desktop UI automation, arbitrary scripts or image uploads are required. The host AI service and any authorized record connectors have their own network behavior.

## Developer installation

Use Node.js 22 or newer. From the repository root:

```sh
npm ci --prefix agent
node agent/bin/gelfigure.mjs setup
node agent/bin/gelfigure.mjs doctor --workspace /absolute/existing/workspace
```

Dependency installation and `setup` require network access. Setup invokes the installed Playwright CLI with the current Node executable and `install --only-shell chromium`, without a shell. Installer output goes to stderr; the final result is JSON. Analyze/prepare/render use the installed runtime offline. Do not install or publish this private package to npm as part of setup.

For local transport tests, without downloads:

```sh
node --test agent/test/transport.test.mjs
```

The doctor test runs installed Chromium when present and otherwise skips; the suite never installs a browser. It also exercises the official MCP SDK over linked transports and a real stdio subprocess.

## Portable package and skill

The portable bundle includes Node, pinned node modules, the matching Chromium headless shell, app files and a portable skill. Use a package built for your OS/CPU. On macOS/Linux, run `./gelfigure`; on Windows, run `gelfigure.cmd`. The entry also recognizes `<bundle-root>/runtime/browsers` before importing Playwright, so a client may launch the bundled Node with `agent/bin/gelfigure.mjs` directly.

The bundle build/verification work is separate from this transport interface. Cross-OS verification is pending until the relevant package actually passes its checks. No signed or notarized installers are claimed. Linux may require browser system libraries. Consult the specific bundle's platform/architecture metadata and test result rather than assuming that one archive runs everywhere.

Copy the entire `skills/gelfigure` folder from a developer checkout, or `skill/` from a bundle, into your host's skill directory under the name `gelfigure`. For a Codex personal skill, the resulting entry is `~/.codex/skills/gelfigure/SKILL.md`; use the host's normal discovery/reload process. Keep `references/` and `agents/` alongside it. Automatic discovery is enabled. The skill has no private connector or other-skill dependency and can use either MCP or a configured CLI. Installing the skill does not install the runtime or configure MCP.

No command here edits host configuration. Add an MCP entry manually in the format your host supports. For clients using `mcpServers` JSON, a developer configuration is:

```json
{
  "mcpServers": {
    "gelfigure": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/GelFigure/agent/bin/gelfigure.mjs",
        "mcp",
        "--workspace",
        "/absolute/existing/workspace"
      ]
    }
  }
}
```

For a portable package, replace `command` with the bundled `runtime/node` (Windows: `runtime/node.exe`) and point the entry path at the bundle. Arguments are separate strings; do not put shell quoting inside them. Hosts with other configuration formats need equivalent command/args settings. MCP startup errors go to stderr, and stdout is reserved for protocol messages.

## CLI

Examples below use `gelfigure` as shorthand for your configured developer command or portable launcher. `--workspace` must name an absolute, existing directory except for help, version and setup. All input/spec/output paths must remain inside it, including symlink targets. JSON input files are limited to 4 MiB; specs have additional nested limits. Outputs use new directories and never overwrite a previous run.

```text
gelfigure --help
gelfigure --version
gelfigure setup
gelfigure doctor --workspace /data/gel-job
gelfigure ladders --workspace /data/gel-job --kind dna --query "GeneRuler 1 kb"
gelfigure analyze --workspace /data/gel-job --input gel.tif --out analysis
gelfigure prepare --workspace /data/gel-job --analysis analysis/analysis.json --spec request.json --out prepared
gelfigure revise --workspace /data/gel-job --plan prepared/plan.json --spec answers.json --out reviewed
gelfigure validate --workspace /data/gel-job --plan reviewed/plan.json
gelfigure render --workspace /data/gel-job --plan reviewed/plan.json --out final
gelfigure mcp --workspace /data/gel-job
```

Run render only after that plan is `ready_to_render` with no questions. Prepare/revise never automatically export a final figure. `--spec` names a JSON file, not inline JSON. The CLI reads it through the workspace JSON helper and passes the parsed object to the service. Unknown commands/flags, duplicate flags, unused command options and missing required options fail explicitly.

| Process exit | JSON status | Host action |
| --- | --- | --- |
| 0 | `succeeded`, `ready_to_render` | Inspect the result; only a ready plan can render |
| 2 | `awaiting_answers`, `needs_review` | Parse the JSON, gather answers/review, then revise |
| 1 | `failed` | Inspect `error.code`, `message`, optional `details` |

Ordinary commands write one compact JSON object to stdout. Help/version write human-readable text. Setup logs to stderr and finishes with JSON. MCP uses protocol stdout only, including tool result JSON inside protocol messages; startup failures use stderr. Service errors have this shape, without stack traces:

```json
{"apiVersion":"1","status":"failed","error":{"code":"STALE_REVISION","message":"The expected revision does not match the current project."}}
```

## Geometry correction

Optional analyze flags `--gel-type dna|protein` and `--orientation h|r90|r180|r270|r90h|r180h|r270h` allow explicit initial settings; omission leaves orientation unchanged before ordinary processing. Geometry corrections are in absolute image pixels **after orientation and deskew**:

```json
{"x":10,"y":20,"w":400,"h":300,"space":"oriented-image-px"}
```

Save that as `crop.json`. Save increasing absolute lane x coordinates, for example `[30,80,130]`, as `lane-positions.json`:

```sh
gelfigure analyze --workspace /data/gel-job --input gel.tif --out corrected-analysis --crop crop.json --lane-positions lane-positions.json
```

Alternatively, use `--lane-count 3` when only the corrected count is known. Count is an integer 1–60; it and `--lane-positions` are mutually exclusive. Crop and positions are JSON files read with the same workspace/size protections as specs. Numeric strings, nonfinite values and malformed fields fail; the service validates image/crop bounds. These coordinates are not relative to the crop or original pre-orientation pixels. No implicit lane cleanup is performed.

A correction produces a new analysis revision. Reinspect its diagnostic and regenerate labels/marker assignments from its actual IDs and the experiment record. An old `expectedRevision` will fail against the corrected analysis; changing the hash alone does not establish a correct lane mapping.

## MCP tools

The low-level official SDK server exposes exactly seven tools per session, backed by one serialized service and one reusable managed browser. Each operation uses an isolated browser context. Tool inputs reject unknown properties. Artifact paths are returned in text and `structuredContent`; limited preview resources support image observation without exposing a raw filesystem interface.

| Tool | Required arguments | Optional arguments |
| --- | --- | --- |
| `gelfigure_doctor` | none | none |
| `gelfigure_ladders` | none | `query`, `kind` (`dna`/`protein`) |
| `gelfigure_analyze` | `input`, `out` | `gelType`, `orientation`, `crop`, `laneCount` or `lanePositions` |
| `gelfigure_prepare` | `analysis`, `spec` object, `out` | none |
| `gelfigure_render` | `plan`, `out` | none |
| `gelfigure_revise` | `plan`, `spec` patch object, `out` | none |
| `gelfigure_validate` | `plan` | none |

MCP geometry uses objects/arrays directly, unlike CLI JSON filenames. A tool result contains text with the compact JSON plus the same object as `structuredContent`. Only failures have `isError: true`. Questions and quality review have `isError: false`; the host must inspect status and wait for answers rather than treating a successful protocol call as a render authorization.

### Preview observation

When a service call in this MCP session returns a readable PNG in its `diagnostic` or `preview` field, the tool result also includes a `resource_link`. `resources/list` lists only those registered previews; `resources/read` takes the returned opaque `gelfigure://preview/...` URI and returns an `image/png` base64 blob. Paths and `structuredContent` stay unchanged. Source/project files, arbitrary artifact paths and files from earlier sessions are never automatically registered.

Each PNG is limited to 4 MiB of file bytes and checked for its PNG signature through the guarded workspace reader before registration and again on each read. Reads must match the registered bytes; changed, missing, oversized or escaping files fail. Unregistered URIs, including `file://` URIs and another session's preview URI, are rejected. Up to 128 distinct preview files are registered per session. If a preview is unavailable or exceeds those limits, the tool keeps its ordinary service result and local paths without a resource link.

Actual image observation requires a host that can read MCP resources **and present the PNG to the agent**, or a local file viewer for the returned path. Support varies by host. A path, metadata or unrendered base64 alone does not constitute visual inspection. If neither facility is available, obtain the needed image/orientation/lane confirmation from the user before marking it confirmed. Do not claim universal MCP image-viewing support or paste base64 into conversation.

## Evidence, defaults and revisions

Read user-provided or authorized experiment records before assigning identities. Gather all current critical questions together and ask through the host's ask-user tool or conversation, then wait. Required semantics are explicit DNA/protein kind, confirmed orientation/lane order, labels for visible lanes (or explicit unlabelled permission), marker policy and supported assignments, and resolution of record conflicts. Missing marker models call for a supported documented model or explicit omission; do not keep repeating a failed lookup or substitute a similar ladder.

See the portable skill's [request schema](../skills/gelfigure/references/request-schema.md), [review/repair guide](../skills/gelfigure/references/review-and-repair.md), and [examples](../skills/gelfigure/references/examples.md) in a checkout. A bundle carries those references under `skill/references/`.

Formatting defaults are Arial 7 pt, automatic label angle, no lane numbers, existing width, gray display and gamma 1, unchanged inversion (new agent images start uninverted), PNG/SVG at 600 dpi. A requested `figureWidthMm` is total figure width including margins. Defaults never supply biological semantics.

Doctor reports `fonts[].available` using local `FontFace` loading, rather than a CSS check that can succeed through fallback. Fonts are not embedded. An unavailable requested font produces the acknowledgeable `FONT_SUBSTITUTION` warning because fallback can change layout. Choose an available supported font, or explain the consequence and obtain user acceptance; only then include `FONT_SUBSTITUTION` in the spec's `acknowledgements` and revise the plan. Preserve any other explicitly accepted codes when replacing that array. `FONT_ENVIRONMENT` is informational and does not itself acknowledge substitution.

DNA supports `bp`, `kb`, `auto`, inline bp/kb and `none`; protein supports `kDa`, `kDa-inline`, `none`. `auto` formats DNA bp/kb. Side text supports left/right/below. No local band retouch, fabricated bands, invented sample names or unrecorded local image edits are supported.

`provenance` records field, source (`user`/`record`/`detector`/`default`), a real reference and boolean confirmation. Detector scores do not externally confirm sample/model identity and are not calibrated probabilities. Unresolved conflicts are questions. Technical warnings may be acknowledged only when explicitly permissible and accepted by the user; acknowledgements never resolve missing semantics.

`spec.expectedRevision` binds creation to the analysis or previous plan. A saved plan retains that historical input value; `plan.revision` binds its prepared project. Render separately checks digest, current source/project revision, engine version, semantics and quality. Do not edit hashes/status to bypass a failed guard. Revise creates a new gated plan: arrays replace, while `layout`, `image`, `exports` shallow-merge.

Revision is the SHA-256 of canonical JSON containing `{sourceSha256, state, ladders}`: the original source checksum, complete project state, and project-persisted ladder definitions, including custom ladders (`project.ladders`, or an empty array if absent). Envelope save timestamps are excluded; meaningful state fields remain. Changing a custom ladder definition changes the revision even when the image and lane geometry are unchanged.

Validation of a nonready plan returns its outstanding questions without applying its spec. Marker omission disables inherited arrows' size flags and clears their displayed size text. Hidden/outside calibration remains in the editable project but is excluded from size estimation and exports. Replacing lane labels clears prior visible names while preserving hidden names.

Analysis saves `analysis.json`, `project.gelfig`, `diagnostic.png`. Preparation saves `plan.json`, `project.gelfig`, `resolved-spec.json`, `quality-report.json`. Final exports keep the editable project and reports, with processing log, legend and manifest. Keep these files on disk and report paths and approved limitations to the user.

Agent calibration choices are saved for the bundled/dev editor (0.6.17-dev or newer). Use the included index.html or matching offline HTML to reopen; older published editors do not understand this new flag. Portable CI artifacts contain a tar.gz archive to retain executable permissions; extract that archive before running the launcher.

API v1 preserves literal asterisks in lane names. Non-lane fields still use the legacy text renderer; asterisks in new group/condition/annotation text produce an explicit preparation question instead of silently changing the label.

Saturation evidence reports current-crop pixel counts, fraction and warning threshold. Widening the crop may reduce the fraction below that threshold; remaining saturated pixels are still reported as information, not claimed repaired.

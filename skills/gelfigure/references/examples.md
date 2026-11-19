# Examples

Examples assume a configured CLI named `gelfigure` and an existing workspace `/data/gel-job`. For a developer checkout, replace `gelfigure` with the configured Node executable and `agent/bin/gelfigure.mjs`. Use only files and records the user has provided or authorized.

## Prepare, answer, render

Read the experiment's lane table first, then analyze:

```sh
gelfigure analyze --workspace /data/gel-job --input gel.tif --out analysis
gelfigure ladders --workspace /data/gel-job --kind dna --query "GeneRuler 1 kb"
```

Inspect `analysis/analysis.json` and `analysis/diagnostic.png`. Suppose the diagnostic and record confirm two visible lanes, lane 1 marker and lane 2 sample. Create `request.json` using the **actual** revision and confirmed catalogue ID; replace the illustrative revision below before use:

```json
{
  "schemaVersion":"1",
  "expectedRevision":"copy the actual analysis.revision",
  "gelType":"dna",
  "orientationConfirmed":true,
  "laneLabels":[{"laneId":"lane_001","text":"M"},{"laneId":"lane_002","text":"Sample A"}],
  "markerPolicy":"specified",
  "markers":[{"laneId":"lane_001","ladderId":"gr1kbplus","unit":"bp"}],
  "provenance":[{"field":"laneLabels","source":"record","reference":"provided experiment.md / lane table","confirmed":true}]
}
```

This mapping is an illustration, not a fallback for unknown samples. The example record reference is valid only if that record was actually provided and supports these labels.

```sh
gelfigure prepare --workspace /data/gel-job --analysis analysis/analysis.json --spec request.json --out prepared
gelfigure validate --workspace /data/gel-job --plan prepared/plan.json
```

If the response requires answers/review, gather the outstanding questions, ask and wait. Write `answers.json` using `prepared/plan.json`'s **plan revision**, and the user's complete replacement arrays or approved changes:

```sh
gelfigure revise --workspace /data/gel-job --plan prepared/plan.json --spec answers.json --out reviewed
gelfigure render --workspace /data/gel-job --plan reviewed/plan.json --out final
```

Run the final command only after `reviewed` is ready and its questions are empty. If `prepared` was already ready and needed no changes, render that ready plan instead.

## Correct lane geometry

After inspecting the oriented/deskewed diagnostic, create `crop.json`:

```json
{"x":10,"y":20,"w":400,"h":300,"space":"oriented-image-px"}
```

Create `lane-positions.json` with absolute x coordinates:

```json
[30,80,130]
```

```sh
gelfigure analyze --workspace /data/gel-job --input gel.tif --out corrected-analysis --crop crop.json --lane-positions lane-positions.json
```

Supply only necessary options; `--lane-count 3` can replace `--lane-positions` when only the count is known. Count and positions are mutually exclusive. These example dimensions must be replaced with positions valid for the actual image. Reinspect the corrected analysis, use its new revision, and rebuild labels/markers using its IDs. The old spec revision is stale after correction.

## MCP equivalents

The session's workspace is configured at startup. Tool arguments contain local paths and spec objects, not CLI option strings or a JSON filename in `spec`:

```json
{"name":"gelfigure_analyze","arguments":{"input":"gel.tif","out":"analysis"}}
```

```json
{"name":"gelfigure_prepare","arguments":{"analysis":"analysis/analysis.json","spec":{"schemaVersion":"1","expectedRevision":"copy the actual analysis.revision"},"out":"questions"}}
```

The incomplete request intentionally asks the service for semantic questions. Collect the answers; do not infer them. `structuredContent.status: "awaiting_answers"` and `"needs_review"` have `isError: false`. Tool execution failures have `isError: true` and a structured error code/message/details.

An analyze response can include a `resource_link` for its diagnostic PNG alongside the JSON result. If the host supports image resources, call `resources/read` with that exact returned URI and view the PNG. The URI is valid only in the current session; do not construct it from a local path. Otherwise open `analysis/diagnostic.png` in a local viewer, or ask for the necessary user confirmation if neither image-viewing facility is available.

For an unavailable marker model, ask once the focused lookup is exhausted: “The supplied model is not in this catalogue. Which supported, documented model should we use, or should this figure omit marker sizes?” Omission requires `markerPolicy: "omit"`, `markers: []`, and removal of sized arrows. It does not authorize inventing a marker or resizing bands.

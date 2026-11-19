# Request schema v1

The CLI and MCP share one service. Use local files in the configured absolute, existing workspace. Output directories must be new. Input paths and symlinks cannot escape that workspace. CLI JSON files are read through the bounded workspace reader (4 MiB maximum); the spec has additional nested/item/text limits.

## Operations

| Tool | Arguments |
| --- | --- |
| `gelfigure_doctor` | `{}` |
| `gelfigure_ladders` | optional `query` (up to 200 characters), `kind` (`dna`/`protein`) |
| `gelfigure_analyze` | `input`, `out`; optional `gelType`, `orientation`, `crop`, `laneCount`, `lanePositions` |
| `gelfigure_prepare` | `analysis`, `spec` object, `out` |
| `gelfigure_revise` | `plan`, `spec` patch object, `out` |
| `gelfigure_validate` | `plan` |
| `gelfigure_render` | `plan`, `out` |

All tool argument objects reject unknown fields. There is no arbitrary script or raw filesystem tool. Artifact paths are returned in text and structured JSON. Current-session diagnostic/preview PNGs may also have a `resource_link`; use its exact URI with the host's MCP resource reader if it can present images, or use a local file viewer. No resource link means the host must use the returned local path or obtain needed visual confirmation from the user. Do not infer that a metadata-only read inspected the image.

Only PNGs up to 4 MiB returned in `diagnostic`/`preview` fields are registered, up to 128 per session. `resources/list` lists them and `resources/read` returns the registered PNG as an `image/png` base64 blob after workspace, size, signature and unchanged-byte checks. Source/project paths, arbitrary file URIs and other sessions' resources are not exposed. Resources are optional; ordinary results and paths remain available if a preview cannot be registered.

`analyze` orientations: `h`, `r90`, `r180`, `r270`, `r90h`, `r180h`, `r270h`; omission leaves orientation unchanged before normal processing. Geometry is specified after orientation **and deskew**:

```json
{"crop":{"x":10,"y":20,"w":400,"h":300,"space":"oriented-image-px"},"lanePositions":[30,80,130]}
```

Coordinates are absolute image pixels, not normalized fractions or positions relative to the crop. Numbers must be finite, crop dimensions positive, and lane count an integer from 1 to 60. Positions contain 1–60 distinct, increasing numeric x coordinates within the image/crop. Choose `laneCount` or `lanePositions`; supplying both is rejected. Supply only corrections supported by image inspection or user input. The service validates actual bounds and applies no implicit cleanup. After correction, use the new analysis revision and rebuild assignments from the new IDs.

## Spec

`schemaVersion` is `"1"`. Missing semantic values cause questions; syntactically invalid values throw `INVALID_SPEC`. Unknown keys, prototype keys, duplicate bindings, numeric strings and nonfinite numbers are rejected. Label strings are literal text; do not trim them or manufacture rich-text markup.

| Field | Meaning |
| --- | --- |
| `expectedRevision` | Exact analysis revision for prepare; exact previous plan revision for revise |
| `gelType` | Explicit `dna` or `protein` |
| `orientationConfirmed` | Explicit `true` after inspection/confirmation |
| `laneLabels` | Array of `{laneId,text}` using actual analysis lane IDs; every visible lane needs a nonblank label unless omission is explicitly allowed |
| `allowUnlabelledLanes` | Explicit `true` permits unlabelled visible lanes |
| `markerPolicy` | `specified` needs at least one assignment; `omit` removes marker roles and cannot support sized arrows |
| `markers` | Array of `{laneId,ladderId,unit}` with catalogue IDs returned by ladders |
| `groups` | Array of `{from,to,text}`; endpoints are lane IDs |
| `conditions` | Array of `{name,values:{laneId:"literal value"}}` |
| `annotations` | Side text, sized lane arrows, or crop-fraction text as shown below |
| `provenance` | Array of `{field,source,reference,confirmed}` |
| `conflicts` | Array of `{id,field,message,resolved}`; unresolved entries always produce questions |
| `acknowledgements` | Explicitly approved, permissible technical warning codes |

Revision is SHA-256 over canonical `{sourceSha256, state, ladders}`, using the original source checksum, complete project state and `project.ladders` (empty array if absent). Project-persisted custom ladder definitions participate in the hash. Envelope save timestamps do not. A custom ladder change requires a fresh revision binding even when image pixels and lane positions do not change. A saved plan retains its historical creation-input `spec.expectedRevision`; its separate `plan.revision` binds the prepared project.

DNA units: `bp`, `kb`, `auto`, `bp-inline`, `kb-inline`, `none`. Protein units: `kDa`, `kDa-inline`, `none`. `auto` formats DNA bp/kb and must not be used for protein. `none` suppresses displayed units; it does not erase the ladder's scientific kind or resolve a model mismatch.

```json
{
  "annotations": [
    {"type":"sideText","text":"Agarose","position":"below"},
    {"type":"arrow","laneId":"lane_002","size":1000,"text":"Target"},
    {"type":"text","text":"Note","at":{"x":0.5,"y":0.5,"space":"crop-fraction"}}
  ]
}
```

Side text positions are `left`, `right`, `below`. Arrow size is positive and needs a valid marker calibration; omission produces a question. Free text uses coordinates in `[0,1]` relative to the crop, unlike analyze geometry.

`markerPolicy: "omit"` disables inherited arrows' size flags and clears their size text. Hidden/outside calibration is preserved in the editable project and excluded from estimation/exports. Replacement lane labels clear prior visible names while retaining hidden names. Nonready validation returns questions without applying the spec.

Provenance sources are `user`, `record`, `detector`, `default`. Reference strings identify actual evidence, such as a provided ELN entry and lane table. `confirmed` is a boolean, not text. Detector/default records do not externally confirm semantic values even if marked `true`; a corresponding user/record confirmation is needed. Do not fabricate record references. Contradictions remain questions until explicitly resolved.

## Formatting and merge rules

- `layout`: `figureWidthMm` (10–1000, total figure width including margins), `fontPt` (1–72), `fontFamily` (`Arial`, `Helvetica`, `Times New Roman`, `Calibri`, `Cambria`), `labelAngle` (`auto` or a number 0–90), `laneNumbers` (boolean).
- `image`: `display` (`gray`/`colour`), `invert` (boolean), `gamma` (0.1–10). Adjustments are global and recorded.
- `exports`: integer `dpi` (72–1200), nonempty unique `formats` chosen from `png`, `svg`, `tiff`, `pptx`.

Defaults: Arial 7 pt, automatic label angle, no lane numbers; existing width; gray display, gamma 1, inversion unchanged (new agent images start uninverted); PNG/SVG at 600 dpi. There are no defaults for experimental semantics.

Doctor probes local font availability with `FontFace`. If the requested font is unavailable, `FONT_SUBSTITUTION` requires choosing an available font or explicit user acceptance recorded in `acknowledgements`; see the review/repair guide. Fonts are not embedded.

`revise` shallow-merges `layout`, `image`, `exports`; supplied arrays replace the old arrays completely. Omitted fields remain. Validate the resulting merged spec. Preserve already approved warning acknowledgements unless the current change requires renewed review.

API v1 preserves literal asterisks in lane names. Non-lane fields still use the legacy text renderer; asterisks in new group/condition/annotation text produce an explicit preparation question instead of silently changing the label.

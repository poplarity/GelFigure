# Review and repair

`succeeded` means the operation completed; an analysis alone is not permission to render. Only a prepare/revise result of `ready_to_render` is a ready plan. `awaiting_answers` and `needs_review` are intermediate outcomes, not transport errors. A CLI host must parse JSON even when the process exits 2.

## Semantic questions

Read the saved analysis, diagnostic, current spec, questions and referenced records. Gather all current critical gaps before asking through the available host ask-user tool or ordinary conversation, then wait. Include the relevant record/image evidence and concrete choices without inventing an answer.

| Condition | Repair |
| --- | --- |
| `GEL_TYPE_REQUIRED` | Ask whether the gel is DNA or protein; detector confidence is evidence to review |
| `ORIENTATION_REQUIRED` | Confirm the processed orientation and lane order |
| `LANE_LABELS_REQUIRED` | Obtain labels for actual visible lane IDs or explicit permission to leave lanes unlabelled |
| `MARKER_POLICY_REQUIRED` / missing assignments | Obtain supported marker identity/unit assignments, or explicit omission |
| `UNKNOWN_LANE` | Reopen the current analysis; rebind to its actual IDs using the lane map |
| `UNKNOWN_LADDER` | Perform a focused supported-model lookup; ask for a documented known model or omission if still unavailable |
| `UNIT_CONFLICT` | Reconcile the declared gel kind, marker model kind and unit; protein cannot use DNA `auto` |
| provenance confirmation question | Obtain a truthful user confirmation or specific record reference |
| `UNRESOLVED_CONFLICT` | Present the conflicting evidence and ask which mapping is correct; update the conflict explicitly |

If geometry is wrong, run a new `analyze` using crop/count/positions supported by the diagnostic or user correction. Absolute coordinates are measured after orientation and deskew. Use the new revision and regenerate lane assignments; do not carry names across changed lane IDs by assumption.

## Technical review

Inspect the quality report and diagnostic. Fix avoidable clipping, unreadable font sizes, overlaps, weak marker fits or excessive output dimensions using supported operations. Low effective DPI describes information in the source; raising export DPI does not restore missing detail. Saturation and clipping may affect scientific interpretation.

Doctor's `fonts[].available` is based on loading a local `FontFace`, not a CSS fallback check. When the requested font is missing, `FONT_SUBSTITUTION` warns that fallback can change layout. Choose an available supported font, or obtain the user's explicit acceptance of the fallback and put `FONT_SUBSTITUTION` in the spec's `acknowledgements` when revising. `FONT_ENVIRONMENT` is informational; it does not count as acceptance. Fonts are not embedded in exports.

Warning acknowledgement requires an issue explicitly marked acknowledgeable and user acceptance already given or newly obtained for that consequence. Never silently add `SOURCE_SATURATION`, `LABEL_OVERLAP`, or any other code. Non-acknowledgeable issues and semantic questions require repair/answers. Send acknowledged codes in a new spec patch and `revise` into a new output directory; recheck the result before rendering.

## Integrity and revision failures

`STALE_REVISION` means the input binding no longer matches. Reopen the current analysis/plan and its project, inspect what changed, obtain any new semantic answers, and prepare/revise with its actual revision. Do not merely overwrite a revision string in an old plan.

Revision includes the source checksum, complete state and project-persisted ladder definitions, including custom ladders. A changed ladder definition can therefore invalidate the binding even if the image and lane geometry are unchanged. Review its scientific identity and calibration before rebuilding the plan. Validation of a nonready plan reports its questions without applying the spec.

`PLAN_INTEGRITY`, `SOURCE_INTEGRITY`, or `INVALID_PLAN` means the saved inputs cannot be trusted as a ready plan. Recover the original inputs or create a fresh analysis/plan. Do not recompute a digest manually to bypass a failed guard.

`RUNTIME_MISSING` calls for the matching managed Chromium runtime: use the full portable package or the documented setup command. Setup may require network access; analysis/render run locally. For an unavailable or unverified platform, report the limitation rather than promising a signed installer or universal portability.

After approved repairs, render the ready plan. Report paths to the figure, editable project, quality report, resolved spec, processing log and manifest when returned. Keep raw data and large JSON/base64 artifacts on disk.

Source-saturation fractions are relative to the current crop. When crop dimensions change, compare pixel counts and region evidence; a lower warning level does not restore source intensity.

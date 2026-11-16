# Marker Workflow Implementation Plan

> Execute in the current dev checkout; the user approved the design and implementation in this session.

**Goal:** Make Marker selection, correction and library management understandable through one sidebar workflow.

**Architecture:** Keep App marker state and matching intact. UI owns sidebar/library rendering; MarkerUI owns one target-scoped model chooser and canvas calibration. Share unit option data and use existing FigEdit typography controls.

**Tech Stack:** Plain JavaScript, HTML/CSS, Playwright, standalone offline HTML.

1. Add `tests/marker-simplify.mjs` for the approved workflow. Run against existing app and confirm failing assertions for missing simplified controls and implicit custom-ladder overwrite.
2. In `index.html` and `js/ui.js`, move library controls into the management dialog. Add explicit save target and safe target identity capture; plain save must preserve the figure.
3. In `js/marker-ui.js`, implement searched model previews and explicit application, target validity guards, focus/keyboard handling and one entry from sidebar/calibration. Retain canvas band placement.
4. In `js/ui.js` and `css/style.css`, simplify cards with shared unit options and folded style/band controls. Preserve open/scroll/focus across commits. Clarify global marker font size in the contextual editor.
5. Adapt old UI tests to the new entry points while retaining their original behavioral assertions; integrate new checks into `tests/run.mjs`.
6. Update bilingual guidance, Unreleased notes, handover and dev version summary. Run focused tests, then all three engines and offline build. Inspect rendered controls at desktop widths and in Safari. Deliver dev HTML; leave main and the published release unchanged.

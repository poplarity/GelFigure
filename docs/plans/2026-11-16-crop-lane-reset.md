# Crop lane corrections and numbering

User feedback requires explicit in-crop count and combined re-detection to replace old whole-image detection guesses and restart numbering at 1. Plain crop movement must continue preserving names and geometry. Implement `setCropLaneCount` as the explicit UI action; retain low-level grid semantics used by other operations. Prune after successful re-detection only. One mapping carries in-crop marker roles, bands, exclusions, names/runs/weights, conditions, groups and selected lane. Outside roles disappear with outside guides, undo restores the former whole set. Failed detection is unchanged.

The user withdrew the M-spacing complaint after confirming it was a visual illusion. Original rendering uses the same lane-coordinate mapping and font-dependent offset for all tilted names; no special M spacing. The attempted typography change is reverted, and only crop correction remains in scope.

Tests: new crop-lane-reset suite, prior Marker identity tests updated to the explicitly requested outside-guide removal, full three-engine suite and final offline build. No main/release change without a separate release request.

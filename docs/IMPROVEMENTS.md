# IMPROVEMENTS.md

Observations and suggestions gathered while documenting **Ultra-Calc**. **Nothing in this document has been implemented** — it is a punch list for a human/product owner to prioritize. Every item cites the file(s) involved. See [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md) for the business-critical files these suggestions must not casually touch.

---

## Potential bugs (highest priority to investigate)

1. **Likely double unit-conversion for `US`/`CA_IMPERIAL` ventilation, psi allowance, and custom U-values.** `ProjectForm.tsx` already converts these fields to metric SI via `fromDisplayVentilation`/`fromDisplayPsiAllowance`/`fromDisplayUValue` (`utils/display.ts`) before storing them on `project`. `normalizeProjectSettings()` (`utils/normalizeProject.ts`, called by `RoomCard.tsx` and `useProjectSummary.ts` before every `calculateRoom()`) converts the *same already-SI* values again via `normalizeVentilation`/`normalizePsiAllowance`/`normalizeUValue` (`utils/normalize.ts`). Net effect: these three settings may be silently doubled/skewed for `US`/`CA_IMPERIAL` projects. See [docs/CALCULATIONS.md](CALCULATIONS.md) §7 for the full trace. **Verify by hand-calculating a US project's `qVent_W` against its entered CFM value before changing anything.**
2. **`CA_METRIC` is classified as imperial in `formatProjectSummary.ts` and `formatResults.ts`** (`formatSpacing`, `formatTubeSizing`), but as metric everywhere else (`display.ts`, `normalize.ts`, `updateUiLabels.ts`). A `CA_METRIC` project's Summary tab and per-room spacing/tube-size fields display in BTU/hr, ft, and inches while its input forms display in W, m, and mm. High-visibility, easily user-reported bug. See [docs/REGIONS.md](REGIONS.md).
3. **Broken logo image path.** `ProjectPage.tsx:348` and `ProjectExportView.tsx:34` reference `/logo.png`, which does not exist under `public/` (only `public/assets/diagrams/logo.PNG` and `logo_square.PNG` exist). This is the PDF export's cover-page logo — currently likely rendering as a broken image in the exported PDF header page (and in `ProjectExportView`, if that unused component is ever wired up). Trivial fix (point at the existing asset or add the missing file) but should be confirmed visually first.
4. **Custom U-value overrides may have no effect on the actual calculation.** `physics.ts#mergeUValues()` does not reference `settings.customUOverrides` (or `customU`) anywhere in its merge logic — it only merges `GENERIC_PRESETS`/`UK_PRESETS` and the glazing-derived window U-value. The "Custom U-Values" section in `ProjectForm.tsx`'s Advanced Defaults appears fully wired for input/storage but may be a no-op for the actual heat-loss result. Needs a runtime check: change a custom U-value on a saved project and confirm `qFabric_W` changes.
5. **Room identity is `room.name`, not `room.id`, throughout the update/remove path**, despite `RoomInput.id` existing and being typed as the key everywhere (`onUpdateRoom(id: string, ...)`). `RoomCard.tsx` calls `onUpdateRoom(room.name, {...})` at every field; `ProjectPage.tsx`'s `updateRoom`/`removeRoom` match by `r.name === roomName`. Renaming a room to match another room's existing name will make edits target the wrong room (or both, ambiguously, via `.map`). Needs an audit of every call site before switching the key back to `id` — this is a multi-file, behavior-changing fix, not a one-line patch.
6. **`updateRoomModel.ts#toRichRoom()` hardcodes `setpoint: 21`** instead of using the room's actual `setpointC`. Currently harmless because the function is unused, but would silently discard real data if ever wired up.
7. **Zod validation is fully disabled.** `ProjectPage.tsx#handleSaveProject()` has both `projectSchema.parse(project)` and the per-room `roomSchema.parse(room)` loop **commented out**. Invalid data (missing region, non-numeric/out-of-range temperatures, etc.) can currently be saved without any validation error surfacing to the user, even though the schemas exist and look complete. Re-enabling is straightforward but may surface previously-silent bad data in existing saved projects (some old projects may currently fail validation) — coordinate with the product owner before flipping this on in production.
8. **`ventilationLoss_W` doesn't add `mechVent_m3_per_h` for non-UK/EU regions.** For `US`/`CA_METRIC`/`CA_IMPERIAL`, only `achOrN * V * dT` is counted; the entered mechanical ventilation rate has no effect on the result at all in those regions (`physics.ts`, the `else` branch of `ventilationLoss_W`). May be intentional (different calculation methodology per standard) or an oversight — confirm with the business.

## Safe improvements (low-risk, unlikely to change calculation output)

- Remove the debug `console.log` statements in `RoomCard.tsx:108` ("Building layout for room:") and `ProjectPage.tsx:175` ("Saving project:") — pure logging noise, no behavior change.
- Fix the broken `/logo.png` reference (bug #3 above) by pointing at the existing `public/assets/diagrams/logo.PNG`.
- Delete or clearly comment `src/layout/FloorLayout.tsx` (dead, name-colliding component) once its non-usage is reconfirmed — reduces the risk of a future accidental wrong import.
- Remove the dead `LayoutSVG` import in `RoomCard.tsx` (imported but never rendered), or actually wire it in if it was meant to be a fallback — needs a product decision either way, but the current half-state (imported, unused) is pure clutter.
- Add a short header comment correction in `src/utils/physics.ts` — its top-of-file comment still says `// utils/calculateRoom.ts`, a stale filename from before a rename.
- Consider consolidating `MAX_LOOP_M`/`SPACING_TABLE` in `models/presets.ts` — both appear unreferenced by the live calculation path (`ultraCalcLocked.ts` uses its own `MAX_LOOP_FT` and its own spacing tables). Removing unused exports reduces the chance a future developer edits the wrong constant expecting it to affect behavior.
- Standardize the "is this region imperial?" check into a single shared helper (e.g. `isImperialRegion(region)`) instead of the currently-duplicated inline boolean logic in `formatProjectSummary.ts`, `formatResults.ts`, `display.ts`, `normalize.ts`, and ad hoc `uiUnits.length === "ft"` checks in components. This is exactly the kind of duplication that produced bug #2 above — consolidating would make future region additions/changes safer, though it touches several files and should be done deliberately, not as a drive-by.

## Architecture improvements

- **Decide the fate of `RichRoom`/`Side`/`updateRoomModel.ts`.** Either complete the migration to a multi-wall-segment room model (if that's genuinely planned) or remove the legacy types/converter entirely. Currently it's neither — dead code sitting alongside the live flat `RoomInput` model, which is confusing for anyone reading `projectTypes.ts` fresh.
- **Reconcile the two independent floor-layout implementations** (`src/layout/FloorLayoutSvg.tsx` used, `src/layout/FloorLayout.tsx` unused, plus `layoutModel.ts`'s unused `LayoutTile`/`FloorLayout` types alongside the actually-used `layoutTypes.ts#Tile`). A single canonical layout-types file would remove ambiguity for future contributors.
- **Wire up or remove `ProjectExportView.tsx`.** It looks like a cleaner, more maintainable version of the PDF export DOM than the version currently inlined directly inside `ProjectPage.tsx` — consider migrating `ProjectPage` to actually use it (reducing `ProjectPage.tsx`'s size/complexity) rather than maintaining two parallel implementations.
- **Consider moving rooms to a Firestore subcollection** instead of an embedded array field on the project document, if projects are ever expected to grow to large room counts — currently fine at typical scale (a handful to a few dozen rooms) but the embedded-array pattern doesn't scale indefinitely (1MB Firestore document limit, and every room edit rewrites the entire project document).
- **`users` collection is queried by a `userId` field instead of using the Firebase Auth UID as the Firestore document ID directly** (`getUserById`/`updateUserById` in `firebaseHelpers.ts` both `query(where("userId", "=="))` then use `.docs[0]`). Switching to `doc(db, "users", userId)` would remove a query round-trip and eliminate any theoretical ambiguity if duplicate `userId` documents ever exist.

## Performance improvements

- **`useProjectSummary()` recomputes `calculateRoom`+`runUltraCalc` for every room independently of each `RoomCard`'s own identical computation** — for a project with many rooms, every render of the Summary tab (and every autosave-triggered rerender that recomputes the memoized summary) redoes work already done inside each room's card. For typical project sizes (a handful of rooms) this is invisible; if projects with dozens+ of rooms become common, consider lifting each room's computed `RoomResults`/`UltraCalcOutput` into shared state (e.g. computed once per room in the parent and passed down) rather than recomputing in two places.
- **PDF export rasterizes every page via `html2canvas` sequentially** (`pdfExport.ts#exportPDF`, `for` loop with `await addPage(...)` per room). For large projects this could be slow; parallelizing the canvas-rendering step (while still adding pages to the PDF in order) could speed this up, though `jsPDF`/`html2canvas` may have their own serialization constraints worth checking first.
- **Sidebar images are reconverted (SVG → base64 → PNG) every time `RoomCard`'s `installMethod`/`joistSpacing`/`exportMode` change**, with no caching across rooms that share the same install method/joist (a common case — many rooms in a project often use identical settings). A small memoization cache keyed by `(installMethod, joistSpacing, exportMode)` could avoid redundant image conversions.

## Code quality improvements

- Consolidate the duplicated `ULTRA_FIN_SPACING_MM`/`TUBING_SPACING_MM` tables (currently defined identically in both `ultraCalcLocked.ts` and `ultraSpacingLocked.ts`) into one source of truth, imported by both — currently a manual-sync risk every time the manufacturer updates the spacing numbers.
- The `src/validations.ts/` directory name (a folder literally named with a `.ts` suffix) is unconventional and could trip up tooling (glob patterns assuming `.ts` = file) — renaming to `src/validations/` would be a safe, mechanical rename (update the two import paths in `ProjectPage.tsx`), though it's cosmetic only.
- `models/projectTypes.ts` mixes multiple logical groupings (project/room domain types, legacy `RichRoom`/`Side`/`MaterialResults`, `UserType`) in one file with informal inline section-comment dividers (`// models/materialTypes.ts (new file)` as a comment inside `projectTypes.ts`, not an actual separate file) — splitting into the files the comments already imply (`materialTypes.ts`, etc.) would make the dead/legacy sections easier to find and eventually remove.
- Several format/adapter files carry near-duplicate boilerplate for the imperial/metric branch (see "Safe improvements" above) — a shared `isImperialRegion()` helper would reduce this repetition and the risk of future divergence.

## Developer experience improvements

- **No test suite exists.** Given the calculation engine (`physics.ts`, `ultraCalcLocked.ts`) is explicitly business-critical and partially "locked," adding unit tests for `calculateRoom()`, `ultraCalc()`, and `interpWaterC()` against known-good reference values would materially de-risk any future change to these files. This is the single highest-leverage DX improvement available, given how much of the documented risk in this pass boils down to "verify by hand-calculation" rather than "run the test suite."
- **No lint script/config committed** (no ESLint/Prettier config found in the repo root) — adding one (even a minimal TypeScript-aware ESLint config) would catch things like the unused `LayoutSVG` import and dead `console.log`s automatically.
- **No `.env.example`** documenting the required `VITE_FIREBASE_*` environment variables (`src/firebase/index.ts`) — a new engineer has to reverse-engineer which env vars are required from that file. Adding a `.env.example` with placeholder values would speed up onboarding.
- **No `firebase.json`/`.firebaserc` found** in this checkout despite a `.firebase/` build-artifact directory being present, implying Firebase Hosting deploy config exists but isn't committed (or wasn't found in this pass) — worth confirming with the user where deploy configuration actually lives before assuming `firebase deploy` works out of the box from this checkout.
- **`capacitor.config.ts`'s `appId: 'com.example.app'`** is a placeholder-looking value — worth confirming with the user whether a real Android package ID has been decided before any Play Store-bound build.

## Technical debt inventory (quick reference)

| Item | File(s) | Status |
|---|---|---|
| Dead `FloorLayout.tsx` (name-colliding `FloorLayoutSvg`) | `src/layout/FloorLayout.tsx` | Confirmed unused via grep |
| Dead `layoutModel.ts` types | `src/layout/layoutModel.ts` | Confirmed unused via grep |
| Dead `updateRoomModel.ts` + `RichRoom`/`Side` types | `src/helpers/updateRoomModel.ts`, `src/models/projectTypes.ts` | Confirmed unused via grep |
| Dead `MaterialResults`/`CalcOutput` types | `src/models/projectTypes.ts` | Confirmed unused via grep |
| Dead `MAX_LOOP_M`/`SPACING_TABLE` constants | `src/models/presets.ts` | Confirmed unused via grep (loop/spacing logic uses `ultraCalcLocked.ts`'s own constants) |
| Dead `LayoutSVG` component (imported, never rendered) | `src/components/layout/LayoutSVG.tsx`, imported in `RoomCard.tsx` | Confirmed via source read |
| Unused `ProjectExportView.tsx` | `src/components/export/ProjectExportView.tsx` | Confirmed unused via grep |
| Unused `MaterialsCard.tsx` | `src/components/rooms/MaterialsCard.tsx` | Not rendered anywhere in the live tree |
| Disabled validation | `src/pages/ProjectPage.tsx` (commented-out `projectSchema.parse`/`roomSchema.parse`) | Confirmed via source read |
| Room keyed by name not id | `src/components/rooms/RoomCard.tsx`, `src/pages/ProjectPage.tsx` | Confirmed via source read |
| Likely double unit conversion | `src/utils/normalizeProject.ts` + `src/components/forms/ProjectForm.tsx` | Traced via static read, not runtime-confirmed |
| `CA_METRIC` display inconsistency | `src/utils/formatProjectSummary.ts`, `src/utils/formatResults.ts` | Confirmed via source read |
| Broken `/logo.png` reference | `src/pages/ProjectPage.tsx`, `src/components/export/ProjectExportView.tsx` | Confirmed missing file via `ls public/` |
| Unused `airChangeRate_per_h`/`customU` fields | `src/models/projectTypes.ts` | Confirmed unused via grep (only declared, never read/written elsewhere) |

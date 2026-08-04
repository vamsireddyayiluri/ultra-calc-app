# AGENTS.md — Logical Agents / Modules in Ultra-Calc

"Agents" here means **logical modules/subsystems** of the application (not autonomous AI agents). Each section below documents one subsystem: what it's responsible for, what goes in/out, what it depends on, which files implement it, and what could go wrong if changed carelessly. See [CLAUDE.md](CLAUDE.md) for the overall project context and **[docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) for the canonical list of protected files/formulas that require explicit approval before any change** — read it before touching the Heat Loss Agent or UltraCalc Material Agent below.

---

## 1. Heat Loss Agent

**Responsibilities:** Compute steady-state room heat loss (W) from geometry, U-values, ventilation, thermal bridging and ground loss; derive load density (W/m²), required flow-water temperature, and overload warnings.

**Inputs:** `RoomInput` (dimensions, exterior wall length, window/door area, ceiling/floor exposure, setpoint, floor cover, floor-on-ground flag, install method), `ProjectSettings` (region, indoor/outdoor design temps, insulation period, safety/heat-up %, psi allowance, ventilation rate, ACH, glazing, custom U overrides).

**Outputs:** `RoomResults` — `qFabric_W`, `qVent_W`, `qPsi_W`, `qGround_W`, `qBeforeFactors_W`, `qAfterFactors_W`, `load_W_per_m2`, `waterTemp_C`, `warnings: string[]`, optional `floorCover_R_m2K_per_W`/`floorCover_U_W_per_m2K`.

**Dependencies:** `models/waterTable.ts` (interpolation table), `models/presets.ts` (`GENERIC_PRESETS`, `UK_PRESETS`, `GLAZING_WINDOW_U`, `FLOOR_COVER_R`), `models/projectTypes.ts`, `utils/ultraCalcLocked.ts` (`determineMode`, `toBTU` — used only for the in-slab water-temp branch).

**Files involved:** `src/utils/physics.ts` (entry point `calculateRoom`), `src/utils/uDefaults.ts` (`getDefaultUValues`, used when applying region/period defaults, not inside `calculateRoom` itself).

**Potential risks:**
- Safety/heat-up factors apply only to `UK`/`EU` — easy to "fix" by accident thinking it's a bug.
- `ventilationLoss_W` hardcodes `c_air` (0.34 vs 0.33) per region branch rather than sourcing from `regionDefaults.ts` — a future region-defaults change won't affect this constant.
- In-slab water temperature ignores `WATER_TABLE` entirely and hardcodes 100°F/120°F — easy to miss when reviewing "the" water temperature logic since there are two independent code paths.
- `roomVolume_m3` caps effective height at 2.4m (`OCCUPIED_HEIGHT_CAP_M`) regardless of actual room height — intentional simplification, not a bug.
- The physics module's inline header comment says `// utils/calculateRoom.ts`, but the actual filename is `physics.ts` — stale comment, not a real second file; don't be misled into thinking there's a missing file.

---

## 2. UltraCalc Material Agent

**Responsibilities:** Given a room's computed load density and geometry, select tube size (16/20mm), load mode (`LL`/`HL`/`HighOutput`), and compute exact material quantities: tubing length, loop count, fin pairs/halves, and install-method-specific hardware (hanging supports, open-web ultra-clips, top-down clips/brackets). Also resolves the fin-block SVG asset name and center-to-center spacing for both "ultra-fin" (with-joist) and "tubing" (across-joist) layouts.

**Inputs:** `UltraCalcInput` (`method`, `joist`, `heatLoad` in BTU/ft² or W/m², `room` dims in FT or M) — produced by the adapter, not called directly by UI code.

**Outputs:** `UltraCalcOutput` — `selection` (method, joist, mode, tubeSize, supplementalWarning, finBlockSvg, spacing fields) and `materials` (tubing_ft/m, loops, ft/m per loop, fins_pairs, fin_halves, and method-specific clip/support counts).

**Dependencies:** None outside itself — `ultraCalcLocked.ts` is a self-contained, pure module with its own constants (`FIN_DENSITY`, `TUBING_ACROSS`, `TUBING_WITH`, `OPEN_WEB_CLIPS`, `INSLAB_TUBING_FACTOR`, `ULTRA_FIN_SPACING_MM`).

**Files involved:** `src/utils/ultraCalcLocked.ts` (engine, entry point `ultraCalc()`), `src/utils/ultraCalcAdapter.ts` (adapter `runUltraCalc()` that maps app-level `RoomInput`/`RoomResults`/`ProjectSettings` into `UltraCalcInput` and calls `ultraCalc()`), `src/utils/ultraSpacingLocked.ts` (duplicate copy of the spacing table, imported by `layoutMath`/`layoutEngine`-adjacent code — verify both stay identical if edited).

**Potential risks:**
- File is explicitly commented `LOCKED — FINAL`. Any edit changes real material purchase quantities for contractors. Treat every constant table as manufacturer data, not application code to be "cleaned up."
- `ultraCalcAdapter.ts`'s `mapInstallMethod`/`mapJoist` have silent `default` fallbacks (`"DRILLING"`, `16`) — if the app ever passes an unrecognized/undefined method or joist spacing, the calculator silently substitutes a default instead of erroring, which could produce a materials list for the wrong install method without any visible warning.
- `ULTRA_FIN_SPACING_MM`/`TUBING_SPACING_MM` are defined twice (`ultraCalcLocked.ts` and `ultraSpacingLocked.ts`) with identical values — a future edit to one and not the other would desync the numbers shown in `RoomCard`/`SummaryCard` (which import from `ultraCalcLocked.ts`) versus anything importing from `ultraSpacingLocked.ts`.
- `models/presets.ts` also defines an apparently-unused `SPACING_TABLE`/`MAX_LOOP_M` — do not confuse these with the actual authoritative constants in `ultraCalcLocked.ts` (`MAX_LOOP_FT = 300`).

---

## 3. Unit Conversion Agent

**Responsibilities:** Two distinct jobs, kept in separate files — (a) normalize user-entered "advanced settings" values from a region's native unit system into metric SI before physics runs (`normalize.ts`/`normalizeProject.ts`), and (b) convert stored metric SI values to/from a region's display units for form inputs and result displays (`display.ts`), plus pure numeric conversion primitives (`conversions.ts`) and small format-string helpers (`formatResults.ts`, `formatRoomResults.ts`, `formatProjectSummary.ts`).

**Inputs:** A `Region` plus a numeric value (temperature, length, area, U-value, ventilation rate, psi allowance, power, power density, spacing).

**Outputs:** Converted numeric value (metric or display units) or a formatted display string (e.g. `"1234 W"`, `"38.2 Btu/hr·ft²"`, `"400 mm"`).

**Dependencies:** `models/projectTypes.ts` (`Region` type) only — this agent has no dependency on the physics/material engines, only on the `Region` enum.

**Files involved:** `src/utils/conversions.ts` (raw factor functions: `m_to_ft`, `C_to_F`, `W_to_Btuh`, etc.), `src/utils/normalize.ts` + `normalizeProject.ts` + `normalizeRoom.ts` (input-side normalization before calculation; note `normalizeRoomInput()` is currently a no-op passthrough), `src/utils/display.ts` (`toDisplay*`/`fromDisplay*` pairs for UI), `src/utils/formatResults.ts`, `formatRoomResults.ts`, `formatProjectSummary.ts` (final display-string formatting), `src/helpers/updateUiLabels.ts` (`getUIUnits` — unit **labels**, not conversion).

**Potential risks:**
- **Confirmed inconsistency:** `formatProjectSummary.ts` and `formatResults.ts` classify `CA_METRIC` as imperial for display purposes, while `display.ts`, `normalize.ts`, and `updateUiLabels.ts` all classify it as metric. This means a Canada-Metric project's Summary tab and per-room spacing/tube-size fields render in imperial units while every other field renders metric. High-visibility bug — flagged in [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md).
- `normalizeRoomInput()` in `normalizeRoom.ts` is a no-op (`return room`) despite importing `normalizeLength`/`normalizeArea`/`normalizeTemperature` — looks like an incomplete migration. Do not assume room dimensions are being normalized through this function; they aren't.
- `normalizeTemperature()` exists in `normalize.ts` but is not invoked by `normalizeProjectSettings()` — indoor/outdoor temps bypass this normalizer entirely (see CLAUDE.md §12 assumption).
- Two independent rounding/precision choices exist across `display.ts` (2–4 decimal places depending on field) — inconsistent precision is intentional per-field tuning, not a bug, but don't "standardize" it without checking each call site's UI impact.

---

## 4. Layout Generator (floor layout SVG agent)

**Responsibilities:** Translate a room's real-world dimensions + joist spacing + load mode + install method into a 2D grid of positioned "tiles" (fin blocks, pipe bridges, end caps) referencing static SVG assets, suitable for both on-screen and PDF rendering.

**Inputs:** `{ roomLength_m, roomWidth_m, joist: Joist, load: LoadMode, method: InstallMethod }`.

**Outputs:** `{ tiles: Tile[], width: number, height: number }` where each `Tile` has `type` (`"FB"` fin block / `"PB"` pipe bridge / `"EC"` end cap), position (`x`,`y`), size (`w`,`h`), and an `asset` (SVG path) or `assetBase64` (inlined, for PDF export).

**Dependencies:** `layoutMath.ts` (`computeGrid`, `getDirection`), `assetResolver.ts` (`finBlockAsset`, `pipeBridgeAsset`, `endCapAsset` — all resolve to static paths under `/assets/diagrams/`), `blockConstants.ts` (`BLOCK_SIZE_M`, `JOIST_MM`), `layoutTypes.ts` (`Tile` shape).

**Files involved:** `src/layout/layoutEngine.ts` (entry point `buildLayout()`), `src/layout/layoutMath.ts`, `src/layout/blockConstants.ts`, `src/layout/assetResolver.ts`, `src/layout/layoutTypes.ts`, `src/layout/FloorLayoutSvg.tsx` (renderer), `src/layout/sidebarResolver.ts` + `RightSidebar.tsx` (companion sidebar profile/support-icon images, not the grid itself).

**Potential risks:**
- **Dead code / naming collision:** `src/layout/FloorLayout.tsx` also exports a component named `FloorLayoutSvg` with a *different* prop signature (`{tiles, width, height}` vs. the real, actually-imported `src/layout/FloorLayoutSvg.tsx`'s `{layout, installMethod}`). Nothing imports `FloorLayout.tsx` (verified via grep) — but a future import-autocomplete accident could pull in the wrong one. Consider this file for cleanup, but do not delete without re-confirming no usages first.
- `computeGrid()` uses `Math.floor` for cols/rows — leftover partial-block space at the room edge is not represented in the tile grid or its reported `area_m2`; the diagram may visually under-cover the actual room footprint for non-exact-multiple dimensions. This looks intentional (partial blocks aren't installable) but worth knowing when a diagram looks "short."
- `computeGrid`'s `area_m2` (grid-covered area) is distinct from `physics.ts`'s `roomArea_m2` (raw length × width) — don't conflate the two when debugging area-related display discrepancies.
- Asset paths are hardcoded string templates (e.g. `` `/assets/diagrams/FB_${joist}-${JOIST_MM[joist]}_${load}_${dir}.svg` ``) with no compile-time check that the referenced file exists in `public/assets/diagrams/` — a missing SVG asset fails silently at render time (broken image), not at build/type-check time.

---

## 5. PDF Generator

**Responsibilities:** Capture a hidden, off-screen DOM representation of the full project (header, per-room detail + layout, summary) and assemble it into a downloadable multi-page A4 PDF.

**Inputs:** DOM element refs (`headerRef`, `detailRefs[]`, `layoutRefs[]`, `summaryRef`), each already rendered by React with `exportMode=true` where applicable.

**Outputs:** A downloaded file `project-export.pdf` (via `jsPDF.save()`); no return value consumed by callers.

**Dependencies:** `html2canvas` (DOM → canvas rasterization), `jspdf` (PDF assembly), the export React components in §"Project Summary Generator"/component docs (`RoomDetailsExport`, `RoomLayoutExport`, `SummaryCard`, `ProjectForm exportMode`), and `inlineNestedSvgImages`/`svgBase64ToPng`/`loadImageAsBase64` (all in `pdfExport.ts` itself) to pre-bake external SVG `<image>` references into base64 before capture (html2canvas cannot rasterize cross-origin/external SVG `<image>` hrefs reliably).

**Files involved:** `src/utils/pdfExport.ts` (all export logic), `src/pages/ProjectPage.tsx` (owns the hidden DOM tree + `handleExportPDF`), `src/components/export/RoomDetailsExport.tsx`, `src/components/export/RoomLayoutExport.tsx`, (`src/components/export/ProjectExportView.tsx` exists but is currently unused).

**Potential risks:**
- Rasterization quality/format differs by page type (`scale: 2` + PNG for `"layout"` pages to preserve transparency, `scale: 1.5` + JPEG 0.85 quality for `"text"` pages to save size) — changing these without checking both legibility and output file size could regress the PDF in either direction.
- The hidden DOM is positioned `left: -99999px` rather than `display: none` — this is intentional (so `html2canvas` can still lay it out/measure it), but a naive attempt to "hide it properly" with `display: none` would break the PDF export (html2canvas needs a rendered, laid-out element).
- No error boundary/retry around `html2canvas`/`jsPDF` failures beyond a single top-level `try/catch` in `handleExportPDF` — a failure partway through a large multi-room project aborts the whole export with a generic error snackbar; no partial-progress feedback exists for many-room projects.
- Logo is loaded twice independently (once in `ProjectPage` for the summary page, once inside `SectionCard`/`RoomDetailsExport`/`RoomLayoutExport` for their own headers) via separate `loadImageAsBase64` calls — redundant network/file requests, not a correctness bug.

---

## 6. Project Summary Generator

**Responsibilities:** Aggregate all rooms' heat-loss and material results into one project-level totals object for the Summary tab and the PDF summary page — total heat, total tubing, total fins, total clips/hangers, total loops, area-weighted average water temperature, average load density, and a consistent-or-"VARIES" spacing indicator.

**Inputs:** `rooms: RoomInput[]`, `project: ProjectSettings`.

**Outputs:** `ProjectSummary` (`totalW`, `totalTubing_m`, `totalFins`, `totalClips`, `totalLoops`, `avgWaterTemp_C`, `avg_Wm2`, `notes: string[]`, `ultraFinSpacing_mm: number | "VARIES" | undefined`, `tubingSpacing_mm: number | "VARIES" | undefined`, `waterTempRange_C: string | undefined`).

**Dependencies:** Re-runs the Heat Loss Agent (`calculateRoom`) and UltraCalc Material Agent (`runUltraCalc`) for every room — this hook does **not** reuse any already-computed per-room results held by individual `RoomCard` instances; it recomputes independently.

**Files involved:** `src/hooks/useProjectSummary.ts` (entry point, memoized via `useMemo`), consumed by `src/pages/ProjectPage.tsx`, `src/pages/HomePage.tsx`, and rendered by `src/components/summary/SummaryCard.tsx` + `SummaryRow.tsx`.

**Potential risks:**
- Recomputing every room's full calculation a second time (once per `RoomCard`, once inside this hook) is a **performance** consideration for large projects (many rooms) — not currently a correctness issue, but worth knowing if the app is ever reported as slow on big projects.
- `waterTempRange_C` is named as a "range" but is actually just the **maximum** water temp among rooms, formatted as a single value (`"${tempC}°C"`) — not a min–max range. Misleading name; do not assume it contains two bounds.
- `totalClips` sums five different optional material fields (`hanging_supports`, `open_web_ultra_clips`, `topdown_ultra_clips`, `topdown_uc1212`, `topdown_uc1234`) unconditionally with `?? 0` — if `ultraCalcLocked.ts` ever adds a new clip/support field, this sum must be updated too or the new material type will silently be excluded from `totalClips`.
- Spacing "VARIES" detection uses a `Set<number>` per project — if two rooms happen to compute the same spacing value via different (LL vs HL) modes, they'll incorrectly collapse into "not varies"; this is inherent to the value-based Set comparison and would need mode-aware tracking to fix, if ever required.

---

## 7. Region Rules

**Responsibilities:** Define, per `Region`, the applicable heating standard (`StandardsMode`), default safety factor %, heat-up factor %, thermal-bridging (psi) allowance, mechanical ventilation rate, infiltration ACH, and (for UK) an alternate U-value preset table.

**Inputs:** `Region` selection from `ProjectForm`.

**Outputs:** A patch applied to `ProjectSettings` (`standardsMode`, `safetyFactorPct`, `heatUpFactorPct`, `psiAllowance_W_per_K`, `mechVent_m3_per_h`, `infiltrationACH`) plus recomputed `customUOverrides` via `getDefaultUValues()`.

**Dependencies:** `models/presets.ts` (`GENERIC_PRESETS`, `UK_PRESETS`), `models/projectTypes.ts` (`RegionDefaults` interface).

**Files involved:** `src/data/regionDefaults.ts` (the defaults table, `REGION_DEFAULTS`), `src/utils/uDefaults.ts` (`getDefaultUValues` — applies `UK_PRESETS` only when `region === "UK" && standardsMode === "BS_EN_12831"`), `src/components/forms/ProjectForm.tsx` (the only place `REGION_DEFAULTS` is applied, on the Region `<select>`'s `onChange`).

**Potential risks:**
- `UK_PRESETS` in `models/presets.ts` is currently **numerically identical** to `GENERIC_PRESETS` for every insulation period — either intentional (UK just happens to match generic defaults today) or an incomplete/placeholder implementation. Do not assume the UK-specific branch has no effect — it is live code, just currently producing the same numbers. Confirm with the business before assuming it's dead.
- Changing region defaults in `regionDefaults.ts` only affects **new** region selections (applied on `<select onChange>`) — existing saved projects that already have these fields populated are not retroactively updated. This is consistent with the rest of the app's "snapshot the defaults into the project" pattern, not a bug, but worth knowing when a region-defaults change doesn't seem to "take effect" on old projects.
- See §3 (Unit Conversion Agent) for the CA_METRIC imperial/metric display inconsistency, which is really a Region Rules + Unit Conversion cross-cutting issue.

---

## 8. Validation

**Responsibilities:** Define Zod schemas describing required/valid ranges for project and room form fields.

**Inputs/Outputs:** `projectSchema.parse(project)` / `roomSchema.parse(room)` — throws `ZodError` on invalid data; otherwise returns the parsed (typed) object.

**Dependencies:** `zod`.

**Files involved:** `src/validations.ts/projectSchema.ts`, `src/validations.ts/roomSchema.ts` (note: the containing directory is literally named `validations.ts` — a folder, not a file, despite the `.ts` extension in its name; this is unusual and worth being careful with in tooling/globs that assume `.ts` means "TypeScript file").

**Potential risks:**
- **These schemas are currently not enforced.** `ProjectPage.tsx`'s `handleSaveProject()` has the `projectSchema.parse(project)` and per-room `roomSchema.parse(room)` calls **commented out**. Invalid data (e.g. non-numeric temperatures, missing region) can currently be saved to Firestore without any validation error being raised to the user. Re-enabling this is a candidate improvement (see [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md)) but do so deliberately — re-enabling may surface previously-silent bad data in existing saved projects and block their save until fixed.
- The `preprocess` pattern used in both schemas maps `undefined` to a sentinel out-of-range number (e.g. `-90`, `-1000`, `-1`) purely so the subsequent `.refine`/`.min` check fails with a friendly message instead of a generic "required" Zod error — clever but easy to misread; the sentinel numbers themselves are never meaningful data.

---

## 9. Formatting (display/label agent)

**Responsibilities:** Turn raw numeric calculation results into region-appropriate, human-readable strings for the UI (forms, results panels, summary, PDF).

**Inputs:** `Region` + raw metric value(s) (or a `RoomResults`/`ProjectSummary` object).

**Outputs:** Formatted strings (e.g. `"1,234 W"`, `"38.2 Btu/hr·ft²"`, `'16" (400 mm)'`, `"—"` for missing values).

**Dependencies:** `utils/conversions.ts` for raw factor math; `models/presets.ts#INSTALL_METHOD_OPTIONS` for label lookups.

**Files involved:** `src/utils/formatRoomResults.ts` (`formatRoomResults` → `DisplayRoomResults`), `src/utils/formatProjectSummary.ts` (`formatProjectSummary`, `getInstallMethodLabel`), `src/utils/formatResults.ts` (`formatSpacing`, `formatTubeSizing`), `src/helpers/updateUiLabels.ts` (`getUIUnits` — labels only, not value formatting).

**Potential risks:**
- Duplicated `isImperial`/`imperial` boolean logic is re-implemented independently in at least three files (`formatProjectSummary.ts`, `formatResults.ts`, and inline in `RoomCard.tsx`/`ProjectForm.tsx` via `uiUnits.length === "ft"` checks) rather than sharing one helper — this is exactly why the `CA_METRIC` classification diverged between files (§3, §7). Any future region-classification fix must touch every one of these independent implementations.
- `formatTubeSizing` hardcodes a `{16: '1/2"', 20: '3/4"'}` lookup keyed on the tube size in mm — adding a new tube size to `ultraCalcLocked.ts` (`TubeSize` union) without updating this map will silently fall back to a computed-inches string instead of the expected nominal imperial size name.

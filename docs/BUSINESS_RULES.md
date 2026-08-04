# BUSINESS_RULES.md

This is the **canonical, must-read-first** reference for Ultra-Calc's business-critical logic — the rules a contractor's material order and installation depend on. It consolidates and supersedes the business-rules content previously spread across [../CLAUDE.md](../CLAUDE.md) §14/§16; those sections now point here instead of duplicating this content. See [CALCULATIONS.md](CALCULATIONS.md) for full formula derivations and [IMPROVEMENTS.md](IMPROVEMENTS.md) for known bugs in this area.

**Read this before touching any file listed in §1.** When in doubt, ask before changing an engineering formula — don't guess at intent from the code alone.

---

## 1. Locked / protected files — never modify without explicit approval

| File | Why it's protected |
|---|---|
| `src/utils/physics.ts` | Core heat-loss physics for every room (`calculateRoom`). Feeds water temp, warnings, and every downstream material calculation. |
| `src/utils/ultraCalcLocked.ts` | **Explicitly labeled "LOCKED — FINAL"** in its own header comment. Encodes the manufacturer's official material sizing sheet (tubing factors, fin density, spacing tables, clip counts). Governs what contractors actually purchase. |
| `src/models/waterTable.ts` | The water-temperature interpolation lookup table (`WATER_TABLE`). Changing values changes every project's recommended flow/boiler/manifold setpoint. |
| `src/data/regionDefaults.ts` | Region-specific safety/heat-up/psi/ventilation/ACH defaults, applied silently on region selection (`REGION_DEFAULTS`). |

Also treat these as **de facto locked**, even though not named explicitly by the user's rule — changing them has the same blast radius as the four above:

| File | Why |
|---|---|
| `src/utils/ultraSpacingLocked.ts` | Also carries a **"LOCKED"** header comment; duplicates the spacing table also present in `ultraCalcLocked.ts`. Must be changed together with `ultraCalcLocked.ts`, never alone. |
| `src/utils/ultraCalcAdapter.ts` | Bridges app-level `RoomInput`/`ProjectSettings` into the locked calculator's input shape. A mapping bug here silently corrupts every material calculation without touching the "locked" files themselves. |
| `src/models/presets.ts` (U-values, ACH, glazing, floor-cover R tables) | Baseline insulation assumptions used whenever the user hasn't overridden a value. |
| `src/layout/blockConstants.ts` | Physical block/spacing dimensions used to render (and implicitly validate) the installable layout — wrong values here misrepresent what's physically installable. |

**Process:** if a task requires changing anything in these two tables, stop and ask for explicit approval before editing, and confirm the specific numeric change with whoever owns the manufacturer data — don't infer "the right value" from surrounding code or naming.

## 2. Core engineering formulas — do not change without asking first

These are the specific, already-encoded business rules found in the codebase. Treat each as intentional unless told otherwise; don't "fix" them as drive-by cleanup.

1. **Safety/heat-up factors apply only to `UK`/`EU` regions.** `applySafetyFactors()` in `physics.ts` returns the input completely unchanged for `US`/`CA_METRIC`/`CA_IMPERIAL`. This looks asymmetric but is deliberate, existing code.
2. **Ventilation heat-capacity constant (`c_air`) differs by region group**: `0.34` for `UK`/`EU`, `0.33` for everything else (`ventilationLoss_W` in `physics.ts`). These are hardcoded in `physics.ts`, not sourced from `regionDefaults.ts` — a future change to `regionDefaults.ts` will not affect this constant.
3. **Mechanical ventilation rate (`mechVent_m3_per_h`) only contributes to heat loss for `UK`/`EU`.** For `US`/`CA_METRIC`/`CA_IMPERIAL`, the entered mechanical ventilation value has no effect on `qVent_W` under the current formula (see [CALCULATIONS.md](CALCULATIONS.md) §1.5). May be intentional per-standard methodology or may be an oversight — ask before changing.
4. **In-slab installs (`installMethod === "INSLAB"`) use a separate water-temperature rule, not the `WATER_TABLE` interpolation.** They classify load as `LL`/`HL` (`determineMode()`) and hardcode **100°F (LL) or 120°F (HL)**, converted to °C. This is independent of region.
5. **Floor-covering thermal resistance adds up to +12°C to the required water temperature** for non-in-slab installs: `Math.min(12, 25 * floorCoverR)`. The `25` multiplier and `12` cap are fixed business constants.
6. **All UltraCalc material quantities are rounded UP** (`Math.ceil`) — explicit in `ultraCalcLocked.ts`'s own header comment ("All material quantities are rounded UP for purchasing"). Never round down or round-to-nearest for tubing, loops, fins, or clips — under-ordering breaks a real installation.
7. **Max loop length is 300 ft** (`MAX_LOOP_FT` in `ultraCalcLocked.ts`). Note `models/presets.ts` also defines `MAX_LOOP_M = 90`, which the actual loop-count calculation (`calcLoops`) does **not** use — don't "fix" `calcLoops` to use `MAX_LOOP_M` without confirming which number is actually correct with the manufacturer data owner; they may simply be leftover/unused, not a bug to reconcile.
8. **Tube size upgrades from 16mm to 20mm above 46 BTU/ft²** (`THRESHOLDS.tubeUpgradeBTU`), and a **supplemental-heat warning triggers above 50 BTU/ft²** (`THRESHOLDS.supplementalBTU`) / **145 W/m²** (the equivalent warning threshold in `physics.ts`'s own `calculateRoom()`). These two thresholds live in two different files/units and are not derived from one shared constant — if one changes, check whether the other needs to change too, and ask before assuming they should be unified.
9. **Center-to-center spacing** (`ULTRA_FIN_SPACING_MM` / `TUBING_SPACING_MM`) is fixed per joist size and load mode (LL/HL) — see the table in [CALCULATIONS.md](CALCULATIONS.md) §3.8. This table is duplicated verbatim in both `ultraCalcLocked.ts` and `ultraSpacingLocked.ts`; any approved change must be applied to both.

## 3. Non-negotiable invariants (apply to all new code, not just existing formulas)

- **All values are stored internally in metric SI units** (meters, °C, W, W/m², m³/h, W/K) regardless of a project's display `region`. Region only ever changes *display* formatting (`utils/display.ts`, `formatResults.ts`, `formatRoomResults.ts`, `formatProjectSummary.ts`) or *default* values applied at region-selection time (`regionDefaults.ts`) — it never changes what unit a value is stored in.
- **Never introduce a new imperial/metric conversion helper** — extend `src/utils/conversions.ts` (raw factors), `src/utils/display.ts` (`toDisplay*`/`fromDisplay*`), or `src/utils/normalize.ts`/`normalizeProject.ts` (input-side normalization) instead of writing an inline conversion in a component or a new file. See [AGENTS.md](../AGENTS.md) §3/§9 — duplicated region-branch logic across files is exactly what caused the confirmed `CA_METRIC` display bug below (§4).
- **Calculation functions must stay pure and deterministic** — `calculateRoom()`, `ultraCalc()`, `interpWaterC()`, `buildLayout()` take explicit inputs and return a value with no side effects (no DOM access, no Firestore calls, no `Date.now()`/`Math.random()` influencing output). Preserve this when extending them; do not add a side effect or non-deterministic input to any of these functions.

## 4. Known confirmed issues in this area — do not silently "fix" without approval

These are real, traced inconsistencies uncovered while documenting the codebase. Each touches multiple call sites; a partial fix would leave the app in a worse, half-consistent state than today. Get explicit sign-off on the intended correct behavior before changing any of these.

1. **`CA_METRIC` is classified as imperial in `formatProjectSummary.ts` and `formatResults.ts`** (`formatSpacing`, `formatTubeSizing`) but as metric everywhere else (`display.ts`, `normalize.ts`, `updateUiLabels.ts`). Confirmed via source read. See [REGIONS.md](REGIONS.md).
2. **Likely double unit-conversion for `US`/`CA_IMPERIAL` ventilation, psi allowance, and custom U-values** — `ProjectForm.tsx` already converts these to SI via `fromDisplay*` before storing; `normalizeProjectSettings()` (called before every `calculateRoom()`) appears to convert them again. Traced via static read, **not yet runtime-confirmed** — verify by hand-calculation before changing. See [CALCULATIONS.md](CALCULATIONS.md) §7.
3. **Rooms are updated/removed by `room.name`, not `room.id`**, despite the type signatures saying `id: string`. Two same-named rooms will collide. See [ARCHITECTURE.md](ARCHITECTURE.md) §9.
4. **Custom U-value overrides may not actually affect the heat-loss calculation** — `mergeUValues()` in `physics.ts` does not appear to read `settings.customUOverrides`. Needs a runtime check, not an assumption.
5. **Zod validation (`projectSchema`, `roomSchema`) is fully implemented but currently disabled** — the parse calls in `ProjectPage.tsx#handleSaveProject()` are commented out. Re-enabling could reject previously-saved-but-invalid projects; coordinate before flipping this on.

## 5. Process for any change touching this document's scope

1. Identify whether the change touches a file in §1 or a rule in §2 — if so, stop and get explicit approval, stating the exact numeric/behavioral change and which downstream outputs (water temp, material quantities, spacing) it affects.
2. If the change is a unit-conversion change, extend the existing helper in `conversions.ts`/`display.ts`/`normalize.ts` rather than adding a new one — see §3.
3. If the change is meant to resolve one of the §4 known issues, fix it at **every** call site listed in the cross-referenced doc, not just the one you noticed — a partial fix is worse than the status quo because it makes the inconsistency less discoverable.
4. After any approved change to a §1 file, re-check [CALCULATIONS.md](CALCULATIONS.md) and [REGIONS.md](REGIONS.md) for stale formula descriptions and update them in the same change.

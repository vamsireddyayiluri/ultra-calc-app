# DATA_MODELS.md

Every model/interface/type in **Ultra-Calc**, grouped by file, with purpose and known caveats. Primary source: `src/models/projectTypes.ts` unless noted otherwise. See [CALCULATIONS.md](CALCULATIONS.md) for how these types flow through the calculation engine.

## `src/models/projectTypes.ts`

### `Region`
```ts
type Region = "UK" | "EU" | "US" | "CA_METRIC" | "CA_IMPERIAL";
```
The single most cross-cutting type in the app — drives units, standards, default factors, and (per [REGIONS.md](REGIONS.md)) some inconsistent display-formatting branches.

### `StandardsMode`
```ts
type StandardsMode = "generic" | "BS_EN_12831" | "ASHRAE" | "EN_ISO_13790" | "CSA_F280";
```
Selectable independently of `Region` in the "Advanced Defaults" section, though each region has one natural default (`REGION_DEFAULTS[region].standardsMode`). Only `"BS_EN_12831"` actually branches calculation behavior (`mergeUValues` in `physics.ts` applies `UK_PRESETS` only when `region === "UK" && standardsMode === "BS_EN_12831"`) — the other three modes are recorded/displayed but do not currently change any formula.

### `InsulationPeriodKey`
```ts
type InsulationPeriodKey = "pre1980" | "y1980_2000" | "y2001_2015" | "y2016p";
```
Selects a row from `GENERIC_PRESETS`/`UK_PRESETS` (`models/presets.ts`) for baseline U-values and ACH.

### `UIUnits`
```ts
type UIUnits = {
  length: "m" | "ft"; area: "m²" | "ft²"; temperature: "°C" | "°F";
  uValue: "W/m²·K" | "BTU/hr·ft²·°F"; power: "W" | "BTU/hr";
  powerDensity: "W/m²" | "BTU/hr·ft²"; ventilation: "m³/h" | "cfm";
  psi: "W/K" | "Btu/hr·°F";
};
```
Purely display labels, produced by `getUIUnits(region)` (`src/helpers/updateUiLabels.ts`). Not used for any conversion math itself.

### `MaterialUValues`
```ts
interface MaterialUValues { wall: number; window: number; door: number; roof: number; floor: number; }
```
Always stored in metric SI (W/m²K) regardless of display region. `roof` doubles as "ceiling" — there is no separate ceiling U-value field.

### `ProjectSettings`
```ts
interface ProjectSettings {
  id?: string;
  name: string;
  contractor: string;
  address: string;
  region: Region;
  standardsMode: StandardsMode;
  insulationPeriod?: InsulationPeriodKey;
  indoorTempC: number;
  outdoorTempC: number | null;
  safetyFactorPct?: number;
  heatUpFactorPct?: number;
  psiAllowance_W_per_K?: number;
  customUOverrides?: Partial<MaterialUValues>;
  airChangeRate_per_h?: number;      // legacy/generic — see caveat below
  infiltrationACH?: number;          // current field actually read by calculateRoom via mergeUValues' achOrN
  mechVent_m3_per_h?: number;
  glazing?: GlazingType;
  customU?: Partial<MaterialUValues>; // parallel/duplicate field to customUOverrides — see caveat below
}
```
**Caveats (from inline comments in the source and cross-referencing usage):**
- The file itself comments `airChangeRate_per_h` as "old generic" and `infiltrationACH` as "new" — both exist on the type, but only `infiltrationACH` (via `GENERIC_PRESETS[period].ACH` as the *default*, or the project's own value if `mergeUValues` reads it — verify exact precedence in `physics.ts` before assuming which one wins) is exercised by the current UI (`ProjectForm`'s "Infiltration (ACH)" field writes to `infiltrationACH`). `airChangeRate_per_h` does not appear to be written or read anywhere in the reviewed component code — treat as likely dead/legacy.
- `customU` and `customUOverrides` are two separate optional fields with the same shape (`Partial<MaterialUValues>`). Only `customUOverrides` is actually read/written by `ProjectForm.tsx`, `uDefaults.ts`, and `normalizeProject.ts`. `customU` does not appear to be referenced anywhere else in the reviewed code — treat as likely dead/legacy, but confirm before removing (a comment in the source says "for new 'customU' usage", suggesting an incomplete migration in either direction).
- `outdoorTempC` is nullable (`number | null`) while every other numeric field is `number | undefined` — this reflects that a new project explicitly sets `outdoorTempC: null` as a "required but not yet entered" sentinel (`ProjectPage.tsx`'s new-project initializer), distinct from `undefined` meaning "not applicable."

### `RegionDefaults`
```ts
interface RegionDefaults {
  standardsMode: StandardsMode; safetyFactorPct: number; heatUpFactorPct: number;
  psiAllowance_W_per_K: number; mechVent_m3_per_h: number; infiltrationACH: number;
}
```
The shape of each entry in `REGION_DEFAULTS` (`src/data/regionDefaults.ts`).

### `PeriodPreset`
```ts
interface PeriodPreset { U: { wall; window; door; roof; floor }; ACH: number; }
```
The shape of each entry in `GENERIC_PRESETS`/`UK_PRESETS` (`src/models/presets.ts`).

### `InstallMethod`
```ts
type InstallMethod = (typeof INSTALL_METHOD_OPTIONS)[number]["value"];
// = "DRILLING" | "OPEN_WEB" | "HANGING_SNAKE" | "HANGING_ULTRACLIP" | "TOPDOWN_UC_UC1212" | "INSLAB"
```
Derived from the `INSTALL_METHOD_OPTIONS` constant array (`models/presets.ts`) rather than declared independently — changing the options array automatically updates the type. Note: an **identically-named but independently-declared** `InstallMethod` union also exists in `src/utils/ultraCalcLocked.ts` with the same six literal values — they are structurally compatible but are two separate type declarations; don't assume changing one automatically updates the other.

### `JoistSpacingOption`
```ts
type JoistSpacingOption = 12 | 16 | 19 | 24;   // inches, "authoritative" per inline comment
```

### `GlazingType`
```ts
type GlazingType = "single" | "double" | "triple";
```

### `FloorCoverKey`
```ts
type FloorCoverKey = "tile_stone" | "vinyl_lvt" | "laminate" | "engineered_wood" | "solid_wood" | "carpet_low_pad" | "carpet_high_pad";
```

### `RoomInput` (app-wide room model)
```ts
interface RoomInput {
  id: string;
  name: string;
  length_m: number; width_m: number; height_m: number;
  exteriorLen_m: number; windowArea_m2: number; doorArea_m2: number;
  setpointC?: number;
  ceilingExposed?: boolean; floorExposed?: boolean;
  installMethod: InstallMethod;
  joistSpacing?: JoistSpacingOption;
  floorCover?: FloorCoverKey;
  floorOnGround?: boolean;
}
```
The single source of truth for a room's geometry and install configuration; always stored in metric SI. **Caveat:** `id` exists and is generated via `uid()` on room creation (`ProjectPage.tsx#addRoom`), but is *not actually used* as the update/removal key anywhere in the current UI — see [ARCHITECTURE.md](ARCHITECTURE.md) §9 / [COMPONENT_MAP.md](COMPONENT_MAP.md) for the `room.name`-as-key inconsistency.

⚠️ **Do not confuse this type with the unrelated, differently-shaped `RoomInput` discriminated union declared locally inside `src/utils/ultraCalcLocked.ts`** (`{unit:"FT", length, width} | {unit:"M", length, width}`), which exists purely as the calculator engine's own input shape and is mapped to/from the app-wide `RoomInput` by `ultraCalcAdapter.ts`.

### `RoomResults`
```ts
interface RoomResults {
  name: string;
  qFabric_W: number; qVent_W: number; qPsi_W: number; qGround_W: number;
  qBeforeFactors_W: number; qAfterFactors_W: number;
  load_W_per_m2: number; waterTemp_C: number;
  warnings: string[];
  floorCover_R_m2K_per_W?: number; floorCover_U_W_per_m2K?: number;
}
```
Output of `calculateRoom()` (`physics.ts`). All power/energy values are in watts (W); the derived `floorCover_U_W_per_m2K` is simply `1 / floorCover_R_m2K_per_W` when a floor cover is set.

### `ProjectSummary`
```ts
interface ProjectSummary {
  totalW: number; totalTubing_m: number; totalFins: number; totalClips: number;
  avgWaterTemp_C: number; avg_Wm2?: number; totalLoops?: number; notes?: string[];
  ultraFinSpacing_mm?: number | "VARIES"; tubingSpacing_mm?: number | "VARIES";
  waterTempRange_C: string | undefined;
}
```
Output of `useProjectSummary()`. **Caveat:** `waterTempRange_C` is a single formatted value (the maximum water temp among rooms), not an actual min–max range string — see [AGENTS.md](../AGENTS.md) §6.

### `CalcOutput`
```ts
interface CalcOutput { rooms: RoomResults[]; summary: ProjectSummary; }
```
Declared but **not found to be constructed or consumed anywhere** in the reviewed component/hook code (`useProjectSummary` returns a bare `ProjectSummary`, not a `CalcOutput`). Treat as likely dead/legacy type.

### `MaterialResults`
```ts
interface MaterialResults {
  tubing_m: number; tubing_ft: number; loops: number; m_per_loop: number; ft_per_loop: number;
  fins_pairs: number; fin_halves: number; drilling_supports: number;
  hanging_supports?: number; open_web_ultra_clips?: number; topdown_ultra_clips?: number; topdown_uc1212?: number;
  supplementalWarning: boolean;
}
```
Structurally very similar to (but a separate declaration from) `UltraCalcOutput["materials"]` in `ultraCalcLocked.ts`. **Not found to be used** by any component — `RoomCard`/`SummaryCard` consume `UltraCalcOutput` directly instead. Likely dead/legacy type from an earlier refactor.

### `Side` / `RichRoom`
```ts
interface Side { isExterior: boolean; length: number; openingArea: number; openingUOverride: number | null; }
interface RichRoom {
  name: string; length: number; width: number; height: number; setpoint: number;
  ceilingExposed: boolean; floorExposed: boolean; installMethod: InstallMethod;
  spacingOverrideIn: number | null; sides: Side[];
}
```
A legacy, more general "multi-wall-segment" room model. Only referenced by `src/helpers/updateRoomModel.ts`'s `toRichRoom`/`fromRichRoom` converters, which are themselves not called anywhere in the app. **Confirmed dead code path** (see [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)) — don't build new features on top of `RichRoom` without first confirming whether a real migration to a multi-wall model is actually planned.

### `UserType`
```ts
type UserType = { userId: string; name: string; email: string; cell: string; password: string; };
```
**Caveat:** the actual `users` Firestore documents saved by `registerAction()` (`authClient.ts`) also include `company`, `address`, and possibly `role` (per `ProfilePage.tsx`'s form fields, per the Explore pass) — this type is narrower than the real stored shape. Treat `UserType` as an incomplete/partial type for the `users` collection, not authoritative; extend it if adding new profile fields rather than assuming it's complete today. **Also:** storing `password` on this client-side type is unusual — verify this field is never actually populated with a real plaintext password in a Firestore-bound object (Firebase Auth manages passwords separately; a `password` field in a `users` document, if ever populated, would be a serious data-handling issue). This warrants a direct check before shipping any change that touches user registration data.

## `src/models/presets.ts` (constants, not types, but referenced everywhere)

| Constant | Shape | Purpose |
|---|---|---|
| `GLAZING_WINDOW_U` | `Record<GlazingType, number>` | Window U-value by glazing type. |
| `FLOOR_COVER_R` | `Record<FloorCoverKey, number>` | Floor covering thermal resistance. |
| `JOIST_SPACING_MM` | `Record<JoistSpacingOption, number>` | Joist spacing inches → mm. |
| `GENERIC_PRESETS` | `Record<InsulationPeriodKey, PeriodPreset>` | Baseline U-values/ACH by insulation era. |
| `UK_PRESETS` | `Partial<Record<InsulationPeriodKey, PeriodPreset>>` | UK-specific override (currently identical to generic — see REGIONS.md). |
| `MAX_LOOP_M` | `number = 90` | Appears unreferenced by the actual loop-count calculation (`ultraCalcLocked.ts` uses its own `MAX_LOOP_FT = 300` instead) — likely dead. |
| `SPACING_TABLE` | array of `{maxLoad, spacing_in, tubeSize_in}` | Appears unreferenced — the live spacing logic is `ULTRA_FIN_SPACING_MM`/`TUBING_SPACING_MM` in `ultraCalcLocked.ts`/`ultraSpacingLocked.ts` instead. Likely dead. |
| `INSTALL_METHOD_OPTIONS` | `{value, label}[]` | **Actively used** — source of truth for the `InstallMethod` type and every install-method `<select>`/label lookup in the UI. |

## `src/models/waterTable.ts`

`WATER_TABLE: {wpm2: number, c: number}[]` — the water-temperature interpolation table, see [CALCULATIONS.md](CALCULATIONS.md) §2. **Business-critical, do not edit without domain sign-off.**

## `src/layout/*` types

| Type | File | Purpose |
|---|---|---|
| `Tile` / `TileType` | `layoutTypes.ts` | `{type: "FB"\|"PB"\|"EC", x, y, w, h, asset, assetBase64?}` — the actual tile shape produced by `buildLayout()` and rendered by `FloorLayoutSvg`. |
| `LayoutTile` / `FloorLayout` | `layoutModel.ts` | A differently-shaped, **unused** alternative tile/layout model (confirmed via grep — no importers). Do not confuse with `Tile`/the real `buildLayout()` return shape. |
| `Joist`, `LoadMode`, `Direction` | `blockConstants.ts` | `12\|16\|19\|24`, `"LL"\|"HL"`, `"drilled"\|"parallel"` — layout-engine-local versions of concepts that also exist (slightly differently) at the app/model level (`JoistSpacingOption`, calculator's own `LoadMode`). |

## `src/utils/ultraCalcLocked.ts` types (the material calculator's own, self-contained type world)

| Type | Shape |
|---|---|
| `InstallMethod` | Same 6 literals as `models/projectTypes.ts`'s `InstallMethod`, declared independently (see caveat above). |
| `JoistKey` | `12 \| 16 \| 19 \| 24` |
| `LoadMode` | `"LL" \| "HL" \| "HighOutput"` — note this has a **third** value not present in `models/projectTypes.ts` (which has no `LoadMode` at all) or in `layout/blockConstants.ts`'s `LoadMode` (`"LL"\|"HL"` only, no `"HighOutput"`). `HighOutput` is always collapsed to `"HL"` for sizing/layout purposes (`calcMode` in `ultraCalc()`). |
| `TubeSize` | `16 \| 20` (mm nominal) |
| `HeatLoadInput` | `{unit:"BTU_FT2", value} \| {unit:"W_M2", value}` |
| `RoomInput` (local) | `{unit:"FT", length, width} \| {unit:"M", length, width}` — **do not confuse with the app-wide `RoomInput`** (see above). |
| `UltraCalcInput` | `{method, joist, heatLoad, room}` — the calculator's actual function input. |
| `UltraCalcOutput` | `{selection: {...}, area: {ft2, m2}, materials: {...}}` — the calculator's actual, currently-consumed output shape (used directly by `RoomCard`, `SummaryCard`, `useProjectSummary`, export components). |

## Summary of likely-dead types (candidates for cleanup — see IMPROVEMENTS.md, do not remove without confirming)

- `models/projectTypes.ts`: `CalcOutput`, `MaterialResults`, `RichRoom`, `Side`, and (partially) `airChangeRate_per_h`/`customU` fields on `ProjectSettings`.
- `models/presets.ts`: `MAX_LOOP_M`, `SPACING_TABLE`.
- `layout/layoutModel.ts`: `LayoutTile`, `FloorLayout` (whole file unreferenced).
- `helpers/updateRoomModel.ts`: whole file unreferenced (uses the dead `RichRoom`/`Side` types).

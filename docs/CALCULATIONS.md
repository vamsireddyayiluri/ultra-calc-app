# CALCULATIONS.md

Every engineering calculation in Ultra-Calc, with direct references to the implementing file/function. All internal storage units are metric SI (meters, °C, W, W/m², m³/h, W/K) — see [ARCHITECTURE.md](ARCHITECTURE.md) and [../CLAUDE.md](../CLAUDE.md) §12 for the display-conversion layer, which is separate from everything below.

## 1. Heat loss (`src/utils/physics.ts`, entry point `calculateRoom(room, settings)`)

### 1.1 Design temperature difference
```
dT = (room.setpointC ?? settings.indoorTempC) - settings.outdoorTempC
```
Per-room `setpointC` overrides the project's global `indoorTempC` if provided.

### 1.2 U-values merge (`mergeUValues`)
```
base = GENERIC_PRESETS[settings.insulationPeriod ?? "custom"]   // models/presets.ts
U = { ...base.U }
if (region === "UK" && standardsMode === "BS_EN_12831"):
    U = { ...U, ...UK_PRESETS[period].U }   // currently identical to GENERIC_PRESETS — see AGENTS.md §7
U.window = GLAZING_WINDOW_U[settings.glazing] ?? U.window
achOrN = base.ACH
```
Note: `customUOverrides`/`customU` on `ProjectSettings` (user-entered custom U-values) are **not** applied inside `mergeUValues` — despite being editable in `ProjectForm`'s "Custom U-Values" section, `calculateRoom()` does not read `settings.customUOverrides` at all in the currently-reviewed code path. **Assumption/flag:** either this is unwired (a possible bug — the UI lets a contractor enter custom U-values that then have no effect on the calculation) or it's applied elsewhere not found in this pass. Verify with the business/owner before assuming custom U-values work end-to-end.

### 1.3 Geometry
```
roomArea_m2(r)   = r.length_m * r.width_m
roomVolume_m3(r) = roomArea_m2(r) * min(r.height_m ?? 2.4, 2.4)   // OCCUPIED_HEIGHT_CAP_M = 2.4m
```
Room volume is capped at an effective 2.4m ceiling height regardless of actual room height (an explicit simplification for ventilation-loss purposes — tall rooms don't get proportionally larger ventilation loss).

### 1.4 Fabric loss (`fabricLoss_W`)
```
Afloor    = length_m * width_m
wallArea  = max(0, exteriorLen_m * height_m - windowArea_m2 - doorArea_m2)
Qw    = U.wall   * wallArea        * dT
Qwin  = U.window * windowArea_m2   * dT
Qdoor = U.door   * doorArea_m2     * dT
Qc    = ceilingExposed ? U.roof  * Afloor * dT : 0
Qf    = floorExposed   ? U.floor * Afloor * dT : 0
qFabric_W = Qw + Qwin + Qdoor + Qc + Qf
```

### 1.5 Ventilation / infiltration loss (`ventilationLoss_W`)
```
V = roomVolume_m3(r)
if region in {UK, EU}:
    qVent_W = 0.34 * achOrN * V * dT + (mechVent_m3_per_h ?? 0) * 0.34 * dT
else:
    qVent_W = 0.33 * achOrN * V * dT
```
`0.34`/`0.33` are the volumetric heat capacity of air (W·h/m³·K, expressed per-hour) — hardcoded per-region, **not** sourced from `data/regionDefaults.ts`. Non-UK/EU regions ignore `mechVent_m3_per_h` entirely in this formula.

### 1.6 Thermal bridging (`thermalBridge_W`)
```
qPsi_W = (settings.psiAllowance_W_per_K ?? 0) * dT
```

### 1.7 Ground loss (`groundLoss_W`)
```
qGround_W = room.floorOnGround ? 0.1 * roomArea_m2(r) * dT : 0
```
`0.1` W/m²K is a flat assumed ground U-value; only applied when the room's floor is explicitly marked on-ground.

### 1.8 Totals and safety/heat-up factors
```
qBeforeFactors_W = qFabric_W + qVent_W + qPsi_W + qGround_W

if region in {UK, EU}:
    safety = 1 + (safetyFactorPct ?? 0) / 100
    heatUp = 1 + (heatUpFactorPct ?? 0) / 100
    qAfterFactors_W = qBeforeFactors_W * safety * heatUp
else:
    qAfterFactors_W = qBeforeFactors_W          // US/CA_* get no multiplier — intentional, see CLAUDE.md §14
```

### 1.9 Load density
```
load_W_per_m2 = area > 0 ? qAfterFactors_W / roomArea_m2(r) : 0
```

### 1.10 Warnings
```
if load_W_per_m2 > 145: warnings.push("High load — supplemental heat may be required.")
```

## 2. Water temperature (`interpWaterC` in `physics.ts`, table in `src/models/waterTable.ts`)

For **non-in-slab** installs, required flow water temperature is linearly interpolated from `WATER_TABLE`:

| Load (W/m²) | Water Temp (°C) |
|---|---|
| 32 | 35 |
| 42 | 38 |
| 52 | 43 |
| 65 | 49 |
| 77 | 54 |
| 104 | 60 |
| 116 | 65 |
| 132 | 71 |
| 145 | 77 |
| 151 | 82 |

```
if q <= table[0].wpm2:  return table[0].c
if q >= table[last].wpm2: return table[last].c
otherwise linearly interpolate between the two bracketing rows:
   t = (q - p.wpm2) / (n.wpm2 - p.wpm2)
   return p.c + t * (n.c - p.c)
```

**Floor covering adjustment:** if the room has a `floorCover`, add `min(12, 25 * R)` °C to the interpolated water temp, where `R` is the covering's thermal resistance (`FLOOR_COVER_R`, m²K/W) — i.e. a thicker/more insulating floor covering (carpet) requires hotter water, capped at +12°C.

| Floor cover | R (m²K/W) |
|---|---|
| tile_stone | 0.01 |
| vinyl_lvt | 0.02 |
| laminate | 0.03 |
| engineered_wood | 0.05 |
| solid_wood | 0.07 |
| carpet_low_pad | 0.10 |
| carpet_high_pad | 0.15 |

**In-slab installs** (`installMethod === "INSLAB"`) use a **completely different rule**, ignoring `WATER_TABLE` and the floor-cover adjustment entirely:
```
loadBTU = toBTU({ unit: "W_M2", value: load_W_per_m2 })     // ultraCalcLocked.ts
mode = determineMode(loadBTU)                               // "LL" | "HL" | "HighOutput"
waterTemp_C = mode === "LL" ? F_to_C(100) : F_to_C(120)      // i.e. ~37.8°C or ~48.9°C
```

## 3. UltraCalc material sizing (`src/utils/ultraCalcLocked.ts`, entry point `ultraCalc(input)`)

### 3.1 Mode selection
```
loadBTU = toBTU(heatLoad)         // BTU/ft² ; W/m² ÷ 3.15459 if input was W/m²
mode = loadBTU <= 24 ? "LL" : loadBTU <= 46 ? "HL" : "HighOutput"
calcMode = mode === "LL" ? "LL" : "HL"     // HighOutput is treated as HL for sizing tables
```

### 3.2 Tube size and supplemental warning
```
tubeSize = method === "INSLAB" ? 16 : (loadBTU > 46 ? 20 : 16)   // mm nominal
supplementalWarning = loadBTU > 50
```

### 3.3 Area
```
if room.unit === "FT": ft2 = length*width ; m2 = ft2 / 10.7639
if room.unit === "M":  m2 = length*width ; ft2 = m2 * 10.7639
```

### 3.4 Tubing length
```
if method === "INSLAB":
    tubingFactor = calcMode === "LL" ? 1.5 : 2.0     // ft of tube per ft² (8" vs 6" spacing)
elif method in {DRILLING, OPEN_WEB}:                 // "across-joist" methods
    tubingFactor = TUBING_ACROSS[joist][calcMode]     // e.g. 12": LL=0.5714, HL=0.7059
else:                                                 // "with-joist" methods (hanging/top-down)
    tubingFactor = TUBING_WITH[joist]                 // e.g. 12"=1.0, 16"=0.75, 19"=0.6316, 24"=1.0

tubing_ft = ceil(ft2 * tubingFactor)
tubing_m  = ceil(m2 * tubingFactor * 3.28084)          // NOTE: independently derived from m2, not from tubing_ft — can round to a slightly different number of "whole units" than ft2*tubingFactor→ceil, since ceiling is applied after multiplying by a different area representation
```

### 3.5 Loops
```
MAX_LOOP_FT = 300
loops  = max(1, ceil(tubing_ft / 300))
ftPer  = tubing_ft / loops
mPer   = ftPer * 0.3048
```

### 3.6 Fins
```
if method === "INSLAB": fins_pairs = 0
else: fins_pairs = ceil(ft2 / FIN_DENSITY[calcMode].ft2PerFin)   // LL: 1.8 ft²/fin, HL: 1.4 ft²/fin
fin_halves = fins_pairs * 2
```

### 3.7 Install-method-specific hardware
```
SUPPORTS_PER_FT_TUBE = 0.4     // 1 support every 30 inches of tube

if method in {HANGING_SNAKE, HANGING_ULTRACLIP}:
    hanging_supports = ceil(tubing_ft * 0.4)

if method === OPEN_WEB:
    open_web_ultra_clips = ceil(ft2 * OPEN_WEB_CLIPS[joist][calcMode])   // e.g. 12": LL=0.286, HL=0.353

if method === TOPDOWN_UC_UC1212:
    baseSupports = ceil(tubing_ft * 0.4)
    topdown_ultra_clips = baseSupports * 2
    if tubeSize === 16: topdown_uc1212 = baseSupports
    else:                topdown_uc1234 = baseSupports
```

### 3.8 Spacing (center-to-center)

Two parallel concepts, both driven by the same `ULTRA_FIN_SPACING_MM` table (duplicated verbatim in `ultraSpacingLocked.ts` — keep both in sync):

| Joist | LL (mm) | HL (mm) |
|---|---|---|
| 12" | 530 | 430 |
| 16" | 400 | 330 |
| 19" | 360 | 280 |
| 24" | 530 | 430 |

```
"with-joist" methods (HANGING_SNAKE, HANGING_ULTRACLIP, TOPDOWN_UC_UC1212)
    → ultraFinSpacing_mm = ULTRA_FIN_SPACING_MM[joist][mode]
"across-joist" methods (DRILLING, OPEN_WEB)
    → tubingSpacing_mm = TUBING_SPACING_MM[joist][mode]   // same table, different semantic label
INSLAB → neither; instead a fixed spacingDisplayText: LL → '8" (200 mm)', HL → '6" (150 mm)'
```

### 3.9 Fin block asset name
```
type = (method === DRILLING || method === OPEN_WEB) ? "drilled" : "parallel"
finBlockSvg = `FB_${joist}_${calcMode}_${type}.svg`
```
(This name is computed but the actual on-screen asset paths used by the layout renderer come from `assetResolver.ts`'s separate `finBlockAsset()` — a differently-formatted path — see §5 below; `finBlockSvg` in `UltraCalcOutput.selection` does not appear to be consumed by the layout renderer. Treat it as informational metadata only.)

## 4. Adapter layer (`src/utils/ultraCalcAdapter.ts`, `runUltraCalc(room, results, project)`)

Maps app-level types into the calculator's input shape:
```
UltraCalcInput = {
  heatLoad: { unit: "W_M2", value: results.load_W_per_m2 },
  room:     { unit: "M", length: room.length_m, width: room.width_m },
  method:   mapInstallMethod(room.installMethod),   // passthrough switch; default "DRILLING"
  joist:    mapJoist(room.joistSpacing?.toString()), // "12"/"16"/"19"/"24" → number; default 16
}
```
The default fallbacks (`"DRILLING"`, `16`) apply only if `installMethod`/`joistSpacing` is unset/unrecognized — this can silently mask a data problem (see [AGENTS.md](../AGENTS.md) §2).

## 5. Layout generation (`src/layout/layoutEngine.ts`, `buildLayout(input)`)

1. **Grid sizing** (`layoutMath.ts#computeGrid`):
   ```
   block = BLOCK_SIZE_M[joist][load]      // real-world meters per fin block, e.g. 16"/LL = 0.400m × 0.400m
   cols  = floor(roomWidth_m  / block.w)
   rows  = floor(roomLength_m / block.h)
   ```
   Leftover fractional space at room edges is not represented (floor division) — partial blocks aren't installable, so this is intentional, not a bug.

2. **Fin block tiles**: one `"FB"` tile per grid cell at `(c*block.w, r*block.h)`, sized `block.w × block.h`, asset from `assetResolver.ts#finBlockAsset(joist, load, direction, method)` → path `/assets/diagrams/FB_{joist}-{JOIST_MM[joist]}_{load}_{direction}.svg`.

3. **Edge connectors**:
   - **Across-joist methods** (`DRILLING`, `OPEN_WEB`): each column gets a top and bottom **end cap** (`"EC"` tile) from `endCapAsset()`.
   - **With-joist methods** (everything else): a serpentine chain of **pipe bridge** (`"PB"`) tiles connects columns top-to-bottom-to-top in a snake pattern, alternating `isDown = c % 2 === 0`, with `"TL"/"TR"/"BL"/"BR"` orientation variants from `pipeBridgeAsset()`. The very first (`c===0`) and very last (`c===cols-1`) connections use end caps instead of bridges (loop start/end). 24" joists have their own `"TS"`/`"BC"` (center/side) variant mapping instead of the standard corner variants.
   - A connector's width is narrowed by a per-joist `connectorFactorByJoist` (12"→0.94, 19"→0.97, others→1.0) and horizontally centered within the block column.

4. In-slab installs produce no `buildLayout()`-driven visual (`FloorLayoutSvg` shows a static "Layout not available" message instead) — spacing is communicated only via the sidebar text (`spacingDisplayText`).

## 6. Unit conversions (`src/utils/conversions.ts`, `display.ts`, `normalize.ts`)

Raw factors (`conversions.ts`):

| Function | Formula |
|---|---|
| `m_to_ft` | `m * 3.28084` |
| `ft_to_m` | `ft / 3.28084` |
| `m2_to_ft2` | `m2 * 10.7639` |
| `ft2_to_m2` | `ft2 / 10.7639` |
| `C_to_F` | `c * 9/5 + 32` |
| `F_to_C` | `(f - 32) * 5/9` |
| `W_to_Btuh` | `w * 3.412` |
| `Wpm2_to_Btuhft2` | `v * 0.317` |

Additional factors used in `display.ts`/`normalize.ts`:

| Constant | Value | Purpose |
|---|---|---|
| `M3H_TO_CFM` / `CFM_TO_M3H` | 0.5886 / 1.699 | ventilation rate |
| `U_METRIC_TO_IMPERIAL` / inverse | 0.1761 / (1/0.1761) | U-values (W/m²K ↔ BTU/hr·ft²·°F) |
| `PSI_WK_TO_BTUHR_F` / inverse | 1.895 / (1/1.895) | thermal bridging allowance |
| `FT2_TO_M2` | 0.092903 | area (normalize.ts's own constant, distinct from `ft2_to_m2` in `conversions.ts` which uses 1/10.7639 ≈ 0.092903 — same value, computed two different ways in two different files) |

`display.ts` applies these to convert **stored SI → shown value** (`toDisplay*`) and **user-entered display value → stored SI** (`fromDisplay*`) based on `Region`, always treating `US`/`CA_IMPERIAL` as the imperial branch and everything else (`UK`, `EU`, `CA_METRIC`) as metric. `normalize.ts` applies a similar imperial/metric split but is used only for the project-settings normalization pass before `calculateRoom()` runs (ventilation, psi, custom U-values) — see [../CLAUDE.md](../CLAUDE.md) §12 and [../AGENTS.md](../AGENTS.md) §3 for the important exception: **`formatProjectSummary.ts`/`formatResults.ts` classify `CA_METRIC` as imperial**, unlike every other conversion file. This divergence is a genuine, confirmed inconsistency — see [IMPROVEMENTS.md](IMPROVEMENTS.md).

## 7. Likely double-conversion bug: ventilation / psi / custom U-values (US & CA_IMPERIAL)

Traced code path (high confidence, based on static reading — not confirmed by running the app):

1. In `ProjectForm.tsx`, the "Mechanical Vent.", "Psi allowance", and each "Custom U-Value" field is wired through `numericField(..., { toDisplay, fromDisplay })` using `toDisplayVentilation`/`fromDisplayVentilation`, `toDisplayPsiAllowance`/`fromDisplayPsiAllowance`, `toDisplayUValue`/`fromDisplayUValue` from **`display.ts`**. On every keystroke's `onChange`, the entered display-unit value (e.g. CFM for a US project) is converted **once** via `fromDisplay*` before being written into `project.mechVent_m3_per_h` / `psiAllowance_W_per_K` / `customUOverrides.*` — i.e. these fields are stored **already in metric SI**, exactly like every other stored field in the app.
2. Separately, `RoomCard.tsx` and `useProjectSummary.ts` both call `normalizeProjectSettings(project)` (from `utils/normalizeProject.ts`) immediately before `calculateRoom()`. That function applies `normalizeVentilation`, `normalizePsiAllowance`, and `normalizeUValue` (from `utils/normalize.ts`) to those same three fields — and for `region === "US" || region === "CA_IMPERIAL"`, those normalizers **convert again** (e.g. `value * CFM_TO_M3_PER_H`), as if the stored value were still in the display (imperial) unit.

**Net effect (if this trace is correct):** for `US`/`CA_IMPERIAL` projects, any project that has a non-zero mechanical ventilation rate, psi (thermal bridging) allowance, or custom U-value override gets that value **converted twice** before it reaches the heat-loss physics — i.e. multiplied by the imperial→metric factor squared instead of once. This would make ventilation loss, thermal-bridging loss, and fabric loss (when custom U-values are used) **too large** for imperial-region projects with these advanced settings populated. UK/EU/CA_METRIC projects are unaffected (both layers only special-case `US`/`CA_IMPERIAL`).

This is flagged with high confidence but **not runtime-verified** — before fixing, reproduce it by creating a `US` project, entering a mechanical ventilation rate, and comparing the room's `qVent_W` against a hand calculation using the entered CFM value. See [IMPROVEMENTS.md](IMPROVEMENTS.md) "Potential bugs."

## 8. Other assumptions made while documenting

- `customUOverrides`/`customU` on `ProjectSettings` may not actually feed into `calculateRoom()`'s U-value merge (§1.2) — `mergeUValues()` in `physics.ts` does not reference `settings.customUOverrides` at all in the reviewed code. Combined with §7 above, custom U-values may currently have **no effect** on the actual calculation regardless of the double-conversion issue — flagged as a possible bug, not confirmed as intended or unintended without product input.
- `normalizeTemperature()` in `normalize.ts` is present but not called by `normalizeProjectSettings()` — indoor/outdoor temperatures pass through unchanged (a comment in `normalizeProjectSettings` says "Already normalized by UI"), so temperature does not exhibit the same double-conversion pattern as ventilation/psi/U-values.

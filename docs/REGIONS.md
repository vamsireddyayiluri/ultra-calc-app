# REGIONS.md

Ultra-Calc supports five `Region` values: `UK`, `EU`, `US`, `CA_METRIC`, `CA_IMPERIAL`. This document lists, per region, the units, standard, default factors, and behavioral differences, with file references. See [CALCULATIONS.md](CALCULATIONS.md) for the underlying formulas and [../AGENTS.md](../AGENTS.md) §3/§7 for the Region Rules / Unit Conversion agents.

## How region selection works

Selecting a region in `ProjectForm.tsx`'s Region `<select>` immediately patches the project with:
```
onUpdate({
  region,
  ...REGION_DEFAULTS[region],           // src/data/regionDefaults.ts
  customUOverrides: getDefaultUValues({ ...project, region }),  // src/utils/uDefaults.ts
})
```
This is a **one-time snapshot** applied at selection time — changing region later does not retroactively re-derive fields the user has since edited, and an already-saved project's region-derived fields are not "live" (see [ARCHITECTURE.md](ARCHITECTURE.md) §9).

## UK

- **Standards mode:** `BS_EN_12831` (British/European heat-loss calculation standard).
- **Units (display):** metric — length `m`, area `m²`, temperature `°C`, U-value `W/m²·K`, power `W`, power density `W/m²`, ventilation `m³/h`, psi `W/K` (`getUIUnits`, `src/helpers/updateUiLabels.ts`).
- **Default factors** (`REGION_DEFAULTS.UK`, `src/data/regionDefaults.ts`):
  - `safetyFactorPct: 12.5`
  - `heatUpFactorPct: 27.5`
  - `psiAllowance_W_per_K: 0.04`
  - `mechVent_m3_per_h: 0.4`
  - `infiltrationACH: 0.25`
- **U-value preset:** if `standardsMode === "BS_EN_12831"`, `UK_PRESETS` (`src/models/presets.ts`) is applied over `GENERIC_PRESETS` — **currently numerically identical** to the generic table for every insulation period (see [AGENTS.md](../AGENTS.md) §7 — verify with the business whether this is intentional or an incomplete UK-specific dataset).
- **Calculation behavior:** safety factor and heat-up factor **are** applied (`physics.ts#applySafetyFactors` only multiplies for `UK`/`EU`). Ventilation uses `c_air = 0.34`.
- **This is the app's default new-project region** (`ProjectPage.tsx`'s "new project" initializer hardcodes `region: "UK"`, `standardsMode: "BS_EN_12831"`, `insulationPeriod: "y2001_2015"`).

## EU

- **Standards mode:** `EN_ISO_13790`.
- **Units (display):** metric — identical unit set to UK (`getUIUnits` groups `UK`/`EU`/`CA_METRIC` together).
- **Default factors** (`REGION_DEFAULTS.EU`):
  - `safetyFactorPct: 12`
  - `heatUpFactorPct: 25`
  - `psiAllowance_W_per_K: 0.035`
  - `mechVent_m3_per_h: 0.45`
  - `infiltrationACH: 0.3`
- **U-value preset:** always `GENERIC_PRESETS` (the UK-specific override branch in `mergeUValues`/`getDefaultUValues` only triggers for `region === "UK"`).
- **Calculation behavior:** safety/heat-up factors **are** applied (same `UK`/`EU` branch as above). Ventilation uses `c_air = 0.34` (same branch as UK).

## US

- **Standards mode:** `ASHRAE`.
- **Units (display):** imperial — length `ft`, area `ft²`, temperature `°F`, U-value `BTU/hr·ft²·°F`, power `BTU/hr`, power density `BTU/hr·ft²`, ventilation `cfm`, psi `Btu/hr·°F`.
- **Default factors** (`REGION_DEFAULTS.US`):
  - `safetyFactorPct: 10`
  - `heatUpFactorPct: 20`
  - `psiAllowance_W_per_K: 0.05`
  - `mechVent_m3_per_h: 0.5`
  - `infiltrationACH: 0.35`
- **U-value preset:** always `GENERIC_PRESETS` (no US-specific override table exists despite `ASHRAE` being a distinct standard from the generic/EU preset basis — the generic table is used as a stand-in for all non-UK regions).
- **Calculation behavior:** safety/heat-up factors are **NOT** applied (`applySafetyFactors` returns the input unchanged for anything other than `UK`/`EU` — this is explicit, deliberate code, confirmed in [../CLAUDE.md](../CLAUDE.md) §14). Ventilation uses `c_air = 0.33` (the `else` branch in `ventilationLoss_W`), and — unlike UK/EU — **`mechVent_m3_per_h` is not added at all** in that formula branch (only `achOrN * V * dT` is counted; see [CALCULATIONS.md](CALCULATIONS.md) §1.5). This means a US project's entered mechanical ventilation rate has **no effect on `qVent_W`** under the current formula, even before accounting for the double-conversion issue below.
- **Known bug risk:** ventilation rate, psi allowance, and custom U-values entered for a `US` project are likely double-converted before reaching the physics engine — see [CALCULATIONS.md](CALCULATIONS.md) §7.
- **Display-classification inconsistency:** `formatProjectSummary.ts`/`formatResults.ts` correctly classify `US` as imperial (consistent with every other file).

## CA_METRIC ("Canada — Metric U-values")

- **Standards mode:** `CSA_F280` (Canadian standard).
- **Units (display):** metric — grouped with `UK`/`EU` in `getUIUnits`.
- **Default factors** (`REGION_DEFAULTS.CA_METRIC`):
  - `safetyFactorPct: 15`
  - `heatUpFactorPct: 30`
  - `psiAllowance_W_per_K: 0.045`
  - `mechVent_m3_per_h: 0.4`
  - `infiltrationACH: 0.3`
- **U-value preset:** always `GENERIC_PRESETS`.
- **Calculation behavior:** safety/heat-up factors **NOT** applied (only `UK`/`EU` get the multiplier — `CA_METRIC` falls into the "no factor" branch same as `US`). Ventilation uses `c_air = 0.33` and, like `US`, does not add `mechVent_m3_per_h` in the formula (see §1.5 in CALCULATIONS.md — the `mechVent_m3_per_h` addition is gated to `region in {UK, EU}` only, not "all metric regions").
- **⚠️ Confirmed display inconsistency:** despite being the "metric" Canada variant, `formatProjectSummary.ts` and `formatResults.ts` (`formatSpacing`, `formatTubeSizing`) classify `CA_METRIC` as **imperial** (`region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC"`). This means a `CA_METRIC` project's **Summary tab totals and spacing/tube-size labels render in imperial units (BTU/hr, ft, inches)** while its input forms (`ProjectForm`, `RoomCard` via `getUIUnits`/`display.ts`) render in metric units (W, m, mm). This is the single most visible, confirmed bug found while documenting this codebase — see [IMPROVEMENTS.md](IMPROVEMENTS.md).

## CA_IMPERIAL ("Canada — Imperial U-values")

- **Standards mode:** `CSA_F280` (same as `CA_METRIC`).
- **Units (display):** imperial — grouped with `US` in `getUIUnits`.
- **Default factors** (`REGION_DEFAULTS.CA_IMPERIAL`): identical values to `CA_METRIC` (`safetyFactorPct: 15`, `heatUpFactorPct: 30`, `psiAllowance_W_per_K: 0.045`, `mechVent_m3_per_h: 0.4`, `infiltrationACH: 0.3`) — the only difference between the two Canada variants is display units, not the underlying default factors or standard.
- **U-value preset:** always `GENERIC_PRESETS`.
- **Calculation behavior:** safety/heat-up factors NOT applied; ventilation uses `c_air = 0.33`, no `mechVent_m3_per_h` term (same as `US`/`CA_METRIC`'s non-UK/EU branch).
- **Known bug risk:** same likely double-conversion issue as `US` (§ above) since `normalize.ts`'s normalizers treat `US`/`CA_IMPERIAL` identically.
- **Display classification:** consistently treated as imperial everywhere (no inconsistency, unlike `CA_METRIC`).

## Cross-region summary table

| Region | Standard | Display units | Safety/heat-up factors applied? | Ventilation `c_air` | `mechVent_m3_per_h` added to `qVent`? | UK U-value override? | Display formatting classified as |
|---|---|---|---|---|---|---|---|
| UK | BS_EN_12831 | metric | Yes | 0.34 | Yes | Yes (identical to generic today) | metric (consistent) |
| EU | EN_ISO_13790 | metric | Yes | 0.34 | Yes | No | metric (consistent) |
| US | ASHRAE | imperial | No | 0.33 | No | No | imperial (consistent) |
| CA_METRIC | CSA_F280 | metric | No | 0.33 | No | No | **imperial in 2 files — bug** |
| CA_IMPERIAL | CSA_F280 | imperial | No | 0.33 | No | No | imperial (consistent) |

## Business rules that are region-driven but not obviously "region logic" at first glance

- **In-slab water temperature** (100°F/120°F fixed values) is **not** region-dependent — it's the same absolute Fahrenheit-then-converted values regardless of `Region`, applied purely based on install method + load mode. Don't assume in-slab water temp needs per-region tuning; it's method-driven, not region-driven.
- **Glazing window U-value overrides** (`GLAZING_WINDOW_U`: single 5.0, double 2.7, triple 1.0 W/m²K) and **floor covering resistance** (`FLOOR_COVER_R`) apply identically across all regions — there is no region-specific glazing or floor-cover table.

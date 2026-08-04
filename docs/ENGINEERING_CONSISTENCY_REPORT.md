# ENGINEERING_CONSISTENCY_REPORT.md — Ultra-Calc Engineering Consistency Audit

**Scope:** Traced every project setting and room field from UI input → stored value → calculation → displayed result → PDF export, across all five regions (UK, EU, US, CA_METRIC, CA_IMPERIAL). Cross-referenced against [../CLAUDE.md](../CLAUDE.md), [../AGENTS.md](../AGENTS.md), [BUSINESS_RULES.md](BUSINESS_RULES.md), [CALCULATIONS.md](CALCULATIONS.md), [REGIONS.md](REGIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [AUDIT_REPORT.md](AUDIT_REPORT.md), and [IMPROVEMENTS.md](IMPROVEMENTS.md).

**Nothing in this document has been implemented.** This is an audit only — no source file was modified while producing it. Every finding below is backed by a direct source read or `grep` performed during this audit, not inferred from documentation alone.

**Relationship to existing docs:** Two findings here (C1, C3) **confirm and upgrade** hypotheses already flagged as "likely"/"suspected" in `AUDIT_REPORT.md`'s C1 and C2 — this audit traced the exact code path and, for C3, the exact numeric magnitude, turning "reproduce first" into a confirmed defect. One finding (H2) **broadens** an existing confirmed item (`AUDIT_REPORT.md` H3 / `IMPROVEMENTS.md` #2, the `CA_METRIC` display bug) with two more affected files than previously documented. One finding (H4) **confirms** `IMPROVEMENTS.md` item 8 and connects it to a previously-undocumented double-conversion risk. Everything else below (C2, C4, H1, H3, H5, and most of Medium/Low) is newly discovered during this audit.

**Severity legend:**
- **Critical** — produces a wrong engineering number today, for real users, with no workaround or warning.
- **High** — a real, triggerable defect affecting a subset of regions/fields, or a field that silently has zero effect despite being presented as load-bearing.
- **Medium** — a real inconsistency or fragility that doesn't produce a visibly wrong number today but is one refactor away from doing so, or degrades trust/maintainability.
- **Low** — dead code, cosmetic/naming issues, or purely informational facts requested by the audit scope.

---

## Executive summary

Four **Critical** findings, each independently capable of making the report's headline numbers wrong for a real customer:

1. **Custom U-Values have zero effect on the calculation.** Editing Wall/Window/Door/Roof/Floor U-values does nothing — `physics.ts` never reads `customUOverrides`.
2. **Ceiling and floor (exposed) fabric loss is always zero, for every room, in every project.** There is no UI control anywhere that can set `ceilingExposed`/`floorExposed` to `true`.
3. **Thermal-bridging (psi) loss is silently halved for every US/CA_IMPERIAL project** — a genuine double unit-conversion in `normalizeProjectSettings()`. This also creates a cross-page PDF inconsistency: the Room Layout page (which skips normalization) can select a different load mode than the Room Details/Materials Summary pages for the same room.
4. **`CA_METRIC` results render in imperial units while its inputs render in metric** — confirmed across four separate files (broader than previously documented), including a within-the-same-summary split between `waterTempRange_C` (metric) and every other summary stat (imperial).

Three **High** findings show that several fields displayed on the app's own "Design Parameters" PDF page as calculation assumptions are not, in fact, used by the calculation for most regions (ACH, Safety Factor, Heat-up Factor), and that two required-looking room fields (`joistSpacing`, `floorCover`) can be left unset while the room still reports as "valid."

None of these were fixed. All are listed below with severity, evidence, and a recommended (not yet approved) fix.

---

## 1. Findings — Critical

### C1. Custom U-Values are stored and displayed but never reach the heat-loss calculation
- **Severity:** Critical
- **Description:** `ProjectForm.tsx`'s "Custom U-Values" section reads/writes `project.customUOverrides.{wall,window,door,roof,floor}`. `normalizeProjectSettings()` even normalizes these values to SI. But `physics.ts#mergeUValues()` — the only place `MaterialUValues` are assembled before `calculateRoom()` runs — builds `U` exclusively from `GENERIC_PRESETS[period].U` / `UK_PRESETS[period].U`, then overwrites `U.window` from `glazing`. `settings.customUOverrides` is never referenced anywhere in `physics.ts`. Confirmed via `grep -r customUOverrides src/` — every hit is in `ProjectForm.tsx`, `ProjectPage.tsx`, `normalizeProject.ts`, or `projectTypes.ts`; zero hits in `physics.ts`.
- **Why it matters:** A contractor who measures and enters a real wall U-value sees it accepted, echoed back in the form, and (as of this session's Phase 2 work) printed on the PDF's "Design Parameters" page under "Custom U-Values" — but `qFabric_W`, load density, water temperature, and every downstream material quantity are computed from the *generic insulation-period preset* instead. The custom value has no effect on any number the report actually reports.
- **Affected files:** `src/utils/physics.ts` (`mergeUValues`), `src/components/forms/ProjectForm.tsx` (Custom U-Values UI), `src/components/export/DesignParametersPage.tsx` (now prints the ignored value as if it were used).
- **Recommended fix (not implemented):** In `mergeUValues()`, after applying preset/UK/glazing values, apply any defined `settings.customUOverrides` entries last (`U = {...U, ...compact(settings.customUOverrides)}`, skipping `undefined` keys so an untouched field still falls back to the preset). Requires explicit approval per `BUSINESS_RULES.md` §1 — `physics.ts` is locked.
- **Calculations would change:** Yes — for any project that has ever set a custom U-value, `qFabric_W` and every downstream number would change. Needs regression verification against known reference values before shipping.
- **UI would change:** No — the form and PDF already display the value; only its effect on the numbers would change.
- **Documentation would change:** Yes — `AGENTS.md` §1 "Heat Loss Agent" and `docs/CALCULATIONS.md` should note that custom U-values are now (once fixed) actually applied.
- **Cross-reference:** Upgrades `AUDIT_REPORT.md` C1 from "likely" to confirmed, with exact trace.

### C2. Ceiling and floor (exposed) fabric loss is structurally unreachable — always zero
- **Severity:** Critical
- **Description:** `physics.ts#fabricLoss_W()` only counts roof loss (`Qc`) when `r.ceilingExposed` is `true`, and exposed-floor loss (`Qf`) when `r.floorExposed` is `true`. `grep -ri "exposed" src/components` returns **zero matches** — there is no checkbox, toggle, or any editable control anywhere in the UI for either field. Both room-creation factories (`ProjectPage.tsx#addRoom()`, `HomePage.tsx`'s equivalent) hardcode `ceilingExposed: false, floorExposed: false` and nothing ever changes them afterward. `src/helpers/updateRoomModel.ts` reads/writes these fields but is itself dead code (zero imports anywhere in `src/`, confirmed by `grep`), so it isn't a live pathway either.
- **Why it matters:** Any room with a real exposed ceiling (top floor under a cold roof) or an exposed floor (over an unheated garage/crawlspace — distinct from `floorOnGround`, which does work) has its roof/floor fabric loss silently excluded from the total heat load, for every project, permanently. This is a heating-equipment/material *undersizing* risk in exactly the room types (top floor, over-garage) where it matters most.
- **Affected files:** `src/utils/physics.ts` (`fabricLoss_W`), `src/pages/ProjectPage.tsx` / `src/pages/HomePage.tsx` (room factories), `src/models/projectTypes.ts` (`RoomInput.ceilingExposed`/`floorExposed`), `src/components/rooms/RoomCard.tsx` (no corresponding field), `src/helpers/updateRoomModel.ts` (dead code referencing the same fields).
- **Recommended fix (not implemented):** Add editable "Ceiling Exposed" / "Floor Exposed" controls to `RoomCard.tsx` (a UI addition, not a calculation change) so the existing `physics.ts` logic — which is already correct — can actually be reached. Whether this is the right UX (vs. inferring exposure from room position) is a product decision, not something to infer unilaterally.
- **Calculations would change:** Only for rooms where a user then sets either flag to `true` — existing projects (all currently `false`) would see no change unless edited.
- **UI would change:** Yes — this requires a new field, which is out of this audit's presentation-only scope and needs explicit approval as a UI addition, not a bug fix.
- **Documentation would change:** Yes — `docs/CALCULATIONS.md` should stop describing `Qc`/`Qf` as if they're reachable today, or note this limitation explicitly until fixed.
- **Cross-reference:** Not previously documented anywhere in `AGENTS.md`/`AUDIT_REPORT.md`/`IMPROVEMENTS.md`.

### C3. Psi allowance is double-converted for US/CA_IMPERIAL — silently halves thermal-bridging loss, and diverges between the live app and the PDF's Layout page
- **Severity:** Critical
- **Description:** Two independent conversion layers both touch `psiAllowance_W_per_K`:
  1. **Input boundary** (`ProjectForm.tsx`'s `numericField`): on every keystroke, `onUpdate({psiAllowance_W_per_K: fromDisplayPsiAllowance(region, raw)})` converts the user's imperial-displayed entry to SI (W/K) **before** it is stored. Region-default assignment (`REGION_DEFAULTS[region].psiAllowance_W_per_K`, e.g. `0.05` for US) also stores an already-SI value. Either way, `project.psiAllowance_W_per_K` is always SI by the time it's read.
  2. **Calculation boundary** (`normalizeProjectSettings()` in `normalizeProject.ts`, called by `RoomCard.tsx` and `useProjectSummary.ts` immediately before `calculateRoom()`): applies `normalizePsiAllowance(region, value)`, which for `US`/`CA_IMPERIAL` multiplies by `PSI_BTUHR_F_TO_WK` (≈0.528) **again** — treating the already-SI value as if it were still in Btu/hr·°F.
  
  Net effect: `0.05 W/K` (US default) becomes `0.05 × 0.528 ≈ 0.0264 W/K` by the time `thermalBridge_W = psiAllowance_W_per_K × dT` runs. This affects **every** US/CA_IMPERIAL project, not just ones with a manually-edited psi value — the double conversion is unconditional.
  
  **Separately**, `src/components/export/RoomLayoutExport.tsx` calls `calculateRoom(room, project)` directly (line 56) — **not** `calculateRoom(room, normalizeProjectSettings(project))`. This is the one PDF component out of four (`RoomCard`, `useProjectSummary`, `MaterialsSummaryPage`, `RoomLayoutExport`) that doesn't normalize. For US/CA_IMPERIAL, this means the Room Layout page computes the *correct* (non-halved) psi contribution while the Room Details page (via `RoomCard exportMode`), the Materials Summary page, and the live in-app view all compute the halved (wrong) value — for the same room, in the same report.
- **Why it matters:** Every US and CA_IMPERIAL project under-counts thermal-bridging loss by roughly half, silently, with no warning — a live engineering-correctness defect, not a hypothetical one. In edge cases where this ~2x psi difference is enough to shift a room across a load-mode threshold (LL/HL/HighOutput, at 24/46 BTU·ft⁻² boundaries), the diagram shown on the PDF's Layout page could depict different tube spacing than the number printed on the Materials Summary/Details pages for that same room.
- **Affected files:** `src/utils/normalizeProject.ts` (`normalizeProjectSettings`), `src/utils/normalize.ts` (`normalizePsiAllowance`), `src/components/forms/ProjectForm.tsx` (`fromDisplayPsiAllowance` at the input boundary), `src/components/export/RoomLayoutExport.tsx` (the un-normalized outlier).
- **Recommended fix (not implemented):** Given `ProjectForm.tsx` already converts to SI at the input boundary (mirroring how `indoorTempC`/`outdoorTempC` are handled), the likely correct fix is making `normalizeProjectSettings()` a no-op passthrough for `psiAllowance_W_per_K` (and `mechVent_m3_per_h`, `customUOverrides.*` — see M1) — the same pattern already used for temperatures — rather than removing the display-conversion layer. Separately, `RoomLayoutExport.tsx` should call `calculateRoom(room, normalizeProjectSettings(project))` to match the other three call sites, regardless of which side of the double-conversion fix is chosen — the four call sites must agree with each other.
- **Calculations would change:** Yes, significantly, for every US/CA_IMPERIAL project — needs regression testing across both regions and both install-method families before shipping.
- **UI would change:** No.
- **Documentation would change:** Yes — `AGENTS.md` §3 "Unit Conversion Agent" should document this as a confirmed (not merely possible) defect until fixed.
- **Cross-reference:** Upgrades `AUDIT_REPORT.md` C2 from "likely, reproduce first" to confirmed, with exact magnitude and the newly-discovered PDF cross-page divergence (the PDF export pipeline didn't exist in its current form when C2 was originally written).

### C4. `CA_METRIC` renders results in imperial units while every input renders in metric — confirmed across four files, including a within-summary split
- **Severity:** Critical
- **Description:** `display.ts` (all `toDisplay*`/`fromDisplay*`), `normalize.ts`, and `helpers/updateUiLabels.ts#getUIUnits()` all classify `CA_METRIC` as **metric** (`case "US": case "CA_IMPERIAL":` is the only imperial branch in each). But **four** separate result-formatting sites classify it as **imperial**:
  - `src/utils/formatProjectSummary.ts` — `region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC"`
  - `src/utils/formatResults.ts` (`formatSpacing`, `formatTubeSizing`) — same three-region check
  - `src/utils/formatRoomResults.ts` — same three-region check (**not previously documented** — `AUDIT_REPORT.md` H3 and `IMPROVEMENTS.md` #2 only name the first two files)
  - Meanwhile `src/hooks/useProjectSummary.ts`'s own inline `waterTempRange_C` computation checks only `region === "US" || region === "CA_IMPERIAL"` — correctly excluding `CA_METRIC` — putting it in the *metric* camp, disagreeing with its sibling fields in the very same `ProjectSummary` object.
- **Why it matters:** For a `CA_METRIC` project: `RoomCard`'s Length/Width/Height inputs show meters, but the "Total Heat" and "Water Temp" results directly below (via `formatRoomResults`) show Btu/h and °F. On `SummaryCard` (and now the Phase 2 PDF Cover page), "Total Heat Load" reads e.g. "12,300 BTU/hr" while "Required Water Temperature" — right next to it, from the same `summary` object — reads "48°C". This is not a subtle inconsistency; it's two unit systems in the same stat row.
- **Affected files:** `src/utils/formatProjectSummary.ts`, `src/utils/formatResults.ts`, `src/utils/formatRoomResults.ts`, `src/hooks/useProjectSummary.ts` (`waterTempRange_C`), vs. `src/utils/display.ts`, `src/utils/normalize.ts`, `src/helpers/updateUiLabels.ts`. Also inherited by `src/components/export/CoverPage.tsx` and `MaterialsSummaryPage.tsx` (Phase 2), since both reuse `formatProjectSummary`.
- **Recommended fix (not implemented):** Introduce one shared `isImperialRegion(region)` helper (excluding `CA_METRIC`, matching `display.ts`) and use it in all four sites, replacing every independent inline check — this is the same recommendation already on record in `AUDIT_REPORT.md` M3/H3, now confirmed to need a fourth file fixed alongside the two previously named, plus the `useProjectSummary.ts` line brought into agreement (it's already correct, so it needs no change — the other three need to match it).
- **Calculations would change:** No — confirmed the underlying material-sizing engine (`ultraCalcLocked.ts`) always receives metric SI regardless of region (via `ultraCalcAdapter.ts`'s fixed `unit: "W_M2"`/`unit: "M"`), so this is purely a **display** defect, not a calculation defect. Worth stating precisely since it changes the risk profile of the fix.
- **UI would change:** Yes — visibly, for every `CA_METRIC` project (the intended, correct visible change).
- **Documentation would change:** Yes — `docs/REGIONS.md` and `AGENTS.md` §3 should be updated once fixed to remove the "confirmed inconsistency" caveat.
- **Cross-reference:** Broadens `AUDIT_REPORT.md` H3 / `IMPROVEMENTS.md` #2.

---

## 2. Findings — High

### H1. ACH, Safety Factor, and Heat-up Factor are displayed as calculation assumptions but are ignored for most regions
- **Severity:** High
- **Description:** Three sub-findings, same shape:
  - **ACH:** `project.infiltrationACH` is editable, region-defaulted, and normalized — but `physics.ts#mergeUValues()` sets `achOrN = base.ACH` from `GENERIC_PRESETS[insulationPeriod].ACH` / `UK_PRESETS[insulationPeriod].ACH` (four fixed values keyed only by insulation period). `settings.infiltrationACH` is never read. Confirmed via `grep -rn infiltrationACH src` — every hit is in UI/storage/region-defaults code, none in `physics.ts`.
  - **Safety Factor / Heat-up Factor:** `applySafetyFactors()` only applies to `region === "UK" || region === "EU"`. For US, CA_METRIC, and CA_IMPERIAL, `project.safetyFactorPct`/`heatUpFactorPct` are editable and displayed but have zero effect on `qAfterFactors_W`.
- **Why it matters:** This session's own Phase 2 work built a "Design Parameters" PDF page that documents exactly these three fields (among others) as "the design assumptions and inputs used to produce the heat loss... results in this report." For non-UK/EU regions and for ACH universally, that framing is inaccurate — the report would be documenting numbers that don't drive the numbers next to them.
- **Affected files:** `src/utils/physics.ts` (`mergeUValues`, `applySafetyFactors`), `src/components/export/DesignParametersPage.tsx` (prints these as assumptions), `src/components/forms/ProjectForm.tsx` (Advanced Defaults UI, offers all three for every region).
- **Recommended fix (not implemented):** Either (a) wire `infiltrationACH` into `mergeUValues()` and extend `applySafetyFactors()`/document why it's UK/EU-only if that's intentional standards-driven behavior, or (b) if intentional, visibly scope the UI/PDP page per-region (e.g. gray out or omit Safety/Heat-up Factor fields for non-UK/EU regions, and ACH everywhere) so the report doesn't claim an assumption is "used" when it isn't. Needs a business-owner decision on which fields are genuinely standards-scoped vs. simply unfinished.
- **Calculations would change:** Only if option (a) is chosen — a real, region-wide behavior change requiring sign-off (`physics.ts` is locked).
- **UI would change:** Only if option (b) is chosen.
- **Documentation would change:** Yes either way — `AGENTS.md` §1 already notes "Safety/heat-up factors apply only to UK/EU" as a known risk, but doesn't mention ACH being entirely unused; that should be added.
- **Cross-reference:** ACH: not previously documented. Safety/Heat-up UK/EU scoping: already noted as a *risk* in `AGENTS.md` §1, but not previously connected to the new PDF page's "assumptions" framing.

### H2. `standardsMode` has zero observable effect on any calculated output today
- **Severity:** High
- **Description:** `standardsMode`'s only code path is `mergeUValues()`'s `if (settings.region === "UK" && settings.standardsMode === "BS_EN_12831")` gate, which — when true — merges `UK_PRESETS[period].U` over the generic preset. `UK_PRESETS` in `models/presets.ts` is a byte-for-byte numeric duplicate of `GENERIC_PRESETS` for every insulation period (`U` values and `ACH` both identical). Even when the UK branch fires, it overwrites values with identical values. For every other region, `standardsMode` is never consulted by any calculation at all (`applySafetyFactors` checks region only, not standards mode).
- **Why it matters:** `standardsMode` is a required, prominently-displayed field (Project Info section, `ProjectForm`, `CoverPage`, `DesignParametersPage`) offering 4 selectable values (`BS_EN_12831`/`ASHRAE`/`EN_ISO_13790`/`CSA_F280`) that a user can freely change — with zero effect on any number in the report, for any region, today.
- **Affected files:** `src/utils/physics.ts` (`mergeUValues`), `src/models/presets.ts` (`UK_PRESETS`), `src/components/export/CoverPage.tsx` / `DesignParametersPage.tsx` (both print this as a meaningful setting).
- **Recommended fix (not implemented):** Confirm with the business/manufacturer-data owner whether `UK_PRESETS` was meant to diverge from `GENERIC_PRESETS` (per `AGENTS.md` §7's existing caution) and whether `standardsMode` should gate anything else (e.g. different safety-factor defaults, different ACH tables) per real BS EN 12831 vs. ASHRAE vs. CSA F280 methodology. This is a business/engineering-standards question, not something to infer from code.
- **Calculations would change:** Only if the business confirms `UK_PRESETS` (or standards-mode-gated behavior generally) should genuinely diverge.
- **UI would change:** No.
- **Documentation would change:** Yes — `AGENTS.md` §7 already flags `UK_PRESETS` as numerically identical and says "confirm before assuming it's dead"; this audit is that confirmation — the note should be upgraded from a caution to a confirmed fact once the business weighs in.
- **Cross-reference:** Extends the existing `AGENTS.md` §7 caution about `UK_PRESETS` into a fuller statement about `standardsMode` as a whole.

### H3. `joistSpacing` and `floorCover` are required-looking room fields with no validation coverage at all
- **Severity:** High
- **Description:** `roomSchema.ts` (Zod) validates `name`, `setpointC`, `length_m`, `width_m`, `height_m`, `exteriorLen_m`, `windowArea_m2`, `doorArea_m2`, `ceilingExposed`, `floorExposed`, and `installMethod` — but has **no rule at all** for `joistSpacing` or `floorCover`. The custom validator's `ROOM_EMPTY_CHECKS` (`src/validations.ts/projectValidator.ts`) also has no entry for either field. Both are marked `required` in `RoomCard.tsx`'s UI (`<Field label="Joist Spacing" required>`, `<Field label="Floor Cover" required>`).
- **Why it matters:** A room can have `joistSpacing: undefined` or `floorCover: undefined` and still be classified "valid"/complete by both the Zod schema and the app's own validator — meaning it can be Published. Downstream: `ultraCalcAdapter.ts#mapJoist()` silently substitutes `16` for an unrecognized/missing joist spacing (materials calculated for the wrong joist size, with no warning); `physics.ts#getFloorCoverR()` returns `undefined` for a missing floor cover, silently skipping the floor-covering water-temperature adjustment.
- **Affected files:** `src/validations.ts/roomSchema.ts`, `src/validations.ts/projectValidator.ts` (`ROOM_EMPTY_CHECKS`), `src/utils/ultraCalcAdapter.ts` (`mapJoist` silent default), `src/utils/physics.ts` (`getFloorCoverR`).
- **Recommended fix (not implemented):** Add `joistSpacing`/`floorCover` rules to `roomSchema.ts` and corresponding entries to `ROOM_EMPTY_CHECKS`, matching the pattern already used for `installMethod`.
- **Calculations would change:** No — this only affects what the validator reports as "incomplete"; it doesn't change any calculation formula.
- **UI would change:** Yes — previously-silent gaps would start showing as "Incomplete" badges/messages, consistent with the rest of the validation system built this session.
- **Documentation would change:** Minor — `docs/PROJECT_WORKFLOW.md`'s validator description could note the expanded field coverage.
- **Cross-reference:** Not previously documented. `projectValidator.ts`'s own code comment already flags "a field the schema doesn't cover yet, such as joistSpacing/floorCover" as a known gap in the *fallback* logic, but that fallback only fires for fields present in `ROOM_EMPTY_CHECKS`, and these two aren't — so the gap the comment describes is currently wider than the comment implies.

### H4. `mechVent_m3_per_h` has no effect outside UK/EU — confirmed, and paired with a latent double-conversion
- **Severity:** High
- **Description:** `physics.ts#ventilationLoss_W()`'s non-UK/EU branch (`return 0.33 * achOrN * V * dT;`) never references `settings.mechVent_m3_per_h` at all. This matches `IMPROVEMENTS.md` item 8, confirmed accurate. Separately (see M1), `normalizeProjectSettings()` double-converts this same field for US/CA_IMPERIAL — currently inert only because this finding means the value is discarded before the double conversion could matter.
- **Why it matters:** Same "Design Parameters" PDF accuracy concern as H1 — "Ventilation Rate" is printed as an assumption for every region, but only actually affects the number for UK/EU.
- **Affected files:** `src/utils/physics.ts` (`ventilationLoss_W`), `src/components/export/DesignParametersPage.tsx`.
- **Recommended fix (not implemented):** Same options as H1 — confirm whether this is intentional standards-driven scoping (business decision) and either wire it in or scope the UI/PDF page accordingly.
- **Calculations would change:** Only if wired in for non-UK/EU regions.
- **UI would change:** Only if scoped per-region.
- **Documentation would change:** Yes — `AGENTS.md` §1 doesn't currently mention this; `IMPROVEMENTS.md` #8 does, marked "may be intentional... confirm with the business" — still open.
- **Cross-reference:** Confirms `IMPROVEMENTS.md` #8; connects it to M1 below.

### H5. Legacy rooms missing `ceilingExposed`/`floorExposed` would be misclassified as "invalid" rather than "incomplete"
- **Severity:** High
- **Description:** `roomSchema.ts` declares `ceilingExposed: z.boolean()` and `floorExposed: z.boolean()` as **required** (no `.optional()`), while `RoomInput` in `projectTypes.ts` declares both as **optional** (`ceilingExposed?: boolean`). Every room created through the app's own factories always sets both to `false`, so this only affects rooms saved before these fields existed (or created via any other pathway). If such a room hits `roomSchema.safeParse()`, Zod reports a "Required" error for the missing field; `splitErrors()` has no `ROOM_EMPTY_CHECKS` entry for either field, so the room is classified **invalid** (red "Needs attention") rather than **incomplete** (amber) — an inaccurate signal for what is really just an old room predating the field.
- **Why it matters:** A contractor reopening an old saved project could see a room flagged as having a data error, when the real situation is a schema/type mismatch introduced when this field was added.
- **Affected files:** `src/validations.ts/roomSchema.ts`, `src/models/projectTypes.ts` (`RoomInput`).
- **Recommended fix (not implemented):** Either make the Zod fields `.optional()` to match the TS type (and rely on `?? false` at the physics-consumption site, which already handles `undefined` gracefully via the ternary), or add `ROOM_EMPTY_CHECKS` entries treating a missing value as "incomplete." The former is simpler and matches how the rest of the schema already treats genuinely-optional booleans.
- **Calculations would change:** No.
- **UI would change:** Only the validation badge classification for affected legacy rooms.
- **Documentation would change:** No.
- **Cross-reference:** Not previously documented; directly related to C2 above (same two fields).

---

## 3. Findings — Medium

### M1. Latent double-conversion for `mechVent_m3_per_h` and `customUOverrides.*` — currently masked by H4/C1, but a landmine for future fixes
- **Severity:** Medium
- **Description:** The same double-conversion pattern that actively breaks psi allowance (C3) exists structurally for `mechVent_m3_per_h` (`normalizeVentilation`, US/CA_IMPERIAL branch) and `customUOverrides.*` (`normalizeUValue`, same branch) inside `normalizeProjectSettings()`. Both are currently harmless *only* because the values they'd corrupt are separately never read by the calculation (H4, C1 respectively).
- **Why it matters:** If someone fixes H4 (wires `mechVent_m3_per_h` into non-UK/EU ventilation) or C1 (wires `customUOverrides` into `mergeUValues`) in isolation, without also knowing about this, they will silently reintroduce C3's exact bug for those fields.
- **Affected files:** `src/utils/normalizeProject.ts`, `src/utils/normalize.ts`.
- **Recommended fix (not implemented):** Should be fixed together with C3 — see C3's recommendation (`normalizeProjectSettings()` should stop re-converting fields already stored in SI). Flagging explicitly so it isn't rediscovered independently later.
- **Calculations would change:** Not on its own — only in combination with a future H4/C1 fix.
- **UI would change:** No.
- **Documentation would change:** Yes — should be captured in the same fix notes as C3 so it isn't missed.
- **Cross-reference:** New; directly connected to C3, H4, and C1.

### M2. In-slab water temperature bypasses `WATER_TABLE` and ignores floor covering entirely
- **Severity:** Medium
- **Description:** For `installMethod === "INSLAB"`, `calculateRoom()` hardcodes `waterTemp_C` to one of exactly two values (`(100-32)*5/9` ≈ 37.8°C or `(120-32)*5/9` ≈ 48.9°C) based on `determineMode()`, completely bypassing `interpWaterC()`/`WATER_TABLE`. The floor-covering R-value adjustment (`waterTemp_C += Math.min(12, 25*floorR)`) only runs in the `else` (non-INSLAB) branch — it never applies to in-slab rooms.
- **Why it matters:** `Floor Cover` remains a required, editable field in the UI for in-slab rooms (not hidden/disabled based on install method), and is displayed on the Room Details/PDF pages — but for those rooms it has **zero effect** on the calculated water temperature, with no indication to the user. This is architecturally intentional (per `AGENTS.md` §1, already flagged as a known risk) but the floor-cover-specific silent no-op for INSLAB specifically had not been called out before.
- **Affected files:** `src/utils/physics.ts` (`calculateRoom`'s INSLAB branch), `src/components/rooms/RoomCard.tsx` (Floor Cover field, shown unconditionally).
- **Recommended fix (not implemented):** If intentional (manufacturer spec for in-slab systems doesn't vary by floor covering), consider disabling/hiding the Floor Cover field for INSLAB rooms, or adding a note explaining it doesn't affect in-slab water temperature. If not intentional, extend the floor-covering adjustment to the INSLAB branch — a `physics.ts` change requiring approval.
- **Calculations would change:** Only if the business decides the INSLAB branch should honor floor covering.
- **UI would change:** Only if the field is hidden/annotated for INSLAB.
- **Documentation would change:** Yes — `docs/CALCULATIONS.md`'s in-slab section should state this explicitly.
- **Cross-reference:** The hardcoded-temperature half of this is already in `AGENTS.md` §1; the floor-covering-ignored half is new.

### M3. Duplicate conversion-factor constants across `normalize.ts`/`display.ts`/`conversions.ts`
- **Severity:** Medium
- **Description:** `U_IMPERIAL_TO_METRIC`, `PSI_BTUHR_F_TO_WK`/`PSI_WK_TO_BTUHR_F`, and the CFM↔m³/h factors (`CFM_TO_M3_PER_H` in `normalize.ts` vs. `CFM_TO_M3H`/`M3H_TO_CFM` in `display.ts`) are each independently redefined as local constants in two files rather than sourced once from `conversions.ts`. All are numerically consistent today (verified), but nothing enforces that.
- **Why it matters:** This is exactly the kind of split that let C3's double-conversion bug happen unnoticed — two files independently own "the" psi conversion factor and neither one's author had to reconcile with the other. A future factor correction (e.g. a more precise BTU/hr conversion) would need to be found and applied in multiple places by hand.
- **Affected files:** `src/utils/normalize.ts`, `src/utils/display.ts`, `src/utils/conversions.ts`.
- **Recommended fix (not implemented):** Consolidate shared factors into `conversions.ts` and import them into both `normalize.ts` and `display.ts`, without changing any of the numeric values (a structural, not numeric, change).
- **Calculations would change:** No, if done as a pure consolidation (same numbers, one source).
- **UI would change:** No.
- **Documentation would change:** Minor — `AGENTS.md` §3 could note the consolidation.
- **Cross-reference:** New; root-cause context for C3.

### M4. AGENTS.md's Zod-validation-disabled note is now stale
- **Severity:** Medium (documentation accuracy, not a code defect)
- **Description:** `AGENTS.md` §8 states "these schemas are currently not enforced... `handleSaveProject()`'s `projectSchema.parse()`/`roomSchema.parse()` calls are commented out." That description predates this session's Phase 1–3 work: `src/validations.ts/projectValidator.ts` now calls `projectSchema.safeParse()`/`roomSchema.safeParse()` (confirmed via `grep`), and `ProjectPage.tsx#handleSaveProject()` gates Publish on `validateProject(project).complete`, which internally uses these schemas. The schemas are enforced today, just via `safeParse()` + classification rather than a raw throwing `.parse()`.
- **Why it matters:** A future contributor trusting `AGENTS.md` could assume validation is absent and re-implement something that already exists, or miss that H3/H5 above are gaps in an *active* validator, not a dormant one.
- **Affected files:** `AGENTS.md` §8 only — no source change.
- **Recommended fix (not implemented):** Update `AGENTS.md` §8 to describe the current `projectValidator.ts`-based enforcement.
- **Calculations would change:** No.
- **UI would change:** No.
- **Documentation would change:** Yes — this finding *is* a documentation fix.
- **Cross-reference:** Corrects `AGENTS.md` §8.

### M5. `ultraSpacingLocked.ts` is a protected/locked file with zero live importers
- **Severity:** Medium
- **Description:** `grep -rn ultraSpacingLocked src/` returns only the file's own header comment — nothing in the codebase imports from it. `BUSINESS_RULES.md`/`AGENTS.md` both flag it as "must be changed together with `ultraCalcLocked.ts`" (a live-code-risk framing), but it currently has no consumers at all.
- **Why it matters:** Not a live risk today, but the "protected, must stay in sync" framing could lead a future contributor to spend effort keeping a dead file in sync with `ultraCalcLocked.ts`'s real spacing table, or to hesitate before deleting genuinely dead code because it's marked locked.
- **Affected files:** `src/utils/ultraSpacingLocked.ts`.
- **Recommended fix (not implemented):** Confirm with the business whether this file is meant for a not-yet-wired-up future use, or is safe to delete. Do not delete unilaterally — it's explicitly named as protected.
- **Calculations would change:** No.
- **UI would change:** No.
- **Documentation would change:** Yes, once a decision is made — `BUSINESS_RULES.md`/`AGENTS.md` should note it's currently unused.
- **Cross-reference:** `AGENTS.md` §2 already notes the duplication; this audit adds that it's provably unreferenced.

---

## 4. Findings — Low

### L1. `normalizeRoomInput()`, `normalizeLength()`, `normalizeArea()`, `normalizeTemperature()` are entirely dead code
- **Severity:** Low
- **Description:** `normalizeRoomInput()` (`normalizeRoom.ts`) is `return room;` — a complete no-op — and is never called anywhere (`grep` confirms zero call sites outside its own definition). Its imports (`normalizeLength`, `normalizeArea`, `normalizeTemperature` from `normalize.ts`) are consequently also unused; `grep` confirms `normalizeLength`/`normalizeArea` have no other callers either, and `normalizeTemperature`'s only other "caller" is `normalizeProjectSettings()`'s comment-explained deliberate non-call. Room dimension conversion actually happens once, correctly, at the `RoomCard.tsx` input boundary via `display.ts`'s `fromDisplayLength`/`fromDisplayArea`.
- **Why it matters:** No live risk — but a future reader (including a past version of this same audit process, per `CLAUDE.md`'s own §12 assumption note) could reasonably assume these functions are load-bearing and waste time reasoning about them, or worse, "fix" `normalizeRoomInput()` to actually normalize, unknowingly introducing a double-conversion identical to C3's, since room values are already converted once at the input boundary.
- **Affected files:** `src/utils/normalizeRoom.ts`, `src/utils/normalize.ts` (`normalizeLength`, `normalizeArea`, `normalizeTemperature`).
- **Recommended fix (not implemented):** Either wire `normalizeRoomInput()` into the room-update pathway (redundant given the input boundary already handles it — not recommended) or remove the dead functions/file. Purely a cleanup decision, not a defect fix.
- **Calculations would change:** No.
- **UI would change:** No.
- **Documentation would change:** Yes — `AGENTS.md` §3 already flags `normalizeRoomInput` as a no-op; could add the three specific dead `normalize.ts` functions.
- **Cross-reference:** Extends existing `AGENTS.md` §3 note with the three specific dead functions.

### L2. `waterTempRange_C` is named as a range but is only the maximum
- **Severity:** Low
- **Description:** `useProjectSummary.ts` computes `waterTempRange_C` from `maxWaterTemp_C` only — a single value, not a min–max pair — despite the name.
- **Why it matters:** Misleading name; already documented.
- **Affected files:** `src/hooks/useProjectSummary.ts`, `src/models/projectTypes.ts` (`ProjectSummary.waterTempRange_C`).
- **Recommended fix (not implemented):** Rename to `maxWaterTemp_C`/`requiredWaterTemp_C` (a naming change with type/prop cascade — not a calculation change) or genuinely compute a min–max range if that's the desired UX. Business/product decision.
- **Calculations would change:** No.
- **UI would change:** Only the label wording, if changed.
- **Documentation would change:** Minor.
- **Cross-reference:** Already documented in `AGENTS.md` §6; re-confirmed accurate, unchanged since.

### L3. `MAX_LOOP_M = 90` (presets.ts) is unused; `calcLoops()` uses `MAX_LOOP_FT = 300` exclusively
- **Severity:** Low
- **Description:** Confirmed via read of `ultraCalcLocked.ts#calcLoops()` — it only ever divides by `MAX_LOOP_FT`. `presets.ts#MAX_LOOP_M` has no callers.
- **Why it matters:** Already documented as a known, deliberately-untouched discrepancy in `BUSINESS_RULES.md`; re-confirmed still accurate.
- **Affected files:** `src/models/presets.ts`, `src/utils/ultraCalcLocked.ts`.
- **Recommended fix (not implemented):** Per `BUSINESS_RULES.md`, do not reconcile without confirming with the manufacturer-data owner which number is authoritative.
- **Calculations would change:** No change recommended without business confirmation.
- **UI would change:** No.
- **Documentation would change:** No — already correctly documented.
- **Cross-reference:** `BUSINESS_RULES.md` §3 item 7 — no new information, re-verified only.

### L4. `tubing_ft`/`tubing_m` are rounded up independently rather than one derived from the other
- **Severity:** Low
- **Description:** `ultraCalcLocked.ts#ultraCalc()` computes `tubing_ft = ceil(a.ft2 * tubingFactor)` and `tubing_m = ceil(a.m2 * tubingFactor * 3.28084)` as two independent formulas (mathematically equivalent before rounding — verified algebraically: `a.m2 = a.ft2 / 10.7639`, and `3.28084/10.7639 ≈ 0.3048`, so the two pre-`ceil` values are identical). Each is separately rounded up, so in principle they could diverge by a fractional unit right at a rounding boundary.
- **Why it matters:** Purely theoretical today — no observed divergence in the traced formulas, and any difference would be at most a fraction of a foot/meter. Flagging per the audit's explicit conversion-audit scope, not because it's an active problem.
- **Affected files:** `src/utils/ultraCalcLocked.ts` (`ultraCalc`).
- **Recommended fix (not implemented):** None recommended — this is a locked file and the discrepancy is not observable in practice. Noted for completeness only.
- **Calculations would change:** N/A — no fix recommended.
- **UI would change:** No.
- **Documentation would change:** No.
- **Cross-reference:** New, informational only.

### L5. `getUIUnits()` has no `default` case in its region `switch`
- **Severity:** Low
- **Description:** `helpers/updateUiLabels.ts#getUIUnits()` uses a `switch (region)` with cases for all 5 current `Region` values and no `default`. Currently safe (exhaustive for today's `Region` union) but would return `undefined` and crash any caller (`uiUnits.length`, etc.) if the union were ever extended without updating this function.
- **Why it matters:** Robustness/fragility note, not a live bug.
- **Affected files:** `src/helpers/updateUiLabels.ts`.
- **Recommended fix (not implemented):** Add a `default` case or a compile-time exhaustiveness check (`const _exhaustive: never = region`). Purely defensive, no behavior change for current regions.
- **Calculations would change:** No.
- **UI would change:** No.
- **Documentation would change:** No.
- **Cross-reference:** New, informational only.

### L6. Glazing type is project-wide, with no per-room override, despite window area being per-room
- **Severity:** Low (informational — requested explicitly by audit scope item 1)
- **Description:** `project.glazing` (single/double/triple) is a project-level setting; `getWindowUFromGlazing()` applies it uniformly to every room's window U-value via `mergeUValues(settings)`, which receives project `settings`, not per-room data. `windowArea_m2` is per-room, but the U-value multiplying that area is not.
- **Why it matters:** Not necessarily a bug — may be an intentional simplification — but worth surfacing explicitly since a project with genuinely mixed glazing across rooms (e.g. a renovated addition vs. original windows) can't reflect that today.
- **Affected files:** `src/utils/physics.ts` (`getWindowUFromGlazing`, `mergeUValues`), `src/models/projectTypes.ts` (`ProjectSettings.glazing`, project-level only).
- **Recommended fix (not implemented):** Product decision — whether to add a per-room glazing override. Not recommending a specific direction.
- **Calculations would change:** Only if a per-room override is added.
- **UI would change:** Only if added.
- **Documentation would change:** Yes, to state this is deliberate if confirmed.
- **Cross-reference:** New, informational only — directly answers audit scope item 1's explicit "Glazing" example.

---

## 5. Category 2 — Region consistency matrix

| Region | Input display units (`getUIUnits`/`display.ts`) | Result display units (`formatRoomResults`/`formatProjectSummary`/`formatResults`) | Safety/Heat-up Factor applied? | Mechanical Ventilation applied? | Psi allowance double-converted? | Consistent end-to-end? |
|---|---|---|---|---|---|---|
| UK | Metric | Metric | Yes | Yes | No (default/no-op branch) | **Yes** |
| EU | Metric | Metric | Yes | Yes | No (default/no-op branch) | **Yes** |
| US | Imperial | Imperial | **No** (H1) | **No** (H4) | **Yes — halved** (C3) | Display units consistent; calculation inputs compromised (H1, H4, C3) |
| CA_IMPERIAL | Imperial | Imperial | **No** (H1) | **No** (H4) | **Yes — halved** (C3) | Display units consistent; calculation inputs compromised (H1, H4, C3) |
| CA_METRIC | Metric | **Imperial** (3 of 4 result files) / Metric (1 of 4 — `waterTempRange_C`) | **No** (H1) | **No** (H4) | No (excluded from the double-conversion branch) | **No — display units mismatch within the same UI** (C4), plus H1/H4 |

Note: the material-sizing engine (`ultraCalcLocked.ts`) itself is region-agnostic — it always receives metric SI regardless of region (confirmed via `ultraCalcAdapter.ts`), so tube size/spacing *selection* is correct for all regions; only its *displayed* formatting and the heat-loss inputs above are affected.

---

## 6. Category 1 — full inputs-vs-calculations field matrix

| Field | Editable | Stored as | Used by calculation? | Consistency finding |
|---|---|---|---|---|
| Region | Yes | Enum | Pervasively (`physics.ts`, `ultraCalcAdapter` region-agnostic, display/format layers) | C4 (result display split for CA_METRIC) |
| Standards | Yes | Enum | Effectively no observable effect (H2) | H2 |
| Indoor Temperature | Yes | SI °C | `dT` in every heat-loss term | Consistent (single conversion, PASS) |
| Outdoor Temperature | Yes | SI °C | `dT` in every heat-loss term | Consistent (single conversion, PASS) |
| Setpoint (room) | Yes | SI °C | Overrides indoor temp in `dT` if set | Consistent (PASS) |
| U-values (preset) | No (derived) | SI constants | `fabricLoss_W` via `mergeUValues` | Consistent (PASS) |
| Custom U-values | Yes | SI (converted once) | **Never read** | C1 |
| ACH / Infiltration | Yes | Unitless | **Never read** (preset ACH used instead) | H1 |
| Ventilation Rate | Yes | SI m³/h (converted once) | UK/EU only | H4, M1 |
| Psi Allowance | Yes | SI W/K (converted once) | All regions — but double-converted for US/CA_IMPERIAL | C3 |
| Safety Factor % | Yes | Raw % | UK/EU only | H1 |
| Heat-up Factor % | Yes | Raw % | UK/EU only | H1 |
| Floor on Ground (room) | Yes | Boolean | `groundLoss_W`, all regions | Consistent (PASS) |
| Ceiling Exposed (room) | **No UI exists** | Boolean, hardcoded `false` | `fabricLoss_W`'s `Qc` term | C2 |
| Floor Exposed (room) | **No UI exists** | Boolean, hardcoded `false` | `fabricLoss_W`'s `Qf` term | C2 |
| Window Area (room) | Yes | SI m² (converted once) | `fabricLoss_W` | Consistent (PASS) |
| Door Area (room) | Yes | SI m² (converted once) | `fabricLoss_W` | Consistent (PASS) |
| Glazing | Yes (project-level only) | Enum | Overrides window U-value unconditionally, all rooms uniformly | L6 |
| Floor Cover (room) | Yes | Enum | Water-temp adjustment, **non-INSLAB only**; not validated at all | H3, M2 |
| Install Method (room) | Yes | Enum, Zod-optional but validator-enforced | Pervasive (physics INSLAB branch, material selection, layout) | Consistent (silent default exists but is validator-guarded) |
| Joist Spacing (room) | Yes | Number (nominal inches) | Material selection, layout; **not validated at all** | H3 |
| Room dimensions (L/W/H/exterior wall) | Yes | SI meters (converted once) | `fabricLoss_W`, `roomVolume_m3`, area | Consistent (PASS) |

---

## 7. What was NOT found

For completeness, per the audit's own rigor standard — things explicitly checked and found consistent:
- Indoor/outdoor temperature and setpoint: single conversion at the input boundary, no double-conversion, no drift between live app and PDF.
- Room dimensions and window/door areas: same — single conversion, consistent everywhere checked (`RoomCard`, `RoomDetailsExport`, `RoomLayoutExport`, `MaterialsSummaryPage`).
- `floorOnGround`/ground-loss calculation: consistent across all regions, no unit issues (boolean, no conversion needed).
- The material-sizing engine (`ultraCalcLocked.ts`) itself: confirmed region-agnostic and internally consistent; the CA_METRIC bug (C4) and psi double-conversion (C3) are both display/normalization-layer defects, not defects in the locked material calculator itself.
- PDF export's use of calculation functions: confirmed the PDF pipeline calls the *same* `calculateRoom`/`runUltraCalc`/`formatRoomResults`/`formatProjectSummary` functions as the live app (no separate/forked PDF-only calculation logic exists) — meaning the PDF is faithful to whatever the live app computes, for better (no drift by design) or worse (it also inherits every defect above), with the one exception of C3's `RoomLayoutExport.tsx` normalization gap.

---

## 8. Summary table

| ID | Title | Severity | Calc change? | UI change? | Doc change? |
|---|---|---|---|---|---|
| C1 | Custom U-Values never read by calculation | Critical | Yes | No | Yes |
| C2 | Ceiling/floor exposed loss unreachable | Critical | Only if UI added | Yes (new field) | Yes |
| C3 | Psi allowance double-converted (US/CA_IMPERIAL) + PDF page mismatch | Critical | Yes | No | Yes |
| C4 | CA_METRIC results render imperial vs. metric inputs | Critical | No (display only) | Yes | Yes |
| H1 | ACH/Safety/Heat-up ignored for most regions | High | Only if wired in | Only if scoped | Yes |
| H2 | `standardsMode` has no observable effect | High | Only if business confirms | No | Yes |
| H3 | `joistSpacing`/`floorCover` unvalidated | High | No | Yes (validation badges) | Minor |
| H4 | `mechVent_m3_per_h` ignored outside UK/EU | High | Only if wired in | Only if scoped | Yes |
| H5 | Legacy rooms misclassified invalid vs incomplete | High | No | Badge classification only | No |
| M1 | Latent double-conversion (mechVent, customU) | Medium | Only combined with H4/C1 fix | No | Yes |
| M2 | In-slab ignores floor covering/water table | Medium | Only if business confirms | Only if field hidden | Yes |
| M3 | Duplicate conversion constants | Medium | No | No | Minor |
| M4 | AGENTS.md validation note is stale | Medium | No | No | Yes (this IS the fix) |
| M5 | `ultraSpacingLocked.ts` unused | Medium | No | No | Yes, once decided |
| L1 | Dead normalize functions | Low | No | No | Yes |
| L2 | `waterTempRange_C` misnamed | Low | No | Only wording | Minor |
| L3 | `MAX_LOOP_M` unused (already documented) | Low | No | No | No |
| L4 | Independent ft/m rounding | Low | No | No | No |
| L5 | `getUIUnits` no default case | Low | No | No | No |
| L6 | Glazing has no per-room override | Low | Only if added | Only if added | Yes |

---

**Nothing above has been fixed.** Waiting for direction on which findings to act on, and in what order.

# AUDIT_REPORT.md — Ultra-Calc Engineering Audit

**Scope:** Full-repository engineering audit, cross-referenced against [../CLAUDE.md](../CLAUDE.md), [../AGENTS.md](../AGENTS.md), [BUSINESS_RULES.md](BUSINESS_RULES.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CALCULATIONS.md](CALCULATIONS.md), [REGIONS.md](REGIONS.md), [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md), [COMPONENT_MAP.md](COMPONENT_MAP.md), [DATA_MODELS.md](DATA_MODELS.md), and [IMPROVEMENTS.md](IMPROVEMENTS.md).

**Nothing in this document has been implemented.** No application code, calculation, or formatting was changed while producing this audit — see the "Do NOT" constraints at the end of this file for what remains off-limits without explicit approval.

**Method:** every finding below is backed by a direct source read or a `grep`/`ls` check performed during this audit (not inferred from documentation alone). Where a finding could not be fully confirmed (e.g. requires running the app or inspecting live Firebase config), it is explicitly marked **Needs runtime verification**.

**Severity legend:**
- **Critical** — incorrect engineering output, data loss/security exposure, or a broken core feature.
- **High** — a real, triggerable bug or a significant, currently-live risk (perf, dead feature, missing safety net).
- **Medium** — a real inconsistency, inefficiency, or gap that degrades quality/maintainability but isn't user-blocking today.
- **Low** — cosmetic, cleanup, or purely cost-saving-later items.

---

## CRITICAL

### C1. Custom U-value overrides likely have no effect on the heat-loss calculation
- **Description:** `ProjectForm.tsx`'s "Custom U-Values" section reads/writes `project.customUOverrides` for wall/window/door/roof/floor. But `physics.ts#mergeUValues()` — the only place U-values are assembled before `calculateRoom()` runs — merges `GENERIC_PRESETS`/`UK_PRESETS` and the glazing-derived window U-value only; it never reads `settings.customUOverrides` or `settings.customU`.
- **Why it matters:** A contractor who enters a measured/custom U-value for a wall or window sees it saved and displayed, but the actual heat-loss number (`qFabric_W`, load density, water temperature, and every downstream material quantity) is silently computed from the *preset* insulation-period value instead. This directly affects the accuracy of the engineering deliverable used to size a real installation.
- **Suggested solution:** Trace whether `customUOverrides` was intended to override `mergeUValues()`'s output per-field. If so, add `U = {...U, ...compactObject(settings.customUOverrides)}` (skipping `undefined` entries) in `mergeUValues()`. **Do not implement without approval** — this is a change to `physics.ts`, a locked/business-critical file (see [BUSINESS_RULES.md](BUSINESS_RULES.md) §1).
- **Risk (of fixing):** Medium — changes real calculation output for any project that has ever used custom U-values; must be paired with a regression test using known reference values (see Testing section) before shipping.
- **Estimated effort:** S (the fix itself is a few lines; the verification and sign-off process is the larger cost).
- **Priority:** Immediate — confirm with the business owner whether this is a bug or a known limitation before doing anything else with `physics.ts`.

### C2. Likely double unit-conversion for `US`/`CA_IMPERIAL` ventilation, psi allowance, and custom U-values
- **Description:** `ProjectForm.tsx` converts entered display values (CFM, Btu/hr·°F, BTU/hr·ft²·°F) to metric SI via `fromDisplayVentilation`/`fromDisplayPsiAllowance`/`fromDisplayUValue` (`utils/display.ts`) **before** storing them on `project`. Separately, `normalizeProjectSettings()` (`utils/normalizeProject.ts`), called by `RoomCard.tsx` and `useProjectSummary.ts` immediately before every `calculateRoom()`, applies `normalizeVentilation`/`normalizePsiAllowance`/`normalizeUValue` (`utils/normalize.ts`) to the same three fields — which, for `US`/`CA_IMPERIAL`, convert **again** as if the stored value were still in the display unit.
- **Why it matters:** If this trace is correct, any `US`/`CA_IMPERIAL` project with a non-zero mechanical ventilation rate, psi allowance, or custom U-value gets that value converted twice (multiplied by the imperial→metric factor squared) before it reaches the physics engine — inflating ventilation loss, thermal-bridging loss, and (combined with C1) potentially fabric loss. This produces an oversized or undersized heating recommendation for real installations in imperial regions.
- **Suggested solution:** Reproduce first: create a `US` project, enter a known mechanical ventilation rate (e.g. 50 CFM), and hand-calculate the expected `qVent_W` against the value actually used inside `calculateRoom()` (add a temporary `console.log` in a throwaway branch, or step through in a debugger — do not edit `physics.ts` itself for this check). If confirmed, the likely correct fix is to make `normalizeProjectSettings()` a no-op passthrough for fields that `ProjectForm.tsx` already stores in SI (mirroring what it already does for `indoorTempC`/`outdoorTempC`), rather than removing the display-conversion layer.
- **Risk (of fixing):** Medium-High — touches the normalization pipeline used by every room's calculation; must be regression-tested across all five regions before shipping, since a wrong fix could break the (currently correct) UK/EU/metric path instead.
- **Estimated effort:** M (reproduction + fix + regression check across 5 regions × 2 install-method families).
- **Priority:** Immediate — this is a live engineering-correctness risk for every US/CA_IMPERIAL customer who has touched Advanced Defaults.

### C3. `html2canvas` is an undeclared dependency — PDF export can fail on a clean install
- **Status: Completed (2026-07-07).** Added `"html2canvas": "^1.4.1"` to `package.json` `dependencies` and synced `package-lock.json` via `npm install --package-lock-only`. Verified: no packages added/removed, no version changes anywhere in the dependency tree; the only change to `html2canvas`'s own lockfile entry is `"optional": true` being removed, correctly reflecting its new status as a direct dependency instead of an incidental transitive/optional one. No application source code was touched.
- **Description:** `src/utils/pdfExport.ts` does `import html2canvas from "html2canvas"`. Verified via `grep`: `html2canvas` does **not** appear anywhere in `package.json`'s `dependencies`/`devDependencies`. It is present in `package-lock.json` only as an **optionalDependency of `jspdf`** (`node_modules/jspdf`'s manifest lists `"html2canvas": "^1.0.0-rc.5"` under `optionalDependencies`). It happens to be physically present in the current `node_modules/` because npm hoisted jsPDF's optional dependency to the top level.
- **Why it matters:** PDF export — one of the app's core deliverables — depends on a package that isn't declared as a direct dependency anywhere. Because it's an *optional* dependency of a dependency, it can silently fail to install (npm skips optional deps that fail to build on a given platform), be omitted entirely (`npm ci --omit=optional`, certain CI configurations, pnpm's stricter non-hoisting default, Yarn PnP), or simply stop being bundled if a future `jspdf` version drops or changes that optional dependency. Any of these would break PDF export in production with a "Cannot find module" error traceable only by someone who already knows this hidden dependency exists.
- **Suggested solution:** Add `"html2canvas": "^1.4.1"` (the version currently resolved, per `package-lock.json`) directly to `package.json`'s `dependencies`. This is a manifest-only change — it does not alter any calculation or application behavior.
- **Risk (of fixing):** Very low — purely declarative; makes the existing implicit dependency explicit.
- **Estimated effort:** S.
- **Priority:** Immediate — trivial to fix, protects a core feature from an environment-dependent outage.

### C4. Firestore access control is enforced only by client-side query filters — no security rules found in this repo
- **Description:** Every read/write in `src/services/firebaseHelpers.ts` filters by `auth.currentUser?.uid` client-side (e.g. `where("userId","==",userId)`, or an equality check after `fetchProjectById`). No `firestore.rules` file (or any rules definition) exists anywhere in this repository checkout, and `firebase.json` (found during this audit at the repo root) does not reference a rules file at all.
- **Why it matters:** Client-side query filters are a UX convenience, **not** an access-control mechanism — Firestore's actual security boundary is enforced entirely by server-side security rules configured in the Firebase project (which may or may not exist outside this repo checkout). If the live Firebase project has no rules (or overly permissive ones), any authenticated user could read/write any other user's `projects` or `users` documents directly via the Firestore SDK/REST API by simply omitting the `where` clause the client app happens to apply — the app has no way to prevent this from outside the client. **Needs runtime verification**: check the Firebase Console → Firestore → Rules tab for the live project, since this cannot be confirmed from the repository alone.
- **Suggested solution:** Add a `firestore.rules` file to the repo (checked into version control, referenced from `firebase.json`) enforcing e.g. `allow read, write: if request.auth.uid == resource.data.userId` on `projects`, and equivalent per-user restriction on `users`. This is additive (new file + one `firebase.json` line) and does not touch any application code path audited above.
- **Risk (of fixing):** Low to add rules; but tightening previously-open rules could break any tooling/script that relied on open access — verify current rule state before changing.
- **Estimated effort:** S–M (writing and testing rules, ideally with the Firestore emulator).
- **Priority:** Immediate — verify the live project's rule configuration first; if rules are indeed absent, this is a live data-exposure risk, not just a documentation gap.

### C5. Editing any single field in any room recomputes heat-loss and material calculations for every room in the project
- **Description:** `ProjectPage.tsx#updateRoom()` replaces the entire `rooms` array on every field edit: `project.rooms.map(r => r.name === roomName ? {...r, ...patch} : r)`, then `setProject({...project, rooms: updatedRooms})` — producing a brand-new `project` object reference on **every keystroke in any field of any room**. `RoomCard.tsx` computes `normalizedProject = useMemo(() => normalizeProjectSettings(project), [project])`, then `res = useMemo(() => calculateRoom(room, normalizedProject), [room, normalizedProject])`, then `ultra = useMemo(() => runUltraCalc(room, res, project), [room, res, project])`. Because `useMemo`'s dependency comparison is by reference (`Object.is`), **every** `RoomCard` instance in the project — not just the one being edited — sees a new `project`/`normalizedProject` reference and recomputes `calculateRoom()` + `runUltraCalc()`, even though only one room's data actually changed. The same pattern independently re-triggers inside `useProjectSummary()`, which recomputes every room again for the Summary tab.
- **Why it matters:** For a project with many rooms, typing a single character into any one room's Name/Length/Setpoint/etc. field re-runs the full physics + material-sizing calculation for **every other room** in the project on every keystroke, in addition to the summary hook doing the same. This is wasted CPU work today (the calculations are cheap, not async, so it may not be visibly janky yet on small projects) but scales linearly with room count per keystroke — a project with 20–30 rooms could show real input lag. It's also a symptom of a state-shape issue (whole-project immutable replace) that will make future optimization (e.g. `React.memo`) ineffective without a deeper fix.
- **Suggested solution:** Options, in order of increasing effort: (a) memoize each room's own settings-derived inputs more narrowly — e.g. have `RoomCard` depend on only the specific `ProjectSettings` fields it actually uses (region, temps, factors, U-values) via a shallow-compared derived object, not the whole `project`/`rooms` reference; (b) lift each room's computed `RoomResults`/`UltraCalcOutput` into a single computed-once-per-room cache in the parent, keyed by room id, and pass the specific result down instead of recomputing per-render; (c) wrap `RoomCard` in `React.memo` with a custom comparator once (a) or (b) is in place. This is a calculation-flow/performance refactor, not a calculation-logic change — no formula output changes, only *when* it's computed.
- **Risk (of fixing):** Medium — touches the core render/memoization structure of the most-used component (`RoomCard`) and the summary hook; needs careful before/after verification that every room's displayed numbers are unchanged.
- **Estimated effort:** M–L depending on which option is chosen.
- **Priority:** Immediate to diagnose (cheap to confirm with the React DevTools Profiler on a many-room test project); fix can be scheduled once confirmed to matter at realistic room counts.

---

## HIGH

### H1. Room identity is `room.name`, not `room.id`, throughout the update/remove path
- **Description:** `RoomInput.id` exists (generated by `uid()`) and every callback signature (`onUpdateRoom(id: string, patch)`, `onRemoveRoom(id: string)`) is typed around it, but `RoomCard.tsx` calls these functions with `room.name` at every single call site (confirmed: `onUpdateRoom(room.name, {...})` appears at all ~10 field handlers, plus `onRemoveRoom(room.name)`). `ProjectPage.tsx`'s actual `updateRoom`/`removeRoom` implementations match `r.name === roomName`, so this "works" only because both sides consistently (if incorrectly) use the name.
- **Why it matters:** Two rooms with the same name (e.g. two rooms both left at the default "Room 1" before renaming, or a contractor copying a name from another room) will have every edit target both/either room ambiguously via `.map`, causing silent cross-contamination of one room's data into another.
- **Suggested solution:** Switch every call site in `RoomCard.tsx` to pass `room.id`, and switch `ProjectPage.tsx`'s (and, once H2/dead-code is resolved, `HomePage.tsx`'s) matching logic to `r.id === id` consistently. This is a multi-file, coordinated fix — do not change one side without the other.
- **Risk (of fixing):** Low functionally (matching by `id` is strictly more correct), but requires touching every call site in one coordinated change to avoid a half-migrated, worse-than-before state.
- **Estimated effort:** S.
- **Priority:** Next sprint — not urgent today (duplicate room names are an edge case) but a real data-integrity landmine worth closing deliberately.

### H2. `HomePage.tsx`'s inline project-editing feature is entirely dead, unreachable code
- **Description:** `HomePage.tsx` reads `useParams<{id: string}>()` and only activates its `activeProject`/`ProjectEditor` branch when `params.id` is truthy. But the route registered for `HomePage` in `AppRoutes.tsx` is exactly `"/dashboard"` — **no `:id` path segment exists on that route**. Confirmed via `grep`: nothing in the codebase ever navigates to `/dashboard/<something>` (every navigation to the dashboard uses the bare `/dashboard` path; opening a project always navigates to `/project/:id` instead, handled by `ProjectPage`). Therefore `params.id` is always `undefined`, `activeProject` is always `null`, and the ~70 lines of `updateProject`/`updateRoom`/`removeRoom`/`<ProjectEditor>` code in `HomePage.tsx` can never execute.
- **Why it matters:** This is a large block of code that looks fully functional (and even contains its own version of the `room.id`-vs-`room.name` bug from H1, which happens to never manifest only because this code path never runs) but silently does nothing. Any future engineer reading `HomePage.tsx` will reasonably assume clicking a project card can open an inline editor on the dashboard — it cannot; `ProjectCard`'s `onClick` navigates to `/project/:id` instead, bypassing all of this code.
- **Suggested solution:** Either (a) remove the dead `activeProject`/`updateProject`/`updateRoom`/`removeRoom`/`useParams` code from `HomePage.tsx` entirely, since `ProjectPage` already owns real project editing, or (b) if inline dashboard editing was actually intended as a feature, add a `/dashboard/:id` route and wire `ProjectCard`'s `onClick` to it — but this would need the H1 fix applied first (since it would newly activate the room.name/id bug), and would create two parallel, subtly different "edit a project" UIs to maintain.
- **Risk (of fixing):** Low if removing (verified unreachable); higher if resurrecting the feature (needs H1 fixed first, plus UX decision on why two edit surfaces should exist).
- **Estimated effort:** S to remove; M–L to properly resurrect as a real feature.
- **Priority:** Next sprint — low urgency (doesn't affect any current user-facing behavior) but worth resolving to stop the dead code from misleading future work.

### H3. `CA_METRIC` is classified as imperial in summary/spacing display formatting
- **Description:** `formatProjectSummary.ts` and `formatResults.ts` (`formatSpacing`, `formatTubeSizing`) both check `region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC"` to decide imperial vs metric display. Every other region-aware file (`display.ts`, `normalize.ts`, `helpers/updateUiLabels.ts`) excludes `CA_METRIC` from that imperial branch.
- **Why it matters:** A `CA_METRIC` ("Canada — Metric U-values") project's Project Summary tab and each room's spacing/tube-size fields render in BTU/hr, feet, and inches, while every input field on the same project renders in W, meters, and millimeters. This is highly visible and will read as broken to any Canadian metric-region user.
- **Suggested solution:** Change the two boolean checks in `formatProjectSummary.ts` and `formatResults.ts` to exclude `CA_METRIC` (matching `display.ts`'s classification), ideally by introducing one shared `isImperialRegion(region)` helper (see M3) used by all format/conversion files instead of four independent inline copies of the same check.
- **Risk (of fixing):** Low — a narrow, well-scoped display fix; confirm with the business which classification is actually correct before changing (per [BUSINESS_RULES.md](BUSINESS_RULES.md) §4, don't fix silently).
- **Estimated effort:** S.
- **Priority:** Next sprint — high visibility, low complexity; good first fix once approved.

### H4. Zod validation is fully implemented but disabled
- **Description:** `ProjectPage.tsx#handleSaveProject()` has both `projectSchema.parse(project)` and the per-room `roomSchema.parse(room)` loop present in the source but **commented out**.
- **Why it matters:** Invalid data (missing region, non-numeric or out-of-range temperatures, etc.) can currently be autosaved to Firestore with no validation error surfaced to the user, even though complete, well-formed schemas already exist for this exact purpose.
- **Suggested solution:** Re-enable the two `parse()` calls, but first check whether any existing saved projects in production would now fail validation (a project created before certain required fields existed, for instance) — a validation error on save for a previously-fine project would be a regression from the user's perspective. Consider a soft rollout (log validation failures without blocking save, for one release) before hard-enforcing.
- **Risk (of fixing):** Medium — could newly block saves on existing production data that doesn't conform to the schema; needs a data audit or soft-launch first.
- **Estimated effort:** S for the code change; M for the safe rollout process.
- **Priority:** Next sprint — plan the rollout, don't just flip it on.

### H5. No automated tests exist for the calculation engine
- **Status: Skipped — user has chosen not to add automated tests at this time.** (Decided 2026-07-06.) Finding kept for future reference; removed from the active roadmap below. Practical consequence: subsequent fixes to calculation logic (e.g. C1, C2) will be verified by manual hand-calculation instead of an automated regression baseline — call this out explicitly at verification time for each such fix.
- **Description:** `package.json` has only `dev`/`build`/`preview` scripts; no test runner, test files, or CI configuration were found anywhere in the repository.
- **Why it matters:** `physics.ts`, `ultraCalcLocked.ts`, and `interpWaterC()` are explicitly business-critical (per [BUSINESS_RULES.md](BUSINESS_RULES.md)) and directly drive real purchasing/installation decisions, yet there is currently no automated way to detect a regression in any of them. Every finding in this report that touches calculation logic (C1, C2) can currently only be verified by hand-calculation — there is no safety net.
- **Suggested solution:** See the dedicated Testing section below for specific test suggestions. At minimum, add a test runner (e.g. Vitest, since the project already uses Vite) and golden-value regression tests for `calculateRoom()`, `ultraCalc()`, and `interpWaterC()` using known-good reference inputs/outputs, before making any change to C1/C2.
- **Risk (of fixing):** None — purely additive.
- **Estimated effort:** M to stand up the test infra + first golden tests; ongoing S per additional test.
- **Priority:** N/A — removed from active roadmap per user decision. Revisit only if the user's position changes.

### H6. `saveProjectTodb()` mutates the passed-in `project` object directly
- **Description:** `firebaseHelpers.ts#saveProjectTodb(project, showMessage)` does `project.userId = userId;` and, for new projects, `project.id = uid();` — directly mutating the object reference it was given, which is the exact same object held in `ProjectPage.tsx`'s React state (not a copy).
- **Why it matters:** This violates the codebase's own established convention (state is always updated via `{...project, patch}` spreads — see [../CLAUDE.md](../CLAUDE.md) §5/§7) and bypasses React's render cycle: the mutation happens without a corresponding `setProject()` call, so the component doesn't necessarily re-render to reflect the newly-assigned `id`/`userId`, and any `useMemo` elsewhere keyed on the `project` reference won't recompute even though its contents just changed in place. It happens to be low-impact today only because `id`/`userId` aren't read by any calculation, but it's a landmine for the next person who adds a field that *is* calculation-relevant to this function.
- **Suggested solution:** Change `saveProjectTodb` to build and return a new object (`{...project, userId, id: project.id ?? uid()}`) rather than mutating its argument, and have `ProjectPage.tsx` call `setProject()` with the result if it needs the assigned `id` reflected in state (it currently gets the id from the function's return value already, so this is a low-risk, localized change).
- **Risk (of fixing):** Low — the function's return value is already the primary way callers get the new id; this just stops the side-channel mutation.
- **Estimated effort:** S.
- **Priority:** Next sprint.

### H7. Broken `/logo.png` reference in the PDF export header and `ProjectExportView.tsx`
- **Description:** `ProjectPage.tsx:348` and `ProjectExportView.tsx:34` reference `/logo.png` directly. Confirmed via `ls public/`: no `logo.png` exists at the public root — only `public/assets/diagrams/logo.PNG` and `logo_square.PNG` exist (different path, different case).
- **Why it matters:** The PDF export's cover/header page (a customer-facing deliverable) likely renders a broken image where the company logo should be.
- **Suggested solution:** Point both references at `/assets/diagrams/logo.PNG` (matching the working pattern already used elsewhere in the same files via `loadImageAsBase64("/assets/diagrams/logo.PNG")`), or add the missing `public/logo.png` file if a different asset was actually intended. Confirm visually (render a PDF export) before and after.
- **Risk (of fixing):** Very low.
- **Estimated effort:** S.
- **Priority:** Immediate — trivial, visible, customer-facing.

### H8. No code-splitting/lazy-loading — large libraries load on initial page view
- **Description:** `AppRoutes.tsx` imports every page (`HomePage`, `ProjectPage`, `ProfilePage`, auth pages) eagerly at the top of the module, and `ProjectPage.tsx` imports `pdfExport.ts` (which pulls in `jspdf` + `html2canvas`, both sizeable libraries) unconditionally, even though PDF export is an action the user may never trigger in a given session.
- **Why it matters:** Every user pays the download/parse cost of `jspdf`+`html2canvas`+`jspdf-autotable` on first load of `ProjectPage`, regardless of whether they ever click "Export PDF," on top of MUI + Emotion + react-phone-input-2 + Firebase all being eagerly bundled together. This inflates initial load time, particularly relevant for the Capacitor/Android build on potentially slower mobile connections.
- **Suggested solution:** Convert route-level imports in `AppRoutes.tsx` to `React.lazy()` + `<Suspense>`, and dynamically `import("../utils/pdfExport")` inside `handleExportPDF()` only when the user actually clicks Export, rather than importing it at module scope.
- **Risk (of fixing):** Low — standard, well-understood React pattern; verify Suspense fallback UX and that Capacitor's build handles dynamic imports correctly (should be fine, but worth a build-and-run check on Android).
- **Estimated effort:** M (route splitting is quick; verifying no regressions across every route/build target takes longer).
- **Priority:** Backlog — real but not urgent; good candidate once a performance budget becomes a stated priority.

### H9. Stray `public/index.html` is unrelated Firebase Hosting boilerplate that could silently clobber the real build output
- **Description:** The actual Vite entry point is the **root** `index.html` (correct: has `<div id="root">`, `<script type="module" src="/src/main.tsx">`, proper viewport meta). A second, unrelated `public/index.html` also exists — the default "Welcome to Firebase Hosting" placeholder template generated by `firebase init hosting`, complete with `/__/firebase/*-compat.js` script tags for the legacy compat SDK the app doesn't use.
- **Why it matters:** Vite copies everything under `public/` into the build output directory (`dist/`) alongside its own processed HTML entry point, which also writes to `dist/index.html`. In the currently-committed `dist/` build artifact, the *real* app HTML won (evidence: `dist/index.html` in this checkout is the correct, built app page) — but this depends on Vite's asset-copy-vs-HTML-build ordering behavior, which is not a contract this repo has ever verified or tested for. A future Vite version, plugin, or build-order change could silently replace the deployed app with the Firebase placeholder page, with no build error to catch it.
- **Suggested solution:** Delete `public/index.html` — it serves no purpose (the app doesn't use the Firebase compat SDK it references; the modular SDK is used directly in `src/firebase/index.ts`). This is a pure deletion with no behavior dependency.
- **Risk (of fixing):** Very low.
- **Estimated effort:** S.
- **Priority:** Immediate — trivial removal that closes a silent, hard-to-diagnose production-outage risk.

---

## MEDIUM

### M1. Duplicated fin/tubing spacing tables must be kept in sync manually
- **Description:** `ULTRA_FIN_SPACING_MM`/`TUBING_SPACING_MM` are defined with identical values independently in both `ultraCalcLocked.ts` and `ultraSpacingLocked.ts`.
- **Why it matters:** A future manufacturer-data update applied to one file and not the other would silently desync the spacing numbers shown in different parts of the UI.
- **Suggested solution:** Have `ultraSpacingLocked.ts` import and re-export the table from `ultraCalcLocked.ts` (or vice versa) instead of maintaining two literal copies — this is a structural dedup, not a value change, so it doesn't touch any locked business data.
- **Risk:** Low, but is itself a change to two "LOCKED" files — get explicit approval per [BUSINESS_RULES.md](BUSINESS_RULES.md) §1 even though no numbers change.
- **Estimated effort:** S.
- **Priority:** Next sprint.

### M2. Confirmed dead code and unused types (consolidated inventory)
- **Description:** The following are confirmed (via `grep`, no importers found) unused: `src/layout/FloorLayout.tsx` (dead, name-colliding `FloorLayoutSvg`), `src/layout/layoutModel.ts` (`LayoutTile`/`FloorLayout` types), `src/helpers/updateRoomModel.ts` (+ `RichRoom`/`Side` types in `projectTypes.ts`), `MaterialResults`/`CalcOutput` types in `projectTypes.ts`, `MAX_LOOP_M`/`SPACING_TABLE` in `presets.ts`, `src/components/layout/LayoutSVG.tsx` (imported by `RoomCard.tsx` but never rendered), `src/components/export/ProjectExportView.tsx`, `src/components/rooms/MaterialsCard.tsx`, `airChangeRate_per_h`/`customU` fields on `ProjectSettings`, and the unused `appliedDefaults` prop on `ProjectForm`.
- **Why it matters:** Each is individually low-risk, but collectively they make the codebase harder to navigate — a new engineer (or an AI assistant) reading `projectTypes.ts` or `src/layout/` cannot tell at a glance which of several similarly-named things is the real one (this exact confusion is what produced the `FloorLayoutSvg` naming collision).
- **Suggested solution:** Remove each after one more confirmation pass (a second `grep` immediately before deletion, in case something changed since this audit). Do in small, individually-reviewable commits, not one large sweep.
- **Risk:** Low per item; batch carefully to avoid an unreviewable mega-diff.
- **Estimated effort:** S per item, M in aggregate.
- **Priority:** Backlog.

### M3. Region-imperial classification logic is duplicated across at least 4 files
- **Description:** The "is this region imperial?" boolean check is independently re-implemented in `formatProjectSummary.ts`, `formatResults.ts`, `display.ts`, `normalize.ts`, and inline in components (`uiUnits.length === "ft"`).
- **Why it matters:** This exact duplication is the root cause of H3 (`CA_METRIC` bug) — any future region addition or reclassification has to be applied correctly in every one of these places, with no compiler or test to catch a missed spot.
- **Suggested solution:** Introduce one shared `isImperialRegion(region: Region): boolean` helper (e.g. in `conversions.ts` or a new `regionUtils.ts`), and migrate each of the files above to use it. This is a refactor of *how* the same decision is made, not a change to *what* the decision is for any currently-correct file — except H3, which this would fix as a side effect once the shared helper is authoritative.
- **Risk:** Low-Medium — touches several files; do alongside the H3 fix, with the shared helper's behavior matching `display.ts` (the currently-majority-correct classification).
- **Estimated effort:** M.
- **Priority:** Next sprint, bundled with H3.

### M4. `useProjectSummary` recomputes every room independently of `RoomCard`'s own computation
- **Description:** Distinct from C5 (which is about *unnecessary* recomputation on unrelated edits), this is about *steady-state* duplication: even with zero unnecessary re-renders, the Summary tab's hook and each room's own card both call `calculateRoom`+`runUltraCalc` for every room, redoing the same math twice per room per render cycle.
- **Why it matters:** Not a correctness issue, but real wasted CPU for larger projects, and a maintenance hazard (two independent call sites must both be updated if either function's contract changes).
- **Suggested solution:** Once C5's per-room result caching is in place, have `useProjectSummary` consume the same cached per-room results instead of recomputing them independently.
- **Risk:** Low once C5 is addressed; coupling the two fixes is more efficient than fixing twice.
- **Estimated effort:** S once C5's cache exists.
- **Priority:** Bundle with C5.

### M5. Sidebar/layout SVG assets are not cached across rooms with identical settings
- **Description:** `RoomCard.tsx`'s sidebar-asset effect (SVG → base64 → PNG conversion) re-runs independently for every room, even when many rooms in a project share the same `installMethod`/`joistSpacing` (a common real-world case — most rooms in a house often use the same install method).
- **Why it matters:** Redundant async image conversion work per room; adds up for larger projects and slightly delays the Layout Visualization section from appearing on each card.
- **Suggested solution:** Add a small in-memory cache (e.g. a `Map` keyed by `${installMethod}:${joistSpacing}:${exportMode}`) shared across `RoomCard` instances (module-level or via context) so identical asset conversions happen once per project render, not once per room.
- **Risk:** Low.
- **Estimated effort:** M.
- **Priority:** Backlog.

### M6. `project.id` stored in a new Firestore document doesn't match its own Firestore document ID
- **Description:** `saveProjectTodb()` sets `project.id = uid()` (a short random string) for a new project, then calls `addDoc()`, which lets Firestore assign its own auto-generated document ID — different from the `id` field just written inside the document. The function correctly returns `docRef.id` (used for navigation), and `fetchAllProjects()`/`fetchProjectById()` both overwrite the in-memory `id` with the real `doc.id` on every read — so the mismatch is invisible through the app's own read paths, but the raw Firestore document permanently stores an incorrect, unused `id` field.
- **Why it matters:** Confusing for anyone querying Firestore directly (console, Cloud Functions, a future backend, a data migration script) — the stored `id` field looks authoritative but isn't.
- **Suggested solution:** Don't pre-assign `project.id` before `addDoc()`; instead, after `addDoc()` returns, either omit the `id` field from the stored document entirely (since callers already re-derive it from `doc.id` on read) or immediately `setDoc(docRef, {id: docRef.id}, {merge: true})` to make the stored field match reality.
- **Risk:** Low — purely additive/corrective, doesn't change any read path behavior (which already ignores the stored field).
- **Estimated effort:** S.
- **Priority:** Backlog.

### M7. Accessibility gaps in dialogs and icon-only controls
- **Description:** `ConfirmDialog.tsx` has no `role="dialog"`/`aria-modal="true"`, no focus trap, no Escape-to-close handler, and doesn't move focus to itself (or the cancel button) on open. `Header.tsx`'s home-icon button and avatar/menu-toggle button have no `aria-label` (the home button has a `title` attribute, which is not a reliable substitute for screen-reader labeling on all browsers).
- **Why it matters:** Keyboard-only and screen-reader users cannot reliably discover or dismiss the delete-confirmation dialog, and icon-only buttons are unlabeled for assistive tech — real accessibility barriers for an installer using the app with any accessibility need.
- **Suggested solution:** Add `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (pointing at the title) to `ConfirmDialog`, trap focus within it while open, add an `onKeyDown` handler for Escape → `onCancel()`, and autofocus the Cancel button on mount. Add `aria-label` to the Header's icon-only buttons (e.g. `aria-label="Go to dashboard"`, `aria-label="Open profile menu"`).
- **Risk:** Very low — purely additive ARIA/focus-management attributes.
- **Estimated effort:** S.
- **Priority:** Backlog, unless accessibility compliance is a stated requirement, in which case Next sprint.

### M8. Layout Visualization section may overflow on narrow mobile screens
- **Description:** `RoomCard.tsx`'s non-export Layout Visualization block renders `<div className="flex flex-row items-start gap-4">` containing the floor-layout SVG and the `RightSidebar`, with no responsive breakpoint to stack them vertically on small screens (unlike the room-input grid above it, which does use `grid-cols-1 lg:grid-cols-2`).
- **Why it matters:** On a phone-width viewport (relevant since this app also ships as an Android/Capacitor app), a fixed `flex-row` with a `min-h-[320px]` SVG column plus a `flex-shrink-0` sidebar is likely to force horizontal scrolling or visually cramp the sidebar — a real installer using this on a job site on a phone would hit this.
- **Suggested solution:** Add a responsive class, e.g. `flex flex-col sm:flex-row`, so the layout diagram and sidebar stack vertically below a breakpoint instead of squeezing side-by-side.
- **Risk:** Very low — a Tailwind class change, easily visually verified.
- **Estimated effort:** S.
- **Priority:** Next sprint if mobile/Android usage is expected to be common; otherwise Backlog.

### M9. Region change silently discards manually-entered advanced settings
- **Description:** Changing the Region `<select>` in `ProjectForm.tsx` immediately overwrites `standardsMode`, `safetyFactorPct`, `heatUpFactorPct`, `psiAllowance_W_per_K`, `mechVent_m3_per_h`, `infiltrationACH`, and `customUOverrides` with the new region's defaults — with no confirmation prompt, even if the user had previously entered custom values for any of these.
- **Why it matters:** A contractor who has carefully tuned advanced settings and then changes Region (correcting a mis-click, or reusing a project as a template for a different country) loses all of that manual work instantly and silently. This is a real, plausible data-loss scenario in normal use, not just an edge case.
- **Suggested solution:** Before applying `REGION_DEFAULTS`, check whether any advanced field currently differs from its *previous* region's default; if so, show a confirmation dialog ("Changing region will reset your custom advanced settings to <newRegion>'s defaults. Continue?") before applying the patch.
- **Risk:** Low — purely a new UI confirmation step; does not change the underlying defaults-application logic itself.
- **Estimated effort:** M.
- **Priority:** Next sprint — meaningful UX/data-loss risk for real users.

### M10. No confirmation for removing a room (inconsistent with project deletion, which does confirm)
- **Description:** `ProjectPage.tsx` uses `<ConfirmDialog>` before deleting an entire project, but `RoomCard.tsx`'s "Remove room" button calls `onRemoveRoom(room.name)` directly with no confirmation step, despite being equally destructive (and, per H1, keyed by name rather than id).
- **Why it matters:** Inconsistent destructive-action UX; an accidental click permanently discards a room's data (dimensions, install method, custom settings) with no undo.
- **Suggested solution:** Reuse the existing `ConfirmDialog` component before calling `onRemoveRoom`, matching the project-deletion pattern already established in the same codebase.
- **Risk:** Very low — reuses an existing, already-approved UI pattern.
- **Estimated effort:** S.
- **Priority:** Next sprint.

### M11. `formatTubeSizing` hardcodes a 2-entry tube-size lookup
- **Description:** `formatTubeSizing()` in `formatResults.ts` hardcodes `{16: '1/2"', 20: '3/4"'}`. If `ultraCalcLocked.ts`'s `TubeSize` union ever gains a new value, this map silently falls back to a computed-inches string instead of the expected nominal imperial name, with no compiler error to flag the gap.
- **Why it matters:** A future manufacturer-approved tube size addition (a locked-file change requiring its own approval) could pass code review on `ultraCalcLocked.ts` while leaving this display file subtly wrong, since nothing connects the two.
- **Suggested solution:** Either derive the lookup from a single shared constant next to `TubeSize`'s definition (so adding a new tube size forces a compile-time update to the display map too), or add a fallback that's clearly flagged as unexpected (e.g. logs a warning) rather than silently computing a plausible-looking but unapproved label.
- **Risk:** Low.
- **Estimated effort:** S.
- **Priority:** Backlog (only matters if/when a new tube size is ever added).

### M12. `users` collection is queried by field instead of using the Auth UID as the document ID
- **Description:** `getUserById`/`updateUserById` both run `query(collection(db, "users"), where("userId", "==", userId))` and then operate on `.docs[0]`, rather than using `doc(db, "users", userId)` directly.
- **Why it matters:** An extra network round-trip per profile read/write, and a latent (if unlikely) ambiguity if more than one `users` document ever ends up with the same `userId` value (nothing in the schema/write path prevents this, since `registerAction()` uses `addDoc()` with an auto-generated doc ID rather than `setDoc(doc(db,"users",uid))`).
- **Suggested solution:** Migrate to `setDoc(doc(db, "users", uid), payload)` on registration and `getDoc(doc(db, "users", uid))`/`updateDoc(doc(db, "users", uid), data)` for reads/writes. This is a data-access-pattern change, not a business-logic change, but does require a one-time migration plan for existing `users` documents (which currently have random Firestore-assigned IDs).
- **Risk:** Medium — requires a data migration for existing users; get this reviewed before starting.
- **Estimated effort:** M.
- **Priority:** Backlog.

### M13. `waterTempRange_C` is named as a range but contains only the maximum value
- **Description:** `useProjectSummary.ts` computes `waterTempRange_C` as a single formatted string (`"${tempC}°C"`) derived from the **maximum** water temp among rooms — not an actual min–max range.
- **Why it matters:** The name suggests two bounds; anyone reading or extending this code (including a future AI session) is likely to misinterpret it, and the Summary UI's own copy ("Required Water Temperature") doesn't fully clarify that it's a max-only figure either.
- **Suggested solution:** Either rename the field to something like `maxWaterTemp_C`/`requiredWaterTemp_C` (a type/field rename — coordinate with anything reading `ProjectSummary.waterTempRange_C`), or actually compute and display a true min–max range if that's more useful to installers (a room-by-room spread of required water temps could be genuinely informative, e.g. to size a single manifold correctly).
- **Risk:** Low if renaming only; Medium if changing to a true range (changes what's displayed, needs product sign-off since it touches the Summary tab and PDF summary page).
- **Estimated effort:** S (rename) or M (true range).
- **Priority:** Backlog.

### M14. No `.env.example` and no committed lint/formatter configuration
- **Description:** `src/firebase/index.ts` requires six `VITE_FIREBASE_*` environment variables with no example/template file documenting them. No ESLint/Prettier config was found anywhere in the repo.
- **Why it matters:** A new engineer (or a fresh Claude Code session) has to reverse-engineer required env vars from source, and there's no automated check to catch things like the unused `LayoutSVG` import or leftover `console.log`s (see L2) before they're committed.
- **Suggested solution:** Add a `.env.example` with placeholder values for all six Firebase vars; add a minimal TypeScript-aware ESLint config (even just `no-unused-vars` + `react-hooks/exhaustive-deps` would have caught several findings in this report) and a Prettier config matching the codebase's existing style.
- **Risk:** None — purely additive tooling.
- **Estimated effort:** S–M.
- **Priority:** Backlog, but high leverage for DX (see Developer Experience section).

---

## LOW

### L1. Stale header comment in `physics.ts`
- **Description:** The file's top comment reads `// utils/calculateRoom.ts`, an old filename from before a rename to `physics.ts`.
- **Why it matters:** Purely cosmetic, but could mislead someone searching for a file by that comment.
- **Suggested solution:** Update the comment to `// utils/physics.ts`.
- **Risk:** None.
- **Estimated effort:** S.
- **Priority:** Opportunistic (fix alongside any other edit to this file, not on its own).

### L2. Leftover debug `console.log` statements
- **Description:** `RoomCard.tsx:108` (`"Building layout for room:"`) and `ProjectPage.tsx:175` (`"Saving project:"`) log on every layout build / every save.
- **Why it matters:** Console noise in production; no functional impact.
- **Suggested solution:** Remove both, or gate them behind a `DEV`/debug flag if they're still useful during development.
- **Risk:** None.
- **Estimated effort:** S.
- **Priority:** Opportunistic.

### L3. Placeholder Capacitor `appId`
- **Description:** `capacitor.config.ts` sets `appId: 'com.example.app'`.
- **Why it matters:** A real Android package ID is required before any Play Store submission; `com.example.app` is a scaffolding default.
- **Suggested solution:** Confirm the intended real package ID with the user/business before any release build.
- **Risk:** None to flag; risk is in shipping with the placeholder unnoticed.
- **Estimated effort:** S.
- **Priority:** Immediate *only if* an Android release is imminent; otherwise Opportunistic.

### L4. Custom Tailwind design tokens are barely used
- **Description:** `tailwind.config.js` defines `primary`/`secondary`/`accent` colors and an `18` spacing token, but the vast majority of the UI hardcodes literal Tailwind defaults (`slate-*`, `blue-*`) or raw hex values in `sx`/className strings instead of these tokens.
- **Why it matters:** Makes future re-theming/rebranding harder than it should be — colors are scattered as literals rather than centralized.
- **Suggested solution:** If a rebrand or theming pass is ever planned, migrate hardcoded colors to the token set (or expand the token set to match what's actually used) at that time — not worth a standalone effort otherwise.
- **Risk:** Low.
- **Estimated effort:** L if done as a full pass; not recommended as a standalone task.
- **Priority:** Opportunistic.

### L5. `UserType` is narrower than the real stored `users` document shape
- **Description:** `UserType` declares `{userId, name, email, cell, password}`, but `registerAction()`/`ProfilePage.tsx` actually read/write `company`, `address`, and `role` too, which aren't in the type.
- **Why it matters:** Minor type-accuracy gap; anyone typing a variable as `UserType` gets misleading autocomplete/type-checking for fields that really do exist on the object.
- **Suggested solution:** Extend `UserType` to include `company`, `address`, `role` (all optional, matching current usage). Separately, verify the `password` field is never actually populated with a real value on a Firestore-bound object (Firebase Auth manages passwords separately) — storing a real password field in Firestore would be a serious issue, but this needs a direct check, not an assumption, since it might just be a copy-paste artifact of an unrelated payload shape.
- **Risk:** Low for the type extension; the `password` field check should happen with more urgency if it turns out to actually be populated — treat that specific sub-item as Critical if confirmed.
- **Estimated effort:** S.
- **Priority:** Opportunistic for the type fix; Immediate to verify the `password` field is never actually written with real data.

### L6. Duplicate independent logo-loading
- **Description:** `ProjectPage.tsx`, `SectionCard.tsx`, `RoomDetailsExport.tsx`, and `RoomLayoutExport.tsx` each independently call `loadImageAsBase64()` for the same logo asset, rather than loading/caching it once.
- **Why it matters:** Redundant network/file reads; not a correctness issue.
- **Suggested solution:** Lift logo loading into a small shared hook or one-time module-level cache.
- **Risk:** None.
- **Estimated effort:** S.
- **Priority:** Opportunistic.

### L7. `normalizeRoomInput()` is an unfinished no-op
- **Description:** `normalizeRoom.ts#normalizeRoomInput(room)` imports `normalizeLength`/`normalizeArea`/`normalizeTemperature` but its body is just `return room;`.
- **Why it matters:** Looks like an incomplete migration; anyone assuming room dimensions get normalized through this function will be wrong.
- **Suggested solution:** Either finish the implementation (if room-level normalization was actually needed somewhere) or remove the function and its unused imports.
- **Risk:** Low — need to first confirm nothing currently depends on this being a no-op specifically (unlikely, but check call sites before changing behavior).
- **Estimated effort:** S.
- **Priority:** Opportunistic.

### L8. Two independently-declared `InstallMethod`/`LoadMode` types across files
- **Description:** `InstallMethod` is declared once in `projectTypes.ts` (derived from `INSTALL_METHOD_OPTIONS`) and again, independently, in `ultraCalcLocked.ts`. `LoadMode` exists in three shapes: `ultraCalcLocked.ts` (`"LL"|"HL"|"HighOutput"`), `blockConstants.ts` (`"LL"|"HL"` only), and implicitly wherever `calcMode` collapses `HighOutput` to `HL`.
- **Why it matters:** Currently structurally compatible and harmless, but a future edit to one union without the other could introduce a subtle type mismatch that TypeScript wouldn't necessarily catch if the shapes happen to remain compatible by coincidence.
- **Suggested solution:** Not urgent to unify (the calculator module is intentionally self-contained per [BUSINESS_RULES.md](BUSINESS_RULES.md)), but worth a one-line comment at each declaration cross-referencing the other, so a future editor knows both exist.
- **Risk:** None (a documentation-only mitigation).
- **Estimated effort:** S.
- **Priority:** Opportunistic.

---

## Testing — recommended additions

No test infrastructure exists today (see H5). Suggested test suite, in priority order:

1. **Golden calculation tests (highest priority)** — for `calculateRoom()` (`physics.ts`), `ultraCalc()` (`ultraCalcLocked.ts`), and `interpWaterC()` (`physics.ts`): pin a handful of known room/project inputs (spanning all 5 regions, all 6 install methods, both LL/HL/HighOutput load bands, and the in-slab special case) to manually-verified expected outputs. These are the tests that would have caught C1 and would catch any accidental regression to a locked file.
2. **Unit tests for the unit-conversion layer** (`conversions.ts`, `display.ts`, `normalize.ts`) — round-trip tests (`fromDisplay(toDisplay(x)) === x`) per region, which would have caught C2 immediately (a round-trip through both `display.ts` and `normalizeProject.ts` together, simulating the real app flow, would expose the double-conversion).
3. **Regression tests for the confirmed bugs in this report** — write a failing test for C1, C2, H1, H3 *before* fixing each, so the fix's correctness is provable and the bug can't silently reappear.
4. **Integration test for the region-defaults flow** — selecting each region in `ProjectForm` and asserting the resulting `ProjectSettings` patch matches `REGION_DEFAULTS` exactly (would catch drift if `regionDefaults.ts` and `ProjectForm.tsx`'s consumption of it ever diverge).
5. **Layout engine tests** for `buildLayout()` — assert tile counts/positions for a few known room-size/joist/method combinations, to protect the visual layout from silent regressions (especially the pipe-bridge serpentine logic, which has several branching cases per joist parity).
6. **Firestore helper tests** using the Firebase emulator suite — for `saveProjectTodb`/`fetchAllProjects`/`fetchProjectById`, verifying the userId-scoping actually works as intended (also exercises C4's assumption from the client side, though it can't substitute for verifying real security rules).
7. **Component smoke tests** (React Testing Library) for `RoomCard` and `ProjectForm` — at minimum, render with a fixture project/room and assert no crash + expected key values appear, to catch obvious regressions during the C5/H1/H3 fixes above.

---

## Developer Experience — additional notes

- **Missing comments where genuinely useful:** most files in this codebase are commentless by convention (consistent with [../CLAUDE.md](../CLAUDE.md)'s stated style), which is fine for self-explanatory code, but a few non-obvious constants would benefit from a one-line "why" comment: the `0.34`/`0.33` ventilation constants in `physics.ts` (why they differ by region group), the `25 * floorR` / `min(12, ...)` floor-covering water-temp adjustment (where does `25`/`12` come from — manufacturer spec reference would help), and the `connectorFactorByJoist` magic numbers (`0.94`/`0.97`) in `layoutEngine.ts`.
- **Confusing APIs:** `onUpdateRoom`/`onRemoveRoom` being typed as `id`-based but actually used as `name`-based (H1) is the single most confusing API surface in the codebase for a new contributor — resolving H1 is as much a DX fix as a bug fix.
- **Debugging improvements:** there is no logging strategy beyond scattered `console.log`/`console.error` calls; consider a lightweight, centrally-configurable debug logger (even just a `debug()` wrapper gated by an env flag) so debug output can be toggled without leaving stray `console.log`s in committed code (see L2).
- **Onboarding:** the documentation set produced in the prior session (`CLAUDE.md`, `AGENTS.md`, `docs/*.md`) already substantially closes the onboarding gap that existed before; the main remaining gap is the missing `.env.example` (M14) and the absence of any "how to run this locally end-to-end, including Firebase emulator setup" walkthrough — worth adding if new engineers join.

---

## Prioritized roadmap

**Immediate (do first, before any of C1/C2 are touched):**
1. ~~H5 — stand up a test runner + golden calculation tests~~ — **skipped per user decision** (see H5 finding; no longer part of the active roadmap)
2. ~~C3 — declare `html2canvas` as a direct dependency~~ — **done**
3. H9 — delete stray `public/index.html`
4. H7 — fix broken `/logo.png` reference
5. C4 — verify live Firestore security rules; add `firestore.rules` if absent
6. L5 (partial) — verify the `password` field on `UserType`/registration payload is never populated with a real password value

*Note: without H5's automated tests, C1/C2 (in the "Next sprint" tier below) will be verified by manual hand-calculation instead of a regression baseline — plan extra verification time for those two specifically.*

**Next sprint (needs approval/coordination but low-to-medium risk once approved):**
7. C1 — confirm and fix custom U-value merge in `physics.ts` (with sign-off, per BUSINESS_RULES.md)
8. C2 — confirm and fix the double unit-conversion issue
9. H1 — switch room identity from `name` to `id` across all call sites
10. H3 + M3 — fix `CA_METRIC` display classification via a shared `isImperialRegion()` helper
11. H4 — re-enable Zod validation (with a safe rollout plan)
12. H6 — stop `saveProjectTodb` from mutating its argument
13. M9 — confirm before discarding advanced settings on region change
14. M10 — add a confirmation dialog before room removal

**Backlog (real value, no urgency):**
15. C5/M4 — reduce unnecessary per-keystroke recomputation across all rooms (performance)
16. H8 — lazy-load routes and the PDF export bundle
17. H2 — remove (or properly resurrect) HomePage's dead inline editor
18. M1, M2, M5, M6, M11, M12, M13, M14 — dedup, cleanup, and DX items as listed above
19. M7, M8 — accessibility and mobile-layout polish

**Opportunistic (bundle into other work, not worth a standalone task):**
20. L1–L4, L6–L8 — comments, stray logs, design-token consistency, placeholder config values, minor type gaps

---

## Constraints honored while producing this audit

Per the task instructions: no application code, calculation, formatting, or configuration was modified while producing this report. All findings above were derived from reading source files and running read-only `grep`/`ls` checks. Any finding touching a file listed in [BUSINESS_RULES.md](BUSINESS_RULES.md) §1 is explicitly marked as requiring approval before implementation, and no such file was edited during this audit.

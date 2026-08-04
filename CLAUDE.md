# CLAUDE.md — Ultra-Calc Project Knowledge Base

This file is the primary long-term-memory document for Claude Code (or any engineer) working on **Ultra-Calc**. Read this before making any change. It was produced by a full read-through of the repository as of 2026-07-06 (commit history ending at `6c626c4`). Where behavior was ambiguous in the code, this doc states an explicit **Assumption** rather than inventing behavior.

See also: [AGENTS.md](AGENTS.md) for a module-by-module ("agent") breakdown, and the [docs/](docs/) folder for deep dives on architecture, calculations, regions, data models, component tree, and improvement ideas.

---

## 1. Project overview

**Ultra-Calc** (package name `ultra-fin-calculator`) is a web application (with an Android/Capacitor shell) for HVAC/radiant-heating contractors. For a building project made up of one or more rooms, it:

1. Computes room-by-room **heat loss** (fabric, ventilation, thermal bridging, ground losses) using a simplified steady-state method inspired by BS EN 12831 / ASHRAE / EN ISO 13790 / CSA F280.
2. Selects a **required flow-water temperature** for underfloor radiant heating from a lookup/interpolation table.
3. Runs the proprietary **"Ultra-Calc" material sizing engine** to determine tubing length, loop count, fin/clip counts, and center-to-center spacing for the physical "Ultra-Fin" radiant panel system, based on install method (drilled joists, open-web, hanging, top-down bracket, or in-slab) and joist spacing.
4. Generates a **visual floor layout diagram** (SVG tile grid) showing how fin blocks, pipe bridges and end caps are arranged for a room.
5. Aggregates a **project summary** across all rooms (total heat, total tubing, total fins/clips, water temp range).
6. Exports the whole project (cover, per-room detail + layout pages, summary) to a **printable PDF**.
7. Persists projects/rooms per authenticated user in **Firebase** (Auth + Firestore).

## 2. Business purpose

The tool exists to replace manual spreadsheet-based heat-loss and material take-off calculations for contractors installing "Ultra-Fin" radiant floor heating panels. Its outputs (materials list, spacings, water temperature, PDF report) are used directly for **purchasing and installation** — meaning the calculation and material-sizing code is business-critical (see §14).

## 3. Architecture (short form)

Client-only React SPA (Vite + TypeScript), no custom backend — Firebase Auth + Firestore is the only backend. Business logic (physics, material sizing, layout generation) lives in plain TypeScript modules under `src/utils/` and `src/layout/`, decoupled from React. React components in `src/components/` and `src/pages/` are thin consumers that call these modules and render results. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full data-flow diagram.

```
UI (pages/components)
   → utils/physics.ts            (heat loss per room)
   → utils/ultraCalcAdapter.ts   (adapts room+result → ultraCalcLocked input)
      → utils/ultraCalcLocked.ts (material sizing engine)
   → layout/layoutEngine.ts       (SVG tile grid for the sized layout)
   → hooks/useProjectSummary.ts   (aggregates all rooms → ProjectSummary)
   → utils/pdfExport.ts           (renders hidden DOM → jsPDF via html2canvas)
   → services/firebaseHelpers.ts  (Firestore persistence)
```

## 4. Important folders

| Folder | Responsibility |
|---|---|
| `src/utils/` | Calculation engine, unit conversion/normalization, formatting, PDF export. **Most business logic lives here.** |
| `src/layout/` | Floor-layout SVG grid generator + related types/constants (separate from `src/components/layout/`, which is UI chrome). |
| `src/models/` | TypeScript types (`projectTypes.ts`) and static lookup presets (`presets.ts`, `waterTable.ts`). |
| `src/data/` | `regionDefaults.ts` — per-region default factors (safety %, heat-up %, psi, ventilation, ACH). |
| `src/validations.ts/` | Zod schemas for project/room forms (note the literal directory name includes `.ts` — see §9). |
| `src/components/` | React UI, grouped by domain: `auth/`, `projects/`, `rooms/`, `summary/`, `forms/`, `layout/` (UI chrome, not the calc layout engine), `export/` (PDF page templates). |
| `src/pages/` | Route-level components (`HomePage`, `ProjectPage`, `ProfilePage`, `auth/*`). |
| `src/hooks/` | `useProjectSummary` (aggregation), `useProvideAuth` (Firebase auth state). |
| `src/contexts/` | `AuthProvider`, `SnackbarProvider` — global React context. |
| `src/services/`, `src/lib/auth/` | Firebase/Firestore CRUD (`firebaseHelpers.ts`) and Firebase Auth wrapper (`authClient.ts`). |
| `src/helpers/` | `updateUiLabels.ts` (region → unit label mapping, actively used) and `updateRoomModel.ts` (legacy room-model adapter, **dead code** — see §14). |
| `src/routes/` | react-router-dom v7 route definitions and guard components. |
| `android/` | Capacitor-generated native Android shell (untracked in git status at time of writing). |

Full folder-by-folder detail: [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md).

## 5. Coding conventions observed in the codebase

These are **descriptive** (what the codebase actually does), not prescriptive — follow them for consistency unless the user asks to change the convention itself.

- **Functional React components** with `React.FC<Props>` typing, always with an explicit `Props`/`*Props` interface declared just above the component.
- **No CSS-in-JS** except MUI's `sx` prop; everything else uses **Tailwind utility classes** inline in JSX.
- **No global state library** — state is lifted to the nearest page (`ProjectPage`, `HomePage`) and passed down via props (`onUpdateProject`, `onUpdateRoom`, `onRemoveRoom` pattern). Context is only used for auth and snackbar/toast.
- **Business logic is kept out of components where possible** — components call pure functions from `utils/` (`calculateRoom`, `runUltraCalc`, `buildLayout`, `formatRoomResults`, etc.) rather than inlining formulas. Follow this pattern for new calculation logic: put math in `src/utils/` or `src/layout/`, not inside JSX/component bodies.
- **Values are always stored internally in metric SI units** (meters, °C, W, W/m², m³/h, W/K) regardless of the project's display `region`. Region only changes *display* formatting via `utils/display.ts` (`toDisplay*`/`fromDisplay*` pairs) and `utils/formatResults.ts` / `formatRoomResults.ts` / `formatProjectSummary.ts`. **Never store a value in imperial units** — always convert imperial user input back to metric via the matching `fromDisplay*` function before calling `onUpdate`/`onUpdateRoom`.
- **"Locked" files are frozen reference implementations.** `ultraCalcLocked.ts` and `ultraSpacingLocked.ts` carry `// LOCKED` banners — these encode the manufacturer's official material sizing tables and must not be refactored/renamed/"cleaned up" without explicit sign-off (see §14).
- **`exportMode` prop convention**: many components (`RoomCard`, `ProjectForm`, `SectionCard`, `Field`) accept an `exportMode?: boolean` prop that swaps editable inputs for plain read-only `<DisplayValue>` text, used when rendering the hidden off-screen DOM for PDF capture. When adding a new editable field to a form, also add its exportMode read-only rendering.
- **Local "buffer" state + onBlur commit pattern**: numeric fields prone to intermediate invalid states while typing (e.g. `windowInput`/`doorInput` in `RoomCard.tsx`) keep a local string state updated `onChange` and commit to the parent model `onBlur`, to avoid clobbering the value model on every keystroke.
- **IDs**: `uid()` (`src/utils/uid.ts`) generates `r_xxxxxx`-style random (non-cryptographic, non-guaranteed-unique) string IDs for rooms/projects. See §9 for a real inconsistency around how rooms are actually keyed.
- **Firestore access always filters by `auth.currentUser?.uid`** — every read/write in `firebaseHelpers.ts` scopes to the current user. Preserve this pattern in any new Firestore function; do not add a query that lets a user read another user's `projects` or `users` documents.

## 6. TypeScript conventions

- `strict`-adjacent config (`tsconfig.json`): `noEmit`, `isolatedModules`, `jsx: react-jsx`, `moduleResolution: Bundler`, target `ES2020`. No `paths` aliases — all imports are relative.
- Domain types live in `src/models/projectTypes.ts` and are imported everywhere by relative path; there is no barrel/index file re-exporting types.
- Discriminated unions are used for calculator inputs, e.g. `HeatLoadInput = { unit: "BTU_FT2"; value } | { unit: "W_M2"; value }` and `RoomInput` (calculator-local, in `ultraCalcLocked.ts`) `= { unit: "FT" } | { unit: "M" }`. **Do not confuse this calculator-local `RoomInput` type (in `ultraCalcLocked.ts`) with the app-wide `RoomInput` interface in `models/projectTypes.ts`** — they share a name but are unrelated shapes in different files/contexts.
- Enum-like string unions (`Region`, `InstallMethod`, `LoadMode`, `JoistKey`) are used instead of TS `enum`.

## 7. React patterns

- Route-level "smart" pages (`ProjectPage`, `HomePage`) own all mutable state and Firestore I/O; presentational components (`ProjectEditor`, `RoomCard`, `SummaryCard`, `ProjectForm`) are controlled via props and callbacks only.
- `ProjectEditor` is a simple 3-tab switcher (`details` / `rooms` / `summary`) with no router involvement — tab state is local `useState`, optionally mirrored up via an `onTabChange` callback.
- Derived/expensive values (`calculateRoom`, `runUltraCalc`, `normalizeProjectSettings`) are wrapped in `useMemo` keyed on the room/project object identity — because `RoomInput`/`ProjectSettings` are always recreated with spread (`{...project, patch}`), memoization correctly invalidates on every edit.
- Async side effects that produce state (layout SVG tiles, sidebar images, base64 logos) use the `let cancelled = false` guard pattern inside `useEffect` to avoid setting state after unmount.
- Debounced autosave: `ProjectPage` runs `handleSaveProject(false)` in a `setTimeout(..., 800)` effect keyed on the whole `project` object, cleared/reset on every change — i.e. **projects autosave to Firestore 800ms after the last edit**, with no autosave-in-flight/cancellation guard (see §14).

## 8. Calculation flow

1. `ProjectPage`/`HomePage` hold `project: ProjectSettings & { rooms: RoomInput[] }`.
2. For each room, `RoomCard` calls **`calculateRoom(room, normalizeProjectSettings(project))`** (`src/utils/physics.ts`) → `RoomResults` (fabric/vent/psi/ground losses in W, total before/after safety+heat-up factors, load density in W/m², required flow water temperature in °C, warnings).
3. `RoomCard` then calls **`runUltraCalc(room, res, project)`** (`src/utils/ultraCalcAdapter.ts`), which maps the app's `RoomInput`/install method/joist spacing into `ultraCalcLocked.ts`'s `ultraCalc()` function → `UltraCalcOutput` (tube size, LL/HL/HighOutput mode, tubing length, loop count, fin pairs, clips/supports by install method, spacing in mm).
4. `RoomCard` then calls **`buildLayout()`** (`src/layout/layoutEngine.ts`) with room dimensions + joist + load mode + install method → a tile grid (`Tile[]`) rendered by `FloorLayoutSvg`.
5. `useProjectSummary(rooms, project)` re-runs steps 2–3 for every room and aggregates totals for the "Summary" tab and PDF summary page.

Full formula-by-formula reference: [docs/CALCULATIONS.md](docs/CALCULATIONS.md).

## 9. Rendering flow

`App.tsx` → `BrowserRouter` → `AuthProvider` → `SnackbarProvider` → `AppRoutes` (`useRoutes`). `ProtectedRoute` gates `/dashboard`, `/project`, `/project/:id`, `/profile` behind Firebase auth state; `RedirectHandler` sends `/` to `/dashboard` or `/login`. See [docs/COMPONENT_MAP.md](docs/COMPONENT_MAP.md) for the full component tree.

**Known landmine:** despite `RoomInput.id` existing and `onUpdateRoom`/`onRemoveRoom` being typed as `(id: string, ...) => void`, `RoomCard.tsx` and `ProjectPage.tsx` actually call/implement these functions **keyed by `room.name`, not `room.id`** (e.g. `onUpdateRoom(room.name, {...})`, and `ProjectPage`'s `updateRoom` matches `r.name === roomName`). Two rooms with the same name will silently collide on every edit. Do not "fix" this in isolation without checking every call site — see [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md).

## 10. PDF flow

`ProjectPage.tsx` renders a second, **visually hidden** copy of the project (`position: absolute; left: -99999px`) containing: a header page, one `RoomDetailsExport` + one `RoomLayoutExport` per room (each `exportMode=true`), and a final summary page (`ProjectForm exportMode` + `SummaryCard`). `handleExportPDF()` passes refs to these hidden DOM nodes into **`exportPDF()`** (`src/utils/pdfExport.ts`), which uses `html2canvas` to rasterize each page (JPEG for text pages, PNG for layout/diagram pages to preserve transparency) into a `jspdf` A4 document and triggers a download (`project-export.pdf`). SVG diagrams are inlined to base64 (`inlineNestedSvgImages`, `svgBase64ToPng`) before capture because `html2canvas` cannot rasterize `<image>` elements referencing external SVG URLs.

Note: `src/components/export/ProjectExportView.tsx` is a similar, self-contained "export template" component but is **not actually used** by `ProjectPage` — the export DOM is inlined directly in `ProjectPage.tsx` instead. Treat `ProjectExportView.tsx` as unused/legacy unless you first verify a new usage was added.

## 11. Layout generation flow

See §8 step 4 and [docs/CALCULATIONS.md](docs/CALCULATIONS.md#layout-generation) for the tile-grid algorithm (`layoutEngine.ts` + `layoutMath.ts` + `blockConstants.ts` + `assetResolver.ts`). In short: room dimensions are divided into a grid of fixed-size fin blocks (`BLOCK_SIZE_M[joist][LL|HL]`), then edged with either pipe-bridge connectors (with-joist methods) or end caps (across-joist methods: `DRILLING`, `OPEN_WEB`). Assets are resolved to static SVG file paths under `/assets/diagrams/`. In-slab installs have no visual layout (`FloorLayoutSvg` renders a "Layout not available" placeholder).

## 12. Unit conversion flow

Two parallel conversion layers exist and serve different purposes — do not merge them without understanding both:

1. **`src/utils/normalize.ts` + `normalizeProject.ts`** — converts a `ProjectSettings` object's *imperial-region-entered* advanced settings (ventilation, psi allowance, custom U-values) into metric SI **before** they reach `calculateRoom()`. `normalizeTemperature()` also exists but is **not called** by `normalizeProjectSettings` (indoor/outdoor temps pass through untouched) — see Assumption below.
2. **`src/utils/display.ts`** (`toDisplay*`/`fromDisplay*`) — converts stored metric SI values to/from the region's display units for rendering in forms/results (`ProjectForm`, `RoomCard`).

**Assumption:** `indoorTempC`/`outdoorTempC` are named with a `C` suffix and are always stored/interpreted as Celsius internally; the UI never lets the user enter them in a unit other than what `toDisplayTemperature`/`fromDisplayTemperature` produce/consume at the input boundary, so `normalizeTemperature` in `normalize.ts` looks unused/dead for this pathway. Confirm before relying on `normalizeTemperature` for anything new.

Region → unit **labels** (not conversion) are resolved separately by `src/helpers/updateUiLabels.ts` (`getUIUnits`).

Full reference table: [docs/CALCULATIONS.md](docs/CALCULATIONS.md#unit-conversions).

## 13. Region handling

`Region = "UK" | "EU" | "US" | "CA_METRIC" | "CA_IMPERIAL"`. Each has a default `StandardsMode` and default safety/heat-up/psi/ventilation/ACH factors in `src/data/regionDefaults.ts`, applied when the user changes Region in `ProjectForm`. UK additionally has its own `UK_PRESETS` U-value table (currently numerically identical to `GENERIC_PRESETS` — see §14) used only when `standardsMode === "BS_EN_12831"`.

**Important inconsistency to know about:** most of the app treats `CA_METRIC` as a *metric* region (`getUIUnits`, `normalize.ts` all exclude it from the imperial branch), but **`formatProjectSummary.ts` and `formatResults.ts` (`formatSpacing`, `formatTubeSizing`) both classify `CA_METRIC` as imperial** (`region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC"`). This means a `CA_METRIC` project currently displays summary totals and spacing in imperial units while its input forms display metric units. This looks like a genuine bug — see [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) — do not silently "fix" one call site without fixing all three, and confirm with the user/business owner which behavior is correct before changing it.

Full region-by-region reference: [docs/REGIONS.md](docs/REGIONS.md).

## 14. Important business rules

**Canonical reference: [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md).** Read it before modifying any calculation logic — it lists the protected/locked files, the specific engineering formula rules that must not change without approval, the non-negotiable invariants (SI-only storage, no duplicate conversion helpers, pure/deterministic calculations), and the known confirmed inconsistencies that must not be fixed piecemeal. This section is intentionally kept short so there is one source of truth; do not re-duplicate its content back into this file.

## 15. Common developer commands

```bash
npm run dev       # vite dev server
npm run build     # tsc -b && vite build  (type-checks, then bundles)
npm run preview   # preview a production build locally
```

There is currently **no test script, linter script, or CI config** committed (`package.json` has only `dev`/`build`/`preview`). There is also no `.env.example` — Firebase config is read from `VITE_FIREBASE_*` env vars (`src/firebase/index.ts`) that must be supplied via a local `.env` (not present in the repo; ask the user how they provision it before assuming Firebase will "just work" locally).

Capacitor (`capacitor.config.ts`, `android/`) wraps the built `dist/` web app for Android; there is no committed npm script for `npx cap sync`/`npx cap open android` — run those Capacitor CLI commands directly if native builds are needed.

## 16. Things that must never be changed accidentally

The full, canonical list of protected files and formulas — with the reasoning for each — lives in [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) §1–§4. In short: `physics.ts`, `ultraCalcLocked.ts`, `ultraSpacingLocked.ts`, `ultraCalcAdapter.ts`, `waterTable.ts`, `regionDefaults.ts`, and `presets.ts` all require explicit approval before edits; the `CA_METRIC` display bug and `room.name`-as-id inconsistency must not be fixed piecemeal; the `userId`-scoped Firestore query pattern must be preserved in every new `firebaseHelpers.ts` function (it is the app's only access-control mechanism — no Firestore security rules are visible in this repo checkout).

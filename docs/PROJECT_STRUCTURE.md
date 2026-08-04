# PROJECT_STRUCTURE.md

Folder-by-folder reference for **Ultra-Calc**. See [ARCHITECTURE.md](ARCHITECTURE.md) for how these folders interact and [COMPONENT_MAP.md](COMPONENT_MAP.md) for the React component tree specifically.

```
ultra-fin-calculator/
├── android/                  Capacitor-generated native Android project (untracked at review time)
├── public/
│   ├── index.html
│   └── assets/
│       └── diagrams/         Static SVG assets: fin blocks, pipe bridges, end caps, profiles, icons, logo.PNG
├── src/
│   ├── assets/                logo.png (bundled import, used by auth/header components)
│   ├── components/            React UI, grouped by domain (see below)
│   ├── contexts/               AuthProvider, SnackbarProvider (React Context)
│   ├── data/                   regionDefaults.ts — static per-region default factors
│   ├── firebase/                Firebase app/auth/firestore initialization
│   ├── helpers/                 updateUiLabels.ts (active), updateRoomModel.ts (legacy/dead)
│   ├── hooks/                   useProjectSummary, useProvideAuth
│   ├── layout/                  Floor-layout SVG generation engine (NOT UI chrome — see note below)
│   ├── lib/auth/                 authClient.ts — Firebase Auth action wrappers
│   ├── models/                   TypeScript types + static presets/lookup tables
│   ├── pages/                    Route-level components
│   ├── routes/                   react-router-dom route definitions + guards
│   ├── services/                  firebaseHelpers.ts — Firestore CRUD
│   ├── utils/                    Calculation engine, conversions, formatting, PDF export
│   ├── validations.ts/            Zod schemas (NOTE: this is a directory, not a file)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── capacitor.config.ts
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## `src/components/` — by subfolder

| Subfolder | Responsibility | Key files |
|---|---|---|
| `auth/` | Login/register/forgot-password form logic (the actual business logic; `pages/auth/*` are thin wrappers) | `LoginForm.tsx`, `RegisterForm.tsx`, `ForgotPassword.tsx` |
| `projects/` | Project-level editing shell and dashboard card | `ProjectEditor.tsx` (3-tab hub: details/rooms/summary), `ProjectCard.tsx` (dashboard grid tile) |
| `rooms/` | Per-room input form + calculated results/materials display | `RoomCard.tsx` (large, central component), `MaterialsCard.tsx` (smaller, currently not rendered anywhere in the live UI — appears vestigial, duplicating logic already inlined in `RoomCard`) |
| `summary/` | Project-wide aggregated totals display | `SummaryCard.tsx`, `SummaryRow.tsx` |
| `forms/` | Reusable low-level form building blocks + the project settings form | `ProjectForm.tsx`, `Field.tsx` |
| `layout/` | **UI chrome** — page shell, header, cards, dialogs. Do not confuse with `src/layout/` (the calculation/SVG engine) | `AppLayout.tsx`, `Header.tsx`, `SectionCard.tsx`, `ConfirmDialog.tsx`, `LayoutSVG.tsx` (dead code — imported by `RoomCard.tsx` but never rendered) |
| `export/` | PDF export page templates | `RoomDetailsExport.tsx`, `RoomLayoutExport.tsx`, `ProjectExportView.tsx` (exists but not wired into the actual export flow — see ARCHITECTURE.md §9) |

## `src/utils/` — file-by-file

| File | Responsibility |
|---|---|
| `physics.ts` | Core heat-loss calculation (`calculateRoom`) and water-temperature interpolation (`interpWaterC`). **Business-critical.** |
| `ultraCalcLocked.ts` | Manufacturer-locked material sizing engine (`ultraCalc`). **Business-critical, marked LOCKED.** |
| `ultraCalcAdapter.ts` | Adapts app-level room/project data into `ultraCalcLocked.ts`'s input shape (`runUltraCalc`). |
| `ultraSpacingLocked.ts` | Duplicate spacing-table reference (`ULTRA_FIN_SPACING_MM`/`TUBING_SPACING_MM`), also marked LOCKED. Keep in sync with the copy inside `ultraCalcLocked.ts`. |
| `uDefaults.ts` | `getDefaultUValues()` — resolves default U-values for a given region/insulation period, used when applying region/period defaults in the UI (not inside `calculateRoom` itself). |
| `conversions.ts` | Raw numeric conversion factor functions (length, area, temp, power). No region logic. |
| `normalize.ts` | Region-aware conversion of *advanced settings* to metric SI (`normalizeLength/Area/Temperature/UValue/Ventilation/PsiAllowance`). |
| `normalizeProject.ts` | Applies `normalize.ts` functions across a whole `ProjectSettings` object (`normalizeProjectSettings`) — called before every `calculateRoom()` invocation. See [CALCULATIONS.md](CALCULATIONS.md) §7 for a likely double-conversion issue here. |
| `normalizeRoom.ts` | `normalizeRoomInput()` — currently a no-op passthrough despite importing conversion helpers. |
| `display.ts` | Region-aware `toDisplay*`/`fromDisplay*` pairs for rendering stored SI values in a region's display units and converting user input back to SI. |
| `formatResults.ts` | `formatSpacing`, `formatTubeSizing` — spacing/tube-size display strings. |
| `formatRoomResults.ts` | `formatRoomResults` — per-room results (`RoomResults`) → display strings. |
| `formatProjectSummary.ts` | `formatProjectSummary`, `getInstallMethodLabel` — project summary → display strings. |
| `pdfExport.ts` | `exportPDF`, `loadImageAsBase64`, `svgBase64ToPng`, `inlineNestedSvgImages`, `renderPage` — all PDF generation logic. |
| `uid.ts` | `uid(prefix)` — short random ID generator. |

## `src/layout/` (the calculation/SVG engine — distinct from `src/components/layout/`)

| File | Responsibility |
|---|---|
| `layoutEngine.ts` | `buildLayout()` — main entry point, produces the tile grid. |
| `layoutMath.ts` | `computeGrid()`, `getDirection()` — grid sizing math. |
| `layoutModel.ts` | `LayoutTile`/`FloorLayout` interfaces — **appears unused**; the actually-used tile shape is `Tile` in `layoutTypes.ts`. Verify before assuming `layoutModel.ts` is load-bearing. |
| `layoutTypes.ts` | `Tile`, `TileType` — the tile shape actually produced by `buildLayout()` and rendered by `FloorLayoutSvg`. |
| `blockConstants.ts` | `BLOCK_SIZE_M`, `JOIST_MM` — physical block dimensions per joist/load mode. |
| `assetResolver.ts` | `finBlockAsset`, `pipeBridgeAsset`, `endCapAsset` — resolve tile type → static SVG path. |
| `sidebarResolver.ts` | `resolveSidebarAssets()` — resolves the profile/support-icon images shown beside the layout diagram. |
| `FloorLayout.tsx` | **Dead code.** Exports a component also named `FloorLayoutSvg` with a different, incompatible prop signature than the real one below. Not imported anywhere (verified by grep). |
| `FloorLayoutSvg.tsx` | The actual, imported layout diagram renderer (props: `{layout, installMethod}`). |
| `RightSidebar.tsx` | Renders the profile/support-icon sidebar beside the diagram (or the tubing-spacing text block for in-slab). |

## `src/models/`

| File | Responsibility |
|---|---|
| `projectTypes.ts` | All core domain types: `Region`, `StandardsMode`, `ProjectSettings`, `RoomInput`, `RoomResults`, `ProjectSummary`, `MaterialUValues`, `UIUnits`, `UserType`, plus legacy/likely-unused `RichRoom`, `Side`, `MaterialResults` types. |
| `presets.ts` | `GLAZING_WINDOW_U`, `FLOOR_COVER_R`, `JOIST_SPACING_MM`, `GENERIC_PRESETS`, `UK_PRESETS`, `MAX_LOOP_M` (likely unused — see CLAUDE.md §14), `SPACING_TABLE` (likely unused), `INSTALL_METHOD_OPTIONS` (actively used everywhere for install method dropdowns/labels). |
| `waterTable.ts` | `WATER_TABLE` — the water-temperature interpolation lookup. **Business-critical.** |

## `src/data/`

| File | Responsibility |
|---|---|
| `regionDefaults.ts` | `REGION_DEFAULTS` — per-region default safety/heat-up/psi/ventilation/ACH factors, applied on region selection in `ProjectForm.tsx`. |

## `src/validations.ts/` (a directory, not a file)

| File | Responsibility |
|---|---|
| `projectSchema.ts` | Zod schema for project-level required fields (name, region, address, standards mode, indoor/outdoor temps, insulation period). **Currently not enforced** — the call site in `ProjectPage.tsx` is commented out. |
| `roomSchema.ts` | Zod schema for room-level required fields. **Also currently not enforced** (same commented-out call site). |

## `src/pages/`

| File | Responsibility |
|---|---|
| `HomePage.tsx` | Dashboard — lists all of the user's projects (`ProjectCard` grid) and can inline-edit an active project via `ProjectEditor`. |
| `ProjectPage.tsx` | Full project editor + PDF export owner. Handles new-project defaults, autosave, delete confirmation, and the hidden export DOM. |
| `ProfilePage.tsx` | User profile view/edit (name, email, phone, company, address, role). |
| `auth/Login.tsx`, `auth/Register.tsx`, `auth/Forgot.tsx` | Thin route wrappers around the corresponding `components/auth/*` form components. |

## `src/routes/`

| File | Responsibility |
|---|---|
| `AppRoutes.tsx` | Top-level `useRoutes()` route table. |
| `AuthRoutes.tsx` | Guest-only route definitions (`register`, `login`, `forgot`). |
| `ProtectedRoute.tsx` | Auth gate — redirects based on Firebase auth state and a `guestOnly` flag. |
| `RedirectHandler.tsx` | Handles `/` → `/dashboard` or `/login`. |

## `src/services/` and `src/lib/auth/`

| File | Responsibility |
|---|---|
| `services/firebaseHelpers.ts` | All Firestore CRUD: `saveProjectTodb`, `fetchAllProjects`, `fetchProjectById`, `deleteProjectFromDb`, `getUserById`, `updateUserById`. |
| `lib/auth/authClient.ts` | Firebase Auth action wrappers: `registerAction`, `send_login_request`, `logoutUser`, `sendResetEmail`, `observeAuth`. |

## `src/helpers/`

| File | Responsibility |
|---|---|
| `updateUiLabels.ts` | `getUIUnits(region)` — the region → display-unit-label mapping, used throughout forms/results. **Actively used.** |
| `updateRoomModel.ts` | `toRichRoom`/`fromRichRoom` — converters between the modern flat `RoomInput` and the legacy nested `RichRoom`/`Side` model. **Not called anywhere in the app** (dead code / incomplete migration remnant). Contains a hardcoded `setpoint: 21` default that silently discards the real room setpoint if ever used. |

## `public/assets/diagrams/`

All static SVG diagram assets referenced by `assetResolver.ts` and `sidebarResolver.ts` live here, following naming conventions like `FB_{joist}-{mm}_{LL|HL}_{drilled|parallel}.svg` (fin blocks), `PB_{joist}-{mm}_{TL|TR|BL|BR}.svg` (pipe bridges), `EC_{joist}-{mm}_{T|B}.svg` (end caps), `PROFILE_*.svg`/`ICON_*.svg` (sidebar images). Also contains `logo.PNG`/`logo_square.PNG` — note `public/logo.png` (lowercase, referenced directly in `ProjectPage.tsx` and `ProjectExportView.tsx`) does **not** exist in `public/`, only `public/assets/diagrams/logo.PNG` does — see [IMPROVEMENTS.md](IMPROVEMENTS.md) for this confirmed broken-image issue.

## Root config files

| File | Responsibility |
|---|---|
| `vite.config.ts` | Vite + React plugin config; explicit `assetsInclude` rule for uppercase `.PNG`. |
| `tailwind.config.js` | Tailwind content globs + a small unused-in-practice custom color/spacing palette. |
| `postcss.config.js` | Standard Tailwind/Autoprefixer PostCSS pipeline. |
| `tsconfig.json` | TypeScript compiler options — `noEmit`, `isolatedModules`, `jsx: react-jsx`, no path aliases. |
| `capacitor.config.ts` | Capacitor Android wrapper config (`appId: com.example.app` — looks like a placeholder, confirm before a real release). |
| `package.json` | Scripts: `dev`, `build`, `preview`. No test/lint scripts defined. |

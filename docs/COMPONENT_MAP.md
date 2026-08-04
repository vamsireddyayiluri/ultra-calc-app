# COMPONENT_MAP.md

React component tree and parent-child relationships for **Ultra-Calc**. See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for file locations and [ARCHITECTURE.md](ARCHITECTURE.md) for data-flow context.

## Full tree

```
<App>
 └─ <BrowserRouter>
     └─ <AuthProvider>                              [contexts/AuthProvider.tsx]
         └─ <SnackbarProvider>                       [contexts/SnackbarProvider.tsx]
             └─ <AppRoutes> (useRoutes)               [routes/AppRoutes.tsx]
                 │
                 ├─ "/"            → <RedirectHandler>                [routes/RedirectHandler.tsx]
                 │
                 ├─ (guestOnly)    → <ProtectedRoute guestOnly>        [routes/ProtectedRoute.tsx]
                 │     ├─ "register" → <RegisterPage> → <RegisterForm>  [pages/auth/Register.tsx, components/auth/RegisterForm.tsx]
                 │     ├─ "login"    → <LoginPage>    → <LoginForm>     [pages/auth/Login.tsx, components/auth/LoginForm.tsx]
                 │     └─ "forgot"   → <ForgotPasswordPage> → <ForgotPassword> [pages/auth/Forgot.tsx, components/auth/ForgotPassword.tsx]
                 │
                 ├─ (protected)    → <ProtectedRoute>
                 │     └─ "/dashboard" → <HomePage>                    [pages/HomePage.tsx]
                 │           └─ <AppLayout>                             [components/layout/AppLayout.tsx]
                 │                 └─ <Header>                          [components/layout/Header.tsx]
                 │           ├─ (no active project) <ProjectCard/> × N  [components/projects/ProjectCard.tsx]
                 │           └─ (active project)    <ProjectEditor>     [components/projects/ProjectEditor.tsx]
                 │                 ├─ tab "details" → <ProjectForm>      [components/forms/ProjectForm.tsx]
                 │                 │                    └─ <SectionCard> + <Field> × N
                 │                 ├─ tab "rooms"   → <RoomCard/> × N    [components/rooms/RoomCard.tsx]
                 │                 │                    ├─ <SectionCard><Field/>×N</SectionCard>  (inputs)
                 │                 │                    ├─ <SectionCard>(Results & Materials)</SectionCard>
                 │                 │                    └─ <SectionCard>(Layout Visualization)
                 │                 │                          ├─ <FloorLayoutSvg>                 [layout/FloorLayoutSvg.tsx]
                 │                 │                          └─ <RightSidebar>                    [layout/RightSidebar.tsx]
                 │                 └─ tab "summary" → <SummaryCard>      [components/summary/SummaryCard.tsx]
                 │                                      └─ <SummaryRow/> × N  [components/summary/SummaryRow.tsx]
                 │
                 ├─ (protected)    → <ProtectedRoute>
                 │     └─ "/project", "/project/:id" → <ProjectPage>    [pages/ProjectPage.tsx]
                 │           └─ <AppLayout><Header/></AppLayout>
                 │           └─ <ProjectEditor> (identical structure to HomePage's, above)
                 │           └─ (conditionally) <ConfirmDialog>          [components/layout/ConfirmDialog.tsx]  (delete confirmation)
                 │           └─ [hidden off-screen export DOM, position:absolute left:-99999px]
                 │                 ├─ header page (logo + project name/region/address)
                 │                 ├─ per room:
                 │                 │     ├─ <RoomDetailsExport>          [components/export/RoomDetailsExport.tsx]
                 │                 │     │     └─ <RoomCard exportMode/>
                 │                 │     └─ <RoomLayoutExport>          [components/export/RoomLayoutExport.tsx]
                 │                 │           ├─ <FloorLayoutSvg>
                 │                 │           └─ <RightSidebar>
                 │                 └─ summary page
                 │                       ├─ <ProjectForm exportMode/>
                 │                       └─ <SummaryCard/>
                 │
                 ├─ (protected)    → <ProtectedRoute>
                 │     └─ "/profile" → <ProfilePage>                    [pages/ProfilePage.tsx]
                 │           └─ <AppLayout><Header/></AppLayout>
                 │           └─ profile form fields (MUI TextField, no sub-component extraction)
                 │
                 └─ "*" → 404 fallback (inline JSX, no dedicated component)
```

**Not part of the live tree** (present in the codebase but unused/dead — see [IMPROVEMENTS.md](IMPROVEMENTS.md)):
- `components/export/ProjectExportView.tsx` — a self-contained alternative to the hidden export DOM built inline in `ProjectPage.tsx`; not imported by any page.
- `components/rooms/MaterialsCard.tsx` — a materials-only display; `RoomCard.tsx` already inlines this same information and is what's actually rendered.
- `components/layout/LayoutSVG.tsx` — imported by `RoomCard.tsx` but never rendered in its JSX.
- `layout/FloorLayout.tsx` — exports a same-named-but-incompatible `FloorLayoutSvg` component; not imported anywhere.

## Component prop reference (most important components)

### `<ProjectEditor>` (`components/projects/ProjectEditor.tsx`)
```ts
interface ProjectEditorProps {
  project: ProjectSettings & { rooms: RoomInput[] };
  rooms: RoomInput[];
  onUpdateProject: (patch: Partial<ProjectSettings>) => void;
  onUpdateRoom: (id: string, patch: Partial<RoomInput>) => void;   // ⚠ actually called with room.name, not room.id — see below
  onRemoveRoom: (id: string) => void;                               // ⚠ same caveat
  summary: ProjectSummary | null;
  onTabChange?: (tab: "details" | "rooms" | "summary") => void;
}
```
Purely a 3-tab switcher; owns only `activeTab` local state. Renders `<ProjectForm>`, `<RoomCard>` (one per room, keyed by `room.id`), or `<SummaryCard>` depending on the active tab. Used identically by both `HomePage` (inline-editing the active project) and `ProjectPage` (the full project editor).

### `<RoomCard>` (`components/rooms/RoomCard.tsx`)
```ts
interface RoomCardProps {
  room: RoomInput;
  project: ProjectSettings;
  exportMode?: boolean;
  onUpdateRoom: (id: string, patch: Partial<RoomInput>) => void;
  onRemoveRoom: (id: string) => void;
  calculateRoom: (room: RoomInput, project: ProjectSettings) => RoomResults;
}
```
The largest, most business-logic-adjacent component. Internally: `useMemo`s `normalizeProjectSettings(project)` → `calculateRoom(room, normalized)` → `runUltraCalc(room, res, project)`; two `useEffect`s asynchronously build the floor-layout tile grid (`buildLayout`) and the sidebar profile/support-icon images (`resolveSidebarAssets`), converting to base64/PNG when `exportMode` is true (for PDF capture). Renders three sections: **room input fields** (editable unless `exportMode`), **Results & Materials** (always read-only), and **Layout Visualization** (only when not `exportMode` and layout/sidebar images are loaded).

⚠️ **All internal `onUpdateRoom(...)`/`onRemoveRoom(...)` calls pass `room.name` as the first argument**, not `room.id`, despite the prop type declaring `id: string`. `ProjectPage.tsx`'s actual `updateRoom`/`removeRoom` implementations match rooms by `r.name === roomName`. Two rooms with the same name will collide on every field edit. See [ARCHITECTURE.md](ARCHITECTURE.md) §9 and [IMPROVEMENTS.md](IMPROVEMENTS.md).

### `<ProjectForm>` (`components/forms/ProjectForm.tsx`)
```ts
interface ProjectFormProps {
  project: ProjectSettings;
  onUpdate: (patch: Partial<ProjectSettings>) => void;
  appliedDefaults?: Partial<Record<string, any>>;   // used only to render a "(custom)" label suffix, not otherwise wired up anywhere in the codebase — verify before assuming it's passed by any caller
  exportMode?: boolean;
}
```
Renders always-visible basic fields (name, contractor, region, address, indoor/outdoor temp, insulation period, glazing) plus a collapsible "Advanced Defaults" section (standards mode, safety %, heat-up %, psi allowance, mechanical ventilation, infiltration ACH, 5 custom U-values) — hidden entirely when `exportMode`. Region and Insulation Period `<select>`s both trigger a defaults recomputation (`getDefaultUValues`) on change.

### `<SummaryCard>` (`components/summary/SummaryCard.tsx`)
```ts
interface SummaryCardProps {
  project: ProjectSettings;
  summary: ProjectSummary | null;
}
```
Pure presentational — calls `formatProjectSummary(project.region, summary)` and `formatSpacing(project.region, ...)` to produce display strings, then renders a grid of `<SummaryRow>`s plus a notes list. No calculation logic of its own.

### `<AppLayout>` / `<Header>` (`components/layout/*`)
`AppLayout` is a simple `{children, title?, subtitle?}` wrapper rendering `<Header>` + a `<main>`. `Header` fetches the current user's profile (`getUserById`) for the avatar/dropdown, and exposes navigation (home icon), profile link, and logout (`logoutUser`/Firebase `signOut`).

## Data flow direction

All prop flow is **top-down** (page → editor → card → row); all mutation flow is **callback-up** (`onUpdate*`/`onRemove*` invoked by leaf components, handled by the page, which calls `setProject`/`setProjects` and lets React re-render downward). There is no component that reaches "sideways" into a sibling's state — the only shared cross-cutting state is via `AuthProvider`/`SnackbarProvider` context, consumed via `useAuth()`/`useSnackbar()` hooks from anywhere in the tree.

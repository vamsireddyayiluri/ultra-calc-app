# ARCHITECTURE.md

Full architectural reference for **Ultra-Calc**. See [../CLAUDE.md](../CLAUDE.md) for the condensed summary and [../AGENTS.md](../AGENTS.md) for module-level detail.

## 1. System shape

Ultra-Calc is a **client-only single-page application** — there is no custom backend server or API layer in this repository. The only backend is **Firebase** (Authentication + Firestore), accessed directly from the browser via the Firebase JS SDK. A Capacitor wrapper (`capacitor.config.ts`, `android/`) packages the built web app (`dist/`) as a native Android app, but does not add any native code paths that the web logic depends on.

```
┌─────────────────────────────────────────────────────────────────┐
│                           Browser (SPA)                          │
│                                                                    │
│  React Router (react-router-dom v7, useRoutes)                   │
│   ├─ "/"              → RedirectHandler → /dashboard or /login    │
│   ├─ "/login" etc.    → ProtectedRoute(guestOnly) → auth pages    │
│   ├─ "/dashboard"     → ProtectedRoute → HomePage                 │
│   ├─ "/project"       → ProtectedRoute → ProjectPage (new)        │
│   ├─ "/project/:id"   → ProtectedRoute → ProjectPage (existing)   │
│   └─ "/profile"       → ProtectedRoute → ProfilePage              │
│                                                                    │
│  Context: AuthProvider (Firebase auth state) + SnackbarProvider   │
│                                                                    │
│  Pages own state, call:                                           │
│   ┌─────────────────────────┐   ┌───────────────────────────────┐ │
│   │ Calculation layer        │   │ Persistence layer             │ │
│   │ (pure TS, src/utils,     │   │ (src/services, src/lib/auth)  │ │
│   │  src/layout, src/models) │   │  → Firebase SDK               │ │
│   └─────────────────────────┘   └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                     │                              │
                     ▼                              ▼
        Static SVG assets (public/assets/…)   Firebase Auth + Firestore
```

## 2. Layering

1. **Route / Page layer** (`src/pages/*`, `src/routes/*`) — owns top-level mutable state (`project`, `projects`, `activeTab`), performs Firestore I/O, wires callbacks down.
2. **Presentational component layer** (`src/components/*`) — controlled components that receive data + callbacks as props; no direct Firestore access (all Firestore access is confined to `src/services/firebaseHelpers.ts` and `src/lib/auth/authClient.ts`).
3. **Calculation / domain layer** (`src/utils/*`, `src/layout/*`, `src/models/*`, `src/data/*`) — pure, framework-agnostic TypeScript. No React imports. This is intentionally decoupled so the calculation logic could be unit-tested or reused without a UI (though no tests exist yet — see [IMPROVEMENTS.md](IMPROVEMENTS.md)).
4. **Persistence layer** (`src/firebase/index.ts`, `src/services/firebaseHelpers.ts`, `src/lib/auth/authClient.ts`) — thin wrappers over the Firebase SDK.

## 3. Data flow: opening/editing a project

```
ProjectPage mounts
  └─ id present? ──yes──► fetchProjectById(id)  [firebaseHelpers.ts]
  │                          └─ Firestore doc "projects/{id}", verifies userId match
  └─ id absent  ──────────► construct a new default ProjectSettings & rooms:[]
                                (region: "UK", indoorTempC: 21, etc.)

project state held in ProjectPage
  └─ passed to <ProjectEditor> as `project` + `rooms` + callbacks
       ├─ tab "details" → <ProjectForm project onUpdate={updateProject}/>
       │      onUpdate(patch) → setProject({...project, ...patch})
       │      (region change also injects REGION_DEFAULTS + getDefaultUValues())
       │
       ├─ tab "rooms"   → rooms.map(room => <RoomCard room project
       │                              onUpdateRoom onRemoveRoom calculateRoom/>)
       │      RoomCard internally:
       │        normalizeProjectSettings(project)
       │          → calculateRoom(room, normalizedProject)     [physics.ts]
       │          → runUltraCalc(room, res, project)            [ultraCalcAdapter.ts → ultraCalcLocked.ts]
       │          → buildLayout({...})                           [layoutEngine.ts]
       │          → resolveSidebarAssets(method, joist)          [sidebarResolver.ts]
       │        renders inputs (editable) + results (read-only) + <FloorLayoutSvg/> + <RightSidebar/>
       │
       └─ tab "summary" → <SummaryCard project
                               summary={useProjectSummary(rooms, project)}/>
              useProjectSummary re-runs calculateRoom + runUltraCalc for
              every room and aggregates totals.

Autosave: useEffect([project]) → setTimeout(800ms) → handleSaveProject(false)
  └─ saveProjectTodb(project, showMessage)  [firebaseHelpers.ts]
        └─ project.id exists? setDoc(merge:true) : addDoc + new uid()
```

## 4. Data flow: PDF export

```
User clicks "Export PDF" → handleExportPDF()
  1. handleSaveProject(false)         — save first, silently
  2. exportPDF(headerRef, detailRefs[], layoutRefs[], summaryRef)
       for each ref (already rendered off-screen with exportMode=true):
         html2canvas(element) → canvas → dataURL (JPEG for text, PNG for layout)
         jsPDF.addImage(...) onto an A4 page
       pdf.save("project-export.pdf")
```

The hidden export DOM (built directly inside `ProjectPage.tsx`, not via `ProjectExportView.tsx`) contains, per room: `<RoomDetailsExport>` (wraps `<RoomCard exportMode/>`) then `<RoomLayoutExport>` (wraps `<FloorLayoutSvg>` + `<RightSidebar>`), followed by a final summary page (`<ProjectForm exportMode/>` + `<SummaryCard/>`).

## 5. Data flow: authentication

```
AuthProvider (Context) ⇄ useProvideAuth-style logic in AuthProvider.tsx
  └─ observeAuth(callback)  [authClient.ts] → onAuthStateChanged(auth, cb)
       updates {user, loading} in context

LoginForm    → send_login_request()  → signInWithEmailAndPassword → navigate /dashboard
RegisterForm → registerAction()      → createUserWithEmailAndPassword
                                         → addDoc(users, payload)
                                         → (email-already-in-use fallback: try login)
ForgotPassword → sendResetEmail()    → sendPasswordResetEmail
Header logout  → logoutUser()        → signOut(auth)

ProtectedRoute / RedirectHandler read {user, loading} from AuthProvider context
  and gate/redirect routes accordingly (see src/routes/*).
```

## 6. Persistence model (Firestore)

Two top-level collections, both filtered client-side by `auth.currentUser?.uid` (there is no committed Firestore security-rules file in this repo checkout — access control is entirely enforced by these client-side query filters plus whatever server-side rules exist in the live Firebase project, which are not visible here):

- **`projects`** — documents are `ProjectSettings & { rooms: RoomInput[], userId, id }`, i.e. **rooms are embedded as an array field inside the project document**, not a separate subcollection. There's no pagination/size limit handling for very large room counts (Firestore's 1MB per-document limit is a theoretical ceiling for a project with very many rooms).
- **`users`** — documents keyed by an auto-generated Firestore doc ID but queried by a `userId` field (not the doc ID itself) — `getUserById`/`updateUserById` both `query(where("userId", "=="))` then operate on `querySnapshot.docs[0]`. This is a minor inefficiency (should ideally use the Firebase Auth UID as the Firestore document ID directly) but is the existing, working pattern.

## 7. Build & deploy

- **Vite** (`vite.config.ts`) — React plugin, base `/`, and a special `assetsInclude: ["**/*.PNG"]` rule to include uppercase-extension PNGs (the logo is referenced as `/assets/diagrams/logo.PNG` in some places and `/logo.png` in others — see [IMPROVEMENTS.md](IMPROVEMENTS.md)).
- **Tailwind** (`tailwind.config.js`) — content scanned from `index.html` + `src/**/*.{ts,tsx,js,jsx}`; a small custom palette (`primary`, `secondary`, `accent`) and one custom spacing value (`18: 4.5rem`) — most of the UI actually uses Tailwind's default palette (slate/blue/red/amber) directly rather than these custom tokens.
- **TypeScript** (`tsconfig.json`) — `noEmit: true`; type-checking happens via `tsc -b` as a pre-step in `npm run build`, before Vite bundles.
- There is a `.firebase/` directory and `dist/` present locally (build/deploy artifacts of Firebase Hosting), implying the app is deployed via **Firebase Hosting** — no `firebase.json`/`.firebaserc` was found in this pass; if deployment configuration is needed, check for it directly or ask the user, since it wasn't present in the reviewed file tree.
- **Capacitor** wraps `dist/` (`webDir: 'dist'`) into a native Android shell (`appId: 'com.example.app'` — a placeholder-looking app ID, worth confirming with the user before a real Play Store submission).

## 8. Cross-cutting concerns and where they live

| Concern | Where |
|---|---|
| Region-aware unit display | `src/utils/display.ts`, `src/helpers/updateUiLabels.ts` |
| Region-aware unit normalization (input → SI) | `src/utils/normalize.ts`, `normalizeProject.ts` |
| Region-aware result formatting (SI → display string) | `src/utils/formatResults.ts`, `formatRoomResults.ts`, `formatProjectSummary.ts` |
| Notifications/toasts | `src/contexts/SnackbarProvider.tsx` (`useSnackbar().showMessage`) |
| Auth guarding | `src/routes/ProtectedRoute.tsx`, `RedirectHandler.tsx` |
| ID generation | `src/utils/uid.ts` (`uid()` — random, non-persisted-uniqueness-checked string) |

## 9. Known architectural quirks (see also IMPROVEMENTS.md)

- Two independently-maintained implementations of the fin/tubing spacing table (`ultraCalcLocked.ts` and `ultraSpacingLocked.ts`).
- Two independently-maintained implementations of the `FloorLayoutSvg` component name (`src/layout/FloorLayoutSvg.tsx`, actually used, vs. `src/layout/FloorLayout.tsx`, unused dead code with a colliding export name).
- `src/components/export/ProjectExportView.tsx` exists as a self-contained export template but is not wired into `ProjectPage.tsx`'s actual export flow.
- Room identity is nominally `room.id` (a `uid()`-generated string) but every update/remove call site in `RoomCard.tsx`/`ProjectPage.tsx` actually keys by `room.name` instead — a latent bug if two rooms share a name.
- `src/validations.ts/` is a **directory** (containing `projectSchema.ts`, `roomSchema.ts`), not a single file — the `.ts` in the directory name is unconventional and could confuse tooling/glob patterns that assume a `.ts` suffix always denotes a file.

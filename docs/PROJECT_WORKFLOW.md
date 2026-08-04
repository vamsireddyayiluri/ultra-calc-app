# PROJECT_WORKFLOW.md — Project Creation/Editing Workflow Design Review

**This is a design review only. No application code has been changed to produce this document.** It proposes a direction for validation, drafts/autosave, the save workflow, and related UX — for discussion and approval before any implementation begins. See [../CLAUDE.md](../CLAUDE.md), [../AGENTS.md](../AGENTS.md), [BUSINESS_RULES.md](BUSINESS_RULES.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [DATA_MODELS.md](DATA_MODELS.md) for the background this review builds on. Where this document references a known issue already tracked in [AUDIT_REPORT.md](AUDIT_REPORT.md) (e.g. H6, H4, C5), it cites the finding rather than re-describing it.

---

## 1. Current workflow (as-is)

Traced directly from `src/pages/ProjectPage.tsx`, `src/components/forms/ProjectForm.tsx`, `src/components/rooms/RoomCard.tsx`, `src/services/firebaseHelpers.ts`, and `src/validations.ts/{projectSchema,roomSchema}.ts`.

1. **Create:** Navigating to `/project` (no id) builds a new in-memory `ProjectSettings & {rooms: []}` with hardcoded defaults (`region: "UK"`, `indoorTempC: 21`, `outdoorTempC: null`, etc.) and a client-generated `id: uid()`. Nothing is written to Firestore yet at this point.
2. **Edit:** Every field in `ProjectForm`/`RoomCard` calls `onUpdate(patch)` / `onUpdateRoom(name, patch)` synchronously on `onChange` (two fields — window/door area in `RoomCard` — use a local buffer + `onBlur` commit instead; every other field commits immediately on every keystroke). Each patch replaces `project` in `ProjectPage`'s React state via `setProject({...project, ...patch})` (or the equivalent room-array `.map()`).
3. **Autosave:** A single `useEffect(() => { const t = setTimeout(() => handleSaveProject(false), 800); return () => clearTimeout(t); }, [project])` in `ProjectPage.tsx` re-arms on every state change and, 800ms after the *last* edit, calls `handleSaveProject(false)`.
4. **Save:** `handleSaveProject()` calls `saveProjectTodb(project, showMessage)` (`firebaseHelpers.ts`), which does `setDoc(doc(db,"projects",project.id), project, {merge:true})` for an existing project, or `addDoc(...)` (assigning its own new id) for a brand-new one. This function currently **mutates its `project` argument directly** (`project.userId = ...`, `project.id = uid()`) rather than returning a new object — tracked as [AUDIT_REPORT.md H6](AUDIT_REPORT.md#h6-saveprojecttodb-mutates-the-passed-in-project-object-directly).
5. **Validation:** `projectSchema`/`roomSchema` (Zod) exist and are structurally complete, but the `.parse()` calls in `handleSaveProject()` are **commented out**. No validation runs anywhere in the current app — not on blur, not on submit, not before export. There is no inline error UI anywhere in `ProjectForm` or `RoomCard`.
6. **Manual "Save Project" button:** Calls the same `handleSaveProject()` (with the notification shown), bypassing the debounce timer but going through the identical, unvalidated write path.
7. **Export:** `handleExportPDF()` calls `handleSaveProject(false)` first, then rasterizes the hidden export DOM to a PDF — with no validation gate of any kind.

No local persistence (localStorage/IndexedDB) exists anywhere in the codebase today. There is no "unsaved changes" indicator, no draft concept, no offline handling, and no multi-tab coordination.

---

## 2. Problems with the current approach

### Validation
- **Fully disabled**, not partially — the commented-out code is the entire validation surface that has ever existed in this flow.
- **Root cause of why it's disabled (inferred directly from the code, not from commit history — flagged as an inference):** `ProjectPage.tsx#addRoom()` creates a brand-new room with `length_m: 0, width_m: 0, height_m: 0`. `roomSchema.ts` requires all three via `requiredPositiveNumber(...)`, which enforces `.positive()` (strictly `> 0`). The autosave `useEffect` fires 800ms after **any** project change — including the instant a blank room is added, before the user has typed anything into it. If the commented-out `roomSchema.parse(room)` call were live, clicking "+ Add Room" would cause the very next autosave tick to throw, since a freshly-created room fails validation by construction. This is a direct, demonstrable conflict between "autosave everything, including in-progress rooms" and "validate everything before saving" — almost certainly why validation was pulled rather than fixed.
- Even setting that conflict aside, the code **as written**, if re-enabled today, would only ever show **one** error at a time: `err.issues?.[0]?.message`. A project with 5 problems would show the first, get fixed, then reveal the second, and so on — a poor experience even once "working."
- No field-level, on-blur, or while-typing feedback exists at all — a user only ever finds out something is wrong (today: never, since it's disabled) at the moment of a full-project save, with no indication of *which* field or *which room*.
- No room-level or project-level "is this complete" signal exists anywhere in the UI.
- No cross-field validation exists (e.g. nothing stops `outdoorTempC` from being entered higher than `indoorTempC`, which is physically nonsensical for a heating calculation).
- No accessibility wiring for validation state (no `aria-invalid`, no `aria-describedby`, no focus management on a failed save attempt) — moot today since nothing validates, but a gap to design in from the start.

### Draft / Autosave
- **Every edit is one Firestore write away** (a single 800ms debounce), all-or-nothing — there's no cheaper, instant local safety net underneath it.
- **The last <800ms of edits before a tab close/crash/refresh are silently lost**, with zero warning — there's no `beforeunload` guard, no local draft to recover from.
- **No offline support whatsoever** — a network drop mid-edit means every subsequent autosave attempt fails; the error *is* surfaced via a toast (confirmed: `catch` block in `handleSaveProject` calls `showMessage(err.message, "error")` unconditionally, not gated by the `showNotification` flag), but there's no recovery path beyond "keep trying and hope the network comes back," and no indication of which edits, if any, actually made it to the server.
- **No "is my work saved?" indicator** — the user has no persistent signal distinguishing "saved," "saving," or "failed to save" outside of a transient toast on error.
- **No multi-tab or multi-device coordination** — two tabs (or a phone and a desktop) editing the same project will silently overwrite each other via last-write-wins `setDoc(..., {merge:true})`, with no warning to either side.
- **Every debounce tick writes the entire project document**, including all rooms, regardless of which single field actually changed — this gets proportionally more expensive (payload size, not necessarily Firestore write-op cost) as a project's room count grows.
- Compounded by [AUDIT_REPORT.md C5](AUDIT_REPORT.md#c5-editing-any-single-field-in-any-room-recomputes-heat-loss-and-material-calculations-for-every-room-in-the-project): every keystroke that triggers this save cycle is *also* triggering a full recompute of every room's calculations, independent of the persistence question but compounding the same root state-shape issue (whole-project immutable replace on every keystroke).

### Save workflow
- "Manual Save" and "autosave" are literally the same function with the same lack of validation — there's no meaningful distinction between an explicit, intentional save and a background one, which makes it impossible to attach different guarantees (e.g. "explicit saves must be valid") to either.
- [H6](AUDIT_REPORT.md#h6-saveprojecttodb-mutates-the-passed-in-project-object-directly): direct mutation of the `project` object inside `saveProjectTodb` violates the codebase's own stated convention of always updating state via new object references (per [../CLAUDE.md](../CLAUDE.md) §5/§7).

### User experience
- A contractor filling out a project room-by-room (plausibly across multiple sessions, possibly on an unreliable job-site connection — see [AUDIT_REPORT.md M9](AUDIT_REPORT.md#m9-region-change-silently-discards-manually-entered-advanced-settings) for a related real-world-usage assumption already made elsewhere in this project's audit) currently has no confidence their work is actually safe, no way to tell which rooms still need attention, and no warning before losing unsaved edits.

---

## 3. Alternative approaches to draft/autosave persistence

Evaluated against: pros/cons, offline support, performance, network usage, conflict handling, developer complexity, UX, recovery after refresh, multiple tabs, authentication, and large-project behavior.

### Option A — Immediate Firestore updates (a write per keystroke, no debounce)
| Dimension | Assessment |
|---|---|
| Pros | Simplest mental model — "always in sync." |
| Cons | Massive write amplification; one Firestore write op per keystroke; real cost implications at any scale. |
| Offline | None — every edit fails without network. |
| Performance | Poor — write-per-keystroke, felt as lag if ever awaited. |
| Network usage | Very high. |
| Conflict handling | None — rapid interleaved writes across tabs can race unpredictably. |
| Dev complexity | Low. |
| UX | Risk of visible errors/rate-limit friction surfacing constantly. |
| Recovery after refresh | Fine, if the last write landed. |
| Multiple tabs | Silent clobbering, worse than today (more frequent writes = more collision opportunities). |
| Auth | Breaks entirely the moment the session expires mid-edit, no local fallback. |
| Large projects | Full-document write cost grows with every keystroke regardless of project size. |

**Not recommended** — strictly worse than the current debounced approach on every axis except recency.

### Option B — LocalStorage drafts
| Dimension | Assessment |
|---|---|
| Pros | Zero network dependency; effectively instant (`localStorage.setItem`); survives refresh/crash; simple, well-understood API. |
| Cons | ~5–10MB ceiling (a non-issue for this app's per-project data size); per-browser, not per-device/synced; needs an explicit "promote to cloud" step; must be namespaced by user id to avoid leaking across accounts on a shared browser. |
| Offline | Excellent. |
| Performance | Excellent for this app's data volume (small JSON objects). |
| Network usage | Zero for the draft-save step itself. |
| Conflict handling | Only one local "slot" per browser per project — still needs an explicit reconciliation policy against the server copy (see §5). |
| Dev complexity | Low–medium (namespacing, versioning, a restore-prompt flow). |
| UX | Very responsive; needs a clear "this is local-only, not yet in your account" indicator to avoid false confidence. |
| Recovery after refresh | Excellent — exactly its purpose. |
| Multiple tabs | Same-browser tabs share the same key and can still clobber each other's *local* draft — mitigable with a `storage` event listener, not solved by default. |
| Auth | Works even through a session expiry (local-only), but needs care if a different user logs in on the same browser afterward. |

### Option C — IndexedDB drafts
| Dimension | Assessment |
|---|---|
| Pros | Much larger storage ceiling; async (won't block the main thread); native structured-data support. |
| Cons | Meaningfully more complex API (even wrapped) for no benefit at this app's actual data size — a project + its rooms is a small, flat-ish JSON object well within localStorage's comfortable range; adds a new dependency if using a wrapper library. |
| Offline | Excellent, same as B. |
| Performance | Excellent, async. |
| Network usage | Zero for draft-save. |
| Conflict handling | Same local-only considerations as B; transactional semantics help slightly with same-tab races but don't solve cross-tab/cross-device conflicts. |
| Dev complexity | Medium–high relative to the payoff here. |
| UX | Same end-state as B once built. |
| Recovery after refresh | Excellent. |
| Multiple tabs | Same caveats as B. |
| Auth | Same as B. |

**Assessment:** IndexedDB's advantages (large storage, async API, blob support) don't currently apply to Ultra-Calc's data shape. Worth revisiting only if the app later needs to cache large binary data locally (e.g. offline-cached PDF exports) — out of scope for this workflow.

### Option D — Debounced cloud saves (roughly today's behavior)
| Dimension | Assessment |
|---|---|
| Pros | Simple mental model; mostly already built; fewer writes than Option A. |
| Cons | No offline support at all; every tick still writes the *entire* project document; no true draft concept (an incomplete, invalid room is immediately "live" in the saved project); inherits H6's mutation issue; inherits the validation-vs-autosave conflict described in §2. |
| Offline | None. |
| Performance | Better than A, still a full-document write per tick. |
| Network usage | Moderate. |
| Conflict handling | None beyond last-write-wins. |
| Dev complexity | Low (already exists). |
| UX | Reasonable most of the time; no persistent saved/unsaved signal; the last <800ms of edits before a close/crash are silently lost. |
| Recovery after refresh | Fine unless the last debounce tick hadn't fired yet. |
| Multiple tabs | No coordination. |
| Auth | Silent failure surfaced only as a toast; the specific lost edit has no recovery path. |
| Large projects | Full-document write cost grows with room count on every tick. |

### Option E — Explicit Save button only (no autosave)
| Dimension | Assessment |
|---|---|
| Pros | Completely unambiguous "saved" state; predictable network usage; validation can gate the action cleanly. |
| Cons | Real data-loss risk if the user forgets to click Save, or the browser crashes, or they navigate away — a regression from even today's imperfect autosave; doesn't match the "always saving" expectation many users bring from similar tools. |
| Offline | None on its own. |
| Performance | Good — writes only on demand. |
| Network usage | Low. |
| Conflict handling | No better than D unless paired with additional work. |
| Dev complexity | Low. |
| UX | Risky without a local safety net underneath it. |
| Recovery after refresh | Poor on its own. |
| Multiple tabs | No coordination. |
| Auth | An expired session at Save-time is at least a visible, actionable error (better than a silent background failure). |

### Option F — Hybrid (local draft + debounced cloud sync + explicit save/export gate)
| Dimension | Assessment |
|---|---|
| Pros | Combines B's offline/instant safety net with D's reduced write volume and E's certainty at the moments that matter; cleanly separates "is this data safe from loss" (local, permissive) from "is this data good enough to hand to a customer" (cloud + strict validation) — directly resolves the validation-vs-autosave conflict identified in §2. |
| Cons | Most moving parts of any option; needs a defined conflict/reconciliation policy; more surface area to build and reason about; should be delivered incrementally, not as one large change. |
| Offline | Strong — local draft always available; cloud sync queues/retries. |
| Performance | Strong — local writes are instant/cheap; cloud writes are debounced. |
| Network usage | Lowest of the options that still keep reasonably fresh cloud data. |
| Conflict handling | Needs an explicit, simple policy (proposed in §4) — but the *local* copy is never silently lost, unlike D today. |
| Dev complexity | Highest, but tractable if phased (see §6 Migration Plan). |
| UX | Best-in-class if built well: clear saved/draft/syncing/failed states, recoverable across refresh, safe on flaky connections. |
| Recovery after refresh | Excellent — local draft is the source of truth for "what was I doing." |
| Multiple tabs | Still needs explicit handling (e.g. a `storage` event listener to detect a same-browser conflicting tab) but is strictly safer than D for the *local, unsaved* portion of any edit. |
| Auth | Local draft is immune to session expiry; only the cloud-sync half is affected, and it can retry once re-authenticated. |
| Large projects | Local draft writes stay cheap regardless of room count; cloud sync payload size is unchanged from today (a future partial-update optimization is possible but out of scope here). |

---

## 4. Recommendation

### 4a. Draft/autosave: adopt Option F (hybrid)

localStorage over IndexedDB (Option B > C) given Ultra-Calc's actual data shape — a project plus its rooms is a small, JSON-serializable object, well inside localStorage's practical limits, and the simpler synchronous API is easier to reason about and build incrementally than IndexedDB's async/transactional model, for no loss of capability at this data size.

### 4b. Validation: a layered system, decoupled from persistence

Reuse the existing `projectSchema`/`roomSchema` Zod schemas — they're well-built (the `preprocess`-to-sentinel pattern for friendly required-field messages is a good pattern worth keeping) and already represent an approved shape of what "valid" means. Recommended extensions, not replacements:

1. **A `ProjectValidator` wrapper** (see §5) exposes `safeParse`-based helpers that return a **field-keyed error map** (`Record<string, string>`) instead of throwing/returning only the first issue — this is the single change that fixes the "only shows one error at a time" problem, without altering what the schemas actually check.
2. **Two validation "strengths," not two schemas where avoidable:**
   - **Draft-permissive:** no blocking validation at all — this is what the local draft and background cloud sync use. An in-progress room with `length_m: 0` is a perfectly valid *draft*.
   - **Strict (the existing schemas as-is):** used only at explicit checkpoints — see the "when to validate" table below.
3. **Room-level and project-level rollup:** a room "is complete" when `roomSchema.safeParse(room).success`; a project "is complete" when its own schema passes **and** every room passes. This rollup is what drives room-tab badges and the overall "ready to export" state — it's a derived computation over the existing schemas, not a new validation concept.
4. **Cross-field validation via Zod's `.superRefine()`**, added to the existing `projectSchema` (still one schema, just a richer one): e.g. `outdoorTempC <= indoorTempC` as a sanity check. Kept minimal at first — resist the urge to add many speculative cross-field rules before real usage data suggests they're needed.

**When should validation run:**

| Trigger | Validation strength | Behavior |
|---|---|---|
| While typing | None | No error shown while a field is mid-edit — avoids flashing errors on an incomplete keystroke sequence (e.g. typing "-" before "5"). |
| On blur | Field-level (single field, via the relevant schema's shape for that key) | Show/clear an inline error for just that field. This is the same commit point already used for window/door area's buffer-then-`onBlur` pattern in `RoomCard` — extending validation to hook into that existing pattern (see §6 Phase 3) is more consistent than inventing a new trigger point. |
| Local draft save | None (draft-permissive) | Never blocks — this is the safety net, it must never refuse to capture the user's current state. |
| Background cloud sync | None (draft-permissive) | Same reasoning — an in-progress project must still be backed up to the cloud, not just held hostage locally until it's "finished." |
| Explicit "Save" (marking complete) / Export | Strict (full project + all rooms) | Blocks the action if invalid; shows the validation summary panel (see §5 UX) with jump-to-field navigation. This is the only point where "prevents invalid projects from being saved [as complete] / exported" is actually enforced — see §7 Risks for why blocking earlier than this is the wrong call for this app. |
| Before a room's calculation is prominently displayed as a "real" result | Soft (informational only) | `calculateRoom()` already guards `area > 0` and won't crash on a `0`-dimension room, but showing "0 W" for an untouched room reads as a real (wrong) answer. Recommend the UI show a "Enter room dimensions to see results" placeholder instead of a numeric 0 when the room's core geometry fields are still empty/zero — a display-layer decision, not a change to `calculateRoom()` itself. |

**Error UX:**
- Inline: red border + red helper text under the field (consistent with the app's existing red-* Tailwind usage for warnings).
- Room-level: a small badge on each room's card/tab (e.g. "3 fields need attention") when that room fails strict validation — informational at all times, blocking only at the Save-complete/Export checkpoints above.
- **Validation summary panel:** shown when a strict-validation checkpoint fails — one panel listing every failing field, grouped by "Project Details" and "Room N: <name>", each entry a clickable link that switches to the right tab/room and scrolls to + focuses the field. Visually, this can reuse the existing `SectionCard`/list styling already established in `SummaryCard.tsx` rather than inventing a new visual language.
- **Accessibility:** `aria-invalid="true"` + `aria-describedby` pointing at the error message's `id` on every invalid input; the summary panel gets `role="alert"`/`aria-live="polite"` so screen readers announce it when a Save/Export attempt fails; focus moves to the summary panel (or the first invalid field) on a failed strict-validation attempt, directly satisfying "navigation to invalid fields" in a way that also works for keyboard/screen-reader users, not just mouse users.

---

## 5. Recommended workflow (Option F, concretely)

```
Create Project
  → in-memory ProjectSettings + rooms:[], client-generated draftId (uid())
  ↓
Edit locally (instant, same as today — every keystroke updates React state,
               live calculations run exactly as they do now)
  ↓
Local draft autosave (localStorage, ~300–500ms debounce, draft-permissive —
                       never blocked by validation)
  → "Unsaved changes indicator" updates: "Draft saved locally · just now"
  ↓
Debounced cloud sync (Firestore, ~2–5s debounce, draft-permissive —
                       backs up in-progress work without requiring completeness)
  → indicator updates: "Synced to cloud · just now" (or "Offline — will sync
     when back online" / "Sync failed — changes safe locally" on error)
  ↓
Explicit "Save" (user-initiated)
  → always forces an immediate cloud sync (draft-permissive, same as above)
  → additionally runs STRICT validation; if it passes, marks project status
    "complete" (surfaced on the dashboard); if it fails, project remains
    status "draft" — the save of the underlying data still succeeds (it's
    not lost), only the "complete" marker is withheld, with a summary of
    what's still needed
  ↓
Export PDF
  → always runs STRICT validation first; blocks + shows the validation
    summary if invalid; proceeds to the existing exportPDF() flow unchanged
    if valid
  ↓
Local draft retained (not aggressively cleared) as a fallback even after a
successful cloud sync — pruned opportunistically (age-based, or LRU if
approaching storage limits), not deleted the instant a sync succeeds
```

**On (re)opening a project:** fetch the cloud copy as today, but also check for a local draft for that project id. If a local draft exists and is newer than the fetched cloud copy's own last-sync timestamp, show a dismissible prompt: *"You have local changes from [relative time] not yet confirmed in the cloud — Restore / Discard."* Restoring loads the local draft into state (as if the user had just made those edits); discarding clears the local draft and uses the cloud copy.

### Why this shape fits Ultra-Calc specifically

- It's a **live calculator**, not just a form — every keystroke needs to feel instant, which is already true today because calculations run from local React state. This workflow doesn't touch that at all; it only changes what happens to *persistence*, which is exactly the layer with all the current problems.
- Contractors plausibly build a project up **across multiple sessions**, sometimes on **unreliable job-site connectivity** — local-draft-first is a direct, practical fit, not a speculative nice-to-have.
- It resolves the exact tension that appears to have caused validation to be disabled in the first place: "safety net" persistence (local draft, cloud backup) is permissive by design; "is this good enough to hand to a customer" validation is strict but only gated at the two moments that actually matter (marking a project complete, exporting a PDF) — never at the cost of losing a keystroke.

---

## 6. UX improvements (beyond the core workflow)

- **Unsaved-changes indicator** — a persistent, small status element (toolbar, near Save/Export) cycling through: *All changes saved* / *Draft saved locally* / *Saving…* / *Sync failed — saved locally* / *Offline — will sync automatically*.
- **Autosave status with relative timestamps** — "Synced 3m ago," "Draft saved 12s ago."
- **Restore-draft dialog** — as described in §5, on project open.
- **Discard draft** — an explicit, `ConfirmDialog`-gated destructive action ("Discard local changes and reload from cloud"), reusing the existing confirm-dialog pattern already used for project deletion, rather than a new bespoke component.
- **Save confirmation** — keep the existing snackbar toast, but make its message explicit about draft vs. complete status ("Saved as draft — 2 rooms need attention" vs. "Project saved and marked complete").
- **Version history** — explicitly **out of scope** for this recommendation's first pass; flagged here only as a natural future extension (e.g. an optional, pruned `projects/{id}/history` subcollection snapshot on each successful cloud sync) once the core draft/validation system is stable.
- **Recover unsaved work** — covered by the restore-draft flow; no separate mechanism needed.
- **Validation summary** — as described in §4b.
- **Draft timestamps** — shown in both the status indicator and the restore-draft prompt.
- **Offline mode** — listen to `navigator.onLine`/`online`/`offline` events; while offline, the cloud-sync half of the status indicator reads "Offline," and the debounced cloud sync simply pauses/retries rather than surfacing repeated failure toasts.

---

## 7. Proposed architecture (design only — names/shapes for discussion, not final code)

| Module | Role | Relationship to existing code |
|---|---|---|
| **`ProjectValidator`** (`src/utils/projectValidator.ts`) | Wraps `projectSchema`/`roomSchema`. Exposes `validateProjectStrict`, `validateRoomStrict`, and `getFieldErrors(...)`-style helpers that turn Zod's `safeParse` issues into a field-keyed error map for the UI. Adds the room/project "is complete" rollup and any cross-field `.superRefine()` rules. | **Extends** the existing schemas — does not replace or duplicate their field definitions. Framework-agnostic, consistent with the codebase's existing "logic lives in `utils/`, not components" convention. |
| **`DraftService`** (`src/services/draftService.ts`) | Thin, namespaced wrapper over `localStorage`: `saveDraft(uid, projectId, project)`, `loadDraft(uid, projectId)`, `clearDraft(uid, projectId)`. Encapsulates the storage key scheme and serialization so nothing else touches `localStorage` directly. | New, small, single-purpose file — sibling to `firebaseHelpers.ts` in spirit (a persistence adapter), not a replacement for it. |
| **`ProjectPersistenceService`** | A reshaping of the relevant parts of today's `firebaseHelpers.ts`: `syncProjectDraft(project)` (permissive — used by the background cloud sync and manual promotion) vs. `saveProjectComplete(project)` (runs `ProjectValidator.validateProjectStrict` first; on success, performs the same Firestore write plus a `status: "complete"` field). Also where [H6](AUDIT_REPORT.md#h6-saveprojecttodb-mutates-the-passed-in-project-object-directly)'s mutation fix naturally belongs, since it touches the same function. | **Reuses** `saveProjectTodb`'s actual Firestore-write logic — this is a reshaping/renaming for clearer intent, not a rewrite from scratch. |
| **`ProjectDirtyTracker`** (a hook, e.g. `useProjectDirty(current, lastSynced)`) | Compares current in-memory state against the last-known-synced snapshot and returns a status enum (`"saved" \| "dirty-local" \| "syncing" \| "sync-failed" \| "offline"`) purely to drive the status indicator. | New, small, UI-facing hook — deliberately kept separate from the actual save logic so each piece stays simple to reason about. |
| **`useAutosave`** (hook, replaces `ProjectPage.tsx`'s inline `useEffect`) | Owns both the fast local-draft debounce and the slower cloud-sync debounce; internally uses `DraftService` + `ProjectPersistenceService`; exposes status (via `ProjectDirtyTracker`) for the UI. | **Replaces** the current inline autosave `useEffect` in `ProjectPage.tsx`, centralizing "what triggers a save" in one testable place instead of embedding it directly in the page component. |

All of the above are **extensions or reshapings of existing utilities** (`projectSchema`/`roomSchema`, `firebaseHelpers.ts`) plus a small number of genuinely new, narrowly-scoped modules (`DraftService`, the two hooks) — consistent with "prefer extending existing utilities over creating new ones."

---

## 8. Migration plan

Phased so each step is small, independently reviewable, and independently verifiable by hand (no automated test suite exists — per your earlier decision, verification at each phase will be manual, so keeping each phase small directly reduces risk).

| Phase | Description | Behavior change to users? |
|---|---|---|
| **0 — Prep** | Add `ProjectValidator` wrapping the existing schemas; manually verify it produces the same pass/fail results as calling `.parse()` directly today, just restructured for field-level output. Not wired into any UI yet. | None — purely additive, inert code. |
| **1 — Local draft safety net** | Add `DraftService`; wire a local-draft-save effect into `ProjectPage.tsx` **in addition to** (not replacing) the existing Firestore autosave. Add the restore-draft-on-load prompt. | Additive only — existing save behavior is untouched; users gain crash/refresh recovery. |
| **2 — Status indicator** | Add `ProjectDirtyTracker` and the visible Saved/Draft/Saving/Failed UI element. | Additive UI only — no change to *what* or *when* anything is saved. |
| **3 — Non-blocking inline + room-level validation** | Wire `ProjectValidator`'s field-level errors into `ProjectForm`/`RoomCard` as on-blur inline messages and room-tab badges. **Does not block save or autosave at this phase** — purely informative. This is the lowest-risk way to reintroduce validation UX without repeating the original "validation blocks autosave on a fresh blank room" problem. | Users start seeing helpful inline errors; nothing is newly blocked. |
| **4 — Strict validation gate (Export + explicit Save-complete)** | Wire `ProjectValidator.validateProjectStrict` into `handleExportPDF` (block + show summary if invalid) and into a new explicit "Mark Complete" action. **This is the first phase that can actually block a previously-always-succeeding action** — requires its own explicit re-approval before starting, separate from the approval for this document, and a data-shape check of existing saved projects first (see §9 Risks). | First user-visible *blocking* behavior — needs the most care. |
| **5 — Replace direct-to-Firestore autosave with debounced sync-from-draft; fix H6** | Rework the autosave `useEffect`/`handleSaveProject` into `useAutosave` + `ProjectPersistenceService`; fix `saveProjectTodb`'s argument mutation as part of the same touch (called out and approved as its own reviewable diff within this phase, not silently bundled). | Changes the persistence mechanism's internals; user-facing behavior should be equivalent to Phase 1–2's indicator promises, just now backed by the real service split. |

Each phase should land as its own small change, reviewed and approved individually — consistent with the "never mix unrelated fixes" rule already in place for this engagement.

---

## 9. Risks

- **Local vs. cloud divergence across devices:** editing on desktop, then opening on a phone before the desktop's cloud sync completes, could show two different "latest" states. Mitigation: the restore-draft prompt must clearly state *which* copy is newer (by timestamp), and default to *not* silently overwriting either side without the user's choice.
- **Storage quota:** unlikely to matter at this app's data size, but `DraftService` should catch `QuotaExceededError` and fail soft (fall back to cloud-only behavior with a warning) rather than crash.
- **Re-enabling validation, even non-blocking (Phase 3), changes what users see for the first time in the app's life** — worth a review pass to confirm the existing Zod messages read well for a real installer audience, not just as technically-correct error text.
- **Phase 4 is the highest-risk phase** — it can newly block a previously-working Save/Export flow, including for old saved projects that may not conform to the current schema shape. This mirrors the caution already flagged for [H4](AUDIT_REPORT.md#h4-zod-validation-is-fully-implemented-but-disabled) in the audit — a data-shape check of existing production projects against the strict schema should happen *before* Phase 4 ships, not after.
- **Scope boundary:** nothing in this design proposes touching `physics.ts`, `ultraCalcLocked.ts`, `waterTable.ts`, `regionDefaults.ts`, or any other file listed in [BUSINESS_RULES.md](BUSINESS_RULES.md) §1 — this workflow sits adjacent to the calculation engine (`RoomCard` calls `calculateRoom()` directly) but does not change how, when, or with what inputs it's called. Worth stating explicitly given how close this area sits to the locked calculation files.

---

## 10. Estimated implementation order

| Order | Phase | Effort (S/M/L) | Risk | Depends on |
|---|---|---|---|---|
| 1 | Phase 0 — `ProjectValidator` wrapper | S | Very low | — |
| 2 | Phase 1 — Local draft safety net + restore prompt | M | Low | Phase 0 (uses validator only for the draft-permissive rollup display, not blocking) |
| 3 | Phase 2 — Status indicator | S | Very low | Phase 1 |
| 4 | Phase 3 — Non-blocking inline/room validation | M | Low | Phase 0 |
| 5 | Phase 4 — Strict validation gate on Save-complete/Export | M | Medium — needs separate approval + a data-shape check first | Phases 0, 3 |
| 6 | Phase 5 — Full autosave rework (`useAutosave`, `ProjectPersistenceService`, H6 fix) | L | Medium — touches the core persistence path | Phases 1, 2 |

Recommended sequencing note: Phases 1–3 can land in roughly this order with low risk and immediate user-visible benefit (crash recovery, visibility, helpful inline errors) well before the higher-risk Phase 4/5 work begins — each should still get its own explicit approval per the established one-issue-at-a-time process, this table is a suggested order, not a bundled approval.

---

## Constraints honored while producing this document

Per the task instructions: this is a design review only. No application code was modified. Nothing in [BUSINESS_RULES.md](BUSINESS_RULES.md) §1 was touched or is proposed to be touched by this design. Implementation does not begin until each phase above is individually explained, approved, and then implemented in isolation, per the process already established for this engagement.

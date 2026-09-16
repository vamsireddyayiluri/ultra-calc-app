# Plan Import Implementation Status

## Purpose

This document records the current browser-only plan import implementation and the recommended next phases. The workflow remains isolated from the existing manual project editor, RoomInput model, calculation logic, Firebase persistence, and backend infrastructure.

## Current Workflow

```text
PDF file selected
  -> PDF.js loads the file in the browser
  -> PDF page rendered to visible preview canvas
  -> Same page rendered to hidden high-resolution analysis canvas
  -> Optional Tesseract.js OCR
  -> Deterministic room-label detection
  -> Deterministic dimension candidate detection
  -> Spatial dimension evidence classification
  -> User selects an OCR room label
  -> High-resolution room crop generated
  -> Crop validation
  -> Mock or optional browser Gemini draft analysis
  -> Draft review only
```

No output from this workflow is currently converted into `RoomInput`, saved to a project, persisted, or used by calculations.

## Implemented Features

### Project entry flow

Implemented in the production React app:

- `/project/new` creation-choice page
- `Create Manually` routes to the existing `/project` flow
- `Upload Plans` routes to `/project/import`
- `/project/import` keeps selected files in local React state only

### Browser PDF foundation

Implemented under `src/plan-import/browser/`:

- `pdfDocument.ts`
  - Reads `File.arrayBuffer()`
  - Loads PDF documents with `pdfjs-dist`
  - Configures the PDF.js worker through the Vite `?url` import
  - Reports page count

- `pdfText.ts`
  - Extracts text-layer diagnostics for the selected page
  - Reports text item count, non-empty item count, character count, and a preview

- `pdfRenderer.ts`
  - Renders a bounded visible preview
  - Renders a separate high-resolution analysis canvas
  - Keeps analysis coordinates independent from the visible preview coordinates

### Browser OCR

Implemented in `src/plan-import/browser/ocr.ts`:

- Uses `tesseract.js` in the browser
- Runs only after the user clicks `Run OCR`
- Uses the high-resolution analysis canvas
- Configures sparse-text page segmentation for architectural sheets
- Uses a 300-DPI hint
- Preserves OCR text, confidence, and word bounding boxes
- Reports OCR progress and errors in the UI

### Deterministic analysis

Implemented under `src/plan-import/core/`:

- `dimensionCandidates.ts`
  - Detects feet/inches-like OCR structures
  - Normalizes feet, inches, and decimal feet
  - Preserves original text and bounding boxes
  - Classifies candidates as high, medium, uncertain, or rejected
  - Applies deterministic plausibility checks

- `roomLabels.ts`
  - Groups compact OCR words into likely room labels
  - Preserves label text, confidence, and bounding boxes
  - Detects common room terms without assigning dimensions

- `spatialDimensionContext.ts`
  - Scans the analysis canvas for nearby dark line evidence
  - Counts nearby dimension candidates and room labels
  - Preserves horizontal/vertical line scores and reasons
  - Can promote only when deterministic spatial evidence supports the candidate
  - Does not associate dimensions with rooms

- `planAnalysis.ts`
  - Combines OCR observations, room labels, dimension candidates, and spatial context
  - Preserves before-spatial and after-spatial classification summaries

- `validateRoomCrop.ts`
  - Confirms the selected label is inside the crop
  - Confirms the selected OCR label tokens appear inside the crop
  - Counts competing room labels
  - Counts dimensions inside or near the crop
  - Validates crop padding and surrounding context
  - Produces `ready`, `review`, or `insufficient`

### Browser room crops

Implemented in `src/plan-import/browser/roomCrop.ts`:

- Creates PNG data URLs from the high-resolution analysis canvas
- Uses OCR label coordinates, not visible preview coordinates
- Preserves source page, source image dimensions, crop bounds, label bounds, and padding
- Does not attach dimensions to the crop or room

### Browser AI draft layer

Implemented under `src/plan-import/ai/`:

- `contracts.ts`
  - Defines `BrowserAiClient`
  - Defines `AiDraftAnalysis`, `AiDraftRoom`, and `AiDimension`
  - Keeps AI draft data separate from `RoomInput`

- `mockBrowserAiClient.ts`
  - Default provider
  - Echoes deterministic evidence for local UI testing
  - Makes no external call

- `browserConfig.ts`
  - Reads `VITE_GEMINI_API_KEY`
  - Defines the browser experiment model
  - Displays an explicit browser-key exposure warning

- `geminiBrowserAiClient.ts`
  - Optional browser-only Gemini provider
  - Sends the selected crop plus deterministic OCR evidence
  - Validates and normalizes Gemini response variants
  - Retries transient 503/high-demand errors with bounded backoff
  - Forces draft output to remain review-required

The page lets the user choose Mock or Gemini. Mock remains the default.

## Current AI Draft Contract

The current draft contract is intentionally not a production room model:

```ts
interface AiDraftAnalysis {
  provider: "mock-browser" | "gemini-browser";
  analyzedAt: string;
  room: AiDraftRoom;
}

interface AiDraftRoom {
  name: string | null;
  sourcePage: number;
  crop: RoomCropMetadata;
  dimensions: AiDimension[];
  confidence: number;
  reviewRequired: boolean;
  missingInformation: string[];
  warnings: string[];
  evidence: string[];
}
```

AI drafts do not create or update:

- `RoomInput`
- `ProjectSettings`
- Project state
- Firebase documents
- Calculations
- Geometry models

## What Has Been Validated

The separate `ultra-calc-ai-test` project established the following concepts using the sample plan:

- PDF page rendering
- OCR and bounding boxes
- Room-label localization
- Dimension candidate normalization
- Spatial dimension evidence
- Targeted room crops
- Targeted AI room analysis
- Orientation-aware normalization and deduplication
- Rectangular geometry experiments
- Draft mapping toward the Ultra-Fin room shape

The production browser implementation has reproduced the deterministic foundation and supports optional targeted browser Gemini drafts.

Known sample behavior:

- High-resolution OCR is materially better than the low-resolution preview
- Room labels and dimensions remain noisy on dense architectural sheets
- Multiple dimensions can belong to different segments of the same room
- Complex rooms such as bathrooms require review
- AI confidence is not proof that a dimension is a complete room span

## Current Limitations

### Security

A `VITE_GEMINI_API_KEY` is compiled into the browser bundle and is visible to users. This is acceptable only for a restricted local experiment key with quotas and restrictions. It is not a production deployment pattern.

Any key exposed in source, logs, screenshots, or shared environment files should be revoked or rotated.

### OCR

Tesseract can emit warnings for tiny architectural text fragments such as:

- `Image too small to scale`
- `Line cannot be recognized`

These are non-fatal OCR warnings, but they contribute to noisy observations and false positives.

### Coordinates

OCR coordinates are high-resolution analysis-canvas coordinates. They are not visible-preview CSS coordinates. Any future overlay must apply an explicit scale transform.

### AI output

Gemini can return plausible but incorrect interpretations, including:

- Multiple dimensions with the same orientation
- Internal segment dimensions instead of overall room spans
- Dimensions from adjacent spaces
- Confidence strings instead of numeric confidence
- Evidence as a string instead of an array

The adapter normalizes some response variants, but every AI result remains review-only.

### No import boundary yet

The current page does not:

- Create a project
- Add draft rooms to project state
- Complete missing room fields
- Validate a completed `RoomInput`
- Persist files or analysis results
- Calculate heat loss or materials

## Next Phases

### Phase 1: Browser analysis hardening

Status: **in progress / next immediate work**

Recommended work:

1. Reduce Gemini prompt payloads to OCR evidence inside or near the selected crop rather than sending large page-wide observation sets.
2. Add explicit crop-local OCR evidence filtering.
3. Add a visual/manual comparison checklist for selected crops.
4. Preserve raw Gemini response text alongside the normalized draft for debugging.
5. Add deterministic tests for dimension parsing, label grouping, crop validation, and response normalization.
6. Add cancellation handling for OCR, PDF rendering, and Gemini requests.
7. Add user-facing retry states for transient Gemini failures.

Exit criteria:

- Crop validation is stable for several page-4 room labels.
- Gemini input is crop-local and bounded.
- Malformed responses never reach the draft review panel.
- Mock mode remains fully usable without a key.

### Phase 2: Draft review experience

Build a review-only interface for `AiDraftRoom`:

- Room name review
- Dimension list with raw text and normalized value
- Orientation display
- Crop image and source page
- OCR evidence versus AI interpretation
- Confidence and warning display
- Accept/reject individual dimensions
- Explicit confirmation for medium-confidence results
- Complex-room review state

Still do not create `RoomInput` automatically.

### Phase 3: User completion boundary

Create a local-only completion model separate from the production project:

```text
AiDraftRoom
  -> user confirms/rejects AI evidence
  -> user fills missing fields
  -> draft completion validation
  -> final RoomInput candidate
```

Use the existing production room validation rules conceptually, but do not insert rooms into the project until the completion UX is explicitly approved.

Required manual fields will include values such as:

- Height
- Exterior wall length
- Window area
- Door area
- Setpoint
- Ceiling exposure
- Floor exposure
- Install method
- Other room configuration fields required by the current model

### Phase 4: Local multi-room import prototype

Once one-room review is reliable:

- Analyze multiple selected crops
- Preserve each crop and raw response locally
- Show room-level status: ready, review, rejected
- Allow users to confirm which drafts may proceed
- Keep complex rooms review-only
- Do not persist or update the existing project yet

### Phase 5: Production project integration design

Before inserting anything into the existing editor, define the boundary:

```text
AiDraftRoom[]
  -> completed and validated RoomInput[]
  -> explicit user confirmation
  -> existing project editor
```

At this stage decide whether imported rooms:

- initialize a new project
- append to an existing draft project
- require duplicate-name handling
- require cancellation/rollback
- need local recovery after refresh

### Phase 6: Backend migration decision

Only after browser behavior is validated should backend architecture be chosen.

Possible next architecture:

```text
React frontend
  -> authenticated analysis service
  -> PDF/OCR/Gemini processing
  -> AiDraftAnalysis response
  -> browser review
```

Backend migration would be required for:

- production secret protection
- large files
- long-running analysis
- reliable retries
- persistence and audit history
- multi-user workflows
- rate limiting and cost controls

## Explicitly Out of Scope

The following are not implemented and should not be added accidentally during the browser experiment:

- Automatic room-dimension association
- Room geometry calculation
- Irregular room polygons
- Automatic RoomInput creation
- Project creation from AI results
- Firebase Storage
- Firestore persistence for uploads/results
- Cloud Functions
- Cloud Run
- Background analysis jobs
- Production Gemini secrets
- Calculation or materials integration

## Current Safe Boundary

The safest current boundary is:

```text
Browser PDF
  -> browser OCR
  -> deterministic evidence
  -> validated crop
  -> optional browser AI draft
  -> manual review only
```

The next meaningful product step is a review UI that lets a user compare the crop, OCR evidence, AI interpretation, and warnings before any production room object is considered.

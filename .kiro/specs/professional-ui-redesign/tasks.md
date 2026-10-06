# Implementation Plan: Professional UI Redesign

## Overview

Frontend-only redesign of the React 19 + Vite 8 + Tailwind v4 SPA under `frontend/`, implemented in JavaScript/JSX as specified in the design. The plan builds bottom-up: test tooling, then design tokens, then pure logic modules in `src/lib/` (each with property-based tests for the design's Correctness Properties), then UI primitives in `src/components/ui/`, then the view refactors, and finally static-scan and API contract tests. Backend endpoints, request payloads, response field names, the 3-second auto-save debounce and the stable meeting `id` must stay unchanged throughout.

All commands run in PowerShell from `frontend/` and use `;` as the separator. Do not start `npm run dev` or `uvicorn` from automation.

## Tasks

- [x] 1. Set up frontend test tooling
  - [x] 1.1 Add pinned test dependencies, the `test` script and the Vitest config block
    - From `frontend/` run `npm install --save-dev --save-exact vitest@5.0.3 jsdom@30.1.2 @testing-library/react@16.3.3 @testing-library/user-event@14.6.7 @testing-library/jest-dom@7.0.1 fast-check@4.10.2`
    - Add `"test": "vitest --run"` to `scripts` in `frontend/package.json` (single run, no watch mode)
    - Add a `test` block to `frontend/vite.config.js`: `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.js']`, `include: ['src/**/*.test.{js,jsx}']`, `restoreMocks: true`; keep `build.outDir`, `emptyOutDir` and the `/api` proxy unchanged
    - _Requirements: 13.8_

  - [x] 1.2 Create the test setup file, lint config for tests and a smoke test
    - Create `frontend/src/test/setup.js` importing `@testing-library/jest-dom/vitest` and registering `cleanup` in `afterEach`
    - Add a block to `frontend/eslint.config.js` for `src/**/*.test.{js,jsx}` and `src/test/**` that adds `globals.node` (for `fs`/`path` in static-scan tests) and Vitest globals if used
    - Add `frontend/src/test/smoke.test.js` asserting that jest-dom matchers and `fast-check` load, so `npm run test` passes from the start
    - Verify with `npm run test; npm run lint`
    - _Requirements: 13.8_

- [x] 2. Design tokens and document shell
  - [x] 2.1 Replace `frontend/src/index.css` with the single `@theme` token block and base rules
    - Keep `@import "tailwindcss";` and define exactly one `@theme` block that first resets `--color-*`, `--radius-*`, `--shadow-*`, `--font-*`, `--text-*` to `initial`
    - Add neutral, primary navy, gold accent, semantic fg/bg/border triplets, focus, `doc-*` colours, system-only sans and mono font stacks, the 6-step type scale (12px–30px with line heights), radii `sm|md|lg|full`, shadows `sm|md`, `--ease-standard`, `--duration-fast`, `--container-content`, `--aspect-a4` exactly as listed in the design
    - Add `@layer base` rules (`html` neutral-50 background and `scroll-padding-top`, `body` font/size/line-height, global `:focus-visible` 2px navy outline with 2px offset) and the `prefers-reduced-motion: reduce` rule; remove the old `fadeIn` keyframes and custom scrollbar colours
    - _Requirements: 1.1, 1.9, 2.2, 2.7, 3.1, 3.2, 3.3, 3.6, 3.8, 3.9, 9.6, 10.2, 10.10_

  - [x] 2.2 Update `frontend/index.html` and delete `frontend/src/App.css`
    - Set `<html lang="ms">` and `<title>Penjana Minit Mesyuarat</title>`; make sure no third-party font links exist
    - Delete `frontend/src/App.css` and confirm nothing imports it
    - _Requirements: 1.7, 3.2, 5.7, 10.12_

  - [x] 2.3 Write token and contrast tests for the `@theme` block
    - `src/test/static/tokens.test.js`: parse the `@theme` block in `src/index.css`; assert the namespace resets, exactly one sans and one mono stack, 4–6 `--text-*` sizes within 12–32px with body ≥ 14px and body line heights ≥ 1.5, radii ≤ 8px except `--radius-full`, h1 (`xl`) ≥ h2 (`lg`) > h3 (`base`) > body (`sm`)
    - `src/test/static/contrast.test.js`: compute WCAG relative-luminance contrast for every pair in the design's contrast table from parsed token values and assert each meets its threshold (4.5 or 3)
    - _Requirements: 1.1, 2.7, 2.10, 3.1, 3.3, 3.6, 3.9, 6.3, 10.1, 10.2_

- [x] 3. Foundation lib modules: class joiner, terminology, dates, status
  - [x] 3.1 Create `src/lib/cx.js` and `src/lib/terminology.js`
    - `cx(...parts)` joins truthy complete class strings with a single space
    - `terminology.js` exports the frozen `T` object from the design (app, nav, actions, status, headings, messages incl. `savedAt(hhmm)`, ops, success incl. `loadFile(name)`, views titles/descriptions, months)
    - _Requirements: 1.6, 5.1, 5.2, 5.3, 5.6, 5.7_

  - [x] 3.2 Write unit tests for the terminology module
    - `src/lib/terminology.test.js`: every `T.views.*.description` is ≤ 120 characters; `T.actions` values are unique (one term per concept); none of "Overview", "No date", "No location", "Edit", "Ubah", "Hapus" appears in any string value; `T.months` has the 12 Bahasa Melayu month names in order
    - _Requirements: 3.4, 5.2, 5.3, 5.4_

  - [x] 3.3 Implement `src/lib/dates.js`
    - `parseCalendarDate`, `formatDisplayDate`, `compareCalendarDates`, `todayLocal(now)` following the deterministic parsing rules in the design (ISO `YYYY-MM-DD` with optional ignored time part, `D/M/YYYY` legacy form, Gregorian range checks, no `Intl`, no UTC parsing)
    - `formatDisplayDate` returns `"DD <Bulan> YYYY"` or `T.messages.noDate`; never mutates its input
    - _Requirements: 5.4, 5.5, 6.5, 6.6, 12.3, 12.6_

  - [x] 3.4 Write property test for display date round trip
    - **Property 1: Display date format round trip**
    - **Validates: Requirements 5.4, 12.6**
    - In `src/lib/dates.test.js`; generate year 1000–9999, month 1–12, day bounded by days-in-month (leap years included), optional time suffix; `numRuns: 100`; tag comment `// Feature: professional-ui-redesign, Property 1: ...`

  - [x] 3.5 Write property test for invalid or empty dates
    - **Property 2: Invalid or empty dates display "Tiada tarikh"**
    - **Validates: Requirements 5.5, 6.6**
    - In `src/lib/dates.test.js`; generators from the design (`fc.anything()`, blank strings, `'2026-02-30'`, `'2026-13-01'`, `'Invalid Date'`, random text); assert the record object is deeply unchanged

  - [x] 3.6 Implement `src/lib/status.js`
    - `STATUS_KEYS`, `STATUS_CONFIG` (label, tone, lucide `Icon`: `PencilLine`, `CircleCheck`, `Circle`, `Clock`, `TriangleAlert`), `UNKNOWN_STATUS` (`CircleHelp`, "Tidak Diketahui"), `getStatusConfig(raw)` exact match, `TONE_CLASSES` as complete static class strings
    - _Requirements: 1.10, 6.1, 6.2, 6.7, 2.8_

  - [x] 3.7 Write property test for status mapping
    - **Property 3: Status mapping is total, fixed and distinct**
    - **Validates: Requirements 1.10, 6.1, 6.2, 6.7**
    - In `src/lib/status.test.js`; statuses from `fc.oneof(fc.constantFrom(...STATUS_KEYS, ''), fc.string())`; assert labels, tones, idempotence and five pairwise-distinct icons different from the generic icon

- [x] 4. Tracker logic module
  - [x] 4.1 Implement `src/lib/tracker.js`
    - `flattenActionItems`, `classifyActionItem`, `statBucket`, `computeTrackerStats`, `computeHistoryStats`, `completionRate`, `sortActionRows` (stable: Tertunggak first, then deadline ascending, unparseable/empty last, ties by `sourceOrder`), `applyActionStatus` (pure, returns `{ meetings, previousStatus, updatedMeeting }`), `filterActionRows` (same task/assignee/meetingTitle matching and status-filter semantics as the current `TrackerView.jsx`)
    - Empty or unknown stored statuses count in the Belum Mula bucket, per the design decision
    - _Requirements: 6.5, 6.6, 7.12, 12.1, 12.2, 12.3, 12.4, 12.5, 12.8, 13.7_

  - [x] 4.2 Write property test for overdue classification
    - **Property 4: Overdue classification holds exactly when deadline is past and not Selesai**
    - **Validates: Requirements 6.5, 6.6, 12.3**
    - In `src/lib/tracker.test.js`; "today" is a generated calendar date passed explicitly

  - [x] 4.3 Write property test for tracker statistics partition
    - **Property 5: Tracker statistics partition the action items**
    - **Validates: Requirements 12.2, 12.3**
    - In `src/lib/tracker.test.js`

  - [x] 4.4 Write property test for history statistics
    - **Property 6: History statistics are exact counts**
    - **Validates: Requirements 12.1**
    - In `src/lib/tracker.test.js`

  - [x] 4.5 Write property test for completion rate
    - **Property 7: Completion rate is a bounded rounded percentage**
    - **Validates: Requirements 12.4, 12.5**
    - In `src/lib/tracker.test.js`

  - [x] 4.6 Write property test for tracker sort ordering
    - **Property 8: Tracker sort ordering**
    - **Validates: Requirements 12.8**
    - In `src/lib/tracker.test.js`; include duplicate, empty and unparseable deadlines; assert permutation, group order, deadline order and stable `sourceOrder`

  - [x] 4.7 Write property test for reversible action status change
    - **Property 10: Action status change is reversible**
    - **Validates: Requirements 7.12**
    - In `src/lib/tracker.test.js`; assert the intermediate result differs only in the one action item's `status`

  - [x] 4.8 Write unit tests for `filterActionRows`
    - In `src/lib/tracker.test.js`; example cases mirroring the current Tracker search and status filter behaviour (case-insensitive term match on task, assignee, meeting title; "Semua" filter; Tertunggak filter uses display status)
    - _Requirements: 13.7_

- [x] 5. State helper modules: toast queue, save state, navigation guard
  - [x] 5.1 Implement `src/lib/toastQueue.js`
    - `MAX_VISIBLE = 3`, `AUTO_DISMISS_MS = 5500`, `initialToastState`, `toastReducer` (`add`/`dismiss` with eviction of the oldest success/info toast and FIFO `pending` promotion), `autoDismissDelay(type)`
    - _Requirements: 7.3, 7.4, 7.11_

  - [x] 5.2 Write property test for toast queue invariants
    - **Property 9: Toast queue invariants**
    - **Validates: Requirements 7.4, 7.11**
    - In `src/lib/toastQueue.test.js`; random sequences of `add` (success/info/error) and `dismiss` (known or unknown id); `numRuns: 200`

  - [x] 5.3 Implement `src/lib/saveState.js`
    - `initialSaveState`, `saveReducer` (idle/saving/saved/failed/retrying per the state machine), `formatSavedTime(date)` (local 24h zero-padded `HH:MM`), `saveLabel(state)` using `T.messages`, `saveTone(state)`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 5.4 Write property test for save indicator state
    - **Property 11: Save indicator reflects the latest save outcome**
    - **Validates: Requirements 9.1, 9.2, 9.3**
    - In `src/lib/saveState.test.js`; random event sequences with random `Date` values

  - [x] 5.5 Implement `src/lib/navGuard.js`
    - `createNavigationGuard(onBusyChange)` returning `{ isBusy, run(task) }` exactly as in the design; busy is released in `finally` for resolved and rejected tasks
    - _Requirements: 4.10_

  - [x] 5.6 Write property test for the navigation guard
    - **Property 13: At most one navigation change runs at a time**
    - **Validates: Requirements 4.10**
    - In `src/lib/navGuard.test.js`; interleave activations with controllable deferred task resolutions/rejections; `numRuns: 200`

- [x] 6. Error, API and view helper modules
  - [x] 6.1 Implement `src/lib/errors.js`
    - `buildErrorMessage(operation, detail)`: `${operation} gagal: ${detail}` when `detail` has a non-whitespace character (verbatim), else `${operation} gagal. ${T.messages.genericError}`
    - _Requirements: 5.6, 7.2_

  - [x] 6.2 Write property test for error message composition
    - **Property 12: Error messages name the operation and preserve backend detail**
    - **Validates: Requirements 5.6, 7.2**
    - In `src/lib/errors.test.js`; `detail` from undefined, empty, whitespace-only and arbitrary Unicode strings

  - [x] 6.3 Implement `src/lib/api.js`
    - `requestJson(url, options)` passes `url` and `options` to `fetch` unchanged; returns `{ ok: true, status, data }` or `{ ok: false, status, detail }`; network error → `status: 0, detail: ''`; non-2xx reads `detail` from JSON (FastAPI validation arrays joined by `'; '` from each `msg`), else `''`
    - _Requirements: 7.2, 13.1, 13.2_

  - [x] 6.4 Write unit tests for `requestJson`
    - In `src/lib/api.test.js` with a mocked `fetch`: arguments forwarded unchanged; 2xx JSON; non-2xx string detail; validation-array detail; non-JSON error body; network rejection
    - _Requirements: 7.2, 13.1_

  - [x] 6.5 Implement `src/lib/listState.js`
    - `selectListState({ loading, totalCount, visibleCount })` → `'loading' | 'empty' | 'no-match' | 'list'`
    - _Requirements: 8.1, 8.7, 8.8, 12.5_

  - [x] 6.6 Write property test for list state selection
    - **Property 14: List state selection**
    - **Validates: Requirements 8.1, 8.7, 8.8, 12.5**
    - In `src/lib/listState.test.js`

  - [x] 6.7 Implement `src/lib/progress.js`
    - `clampPercent(x)` (integer 0..100, `NaN` → 0), `formatAudioTime(sec)` (`M:SS` or `H:MM:SS`), `formatAudioProgress(elapsed, total)`
    - _Requirements: 8.2, 8.3_

  - [x] 6.8 Write property test for progress formatting
    - **Property 15: Transcription progress formatting**
    - **Validates: Requirements 8.2, 8.3**
    - In `src/lib/progress.test.js`; include negative, fractional, > 100, `NaN` and infinite inputs

  - [x] 6.9 Implement `src/lib/draftNotice.js`
    - `shouldShowAiDraftNotice(status, rawTranscript)` → `status === 'Draf' && /\S/.test(rawTranscript ?? '')`
    - _Requirements: 9.7, 9.8_

  - [x] 6.10 Write property test for AI draft notice visibility
    - **Property 16: AI draft notice visibility**
    - **Validates: Requirements 9.7, 9.8**
    - In `src/lib/draftNotice.test.js`; transcripts include spaces, tabs and newlines only

  - [x] 6.11 Move editor form helpers into `src/components/editor/editorForm.js`
    - Move `hasMeaningfulContent`, `initForm` and `serializeParticipants` out of `EditorView.jsx` unchanged and import them back into `EditorView.jsx`; no logic changes
    - _Requirements: 13.2, 13.6_

- [x] 7. Checkpoint - Ensure all tests pass
  - From `frontend/` run `npm run test; npm run lint; npm run build`. Ensure all tests pass, ask the user if questions arise.

- [x] 8. UI primitives in `src/components/ui/`
  - [x] 8.1 Implement `Button.jsx`
    - Variants primary/secondary/outline/ghost/danger and sizes sm/md from the design's static `VARIANT`, `DISABLED`, `BASE` maps joined with `cx`; `icon`, `iconOnly` (dev-time `console.error` without `aria-label`), `busy` (`Loader2` spinner, `aria-busy` always `"true"`/`"false"` when `busy` is a prop, click ignored), `disabled`, `as="a"` (`aria-disabled`, `tabIndex=-1`, click prevented when disabled/busy), default `type="button"`, `min-h-10`
    - Icons rendered with `aria-hidden="true"`; colour-only hover/active changes with `duration-150`
    - _Requirements: 1.3, 1.5, 1.8, 1.9, 2.5, 8.6, 10.5, 10.6, 10.11_

  - [x] 8.2 Write unit tests for Button
    - `Button.test.jsx`: each variant renders a distinct class set; disabled and busy buttons ignore click, Enter and Space; `disabled`/`aria-busy` exposed; anchor variant `aria-disabled`; icon `aria-hidden`
    - _Requirements: 1.5, 1.8, 8.6, 10.6_

  - [x] 8.3 Implement `Card.jsx`, `SectionHeader.jsx` and `EmptyState.jsx`
    - Card: `as`, `padding`, `accent` (2px gold top rule); flat `bg-white border border-neutral-200 rounded-lg shadow-sm`
    - SectionHeader: `title`, `level` (default 3), `description`, `actions`, `id`; forwards `ref` and accepts `tabIndex={-1}` for section navigation focus
    - EmptyState: icon, `h3` title, description, optional primary action Button
    - _Requirements: 1.3, 2.4, 2.7, 3.5, 8.7, 9.10_

  - [x] 8.4 Implement `Skeleton.jsx` and `ProgressBar.jsx`
    - Skeleton: `variant` card/row, `count` clamped to 3..6, `aria-hidden` blocks inside `role="status"` with visually hidden "Memuatkan..."; no pulse animation
    - ProgressBar: `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow={clampPercent(value)}`, `aria-label`, static tone fill map, inline style for width only
    - _Requirements: 2.4, 8.1, 8.2, 12.4_

  - [x] 8.5 Implement `FormField.jsx`
    - Visible `<label htmlFor>`; `useId()` fallback ids; helper and error ids joined into `aria-describedby`; `error` → `aria-invalid="true"`, danger border and Bahasa Melayu error text with `AlertCircle`; supports render-prop children and `as` input/select/textarea; caller-controlled value (never cleared on error)
    - _Requirements: 1.3, 3.7, 10.4, 10.14, 11.5_

  - [x] 8.6 Implement `StatusBadge.jsx`
    - Uses `getStatusConfig` and `TONE_CLASSES`; pill with `aria-hidden` icon and text label as accessible name; fixed size classes
    - _Requirements: 1.10, 6.1, 6.2, 6.3, 6.4, 6.7_

  - [x] 8.7 Write unit tests for FormField, StatusBadge, EmptyState, Skeleton and ProgressBar
    - `primitives.test.jsx`: label association and unique ids across many fields; error association, `aria-invalid` and value retention; StatusBadge label/icon for all five statuses and unknown; EmptyState action click; Skeleton count clamped to 3–6; ProgressBar ARIA attributes
    - _Requirements: 6.3, 6.7, 8.1, 8.2, 8.7, 10.4, 10.14_

  - [x] 8.8 Implement `toastContext.js` and `ToastProvider.jsx`
    - `toastContext.js` exports the context and `useToast()` (`success`, `info`, `error`, `dismiss`) in a separate file for the react-refresh lint rule
    - `ToastProvider` holds `toastReducer` state; always renders a `role="status" aria-live="polite"` and a `role="alert" aria-live="assertive"` container before any toast; each toast shows icon, title from `T.headings`, message, optional action Button and close icon Button `aria-label="Tutup pemberitahuan"`; schedules auto-dismiss via `autoDismissDelay` and clears timers on dismiss/unmount; fixed top-right (bottom on mobile)
    - _Requirements: 1.3, 2.8, 7.1, 7.3, 7.4, 7.5, 7.6, 7.11, 10.13_

  - [x] 8.9 Write component tests for the toast system
    - `ToastProvider.test.jsx` with fake timers: both live containers exist before the first toast; success/info dismissed between 5000 and 6000ms; error persists; close button works with Enter and Space; action button invokes `onAction`; fourth toast evicts the oldest success/info
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.11, 10.13_

  - [x] 8.10 Implement `ConfirmDialog.jsx`
    - Portal into `document.body` with backdrop; `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`; "Batal" first in DOM and focused on open; `inert` on `#root` while open; Tab/Shift+Tab cycle; Escape and backdrop `mousedown` call `onCancel`; on close remove `inert` and focus `returnFocusRef.current`; danger-styled confirm Button with `busy`
    - _Requirements: 1.3, 7.7, 7.8, 7.9, 10.7, 10.8, 10.9_

  - [x] 8.11 Write component tests for ConfirmDialog
    - `ConfirmDialog.test.jsx`: initial focus on "Batal"; accessible name is the title; Tab from last wraps to first and Shift+Tab from first wraps to last; Escape, Batal and backdrop click close without calling `onConfirm` and return focus to the opener; Padam calls `onConfirm`
    - _Requirements: 7.7, 7.8, 7.9, 10.7, 10.8, 10.9_

  - [x] 8.12 Implement `OverflowMenu.jsx`
    - Disclosure Button (`MoreHorizontal`, `aria-label`, `aria-expanded`, `aria-controls`) with a list of button/link items (`href`/`download` supported); Escape and outside click close and return focus to the trigger
    - _Requirements: 10.3, 10.5, 11.4_

  - [x] 8.13 Write component tests for OverflowMenu
    - `OverflowMenu.test.jsx`: toggles `aria-expanded`; items operable by keyboard; Escape and outside click close and return focus to the trigger
    - _Requirements: 10.3, 11.4_

- [x] 9. Checkpoint - Ensure all tests pass
  - From `frontend/` run `npm run test; npm run lint; npm run build`. Ensure all tests pass, ask the user if questions arise.

- [x] 10. App shell: Header, Navigation, PageHeader and App.jsx
  - [x] 10.1 Refactor `Header.jsx`
    - Solid `bg-primary` with `border-b-2 border-accent-light`; lucide `FileText` icon (`aria-hidden`); `h1` `T.app.name`; subtitle `T.app.subtitle`; remove orbs, blur, pulse, gradient and emoji
    - _Requirements: 2.1, 2.3, 2.4, 2.6, 2.9, 2.10, 3.5_

  - [x] 10.2 Refactor `Navigation.jsx`
    - `<nav aria-label={T.nav.label}>` with a `<ul>` of Sejarah (`History`), Penjejak (`ListChecks`), Ekstrak AI (`FileAudio`) and Minit Baharu (`FilePlus`, primary `Button`, separated by `ml-auto border-l`); two static class strings for active/inactive; `aria-current="page"` only on the active item, Minit Baharu active for `view === 'editor'` with inset `ring-accent-light`; bar ≤ 64px, items `min-h-11 min-w-11`, mobile `overflow-x-auto flex-nowrap`
    - Accept `navBusy`: items get `aria-disabled="true"` and ignore activation while true
    - _Requirements: 2.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.10, 11.7_

  - [x] 10.3 Write component tests for Navigation
    - `Navigation.test.jsx`: four items in order with labels and no emoji; exactly one `aria-current="page"` for each of history/tracker/ingest/editor; Tab order follows visual order; Enter/Space activate; activations ignored while `navBusy`
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.7, 4.10_

  - [x] 10.4 Create `PageHeader.jsx`
    - Renders `h2` title and single-line description from `T.views[view]`, placed directly below Navigation
    - _Requirements: 3.4, 3.5_

  - [x] 10.5 Refactor `App.jsx` with ToastProvider, navigation guard and delete dialog
    - Wrap the app in `ToastProvider`; solid `bg-neutral-50` page root; main container `mx-auto w-full max-w-(--container-content) px-4 md:px-6 pb-16`; render `PageHeader` per view
    - Add `meetingsLoading`, `navBusy`, `pendingDelete`, `deleteBusy`, `deleteTriggerRef`; `fetchMeetings` via `requestJson('/api/meetings')` with error toast `buildErrorMessage(T.ops.loadMeetings, detail)` keeping the previous list
    - Route `navigateTo`, `handleNewMeeting`, `handleSelectMeeting`, `handleEditMeeting` and `handleEditorBack` through one `createNavigationGuard` in a `useRef`; when leaving the editor treat `flush()` result `ok === false` as failure (error toast `T.ops.navigateFlush` + detail, stay in editor), otherwise keep the existing clear/refresh/setView steps
    - Replace `window.confirm` delete with `ConfirmDialog` (meeting title, Batal/Padam); confirm sends the same `DELETE /api/meetings/{id}`, shows success or error toast, focuses the History heading if the opener was removed
    - Show error toasts when loading a meeting for Lihat/Sunting fails; pass `meetingsLoading`, delete-trigger handling and "Minit Baharu"/"Ekstrak AI" callbacks to History and Tracker views
    - Keep every endpoint, method and payload unchanged
    - _Requirements: 2.2, 3.4, 4.8, 4.9, 4.10, 4.11, 5.6, 7.1, 7.2, 7.7, 7.8, 7.10, 11.6, 13.1, 13.5_

  - [x] 10.6 Write App flow tests
    - `App.test.jsx` with `fetch` mocked and calls recorded: leaving the editor flushes then refreshes `/api/meetings`; flush failure shows an error toast and keeps the editor; Minit Baharu opens a blank editor; delete → dialog → Padam sends `DELETE /api/meetings/{id}` and shows a success toast; Batal sends nothing; concurrent navigation attempts run once; exactly one `h1` and one `h2` per view
    - _Requirements: 3.5, 4.8, 4.9, 4.10, 4.11, 7.1, 7.7, 7.8, 13.5_

- [x] 11. History view
  - [x] 11.1 Refactor `HistoryView.jsx`
    - `grid grid-cols-1 lg:grid-cols-4 gap-6 items-start`; sidebar heading "Ringkasan"; three stat `Card`s (Jumlah Mesyuarat, Draf, Selesai) from `computeHistoryStats` with StatusBadge-matching icons/tones; `<fieldset>` status filter with `aria-pressed` toggle Buttons; search `FormField` "Cari mesyuarat" with the same matching fields as today
    - List via `selectListState`: Skeleton cards while loading; EmptyState "Belum ada minit mesyuarat" with Minit Baharu / Ekstrak AI actions; no-match EmptyState with "Kosongkan Carian" resetting term and filter
    - Meeting card `Card as="article"`: `h3` title, `StatusBadge`, `Calendar` + `formatDisplayDate(m.date)`, `MapPin` + location or "Tiada tempat"; desktop/tablet actions Lihat, Sunting, Muat Turun DOCX (`as="a"` download, same URL), Padam (sets delete trigger ref); mobile Lihat + Sunting + `OverflowMenu` with Muat Turun DOCX and Padam
    - Remove emoji, inline SVGs, gradients and English strings; all text from `T`
    - _Requirements: 1.4, 2.4, 2.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.4, 8.1, 8.7, 8.8, 11.2, 11.3, 11.4, 12.1, 13.7_

  - [x] 11.2 Write component tests for HistoryView
    - `HistoryView.test.jsx`: skeletons while loading and no EmptyState; empty vs no-match states and the clear action; stats counts; dates in Display_Date_Format and "Tiada tarikh"/"Tiada tempat"; search and filter results match pre-redesign semantics; "Overview", "No date", "No location", "Edit" absent; Padam calls the delete handler with the meeting
    - _Requirements: 5.2, 5.4, 5.5, 8.1, 8.7, 8.8, 12.1, 13.7_

- [x] 12. Tracker view
  - [x] 12.1 Refactor `TrackerView.jsx`
    - Data pipeline `flattenActionItems` → `classifyActionItem` → `computeTrackerStats` → `filterActionRows` → `sortActionRows` with `today = todayLocal()`
    - Five stat Cards (Jumlah, Belum Mula, Sedang Berjalan, Tertunggak, Selesai) using `STATUS_CONFIG` icons/tones; "Kadar Penyelesaian" card with `completionRate`, success `ProgressBar` and "{selesai} daripada {jumlah} tindakan selesai"; remove SVG ring, gradient card, pulse bars and dynamic class names
    - Filters: search FormField and status select FormField with the same options and semantics
    - List via `selectListState` with Skeleton, EmptyState "Tiada tindakan susulan" (action Ekstrak AI) and no-match state; desktop `<table>` with `sr-only` caption and headers Tindakan, Tanggungjawab, Tarikh Akhir, Mesyuarat, Status (StatusBadge + status select `aria-label="Kemas kini status: {task}"`); mobile/tablet stacked Cards with `<dl>` of the same five fields
    - Status change: optimistic `applyActionStatus`, `POST /api/meetings/save` with the same full-meeting payload via `requestJson`, rollback with `previousStatus` plus error toast on failure; disable that row's select with `aria-busy` while saving
    - _Requirements: 1.4, 1.6, 2.4, 2.6, 6.4, 6.5, 6.6, 7.2, 7.12, 8.1, 8.6, 8.7, 8.8, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 13.1, 13.7_

  - [x] 12.2 Write component tests for TrackerView
    - `TrackerView.test.jsx` with mocked `fetch` and a fixed "today": table headers; overdue rows show Tertunggak badge and formatted deadline; sort order; stats and completion rate incl. 0% with empty bar and EmptyState when Jumlah is 0; failed status save rolls back and shows error toast; save payload equals the pre-redesign shape; mobile card fields present
    - _Requirements: 6.5, 6.6, 7.12, 12.2, 12.4, 12.5, 12.6, 12.7, 12.8, 13.1_

- [x] 13. Ingest view
  - [x] 13.1 Refactor `IngestView.jsx`
    - Three Cards with `SectionHeader`: Templat Format Minit (template select FormField, tag, "Struktur Templat" disclosure with `aria-expanded` and conditional rendering, custom template upload unchanged), Muat Naik Dokumen / Audio Mesyuarat (Whisper model select FormField, keyboard-operable dropzone `<button>` with `Upload` icon and `aria-describedby`, colour-only drag state), Pengekstrak AI (transcript textarea FormField `font-mono max-w-[80ch]`, Kosongkan, TXT/JSON/SRT download Buttons, primary "Ekstrak dengan AI" with `busy` and label "Mengekstrak minit...")
    - Store progress as numbers; render `ProgressBar` with `clampPercent`, stage label and `formatAudioProgress(currentTime, totalTime)`; info notice `T.messages.modelDownloading` cleared on first progress, completion or error
    - Visually hidden `aria-live="polite"` region updated only on stage changes
    - Replace every `alert` with toasts (file load success/failure, transcription complete/error, extraction error, Draf pre-save failure) and the empty-transcript `alert` with an inline FormField error "Sila masukkan teks transkrip."
    - Keep `/api/transcribe` streaming loop, `/api/extract`, `/api/transcript/{id}`, template handling and `sessionStorage['mom_transcript_id']` restore unchanged
    - _Requirements: 1.4, 2.6, 5.1, 7.1, 7.2, 7.10, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 10.4, 10.14, 13.1, 13.2, 13.7_

  - [x] 13.2 Write component tests for IngestView
    - `IngestView.test.jsx` with a mocked SSE `ReadableStream`: download notice appears then clears on first progress; `aria-valuenow` equals the displayed percent; time shown as elapsed / total or elapsed only; live region changes only on stage changes; extraction button busy state and label; empty-transcript inline error with value retained; transcript restored from `sessionStorage`; request URLs, methods and bodies unchanged
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 10.14, 13.1, 13.7_

- [x] 14. Editor view
  - [x] 14.1 Create editor subcomponents `editorSections.js`, `SectionNav.jsx` and `SaveIndicator.jsx`
    - `editorSections.js`: ordered section list (maklumat, pengerusi, kehadiran, berbangkit, perbincangan, tindakan) with Bahasa Melayu titles
    - `SectionNav.jsx`: `<nav aria-label="Bahagian minit">` with an `<ol>` of buttons; activation scrolls the target heading into view and focuses it
    - `SaveIndicator.jsx`: `role="status" aria-live="polite"` with icon, `saveLabel(state)` and tone from `saveTone`
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.9, 9.10_

  - [x] 14.2 Extract and update `useAutoSave` into `src/components/editor/useAutoSave.js`
    - Move the hook out of `EditorView.jsx`; keep the 3-second debounce, payload and stable `id` logic identical
    - `save()` returns `{ ok: true, skipped: true }` for blank meetings, otherwise dispatches `SAVE_START`/`SAVE_SUCCESS`/`SAVE_FAILURE` to `saveReducer` and returns `{ ok, detail }`; uses `requestJson`; calls `onFailure(detail)`; `flush()` returns the save result; unmount fire-and-forget save kept
    - _Requirements: 4.11, 9.1, 9.2, 9.3, 9.4, 13.3, 13.4, 13.5, 13.6_

  - [x] 14.3 Write property test for blank meetings never auto-saved
    - **Property 17: Blank meetings are never auto-saved**
    - **Validates: Requirements 13.6**
    - In `src/components/editor/editorForm.test.js`; generate blank forms with any casing/whitespace of "Draf Tanpa Tajuk"/"Mesyuarat Tanpa Tajuk"; assert `hasMeaningfulContent` is false and `save()` resolves to `{ ok: true, skipped: true }` with `fetch` never called; adding one meaningful field makes it true

  - [x] 14.4 Create `DocumentPreview.jsx`
    - Move the preview markup out of `EditorView.jsx`; outer `overflow-x-auto bg-neutral-100` container; page `aspect-a4 bg-doc-paper text-doc-ink` with only `doc-*` colours; document title `h3`, sections `h4`; status chips become plain text; dates via `formatDisplayDate`; content and numbering otherwise identical
    - _Requirements: 3.5, 5.4, 9.11, 13.7_

  - [x] 14.5 Refactor `EditorView.jsx`
    - Sticky action bar (`sticky top-0 z-30`) with `SaveIndicator` (form mode), Muat Turun DOCX, Pratonton / Kembali ke Borang and primary "Jana Minit Mesyuarat" (`busy` while saving); wraps on mobile
    - AI_Draft_Notice above the first card when `shouldShowAiDraftNotice(meeting?.status ?? 'Draf', formData.raw_transcript)`
    - Cards ordered from `editorSections`, each with `SectionHeader` (`tabIndex={-1}`, `scroll-mt-24`); `SectionNav` sticky left column on desktop, horizontal list on mobile/tablet
    - Participant, agenda and action rows use FormField with visible labels, stacked on mobile; remove buttons with `aria-label` "Buang ahli {n}" / "Buang perkara {n}" / "Buang tindakan {n}"; sub-blocks use `h4`; decision textarea `border-l-4 border-l-success`
    - Auto-save failure: single error toast with "Cuba Lagi" action calling `flush()`, replacing the previous auto-save toast; "Jana Minit Mesyuarat" success toast then `onBack()`, failure toast keeps form intact; replace all `alert` calls
    - Replace inline SVGs and raw `#1b3a5b` with lucide icons and tokens
    - _Requirements: 1.4, 2.1, 2.6, 3.5, 5.1, 7.1, 7.2, 7.10, 9.4, 9.6, 9.7, 9.8, 9.9, 9.10, 10.4, 10.5, 11.5, 13.1, 13.3, 13.4_

  - [x] 14.6 Write component tests for EditorView
    - `EditorView.test.jsx` with fake timers and mocked `fetch`: save fires 3s after the last change and the timer restarts on further changes; repeated saves reuse the same `id`; Save_Indicator shows "Menyimpan...", "Disimpan pada HH:MM" and "Gagal disimpan"; failure toast "Cuba Lagi" triggers a save; AI_Draft_Notice shown for Draf with transcript, hidden for Selesai or blank transcript; section nav order equals card order and activation focuses the heading; legacy records (flat/nested chairperson, `jawatan`/`label`/`department`) open with all fields shown
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 9.9, 9.10, 13.2, 13.3, 13.4_

- [x] 15. Checkpoint - Ensure all tests pass
  - From `frontend/` run `npm run test; npm run lint; npm run build`. Ensure all tests pass, ask the user if questions arise.

- [x] 16. Static-scan and contract tests in `src/test/static/`
  - [x] 16.1 Write icon scan test
    - `icons.test.js`: no `\p{Extended_Pictographic}` emoji and no `<svg` / `<path` in `src/components/**` and `src/App.jsx`
    - _Requirements: 2.6, 4.1_

  - [x] 16.2 Write browser dialog scan test
    - `dialogs.test.js`: no `alert(`, `confirm(`, `window.alert` or `window.confirm` anywhere in `src/` (excluding test files)
    - _Requirements: 7.10_

  - [x] 16.3 Write dynamic class name scan test
    - `classNames.test.js`: no `` className={`...${ `` interpolation, no `'...-' + x` class concatenation and no `.replace(` on class strings in components
    - _Requirements: 1.6_

  - [x] 16.4 Write palette and visual-rule scan test
    - `palette.test.js`: no raw `#hex`, `rgb(`, `hsl(`, arbitrary colour classes, inline style colours, or default palette classes (`purple|indigo|violet|fuchsia|pink|emerald|amber|blue|red|gray|slate|green`) in components; no `bg-gradient`, `linear-gradient`, `blur-`, `animate-pulse`, `hover:scale`, `hover:-translate`, `rounded-xl|2xl|3xl|[`, `font-black|extrabold|light|thin`, `text-[10px]|[11px]`, `outline-none`, `bg-accent`, positive `tabIndex`, or durations above 200
    - _Requirements: 1.2, 2.1, 2.2, 2.4, 2.5, 2.7, 2.9, 3.7, 3.8, 10.3_

  - [x] 16.5 Write English string scan test
    - `language.test.js`: "Overview", "No date", "No location", "Edit", "Delete", "Ubah", "Hapus" absent from JSX text and string attributes (`aria-label`, `title`, `placeholder`) in components
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 16.6 Write theme source and document shell scan test
    - `themeSource.test.js`: exactly one `@theme` across `src/` and it is in `src/index.css`; `src/App.css` absent and not imported; `index.html` has `lang="ms"` and a Bahasa Melayu title; no third-party font URLs or remote `@font-face` sources
    - _Requirements: 1.1, 1.7, 3.2, 5.7, 10.12_

  - [x] 16.7 Write API contract tests
    - `apiContract.test.jsx`: for each user action (load list, Lihat/Sunting, delete, auto-save, Jana Minit, Tracker status save, extract, Draf pre-save, transcribe, transcript restore, `.docx` link), recorded `fetch(url, init)` matches a fixture of URL, method, headers and parsed body from the pre-redesign code paths
    - _Requirements: 13.1, 13.2, 13.7_

- [x] 17. Final checkpoint - Ensure all tests pass
  - From `frontend/` run `npm run test; npm run lint; npm run build`; fix any static-scan violations in the components rather than relaxing the scans. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; the static scans in task 16 are the main automated guard for the visual and language rules, so running them is recommended
- Each property test uses fast-check with at least 100 runs (200 for Properties 9 and 13) and a `// Feature: professional-ui-redesign, Property {n}: {title}` tag comment
- Layout, zoom, reduced-motion, A4 proportion and screen reader checks (Req 3.10, 4.2, 4.6, 9.6, 9.11, 10.10, 10.11, 10.13, 11.1–11.8) cannot be verified in jsdom and need a manual browser and NVDA pass after implementation
- `useAutoSave` moves to `src/components/editor/useAutoSave.js` so it can be tested directly without breaking the react-refresh lint rule

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "3.2", "3.3", "3.6", "5.1", "5.3", "5.5", "6.1", "6.5", "6.7", "6.9", "6.11", "8.1"] },
    { "id": 3, "tasks": ["3.4", "3.7", "4.1", "5.2", "5.4", "5.6", "6.2", "6.3", "6.6", "6.8", "6.10", "8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 4, "tasks": ["3.5", "4.2", "6.4", "8.7", "8.8", "8.10", "8.12", "10.1", "10.4"] },
    { "id": 5, "tasks": ["4.3", "8.9", "8.11", "8.13", "10.2"] },
    { "id": 6, "tasks": ["4.4", "10.3", "10.5"] },
    { "id": 7, "tasks": ["4.5", "11.1", "12.1", "13.1", "14.1"] },
    { "id": 8, "tasks": ["4.6", "11.2", "12.2", "13.2", "14.2"] },
    { "id": 9, "tasks": ["4.7", "14.3", "14.4"] },
    { "id": 10, "tasks": ["4.8", "14.5"] },
    { "id": 11, "tasks": ["10.6", "14.6"] },
    { "id": 12, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "16.7"] }
  ]
}
```

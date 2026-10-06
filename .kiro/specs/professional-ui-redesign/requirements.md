# Requirements Document

## Introduction

Penjana Minit Mesyuarat is used by Malaysian public-sector staff (pegawai urus setia, setiausaha mesyuarat, ketua bahagian) to turn meeting recordings into PKPA Bil. 2/1991-formatted minutes. The current frontend mixes two visual identities: a consumer-style purple/indigo/fuchsia gradient theme with decorative orbs, pulse animations, hover scaling and emoji icons (Header, Navigation, HistoryView, TrackerView) and a restrained navy (`#1b3a5b`) form style (EditorView, IngestView). It also contains English strings ("Overview", "No date", "No location", "Edit"), relies on `window.alert` / `window.confirm` for feedback, fails silently on some background saves, uses inline SVGs while `lucide-react` is installed but unused, uses dynamically built Tailwind class names that Tailwind v4 cannot detect, and still ships the leftover Vite starter stylesheet (`App.css`).

This feature redesigns the frontend into a consistent, formal, government-appropriate interface tailored to that audience: a single design system, a public-sector colour palette, clear typographic hierarchy, consistent Bahasa Melayu terminology, explicit status and feedback states, accessibility (WCAG 2.1 AA target) and a responsive layout. The redesign is frontend-only; backend API contracts, data shapes, auto-save behaviour and export output stay unchanged.

## Glossary

- **UI**: The React 19 + Vite + Tailwind CSS v4 single-page application under `frontend/`.
- **Design_System**: The single set of design tokens (colour, typography, spacing, radius, shadow, motion) and shared UI primitives used by every view of the UI.
- **Design_Token**: A named value (for example `--color-primary`) defined once in the Tailwind v4 `@theme` block of `frontend/src/index.css` and referenced by components instead of raw hex or ad-hoc palette classes.
- **UI_Primitive**: A reusable component of the Design_System (Button, Card, Section_Header, Form_Field, Status_Badge, Empty_State, Toast, Confirm_Dialog).
- **Primary_Palette**: The institutional colour set of the Design_System: a navy primary based on `#1b3a5b`, a neutral slate/grey scale, and a restrained gold accent, plus semantic colours for success, warning, danger and info.
- **App_Header**: The top banner component (`Header.jsx`) showing the application identity.
- **App_Navigation**: The view-switching component (`Navigation.jsx`) for Sejarah, Penjejak, Ekstrak AI and Minit Baharu.
- **History_View**: The meeting records list (`HistoryView.jsx`).
- **Tracker_View**: The action-item follow-up dashboard (`TrackerView.jsx`).
- **Ingest_View**: The audio/text upload, transcription and AI extraction screen (`IngestView.jsx`).
- **Editor_View**: The minutes form and official-document preview (`EditorView.jsx`).
- **Status_Badge**: A UI_Primitive that displays a meeting status (Draf, Selesai) or action-item status (Belum Mula, Sedang Berjalan, Tertunggak, Selesai) using a fixed colour, icon and text label.
- **Toast**: A non-blocking, dismissible in-page notification UI_Primitive.
- **Confirm_Dialog**: An in-page modal UI_Primitive that asks the user to confirm or cancel a destructive action.
- **Save_Indicator**: The element in Editor_View that shows the auto-save state of the current meeting.
- **AI_Draft_Notice**: A visible notice stating that AI-extracted content is a draft that a human must verify before it becomes an official record.
- **Interactive_Element**: Any button, link, input, select, textarea or other control a user can operate.
- **Breakpoint_Mobile / Breakpoint_Tablet / Breakpoint_Desktop**: Viewport widths below 768px, from 768px to 1023px, and 1024px or wider respectively.
- **Terminology_Module**: The single module under `frontend/src` that defines every recurring Bahasa Melayu action, status and message-heading term used by the UI.
- **Display_Date_Format**: The `ms-MY` date format used for all displayed dates: two-digit day, full Bahasa Melayu month name and four-digit year separated by single spaces (for example "05 Mac 2026"), as defined in Requirement 5.4.

## Requirements

### Requirement 1: Unified Design System

**User Story:** As a meeting secretary, I want every screen to look and behave consistently, so that the application feels like one trustworthy official tool rather than a collection of mismatched pages.

#### Acceptance Criteria

1. THE Design_System SHALL define every colour, typography (font family, font size, font weight, line height), spacing, border-radius, shadow and motion (duration, easing) Design_Token in exactly one Tailwind v4 `@theme` block in `frontend/src/index.css`, with no Design_Token defined in any other file.
2. THE UI SHALL reference colours in every component under `frontend/src/components` only through Design_Tokens or the Primary_Palette classes generated from those tokens, so that no component contains a raw hex, rgb or hsl colour value, a Tailwind arbitrary colour value, an inline style colour, or a default Tailwind palette class outside the Primary_Palette (including purple, indigo, violet, fuchsia and pink classes).
3. THE Design_System SHALL provide the UI_Primitives Button, Card, Section_Header, Form_Field, Status_Badge, Empty_State, Toast and Confirm_Dialog as shared components, each defined once and imported by every view that uses it.
4. THE UI SHALL render every button, card, section header, form field, status badge and empty state in App_Header, App_Navigation, History_View, Tracker_View, Ingest_View and Editor_View through the corresponding UI_Primitive, with no view defining its own duplicate styling for those element types.
5. THE Design_System SHALL define Button variants primary, secondary, outline, ghost and danger, each with visually distinct default, hover, focus, active and disabled states expressed through Design_Tokens.
6. THE UI SHALL use complete, statically written Tailwind class names in every component, so that no class name is built at runtime through string concatenation, template interpolation or partial class fragments, and every class applied at runtime is present in the compiled stylesheet produced by `npm run build`.
7. THE UI SHALL remove the unused Vite starter stylesheet `frontend/src/App.css` and every import of that file, and `npm run build` SHALL complete without errors after the removal.
8. WHILE a Button is in the disabled state, THE Button SHALL ignore click and keyboard activation, SHALL expose its disabled state to assistive technologies, and SHALL render with the disabled-state Design_Tokens.
9. WHEN a Button or other Interactive_Element provided by a UI_Primitive receives keyboard focus, THE UI_Primitive SHALL display a visible focus indicator defined by a Design_Token that is identical across all variants and all views and that meets Requirement 10.2.
10. THE Status_Badge SHALL map each meeting status (Draf, Selesai) and each action-item status (Belum Mula, Sedang Berjalan, Tertunggak, Selesai) to exactly one fixed combination of colour Design_Token, icon and Bahasa Melayu text label, as specified in Requirement 6, and SHALL render that same combination in every view where the status appears.

### Requirement 2: Public-Sector Visual Identity

**User Story:** As a department head reviewing minutes, I want a formal, restrained appearance consistent with Malaysian government systems, so that the tool is appropriate for official use and presentation to senior officers.

#### Acceptance Criteria

1. THE UI SHALL take the background colour of the App_Header, the fill colour of primary buttons, the active navigation item indicator in App_Navigation, and the section header colour in History_View, Tracker_View, Ingest_View and Editor_View from the Primary_Palette navy Design_Token, with no raw hex value or ad-hoc Tailwind palette class (for example `purple-*`, `indigo-*`, `fuchsia-*`, `violet-*`) used for these elements.
2. THE UI SHALL render the page background behind every view as a single solid colour taken from the neutral slate/grey Design_Token scale, with no CSS gradient (linear, radial or conic) applied to the page background.
3. THE App_Header SHALL display the application name "Penjana Minit Mesyuarat", the subtitle "Sektor Awam Malaysia", and a document icon rendered by a `lucide-react` component, on a solid Primary_Palette navy background with no gradient, at Breakpoint_Mobile, Breakpoint_Tablet and Breakpoint_Desktop.
4. THE UI SHALL render every surface as a flat fill with borders of exactly 1px and shadows taken only from the shadow Design_Tokens, with no blurred gradient orbs, no `animate-pulse` or other looping animation used as decoration, no scale transform on hover or focus of cards or App_Navigation items, and no multi-colour gradient fills.
5. WHEN a user hovers over or focuses an Interactive_Element, THE UI SHALL indicate the state only through a change of colour, border or shadow taken from the Design_Tokens, with any transition completing within 200ms and without changing the size or position of the Interactive_Element.
6. THE UI SHALL render every icon with a `lucide-react` component, with zero emoji characters used as icons and zero hand-written inline `<svg>` path elements remaining in the components of the UI.
7. THE UI SHALL take the border radius of every card, button, input, select and textarea from a single radius scale defined in the Design_Tokens, with no rendered radius greater than 8px for these elements.
8. WHERE a semantic colour (success, warning, danger, info) is displayed, including in Status_Badge, Toast and Confirm_Dialog, THE UI SHALL take the colour from the corresponding semantic Design_Token and SHALL use that colour only to represent the matching status or message type.
9. WHERE the Primary_Palette gold accent is displayed, THE UI SHALL limit its use to thin rules, borders, icons or small highlights, and SHALL NOT use the gold accent as the fill of any button, card or page background.
10. THE UI SHALL render text and icons placed on the Primary_Palette navy background with a contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text (18pt, or 14pt bold) and icons.

### Requirement 3: Typography and Visual Hierarchy

**User Story:** As a secretariat officer working through long minutes, I want clear, readable typography and an obvious page structure, so that I can scan and edit content without strain.

#### Acceptance Criteria

1. THE Design_System SHALL define exactly one sans-serif font family stack, used for all UI text, and exactly one monospace font family stack, used for transcript text, each as a Design_Token.
2. THE UI SHALL load every font in both font family stacks from files bundled with the UI or from fonts installed on the operating system, and SHALL make zero network requests to third-party font hosts.
3. THE Design_System SHALL define a type scale of between four and six text sizes as Design_Tokens, ranging from a smallest size of 12px to a largest size of no more than 32px, with body text at a minimum of 14px.
4. WHEN a user opens any of History_View, Tracker_View, Ingest_View or Editor_View, THE UI SHALL display, directly below the App_Navigation, a Bahasa Melayu page title as a heading level 2 and a Bahasa Melayu description of no more than 120 characters that renders on a single line at Breakpoint_Desktop.
5. THE UI SHALL render exactly one h1 per page (the App_Header title), exactly one h2 per view (the view title), and h3 for card and section titles, with no heading level skipped between a heading and its nearest parent heading.
6. THE Design_System SHALL assign h1, h2 and h3 font sizes from the type scale such that the h1 size is greater than or equal to the h2 size, the h2 size is greater than the h3 size, and the h3 size is greater than the body text size.
7. THE UI SHALL render form labels, helper text, table headers and all other text at a minimum of 12px.
8. THE UI SHALL limit font weights to regular (400), medium (500), semibold (600) and bold (700).
9. THE UI SHALL render body text, transcript text and textarea content with a line height of at least 1.5 times the font size, and SHALL limit paragraph and transcript text blocks to a maximum width of 80 characters per line at Breakpoint_Desktop.
10. WHILE the browser zoom is set to 200% at a viewport width of 1280px, THE UI SHALL display all text in every view without truncation, overlap of text with other text, or loss of content or functionality.

### Requirement 4: Navigation Structure

**User Story:** As a frequent user, I want a compact, conventional navigation bar, so that I can switch between tasks quickly and always know where I am.

#### Acceptance Criteria

1. THE App_Navigation SHALL present exactly four items in the order Sejarah, Penjejak, Ekstrak AI, Minit Baharu as a single horizontal bar, with each item showing a `lucide-react` icon and a visible Bahasa Melayu text label and no emoji characters.
2. WHILE the viewport is at Breakpoint_Desktop or Breakpoint_Tablet, THE App_Navigation SHALL render all four items on a single row no taller than 64px, with no item using descriptive subtitle text, gradient backgrounds or hover scaling.
3. WHILE the Sejarah, Penjejak or Ekstrak AI view is active, THE App_Navigation SHALL mark only the corresponding item with the navy active style defined by the Primary_Palette Design_Token and with the `aria-current="page"` attribute, and SHALL omit `aria-current` from every other item.
4. WHILE Editor_View is active, THE App_Navigation SHALL mark the Minit Baharu item as the active item with `aria-current="page"`, regardless of whether Editor_View shows a new, existing or previewed meeting.
5. THE App_Navigation SHALL render Minit Baharu as a primary-variant Button UI_Primitive that is visually separated from the other three items, while still exposing the active state defined in criterion 4.
6. WHILE the viewport is at Breakpoint_Mobile, THE App_Navigation SHALL present all four items within either a horizontally scrollable bar or a collapsible menu, such that each item is reachable with at most two taps from any view and each item has a touch target of at least 44px by 44px.
7. THE App_Navigation SHALL make every item an Interactive_Element that is reachable with the Tab key in the visual order of criterion 1, activatable with Enter or Space, and shown with a visible focus indicator.
8. WHEN a user activates the Sejarah, Penjejak or Ekstrak AI item, THE UI SHALL route the change through the existing `App.jsx` navigation behaviour, including flushing any pending Editor_View auto-save before leaving the editor, clearing the in-memory current meeting and refreshing the meeting list.
9. WHEN a user activates the Minit Baharu item, THE UI SHALL open a blank Editor_View using the existing `App.jsx` new-meeting behaviour.
10. WHILE a navigation change triggered from App_Navigation is still in progress (auto-save flush or meeting-list refresh pending), THE App_Navigation SHALL ignore further item activations, so that at most one navigation change runs at a time.
11. IF the Editor_View auto-save flush fails while the user is leaving the editor through App_Navigation, THEN THE UI SHALL show an error Toast in Bahasa Melayu saying the draft could not be saved, and SHALL keep the user in Editor_View with unsaved content intact.

### Requirement 5: Bahasa Melayu Consistency

**User Story:** As a public-sector user, I want all interface text in consistent, formal Bahasa Melayu, so that the tool matches the language of official documents.

#### Acceptance Criteria

1. THE UI SHALL display all UI-authored user-facing text in Bahasa Melayu in every view (App_Header, App_Navigation, History_View, Tracker_View, Ingest_View, Editor_View) and every UI_Primitive. This covers labels, button text, placeholders, tooltips (`title` values), Empty_State text, Toast and Confirm_Dialog text, Status_Badge labels, Save_Indicator text, the AI_Draft_Notice and `aria-label` values. The only exceptions SHALL be proper nouns, the acronyms "PKPA", "AI" and "MoM", file-format names (for example "MP3", "WAV", ".docx", "PDF") and content entered by the user or returned in meeting records.
2. THE UI SHALL replace the English strings "Overview", "No date", "No location" and "Edit" with "Ringkasan", "Tiada tarikh", "Tiada tempat" and "Sunting" respectively, so that none of the four English strings appears as visible text or as an `aria-label` value in any view.
3. THE UI SHALL take every recurring action and status term from the Terminology_Module (for example "Sunting" for edit, "Padam" for delete, "Muat Turun" for download, "Pratonton" for preview, "Simpan" for save, "Batal" for cancel), so that each concept appears with exactly one term in all views and synonyms for the same concept (for example "Ubah" or "Edit" alongside "Sunting") do not appear anywhere in the UI.
4. WHEN History_View, Tracker_View or the Editor_View preview displays a meeting date or action-item due date, THE UI SHALL format the date in the Display_Date_Format: the `ms-MY` locale with a two-digit day, the full Bahasa Melayu month name (Januari, Februari, Mac, April, Mei, Jun, Julai, Ogos, September, Oktober, November, Disember) and a four-digit year, separated by single spaces (for example "05 Mac 2026").
5. IF a meeting date or action-item due date is empty or cannot be parsed as a valid calendar date, THEN THE UI SHALL display "Tiada tarikh" in its place, without showing the raw value, "Invalid Date" or a blank area, and SHALL leave the stored record value unchanged.
6. IF the backend returns an error message for display, THEN THE UI SHALL show that message unchanged inside a Bahasa Melayu Toast or inline error whose heading text comes from the Terminology_Module, and IF no message is returned, THEN THE UI SHALL show a generic Bahasa Melayu error message saying the operation failed.
7. THE UI SHALL declare Bahasa Melayu as the document language through the root HTML `lang` attribute as specified in Requirement 10.12, and SHALL set the browser tab title to a Bahasa Melayu application name.

### Requirement 6: Status Indicators

**User Story:** As a meeting secretary tracking follow-ups, I want statuses shown the same way everywhere, so that I can tell at a glance which minutes are drafts and which actions are overdue.

#### Acceptance Criteria

1. THE Status_Badge SHALL map each status to exactly one semantic colour Design_Token from the Primary_Palette: Draf to warning, Selesai to success (for both meeting status and action-item status), Belum Mula to neutral, Sedang Berjalan to info, and Tertunggak to danger.
2. THE Status_Badge SHALL display, for every status, a visible Bahasa Melayu text label identical to the status name (Draf, Selesai, Belum Mula, Sedang Berjalan, Tertunggak) and an icon from `lucide-react`, where each of the five statuses uses a different icon.
3. THE Status_Badge SHALL render its text label against its background colour with a contrast ratio of at least 4.5:1, and SHALL expose the status to assistive technologies through the text label, with the icon marked as decorative.
4. THE UI SHALL use the Status_Badge for every meeting status shown in History_View and for every action-item status shown in Tracker_View, such that a given status renders with the same colour, icon, label and size in both views.
5. WHEN Tracker_View renders an action item whose deadline is a calendar date strictly earlier than the current local date and whose status is not Selesai, THE Tracker_View SHALL display the Tertunggak Status_Badge in place of the stored status, together with the deadline date in the Display_Date_Format.
6. IF an action item's deadline equals the current local date, is later than the current local date, is empty, or cannot be parsed as a date, THEN THE Tracker_View SHALL display the Status_Badge for the action item's stored status and SHALL NOT display the action item as Tertunggak.
7. IF a meeting or action item has a status value that is empty or not one of the five defined statuses, THEN THE Status_Badge SHALL display the neutral colour, a generic icon, and the label "Tidak Diketahui", without changing the stored status value.

### Requirement 7: Feedback and Notifications

**User Story:** As a user saving or deleting official records, I want clear, non-disruptive feedback, so that I know whether my action succeeded without being interrupted by browser pop-ups.

#### Acceptance Criteria

1. WHEN a user-initiated operation completes successfully, THE UI SHALL display a success Toast with a Bahasa Melayu message that names the completed operation. User-initiated operations are: manual save, final generation of minutes, delete, file load and transcription complete. A successful background auto-save SHALL NOT produce a Toast; the Save_Indicator SHALL show the result instead.
2. IF any operation fails, THEN THE UI SHALL display an error Toast containing a Bahasa Melayu message that names the failed operation, followed by the error `detail` returned by the backend if that `detail` is present and non-empty. "Any operation" includes background auto-saves and action-item status saves. A failure is a network error, a non-2xx response, a file read error, a transcription error or an extraction error. The user's unsaved form input in the current view SHALL be kept.
3. WHEN a success or info Toast is displayed, THE Toast SHALL dismiss itself automatically between 5 and 6 seconds after the Toast appears, unless the user has already dismissed the Toast.
4. WHEN an error Toast is displayed, THE Toast SHALL stay visible until the user activates the close button of the Toast.
5. THE Toast SHALL provide a close button that has a Bahasa Melayu accessible name, can be operated with the keyboard (Enter and Space), and removes the Toast as soon as the close button is activated.
6. THE UI SHALL announce Toast messages to assistive technologies through an ARIA live region, using `role="status"` for success and info messages and `role="alert"` for error messages, with the timing defined in Requirement 10.13.
7. WHEN a user requests deletion of a meeting, THE UI SHALL display a Confirm_Dialog showing the meeting title, a "Batal" button and a danger-styled "Padam" button, with "Batal" placed as the first Interactive_Element of the Confirm_Dialog so that keyboard focus moves to "Batal" when the Confirm_Dialog opens, consistent with Requirement 10.7.
8. WHEN the user activates "Batal", presses Escape, or clicks outside the open Confirm_Dialog, THE UI SHALL close the Confirm_Dialog without sending a delete request, return keyboard focus to the control that opened the Confirm_Dialog, and leave the meeting listed in History_View unchanged, consistent with Requirement 10.9.
9. WHILE a Confirm_Dialog is open, THE UI SHALL keep keyboard focus inside the Confirm_Dialog as specified in Requirement 10.8.
10. THE UI SHALL use Toast and Confirm_Dialog in place of every `window.alert` and `window.confirm` call, so that the frontend source contains zero calls to `window.alert`, `window.confirm`, `alert(` or `confirm(`.
11. WHILE more than one Toast is active, THE UI SHALL stack the Toasts in order of appearance and show no more than 3 at once, and WHEN a 4th Toast arrives, THE UI SHALL remove the oldest visible success or info Toast first.
12. IF saving an action-item status change in Tracker_View fails, THEN THE Tracker_View SHALL change the displayed status back to its value before the change and display an error Toast as described in criterion 2.

### Requirement 8: Loading, Progress and Empty States

**User Story:** As a user processing long recordings, I want to see what the system is doing at each stage, so that I trust it is working and know how long to wait.

#### Acceptance Criteria

1. WHILE meetings are being fetched, THE History_View and Tracker_View SHALL display between 3 and 6 skeleton placeholders in place of the content area, matching the layout of the item cards they replace, and SHALL NOT display an Empty_State or any partially loaded list during that time.
2. WHILE transcription is in progress, THE Ingest_View SHALL display a progress bar showing the completion percentage as a whole number from 0 to 100, the elapsed audio time, and the current stage label in Bahasa Melayu, with the progress bar carrying `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"` and an `aria-valuenow` equal to the displayed percentage.
3. WHILE transcription is in progress and the total audio duration is known, THE Ingest_View SHALL display the elapsed and total audio time together in the format elapsed / total, and IF the total audio duration is unknown, THEN THE Ingest_View SHALL display the elapsed audio time only.
4. WHILE the Whisper model is downloading, THE Ingest_View SHALL display an info-styled notice in Bahasa Melayu stating that the model is being downloaded for the first time and that later transcriptions will skip this step, and SHALL remove the notice when the first transcription progress update arrives, when transcription completes, or when an error occurs.
5. WHILE AI extraction is in progress, THE Ingest_View SHALL disable the extraction button, display a spinner inside the button, and display the label "Mengekstrak minit...", and WHEN extraction completes or fails, THE Ingest_View SHALL re-enable the button and restore its original label.
6. WHILE an asynchronous operation tied to a button is in progress, THE UI SHALL disable that button, set `aria-busy="true"` on the button, and ignore further activation of the button, so that a single click starts exactly one operation, and WHEN the operation completes or fails, THE UI SHALL set `aria-busy="false"` and re-enable the button.
7. WHEN a list in History_View or Tracker_View finishes loading with zero items to display, THE UI SHALL display an Empty_State containing an icon, a title in Bahasa Melayu, a description in Bahasa Melayu and, where a next step exists, a primary action button labelled with that step (for example, a button that opens Minit Baharu or Ekstrak AI when there are no meetings).
8. IF a list in History_View or Tracker_View has zero items because of an active search or filter while saved records still exist, THEN THE UI SHALL display an Empty_State stating that no records match the current criteria, together with an action that clears the search or filter, instead of the no-records Empty_State.
9. WHEN the transcription stage label changes, or when transcription or extraction completes or fails, THE Ingest_View SHALL announce the new state through a polite live region (`aria-live="polite"`), without announcing every percentage update.

### Requirement 9: Editor Save State and AI Review Cues

**User Story:** As a meeting secretary editing AI-extracted minutes, I want to see the save state and be reminded that AI output is a draft, so that I verify the content before issuing official minutes.

#### Acceptance Criteria

1. WHEN a background auto-save request starts (3 seconds after the last form change, or when a save is forced before leaving Editor_View), THE Save_Indicator SHALL display the state "Menyimpan..." until that request completes or fails.
2. WHEN a background auto-save request completes successfully, THE Save_Indicator SHALL display "Disimpan pada HH:MM", where HH:MM is the local completion time in 24-hour format with zero-padded hours and minutes.
3. IF a background auto-save request fails because of a network error or a non-success response from the backend, THEN THE Save_Indicator SHALL display "Gagal disimpan" using the danger semantic colour of the Primary_Palette and an icon, keep every value entered in the form unchanged, and keep displaying "Gagal disimpan" until the next auto-save request succeeds.
4. IF a background auto-save request fails, THEN THE Editor_View SHALL show an error Toast indicating that the minutes could not be saved, and SHALL retry the save on the next form change or when the user activates a retry control in that Toast.
5. THE Save_Indicator SHALL expose its current state text to assistive technologies through a polite live region, so that each state change is announced without moving keyboard focus, with "Gagal disimpan" announced as specified in Requirement 10.13.
6. WHILE the user scrolls the Editor_View form at Breakpoint_Mobile, Breakpoint_Tablet or Breakpoint_Desktop, THE Editor_View SHALL keep the Save_Indicator and the primary "Jana Minit Mesyuarat" button fully visible in a sticky action bar that does not cover any form field that has keyboard focus.
7. WHEN Editor_View opens a meeting with status Draf whose raw transcript contains at least one non-whitespace character, THE Editor_View SHALL display the AI_Draft_Notice above the first form card, stating in Bahasa Melayu that the content is an AI-generated draft that must be verified before it becomes an official record.
8. IF Editor_View opens a meeting with status Selesai, or a meeting whose raw transcript is empty or contains only whitespace, THEN THE Editor_View SHALL NOT display the AI_Draft_Notice.
9. THE Editor_View SHALL order the form cards in the same sequence as the sections of the PKPA Bil. 2/1991 document rendered in preview mode, and SHALL display a section navigation list containing one entry per form card, labelled with the Bahasa Melayu section heading of that card, in the same order.
10. WHEN the user activates an entry in the section navigation list by mouse, touch or keyboard, THE Editor_View SHALL scroll so that the heading of the matching form card is visible below the sticky action bar, and SHALL move keyboard focus to that heading.
11. WHILE Editor_View is in preview mode, THE Editor_View SHALL render the minutes on a white page surface with a width-to-height ratio of 1:1.414 (A4), using the official document typography and no Design_System colours from the application chrome inside the page surface, visually separated from the surrounding App_Header, App_Navigation and sticky action bar.

### Requirement 10: Accessibility

**User Story:** As a public-sector user who may rely on a keyboard or screen reader, I want the application to be accessible, so that I can produce minutes without barriers, in line with government accessibility expectations.

#### Acceptance Criteria

1. THE UI SHALL render body text (text smaller than 18.66px bold or 24px regular) with a contrast ratio of at least 4.5:1 against its background, and SHALL render large text (18.66px bold or 24px regular and larger), meaningful icons, Status_Badge borders and input borders with a contrast ratio of at least 3:1 against their adjacent background, in the default, hover and focus states of every view (the disabled state is excepted).
2. WHEN an Interactive_Element receives focus through keyboard navigation, THE UI SHALL display a focus indicator consisting of an outline at least 2px thick with a contrast ratio of at least 3:1 against the adjacent background, with the focus indicator fully visible and uncovered by other content.
3. THE UI SHALL make every Interactive_Element in App_Header, App_Navigation, History_View, Tracker_View, Ingest_View, Editor_View, Toast and Confirm_Dialog reachable with the Tab and Shift+Tab keys and operable with the Enter key (and the Space key for buttons, checkboxes and selects), with tab order following the visual reading order of top-to-bottom, then left-to-right, and with no Interactive_Element given a positive tab index.
4. THE Form_Field SHALL associate every input, select and textarea with a visible text label through `htmlFor` and `id`, where each `id` is unique within the rendered page.
5. THE UI SHALL give every icon-only button an `aria-label` in Bahasa Melayu that names the action and its target (for example the participant remove button "Buang ahli").
6. THE UI SHALL mark with `aria-hidden="true"` every icon that is displayed alongside a visible text label conveying the same meaning or that conveys no information.
7. WHEN the Confirm_Dialog opens, THE Confirm_Dialog SHALL move keyboard focus to the first Interactive_Element inside the Confirm_Dialog (the "Batal" button for the delete Confirm_Dialog defined in Requirement 7.7) and SHALL expose the dialog title as its accessible name.
8. WHILE the Confirm_Dialog is open, THE Confirm_Dialog SHALL keep keyboard focus inside the Confirm_Dialog, with Tab and Shift+Tab cycling only through the Interactive_Elements of the Confirm_Dialog, moving focus from the last Interactive_Element to the first on Tab and from the first to the last on Shift+Tab.
9. WHEN the Escape key is pressed while the Confirm_Dialog is open, THE Confirm_Dialog SHALL close without performing the destructive action and SHALL return focus to the Interactive_Element that opened the Confirm_Dialog.
10. WHERE the operating system reports `prefers-reduced-motion: reduce`, THE UI SHALL disable all transitions and animations longer than 0ms except progress indication for transcription and AI extraction, which SHALL remain visible as a static or text-based indicator.
11. WHILE the viewport is at Breakpoint_Mobile, THE UI SHALL render every Interactive_Element with a touch target of at least 40 by 40 CSS pixels, including any padding that receives the pointer event, except App_Navigation items, which SHALL have a touch target of at least 44 by 44 CSS pixels as specified in Requirements 4.6 and 11.7.
12. THE UI SHALL set `lang="ms"` on the root HTML element.
13. WHEN a Toast is shown or the Save_Indicator changes state, THE UI SHALL announce the Toast text or the new Save_Indicator state to screen readers within 1 second without moving keyboard focus, using an assertive announcement for error messages and a polite announcement for all other messages.
14. IF a Form_Field fails validation, THEN THE Form_Field SHALL display a visible error message in Bahasa Melayu next to the field, SHALL programmatically associate that message with the field so screen readers read the message with the field, SHALL mark the field as invalid to assistive technology, and SHALL retain the value the user entered.

### Requirement 11: Responsive Layout

**User Story:** As an officer who may review minutes on a laptop, tablet or phone, I want the layout to adapt to my screen, so that I can work comfortably on any device.

#### Acceptance Criteria

1. THE UI SHALL render App_Header, App_Navigation, History_View, Tracker_View, Ingest_View and Editor_View with no horizontal scrolling of the page body at every viewport width from 360px to 1920px inclusive, with any wider content (such as the official-document preview or data tables) scrolling horizontally only inside its own bounded container.
2. WHILE the viewport is at Breakpoint_Desktop, THE History_View SHALL display the summary and filter panel in a column beside the meeting list, with the top edges of both aligned in the same row.
3. WHILE the viewport is at Breakpoint_Mobile or Breakpoint_Tablet, THE History_View SHALL display the summary and filter panel stacked above the meeting list at the full width of the main content area.
4. WHILE the viewport is at Breakpoint_Mobile, THE History_View SHALL display the actions of each meeting card on a single row without wrapping to a second line, and IF the actions do not fit on that row, THEN THE History_View SHALL place the actions that do not fit inside an overflow menu that stays reachable from the same card.
5. WHILE the viewport is at Breakpoint_Mobile, THE Editor_View SHALL display each participant, agenda and action-item row as vertically stacked fields, with a visible text label in Bahasa Melayu above each field that stays visible after the field contains a value.
6. THE UI SHALL constrain the main content area to a maximum width of 1280px, centred horizontally in the viewport, with horizontal padding of at least 16px on each side at Breakpoint_Mobile.
7. WHILE the viewport is at Breakpoint_Mobile, THE App_Navigation SHALL keep all four views (Sejarah, Penjejak, Ekstrak AI, Minit Baharu) reachable without horizontal page scrolling, with each navigation Interactive_Element having a touch target of at least 44px by 44px.
8. WHEN the viewport width crosses a boundary between Breakpoint_Mobile, Breakpoint_Tablet and Breakpoint_Desktop (including on device rotation), THE UI SHALL switch to the layout for the new breakpoint without reloading the page, and SHALL keep the current view, unsaved form values in Editor_View and the scroll position of the active view.

### Requirement 12: Dashboard Presentation for Oversight

**User Story:** As a department head, I want a concise overview of meetings and follow-up actions, so that I can monitor progress without reading every record.

#### Acceptance Criteria

1. WHEN the History_View loads or the meeting list changes, THE History_View SHALL display three statistic cards, built with the Design_System Card and labelled Jumlah Mesyuarat, Draf and Selesai, each showing a non-negative integer count: Jumlah Mesyuarat is the total number of saved meetings, Draf is the number of meetings with status Draf, and Selesai is the number of meetings with status Selesai.
2. WHEN the Tracker_View loads or any action-item status changes, THE Tracker_View SHALL display five statistic cards, built with the Design_System Card and labelled Jumlah, Belum Mula, Sedang Berjalan, Tertunggak and Selesai, each showing a non-negative integer count and using the same colour and icon as the Status_Badge for that status (Jumlah uses the neutral Primary_Palette colour), with each action item counted in exactly one status card so that Belum Mula + Sedang Berjalan + Tertunggak + Selesai equals Jumlah.
3. THE Tracker_View SHALL classify an action item as Tertunggak when the status of the action item is not Selesai and its deadline is a calendar date strictly earlier than the current local date, and SHALL classify an action item with no deadline or an unparseable deadline by its stored status, consistent with Requirements 6.5 and 6.6.
4. WHEN the Tracker_View displays statistics, THE Tracker_View SHALL show the completion rate as a whole-number percentage between 0% and 100%, calculated as Selesai divided by Jumlah and rounded to the nearest integer, alongside a single-colour progress indicator filled in the success Design_Token to the same proportion.
5. IF the Jumlah of action items is 0, THEN THE Tracker_View SHALL display the completion rate as 0% with an empty progress indicator, and SHALL show the Empty_State in place of the action-item list.
6. WHILE the viewport is at Breakpoint_Desktop, THE Tracker_View SHALL present the action-item list as a table with column headers Tindakan, Tanggungjawab, Tarikh Akhir, Mesyuarat and Status, one row per action item, with the Status column showing the Status_Badge of the action item and the Tarikh Akhir column showing the deadline in the Display_Date_Format.
7. WHILE the viewport is at Breakpoint_Mobile or Breakpoint_Tablet, THE Tracker_View SHALL present the action-item list as vertically stacked cards, each card showing the same five fields (Tindakan, Tanggungjawab, Tarikh Akhir, Mesyuarat, Status) with their Bahasa Melayu labels, without horizontal scrolling of the page.
8. THE Tracker_View SHALL order the action-item list with Tertunggak items first, then all other items, and within each group SHALL sort items by ascending deadline, place items without a deadline after items with one, and keep items with the same deadline (or no deadline) in the order in which they appear in their source meeting records.

### Requirement 13: Preservation of Existing Behaviour

**User Story:** As a maintainer, I want the redesign to change presentation only, so that existing records, exports and workflows keep working.

#### Acceptance Criteria

1. THE UI SHALL send every backend request to the same `/api/...` endpoint, with the same HTTP method and the same request payload field names and value types, as the pre-redesign frontend for the same user action.
2. THE UI SHALL read and interpret backend responses (including streamed transcription progress, completion and error events) using the same response field names as the pre-redesign frontend, so that meeting records saved before the redesign open in Editor_View with every field the pre-redesign frontend displayed for them.
3. WHEN the user changes any field in Editor_View for a meeting that has at least one non-empty field other than a default untitled title, THE Editor_View SHALL save the meeting 3 seconds after the last change, and SHALL restart the 3-second wait without saving if a further change happens within those 3 seconds.
4. WHEN Editor_View saves a meeting more than once, THE Editor_View SHALL reuse the same meeting `id` for every save so that the backend upsert keeps exactly one record for that meeting.
5. WHEN the user navigates from Editor_View to any other view while an auto-save is pending, THE Editor_View SHALL complete that save before the other view renders, and THE UI SHALL then refresh the meeting list shown in History_View and Tracker_View.
6. WHILE Editor_View shows a meeting whose only content is empty fields or a default untitled title, THE Editor_View SHALL NOT create a saved meeting record via auto-save or navigation flush.
7. THE UI SHALL provide each of these pre-redesign user functions with the same outcome as the pre-redesign frontend: text search and status filtering in History_View, text search and status filtering in Tracker_View, template selection, custom template upload, Whisper model selection, transcript download in TXT, JSON and SRT formats, `.docx` download, the official-document preview, and restoration of the last transcript in Ingest_View after a page reload in the same browser tab.
8. WHEN `npm run build` is run in `frontend/`, THE UI SHALL compile without errors into `backend/static`, and WHEN `npm run lint` is run in `frontend/`, THE UI SHALL report zero errors.

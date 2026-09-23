# Requirements Document: Penjana Minit Mesyuarat

## Introduction

The **Penjana Minit Mesyuarat** (MoM Automation Platform) is a local-first, privacy-focused web application for Malaysian Public Sector agencies. It converts raw meeting audio or transcript files into structured, schema-validated JSON meeting records and renders them as official printable documents compliant with **Pekeliling Kemajuan Pentadbiran Awam (PKPA) Bilangan 2 Tahun 1991**.

The system operates entirely on-premises. No meeting data, audio, or transcript content is transmitted to any third-party cloud storage or workflow platform. The LLM extraction call to the Anthropic API is the sole outbound network dependency, and it transmits only the de-identified transcript text required for semantic extraction.

The platform consists of two tiers:

- **Tier 1 — Local Processing Service:** A `faster-whisper` speech-to-text engine and a Claude Sonnet extraction agent, orchestrated by a **FastAPI** REST backend (`backend/`). Meeting records are persisted as flat-file JSON under `data/meetings/`.
- **Tier 2 — Web UI:** A **React + Vite** Single Page Application (`frontend/`) served directly from the FastAPI process, providing four functional views: Executive Dashboard, Action Tracker, Audio Ingestion & AI Extractor, and Official MoM Editor & Preview.

> **Superseded architecture:** All references to Amazon Quick Automate, Amazon Quick Flows, Quick Spaces (`MoM-Pipeline-Ingestion`), `scripts/dispatch_quick.py`, `scripts/upload_to_space.py`, AWS Bedrock, and `boto3` are **fully deprecated and removed**. The downstream dispatch mechanism is email (`scripts/dispatch_email.py`), not a webhook.

---

## Glossary

- **Platform**: The end-to-end Penjana Minit Mesyuarat web application described in this document.
- **Backend**: The FastAPI REST service (`backend/`) hosting all API routes and serving the compiled frontend bundle.
- **Frontend**: The React + Vite SPA (`frontend/`) compiled into `backend/static/` and served at root `/`.
- **Transcript**: Raw text (`.txt`) or audio (`.mp3`, `.wav`, `.m4a`) provided by the meeting administrator.
- **Whisper_Engine**: The local `faster-whisper` speech-to-text component (`scripts/whisper_engine.py`) exposed via `POST /api/transcribe`.
- **Extraction_Agent**: The LLM-backed component (`scripts/extraction_agent.py`) that calls the Anthropic API (Claude Sonnet) and returns structured MoM data, governed by `.kiro/steering/mom-rules.md`.
- **MoM_Schema**: The Pydantic-validated JSON schema defining the structure of a meeting record (`backend/models.py`).
- **Meeting_Record**: A single meeting persisted as `data/meetings/{meeting_id}.json`.
- **Meeting_Status**: The lifecycle state of a Meeting_Record: `Draf` (Draft) or `Selesai` (Completed).
- **Action_Item**: A task with an assignee, deadline, and status extracted from or entered into a meeting record.
- **Action_Item_Status**: `Belum Mula` (Not Started) · `Sedang Berjalan` (In Progress) · `Selesai` (Completed) · `Tertunggak` (Overdue).
- **PKPA_Document**: An official government meeting minutes document rendered in-memory by `backend/services/document_generator.py` according to PKPA Bil. 2/1991 formatting conventions.
- **Email_Dispatch**: The outbound notification mechanism (`scripts/dispatch_email.py`) for distributing finalized meeting minutes to participants.
- **Steering_Rules**: LLM behavioural rules and extraction heuristics defined in `.kiro/steering/mom-rules.md`.

---

## Requirements

---

### Requirement 1: Audio and Transcript Ingestion

**User Story:** As a meeting administrator, I want to upload meeting audio or a raw transcript through the web UI, so that transcription and extraction can be initiated without manual file handling or IDE sessions.

#### Acceptance Criteria

1. THE `IngestView` UI SHALL provide a drag-and-drop file dropzone that accepts audio files (`.mp3`, `.wav`, `.m4a`) and plain text files (`.txt`).
2. WHEN an audio file is uploaded, THE Frontend SHALL issue a `POST /api/transcribe` multipart request to the Backend; THE Backend SHALL save the file to `data/uploads/`, invoke the Whisper_Engine, and return a JSON response containing `transcript` (full text), `segments_count`, and `filename`.
3. THE Whisper_Engine SHALL use `faster-whisper` model `large-v3-turbo` with `int8` compute quantization, VAD filtering enabled, and auto language detection supporting Bahasa Melayu / English / Manglish code-switching.
4. WHEN a `.txt` file is uploaded, THE Frontend SHALL read its content client-side and populate the transcript editor textarea directly, bypassing the Whisper_Engine.
5. THE `IngestView` SHALL display real-time status feedback during transcription (uploading, transcribing, complete, error), including a segment count indicator on success.
6. IF `POST /api/transcribe` returns an error, THE Frontend SHALL display a Malay-language error message and allow the user to retry without re-uploading.
7. THE Backend SHALL operate independently of any active IDE or Kiro agent session; the Whisper_Engine and Extraction_Agent SHALL be invocable headlessly via `scripts/run_pipeline.py` as well as through the API.

---

### Requirement 2: AI-Powered Semantic Extraction

**User Story:** As a meeting secretary, I want the system to automatically extract participants, agenda items, decisions, and action items from a transcript, so that I only need to review and refine rather than type from scratch.

#### Acceptance Criteria

1. WHEN the user triggers extraction from `IngestView`, THE Frontend SHALL issue a `POST /api/extract` request with `{ "transcript": "<text>" }` as the JSON body.
2. THE Extraction_Agent SHALL invoke the Anthropic API using model `claude-3-5-sonnet-latest` (or current alias), authenticated via `ANTHROPIC_API_KEY` from the `.env` file. No AWS credentials, boto3, or Bedrock SDK SHALL be used.
3. THE Extraction_Agent SHALL load `.kiro/steering/mom-rules.md` at extraction start and inject the rules content into the Claude system prompt. IF the steering file is absent, THE Agent SHALL apply built-in default rules and log a warning.
4. THE Extraction_Agent SHALL return a JSON object conforming to MoM_Schema containing: `participants`, `agenda_items`, `decisions`, `action_items`, and `extraction_metadata` (including `extraction_status`, `token_usage`, `language_detected`, `rules_version`).
5. WHEN a transcript contains fewer than 50 usable words (after stripping punctuation and whitespace), THE Extraction_Agent SHALL return a partial result with `extraction_status: "partial"`, `near_empty: true`, and all extraction arrays set to `[]`.
6. IF the Anthropic API returns an error or the response is not parseable as valid JSON, THE Extraction_Agent SHALL retry once with an identical prompt; IF the retry also fails, it SHALL log the error and return `extraction_status: "failed"`.
7. THE `POST /api/extract` endpoint SHALL return `{ "status": "success", "data": <MoM_Schema_object> }` on success and `{ "status_code": 500, "detail": "<Malay error message>" }` on failure.
8. AFTER successful extraction, THE Frontend SHALL pre-populate the `EditorView` with the extracted data, routing the user directly to the editor for review.

---

### Requirement 3: Meeting Record Persistence (CRUD)

**User Story:** As a meeting administrator, I want all meeting records saved persistently, so that I can retrieve, edit, and delete them at any time without losing data.

#### Acceptance Criteria

1. EACH meeting record SHALL be stored as a UTF-8 JSON file at `data/meetings/{meeting_id}.json`, where `meeting_id` is a server-generated identifier in the format `meet_{8-char hex}`.
2. THE `POST /api/meetings/save` endpoint SHALL accept a `MeetingModel` payload, assign a `meeting_id` if none is provided, write the record atomically, and return `{ "status": "success", "id": "<meeting_id>", "data": <record> }`.
3. THE `GET /api/meetings` endpoint SHALL return a JSON array of all stored meeting records by scanning `data/meetings/*.json`; an empty array SHALL be returned if no records exist.
4. THE `GET /api/meetings/{meeting_id}` endpoint SHALL return the full meeting record for the given ID, or a 404 with `{ "detail": "Minit mesyuarat tidak dijumpai." }` if not found.
5. THE `DELETE /api/meetings/{meeting_id}` endpoint SHALL delete the corresponding file and return `{ "status": "deleted", "id": "<meeting_id>" }`, or a 404 if not found.
6. THE `MeetingModel` SHALL include at minimum: `id`, `meeting_title`, `meeting_number`, `location`, `date` (ISO 8601 `YYYY-MM-DD`), `start_time`, `end_time`, `chairperson_name`, `chairperson_role`, `status` (`Draf` | `Selesai`), `action_items` (array of `ActionItemModel`), and `raw_transcript`.
7. THE `ActionItemModel` SHALL include: `task`, `assignee` (default `"Belum Ditetapkan"`), `deadline` (default `"-"`), and `status` (default `"Belum Mula"`; valid values: `Belum Mula`, `Sedang Berjalan`, `Selesai`, `Tertunggak`).
8. THE `status` field of a Meeting_Record SHALL default to `"Draf"` on creation and SHALL be updatable to `"Selesai"` by the user in `EditorView`.
9. IF `data/meetings/` does not exist, THE Backend SHALL create it automatically on first save.

---

### Requirement 4: Official Document Generation (PKPA Bil. 2/1991)

**User Story:** As a department head, I want to generate a print-ready official meeting minutes document compliant with Malaysian Public Sector formatting standards, so that the output can be signed, archived, and distributed without reformatting.

#### Acceptance Criteria

1. THE `GET /api/export/{meeting_id}/html` endpoint SHALL render and return a complete, standalone HTML document representing the official meeting minutes for the given record.
2. THE HTML document SHALL be generated entirely in-memory by `backend/services/document_generator.py` without reading any disk-based templates.
3. THE document SHALL conform to PKPA Bil. 2/1991 layout conventions: Times New Roman serif font, 12pt body size, uppercase meeting title, bilangan (meeting number), metadata table (Tarikh, Masa, Tempat, Pengerusi), horizontal rule, and an action items table with columns Bil, Perkara/Tindakan, Tindakan Oleh, Tarikh Akhir.
4. THE `Tarikh` field in the rendered document SHALL display the meeting date formatted as Malay long-form (e.g., `15 Januari 2025`), produced by `backend/services/formatter.py::format_malay_date`.
5. THE rendered HTML SHALL include a "Cetak / Simpan PDF" button visible on screen but hidden during browser print (`@media print { .no-print { display: none; } }`), so the user can produce a PDF via the browser's native print-to-PDF function.
6. IF the `meeting_id` is not found, THE endpoint SHALL return HTTP 404 with `{ "detail": "Mesyuarat tidak dijumpai." }`.
7. THE `EditorView` SHALL provide an in-app toggle ("Preview PKPA") that loads the export URL in an embedded `<iframe>` or opens it in a new browser tab, allowing the user to verify the printed layout before finalizing.

---

### Requirement 5: Executive Dashboard (HistoryView)

**User Story:** As a department head, I want a dashboard showing all past meetings with search and filter capabilities, so that I can quickly locate and manage meeting records.

#### Acceptance Criteria

1. THE `HistoryView` SHALL display KPI metric tiles showing: **Jumlah Minit** (total meeting count), **Draf** (count of records with `status: "Draf"`), and **Selesai** (count of records with `status: "Selesai"`).
2. THE `HistoryView` SHALL provide a live multi-field search input that filters the visible meeting list in real time across `meeting_title`, `chairperson_name`, `location`, and `date` fields.
3. THE `HistoryView` SHALL provide status filter pills — **Semua**, **Draf**, **Selesai** — that filter the meeting list by `Meeting_Status`.
4. EACH meeting SHALL be displayed as a card showing: meeting title, meeting number, date, location, chairperson name, status badge, and three action buttons: **Lihat** (view in preview mode), **Sunting** (open in edit mode), **Padam** (delete with confirmation).
5. WHEN **Padam** is clicked, THE Frontend SHALL show a confirmation dialog in Bahasa Melayu before issuing `DELETE /api/meetings/{id}`.
6. WHEN **Lihat** is clicked, THE Frontend SHALL load the meeting record and open `EditorView` in preview mode (`previewMode: true`).
7. WHEN **Sunting** is clicked, THE Frontend SHALL load the meeting record and open `EditorView` in edit mode (`previewMode: false`).
8. IF no meetings are stored, THE `HistoryView` SHALL display an empty state message in Bahasa Melayu with a call-to-action to create a new meeting.

---

### Requirement 6: Action Tracker (TrackerView)

**User Story:** As a project manager, I want a cross-meeting action item tracker, so that I can monitor the status of all follow-up tasks across all meeting records in one place.

#### Acceptance Criteria

1. THE `TrackerView` SHALL aggregate action items across ALL stored meeting records and display KPI counters for: **Jumlah** (total), **Belum Mula** (not started), **Sedang Berjalan** (in progress), **Tertunggak** (overdue).
2. THE `TrackerView` SHALL display a visual completion percentage bar showing the proportion of action items with `status: "Selesai"` relative to the total.
3. THE `TrackerView` SHALL display a categorized progress distribution section showing per-status item counts with visual differentiation.
4. ACTION items from all meetings SHALL be aggregated client-side from the `meetings` state array, which is pre-loaded by `App.jsx` on mount via `GET /api/meetings`.
5. THE `TrackerView` SHALL display the source meeting title for each action item to provide context.

---

### Requirement 7: Official MoM Editor & Preview (EditorView)

**User Story:** As a meeting secretary, I want a structured form to author or review all sections of an official meeting minutes document, so that I can produce a complete, accurate record ready for signing.

#### Acceptance Criteria

1. THE `EditorView` SHALL provide structured input fields for all `MeetingModel` metadata: meeting title, meeting number, date (date picker), start time, end time, venue/location, chairperson name, chairperson role, and meeting status (`Draf` / `Selesai`).
2. THE `EditorView` SHALL support a dynamic participant badge manager: the user can add participant names, and each participant SHALL be displayed as a removable badge/chip. The participant list SHALL be stored in the meeting record.
3. THE `EditorView` SHALL provide dynamic agenda cards: each card contains a title, discussion summary textarea, and a list of formal decisions/resolutions. Cards SHALL be addable and removable.
4. THE `EditorView` SHALL provide an action items matrix: each row contains `task` description, `assignee`, `deadline`, and `status` dropdown. Rows SHALL be addable and removable.
5. WHEN the user clicks **Simpan** (Save), THE Frontend SHALL issue `POST /api/meetings/save` with the full `MeetingModel` payload and display a Malay-language success or error toast notification.
6. THE `EditorView` SHALL provide a toggle button to switch between edit mode and the PKPA Bil. 2/1991 printable preview layout. In preview mode, the form fields SHALL be replaced by the formatted document view.
7. IF `previewMode` is `true`, THE `EditorView` SHALL load the export HTML from `GET /api/export/{meeting_id}/html` in an embedded display (iframe or inline render) to show the final printable layout.
8. THE `EditorView` SHALL display a back button that returns the user to `HistoryView` and triggers a meetings list refresh.

---

### Requirement 8: Email Dispatch

**User Story:** As a meeting secretary, I want to email the finalized meeting minutes to all participants, so that distribution happens automatically without manual attachment handling.

#### Acceptance Criteria

1. A `scripts/dispatch_email.py` module SHALL implement email dispatch of finalized meeting minutes to a configurable list of recipients.
2. THE dispatch module SHALL read SMTP configuration exclusively from environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`; IF any required variable is absent, the module SHALL log a configuration error and exit with code `1` without sending any email.
3. THE dispatch module SHALL accept a `meeting_id` argument, load the corresponding `data/meetings/{meeting_id}.json` record, call `generate_official_mom_html` to produce the document body, and send it as an HTML email with the meeting title as the subject.
4. THE email SHALL include the PKPA Bil. 2/1991 formatted HTML as the message body, with a plain-text fallback summarizing the meeting title, date, and action item count.
5. IF an SMTP connection or send error occurs, THE dispatch module SHALL retry up to 3 times with a 5-second delay between attempts, logging each retry attempt. After all retries are exhausted, it SHALL exit with code `1`.
6. ON successful dispatch, THE dispatch module SHALL log a success message including the `meeting_id`, recipient count, and SMTP server, and exit with code `0`.
7. A future `POST /api/dispatch/email/{meeting_id}` endpoint SHOULD trigger `dispatch_email.py` from the web UI; this endpoint is deferred to a follow-up sprint.

---

### Requirement 9: Local-First Privacy & Security

**User Story:** As an IT security officer, I want all meeting data processed and stored locally, so that sensitive government meeting content never leaves the on-premises environment except for the controlled LLM API call.

#### Acceptance Criteria

1. ALL meeting records, audio uploads, and transcripts SHALL be stored exclusively under `data/` within the local workspace; no data SHALL be written to external cloud storage.
2. THE Anthropic API call SHALL transmit only the de-identified transcript text required for semantic extraction; meeting metadata (title, participants list, location) SHALL NOT be included in the LLM prompt unless directly embedded in the transcript text.
3. THE `ANTHROPIC_API_KEY` SHALL be stored exclusively in the `.env` file at the workspace root; it SHALL NOT be committed to version control (`.gitignore` must exclude `.env`).
4. THE Backend SHALL enforce CORS; in development, `allow_origins=["*"]` is acceptable; in production deployment, origins SHALL be restricted to the local host.
5. THE `data/uploads/` directory SHALL retain uploaded audio files only for the duration of the session; a cleanup mechanism SHALL remove files older than 24 hours.
6. THE Platform SHALL NOT depend on any persistent internet connection for core functionality; operation with `ANTHROPIC_API_KEY` absent SHALL degrade gracefully — the `/api/extract` endpoint SHALL return a 503 with a Malay-language message instructing the administrator to configure the API key.

---

### Requirement 10: API & Frontend Integration

**User Story:** As a developer, I want a clean REST API contract and a correctly built frontend bundle, so that the SPA and backend can be developed and deployed as a single process.

#### Acceptance Criteria

1. THE Backend (`uvicorn backend.app:app`) SHALL serve the compiled React bundle from `backend/static/` using FastAPI `StaticFiles` mounted at `/`. All routes not matching `/api/*` SHALL fall through to `index.html` for client-side routing.
2. THE Frontend Vite dev server SHALL proxy `/api/*` requests to `http://localhost:8000` during development, so that frontend and backend can be run independently without CORS issues.
3. THE compiled frontend bundle SHALL be produced by `cd frontend && npm run build`, which outputs to `frontend/dist/`. The `Makefile` or a build script SHALL copy `frontend/dist/` to `backend/static/` as the deployment step.
4. ALL API endpoints SHALL use the `/api` prefix. THE `pipeline` router exposes `/api/transcribe` and `/api/extract`. THE `meetings` router exposes `/api/meetings` (CRUD). THE `export` router exposes `/api/export/{id}/html`.
5. ALL API error responses SHALL include a `detail` field with a Malay-language human-readable message.
6. THE Backend SHALL enforce a request size limit of at least 100 MB on `POST /api/transcribe` to accommodate meeting audio files.

---

### Requirement 11: Steering Rules

**User Story:** As a pipeline maintainer, I want extraction heuristics and LLM behavioural rules centralised in a steering file, so that extraction behaviour can be updated without modifying core code.

#### Acceptance Criteria

1. WHEN an extraction run starts, THE Extraction_Agent SHALL load `.kiro/steering/mom-rules.md` and inject its full content into the Claude system prompt under the `RULES:` section.
2. THE steering file SHALL define, at minimum: decision markers in Bahasa Melayu and English, action item markers in Bahasa Melayu and English, Manglish pragmatic particles, department canonical mappings, and a `rules_version` YAML front-matter field.
3. THE steering file content SHALL be portability-safe — structured such that it can be ported verbatim as an Amazon Bedrock system prompt in future cloud migration without transformation.
4. WHEN `.kiro/steering/mom-rules.md` is absent, THE Extraction_Agent SHALL apply built-in default rules and set `extraction_metadata.rules_version` to `"built-in-default"`.
5. THE `extraction_metadata.rules_version` in any extraction output SHALL match the `rules_version` value loaded from the steering file at extraction start.

---

### Requirement 12: Headless CLI Runner

**User Story:** As a system operator, I want to run the full extraction pipeline from the command line without launching the web server, so that batch processing and scheduled jobs are possible.

#### Acceptance Criteria

1. `scripts/run_pipeline.py` SHALL accept a transcript file path as a required positional argument and an optional `--output` flag (default: `data/extracted_mom.json`).
2. THE CLI runner SHALL execute the complete sequence: deduplication check → Whisper transcription (if audio file) or direct read (if `.txt`) → Extraction_Agent → schema validation → atomic write to `--output` path.
3. THE CLI runner SHALL exit with code `0` on success (including clean duplicate-skip) and code `1` on any failure.
4. THE CLI runner SHALL NOT import any Kiro IDE, VS Code extension host, or agent session API. All dependencies SHALL be satisfiable from `requirements.txt`.
5. WHEN the input file's SHA-256 hash is already present in `data/.dedup_registry.json` with `status: "success"`, THE CLI runner SHALL log a duplicate-detection warning and exit `0` without re-extracting.

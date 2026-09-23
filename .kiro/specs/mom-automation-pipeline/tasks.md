# Implementation Plan: Penjana Minit Mesyuarat

## Overview

Implements the end-to-end MoM Automation Platform — a local-first Malaysian Public Sector meeting minutes web application. The platform ingests meeting audio or transcript files, extracts structured data via Claude Sonnet (Anthropic API direct), persists meeting records as flat-file JSON, renders official PKPA Bil. 2/1991 documents, and distributes finalized minutes by email.

**Stack:** FastAPI · faster-whisper · Anthropic SDK · React 19 · Vite 8 · Tailwind CSS 4 · Pydantic v2

> **Deprecated and removed from this plan:** Amazon Quick Automate, Quick Flows, Quick Spaces, `dispatch_quick.py`, `upload_to_space.py`, AWS Bedrock, boto3, Kiro IDE Agent Hooks as production triggers. All prior tasks referencing these systems are superseded.

---

## Tasks

### Group 1 — Project Scaffolding & Steering Rules

- [x] 1.1 Create workspace directory structure
  - `transcripts/`, `data/`, `data/meetings/`, `data/uploads/`, `scripts/`, `tests/`, `backend/`, `frontend/`
  - `.gitkeep` files in `transcripts/`, `data/`
  - `__init__.py` in `scripts/`, `tests/`, `backend/`, `backend/routes/`, `backend/services/`
  - _Requirements: 3.9, 10.1_

- [x] 1.2 Define steering rules in `.kiro/steering/mom-rules.md`
  - YAML front-matter: `rules_version`, `inclusion: auto`, `name`, `description`
  - Decision markers (BM ≥10, EN ≥10, Manglish informal list)
  - Action item markers (BM, EN, Manglish)
  - Manglish pragmatic particles: `lah`, `mah`, `lor`, `kan`, `boleh ke`, `tak boleh`
  - Department canonical mappings (8 groups: IT, Finance, HR, Ops, Legal, Marketing, Engineering, Admin)
  - Speaker-change heuristics with `confidence_threshold: 0.65`
  - LLM prompt templates (system + user placeholders)
  - Token efficiency rules, `near_empty_word_threshold: 50`, chunking config
  - _Requirements: 11.1, 11.2, 11.5_

- [x] 1.3 Create `.env` and `.gitignore`
  - `.env`: `ANTHROPIC_API_KEY=`, `SMTP_HOST=`, `SMTP_PORT=`, `SMTP_USER=`, `SMTP_PASSWORD=`, `SMTP_FROM=`
  - `.gitignore`: exclude `.env`, `data/uploads/`, `__pycache__/`, `*.pyc`, `.venv/`, `frontend/node_modules/`, `backend/static/`
  - _Requirements: 9.3_

- [x] 1.4 Create `requirements.txt`
  - `fastapi>=0.141.1`, `uvicorn[standard]>=0.53.0`, `python-multipart>=0.0.9`
  - `pydantic>=2.13.5`, `faster-whisper>=1.2.1`, `anthropic>=1.6.0`
  - `python-dotenv>=1.2.3`, `requests>=2.34.2`
  - _No boto3, no amazon-q-sdk, no webhooks_
  - _Requirements: 2.2, 1.3_

---

### Group 2 — Mock Transcripts

- [x] 2.1 Create `transcripts/mock_labeled_mixed.txt`
  - Labeled BM/EN/Manglish code-switching transcript
  - Includes `[SpeakerName]` and `SpeakerName:` formats
  - Includes `Diputuskan`, `Sila hantar`, Manglish particles (`lah`, `mah`)
  - At least 2 explicit agenda topics, 1 decision, 2 action items with deadlines
  - _Requirements: 1.1, 2.1_

- [ ] 2.2 Create remaining mock transcript fixtures
  - `mock_labeled_en.txt` — fully English labeled, relative deadlines (`"by next Friday"`)
  - `mock_unlabeled.txt` — no speaker labels, ≥4 paragraphs, parseable decisions/actions
  - `mock_empty.txt` — zero-byte file
  - `mock_near_empty.txt` — <50 usable words, at least 1 word
  - _Requirements: 1.4, 1.5, 12.5_

---

### Group 3 — Backend Data Layer

- [x] 3.1 Implement `backend/models.py`
  - `ActionItemModel`: `task`, `assignee` (default `"Belum Ditetapkan"`), `deadline` (default `"-"`), `status` (default `"Belum Mula"`)
  - `MeetingModel`: `id`, `meeting_title`, `meeting_number`, `location`, `date`, `start_time`, `end_time`, `chairperson_name`, `chairperson_role`, `status` (default `"Draf"`), `action_items: List[ActionItemModel]`, `raw_transcript`
  - _Requirements: 3.6, 3.7, 3.8_

- [x] 3.2 Implement `backend/services/formatter.py`
  - `format_malay_date(date_str) -> str` — ISO `YYYY-MM-DD` → `"18 September 2025"` (Malay month names)
  - `format_agenda_items(agenda_items) -> list` — normalise index, title, discussion, action_by fields
  - _Requirements: 4.4_

- [x] 3.3 Implement `backend/services/document_generator.py`
  - `generate_official_mom_html(meeting: dict) -> str`
  - In-memory PKPA Bil. 2/1991 HTML; no disk template reads
  - Times New Roman 12pt, uppercase title, bilangan, metadata table, action items table
  - Print button (`.no-print`); `@media print` hides button, sets `margin: 20mm`
  - Calls `format_malay_date` for Tarikh field
  - Renders "Tiada tindakan direkodkan." when `action_items` is empty
  - _Requirements: 4.2, 4.3, 4.4, 4.5_

---

### Group 4 — Backend API Routes

- [x] 4.1 Implement `backend/routes/meetings.py`
  - `GET /api/meetings` — glob `data/meetings/*.json`, return array; `[]` if empty
  - `GET /api/meetings/{id}` — read single file; 404 with Malay message if missing
  - `POST /api/meetings/save` — accept `MeetingModel`; assign `meet_{hex8}` id if absent; atomic write (`indent=2, ensure_ascii=False`); return `{status, id, data}`
  - `DELETE /api/meetings/{id}` — unlink; 404 if missing
  - Auto-create `data/meetings/` on module load (`mkdir(parents=True, exist_ok=True)`)
  - _Requirements: 3.1–3.9_

- [x] 4.2 Implement `backend/routes/export.py`
  - `GET /api/export/{meeting_id}/html` — read `data/meetings/{id}.json`; call `generate_official_mom_html`; return `HTMLResponse`
  - 404 with `"Mesyuarat tidak dijumpai."` if file missing
  - _Requirements: 4.1, 4.6_

- [x] 4.3 Implement `backend/routes/pipeline.py`
  - `POST /api/transcribe` — multipart file upload; save to `data/uploads/`; invoke `MeetingTranscriber.stream_transcribe`; return `{status, filename, transcript, segments_count}`; 500 on exception
  - `POST /api/extract` — accept `ExtractPayload {transcript}`; guard empty (400); call `run_extraction`; return `{status, data}`; 500 on exception
  - Instantiate `MeetingTranscriber` at module level (singleton) to avoid repeated model loads
  - _Requirements: 1.2, 1.5, 1.6, 2.1, 2.7_

- [x] 4.4 Implement `backend/app.py`
  - Register `pipeline`, `meetings`, `export` routers
  - `CORSMiddleware(allow_origins=["*"])` for development
  - Mount `backend/static/` as `StaticFiles(html=True)` at `/` when directory exists
  - _Requirements: 10.1, 10.4, 9.4_

---

### Group 5 — Script Layer

- [x] 5.1 Implement `scripts/whisper_engine.py`
  - `MeetingTranscriber(model_size="large-v3-turbo", device="auto")`
  - `compute_type = "int8"` on CPU, `"default"` on CUDA
  - `stream_transcribe(audio_path) -> Iterator[dict]` — yields `{id, start, end, text, time_str}`
  - `transcribe` task, `language=None` (auto), `temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0]`, `vad_filter=True`
  - _Requirements: 1.3_

- [x] 5.2 Implement `scripts/extraction_agent.py`
  - `load_steering_rules(path) -> dict` — YAML front-matter parse for `rules_version`; fallback to `DEFAULT_RULES` on missing/error
  - `count_words(text) -> int` — strip punctuation, split, count
  - `extract_meeting_date(filename, transcript) -> str | None` — `YYYYMMDD` prefix then ISO regex
  - `call_llm(system_prompt, user_prompt) -> tuple[dict, int, int]` — direct `anthropic.Anthropic(api_key=ANTHROPIC_API_KEY).messages.create`; model `claude-3-5-sonnet-latest`; `max_tokens=8192`; `json_repair` fallback
  - `run_extraction(transcript_input: str | Path) -> dict` — full pipeline: detect input type → word count guard → date extraction → prompt assembly → LLM call → MoM_Schema envelope
  - Near-empty guard: `< 50 words` → `extraction_status: "partial"`, no API call
  - _Requirements: 2.1–2.8, 11.1–11.5_

- [x] 5.3 Implement `scripts/dedup_registry.py`
  - `load_registry(path) -> dict`, `is_duplicate(registry, sha256) -> bool`
  - `record_entry(registry, sha256, path, status) -> dict`
  - `save_registry(registry, path) -> None` — atomic write (temp + `os.replace`)
  - _Requirements: 12.5_

- [x] 5.4 Implement `scripts/run_pipeline.py` — Headless CLI Runner
  - `python scripts/run_pipeline.py <transcript_path> [--output data/extracted_mom.json]`
  - Sequence: validate file → SHA-256 dedup check → Whisper/read → `run_extraction` → schema check → atomic write → registry update
  - Exit `0` on success or clean duplicate skip; exit `1` on any failure
  - No Kiro IDE imports; all deps from `requirements.txt`
  - _Requirements: 12.1–12.5_

---

### Group 6 — Frontend Application

- [x] 6.1 Initialize React + Vite + Tailwind CSS project (`frontend/`)
  - `npm create vite@latest frontend -- --template react`
  - Install: `tailwindcss`, `@tailwindcss/vite`, `lucide-react`
  - Configure `vite.config.js` with `@tailwindcss/vite` plugin and `/api` proxy to `http://localhost:8000`
  - Build output: `frontend/dist/` (deployed to `backend/static/`)
  - _Requirements: 10.2, 10.3_

- [x] 6.2 Implement `App.jsx` — root component and view router
  - State: `view`, `meetings`, `currentMeeting`, `previewMode`
  - `fetchMeetings()` on mount via `GET /api/meetings`
  - Handlers: `handleNewMeeting`, `handleSelectMeeting(id)`, `handleEditMeeting(id)`, `handleDeleteMeeting(id)`
  - View switching logic: history → editor (preview/edit), ingest → editor (extracted), editor → history
  - _Requirements: 5.6, 5.7, 7.5, 7.8_

- [x] 6.3 Implement `Header.jsx` and `Navigation.jsx`
  - `Header`: App title "Penjana Minit Mesyuarat", subtitle/tagline
  - `Navigation`: tab bar with **Rekod Minit**, **Penjejak Tindakan**, **Jana Minit**, **+ Minit Baru** CTA button
  - Active tab highlight; `setView` prop for navigation
  - _Requirements: 5.1, 6.1, 7.1_

- [x] 6.4 Implement `HistoryView.jsx`
  - KPI tiles: Jumlah Minit, Draf, Selesai — computed from `meetings` prop
  - Live multi-field search across `meeting_title`, `chairperson_name`, `location`, `date`
  - Status filter pills: Semua / Draf / Selesai
  - Meeting cards: title, number, date, location, chairperson, status badge
  - Card actions: **Lihat** → `onSelectMeeting`, **Sunting** → `onEditMeeting`, **Padam** → confirm + `onDeleteMeeting`
  - Empty state with Malay message and CTA
  - _Requirements: 5.1–5.8_

- [x] 6.5 Implement `TrackerView.jsx`
  - KPI counters: Jumlah, Belum Mula, Sedang Berjalan, Tertunggak — aggregated from `meetings[*].action_items`
  - Completion percentage bar: `(Selesai / total) * 100%`
  - Per-status distribution tiles with colour differentiation
  - Action item list grouped by source meeting title
  - _Requirements: 6.1–6.5_

- [x] 6.6 Implement `IngestView.jsx`
  - Drag-and-drop + click-to-browse dropzone for `.mp3`, `.wav`, `.m4a`, `.txt`
  - Audio → `POST /api/transcribe` (FormData); status feedback: idle / uploading / transcribing / complete / error
  - `.txt` → `FileReader.readAsText()`; direct textarea populate
  - Transcript `<textarea>` for user editing before extraction
  - "Jana Minit dengan AI" button → `POST /api/extract`; spinner during call
  - On success: `onExtracted(data.data)` → routes to `EditorView`
  - Retry button on error; Malay error messages throughout
  - _Requirements: 1.1–1.7, 2.7, 2.8_

- [x] 6.7 Implement `EditorView.jsx`
  - **Edit mode:** metadata inputs (all `MeetingModel` fields), participant badge manager (add/remove chips), agenda cards (title + summary + decisions, addable/removable), action items matrix (task, assignee, deadline, status select — addable/removable), Simpan button, Preview toggle, Balik button
  - **Preview mode:** `<iframe src="/api/export/{meeting.id}/html">` for live PKPA document display; Edit toggle; Balik button
  - Save → `POST /api/meetings/save`; success/error toast in Malay
  - Balik → `onBack()` (triggers `fetchMeetings()` + view switch to history)
  - _Requirements: 7.1–7.8_

---

### Group 7 — PKPA Document & Formatting Validation

- [x] 7.1 End-to-end document generation smoke test
  - Save a mock meeting via `POST /api/meetings/save`
  - Fetch `GET /api/export/{id}/html`; verify response is valid HTML containing:
    - Meeting title in uppercase `<h1>`
    - Bilangan in `<h2>`
    - Tarikh formatted as Malay long-form (e.g., `"18 September 2025"`)
    - Action items table with correct column headers
    - Print button present; `.no-print` class applied
  - _Requirements: 4.1–4.6_

- [ ] 7.2 Expand `document_generator.py` to render participants and agenda sections
  - Add participants section below metadata table: numbered list of `chairperson_name` + `participants` array
  - Add agenda items section: numbered perkara cards with title, discussion summary, and per-item decisions
  - Maintain PKPA Bil. 2/1991 layout conventions throughout
  - _Requirements: 4.3, 7.3, 7.4_

---

### Group 8 — Email Dispatch Module

- [ ] 8.1 Implement `scripts/dispatch_email.py`
  - `load_meeting(meeting_id: str) -> dict` — read `data/meetings/{id}.json`; exit `1` with message if not found
  - `build_email(meeting: dict, recipients: list[str]) -> MIMEMultipart` — HTML body from `generate_official_mom_html`; plain-text fallback with title, date, action item count; subject = meeting title
  - `send_with_retry(msg, recipients, config: dict) -> None` — SMTP STARTTLS or SSL based on port; retry 3× with 5s delay on `SMTPException` / `OSError`
  - `main()` — parse `sys.argv` for `meeting_id` and recipient list; validate SMTP env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`); exit `1` on missing config; call send chain; exit `0` on success
  - Exit codes: `0` = success, `1` = config/file/network error
  - _Requirements: 8.1–8.6_

- [ ] 8.2 Manual smoke test for email dispatch
  - Configure SMTP env vars pointing to a local MailHog or Mailtrap test inbox
  - Run `python scripts/dispatch_email.py <meeting_id> test@example.com`
  - Verify received email contains PKPA-formatted HTML body and correct subject line
  - Verify exit code `0` on success, `1` on invalid meeting_id
  - _Requirements: 8.3–8.6_

- [ ] 8.3 Add `POST /api/dispatch/email/{meeting_id}` route (deferred sprint)
  - Route in `backend/routes/dispatch.py`
  - Accept `{ "recipients": ["email@..."] }` JSON body
  - Invoke `dispatch_email` logic inline (or subprocess); return `{status, recipient_count}`
  - Register router in `backend/app.py`
  - _Requirements: 8.7_

---

### Group 9 — Frontend Polish & UI Refinement

- [ ] 9.1 `IngestView` — multi-file queue and progress indicator
  - Support queuing multiple files and processing sequentially
  - Show per-file progress steps (upload → transcribe → ready) in a list
  - _Requirements: 1.1, 1.5_

- [ ] 9.2 `EditorView` — agenda card decisions sub-list
  - Within each agenda card, render a dynamic sub-list of formal decisions/resolutions
  - Each decision: text input + remove button
  - Map to `agenda_items[*].decisions` sub-array in the saved model
  - _Requirements: 7.3_

- [ ] 9.3 `TrackerView` — inline status editing
  - Allow changing `action_items[*].status` directly from the tracker via a dropdown
  - On change: call `POST /api/meetings/save` with the updated meeting to persist immediately
  - _Requirements: 6.3_

- [ ] 9.4 `HistoryView` — sorting controls
  - Add sort controls: by date (newest first / oldest first), by title (A→Z), by status
  - Client-side sort; no API change needed
  - _Requirements: 5.2_

- [ ] 9.5 Global — Malay error message audit
  - Audit all `alert()`, `console.error()`, and `toast` messages across components
  - Replace any English-language UI strings with Malay equivalents
  - Ensure all `detail` fields from API error responses are surfaced as visible notifications
  - _Requirements: 5.5, 10.5_

- [ ] 9.6 `EditorView` — auto-populate from extraction result
  - When `IngestView` routes to `EditorView` via `onExtracted`, map `MoM_Schema` fields to `MeetingModel`:
    - `participants[*].label` → participant badge list
    - `agenda_items` → agenda cards (title + summary)
    - `decisions` → decisions sub-list under matching agenda card
    - `action_items` → action items matrix rows (`description` → `task`, `assignee`, `deadline`)
  - _Requirements: 2.8, 7.1_

---

### Group 10 — Integration & API Testing

- [ ] 10.1 Set up test infrastructure (`tests/conftest.py`, `requirements-test.txt`)
  - Add `pytest>=8.0`, `httpx>=0.27`, `pytest-mock`, `pytest-asyncio` to `requirements-test.txt` with pinned versions
  - `tests/conftest.py`: `TestClient` fixture from `fastapi.testclient`, `tmp_meetings_dir` fixture patching `MEETINGS_DIR`
  - _Requirements: 3.1–3.5_

- [ ] 10.2 API integration tests — Meetings CRUD (`tests/test_meetings_api.py`)
  - `POST /api/meetings/save` with minimal payload → assert `id` assigned, file created, `status: "Draf"`
  - `GET /api/meetings` → assert returns list containing saved record
  - `GET /api/meetings/{id}` → assert returns exact saved record; test 404 for unknown id
  - `DELETE /api/meetings/{id}` → assert file removed; test 404 on re-delete
  - _Requirements: 3.1–3.9_

- [ ] 10.3 API integration tests — Export (`tests/test_export_api.py`)
  - `GET /api/export/{id}/html` → assert HTML response contains meeting title, Malay-formatted date, action item rows
  - Test 404 for unknown id
  - Test empty `action_items` renders "Tiada tindakan direkodkan." message
  - _Requirements: 4.1–4.6_

- [ ] 10.4 Unit tests — Extraction Agent (`tests/test_extraction_agent.py`)
  - `count_words`: empty string → 0; punctuation-only → 0; mixed BM/EN sentence → correct count
  - `extract_meeting_date`: `YYYYMMDD` filename prefix → ISO date; ISO regex in body → ISO date; no hint → `None`
  - `load_steering_rules`: missing file → returns default rules with `rules_version: "built-in-default"`
  - Near-empty guard: transcript with 49 words → `extraction_status: "partial"`, no LLM call (mock `call_llm` and assert not called)
  - Near-empty boundary: exactly 50 words → proceeds to LLM call
  - _Requirements: 2.3, 2.5, 2.6, 11.4, 12.5_

- [ ] 10.5 Unit tests — Document Generator (`tests/test_document_generator.py`)
  - Full meeting dict → HTML contains `meeting_title`, `meeting_number`, Malay date, action item task text
  - `action_items: []` → HTML contains "Tiada tindakan direkodkan."
  - Missing `date` field → graceful fallback (no exception)
  - _Requirements: 4.2–4.5_

- [ ] 10.6 Unit tests — Email Dispatch (`tests/test_dispatch_email.py`)
  - Missing `SMTP_HOST` env var → exit code `1`, no SMTP call
  - Unknown `meeting_id` → exit code `1`, no SMTP call
  - SMTP `SMTPException` on first two attempts, success on third → exit code `0`, 3 SMTP calls made
  - All retries exhausted → exit code `1`
  - _Requirements: 8.2, 8.5, 8.6_

---

### Group 11 — Documentation

- [ ] 11.1 Update `README.md`
  - Quickstart: clone → `pip install -r requirements.txt` → set `.env` → `uvicorn backend.app:app` → open `http://localhost:8000`
  - Frontend build instructions: `cd frontend && npm install && npm run build && cp -r dist/ ../backend/static/`
  - Environment variables table
  - Architecture overview (2 paragraphs)
  - Known limitations section
  - _Requirements: 10.1–10.3_

- [ ] 11.2 Create `docs/DEPLOYMENT.md`
  - Single-process production deployment
  - Audio upload size configuration (Uvicorn `--limit-max-requests`, nginx proxy for file size)
  - `data/uploads/` cleanup cron example
  - HTTPS / reverse proxy notes for production
  - _Requirements: 9.5, 10.6_

---

## Notes

- Python implementation language throughout; `scripts/` modules are importable as standard Python packages.
- `jsonschema` library is NOT required — Pydantic v2 handles MoM payload validation natively.
- `os.replace()` is used for all atomic writes (Windows-safe; avoids `FileExistsError` from `os.rename()`).
- The Kiro Agent Hook (`PostFileCreate`) is retained in `.kiro/hooks/` as a developer convenience trigger only; it is **not** a production dependency and is not referenced in this plan.
- All UI strings visible to end users SHALL be in Bahasa Melayu. Code comments and spec documentation are in English.
- Tasks in Group 9 (UI Refinement) and Group 10 (Testing) are independent of each other and can be worked in parallel after Group 6 is complete.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "5.4"] },
    { "id": 5, "tasks": ["4.4"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4", "6.5", "6.6", "6.7"] },
    { "id": 9, "tasks": ["7.1"], "note": "Requires Group 3 + 4 complete" },
    { "id": 10, "tasks": ["7.2", "8.1"], "note": "Parallel: doc expansion + email module" },
    { "id": 11, "tasks": ["8.2"], "note": "Requires 8.1" },
    { "id": 12, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "10.1"], "note": "UI polish + test infra in parallel" },
    { "id": 13, "tasks": ["10.2", "10.3", "10.4", "10.5"], "note": "Requires 10.1" },
    { "id": 14, "tasks": ["10.6", "8.3"], "note": "Requires 8.1 + 10.1" },
    { "id": 15, "tasks": ["11.1", "11.2"], "note": "Final docs after all groups stable" }
  ]
}
```

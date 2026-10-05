# Project Structure

```text
mom-automation/
├── backend/                     # FastAPI application
│   ├── app.py                   # App setup, CORS, router registration, static mount
│   ├── models.py                # Pydantic models (Meeting, Participant, Agenda, Action)
│   ├── routes/                  # API routers, each with its own prefix
│   │   ├── pipeline.py          # /api/transcribe, /api/extract, /api/transcript/{id}
│   │   ├── meetings.py          # /api/meetings CRUD + /{id}/export (.docx)
│   │   └── export.py            # /api/export/{id}/html (printable official layout)
│   ├── services/
│   │   ├── document_generator.py # Official HTML + .docx generation
│   │   └── formatter.py          # Formatting helpers
│   └── static/                  # Compiled frontend bundle (Vite output — generated)
│
├── frontend/                    # React 19 + Vite SPA
│   └── src/
│       ├── App.jsx              # Root component; holds view + meeting state
│       ├── main.jsx             # React entry point
│       └── components/          # Header, Navigation, HistoryView, TrackerView,
│                                #   IngestView, EditorView
│
├── scripts/                     # Reusable pipeline logic (imported by backend routes)
│   ├── whisper_engine.py        # MeetingTranscriber — faster-whisper wrapper
│   └── extraction_agent.py      # run_extraction() — Claude prompt + JSON repair
│
├── data/                        # Local runtime data (git-ignored, sensitive)
│   ├── uploads/                 # Uploaded audio files
│   ├── transcripts/             # Cached transcripts keyed by content hash
│   ├── meetings/                # Saved meeting records: meet_<8hex>.json
│   └── templates/               # Template definitions (e.g. standard_kerajaan.json)
│
├── .kiro/
│   ├── steering/                # This guidance (mom-rules.md governs extraction)
│   ├── hooks/
│   └── specs/
│
├── requirements.txt             # Python dependencies
└── .env                         # ANTHROPIC_API_KEY (never commit)
```

## How the pieces connect

- `backend/routes/*` import pipeline logic from `scripts/` and models from
  `backend/models.py`. Keep transcription/extraction logic in `scripts/`, keep HTTP
  concerns (validation, status codes, streaming) in `routes/`.
- `backend/app.py` runs `sys.path.append(ROOT_DIR)` so imports resolve from the repo
  root. **Always run commands from the repository root** so these imports work.
- The frontend talks only to `/api/...`. It never holds transcript text long-term — it
  stores a short `transcript_id` and refetches from the backend.
- Meeting records are plain JSON files in `data/meetings/`, one per meeting, named
  `meet_<8hex>.json`. `POST /api/meetings/save` is an upsert keyed on the record `id`.

## Patterns to follow

- **Router prefixes** live on the `APIRouter`, not on individual routes.
- **Path-traversal guards**: validate IDs before building file paths (see the alnum/
  length check in `pipeline.py` and filename sanitisation in `meetings.py`).
- **Resilient parsing**: Pydantic models accept extra/legacy keys; LLM JSON goes through
  the multi-stage repair pipeline in `extraction_agent.py`. Preserve this tolerance.
- **Extraction behaviour** (schema, PKPA section ordering, action-item rules) is governed
  by the system prompt in `scripts/extraction_agent.py` plus `.kiro/steering/mom-rules.md`.
  Change extraction rules there, not scattered across routes.
- User-facing text and error `detail` strings are in Bahasa Melayu.
```

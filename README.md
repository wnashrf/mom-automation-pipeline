# Penjana Minit Mesyuarat Sektor Awam Malaysia

MoM Automation is a local-first application for turning meeting recordings into
reviewable, formally structured minutes of meeting (MoM) for Malaysian public-sector
use. It combines local speech-to-text with Claude Sonnet extraction and renders the
reviewed result in a printable format aligned with the administrative conventions of
PKPA Bil. 2/1991.

## Features

- **Local-first data privacy**: transcripts, uploaded recordings, and meeting records
  are stored in the local `data/` directory. No database service is required for local
  development.
- **Offline transcription**: audio is transcribed locally with faster-whisper using the
  `large-v3-turbo` model and int8 compute settings.
- **Claude-assisted extraction**: a transcript is converted into structured meeting
  information, decisions, and action items through Anthropic Claude Sonnet.
- **Human-in-the-loop review**: extracted content can be checked and edited before it
  becomes an official record or is exported.
- **Malaysian MoM alignment**: the generated document follows the terminology and
  presentation expected for Malaysian public-sector minutes, with PKPA Bil. 2/1991 as
  the governing administrative reference.
- **Printable export**: saved meetings can be opened as standalone HTML and printed or
  saved to PDF from the browser.
- **Single local application**: the FastAPI backend serves the vanilla HTML5 frontend,
  Tailwind CSS assets, and Chart.js interface from one development server.

## Architecture

```text
Audio recording
      |
      v
FastAPI -> faster-whisper (local transcription)
      |
      v
Transcript -> Claude Sonnet (structured extraction, guided by .kiro/steering/mom-rules.md)
      |
      v
Human review in frontend -> JSON record in data/meetings/
      |
      v
Printable HTML / PDF export
```

## Requirements

- Windows PowerShell
- Python 3.10 or newer
- Internet access for first-time Python package installation, Claude extraction, and
  downloading the faster-whisper model if it is not already cached
- Sufficient local CPU, memory, and disk space for `large-v3-turbo` transcription
- An Anthropic API key for Claude extraction

## Quick Start (Daily Local Run)

Run these commands from the repository root whenever the project is already set up:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
uvicorn backend.app:app --reload
```

Open: <http://localhost:8000> (Interactive API docs: <http://localhost:8000/docs>)

The execution-policy command applies only to the current PowerShell process. It avoids
changing the machine or user policy permanently. Stop the server with `Ctrl+C`.

## Setup Guide (After Git Clone)

### 1. Open the repository in PowerShell

```powershell
cd C:\path\to\mom-automation
```

### 2. Create the virtual environment

```powershell
python -m venv .venv
```

If `python` is not recognized, install Python 3.10+ and ensure it is available on
`PATH`, then reopen PowerShell.

### 3. Allow and activate the environment

Use a process-scoped execution-policy bypass, then activate the environment:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

After activation, the prompt normally begins with `(.venv)`.

### 4. Install dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 5. Configure environment variables

Create a `.env` file in the repository root. At minimum, provide the Anthropic key:

```dotenv
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Do not commit `.env` or expose the key in frontend code. The extraction service reads
`ANTHROPIC_API_KEY` from the environment and uses Claude Sonnet. 
```

Keep credentials out of source control. The repository's `.gitignore` is intended to
exclude local environment files and runtime data that should not be shared.

### 6. Start the application

```powershell
uvicorn backend.app:app --reload
```

Visit <http://localhost:8000> and use the interface to upload an audio file, generate
a transcript, extract structured minutes, review the result, save the meeting, and
export the final document.

## Project Structure

```text
mom-automation/
|-- backend/
|   |-- app.py                    # FastAPI application and frontend static mount
|   |-- models.py                 # Pydantic meeting and action-item models
|   |-- routes/
|       |-- pipeline.py           # Transcription and Claude extraction endpoints
|       |-- meetings.py           # JSON meeting persistence endpoints
|       |-- export.py             # Printable HTML export endpoint
|       |-- services/              # Document generation and formatting helpers
|-- frontend/
|   |-- index.html                # Vanilla HTML5 SPA served at `/`
|   |-- templates/
|       |-- official_mom.html      # Official printable MoM template source
|-- scripts/
|   |-- whisper_engine.py         # faster-whisper transcription wrapper
|   |-- extraction_agent.py        # Claude extraction integration
|   |-- run_pipeline.py            # Pipeline utility entrypoint
|   |-- dedup_registry.py          # Duplicate-processing registry
|   |-- output_writer.py           # Pipeline output utilities
|-- data/
|   |-- meetings/                 # Saved meeting JSON records
|   |-- uploads/                  # Uploaded audio and transcript files
|   |-- extracted_mom.json         # Extraction output sample or working data
|-- tests/                         # Test code and fixtures
|-- transcripts/                   # Sample transcripts for development/testing
|-- .kiro/steering/mom-rules.md   # Extraction and minutes steering rules
|-- requirements.txt              # Python dependencies
|-- README.md
```

Runtime files in `data/meetings/` and `data/uploads/` are written by the application.
Treat them as sensitive meeting material and apply the retention and access controls
required by your organization.

## API Endpoints

All API routes are served by the local FastAPI process. Use the Swagger UI at `/docs`
for request schemas and interactive testing.

| Method | Endpoint | Purpose | Request |
| --- | --- | --- | --- |
| `POST` | `/api/transcribe` | Save an uploaded recording and transcribe it with local faster-whisper | `multipart/form-data`, field `file` |
| `POST` | `/api/extract` | Extract structured minutes from a transcript with Claude Sonnet | JSON: `{ "transcript": "..." }` |
| `GET` | `/api/meetings` | Return all saved meeting records | None |
| `GET` | `/api/meetings/{meeting_id}` | Return one saved meeting record | Path parameter `meeting_id` |
| `POST` | `/api/meetings/save` | Create or update a meeting JSON record | JSON matching `MeetingModel` |
| `DELETE` | `/api/meetings/{meeting_id}` | Delete a saved meeting record | Path parameter `meeting_id` |
| `GET` | `/api/export/{meeting_id}/html` | Render a saved meeting in printable official MoM HTML | Path parameter `meeting_id` |

The persistence layer writes records to `data/meetings/{meeting_id}.json`. A new ID is
generated when a saved meeting does not already contain one.

## Typical Workflow

1. Start the local FastAPI server.
2. Upload a meeting recording through the frontend.
3. Review the locally generated transcript.
4. Send the transcript to the extraction endpoint.
5. Check names, dates, decisions, and action-item owners manually.
6. Save the approved meeting record.
7. Open the HTML export and print it or choose **Save as PDF** in the browser.

AI output is a drafting aid. Human review remains responsible for factual accuracy,
official wording, classification, distribution, and records-management decisions.

## Development Notes

- Run commands from the repository root so Python imports and relative paths resolve
  correctly.
- The first transcription request may take longer while the faster-whisper model is
  downloaded or initialized.
- FastAPI reload mode is intended for local development. Use an appropriately secured
  deployment configuration, authenticated access, controlled CORS, secret management,
  and organizational records controls before exposing the service beyond a trusted
  local environment.
- The frontend is served by FastAPI at `/`; static frontend files are mounted under
  `/static`.

## Testing

Run the repository's Python tests from the activated virtual environment:

```powershell
python -m pytest
```

If test discovery reports that `pytest` is not installed, install it in the active
environment before running the suite:

```powershell
python -m pip install pytest
python -m pytest
```

## Troubleshooting

### PowerShell blocks `Activate.ps1`

Run the process-scoped bypass again in the same terminal, then activate:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### Claude extraction fails

Confirm that the `.env` file is at the repository root, that `ANTHROPIC_API_KEY` is
present and valid, and that the activated environment contains the `anthropic` package.

### Transcription is slow or runs out of memory

The configured `large-v3-turbo` model is resource-intensive. Close competing workloads,
allow the initial model download to finish, and verify that the host has enough memory
and disk space for the selected faster-whisper configuration.

### Port 8000 is already in use

Start Uvicorn on another local port:

```powershell
uvicorn backend.app:app --reload --port 8001
```

Then open <http://localhost:8001>.
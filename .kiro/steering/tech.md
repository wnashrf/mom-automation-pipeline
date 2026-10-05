# Tech Stack

## Backend (Python)

- **FastAPI** + **Uvicorn** (ASGI) — serves the API and the compiled frontend bundle.
- **Pydantic v2** — data models in `backend/models.py`. Models use `extra = "allow"` and
  a `model_validator` to keep legacy JSON records round-tripping safely.
- **faster-whisper** — local speech-to-text (`large-v3-turbo`, `int8` on CPU, `default`
  on CUDA). Models are cached via the Hugging Face hub cache.
- **anthropic** — Claude Sonnet SDK for structured extraction.
- **python-docx** — `.docx` export generation.
- **json-repair** — multi-stage sanitisation of LLM JSON output.
- **python-dotenv** — loads `ANTHROPIC_API_KEY` from a root `.env` file.

Python 3.10+. Pydantic settings and `str | None` union syntax are used, so keep 3.10 as
the minimum.

## Frontend (JavaScript)

- **React 19** SPA with functional components and hooks (no router; view state is held
  in `App.jsx` via `useState`).
- **Vite 8** build tooling. `vite build` compiles into `../backend/static`, which FastAPI
  mounts at `/`. The dev server runs on port 5173 and proxies `/api` to `127.0.0.1:8000`.
- **Tailwind CSS v4** via `@tailwindcss/vite` (utility classes inline in JSX).
- **lucide-react** for icons.
- **ESLint** (flat config in `eslint.config.js`).

> Note: the README text mentions a "vanilla HTML5" frontend; the real frontend is the
> React + Vite app under `frontend/`. Trust the code.

## Common Commands

All backend commands run from the repository root in **PowerShell** on Windows.

```powershell
# Activate the virtual environment (process-scoped bypass if blocked)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1

# Install backend dependencies
python -m pip install -r requirements.txt

# Run the app (serves API + compiled frontend at http://localhost:8000)
uvicorn backend.app:app --reload

# Run tests
python -m pytest
```

Frontend commands run from `frontend/`:

```powershell
npm install        # install deps
npm run dev        # Vite dev server on :5173 (proxies /api to :8000)
npm run build      # compile into ../backend/static
npm run lint       # ESLint
```

## Conventions

- Use `;` as the command separator in PowerShell, never `&&`.
- Use PowerShell env syntax (`$env:HF_HOME`), never `%VAR%`.
- Never commit `.env` or anything under `data/`. The Anthropic key stays server-side.
- Do not start long-running servers (`uvicorn --reload`, `npm run dev`) from automation;
  recommend the user run them manually.

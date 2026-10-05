# Product

**Penjana Minit Mesyuarat Sektor Awam Malaysia** (MoM Automation) is a local-first
application that turns meeting recordings into formally structured Minutes of Meeting
(MoM) for Malaysian public-sector use.

## What it does

1. **Transcribe** — audio recordings are transcribed locally with faster-whisper
   (`large-v3-turbo`, int8 on CPU). No audio leaves the machine.
2. **Extract** — the transcript is sent to Anthropic Claude Sonnet, which returns
   structured meeting data (participants, agenda items, decisions, action items).
3. **Review** — a human edits and verifies the extracted content in the web UI before
   it becomes an official record. AI output is a drafting aid, never the final word.
4. **Export** — approved meetings are rendered as printable official HTML (print / Save
   as PDF) or a PKPA-formatted `.docx`.

## Domain conventions

- Output follows Malaysian public-sector minute conventions, with **PKPA Bil. 2/1991**
  as the governing administrative reference.
- Documents use **Bahasa Melayu** section headings and terminology (e.g. PERUTUSAN
  PENGERUSI, PENGESAHAN MINIT MESYUARAT LEPAS, TINDAKAN SUSULAN). Transcripts are often
  mixed Malay/English with code-switching ("Manglish").
- User-facing strings and API error messages are written in Bahasa Melayu.

## Privacy posture

Local-first by design: transcripts, uploads, and meeting records live under the local
`data/` directory. No database is required. Treat everything in `data/meetings/` and
`data/uploads/` as sensitive meeting material.

"""
scripts/extraction_agent.py

Extraction Agent core for the MoM Automation Pipeline.
Loads steering rules, processes transcripts, invokes the LLM extraction core,
and returns structured meeting data conforming to MoM_Schema.
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
logger = logging.getLogger(__name__)

STEERING_RULES_PATH = Path(".kiro/steering/mom-rules.md")

# Default fallback if steering file is absent or damaged
DEFAULT_RULES = {
    "rules_version": "built-in-default",
    "near_empty_word_threshold": 50,
    "chunking": {"default_token_limit": 12000, "min_chunk_overlap_tokens": 200},
    "department_mappings": {
        "it": "Information Technology",
        "finance": "Finance",
        "hr": "Human Resources",
        "operations": "Operations",
        "engineering": "Engineering & Maintenance"
    }
}


def load_steering_rules(path: Path = STEERING_RULES_PATH) -> dict:
    """Load and parse steering rules from markdown frontmatter and content."""
    if not path.exists():
        logger.warning("Steering rules not found at %s. Falling back to defaults.", path)
        return DEFAULT_RULES

    try:
        content = path.read_text(encoding="utf-8")
        rules_version = "1.0.0"
        fm_match = re.search(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        if fm_match:
            for line in fm_match.group(1).splitlines():
                if line.startswith("rules_version:"):
                    rules_version = line.split(":", 1)[1].strip().strip("\"'")

        return {
            "rules_version": rules_version,
            "raw_content": content,
            "near_empty_word_threshold": 50,
            "chunking": {"default_token_limit": 12000, "min_chunk_overlap_tokens": 200}
        }
    except Exception as exc:
        logger.error("Error reading steering rules at %s: %s", path, exc)
        return DEFAULT_RULES


def count_words(text: str) -> int:
    """Count usable words after stripping whitespace and punctuation."""
    cleaned = re.sub(r"[^\w\s]", "", text)
    return len(cleaned.split())


def extract_meeting_date(filename_or_text: str, transcript: str) -> str | None:
    """Extract meeting date from YYYYMMDD prefix or regex match."""
    try:
        fn_match = re.match(r"^(\d{4})(\d{2})(\d{2})", Path(filename_or_text).name)
        if fn_match:
            return f"{fn_match.group(1)}-{fn_match.group(2)}-{fn_match.group(3)}"
    except Exception:
        pass
    
    date_match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", transcript)
    if date_match:
        return date_match.group(1)
    return None


def _extract_json_from_text(raw: str) -> dict:
    """
    Multi-stage JSON extraction and repair pipeline.

    Stage 1 — Strip markdown fences (``` / ```json).
    Stage 2 — Extract the outermost {...} object if the model prefixed text.
    Stage 3 — Standard json.loads.
    Stage 4 — json_repair.repair_json then json.loads (handles trailing commas,
               missing quotes, unescaped control characters, etc.).
    Stage 5 — Aggressively strip non-printable control characters and retry.

    Raises RuntimeError with a readable diagnostic if all stages fail.
    """
    from json_repair import repair_json

    # Stage 1 — strip code fences
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
        text = text.strip()

    # Stage 2 — find outermost JSON object (in case of preamble text)
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        text = brace_match.group(0)

    # Stage 3 — standard parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Stage 4 — json_repair
    try:
        repaired = repair_json(text, return_objects=True)
        if isinstance(repaired, dict):
            return repaired
        # repair_json may return a string when return_objects=True isn't supported
        if isinstance(repaired, str):
            return json.loads(repaired)
    except Exception:
        pass

    # Stage 5 — strip unescaped control characters (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F)
    # Keep \n (0x0A), \r (0x0D), \t (0x09) — they are valid in JSON strings
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    try:
        return json.loads(repair_json(cleaned))
    except Exception as final_exc:
        snippet = text[:300].replace("\n", "\\n")
        raise RuntimeError(
            f"JSON parsing failed after all repair stages. "
            f"Snippet: {snippet!r} | Error: {final_exc}"
        )


def call_llm(system_prompt: str, user_prompt: str) -> tuple[dict, int, int]:
    """
    Invoke Claude Sonnet via the Anthropic API and return a parsed dict.
    """
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY tidak dijumpai. Sila pastikan kunci API anda dimasukkan ke dalam fail .env."
        )

    import anthropic

    logger.info("Connecting to Claude Sonnet via Anthropic API...")
    client = anthropic.Anthropic(api_key=anthropic_key)

    try:
        response = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=16000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text_blocks = [
            block.text
            for block in response.content
            if getattr(block, "type", None) == "text" or hasattr(block, "text")
        ]
        if not text_blocks:
            raise ValueError("No text block returned by Claude response.")

        raw_text = "\n".join(text_blocks)
        parsed = _extract_json_from_text(raw_text)
        return parsed, response.usage.input_tokens, response.usage.output_tokens

    except RuntimeError:
        raise   # already wrapped with context — re-raise as-is
    except Exception as exc:
        logger.error("Anthropic API call failed: %s", exc)
        raise RuntimeError(f"Anthropic API Error: {str(exc)}")


# ── Template structure instructions injected into the system prompt ──────────

TEMPLATE_STANDARD_GUIDANCE = """
DOCUMENT STRUCTURE — STANDARD GOVERNMENT TEMPLATE (PKPA BIL. 2/1991):
Map the transcript content to the canonical section order below.
Preserve the CHRONOLOGICAL ORDER of the actual meeting — place each item
where it occurred, not arbitrarily at the end.

  1. PERUTUSAN PENGERUSI
     └─ Opening remarks / land acknowledgement by the chairperson (if any).

  2. PENGESAHAN MINIT MESYUARAT LEPAS
     └─ Adoption / confirmation of the previous meeting's minutes.
        This almost always occurs near the BEGINNING of the meeting,
        immediately after the chairperson's opening, NOT at the end.

  3. [PERKARA AGENDA / SUBSTANTIVE ITEMS]
     └─ All substantive discussion topics (new business, consent agenda, etc.).
        Number each item sequentially continuing from section 2.

  4. PERKARA-PERKARA BERBANGKIT
     └─ Follow-up items from previous meetings (if explicitly raised).

  5. TINDAKAN SUSULAN
     └─ This section maps to action_items in the schema.
        DO NOT create a separate "Tindakan Susulan" agenda_item entry —
        action items are captured in the action_items array only.

AGENDA ORDERING RULES:
- Follow the ACTUAL sequence in the transcript, not a theoretical ideal order.
- "Pengesahan Minit Mesyuarat Lepas" belongs BEFORE new business items
  (i.e. section 2), not appended at the end of the agenda list.
- "PERUTUSAN PENGERUSI" is the first item only if the chairperson made
  opening remarks; omit it when no such content exists in the transcript.
- Do NOT invent sections or content absent from the transcript.
- Use uppercase Bahasa Melayu for section headings where the language matches.
"""

TEMPLATE_CUSTOM_GUIDANCE = """
DOCUMENT STRUCTURE — CUSTOM TEMPLATE:
No custom template has been configured. Fall back to standard PKPA-compliant
section ordering (PERUTUSAN PENGERUSI → agenda items → PENGESAHAN MINIT →
PERKARA-PERKARA BERBANGKIT → TINDAKAN SUSULAN) but apply flexible numbering
that best reflects the actual flow of the meeting as captured in the transcript.
"""

TEMPLATE_GUIDANCE_MAP = {
    "standard": TEMPLATE_STANDARD_GUIDANCE,
    "custom": TEMPLATE_CUSTOM_GUIDANCE,
}


def run_extraction(transcript_input: str | Path, template_type: str = "standard") -> dict:
    """
    Main entry point for extraction.
    Accepts either an on-disk file path or raw transcript text directly.

    Args:
        transcript_input: Path to a transcript file or raw transcript string.
        template_type: "standard" (default, PKPA Bil. 2/1991) or "custom".
    """
    is_file_on_disk = False
    try:
        path_candidate = Path(transcript_input)
        if path_candidate.exists() and path_candidate.is_file():
            is_file_on_disk = True
    except Exception:
        is_file_on_disk = False

    if is_file_on_disk:
        transcript_text = Path(transcript_input).read_text(encoding="utf-8")
        source_label = str(Path(transcript_input).resolve())
        date_hint_source = Path(transcript_input).name
    else:
        transcript_text = str(transcript_input)
        source_label = "in-memory-transcript"
        date_hint_source = ""

    rules = load_steering_rules()
    word_count = count_words(transcript_text)
    threshold = rules.get("near_empty_word_threshold", 50)
    
    meeting_date = extract_meeting_date(date_hint_source, transcript_text)
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    if word_count < threshold:
        logger.warning("Transcript is near-empty (%d words < %d threshold).", word_count, threshold)
        return {
            "schema_version": "1.0.0",
            "meeting_id": str(uuid.uuid4()),
            "meeting_date": meeting_date,
            "source_file": source_label,
            "participants": [],
            "agenda_items": [],
            "decisions": [],
            "action_items": [],
            "extraction_metadata": {
                "extracted_at": now_utc,
                "pipeline_version": "1.0.0",
                "language_detected": ["ms", "en"],
                "warnings": [f"Near-empty transcript detected: {word_count} usable words"],
                "rules_version": rules.get("rules_version", "1.0.0"),
                "token_usage": {"input_tokens": 0, "output_tokens": 0},
                "extraction_status": "partial",
                "near_empty": True
            }
        }

    template_guidance = TEMPLATE_GUIDANCE_MAP.get(template_type, TEMPLATE_STANDARD_GUIDANCE)

    system_prompt = f"""You are a professional meeting minutes extraction engine specialised in multilingual Malaysian workplace communication (Bahasa Melayu, English, Manglish code-switching).
Extract structured meeting data conforming strictly to MoM_Schema.

CRITICAL OUTPUT FORMAT RULE:
You MUST reply with valid, parseable JSON ONLY.
- Do NOT include markdown code fences, backticks (```), or any introductory / trailing text.
- Do NOT include comments inside the JSON.
- Properly escape ALL internal quotes (\") and newlines (\\n) inside JSON string values.
- Do NOT use trailing commas after the last item in an array or object.
- Your entire response must start with {{ and end with }}.

SCHEMA CONTRACT FORMAT:
{{
  "title": "Full meeting title inferred from context (e.g. 'Mesyuarat Majlis RM of Springfield') — NOT the first agenda item. Return null if genuinely unknown.",
  "meeting_number": "Serial number or null (e.g. '2/2026')",
  "date": "YYYY-MM-DD resolved from transcript (e.g. 'September the 15th of 2026' → '2026-09-15'). Return null if absent.",
  "start_time": "HH:MM in 24-hour format resolved from transcript (e.g. 'six p.m.' → '18:00'). Return null if absent.",
  "end_time": "HH:MM in 24-hour format (e.g. '6.10 p.m.' or 'at 610' → '18:10'). Return null if absent.",
  "venue": "Meeting location or platform string, or null.",
  "chairperson": {{
    "name": "Full name of chairperson (e.g. 'Mayor')",
    "role": "Official title / jawatan (e.g. 'Pengerusi / Mayor')"
  }},
  "secretary": {{
    "name": "Full name of secretary or minute-taker (e.g. 'Chrissy Gronehide')",
    "role": "Official title / jawatan (e.g. 'Penolong Pegawai Eksekutif / Pencatat')"
  }},
  "participants": [
    {{
      "name": "Full name",
      "jawatan": "Official designation in Bahasa Melayu (e.g. 'Timbalan Datuk Bandar & Ahli Majlis', 'Ahli Majlis', 'Pegawai Eksekutif')",
      "role": "English equivalent role or same as jawatan if no English form",
      "organisation": "Organisation / department name or null",
      "status": "Hadir" | "Tidak Hadir - Bersebab" | "Turut Hadir",
      "label_source": "explicit" | "inferred"
    }}
  ],
  "agenda_items": [
    {{
      "id": "agenda-001",
      "title": "Topic title",
      "confidence": "explicit" | "inferred",
      "summary": "Concise factual summary"
    }}
  ],
  "decisions": [
    {{
      "id": "decision-001",
      "statement": "Agreed decision text",
      "confidence": "explicit" | "inferred",
      "speaker_label": "Speaker Name or null",
      "agenda_item_id": "agenda-001 or null"
    }}
  ],
  "action_items": [
    {{
      "id": "action-001",
      "description": "Clear actionable task",
      "assignee": "Speaker Name or null",
      "assignee_status": "resolved" | "unresolved",
      "deadline": "YYYY-MM-DD or null",
      "deadline_status": "resolved" | "missing" | "unresolvable",
      "status": "Belum Mula" | "Dalam Tindakan" | "Selesai",
      "agenda_item_id": "agenda-001 or null",
      "raw_text": "Original utterance or null",
      "normalisation_confidence": "high" | "low" | null
    }}
  ]
}}

CRITICAL REQUIREMENTS:
- "title" MUST be the overall meeting name (e.g. "Mesyuarat Jawatankuasa X"), never just the first agenda item. Apply to ANY organisation type.
- "date", "start_time", "end_time" MUST be resolved from spoken natural language.
  Examples: "September the 15th of 2026" → "2026-09-15"; "six p.m." → "18:00"; "six ten" → "18:10".
- Chairperson is the person who calls the meeting to order and presides. Secretary is the minute-taker or administrative officer present.
- For participants, use "name" (NOT "label"). Always include chairperson and secretary in participants with their respective jawatan.

ATTENDANCE — COMPREHENSIVE DETECTION:
- Scan the ENTIRE transcript for movers, seconders, voters, and addressed speakers —
  not just the opening roll call. Anyone who moves or seconds an item MUST appear in participants with status "Hadir".
- For external guests, board nominees, or non-voting observers: status "Turut Hadir".
- If a person is referenced only by title (e.g. "the Treasurer", "CEO", "Bendahari"),
  populate name with that title as a placeholder (e.g. "Bendahari / Treasurer") — never leave name blank or null.
- Derive jawatan from contextual clues throughout the transcript.

VENUE:
- Use the explicit room/facility name if stated.
- If no explicit venue is given, infer from the organisation name:
  "Bilik Mesyuarat / Dewan [Nama Organisasi]". Never return null or "-" when the organisation is identifiable.

ACTION ITEM IDENTIFICATION — MANDATORY EXTRACTION:
Every formally approved motion, resolution, appointment, deferral, delegation, or
financial disbursement that requires a post-meeting implementation step MUST produce
at least one row in action_items. The following categories ALWAYS generate action items:

  a) DEFERRED ITEMS — Any item explicitly deferred to a future date.
     → description: "Kemukakan [item] di mesyuarat [tarikh]"
     → assignee: "Setiausaha / Urus Setia"
     → deadline: the deferred date (YYYY-MM-DD)

  b) APPOINTMENTS / SITTINGS — A board, committee, or tribunal scheduled to convene
     on a future date (e.g. Board of Revision sitting on 12 November 2026).
     → description: "Hadir dan jalankan [sitting name] pada [tarikh]"
     → assignee: the named members appointed to that body
     → deadline: the sitting date (YYYY-MM-DD)

  c) FINANCIAL DISBURSEMENTS — Approved funding, grants, ward appropriations, or
     contributions to be paid out after the meeting.
     → description: "Proses dan keluarkan peruntukan kepada [recipient]"
     → assignee: "Bahagian Kewangan / Pentadbiran"
     → deadline: null

  d) DELEGATIONS TO EVENTS — Members approved to attend a future conference, forum,
     or convention at their discretion.
     → description: "Hadir [event name] pada [dates]"
     → assignee: "Semua Ahli Majlis yang berkenaan" or named delegates
     → deadline: start date of the event (YYYY-MM-DD)

  e) POST-MEETING DIRECTIVES — Instructions for council/board members to remain after
     adjournment or attend a closed session (in-camera).
     → description: the specific directive given
     → assignee: the members instructed
     → deadline: null

  f) FUTURE COUNCIL CONSIDERATION — Recommendations or suggestions formally noted for
     the incoming council or next administration to consider.
     → description: the suggestion as a forward action
     → assignee: "Majlis Baharu / Pentadbiran Akan Datang"
     → deadline: null

ACTION ITEM DISCIPLINE — RETRACTION FILTER (NARROW):
Only exclude an item from action_items when the speaker EXPLICITLY withdraws,
rejects, or marks it as informal with language such as:
  "that won't be part of the condition", "cadangan ini ditolak",
  "we decided against that", "kita tolak cadangan ini", "no need to", "leave that out".

Do NOT use the retraction filter to exclude:
  - The underlying approved appropriation or motion itself (e.g., even if the signing
    of a roster was retracted, the disbursement of the ward appropriation is still approved).
  - Any item that was voted on and carried, even if informally worded.

FALLBACK COMPLETENESS CHECK:
A standard formal council or board meeting almost always produces 2–6 action items.
If your extraction yields zero action items for a meeting where motions were carried,
re-examine each agenda item for post-meeting obligations and add the missing rows.

ACTION ITEM STATUS — STRICT HEURISTIC:
- An action item represents work to be completed AFTER adjournment.
- A motion approved during the meeting does NOT make its implementation "Selesai".
  Default to "Belum Mula" for all post-meeting tasks unless the transcript explicitly
  confirms the task was executed and completed before adjournment.
- "Selesai": only when explicit pre-adjournment completion is confirmed.
- "Dalam Tindakan": only when the transcript shows work already underway.
- "Belum Mula": all newly decided and delegated post-meeting tasks.

ACTION ITEM DUPLICATE SUPPRESSION:
- Never create a narrative agenda_item named "Tindakan Susulan" inside agenda_items.
  All actionable commitments live exclusively in action_items.

- Use "id" (NOT "agenda_id" or "action_id") across all items.
- Format all ids with lowercase prefixes: "agenda-001", "decision-001", "action-001".

{template_guidance}
RULES:
{rules.get('raw_content', '')}
"""

    user_prompt = f"""TRANSCRIPT_SEGMENT:
{transcript_text}

MEETING_DATE_HINT: {meeting_date if meeting_date else "null"}
SOURCE_FILE: {source_label}
CHUNK_INDEX: 1 of 1

Extract title, date, start_time, end_time, venue, chairperson, secretary, participants, agenda_items, decisions, and action_items.

REMINDER: Apply the ACTION ITEM IDENTIFICATION rules above — every approved motion, deferral, appointment, delegation, and financial disbursement must produce at least one action_items row. If you find zero action items after extraction, re-examine each carried motion for post-meeting obligations before finalising your response.
"""

    data, in_tokens, out_tokens = call_llm(system_prompt, user_prompt)

    # Resolve meeting date: prefer LLM-extracted date over heuristic
    resolved_date = data.get("date") or meeting_date

    result = {
        "schema_version": "1.0.0",
        "meeting_id": str(uuid.uuid4()),
        # Top-level metadata fields for direct consumption by the frontend
        "title": data.get("title") or None,
        "meeting_number": data.get("meeting_number") or None,
        "meeting_date": resolved_date,
        "date": resolved_date,
        "start_time": data.get("start_time") or None,
        "end_time": data.get("end_time") or None,
        "venue": data.get("venue") or None,
        "chairperson": data.get("chairperson") or {},
        "secretary": data.get("secretary") or {},
        "source_file": source_label,
        "participants": data.get("participants", []),
        "agenda_items": data.get("agenda_items", []),
        "decisions": data.get("decisions", []),
        "action_items": data.get("action_items", []),
        "extraction_metadata": {
            "extracted_at": now_utc,
            "pipeline_version": "1.0.0",
            "language_detected": ["ms", "en"],
            "warnings": [],
            "rules_version": rules.get("rules_version", "1.0.0"),
            "template_type": template_type,
            "token_usage": {"input_tokens": in_tokens, "output_tokens": out_tokens},
            "extraction_status": "success",
            "near_empty": False
        }
    }
    return result
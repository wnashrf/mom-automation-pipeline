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


def call_llm(system_prompt: str, user_prompt: str) -> tuple[dict, int, int]:
    """
    Invoke LLM core directly via the Anthropic API.
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
            model="claude-3-5-sonnet-latest",
            max_tokens=8192,
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
        match = re.search(r"(\{.*\})", raw_text, re.DOTALL)
        json_clean = match.group(1) if match else raw_text.strip()
        json_clean = re.sub(r"^```(?:json)?\s*", "", json_clean)
        json_clean = re.sub(r"\s*```$", "", json_clean)

        try:
            import json_repair
            parsed = json_repair.loads(json_clean)
        except Exception:
            parsed = json.loads(json_clean)

        return parsed, response.usage.input_tokens, response.usage.output_tokens

    except Exception as exc:
        logger.error("Anthropic API call failed: %s", exc)
        raise RuntimeError(f"Anthropic API Error: {str(exc)}")


def run_extraction(transcript_input: str | Path) -> dict:
    """
    Main entry point for extraction.
    Accepts either an on-disk file path or raw transcript text directly.
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

    system_prompt = f"""You are a professional meeting minutes extraction engine specialised in multilingual Malaysian workplace communication (Bahasa Melayu, English, Manglish code-switching).
Extract structured meeting data conforming strictly to MoM_Schema.
Respond ONLY with a valid JSON object matching the schema. No markdown fencing or explanations outside the JSON.

SCHEMA CONTRACT FORMAT:
{{
  "participants": [
    {{
      "label": "Full Name",
      "department": "Canonical Department Name or null",
      "department_confidence": "explicit" | "inferred" | "unresolved" | null,
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
      "agenda_item_id": "agenda-001 or null",
      "raw_text": "Original utterance or null",
      "normalisation_confidence": "high" | "low" | null
    }}
  ]
}}

CRITICAL REQUIREMENTS:
- Use "label" (NOT "name") for participants.
- Use "id" (NOT "agenda_id" or "action_id") across all items.
- Extract ALL commitments, including informal follow-up sprints or tasks mentioned by participants.
- Format all ids with lowercase prefixes: "agenda-001", "decision-001", "action-001".

RULES:
{rules.get('raw_content', '')}
"""

    user_prompt = f"""TRANSCRIPT_SEGMENT:
{transcript_text}

MEETING_DATE_HINT: {meeting_date if meeting_date else "null"}
SOURCE_FILE: {source_label}
CHUNK_INDEX: 1 of 1

Extract participants, agenda_items, decisions, and action_items.
"""

    data, in_tokens, out_tokens = call_llm(system_prompt, user_prompt)

    result = {
        "schema_version": "1.0.0",
        "meeting_id": str(uuid.uuid4()),
        "meeting_date": meeting_date,
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
            "token_usage": {"input_tokens": in_tokens, "output_tokens": out_tokens},
            "extraction_status": "success",
            "near_empty": False
        }
    }
    return result
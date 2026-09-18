import json
import logging
import os
from pathlib import Path
import jsonschema

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT_PATH = Path("data/extracted_mom.json")

# In scripts/output_writer.py
MOM_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": [
        "schema_version", "meeting_id", "meeting_date", "source_file",
        "participants", "agenda_items", "decisions", "action_items",
        "extraction_metadata"
    ],
    "properties": {
        "schema_version": {"type": "string"},
        "meeting_id": {"type": "string"},
        "meeting_date": {"type": ["string", "null"]},
        "source_file": {"type": "string"},
        "participants": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["label", "department", "department_confidence", "label_source"]
            }
        },
        "agenda_items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "title", "confidence", "summary"]
            }
        },
        "decisions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "statement", "confidence"]
            }
        },
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "description", "assignee", "assignee_status", "deadline_status"]
            }
        },
        "extraction_metadata": {"type": "object"}
    }
}


def validate_mom_output(data: dict) -> list[str]:
    """Validate data against MoM_Schema; return error strings."""
    validator = jsonschema.Draft7Validator(MOM_SCHEMA)
    errors = []
    for error in validator.iter_errors(data):
        err_msg = f"{error.json_path}: {error.message}"
        logger.error("Schema Violation - %s", err_msg)
        errors.append(err_msg)
    return errors


def write_mom_output(data: dict, output_path: Path = DEFAULT_OUTPUT_PATH) -> bool:
    """Atomically write validated MoM JSON to disk."""
    violations = validate_mom_output(data)
    if violations:
        logger.error("Aborting write: Payload failed schema validation.")
        return False

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(".json.tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, output_path)
        logger.info("Successfully wrote atomic MoM payload to %s", output_path)
        return True
    except OSError as exc:
        logger.error("File system error during atomic write: %s", exc)
        if tmp_path.exists():
            tmp_path.unlink()
        return False
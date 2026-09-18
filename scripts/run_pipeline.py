"""
scripts/run_pipeline.py
Standalone CLI Runner for the MoM Automation Pipeline (Tier 1).
"""

import argparse
import logging
import sys
from pathlib import Path

# Add project root to sys.path so 'scripts.*' imports resolve cleanly
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Module imports from Tier 1 subsystems
from scripts.dedup_registry import (
    compute_sha256,
    is_duplicate,
    load_registry,
    record_entry,
    save_registry,
)
from scripts.extraction_agent import run_extraction
from scripts.output_writer import write_mom_output

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("pipeline_runner")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the standalone MoM extraction pipeline."
    )
    parser.add_argument(
        "transcript_path",
        type=str,
        help="Path to the source transcript .txt file.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/extracted_mom.json",
        help="Destination path for validated MoM JSON (default: data/extracted_mom.json).",
    )
    parser.add_argument(
        "--dispatch",
        action="store_true",
        help="Invoke scripts/dispatch_quick.py upon successful extraction write.",
    )

    args = parser.parse_args()
    transcript_file = Path(args.transcript_path)
    output_path = Path(args.output)

    # 1. Validate file readability
    if not transcript_file.exists() or not transcript_file.is_file():
        logger.error("Transcript file not found: %s", transcript_file)
        sys.exit(1)

    logger.info("Starting extraction pipeline on: %s", transcript_file)

    # 2. Deduplication check
    file_hash = compute_sha256(str(transcript_file))
    registry = load_registry()

    if is_duplicate(registry, file_hash):
        logger.warning(
            "Duplicate detected for file %s (SHA-256: %s). Skipping extraction.",
            transcript_file.name,
            file_hash,
        )
        sys.exit(0)

    # 3. Extraction via Extraction Agent
    try:
        extraction_result = run_extraction(transcript_file)
    except Exception as exc:
        logger.error("Extraction agent failed: %s", exc)
        sys.exit(1)

    # 4. Schema validation and atomic write
    write_success = write_mom_output(extraction_result, output_path=output_path)
    if not write_success:
        logger.error("Output writer aborted: schema validation failed.")
        sys.exit(1)

    # 5. Record entry in registry
    record_entry(registry, file_hash, str(transcript_file), status="success")
    save_registry(registry)
    logger.info("Recorded SHA-256 in deduplication registry.")

    meeting_id = extraction_result.get("meeting_id", "<unknown>")
    logger.info("Pipeline completed successfully! meeting_id=%s", meeting_id)

    # 6. Optional Dispatch handoff
    if args.dispatch:
        logger.info("Initiating downstream dispatch bridge...")
        from scripts.dispatch_quick import main as dispatch_main
        dispatch_main()


if __name__ == "__main__":
    main()
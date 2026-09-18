# Implementation Plan: MoM Automation Pipeline

## Overview

Implements the end-to-end Minutes of Meeting Automation Pipeline in Python. The pipeline watches `transcripts/` for raw `.txt` files, extracts structured meeting data using an LLM-backed agent with multilingual (Bahasa Melayu / English / Manglish) support, validates and persists results to `data/extracted_mom.json`, and dispatches the payload to an Amazon Quick Automate webhook.

Implementation follows the linear pipeline architecture: Ingestion Hook → Extraction Agent (Normaliser + Chunker + LLM core) → Output Writer → Dispatch Bridge.

---

## Tasks

- [x] 1. Project Scaffolding & Steering Rules
  - [x] 1.1 Create workspace directory structure
    - Create `transcripts/`, `data/`, `scripts/`, `tests/` directories at the workspace root
    - Add `.gitkeep` to `transcripts/` and `data/` so they are tracked by git
    - Add `__init__.py` to `scripts/` and `tests/` to make them importable as packages
    - _Requirements: 1.1, 1.2, 9.6_

  - [x] 1.2 Define steering rules in `.kiro/steering/mom-rules.md`
    - Add YAML front-matter `rules_version` field as the first field in the file
    - Section 1: Decision markers — Bahasa Melayu list (≥10 entries), English list (≥10 entries), Manglish/informal list
    - Section 2: Action item markers — Bahasa Melayu list, English list, Manglish list
    - Section 3: Speaker-change heuristics with `confidence_threshold: 0.65` and the 5 ordered heuristics from the design
    - Section 4: Department canonical mappings table (all 8 department groups from the design)
    - Section 5: LLM prompt templates — system prompt template and user prompt template with all placeholders documented
    - Section 6: Token efficiency rules (structured output mode, system prompt token limit, per-chunk behaviour, concise verbs)
    - Section 7: `near_empty_word_threshold: 50`
    - Section 8: `default_token_limit: 12000`, `max_token_limit: 100000`, `min_chunk_overlap_tokens: 200`
    - _Requirements: 13.1, 13.2, 13.5_

  - [x] 1.3 Create initial empty deduplication registry
    - Write `data/.dedup_registry.json` with `{ "registry_version": "1.0.0", "entries": [] }`
    - _Requirements: 1.3, 1.5_

- [ ] 2. Mock Transcripts for Offline Validation
  - [ ] 2.1 Create `transcripts/mock_labeled_en.txt`
    - Fully labeled English transcript using `SpeakerName:` prefixes
    - Must contain at least 2 explicit agenda markers, 1 explicit decision marker, 2 action items with deadlines
    - Include at least one action item with a relative deadline (e.g., "by next Friday") to exercise date resolution
    - _Requirements: 2.1, 4.1, 5.1, 6.1, 6.2_

  - [x] 2.2 Create `transcripts/mock_labeled_mixed.txt`
    - Labeled transcript with Bahasa Melayu / Manglish / English code-switching
    - Include at least one Manglish pragmatic particle (`lah`, `mah`, `lor`, `kan`)
    - Include Bahasa Melayu decision marker (`Diputuskan`) and action marker (`Sila hantar`)
    - Use `[SpeakerName]` bracket format for at least one speaker to test both label formats
    - _Requirements: 2.1, 7.1, 7.2, 7.3, 7.4_

  - [ ] 2.3 Create `transcripts/mock_unlabeled.txt`
    - Transcript with no speaker labels — continuous prose paragraphs
    - At least 4 paragraphs separated by blank lines to exercise paragraph-break heuristic
    - Include recognisable decision and action language so extraction can still produce results
    - _Requirements: 2.2, 8.1, 8.4_

  - [ ] 2.4 Create `transcripts/mock_empty.txt`
    - Zero-byte file (empty, no content)
    - _Requirements: 12.1_

  - [ ] 2.5 Create `transcripts/mock_near_empty.txt`
    - Transcript with fewer than 50 usable words after stripping whitespace and punctuation
    - Must have at least 1 word so it is not zero-byte
    - _Requirements: 12.2_

  - [ ] 2.6 Create `transcripts/mock_no_decisions.txt`
    - Transcript with no discernible agenda markers, no decision language, and no action item language
    - Enough content (≥50 words) to pass the near-empty check
    - Should result in a single inferred `"General Discussion"` agenda item, empty `decisions` and `action_items` arrays
    - _Requirements: 4.6, 5.5, 6.9_

- [ ] 3. Deduplication Registry & Output Writer
  - [ ] 3.1 Implement SHA-256 hash computation utility (`scripts/utils.py`)
    - `compute_sha256(file_path: str) -> str` — reads file in binary chunks, returns hex digest
    - Handle `PermissionError` and `OSError` by raising a descriptive `IngestionError`
    - _Requirements: 1.3, 1.6_

  - [ ] 3.2 Implement Deduplication Registry module (`scripts/dedup_registry.py`)
    - `load_registry(path: str) -> dict` — loads JSON; returns empty registry structure on missing file; raises on malformed JSON
    - `is_duplicate(registry: dict, sha256: str) -> bool` — returns `True` if hash exists with status `"success"`
    - `record_entry(registry: dict, sha256: str, path: str, status: str) -> dict` — adds or updates entry with `processed_at` ISO 8601 UTC timestamp
    - `save_registry(registry: dict, path: str) -> None` — atomic write (temp + rename) to avoid partial writes
    - `handle_unavailable(path: str) -> dict` — returns empty registry and logs warning when registry file cannot be loaded; used per requirement 1.9
    - _Requirements: 1.3, 1.4, 1.5, 1.7, 1.9_

  - [ ] 3.3 Implement MoM_Schema JSON Schema definition (`scripts/mom_schema.py`)
    - Define `MOM_SCHEMA` as the complete JSON Schema draft-07 dict from the design document
    - Export `REQUIRED_DISPATCH_NULL_FIELDS` set: `{"meeting_date", "assignee", "deadline", "assignee_status", "deadline_status"}`
    - _Requirements: 9.3, 9.4, 9.7_

  - [ ] 3.4 Implement Schema Validator (`scripts/output_writer.py` — validation function)
    - `validate_mom_output(data: dict) -> list[str]` — validates against `MOM_SCHEMA` using `jsonschema`; returns list of violation strings (JSON path + expected type); returns empty list on valid input
    - Log each violation at ERROR level before returning
    - _Requirements: 9.2_

  - [ ] 3.5 Implement Output Writer atomic write (`scripts/output_writer.py` — write function)
    - `write_mom_output(data: dict, output_path: str = "data/extracted_mom.json") -> bool`
    - Call `validate_mom_output`; if violations exist, log and return `False` without writing
    - Bootstrap `data/` directory with `os.makedirs(exist_ok=True)` before writing
    - Write to `<output_path>.tmp`, then `os.replace(tmp, output_path)` for atomic rename (Windows + POSIX safe)
    - On `OSError` during write or rename: log OS error code, delete `.tmp` file if it exists, return `False`
    - Encode as UTF-8, pretty-print with 2-space indentation (`json.dumps(..., ensure_ascii=False, indent=2)`)
    - _Requirements: 9.1, 9.2, 9.5, 9.6, 9.8_

  - [ ]* 3.6 Write property test for Output Writer — P1: Schema Completeness
    - **Property 1: Schema Completeness**
    - Generate random `ExtractionResult` objects with `st.builds(generate_extraction_result)`; assert all required top-level fields and all `extraction_metadata` sub-fields are present and type-conformant when `extraction_status` is `"success"` or `"partial"`
    - **Validates: Requirements 9.3, 9.4, 9.7**
    - Tag: `# Feature: mom-automation-pipeline, Property 1: Schema Completeness`

  - [ ]* 3.7 Write unit tests for Output Writer and Schema Validator (`tests/test_output_writer.py`)
    - Test schema validation rejection for each required field removed individually (9 top-level + 8 `extraction_metadata` sub-fields)
    - Test atomic write: verify `.tmp` file is absent after successful rename
    - Test atomic write failure: mock `os.replace` to raise `OSError`; verify `.tmp` cleaned up and function returns `False`
    - Test `data/` auto-creation: call writer with non-existent `data/` path, verify directory created
    - _Requirements: 9.2, 9.5, 9.6, 9.8_

- [ ] 4. Checkpoint — Core persistence layer complete
  - Ensure all tests in `tests/test_output_writer.py` pass. Ask the user if any questions arise before proceeding to the Extraction Agent.

- [ ] 5. Extraction Agent Core
  - [ ] 5.1 Implement Steering Rules loader (`scripts/steering_rules.py`)
    - `load_steering_rules(path: str = ".kiro/steering/mom-rules.md") -> dict`
    - Parse YAML front-matter for `rules_version`; parse each numbered section into a structured dict
    - On `FileNotFoundError`: log critical warning with file path, return built-in default rules dict, set `rules_version` to `"built-in-default"`
    - On parse error: log error with affected line number, return built-in default rules dict
    - Built-in defaults must cover the minimum required fields from requirement 13.2
    - If a parsed rule value conflicts with a hard-coded pipeline constraint, apply the hard-coded value and log a warning identifying the rule name and constraint
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ]* 5.2 Write property test for Steering Rules loader — P9: Rules Version Round-Trip
    - **Property 9: Rules Version Round-Trip**
    - Generate synthetic steering rules files with `st.builds(generate_steering_rules)`; write to temp file; load with `load_steering_rules`; assert loaded `rules_version` equals the version in the generated file
    - **Validates: Requirements 13.5**
    - Tag: `# Feature: mom-automation-pipeline, Property 9: Rules Version Round-Trip`

  - [ ] 5.3 Implement Normaliser sub-component (`scripts/normaliser.py`)
    - `normalise_utterance(utterance: str, rules: dict) -> dict` — returns `{"normalised": str, "raw_text": str | None, "normalisation_confidence": "high" | "low"}`
    - Code-switch detection: identify token-level language boundaries using Steering_Rules keyword lists and Manglish particle list
    - Pragmatic particle retention: flag `lah`, `mah`, `lor`, `kan`, `boleh ke`, `tak boleh` as pragmatic-function tokens; always include in `raw_text` even when surrounding text is translated
    - Utterance integrity: never split utterance at language boundary; pass whole utterance to LLM as single unit
    - Confidence assignment: set `normalisation_confidence` to `"low"` when ambiguous translation; preserve `raw_text` in that case
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.7_

  - [ ] 5.4 Implement Chunker (`scripts/chunker.py`)
    - `tokenize(text: str) -> list[str]` — whitespace tokenizer (acceptable approximation; no external tokenizer dependency required for v1)
    - `chunk_transcript(text: str, threshold: int = 12000, overlap: int = 200) -> list[str]` — returns single-element list if `len(tokens) <= threshold`; otherwise produces overlapping chunks with back-step of `overlap` tokens; applies sub-chunking if any single chunk would exceed `max_token_limit`
    - _Requirements: 11.2, 11.3_

  - [ ] 5.5 Implement chunk merge function (`scripts/chunker.py` — merge function)
    - `merge_chunk_results(results: list[dict]) -> dict`
    - Deduplication keys per design: `participants` → `label` (case-insensitive); `agenda_items` → `title` (normalised whitespace); `decisions` → `statement` (exact); `action_items` → `(description, assignee)` tuple
    - Scalar fields: use value from first chunk result; log warning if chunks disagree
    - `token_usage`: sum `input_tokens` and `output_tokens` across all chunks
    - _Requirements: 11.3_

  - [ ]* 5.6 Write property test for chunk merge — P5: Chunk Merge Idempotency
    - **Property 5: Chunk Merge Idempotency**
    - Generate random `ExtractionResult` objects with `st.builds(generate_extraction_result)`; assert `merge_chunk_results([R, R]) == R` for all four array fields and all scalar fields
    - **Validates: Requirements 11.3**
    - Tag: `# Feature: mom-automation-pipeline, Property 5: Chunk Merge Idempotency`

  - [ ] 5.7 Implement speaker identification (`scripts/extraction_agent.py` — speaker functions)
    - `extract_speaker_labels(transcript: str) -> list[dict]` — detect `SpeakerName:` and `[SpeakerName]` prefixes; return list of `{label, segments, label_source}`
    - Canonical normalisation: strip extra whitespace, unify capitalisation, resolve punctuation-only abbreviation variants (e.g., `Dr.` → `Dr`) to the first-occurrence canonical form
    - Fallback `Speaker_N` assignment: scan unlabeled blocks; offset N to avoid collision with any existing explicit label matching `Speaker_*` format
    - No-label fallback: assign `Speaker_1` to entire body; add `warnings` entry "No speaker labels detected"
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 5.8 Write property test for speaker identification — P2: Speaker Label Uniqueness and Coverage
    - **Property 2: Speaker Label Uniqueness and Coverage**
    - Generate random labeled/unlabeled/mixed transcripts with `st.builds(generate_labeled_transcript)`; assert `labels` in output are unique (case-insensitive) and every identified speaker block maps to exactly one `participants` entry
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
    - Tag: `# Feature: mom-automation-pipeline, Property 2: Speaker Label Uniqueness and Coverage`

  - [ ] 5.9 Implement department affiliation extraction (`scripts/extraction_agent.py` — department function)
    - `extract_department(utterances: list[dict], rules: dict) -> list[dict]` — enrich each participant entry with `department`, `department_confidence`
    - Explicit extraction: regex scan for `"SpeakerName, DeptName"` and `"[SpeakerName — DeptName]"` patterns
    - Inferred extraction: LLM-based inference; set `department_confidence: "inferred"` — only when no explicit reference exists for that speaker
    - Null fallback: set `department: null` when no affiliation found
    - Canonical normalisation: look up variant in `rules["department_mappings"]`; set `department_confidence: "unresolved"` when no mapping found
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 5.10 Write property test for department normalisation — P8: Department Normalization Idempotence
    - **Property 8: Department Normalization Idempotence**
    - Sample from `DEPARTMENT_VARIANTS` list with `st.sampled_from(DEPARTMENT_VARIANTS)`; assert `normalize(normalize(name)) == normalize(name)` and that mapped variants equal their canonical name
    - **Validates: Requirements 3.3, 3.5**
    - Tag: `# Feature: mom-automation-pipeline, Property 8: Department Normalization Idempotence`

  - [ ] 5.11 Implement agenda item extraction (`scripts/extraction_agent.py` — agenda function)
    - `extract_agenda_items(transcript: str, rules: dict) -> list[dict]`
    - Explicit: scan for markers from `rules["agenda_markers"]` (e.g., `Agenda N:`, `Perkara N:`, `Next item:`, `Moving on to`); set `confidence: "explicit"`
    - Inferred: if fewer than 2 explicit markers, pass full transcript to LLM for semantic segmentation; set `confidence: "inferred"` for each inferred segment
    - `"General Discussion"` fallback: if semantic analysis finds fewer than 2 distinct segments and no explicit markers, produce single item with `confidence: "inferred"` and log warning
    - Preserve sequential order; generate `id` as `"agenda-NNN"` zero-padded
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7_

  - [ ] 5.12 Implement formal decision extraction (`scripts/extraction_agent.py` — decision function)
    - `extract_decisions(transcript: str, agenda_items: list[dict], rules: dict) -> list[dict]`
    - Explicit: scan for BM markers (e.g., `Diputuskan`, `Dicadangkan`), English markers (`it was decided`, `agreed`), Manglish markers (`ok la we go with`, `settle already`); set `confidence: "explicit"`
    - Inferred: LLM detects implicit consensus (2+ speakers agree without formal marker); set `confidence: "inferred"`
    - `speaker_label` association: extract from surrounding speaker context; set to `null` if indeterminate
    - `agenda_item_id` association: match by surrounding context; set to `null` if not associable
    - Empty case: set `decisions: []`
    - Generate `id` as `"decision-NNN"` zero-padded
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 5.13 Implement action item extraction (`scripts/extraction_agent.py` — action function)
    - `extract_action_items(transcript: str, agenda_items: list[dict], meeting_date: str | None, rules: dict) -> list[dict]`
    - Explicit: scan for BM markers (`Sila hantar`, `Kena buat`), English markers (`Action:`, `TODO:`, `will send by`), Manglish markers (`kena hantar`, `settle by`)
    - Relative date resolution: if `meeting_date` is known, resolve expressions like `"by next Friday"`, `"dalam 2 minggu"` to ISO 8601 date; set `deadline_status: "resolved"`
    - Unresolvable deadline: if `meeting_date` is `null`, set `deadline: null`, `deadline_status: "unresolvable"`, log warning
    - Missing deadline: if no deadline found, set `deadline: null`, `deadline_status: "missing"`
    - Missing assignee: set `assignee: null`, `assignee_status: "unresolved"`
    - Truncate `description` to 500 characters
    - `agenda_item_id` association: same context-matching approach as decisions
    - Empty case: set `action_items: []`
    - Generate `id` as `"action-NNN"` zero-padded
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [ ] 5.14 Implement consolidated LLM extraction call (`scripts/extraction_agent.py` — LLM core)
    - `run_extraction(transcript: str, source_file: str, rules: dict, meeting_date: str | None) -> dict`
    - Assemble system prompt from `rules["prompt_templates"]["system"]` with `{{steering_rules_content}}` and `{{mom_schema_json}}` substituted
    - Assemble user prompt from `rules["prompt_templates"]["user"]` with all placeholders substituted
    - Pass through Normaliser for each utterance before final prompt assembly
    - If `len(tokenize(transcript)) <= rules["chunking"]["default_token_limit"]`: single LLM call
    - Otherwise: chunk via `chunk_transcript`, call LLM per chunk, merge via `merge_chunk_results`
    - Log estimated input token count and reported output token count to `extraction_metadata.token_usage`
    - Enforce: include only transcript content + system instructions; exclude conversation history and prior results
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ] 5.15 Implement LLM response error handling and partial output (`scripts/extraction_agent.py`)
    - Wrap LLM call in retry logic: on non-JSON response or missing required top-level fields, retry once with identical prompt
    - If both attempts fail: log error; construct partial MoM_Schema with `extraction_status: "failed"`, all arrays set to `[]`, `near_empty: false`; write partial output via Output Writer; do NOT invoke Dispatch Bridge; return failure status
    - Near-empty transcript: if usable word count < `rules["near_empty_word_threshold"]` (50), set `extraction_metadata.near_empty: true`, set all extraction arrays to `[]`, set `extraction_status: "partial"`, log warning with file name and word count
    - Unhandled exception handler: catch at top-level `run_extraction`; log exception type, message, stack trace; if output file exists, update `extraction_status: "error"`
    - _Requirements: 12.2, 12.3, 12.6_

  - [ ]* 5.16 Write property test for near-empty invariant — P7: Near-Empty Transcript Invariant
    - **Property 7: Near-Empty Transcript Invariant**
    - Generate short texts with `st.text(max_size=49)` (≤49 usable words after stripping); run through extraction; assert `near_empty == true` and all four extraction arrays are `[]`
    - **Validates: Requirements 12.2**
    - Tag: `# Feature: mom-automation-pipeline, Property 7: Near-Empty Transcript Invariant`

  - [ ]* 5.17 Write unit tests for Extraction Agent (`tests/test_extraction_agent.py`)
    - Speaker label normalisation: test `Dr.` → `Dr`, `J. Smith` → `J Smith`, bracket vs colon format, fallback sequence collision avoidance
    - Keyword matching: for each BM and English decision marker in steering rules, assert the extraction function detects and classifies it correctly
    - Keyword matching: for each BM and English action item marker, assert detection and field population
    - Relative date resolution: test `"next Friday"` and `"dalam 2 minggu"` against known fixed meeting dates; test with `meeting_date = None` producing `deadline_status: "unresolvable"`
    - Near-empty boundary: exactly 49 usable words → `near_empty: true`; exactly 50 usable words → `near_empty: false`
    - Agenda `"General Discussion"` fallback: transcript with <2 distinct topics and no explicit markers
    - Empty decisions/actions: transcript with no matching language → `decisions: []`, `action_items: []`
    - _Requirements: 2.1–2.6, 4.1, 4.6, 5.1, 5.5, 6.1–6.9, 7.4, 12.2_

- [ ] 6. Checkpoint — Extraction Agent complete
  - Ensure all tests in `tests/test_extraction_agent.py` pass against the mock transcripts. Run extraction manually against `mock_labeled_en.txt` to verify output structure. Ask the user if any questions arise.

- [ ] 7. Kiro Agent Hook Configuration
  - [x] 7.1 ~~Create `.kiro/hooks/mom-ingestion.json`~~ — **EVALUATED / DEPRECATED FOR PRODUCTION**
    - Hook was created and validated (`version: "v1"`, `trigger: "PostFileCreate"`, `matcher: "transcripts/.*\\.txt$"`, `action.type: "agent"`).
    - **Deprecation rationale:** The `PostFileCreate` Kiro Agent Hook requires an active Kiro desktop session and cannot be used as a production or headless runtime trigger. Desktop OS hook constraints (session-bound execution, no daemon mode, no Lambda portability) make this mechanism unsuitable for any deployment beyond local developer iteration.
    - **Superseded by:** `scripts/run_pipeline.py` (Task 13.1) as the canonical headless invocation path. The hook file is retained in `.kiro/hooks/` for developer convenience only and MUST NOT be treated as a production dependency.
    - _Requirements: 1.1, 1.2 (dev-session convenience path only)_

  - [x] 7.2 End-to-end hook smoke test
    - Copy `mock_labeled_en.txt` to `transcripts/test_hook_trigger.txt` to fire the `PostFileCreate` hook
    - Verify `data/extracted_mom.json` is created with a valid `extraction_status: "success"` result
    - Verify `data/.dedup_registry.json` contains a new entry for the file with `status: "success"`
    - Verify re-triggering with the same file content produces a duplicate-detection log and does not overwrite `data/extracted_mom.json`
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [x] 8. Dispatch Bridge
  - [x] 8.1 Implement `load_payload` and `filter_nulls` (`scripts/dispatch_quick.py`)
    - `load_payload(path: str) -> dict` — reads `data/extracted_mom.json`; on missing file or read error, logs file-not-found / read error and calls `sys.exit(1)` without making any HTTP request
    - `filter_nulls(payload: dict, required_fields: set[str]) -> dict` — shallow pass over payload root + recursive pass over nested objects; retains fields in `required_fields` even when `null`; removes all other `null`-valued fields
    - `REQUIRED_NULL_FIELDS = {"meeting_date", "assignee", "deadline", "assignee_status", "deadline_status"}`
    - **Status: ✅ Completed — validated Python implementation with null filtering confirmed.**
    - _Requirements: 10.8, 10.9_

  - [x] 8.2 Implement `post_with_retry` (`scripts/dispatch_quick.py`)
    - `post_with_retry(url: str, payload: dict) -> int`
    - Per-request connect + read timeout: 30 seconds
    - 2xx: log success with status code and `meeting_id`; return status code
    - 4xx: log error with status code and response body; `sys.exit(1)` — no retry
    - 5xx or `ConnectionError` / `TimeoutError`: retry up to 3 times with delays `[2, 4, 8]` seconds; log each retry attempt with attempt number and elapsed time
    - After 3 failed retries: log final failure with `meeting_id`, attempt count, last status/error; `sys.exit(1)`
    - **Status: ✅ Completed — exponential backoff and retry logic validated.**
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 8.3 Implement `main()` entry point (`scripts/dispatch_quick.py`)
    - Read `QUICK_AUTOMATE_WEBHOOK_URL` from environment; if absent or empty, log configuration error and `sys.exit(1)` without making any HTTP request
    - Call `load_payload`, `filter_nulls`, `post_with_retry` in sequence
    - On `sys.exit(0)` path (2xx): pipeline success
    - **Status: ✅ Completed — end-to-end dispatch bridge functional.**
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 8.7 Quick Space ingestion verification — Path B handoff
    - Upload `data/extracted_mom.json` to the `MoM-Pipeline-Ingestion` Quick Space via the `MoM_File` card
    - Confirm the `Example Flow` is triggered within Amazon Quick Flows upon file upload
    - Verify the Quick Flows execution log records the `meeting_id` from the uploaded JSON and shows a successful flow completion
    - Confirm the flow output (formatted MoM + task distribution) is equivalent to a successful Path A (webhook POST) execution
    - Document any schema or field-mapping differences observed between Path A and Path B Quick Flows processing
    - _Requirements: 10.10, 14.7_

  - [ ]* 8.4 Write property test for Dispatch Bridge — P4: Null Safety in Dispatched Payload
    - **Property 4: Null Safety in Dispatched Payload**
    - Generate random `mom_output` dicts with `st.builds(generate_mom_output)` including arbitrary null fields; pass through `filter_nulls`; assert no `null` values remain except for fields in `REQUIRED_NULL_FIELDS`, at all nesting levels
    - **Validates: Requirements 10.9**
    - Tag: `# Feature: mom-automation-pipeline, Property 4: Null Safety in Dispatched Payload`

  - [ ]* 8.5 Write property test for Dispatch Bridge — P6: Exponential Backoff Correctness
    - **Property 6: Exponential Backoff Correctness**
    - Mock HTTP client with `st.integers(min_value=1, max_value=3)` controlling number of 5xx responses before giving up; assert delay before retry N equals `2^N` seconds; assert total HTTP call count never exceeds 4; assert `sys.exit(1)` after all retries exhausted
    - **Validates: Requirements 10.5, 10.6**
    - Tag: `# Feature: mom-automation-pipeline, Property 6: Exponential Backoff Correctness`

  - [ ]* 8.6 Write unit tests for Dispatch Bridge (`tests/test_dispatch.py`)
    - Test missing `QUICK_AUTOMATE_WEBHOOK_URL` → logs config error, `sys.exit(1)`, no HTTP call
    - Test empty `QUICK_AUTOMATE_WEBHOOK_URL` → same as above
    - Test missing `data/extracted_mom.json` → logs file-not-found, `sys.exit(1)`, no HTTP call
    - Test 2xx response → logs success with meeting_id, `sys.exit(0)`
    - Test 4xx response → logs error with status + body, `sys.exit(1)`, no retry
    - Test 5xx response for all 4 attempts → logs each retry, logs final failure, `sys.exit(1)`
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.8_

- [ ] 9. Property-Based & Unit Tests — Pipeline-Level
  - [ ] 9.1 Set up Hypothesis and test infrastructure (`tests/conftest.py`, `requirements-test.txt`)
    - Add `hypothesis`, `pytest`, `jsonschema`, `pytest-mock` to `requirements-test.txt` with pinned versions
    - Create `tests/conftest.py` with shared Hypothesis strategies: `generate_transcript()`, `generate_labeled_transcript()`, `generate_extraction_result()`, `generate_mom_output()`, `generate_steering_rules()`
    - Add `pytest.ini` or `pyproject.toml` test configuration pointing to `tests/`
    - _Requirements: 11.1 (test infrastructure)_

  - [ ] 9.2 Implement P3: Deduplication Invariant test (`tests/test_dedup.py`)
    - **Property 3: Deduplication Invariant**
    - Generate arbitrary `st.binary()` file contents; write to temp file; compute SHA-256; record in registry with `status: "success"`; trigger dedup check again; assert no new extraction result, no modification to output file, registry entry count remains 1
    - **Validates: Requirements 1.3, 1.4, 1.5**
    - Tag: `# Feature: mom-automation-pipeline, Property 3: Deduplication Invariant`

  - [ ] 9.3 Implement P10: Pipeline Continuity Under Error test (`tests/test_pipeline_continuity.py`)
    - **Property 10: Pipeline Continuity Under Error**
    - Generate lists of transcripts with `st.lists(generate_transcript, min_size=2)` where one or more entries cause extraction errors; assert every file without an unrecoverable I/O failure is attempted; assert error at queue position `i` does not prevent positions `i+1…n` from being attempted
    - **Validates: Requirements 12.7**
    - Tag: `# Feature: mom-automation-pipeline, Property 10: Pipeline Continuity Under Error`

- [ ] 10. Checkpoint — All tests pass
  - Run `pytest tests/ --tb=short` and ensure all unit tests and property-based tests pass. Fix any regressions. Ask the user if any questions arise before proceeding to documentation.

- [ ] 11. Whisper Integration Boundary Documentation
  - [ ] 11.1 Create `WHISPER_INTEGRATION.md` at workspace root
    - Interface contract table: file location, file format, encoding, filename convention, diarization, file atomicity, language
    - Filename convention note: freeform names accepted; `YYYYMMDD_HHMMSS` prefix enables date extraction; rationale for freeform choice documented
    - Atomicity requirement: Whisper must write atomically; staging pattern: write to `transcripts/.staging/` then rename to `transcripts/` as single atomic operation
    - What the pipeline does NOT guarantee: speaker ID accuracy without diarization, boundary detection in fully unlabeled transcripts, recovery from severe Whisper errors, sub-5s latency under load
    - Integration checklist for teammate: 5 items the teammate must verify before integration (atomic writes, UTF-8, test transcript fixture, diarization label format, end-to-end test run)
    - _Requirements: Whisper Integration Boundary (design Section 6)_

  - [ ] 11.2 Create `transcripts/.staging/.gitkeep`
    - Ensure staging directory exists in the repository with a `.gitkeep` placeholder
    - _Requirements: Whisper Integration Boundary (design Section 6)_

- [ ] 12. Architecture Limitations & AWS Cloud Roadmap
  - [ ] 12.1 Create `docs/ARCHITECTURE_LIMITATIONS.md`
    - Current v1.0 limitations table from the design: local file watch, single-tenant/single-agent, no real-time streaming, Whisper diarization quality dependency, session-local FIFO queue (state lost on restart, dedup prevents double-write), flat-file dedup registry (no concurrent-safe locking)
    - Note impact column for each limitation
    - _Requirements: Design Section 9 (Architectural Limitations)_

  - [ ] 12.2 Create `docs/AWS_CLOUD_ROADMAP.md`
    - 5-phase migration roadmap for MD review:
      - Phase 1 — S3 Event Trigger: replace local watch with S3 + SNS/SQS consumer; benefit and estimated complexity
      - Phase 2 — DynamoDB/S3 Output: replace flat files with DynamoDB + S3 archive; atomic dedup via conditional writes; benefit and complexity
      - Phase 3 — Amazon Comprehend: language detection + NER pre-processing; token usage reduction benefit
      - Phase 4 — AWS Lambda: serverless extraction triggered by SQS; per-invocation cost model
      - Phase 5 — Amazon Connect + Transcribe: replace Whisper with Transcribe (`ShowSpeakerLabel: true`); end-to-end AWS-native pipeline
    - Each phase: description, primary benefit, estimated effort/complexity
    - _Requirements: Design Section 9 (AWS Roadmap)_

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. All correctness properties marked as required are critical for production confidence.
- Python is the implementation language throughout, consistent with the design document (`scripts/dispatch_quick.py`, Hypothesis, `os.replace`, etc.).
- `jsonschema` library is used for MoM_Schema validation (JSON Schema draft-07 compatible).
- The Kiro Agent Hook (`7.1`) uses an `"agent"` action type — no shell command is executed directly; the hook delegates the 10-step pipeline to the Kiro agent session.
- Mock transcripts (Group 2) are inert data files; they do not require the extraction pipeline to be running at creation time. They serve as offline fixtures for unit and integration tests.
- All property-based tests use `@settings(max_examples=100)` per the design testing strategy.
- `os.replace()` is used instead of `os.rename()` for atomic write on Windows (avoids `FileExistsError`).
- The dedup registry atomic write in `save_registry` mirrors the Output Writer pattern to prevent registry corruption on crash.
- Documentation tasks (Groups 11–12) produce Markdown files only and have no code dependencies.

- [ ] 13. Standalone CLI Runner & Transport Bridge

  > **Context:** This task group implements the headless invocation path that supersedes the Kiro Agent Hook for all non-developer-session use. `scripts/run_pipeline.py` is the single deterministic entry point for running the full pipeline without any IDE dependency. `scripts/upload_to_space.py` is the Tier 2 Path B transport utility for Amazon Quick Flows file-based ingestion.

  - [ ] 13.1 Implement `scripts/run_pipeline.py` — Standalone CLI Runner
    - Combine deduplication check, extraction execution, schema validation, and atomic JSON write into a single deterministic CLI command
    - **Interface:** `python scripts/run_pipeline.py <transcript_path> [--output data/extracted_mom.json] [--dispatch]`
      - `<transcript_path>`: required positional argument — absolute or relative path to the `.txt` transcript file
      - `--output`: optional override for the output JSON path (default: `data/extracted_mom.json`)
      - `--dispatch`: optional flag; if present, invoke `scripts/dispatch_quick.py` (Path A) on successful write
    - **Execution sequence (deterministic, no IDE dependency):**
      1. Validate `transcript_path` is readable; exit `1` with error log if not
      2. Compute SHA-256 hash; load `data/.dedup_registry.json`; if hash present with `status: "success"`, log duplicate and exit `0`
      3. Load steering rules from `.kiro/steering/mom-rules.md` (or built-in defaults on missing/parse error)
      4. Run Extraction Agent on transcript content (Normaliser + Chunker + LLM call)
      5. Validate extraction result against MoM_Schema; on failure, log violations and exit `1`
      6. Atomic write to output path (`temp → os.replace`)
      7. Record SHA-256 + path + status in deduplication registry
      8. If `--dispatch` flag present: invoke `scripts/dispatch_quick.py`; propagate its exit code
      9. Log final pipeline status with `meeting_id`; exit `0` on success
    - **Constraints:**
      - MUST NOT import any Kiro IDE, VS Code extension host, or agent session API
      - All dependencies must be satisfiable from `requirements.txt`
      - Exit codes: `0` = success (or clean duplicate skip), `1` = any pipeline failure
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ] 13.2 Implement `scripts/upload_to_space.py` — Quick Space Transport Utility (Path B)
    - Programmatic transport utility for staging `data/extracted_mom.json` directly into the Amazon Quick `MoM-Pipeline-Ingestion` Space via the `MoM_File` card, triggering the `Example Flow` in Amazon Quick Flows
    - **Interface:** `python scripts/upload_to_space.py [--file data/extracted_mom.json] [--space MoM-Pipeline-Ingestion] [--card MoM_File]`
      - `--file`: path to the JSON file to upload (default: `data/extracted_mom.json`)
      - `--space`: Quick Space name (default: `MoM-Pipeline-Ingestion`)
      - `--card`: target card name within the Space (default: `MoM_File`)
    - **Execution sequence:**
      1. Validate `--file` is readable and parses as valid JSON; exit `1` on failure
      2. Read Amazon Quick API credentials / endpoint from environment variables (`QUICK_SPACE_API_URL`, `QUICK_SPACE_API_KEY`); exit `1` with config error if absent
      3. Upload file to the specified Space and card via the Amazon Quick SDK or REST API
      4. Log upload confirmation including `meeting_id` and Quick Space response
      5. Exit `0` on successful upload; exit `1` on API error (log status code + response body)
    - **Retry behaviour:** Apply the same `BACKOFF_SECONDS = [2, 4, 8]` / `MAX_RETRIES = 3` pattern from `dispatch_quick.py` for transient API errors (5xx / timeout)
    - **Constraints:** MUST NOT share runtime state with `dispatch_quick.py`; both scripts are independently invocable and independently testable
    - _Requirements: 10.10, 14.7_

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 2, "tasks": ["3.1", "3.3"] },
    { "id": 3, "tasks": ["3.2", "3.4"] },
    { "id": 4, "tasks": ["3.5"] },
    { "id": 5, "tasks": ["3.6", "3.7"] },
    { "id": 6, "tasks": ["5.1", "5.3", "5.4"] },
    { "id": 7, "tasks": ["5.2", "5.5", "5.7"] },
    { "id": 8, "tasks": ["5.6", "5.9", "5.11"] },
    { "id": 9, "tasks": ["5.8", "5.10", "5.12", "5.13"] },
    { "id": 10, "tasks": ["5.14"] },
    { "id": 11, "tasks": ["5.15"] },
    { "id": 12, "tasks": ["5.16", "5.17"] },
    { "id": 13, "tasks": ["7.1 (deprecated — dev-session only)"] },
    { "id": 14, "tasks": ["7.2"] },
    { "id": 15, "tasks": ["8.1"] },
    { "id": 16, "tasks": ["8.2", "8.3"] },
    { "id": 17, "tasks": ["8.4", "8.5", "8.6"] },
    { "id": 18, "tasks": ["9.1"] },
    { "id": 19, "tasks": ["9.2", "9.3"] },
    { "id": 20, "tasks": ["11.1", "11.2", "12.1", "12.2"] },
    { "id": 21, "tasks": ["13.1"], "depends_on": [5, 6, 7, 8, 9, 10, 11, 12], "note": "13.1 requires Extraction Agent and Output Writer complete (waves 6–12)" },
    { "id": 22, "tasks": ["13.2", "8.7"], "depends_on": [21], "note": "13.2 and 8.7 (Quick Space verification) require 13.1 to produce a valid extracted_mom.json" }
  ]
}
```

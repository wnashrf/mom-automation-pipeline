# Requirements Document

## Introduction

The Minutes of Meeting (MoM) Automation Pipeline is an end-to-end system that watches a local `transcripts/` directory for raw speech-to-text output files, semantically extracts structured meeting data from mixed-language (Bahasa Melayu / English / Manglish) transcripts, normalises the results into a strict JSON schema, and dispatches the payload to an Amazon Quick Automate/Flow webhook endpoint for enterprise formatting and participant task distribution.

The pipeline is triggered by a Kiro Agent Hook and consists of four principal subsystems: the **Ingestion Hook**, the **Extraction Agent**, the **JSON Output Writer**, and the **Dispatch Bridge**. Behavioural rules governing LLM prompts and extraction heuristics are maintained in `.kiro/steering/mom-rules.md`.

---

## Glossary

- **Pipeline**: The end-to-end MoM Automation Pipeline described in this document.
- **Ingestion_Hook**: The Kiro Agent Hook that monitors `transcripts/` and triggers the Pipeline on new `.txt` files.
- **Transcript**: A raw `.txt` file produced by the upstream Whisper-based speech-to-text module and placed in `transcripts/`.
- **Extraction_Agent**: The LLM-backed component that reads a Transcript and performs semantic pattern recognition to identify speakers, departments, agenda items, decisions, and action items.
- **Normaliser**: The sub-component responsible for resolving code-switching and standardising extracted text into consistent output.
- **Output_Writer**: The component that validates and persists the structured extraction result to `data/extracted_mom.json`.
- **Dispatch_Bridge**: The script (`scripts/dispatch_quick.py`) that reads `data/extracted_mom.json` and POSTs the payload to the configured Amazon Quick Automate webhook endpoint.
- **MoM_Schema**: The strict JSON schema that defines the structure of `data/extracted_mom.json`.
- **Speaker_Label**: A string identifying a meeting participant, either extracted from the Transcript or auto-assigned (e.g., `"Speaker_1"`).
- **Action_Item**: A task identified in the Transcript that has an assignee and an optional target deadline.
- **Agenda_Item**: A distinct discussion topic identified in the Transcript.
- **Formal_Decision**: A conclusion or resolution explicitly agreed upon during the meeting, as identified in the Transcript.
- **Code_Switch**: A mid-sentence or mid-utterance transition between Bahasa Melayu, English, and/or Manglish within the Transcript.
- **Steering_Rules**: LLM behavioural rules and extraction heuristics defined in `.kiro/steering/mom-rules.md`.
- **Webhook_Endpoint**: The Amazon Quick Automate/Flow OpenAPI endpoint URL configured for the Dispatch_Bridge.
- **Deduplication_Registry**: A persistent record (e.g., a file hash store) maintained by the Ingestion_Hook to prevent reprocessing of previously ingested Transcripts.
- **Near_Empty_Transcript**: A Transcript whose usable text content is fewer than 50 words after stripping whitespace and punctuation.

---

## Requirements

---

### Requirement 1: Transcript Ingestion

**User Story:** As a meeting administrator, I want the pipeline to automatically detect and ingest new transcript files, so that meeting minutes are processed without manual intervention.

> **Architectural Note — PoC vs. Production Runtime:** The initial proof-of-concept explored Kiro Agent Hooks (`PostFileCreate` trigger, `.kiro/hooks/mom-ingestion.json`) as a convenient local IDE integration point. That mechanism remains valid for developer-session use. However, the **production pipeline runtime** MUST operate **headlessly**, independent of any active IDE or Kiro desktop session. The canonical invocation path is `python scripts/run_pipeline.py [transcript_path]` (CLI) or an equivalent direct service call. The Kiro Hook is considered a developer convenience trigger only and MUST NOT be a runtime dependency for any production or staging deployment.

#### Acceptance Criteria

1. WHEN a new `.txt` file is created or moved into the `transcripts/` directory, THE Ingestion_Hook SHALL trigger the Extraction_Agent within 5 seconds of the file system event being detected.
2. WHILE the Kiro Agent session is active, THE Ingestion_Hook SHALL continuously monitor the `transcripts/` directory for new `.txt` files. In headless/production mode, the equivalent trigger is an explicit invocation of `scripts/run_pipeline.py` with the target transcript path as an argument, requiring no active IDE session.
3. WHEN a `.txt` file is detected, THE Ingestion_Hook SHALL read the file's SHA-256 hash and compare it against the Deduplication_Registry before triggering extraction.
4. IF a detected file's SHA-256 hash already exists in the Deduplication_Registry, THEN THE Ingestion_Hook SHALL skip processing and log a duplicate-detection warning that includes the file name and hash.
5. WHEN a Transcript is successfully ingested, THE Ingestion_Hook SHALL record the file's SHA-256 hash and absolute file path in the Deduplication_Registry.
6. IF a detected file is unreadable due to a permissions error or I/O failure, THEN THE Ingestion_Hook SHALL log an error message containing the file path and the failure reason, and SHALL NOT halt monitoring of subsequent files.
7. WHEN multiple new `.txt` files are detected, THE Ingestion_Hook SHALL enqueue each file in FIFO order and process one file at a time to prevent concurrent extraction conflicts.
8. IF the Extraction_Agent does not acknowledge completion within 30 seconds of being triggered, THEN THE Ingestion_Hook SHALL retry the trigger once; IF the second attempt also exceeds 30 seconds, THEN THE Ingestion_Hook SHALL log a timeout failure for that file, mark it in the Deduplication_Registry with a `"timeout"` status, and continue processing the next queued file.
9. IF the Deduplication_Registry is unavailable at the time a file is detected, THEN THE Ingestion_Hook SHALL log a warning, suspend deduplication checks, process the file, and resume deduplication checks once the registry becomes available.

---

### Requirement 2: Speaker Identification

**User Story:** As a meeting participant, I want each spoken contribution to be attributed to the correct speaker, so that the minutes accurately reflect who said what.

#### Acceptance Criteria

1. WHEN a Transcript contains lines prefixed with a speaker label in the format `SpeakerName:` or `[SpeakerName]`, THE Extraction_Agent SHALL extract the speaker name as a Speaker_Label and associate all subsequent lines with that label until the next speaker label appears.
2. WHEN a Transcript contains unlabeled lines with no recognisable speaker prefix matching the formats `SpeakerName:` or `[SpeakerName]`, THE Extraction_Agent SHALL assign sequential fallback Speaker_Labels in the format `Speaker_N` (where N is a positive integer starting at 1) in order of first appearance, incrementing N by 1 for each new unlabeled speaker block.
3. WHEN a Transcript contains speaker name variations that differ only in whitespace, capitalisation, or punctuation-only abbreviations (e.g., `Dr.` vs `Dr`, `J. Smith` vs `J Smith`), THE Extraction_Agent SHALL treat them as the same speaker and normalise all variations to the canonical form of the first occurrence of that name in the Transcript.
4. WHEN a Transcript contains both labeled and unlabeled lines, THE Extraction_Agent SHALL apply labeled extraction to labeled lines and fallback labeling to unlabeled lines, and IF a generated fallback Speaker_Label (e.g., `Speaker_1`) matches an existing labeled Speaker_Label, THEN THE Extraction_Agent SHALL offset the fallback sequence to the next unused integer to avoid collision before merging both sets into the output.
5. THE Extraction_Agent SHALL include all identified Speaker_Labels in the `participants` array of the MoM_Schema output.
6. IF no speaker labels of any kind can be identified in a Transcript, THEN THE Extraction_Agent SHALL assign the single label `Speaker_1` to the entire transcript body and include a warning entry in the `warnings` array of the MoM_Schema output indicating that no speaker labels were detected.

---

### Requirement 3: Department Affiliation Extraction

**User Story:** As a department head, I want each participant's department to be identified and recorded, so that action items and decisions can be routed to the correct teams.

#### Acceptance Criteria

1. WHEN a Transcript contains explicit department references associated with a speaker (e.g., `"Ahmad, IT Department"` or `"[Siti — Finance]"`), THE Extraction_Agent SHALL extract the department name and associate it with the corresponding Speaker_Label.
2. WHEN a Transcript contains implicit department signals (e.g., role titles or project names strongly associated with a department), THE Extraction_Agent SHALL infer the likely department and record it with a confidence flag of `"inferred"` in the MoM_Schema output.
3. WHEN a Transcript contains implicit department signals for a speaker and the same speaker also has an explicit department reference, THE Extraction_Agent SHALL use the explicit reference and SHALL NOT apply the `"inferred"` confidence flag for that speaker.
4. IF no department affiliation can be determined for a speaker, THEN THE Extraction_Agent SHALL set the department field for that speaker to `null` in the MoM_Schema output.
5. THE Extraction_Agent SHALL normalise department name variants (e.g., `"IT"`, `"I.T."`, `"Information Technology"`) to a single canonical department name using the Steering_Rules.
6. IF no canonical department name mapping exists in the Steering_Rules for an extracted department name variant, THEN THE Extraction_Agent SHALL record the department name as extracted without normalisation and SHALL set the confidence flag to `"unresolved"`.
7. THE Extraction_Agent SHALL include the department affiliation (or `null`) for every entry in the `participants` array of the MoM_Schema output.

---

### Requirement 4: Agenda Item Extraction

**User Story:** As a meeting facilitator, I want all agenda topics discussed during the meeting to be captured, so that participants have a clear record of what was covered.

#### Acceptance Criteria

1. WHEN a Transcript contains explicit agenda markers (e.g., `"Agenda 1:"`, `"Perkara 1:"`, `"Next item:"`, `"Moving on to"`), THE Extraction_Agent SHALL extract the text immediately following each marker up to the next agenda marker (or end of Transcript) as a distinct Agenda_Item with a confidence flag of `"explicit"`.
2. WHEN a Transcript contains no explicit agenda markers but semantic analysis identifies 2 or more topically distinct segments, THE Extraction_Agent SHALL infer one Agenda_Item per distinct segment and record each with a confidence flag of `"inferred"`.
3. THE Extraction_Agent SHALL preserve the sequential order of Agenda_Items as they appear in the Transcript.
4. WHEN a Formal_Decision or Action_Item can be associated with a parent Agenda_Item based on surrounding Transcript context, THE Extraction_Agent SHALL record that association.
5. IF a Formal_Decision or Action_Item cannot be associated with a parent Agenda_Item, THEN THE Extraction_Agent SHALL set the agenda item association field to `null` for that item.
6. IF a Transcript contains fewer than 2 topically distinct segments after semantic analysis and no explicit agenda markers, THEN THE Extraction_Agent SHALL record a single Agenda_Item of `"General Discussion"` with a confidence flag of `"inferred"` and log a warning that no structured agenda was detected.
7. THE Extraction_Agent SHALL include all extracted Agenda_Items in the `agenda_items` array of the MoM_Schema output.

---

### Requirement 5: Formal Decision Extraction

**User Story:** As a meeting stakeholder, I want all formal decisions reached during the meeting to be explicitly recorded, so that there is an unambiguous record of agreed outcomes.

#### Acceptance Criteria

1. WHEN a Transcript contains explicit decision markers (e.g., `"Diputuskan"`, `"It was decided"`, `"We agreed"`, `"Resolution:"`, `"Setuju"`), THE Extraction_Agent SHALL extract the associated statement as a Formal_Decision and record it with a confidence flag of `"explicit"`.
2. WHEN a Transcript contains implicit decision language, defined as a statement where two or more speakers express agreement on a specific course of action or outcome without using a formal decision marker, THE Extraction_Agent SHALL extract the statement as a Formal_Decision and record it with a confidence flag of `"inferred"`.
3. IF the Speaker_Label of the person who stated a Formal_Decision can be determined from the Transcript, THEN THE Extraction_Agent SHALL associate that Formal_Decision with the identified Speaker_Label; otherwise THE Extraction_Agent SHALL set the speaker attribution field to `null`.
4. IF a Formal_Decision can be associated with a parent Agenda_Item based on the surrounding Transcript context, THEN THE Extraction_Agent SHALL record that association; otherwise THE Extraction_Agent SHALL set the agenda item association field to `null`.
5. IF a Transcript contains no statements that can be classified as Formal_Decisions, THEN THE Extraction_Agent SHALL set the `decisions` array to an empty array `[]` in the MoM_Schema output.
6. THE Extraction_Agent SHALL include all extracted Formal_Decisions in the `decisions` array of the MoM_Schema output.

---

### Requirement 6: Action Item Extraction

**User Story:** As a project manager, I want all action items — including their assignees and deadlines — to be extracted from the meeting transcript, so that follow-up tasks are tracked and distributed automatically.

#### Acceptance Criteria

1. WHEN a Transcript contains explicit action item language (e.g., `"Action:"`, `"TODO:"`, `"Please prepare"`, `"Sila hantar"`, `"will send"`, `"to submit by"`), THE Extraction_Agent SHALL extract the task description (maximum 500 characters), the assigned Speaker_Label, and the deadline as an Action_Item.
2. WHEN an Action_Item contains a deadline expressed as a relative date (e.g., `"by next Friday"`, `"dalam 2 minggu"`), THE Extraction_Agent SHALL resolve the relative date against the meeting date extracted from the Transcript or file metadata and record the absolute ISO 8601 date in the `deadline` field.
3. IF the meeting date cannot be determined from the Transcript or file metadata, THEN THE Extraction_Agent SHALL set the `deadline` field to `null`, set the `deadline_status` field to `"unresolvable"`, and log a warning that relative dates could not be resolved.
4. IF a deadline cannot be identified for an Action_Item, THEN THE Extraction_Agent SHALL set the `deadline` field to `null` and set the `deadline_status` field to `"missing"` in the MoM_Schema output.
5. IF an assignee cannot be attributed to an Action_Item, THEN THE Extraction_Agent SHALL set the `assignee` field to `null` and set the `assignee_status` field to `"unresolved"` in the MoM_Schema output.
6. WHEN an Action_Item can be associated with a parent Agenda_Item based on surrounding Transcript context, THE Extraction_Agent SHALL record that association.
7. IF an Action_Item cannot be associated with a parent Agenda_Item, THEN THE Extraction_Agent SHALL set the agenda item association field to `null` for that Action_Item.
8. THE Extraction_Agent SHALL include all extracted Action_Items in the `action_items` array of the MoM_Schema output.
9. IF a Transcript contains no extractable Action_Items, THEN THE Extraction_Agent SHALL set the `action_items` array to `[]` in the MoM_Schema output.

---

### Requirement 7: Code-Switching Handling

**User Story:** As a multilingual meeting participant, I want the pipeline to correctly interpret mixed Bahasa Melayu, English, and Manglish speech, so that no meaning is lost due to language boundaries.

#### Acceptance Criteria

1. WHEN a Transcript contains a Code_Switch within a single utterance, THE Normaliser SHALL process the entire utterance as a single semantic unit without splitting it at language boundaries, preserving all tokens from the original utterance in the output.
2. THE Normaliser SHALL recognise Manglish pragmatic particles including "lah", "mah", "lor", "kan", "boleh ke", and "tak boleh", and retain their pragmatic function in the normalised output rather than discarding them as noise.
3. WHEN extracting Agenda_Items, Formal_Decisions, or Action_Items from a Code_Switch utterance, THE Normaliser SHALL produce output text in English by translating or paraphrasing Bahasa Melayu and Manglish segments, such that the extracted English text conveys the same intent as the original mixed-language utterance.
4. THE Extraction_Agent SHALL use Steering_Rules to guide extraction of decision and action keywords specific to Bahasa Melayu formal register (e.g., `"Diputuskan"`, `"Dicadangkan"`) and Manglish informal register (e.g., `"ok la we go with"`, `"settle already"`), mapping them to the same extraction outcome as their English equivalents.
5. IF the Normaliser cannot determine a single unambiguous English interpretation for a Code_Switch segment, THEN THE Extraction_Agent SHALL retain the original mixed-language text in a `raw_text` field alongside the normalised output and set the `normalisation_confidence` field to `"low"`.
6. THE Normaliser SHALL classify utterances containing Bahasa Melayu formal register markers (e.g., `"Diputuskan bahawa"`) and Bahasa Melayu or Manglish informal register markers (e.g., `"ok kita agree la"`) into the same Agenda_Item, Formal_Decision, or Action_Item categories, producing equivalent classification outcomes for semantically equivalent content regardless of register.
7. IF a Code_Switch utterance contains a Bahasa Melayu or Manglish segment for which no English equivalent can be derived, THEN THE Normaliser SHALL retain the untranslatable segment verbatim in the output and set the `normalisation_confidence` field to `"low"`.

---

### Requirement 8: Unlabeled Speaker Handling

**User Story:** As a meeting administrator, I want the pipeline to handle transcripts that lack speaker labels, so that extraction still produces useful output even when diarization is absent.

#### Acceptance Criteria

1. WHEN a Transcript contains no speaker labels, THE Extraction_Agent SHALL assign sequential Speaker_Labels (`Speaker_1`, `Speaker_2`, …) based on paragraph or sentence-level speaker-change heuristics defined in the Steering_Rules, assigning a new label only when a heuristic confidence score meets or exceeds the threshold defined in the Steering_Rules.
2. WHEN the Extraction_Agent assigns a fallback Speaker_Label, THE Output_Writer SHALL include a `"label_source": "inferred"` field for that participant entry in the MoM_Schema output.
3. IF two distinct paragraphs in an unlabeled Transcript are assigned the same Speaker_Label and a heuristic confidence score for speaker continuity falls below the threshold defined in the Steering_Rules, THEN THE Extraction_Agent SHALL split those paragraphs into separate Speaker_Labels rather than merging them.
4. WHEN a Transcript is entirely unlabeled, THE Extraction_Agent SHALL attempt extraction of all Agenda_Items, Formal_Decisions, and Action_Items using inferred speaker attribution, and SHALL include at least one participant entry with an inferred Speaker_Label in the MoM_Schema output when the Transcript contains at least one parseable segment.
5. IF speaker-change heuristics cannot distinguish any speaker boundaries in an unlabeled Transcript, THEN THE Extraction_Agent SHALL assign all text to `Speaker_1`, set `"label_source": "inferred"` for that entry, and record a warning in the `warnings` array of the MoM_Schema output indicating that no speaker boundaries were detected.
6. IF the Steering_Rules do not define a speaker-change heuristic or confidence threshold required for unlabeled Transcript processing, THEN THE Extraction_Agent SHALL abort speaker inference, assign all text to `Speaker_1`, and record an error in the `warnings` array of the MoM_Schema output indicating the missing configuration.

---

### Requirement 9: JSON Output

**User Story:** As a downstream integration engineer, I want the extracted meeting data to be saved as a validated, schema-compliant JSON file, so that the Dispatch_Bridge and other consumers can reliably parse and process it.

#### Acceptance Criteria

1. WHEN extraction completes successfully, THE Output_Writer SHALL write the structured result to `data/extracted_mom.json`, overwriting any previously existing file at that path.
2. THE Output_Writer SHALL validate the output object against the MoM_Schema before writing; IF validation fails, THEN THE Output_Writer SHALL log a schema validation error with the specific field violations and SHALL NOT overwrite the existing `data/extracted_mom.json`.
3. THE MoM_Schema SHALL include, at minimum, the following top-level fields: `schema_version` (string, semver), `meeting_id` (string, UUID v4), `meeting_date` (string, format `YYYY-MM-DD`), `source_file` (string, absolute path), `participants` (array of objects each containing at minimum `label` and `department` fields), `agenda_items` (array), `decisions` (array), `action_items` (array of objects each containing at minimum `description`, `assignee`, `deadline`, `deadline_status`, and `assignee_status` fields), `extraction_metadata` (object).
4. THE MoM_Schema `extraction_metadata` object SHALL include: `extracted_at` (ISO 8601 timestamp in UTC, format `YYYY-MM-DDTHH:MM:SSZ`), `pipeline_version` (string matching semver pattern `MAJOR.MINOR.PATCH`), `language_detected` (array of BCP 47 language code strings, minimum 1 item), `warnings` (array of strings), `rules_version` (string), `token_usage` (object).
5. WHEN writing `data/extracted_mom.json`, THE Output_Writer SHALL perform an atomic write (write to a temporary file then rename) to ensure the file is never partially written; THE output SHALL be UTF-8 encoded and pretty-printed with 2-space indentation.
6. IF the `data/` directory does not exist at write time, THEN THE Output_Writer SHALL create it before writing the file.
7. THE Output_Writer SHALL include a `schema_version` field at the root of the JSON output containing a semver string to enable future backward-compatible schema evolution.
8. IF the Output_Writer encounters a file system write error or rename failure during the atomic write, THEN THE Output_Writer SHALL log the error with the OS error code, remove the temporary file if it exists, and SHALL NOT trigger the Dispatch_Bridge.

---

### Requirement 10: Dispatch Bridge

**User Story:** As an enterprise operations administrator, I want extracted meeting data to be automatically dispatched to the Amazon Quick Automate webhook and/or ingested into the Amazon Quick Space, so that enterprise formatting and participant task distribution happen without manual steps.

> **Dual Delivery Path Architecture:** The Dispatch Bridge supports two complementary downstream handoff mechanisms, both of which may be used together or independently depending on the deployment context:
>
> - **(a) Programmatic HTTP Dispatch** — `scripts/dispatch_quick.py` issues an HTTP POST directly to the configured OpenAPI/webhook endpoint (`QUICK_AUTOMATE_WEBHOOK_URL`), conforming to the Amazon Quick Automate OpenAPI contract. This path is suited for event-driven server-side invocation and is the primary integration path for automated pipeline runs.
>
> - **(b) Amazon Quick Space File-Based Ingestion** — `data/extracted_mom.json` is uploaded to the `MoM-Pipeline-Ingestion` Quick Space via the `MoM_File` card, which triggers the associated `Example Flow` within Amazon Quick Flows. This path is suited for manual verification runs, operator-initiated ingestion, and cases where the webhook endpoint is unavailable. The upload may be performed manually or via `scripts/upload_to_space.py`.

#### Acceptance Criteria

1. WHEN `data/extracted_mom.json` exists on disk, is readable, and parses as valid JSON conforming to the MoM payload structure, THE Dispatch_Bridge SHALL issue an HTTP POST request to the configured Webhook_Endpoint with the JSON payload as the request body and a `Content-Type: application/json` header.
2. THE Dispatch_Bridge SHALL read the Webhook_Endpoint URL exclusively from the environment variable `QUICK_AUTOMATE_WEBHOOK_URL`; IF the variable is absent or empty at startup, THEN THE Dispatch_Bridge SHALL log a configuration error and exit with a non-zero exit code without making any HTTP request.
3. WHEN the Webhook_Endpoint returns an HTTP 2xx response, THE Dispatch_Bridge SHALL log a success message including the HTTP status code and the `meeting_id` from the dispatched payload.
4. IF the Webhook_Endpoint returns an HTTP 4xx response, THEN THE Dispatch_Bridge SHALL log an error with the status code and response body, and SHALL NOT retry the request.
5. IF the Webhook_Endpoint returns an HTTP 5xx response or the connection times out, THEN THE Dispatch_Bridge SHALL retry the request up to 3 times with exponential backoff (2s, 4s, 8s), logging each retry attempt with the attempt number and elapsed time.
6. IF all retry attempts are exhausted without a successful 2xx response, THEN THE Dispatch_Bridge SHALL log a final failure message including the `meeting_id`, the number of attempts made, and the last HTTP status code or error, and SHALL exit with a non-zero exit code.
7. THE Dispatch_Bridge SHALL enforce a per-request connection and read timeout of 30 seconds on the HTTP POST.
8. IF `data/extracted_mom.json` does not exist or cannot be read at dispatch time, THEN THE Dispatch_Bridge SHALL log a file-not-found or read error and exit with a non-zero exit code without making any HTTP request.
9. WHEN building the POST payload, THE Dispatch_Bridge SHALL omit any JSON field whose value is `null` unless that field is designated as required in the MoM payload schema; required fields SHALL be transmitted even when their value is `null`.
10. WHEN `data/extracted_mom.json` is uploaded to the `MoM-Pipeline-Ingestion` Quick Space via the `MoM_File` card, THE pipeline operator SHALL verify that the associated `Example Flow` is triggered within Amazon Quick Flows and that the flow processes the uploaded file without error. This file-based ingestion path is considered validated when the flow execution log confirms receipt and processing of the `meeting_id` contained in the uploaded JSON.

---

### Requirement 11: Token Efficiency

**User Story:** As a system operator, I want LLM prompts used during extraction to be structured for minimal token consumption, so that operating costs remain predictable and latency is kept low.

#### Acceptance Criteria

1. THE Extraction_Agent SHALL structure all LLM prompts according to the token-efficiency rules defined in the Steering_Rules, including concise instruction phrasing, structured output directives, and avoidance of redundant context.
2. WHEN a Transcript does not exceed the configurable token limit (default: 12,000 tokens; maximum configurable value: 100,000 tokens), THE Extraction_Agent SHALL use a single consolidated LLM call for the full extraction rather than separate calls per extraction task.
3. WHEN a Transcript exceeds the configurable token limit, THE Extraction_Agent SHALL split the Transcript into overlapping chunks with a minimum 200-token overlap, process each chunk independently, and merge results by retaining unique items and discarding exact duplicates across chunks; IF a single chunk would exceed the model's context window, THE Extraction_Agent SHALL apply further sub-chunking rather than truncating any segment.
4. THE Extraction_Agent SHALL include only the Transcript content and the system instructions required to produce the structured MoM output in each LLM call.
5. THE Extraction_Agent SHALL NOT include full conversation history, prior extraction results, or any context unrelated to the current Transcript in extraction prompts.
6. THE Extraction_Agent SHALL log the estimated input token count and the reported output token count for each LLM call to `extraction_metadata.token_usage` in the MoM_Schema output.

---

### Requirement 12: Error Handling

**User Story:** As a system operator, I want the pipeline to handle all foreseeable failure modes gracefully, so that a single bad transcript or a transient network failure does not corrupt state or halt the system.

#### Acceptance Criteria

1. WHEN a Transcript file is detected to be empty (zero bytes), THE Ingestion_Hook SHALL skip extraction, log a warning that includes the file name, and resume watching for new Transcript files without exiting.
2. WHEN a Transcript is classified as a Near_Empty_Transcript (fewer than 50 usable words), THE Extraction_Agent SHALL attempt extraction, record a `"near_empty": true` flag in `extraction_metadata`, set all extraction arrays to `[]`, and log a warning that includes the file name and the usable word count.
3. IF the Extraction_Agent receives a response from the LLM that is not valid JSON or is missing required top-level extraction fields, THEN THE Extraction_Agent SHALL retry the LLM call once with an identical prompt; IF the second attempt also produces an invalid or incomplete response, THEN THE Extraction_Agent SHALL log the error, write a partial MoM_Schema with `"extraction_status": "failed"`, and not invoke the Dispatch_Bridge for that Transcript.
4. IF the Output_Writer encounters a file system write error when saving `data/extracted_mom.json`, THEN THE Output_Writer SHALL log the error with the OS error code and SHALL NOT trigger the Dispatch_Bridge.
5. IF the Dispatch_Bridge cannot reach the Webhook_Endpoint due to DNS resolution failure or network unavailability, THEN THE Dispatch_Bridge SHALL log the connectivity error and SHALL exit with a non-zero exit code without retrying.
6. WHEN any unhandled exception propagates to the top-level Pipeline error handler, THE Pipeline SHALL log the exception type, message, and stack trace to a dedicated error log, and SHALL update the `extraction_metadata.extraction_status` field to `"error"` in the output file if that file already exists on disk.
7. THE Pipeline SHALL NOT allow an error in one Transcript's processing to prevent the Ingestion_Hook from processing subsequently queued Transcripts.

---

### Requirement 13: Steering Rules

**User Story:** As a pipeline maintainer, I want extraction heuristics and LLM behavioural rules to be centralised in a steering file, so that the pipeline's behaviour can be updated without modifying core code.

#### Acceptance Criteria

1. WHEN an extraction run starts, THE Extraction_Agent SHALL load the rules defined in `.kiro/steering/mom-rules.md` and apply them before processing any transcript input.
2. THE Steering_Rules file SHALL define, at minimum: a keyword list of 1–200 decision markers in Bahasa Melayu, a keyword list of 1–200 decision markers in English, a keyword list of 1–200 action item markers in Bahasa Melayu, a keyword list of 1–200 action item markers in English, speaker-change heuristics for unlabeled transcripts, department name canonical mappings, and LLM prompt templates for extraction tasks.
3. WHEN `.kiro/steering/mom-rules.md` is absent at extraction start, THE Extraction_Agent SHALL log a critical warning indicating the file path was not found, apply built-in default rules, and proceed with the extraction run.
4. WHEN `.kiro/steering/mom-rules.md` is present but contains a parsing error, THE Extraction_Agent SHALL log an error message indicating the affected line number, apply built-in default rules, and continue extraction.
5. THE Steering_Rules file SHALL include a `rules_version` field as the first field of the file containing a non-empty string value; WHEN an extraction run completes, THE Extraction_Agent SHALL record the loaded `rules_version` value in the `extraction_metadata` of the output.
6. IF a parsed Steering_Rule value conflicts with a hard-coded pipeline constraint, THEN THE Extraction_Agent SHALL apply the hard-coded pipeline constraint and log a warning identifying the conflicting rule name and the constraint that takes precedence.

---

### Requirement 14: Architecture Decoupling & Target State

**User Story:** As a solutions architect, I want the extraction service to run fully independently of the Kiro desktop application, so that the pipeline can be migrated to a cloud-native AWS deployment without re-engineering core logic.

> **Design Principle:** Kiro serves as the **Phase 1 Prompt Engineering and Schema Validation Workbench** — it is the environment in which extraction prompts are authored, steering rules are refined, and the JSON schema is validated against real transcript fixtures. Kiro is NOT a runtime dependency for production execution. From Phase 2 onward, the prompt engineering artefacts (`.kiro/steering/mom-rules.md`) are ported to Amazon Bedrock and execution is orchestrated by AWS Lambda and S3 event triggers.

#### Acceptance Criteria

1. THE extraction service (encompassing deduplication check, LLM-backed extraction, schema validation, and atomic JSON write) SHALL be fully invocable as a standalone process via `python scripts/run_pipeline.py [transcript_path]` without any Kiro IDE process, agent session, or desktop hook being active.
2. THE standalone runner SHALL accept a transcript file path as its primary argument and SHALL execute the complete pipeline sequence — deduplication check → extraction → schema validation → atomic write to `data/extracted_mom.json` — as a single deterministic CLI command with a zero exit code on success and a non-zero exit code on any failure.
3. THE pipeline MUST NOT import, depend on, or communicate with any Kiro IDE API, VS Code extension host, or agent session runtime component. All runtime dependencies SHALL be expressible as standard Python package requirements in `requirements.txt`.
4. WHEN the pipeline is operating in headless mode (i.e., invoked via `scripts/run_pipeline.py` rather than via a Kiro Hook), the deduplication registry, output file, and dispatch behaviour SHALL be identical to hook-triggered execution; no behavioural differences are permitted between the two invocation paths.
5. THE steering rules defined in `.kiro/steering/mom-rules.md` SHALL be structured such that they can be ported verbatim or with minimal transformation to an Amazon Bedrock system prompt, enabling Phase 2 migration without loss of extraction fidelity.
6. THE cloud migration target state is defined as follows:
   - **Phase 1 (Current):** Kiro IDE — prompt engineering workbench, local extraction via Python scripts, Amazon Quick Flows via webhook or Quick Space file upload.
   - **Phase 2:** Amazon Bedrock (Claude 3.5 Sonnet / Amazon Nova) replaces the Kiro LLM extraction call; steering rules ported to Bedrock system prompt; pipeline orchestration moves to AWS Lambda triggered by S3 `ObjectCreated` events.
   - **Phase 3 (MOTAC Production):** Full AWS-native architecture — S3 transcript ingestion, Lambda extraction, DynamoDB deduplication registry, Amazon Quick Flows triggered via SDK handoff; Kiro desktop is no longer involved in any runtime path.
7. THE extraction service architecture SHALL maintain a clean boundary between the **Tier 1 Standalone Extraction Service** (deduplication, LLM parsing, schema validation, atomic JSON write — executable locally or as a Lambda function) and the **Tier 2 Enterprise Orchestration Layer** (Amazon Quick Flows triggered via Quick Space `MoM-Pipeline-Ingestion` file upload or direct SDK handoff), such that either tier can be upgraded, replaced, or redeployed independently.

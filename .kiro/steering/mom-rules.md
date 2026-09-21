---
rules_version: "1.0.0"
inclusion: auto
name: MoM Extraction Rules
description: Steering rules for the MoM Automation Pipeline extraction agent. Activated automatically when processing transcript files or running extraction tasks.
---

# MoM Extraction Steering Rules

This file governs the behaviour of the MoM Automation Pipeline extraction agent.
It is loaded at the start of every extraction run. Changes here take effect immediately
on the next run without requiring code changes.

If this file is absent or unparseable, the pipeline falls back to built-in defaults
and logs a critical warning. The `rules_version` field must remain the first field in
the front-matter and must be a non-empty string.

---

## 1. Decision Markers

Keywords that signal a formal decision was reached. The extraction agent treats any
match (case-insensitive) as a trigger to extract the surrounding statement as a
`Formal_Decision` with `confidence: "explicit"`.

### 1.1 Bahasa Melayu Decision Markers

diputuskan, dicadangkan, dipersetujui, diluluskan, disepakati,
bersetuju, setuju, maka diputuskan, dengan ini diputuskan,
semua bersetuju, undi diluluskan, resolusi, ditetapkan,
diambil keputusan, keputusan telah dibuat, diakui, disahkan

### 1.2 English Decision Markers

it was decided, we agreed, agreed, resolved, resolution,
decision made, it was resolved, approved, consensus reached,
unanimously agreed, signed off, confirmed, ratified,
it is agreed, the team has decided, officially approved, endorsed

### 1.3 Manglish / Informal Markers

ok la we go with, settle already, confirm lah, ok lah we do,
agreed la, done deal, all agree, go ahead lah,
we go with this lah, confirmed already, ok la like that,
everyone agree, boleh la, ok we decide

### 1.4 Exploratory / Vendor Demonstration Decision Rule
In exploratory walkthroughs, software demos, or informal stakeholder meetings where no formal voting occurs:
- Extract working consensus, agreed operational guidelines, and agreed trial parameters (e.g., agreeing to use masked dummy data, selecting file format targets, individual user account setups) as valid items in `decisions`.

---

## 2. Action Item Markers

Keywords that signal an actionable task has been assigned. The extraction agent treats
any match (case-insensitive) as a trigger to extract description, assignee, and deadline
as an `Action_Item`.

### 2.1 Bahasa Melayu Action Markers

sila hantar, tolong sediakan, mohon kemukakan, kena buat,
akan hantar, akan sediakan, akan kemukakan, perlu buat,
dalam masa, sebelum, menjelang, bawa kepada, siapkan,
tolong buat, kena siapkan, perlu hantar, wajib submit,
perlu kemukakan, sila sediakan, perlu selesaikan

### 2.2 English Action Markers

action:, todo:, please prepare, will send, to submit by,
responsible for, follow up on, will arrange, needs to,
should prepare, action item:, assigned to, will complete,
to be done by, please ensure, please send, you need to,
take note to, please arrange, must complete by, due by,
deadline is, to be submitted, to be prepared

### 2.3 Manglish / Informal Markers

kena hantar, kena buat, kena settle, will do la, gonna send,
settle by, send by, check with, follow up la, do by,
you do this lah, i will send lah, kena submit, hantar by,
settle this, buat by, done by when, who handle this

### 2.4 Action Item Structure & Formatting

The extraction agent must output each object in `action_items` with the following structure:
- `action_id`: string (e.g., "ACT-001")
- `description`: string
- `assignee`: string
- `assignee_status`: "confirmed" | "unconfirmed" | "unassigned"
- `department_ref`: canonical department matching the assignee (e.g., "Human Resources", "Procurement", "Information Technology"), or null if undetermined
- `priority`: "high" | "medium" | "low" (mark as "high" for contract awards, strict legal deadlines, or blocking dependencies; "medium" for standard deliverables; "low" for informal follow-ups)
- `deadline`: "YYYY-MM-DD" or null
- `deadline_status`: "explicit" | "relative_to_receipt" | "unresolvable"
- `trigger_marker`: string
- `agenda_item_ref`: integer

### 2.5 Exploratory / Next-Step Action Items
In walkthrough or POC trial discussions, extract operational next steps as `action_items`:
- Tasks such as preparing dummy template tables, internal fine-tuning experiments, organizing user training/immersion sessions, and scheduling commercial follow-ups must be captured with their respective assignees and deadlines.

---

## 3. Speaker-Change Heuristics (Unlabeled Transcripts)

Used when a transcript contains no `SpeakerName:` or `[SpeakerName]` labels.
The agent applies these heuristics in order of precedence and assigns a new
`Speaker_N` label only when confidence meets or exceeds `confidence_threshold`.

```
confidence_threshold: 0.65
```

Heuristics applied in order of precedence:

1. **Explicit label match** (`SpeakerName:` or `[SpeakerName]` prefix detected) → confidence **1.0**
2. **Paragraph break** (blank line separating blocks of text) → confidence **0.75**
3. **Contrastive pronoun shift** (`"I"` → `"you"`, `"we"` → `"they"` between adjacent segments) → confidence **0.70**
4. **Topic shift** (semantic dissimilarity between consecutive sentences) → confidence **0.68**
5. **Sentence-initial discourse marker** from a new paragraph (`"Okay,"`, `"So,"`, `"Right,"`, `"Alright,"`) → confidence **0.65**

If no heuristic reaches `confidence_threshold`, assign all text to `Speaker_1` and
record a warning in `extraction_metadata.warnings`.

---

## 4. Department Canonical Mappings

Maps extracted department name variants to canonical department names used in the
`participants[*].department` field of the MoM_Schema output.

Lookup is case-insensitive. If a variant is not found in this table, record the
name as extracted and set `department_confidence: "unresolved"`.

| Variant(s) | Canonical Name |
|---|---|
| IT, I.T., i.t., Info Tech, Information Technology, IT Dept, IT Department, Teknologi Maklumat, Tech, Bahagian Pengurusan Maklumat, BPM, MIS, ICT | Information Technology |
| Finance, Kewangan, Accounts, Accounting, Perakaunan, CFO Office, Finance Dept, Finance Department, Bahagian Kewangan, Akaun, Treasury, Perbendaharaan, Tax, Cukai | Finance |
| HR, H.R., Human Resources, Sumber Manusia, BSM, Bahagian Sumber Manusia, People & Culture, People Operations, HR Department, Talent, Talent Acquisition, Modal Insan, HCM | Human Resources |
| Procurement, Perolehan, Bahagian Perolehan, Purchasing, Sourcing, Buyer, Procurement Dept, Procurement Department, Pembelian, Kontrak & Perolehan, Tender Board | Procurement |
| Operations, Ops, Operasi, Operations Management, Operations Dept, Operations Department, Bahagian Operasi, COO Office | Operations |
| Supply Chain, Rantaian Bekalan, Logistics, Logistik, Warehouse, Pergudangan, Inventory, Pengurusan Inventori, Fulfilment, Dispatch, Shipping | Supply Chain & Logistics |
| Sales, Jualan, Bahagian Jualan, Business Development, BD, Commercial, Komersial, Account Management, Revenue, CRO Office | Sales & Business Development |
| Marketing, Pemasaran, Comms, Communications, Brand, Marketing Department, Bahagian Pemasaran, Komunikasi Korporat, Corporate Communications, Corp Comms, Public Relations, PR, Media Relations | Marketing & Communications |
| Customer Service, CS, Khidmat Pelanggan, Customer Support, Layanan Pelanggan, Helpdesk, Customer Experience, CX, Client Services | Customer Experience |
| Legal, Undang-undang, Compliance, Pematuhan, Legal & Compliance, Legal Dept, Legal Department, Bahagian Undang-undang, Penasihat Undang-undang, Regulatory Affairs, Syariah, Shariah Compliance | Legal & Compliance |
| Risk Management, Pengurusan Risiko, Risk, Enterprise Risk, Audit, Audit Dalaman, Internal Audit, Bahagian Audit, Governance, Integriti, Integrity & Governance Unit, IGU | Risk & Governance |
| Executive, Exec, C-Suite, Management, Pengurusan, Senior Leadership, BOD, Board of Directors, Lembaga Pengarah, Pejabat Pengarah, Director's Office, MD Office, CEO Office | Executive |
| Engineering, Kejuruteraan, R&D, Research & Development, Product Engineering, Engineering Dept, Penyelidikan & Pembangunan, Technical, Teknikal, Maintenance, Penyelenggaraan | Engineering & Maintenance |
| Product, Pengurusan Produk, Product Management, Product Design, UI/UX, Design, Reka Bentuk | Product |
| Project Management, PMO, Pejabat Pengurusan Projek, Pengurusan Projek, Project Delivery, Programme Management | Project Management Office |
| Quality Assurance, QA, QC, Kawalan Kualiti, Jaminan Kualiti, Quality Management, QMS, Safety, Keselamatan & Kesihatan, HSE, EHS, OSH | Quality & Safety |
| Strategy, Strategi, Corporate Strategy, Perancangan Korporat, Strategic Planning, Corporate Planning, Transformation, PMO Transformasi | Corporate Strategy |

---

## 5. LLM Prompt Templates

These templates are assembled by the extraction agent for each LLM call.
Placeholders in `{{double_braces}}` are substituted at runtime.

### 5.1 System Prompt Template

```
SYSTEM:
You are a professional meeting minutes extraction engine specialised in multilingual
Malaysian workplace communication (Bahasa Melayu, English, Manglish code-switching).

Your task is to extract structured meeting data from the provided transcript segment.
Follow the extraction rules in RULES exactly.
Respond ONLY with a valid JSON object conforming to the OUTPUT_SCHEMA.
Do not include any explanation, markdown fencing, or commentary outside the JSON object.

RULES:
{{steering_rules_content}}

OUTPUT_SCHEMA:
{{mom_schema_json}}
```

**Placeholder sources:**

| Placeholder | Source |
|---|---|
| `{{steering_rules_content}}` | Contents of this file (`.kiro/steering/mom-rules.md`), loaded at extraction start |
| `{{mom_schema_json}}` | Inline MoM_Schema definition — kept to ≤300 tokens; omit descriptions and examples |

### 5.2 User Prompt Template

```
USER:
TRANSCRIPT_SEGMENT:
{{transcript_text}}

MEETING_DATE_HINT: {{meeting_date_or_null}}
SOURCE_FILE: {{absolute_file_path}}
CHUNK_INDEX: {{chunk_index}} of {{total_chunks}}

Extract all participants, agenda items, decisions, and action items from the above segment.
Resolve relative dates against MEETING_DATE_HINT if provided.
```

**Placeholder sources:**

| Placeholder | Source |
|---|---|
| `{{transcript_text}}` | Raw transcript segment (or full transcript for a single-call extraction) |
| `{{meeting_date_or_null}}` | Date extracted from filename prefix `YYYYMMDD_HHMMSS` or from transcript content; `null` if undetermined |
| `{{absolute_file_path}}` | Absolute path of the source `.txt` file |
| `{{chunk_index}}` | Current chunk number (1-indexed); use `1` for single-call extractions |
| `{{total_chunks}}` | Total number of chunks; use `1` for single-call extractions |

### 5.3 Chunk Continuation Prompt (chunks 2+)

For chunk calls after the first, omit `{{mom_schema_json}}` from the system prompt
and replace the schema block with:

```
OUTPUT_SCHEMA: (same schema as chunk 1 — output must conform to the same structure)
```

This avoids repeating the full schema on every chunk call, reducing token usage.

---

## 6. Token Efficiency Rules

These rules govern how the extraction agent constructs LLM prompts to minimise
token consumption and operating cost.

- Use **structured output mode** (JSON mode) where supported by the model provider to
  avoid wasting output tokens on prose around the JSON object.
- The **system prompt must not exceed 800 tokens** including the `OUTPUT_SCHEMA` block.
  Use the condensed schema reference for chunks 2+ (see Section 5.3).
- **Do not repeat the full schema** on every chunk call — reference it by name for chunks 2+.
- **Omit chain-of-thought or explanation requests** from the prompt. Do not include
  phrases like "Think step by step" or "Explain your reasoning".
- Use **concise instruction verbs**: `Extract`, `Identify`, `List`, `Classify` — not
  "Please carefully analyse and provide a detailed explanation of..."
- **Do not include conversation history** or prior extraction results in any prompt.
  Each LLM call is self-contained.
- **Do not include unrelated context** (e.g., earlier transcript files, user preferences,
  session history) in extraction prompts.
- **Concise Agenda Summaries**: Keep each agenda item summary strictly between 2 to 3 executive sentences. Do not write lengthy conversational paragraphs in summaries.
- **Output Priority**: Prioritise full completion of `decisions` and `action_items` arrays over verbose text descriptions.

---

## 7. Near-Empty Threshold

If a transcript's usable word count (after stripping whitespace and punctuation) falls
below this threshold, the extraction agent sets `extraction_metadata.near_empty: true`,
sets all extraction arrays to `[]`, sets `extraction_status: "partial"`, and logs a
warning with the file name and word count.

```
near_empty_word_threshold: 50
```

---

## 8. Chunking Configuration

Controls how the extraction agent splits transcripts that exceed the token limit.

```
default_token_limit: 12000
max_token_limit: 100000
min_chunk_overlap_tokens: 200
```

- **`default_token_limit`**: Transcripts with token count ≤ this value are processed in
  a single consolidated LLM call.
- **`max_token_limit`**: Upper bound for user-configured token limits. The agent rejects
  configuration values above this.
- **`min_chunk_overlap_tokens`**: Minimum number of tokens retained at each chunk
  boundary to preserve cross-boundary context. The agent back-steps by this amount when
  splitting transcript tokens into chunks.

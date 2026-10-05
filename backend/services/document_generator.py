# backend/services/document_generator.py
"""
Generates official PKPA Bil. 2/1991-compliant meeting minutes documents.

Exports:
    generate_docx(meeting)  → bytes   (Word .docx)
    generate_official_mom_html(meeting) → str  (legacy HTML, kept for compatibility)
"""

import io
from pathlib import Path
from typing import Any, Dict

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Pt, Cm, RGBColor

from backend.services.formatter import format_malay_date

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


def format_localized_date(date_str: str | None) -> str:
    """
    Converts any recognisable date value to long-form Malay text.

    Handles:
      - ISO dates:       "2026-11-12"   → "12 November 2026"
      - Slash dates:     "12/11/2026"   → "12 November 2026"
      - Already-text:    "12 November 2026" → returned as-is
      - None / empty:    ""             → "-"
    """
    if not date_str or not str(date_str).strip():
        return "-"

    s = str(date_str).strip()

    # Already long-form (contains a letter) — return as-is
    if any(c.isalpha() for c in s):
        return s

    # Normalise slash/dot separators to hyphens
    normalised = s.replace("/", "-").replace(".", "-")
    parts = normalised.split("-")

    if len(parts) == 3:
        try:
            a, b, c = [int(x) for x in parts]
            # Detect format by magnitude:
            # YYYY-MM-DD: first part is a 4-digit year (> 31)
            if a > 31:
                iso = f"{a:04d}-{b:02d}-{c:02d}"
            # DD-MM-YYYY: last part is a 4-digit year (> 31)
            elif c > 31:
                iso = f"{c:04d}-{b:02d}-{a:02d}"
            # Ambiguous (all parts ≤ 31) — assume ISO order
            else:
                iso = f"{a:04d}-{b:02d}-{c:02d}"
            result = format_malay_date(iso)
            return result if result and result != iso else iso
        except (ValueError, TypeError):
            pass

    # Final fallback — pass raw string directly
    result = format_malay_date(normalised)
    return result if result and result != normalised else s

# ── Colour palette ────────────────────────────────────────────────────────────
NAVY      = RGBColor(0x1b, 0x3a, 0x5b)   # #1b3a5b
LIGHT_GRAY = "D9D9D9"                      # table header fill (hex, no #)
DECISION_BG = "EBF5EB"                     # pale green for keputusan callout


# ── Low-level helpers ─────────────────────────────────────────────────────────

def _set_cell_bg(cell, hex_color: str):
    """Fills a table cell with a solid background colour."""
    tc = cell._tc
    tcp = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"),   "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"),  hex_color)
    tcp.append(shd)


def _para_spacing(para, before_pt: int = 0, after_pt: int = 0):
    pPr = para._p.get_or_add_pPr()
    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:before"), str(before_pt * 20))
    spacing.set(qn("w:after"),  str(after_pt  * 20))
    pPr.append(spacing)


def _add_section_heading(doc: Document, number: str, title: str):
    """Adds a bold, navy-coloured section heading (e.g. '1.0  SENARAI KEHADIRAN')."""
    p = doc.add_paragraph()
    _para_spacing(p, before_pt=14, after_pt=4)
    run = p.add_run(f"{number}  {title}")
    run.bold      = True
    run.font.size = Pt(11)
    run.font.color.rgb = NAVY


def _add_table_header_row(table, headers: list[str], col_widths_cm: list[float]):
    """Formats the first row of a table as a shaded header."""
    hdr_row = table.rows[0]
    for i, (cell, hdr, w) in enumerate(zip(hdr_row.cells, headers, col_widths_cm)):
        cell.width = Cm(w)
        cell.text  = hdr
        _set_cell_bg(cell, LIGHT_GRAY)
        para = cell.paragraphs[0]
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
        run = para.runs[0] if para.runs else para.add_run(hdr)
        run.bold      = True
        run.font.size = Pt(9)


# ── Public API ────────────────────────────────────────────────────────────────

def generate_docx(meeting: Dict[str, Any]) -> bytes:
    """
    Renders a PKPA Bil. 2/1991 formatted meeting-minutes Word document.

    Returns the .docx file as raw bytes ready to be streamed to the browser.
    """
    doc = Document()

    # ── Page margins ──────────────────────────────────────────────────────────
    for section in doc.sections:
        section.top_margin    = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin   = Cm(3.0)
        section.right_margin  = Cm(2.5)

    # ── Default body font ─────────────────────────────────────────────────────
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(11)

    # ════════════════════════════════════════════════════════════════════════
    # TITLE BLOCK
    # ════════════════════════════════════════════════════════════════════════
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _para_spacing(title_para, after_pt=2)
    t_run = title_para.add_run("MINIT MESYUARAT")
    t_run.bold      = True
    t_run.font.size = Pt(14)
    t_run.font.color.rgb = NAVY

    meeting_title = (meeting.get("meeting_title") or "").strip()
    if meeting_title:
        sub_para = doc.add_paragraph()
        sub_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _para_spacing(sub_para, after_pt=2)
        s_run = sub_para.add_run(meeting_title.upper())
        s_run.bold      = True
        s_run.font.size = Pt(12)

    meeting_number = (meeting.get("meeting_number") or "").strip()
    # Compute fallback: Bil. 1/<year> from the meeting date when number is absent
    if not meeting_number:
        raw_date = (meeting.get("date") or meeting.get("meeting_date") or "").strip()
        year = raw_date[:4] if len(raw_date) >= 4 else ""
        meeting_number = f"1/{year}" if year else ""
    if meeting_number:
        num_para = doc.add_paragraph()
        num_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _para_spacing(num_para, after_pt=8)
        num_para.add_run(f"Bilangan: {meeting_number}")

    # ── Divider ───────────────────────────────────────────────────────────────
    hr = doc.add_paragraph()
    _para_spacing(hr, after_pt=6)
    hr_run = hr.add_run("─" * 80)
    hr_run.font.color.rgb = NAVY
    hr_run.font.size = Pt(7)

    # ════════════════════════════════════════════════════════════════════════
    # MEETING DETAILS
    # ════════════════════════════════════════════════════════════════════════
    details = [
        ("Tarikh",    format_localized_date(meeting.get("date"))),
        ("Masa",      f"{meeting.get('start_time') or '-'}  –  {meeting.get('end_time') or '-'}"),
        ("Tempat",    meeting.get("location")         or "-"),
        ("Pengerusi", _person_str(meeting, "chairperson_name", "chairperson_role")),
        ("Pencatat",  _person_str(meeting, "secretary_name",   "secretary_role")),
    ]
    dt = doc.add_table(rows=len(details), cols=3)
    dt.style = "Table Grid"
    # Remove all borders — plain metadata layout
    _remove_table_borders(dt)
    for row, (label, value) in zip(dt.rows, details):
        row.cells[0].width = Cm(3.5)
        row.cells[1].width = Cm(0.5)
        row.cells[2].width = Cm(13.0)
        row.cells[0].text = label
        row.cells[1].text = ":"
        row.cells[2].text = value or "-"
        for cell in row.cells:
            for para in cell.paragraphs:
                para.paragraph_format.space_before = Pt(1)
                para.paragraph_format.space_after  = Pt(1)
        _bold_cell(row.cells[0])

    doc.add_paragraph()  # spacer

    # ════════════════════════════════════════════════════════════════════════
    # 1.0  SENARAI KEHADIRAN
    # ════════════════════════════════════════════════════════════════════════
    participants = meeting.get("participants") or []
    _add_section_heading(doc, "1.0", "SENARAI KEHADIRAN")

    if participants:
        headers    = ["Bil.", "Nama", "Jawatan", "Organisasi / Bahagian", "Status Kehadiran"]
        col_widths = [1.0,    4.5,    4.0,        4.5,                      3.0]
        tbl = doc.add_table(rows=len(participants) + 1, cols=5)
        tbl.style = "Table Grid"
        tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
        _add_table_header_row(tbl, headers, col_widths)

        for i, p in enumerate(participants, start=1):
            row = tbl.rows[i]
            row.cells[0].text = str(i)
            row.cells[1].text = _pval(p, "name",  "label")
            row.cells[2].text = _pval(p, "jawatan", "position", "role")
            row.cells[3].text = _pval(p, "organisation", "department")
            row.cells[4].text = p.get("status") or "Hadir"
            for j, cell in enumerate(row.cells):
                cell.width = Cm(col_widths[j])
                for para in cell.paragraphs:
                    para.paragraph_format.space_before = Pt(1)
                    para.paragraph_format.space_after  = Pt(1)
                    para.runs[0].font.size = Pt(10) if para.runs else None
            row.cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            row.cells[4].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    else:
        _italic_placeholder(doc, "Tiada rekod kehadiran.")

    doc.add_paragraph()

    # ════════════════════════════════════════════════════════════════════════
    # 2.0  PERKARA BERBANGKIT  (optional)
    # ════════════════════════════════════════════════════════════════════════
    matters = (meeting.get("matters_arising") or "").strip()
    section_offset = 0
    if matters:
        section_offset = 1
        _add_section_heading(doc, "2.0", "PERKARA BERBANGKIT")
        p = doc.add_paragraph(matters)
        _para_spacing(p, after_pt=6)
        p.runs[0].font.size = Pt(11)
        doc.add_paragraph()

    # ════════════════════════════════════════════════════════════════════════
    # N.0  PERKARA-PERKARA DIBINCANGKAN
    # ════════════════════════════════════════════════════════════════════════
    agenda_items = meeting.get("agenda_items") or []
    discussion_num = f"{2 + section_offset}.0"
    _add_section_heading(doc, discussion_num, "PERKARA-PERKARA DIBINCANGKAN")

    if agenda_items:
        for idx, ag in enumerate(agenda_items, start=1):
            ag_title   = (ag.get("title")    or "").strip()
            ag_summary = (ag.get("summary")  or "").strip()
            ag_decision= (ag.get("decision") or "").strip()

            # Sub-heading: N.1  Tajuk Perkara
            sub = doc.add_paragraph()
            _para_spacing(sub, before_pt=8, after_pt=2)
            sub_run = sub.add_run(f"{2 + section_offset}.{idx}  {ag_title}")
            sub_run.bold      = True
            sub_run.font.size = Pt(11)

            # Discussion body
            if ag_summary:
                body = doc.add_paragraph(ag_summary)
                _para_spacing(body, after_pt=4)
                body.paragraph_format.left_indent = Cm(0.75)
                body.runs[0].font.size = Pt(11)

            # Keputusan / Ketetapan callout
            if ag_decision:
                kp = doc.add_paragraph()
                _para_spacing(kp, before_pt=4, after_pt=6)
                kp.paragraph_format.left_indent = Cm(0.75)
                label_run = kp.add_run("Keputusan / Ketetapan:  ")
                label_run.bold      = True
                label_run.font.size = Pt(11)
                label_run.font.color.rgb = RGBColor(0x05, 0x62, 0x27)
                decision_run = kp.add_run(ag_decision)
                decision_run.font.size = Pt(11)
    else:
        _italic_placeholder(doc, "Tiada perkara perbincangan direkodkan.")

    doc.add_paragraph()

    # ════════════════════════════════════════════════════════════════════════
    # N.0  MATRIKS TINDAKAN SUSULAN
    # ════════════════════════════════════════════════════════════════════════
    action_items = meeting.get("action_items") or []
    action_num = f"{3 + section_offset}.0"
    _add_section_heading(doc, action_num, "MATRIKS TINDAKAN SUSULAN")

    if action_items:
        headers    = ["Bil.", "Tindakan",  "Tanggungjawab", "Tarikh Akhir", "Status"]
        col_widths = [1.0,    7.5,          4.0,              2.5,            2.0]
        atbl = doc.add_table(rows=len(action_items) + 1, cols=5)
        atbl.style = "Table Grid"
        atbl.alignment = WD_TABLE_ALIGNMENT.LEFT
        _add_table_header_row(atbl, headers, col_widths)

        for i, item in enumerate(action_items, start=1):
            row = atbl.rows[i]
            row.cells[0].text = str(i)
            row.cells[1].text = item.get("task")     or ""
            row.cells[2].text = item.get("assignee") or "Belum Ditetapkan"
            row.cells[3].text = format_localized_date(item.get("deadline"))
            row.cells[4].text = item.get("status")   or "Belum Mula"
            for j, cell in enumerate(row.cells):
                cell.width = Cm(col_widths[j])
                for para in cell.paragraphs:
                    para.paragraph_format.space_before = Pt(1)
                    para.paragraph_format.space_after  = Pt(1)
                    if para.runs:
                        para.runs[0].font.size = Pt(10)
            row.cells[0].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            row.cells[3].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            row.cells[4].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    else:
        _italic_placeholder(doc, "Tiada tindakan susulan direkodkan.")

    doc.add_paragraph()

    # ════════════════════════════════════════════════════════════════════════
    # SIGNATURE BLOCK
    # ════════════════════════════════════════════════════════════════════════
    sig_spacer = doc.add_paragraph()
    _para_spacing(sig_spacer, before_pt=24)

    sig_tbl = doc.add_table(rows=4, cols=2)
    _remove_table_borders(sig_tbl)
    sig_tbl.columns[0].width = Cm(8.5)
    sig_tbl.columns[1].width = Cm(8.5)

    signatories = [
        ("Pengerusi",      _person_str(meeting, "chairperson_name", "chairperson_role")),
        ("Pencatat Minit", _person_str(meeting, "secretary_name",   "secretary_role")),
    ]

    # Row 0 — blank (signature space)
    for col in range(2):
        sig_tbl.rows[0].cells[col].text = " "
        sig_tbl.rows[0].cells[col].paragraphs[0].paragraph_format.space_before = Pt(40)

    # Row 1 — underline (simulated with paragraph border)
    for col in range(2):
        cell = sig_tbl.rows[1].cells[col]
        p = cell.paragraphs[0]
        p.add_run("_" * 45)
        for run in p.runs:
            run.font.color.rgb = RGBColor(0xAA, 0xAA, 0xAA)
            run.font.size = Pt(10)

    # Row 2 — name
    for col, (_, full_str) in enumerate(signatories):
        cell = sig_tbl.rows[2].cells[col]
        cell.text = full_str or "( )"
        for run in cell.paragraphs[0].runs:
            run.bold = True
            run.font.size = Pt(11)

    # Row 3 — role label (Pengerusi / Pencatat Minit)
    for col, (label, _) in enumerate(signatories):
        cell = sig_tbl.rows[3].cells[col]
        cell.text = label
        for run in cell.paragraphs[0].runs:
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    # ── Serialise to bytes ────────────────────────────────────────────────────
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


# ── Private helpers ───────────────────────────────────────────────────────────

def _person_str(meeting: dict, name_key: str, role_key: str) -> str:
    name = (meeting.get(name_key) or "").strip()
    role = (meeting.get(role_key) or "").strip()
    if name and role:
        return f"{name}  ({role})"
    return name or role or "-"


def _pval(obj: dict, *keys: str) -> str:
    for k in keys:
        v = (obj.get(k) or "").strip()
        if v:
            return v
    return ""


def _bold_cell(cell):
    for para in cell.paragraphs:
        for run in para.runs:
            run.bold = True
            run.font.size = Pt(11)


def _italic_placeholder(doc: Document, text: str):
    p = doc.add_paragraph()
    _para_spacing(p, after_pt=4)
    p.paragraph_format.left_indent = Cm(0.5)
    run = p.add_run(text)
    run.italic    = True
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)


def _remove_table_borders(tbl):
    """Strips all visible borders from a table (for metadata / signature blocks)."""
    tbl_pr = tbl._tbl.tblPr
    if tbl_pr is None:
        tbl_pr = OxmlElement("w:tblPr")
        tbl._tbl.insert(0, tbl_pr)
    tbl_borders = OxmlElement("w:tblBorders")
    for border_name in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement(f"w:{border_name}")
        b.set(qn("w:val"),   "none")
        b.set(qn("w:sz"),    "0")
        b.set(qn("w:space"), "0")
        b.set(qn("w:color"), "auto")
        tbl_borders.append(b)
    tbl_pr.append(tbl_borders)


# ── Legacy HTML export (kept for backwards compatibility) ─────────────────────

def generate_official_mom_html(meeting: Dict[str, Any]) -> str:
    """Renders the official government MoM HTML layout (legacy, print/PDF use)."""
    date_formatted = format_malay_date(meeting.get("date", ""))

    action_rows = ""
    for idx, item in enumerate(meeting.get("action_items", []), start=1):
        action_rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding:10px 8px;vertical-align:top;text-align:center;width:40px;">{idx}.</td>
            <td style="padding:10px 8px;vertical-align:top;"><strong>{item.get('task','')}</strong></td>
            <td style="padding:10px 8px;vertical-align:top;width:180px;">{item.get('assignee','Belum Ditetapkan')}</td>
            <td style="padding:10px 8px;vertical-align:top;width:110px;text-align:center;">{item.get('deadline','-')}</td>
        </tr>"""

    return f"""<!DOCTYPE html><html lang="ms"><head><meta charset="UTF-8">
<title>Minit Mesyuarat - {meeting.get('meeting_title','Rasmi')}</title>
<style>
  body{{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;color:#111;margin:40px}}
  h1{{font-size:14pt;text-align:center;text-transform:uppercase;margin-bottom:4px}}
  .meta-table{{width:100%;border-collapse:collapse;margin-bottom:20px}}
  .meta-table td{{padding:4px 6px;font-size:11pt}}
  .actions-table{{width:100%;border-collapse:collapse;margin-top:15px}}
  .actions-table th{{background:#f3f4f6;border-top:1px solid #111;border-bottom:1px solid #111;padding:8px;font-size:10pt;text-transform:uppercase}}
  @media print{{body{{margin:20mm}}.no-print{{display:none}}}}
</style></head><body>
<div class="no-print" style="margin-bottom:20px;text-align:right;">
  <button onclick="window.print()" style="padding:6px 14px;background:#1b3a5b;color:#fff;border:none;cursor:pointer;border-radius:4px;">Cetak / Simpan PDF</button>
</div>
<h1>{meeting.get('meeting_title','MINIT MESYUARAT')}</h1>
<h2 style="font-size:12pt;text-align:center;font-weight:normal">BILANGAN: {meeting.get('meeting_number','1')}</h2>
<table class="meta-table">
  <tr><td style="width:15%;font-weight:bold">Tarikh</td><td>:</td><td>{date_formatted}</td></tr>
  <tr><td style="font-weight:bold">Masa</td><td>:</td><td>{meeting.get('start_time','-')} - {meeting.get('end_time','-')}</td></tr>
  <tr><td style="font-weight:bold">Tempat</td><td>:</td><td>{meeting.get('location','-')}</td></tr>
  <tr><td style="font-weight:bold">Pengerusi</td><td>:</td><td>{meeting.get('chairperson_name','-')} ({meeting.get('chairperson_role','-')})</td></tr>
</table>
<hr style="border:0;border-top:1px solid #999;margin:16px 0"/>
<h3 style="font-size:12pt;text-transform:uppercase;margin-bottom:8px">Tindakan dan Keputusan Mesyuarat</h3>
<table class="actions-table">
  <thead><tr><th style="text-align:center">Bil</th><th>Perkara / Tindakan</th><th>Tindakan Oleh</th><th style="text-align:center">Tarikh Akhir</th></tr></thead>
  <tbody>{action_rows or '<tr><td colspan="4" style="text-align:center;padding:12px">Tiada tindakan direkodkan.</td></tr>'}</tbody>
</table></body></html>"""

# backend/services/document_generator.py
from pathlib import Path
from typing import Dict, Any
from backend.services.formatter import format_malay_date

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

def generate_official_mom_html(meeting: Dict[str, Any]) -> str:
    """Renders the official government MoM formatted layout."""
    date_formatted = format_malay_date(meeting.get("date", ""))
    
    action_rows = ""
    for idx, item in enumerate(meeting.get("action_items", []), start=1):
        action_rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 8px; vertical-align: top; text-align: center; width: 40px;">{idx}.</td>
            <td style="padding: 10px 8px; vertical-align: top;">
                <strong>{item.get('task', '')}</strong>
            </td>
            <td style="padding: 10px 8px; vertical-align: top; width: 180px;">
                {item.get('assignee', 'Belum Ditetapkan')}
            </td>
            <td style="padding: 10px 8px; vertical-align: top; width: 110px; text-align: center;">
                {item.get('deadline', '-')}
            </td>
        </tr>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="ms">
<head>
    <meta charset="UTF-8">
    <title>Minit Mesyuarat - {meeting.get('meeting_title', 'Rasmi')}</title>
    <style>
        body {{ font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #111; margin: 40px; }}
        h1 {{ font-size: 14pt; text-align: center; text-transform: uppercase; margin-bottom: 4px; }}
        h2 {{ font-size: 12pt; text-align: center; font-weight: normal; margin-top: 0; margin-bottom: 24px; }}
        .meta-table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
        .meta-table td {{ padding: 4px 6px; font-size: 11pt; }}
        .actions-table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
        .actions-table th {{ background-color: #f3f4f6; border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 8px; text-align: left; font-size: 10pt; text-transform: uppercase; }}
        @media print {{
            body {{ margin: 20mm; }}
            .no-print {{ display: none; }}
        }}
    </style>
</head>
<body>
    <div class="no-print" style="margin-bottom: 20px; text-align: right;">
        <button onclick="window.print()" style="padding: 6px 14px; background: #1b3a5b; color: #fff; border: none; cursor: pointer; border-radius: 4px;">Cetak / Simpan PDF</button>
    </div>

    <h1>{meeting.get('meeting_title', 'MINIT MESYUARAT')}</h1>
    <h2>BILANGAN: {meeting.get('meeting_number', '1')}</h2>

    <table class="meta-table">
        <tr>
            <td style="width: 15%; font-weight: bold;">Tarikh</td>
            <td style="width: 2%;">:</td>
            <td>{date_formatted}</td>
        </tr>
        <tr>
            <td style="font-weight: bold;">Masa</td>
            <td>:</td>
            <td>{meeting.get('start_time', '-')} - {meeting.get('end_time', '-')}</td>
        </tr>
        <tr>
            <td style="font-weight: bold;">Tempat</td>
            <td>:</td>
            <td>{meeting.get('location', '-')}</td>
        </tr>
        <tr>
            <td style="font-weight: bold;">Pengerusi</td>
            <td>:</td>
            <td>{meeting.get('chairperson_name', '-')} ({meeting.get('chairperson_role', '-')})</td>
        </tr>
    </table>

    <hr style="border: 0; border-top: 1px solid #999; margin: 16px 0;" />

    <h3 style="font-size: 12pt; text-transform: uppercase; margin-bottom: 8px;">Tindakan dan Keputusan Mesyuarat</h3>
    <table class="actions-table">
        <thead>
            <tr>
                <th style="text-align: center;">Bil</th>
                <th>Perkara / Tindakan</th>
                <th>Tindakan Oleh</th>
                <th style="text-align: center;">Tarikh Akhir</th>
            </tr>
        </thead>
        <tbody>
            {action_rows if action_rows else '<tr><td colspan="4" style="text-align:center; padding: 12px;">Tiada tindakan direkodkan.</td></tr>'}
        </tbody>
    </table>
</body>
</html>"""
    return html_content
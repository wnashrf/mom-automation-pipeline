import React, { useState, useRef, useEffect } from 'react';

const SESSION_KEY = 'mom_transcript_id';

// ─── Template definitions ────────────────────────────────────────────────────
const TEMPLATES = {
  standard: {
    id: 'standard',
    label: 'Templat Biasa (Standard Kerajaan)',
    badge: 'Templat biasa akan digunakan',
    badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    preview: [
      { level: 'title',   text: 'MINIT MESYUARAT' },
      { level: 'title',   text: '[TAJUK MESYUARAT]' },
      { level: 'meta',    text: 'Bil. [NOMBOR SIRI]/[TAHUN]' },
      { level: 'meta',    text: 'Tarikh  :  _______________' },
      { level: 'meta',    text: 'Masa    :  _______________' },
      { level: 'meta',    text: 'Tempat  :  _______________' },
      { level: 'meta',    text: 'Pengerusi :  _______________' },
      { level: 'divider', text: '' },
      { level: 'meta',    text: 'Kehadiran :' },
      { level: 'item',    text: '1.   _______________' },
      { level: 'item',    text: '2.   _______________' },
      { level: 'divider', text: '' },
      { level: 'heading', text: '1.   PERUTUSAN PENGERUSI' },
      { level: 'heading', text: '2.   [TAJUK PERKARA / AGENDA]' },
      { level: 'heading', text: '3.   PENGESAHAN MINIT MESYUARAT LEPAS' },
      { level: 'heading', text: '4.   PERKARA-PERKARA BERBANGKIT' },
      { level: 'heading', text: '5.   TINDAKAN SUSULAN' },
    ],
  },
  custom: {
    id: 'custom',
    label: 'Templat Khusus',
    badge: 'Templat khusus akan digunakan',
    badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    preview: [],
  },
};

// ─── Standard skeleton renderer ───────────────────────────────────────────────
function StandardPreview({ rows }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-4 font-mono text-[11px] leading-6 text-gray-600 select-none overflow-hidden">
      {rows.map((row, i) => {
        if (row.level === 'divider')
          return <div key={i} className="my-1.5 border-t border-dashed border-gray-300" />;
        if (row.level === 'title')
          return <p key={i} className="font-black text-[#1b3a5b] tracking-wide">{row.text}</p>;
        if (row.level === 'heading')
          return <p key={i} className="font-bold text-gray-700 mt-0.5">{row.text}</p>;
        if (row.level === 'meta')
          return <p key={i} className="text-gray-500">{row.text}</p>;
        return <p key={i} className="pl-4 text-gray-400">{row.text}</p>;
      })}
    </div>
  );
}

// ─── Template Preview Block ────────────────────────────────────────────────────
// customTemplateText: string | null  — the loaded custom template content
// onUploadCustom: () => void          — triggers the file-input click
function TemplatePreview({ template, customTemplateText, onUploadCustom }) {
  // Standard template — always show the skeleton
  if (template.id !== 'custom') {
    return <StandardPreview rows={template.preview} />;
  }

  // Custom template with content loaded — show it as plain preformatted text
  if (customTemplateText) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-5 py-4 font-mono text-[11px] leading-6 text-gray-700 overflow-auto max-h-64 select-none whitespace-pre-wrap">
        {customTemplateText}
      </div>
    );
  }

  // Custom template, nothing uploaded yet — empty state with inline upload CTA
  return (
    <div className="rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50/30 px-6 py-8 text-center space-y-3">
      <p className="text-sm font-bold text-indigo-400 tracking-widest uppercase">
        [Tiada Templat Khusus Disimpan]
      </p>
      <p className="text-xs text-gray-500 max-w-sm mx-auto">
        Sila muat naik fail templat{' '}
        <span className="font-semibold text-gray-600">(.docx / .txt / .md)</span>{' '}
        organisasi anda atau pilih Templat Biasa di atas.
      </p>
      <button
        type="button"
        onClick={onUploadCustom}
        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
        </svg>
        + Muat Naik Templat
      </button>
    </div>
  );
}

export default function IngestView({ onExtracted, onBack }) {
  const [transcript, setTranscript] = useState('');
  const [fileStatus, setFileStatus] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [timeInfo, setTimeInfo] = useState('');
  const [selectedModel, setSelectedModel] = useState('base');
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('standard');
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  // Custom template text loaded by the user (null = nothing uploaded yet)
  const [customTemplateText, setCustomTemplateText] = useState(null);

  const fileInputRef         = useRef(null);
  const customTemplateRef    = useRef(null);   // hidden input for template upload

  // ── Restore transcript from sessionStorage on mount ─────────────────────
  useEffect(() => {
    const savedId = sessionStorage.getItem(SESSION_KEY);
    if (!savedId) return;
    fetch(`/api/transcript/${savedId}`)
      .then((res) => {
        if (!res.ok) { sessionStorage.removeItem(SESSION_KEY); return null; }
        return res.json();
      })
      .then((data) => {
        if (data?.transcript) {
          setTranscript(data.transcript);
          setFileStatus('Transkrip dipulihkan daripada sesi sebelumnya.');
        }
      })
      .catch(() => sessionStorage.removeItem(SESSION_KEY));
  }, []);

  // ── Custom template file upload ──────────────────────────────────────────
  const handleCustomTemplateUpload = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      setCustomTemplateText(text);
    } catch {
      alert('Gagal membaca fail templat.');
    }
  };

  // ── Audio / text transcript upload ──────────────────────────────────────
  const handleFileUpload = async (file) => {
    if (!file) return;

    if (file.name.endsWith('.txt')) {
      setFileStatus(`Membaca fail teks: ${file.name}...`);
      try {
        const text = await file.text();
        setTranscript(text);
        setFileStatus(`Fail teks dimuatkan: ${file.name}`);
      } catch (err) {
        alert('Gagal membaca fail teks: ' + err.message);
        setFileStatus('Ralat membaca fail.');
      }
      return;
    }

    setFileStatus(`Memproses audio dengan Whisper (${selectedModel}): ${file.name}`);
    setIsTranscribing(true);
    setProgressPct(0);
    setTimeInfo('');
    setTranscript('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model_size', selectedModel);

    try {
      const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Ralat memulakan penstriman audio.');

      const reader  = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.replace('data: ', '')); } catch { continue; }

          if (data.type === 'status' && data.stage === 'downloading') {
            setIsDownloadingModel(true);
            setFileStatus(data.message);
          } else if (data.type === 'progress') {
            setIsDownloadingModel(false);
            if (data.progress !== undefined) setProgressPct(data.progress);
            if (data.currentTime !== undefined)
              setTimeInfo(data.totalTime ? `${data.currentTime}s / ${data.totalTime}s` : `${data.currentTime}s`);
            const chunkText = (data.text || data.segment || '').trim();
            if (chunkText) setTranscript((prev) => prev ? `${prev}\n${chunkText}` : chunkText);
          } else if (data.type === 'complete') {
            setIsDownloadingModel(false);
            setProgressPct(100);
            setTranscript(data.transcript || data.full_transcript || '');
            setFileStatus(`Transkripsi siap sepenuhnya untuk: ${file.name}`);
            if (data.transcript_id) sessionStorage.setItem(SESSION_KEY, data.transcript_id);
          } else if (data.type === 'error') {
            setIsDownloadingModel(false);
            throw new Error(data.message);
          }
        }
      }
    } catch (err) {
      alert('Ralat transkripsi: ' + err.message);
      setFileStatus('Ralat pemprosesan audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // ── AI Extraction ────────────────────────────────────────────────────────
  const handleTriggerExtract = async () => {
    if (!transcript || !transcript.trim()) {
      alert('Sila pastikan teks transkrip sah dan tidak kosong.');
      return;
    }

    setIsExtracting(true);
    try {
      // Build the extract payload — include custom template text when available
      const extractPayload = { transcript, template_type: selectedTemplate };
      if (selectedTemplate === 'custom' && customTemplateText) {
        extractPayload.template_text = customTemplateText;
      }

      const res    = await fetch('/api/extract', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(extractPayload),
      });
      const result = await res.json();
      if (!res.ok || !result.data) throw new Error(result.detail || 'Gagal mengekstrak minit mesyuarat.');

      const data = result.data;
      const decisionsByAgenda = {};
      (data.decisions || []).forEach((d) => {
        const key = d.agenda_item_id || 'general';
        if (!decisionsByAgenda[key]) decisionsByAgenda[key] = [];
        decisionsByAgenda[key].push(d.statement);
      });

      const chairperson = data.chairperson || {};
      const secretary   = data.secretary   || {};
      const stableId    = `meet_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

      const formattedMeeting = {
        id: stableId,
        meeting_title: data.title
          || data.meeting_title
          || (data.agenda_items?.[0]?.title ? `Perbincangan: ${data.agenda_items[0].title}` : 'Mesyuarat Tanpa Tajuk'),
        meeting_number:   data.meeting_number || '',
        location:         data.venue          || data.location    || '',
        date:             data.date           || data.meeting_date || '',
        start_time:       data.start_time     || data.masa_mula   || '',
        end_time:         data.end_time       || data.masa_tamat  || '',
        chairperson_name: chairperson.name    || data.chairperson_name    || data.pengerusi_nama      || '',
        chairperson_role: chairperson.role    || data.chairperson_role    || data.pengerusi_jawatan   || '',
        secretary_name:   secretary.name      || data.secretary_name      || data.pencatat_nama       || '',
        secretary_role:   secretary.role      || data.secretary_role      || data.pencatat_jawatan    || '',
        participants: (data.participants || []).map((p) => ({
          name:         p.name         || p.label      || '',
          position:     p.jawatan      || p.position   || p.role || '',
          organisation: p.organisation || p.department || '',
          status:       p.status       || 'Hadir',
        })),
        agenda_items: (data.agenda_items || []).map((ag) => ({
          title:    ag.title   || '',
          summary:  ag.summary || '',
          decision: (decisionsByAgenda[ag.id] || []).join('\n• '),
        })),
        action_items: (data.action_items || []).map((item) => ({
          task:     item.description || item.task || '',
          assignee: item.assignee && item.assignee !== 'null' ? item.assignee : '',
          deadline: item.deadline  && item.deadline  !== 'null' ? item.deadline  : '',
          status:   item.status    || 'Belum Mula',
        })),
        raw_transcript: transcript,
      };

      // Immediately persist as Draf so navigating away never loses the record
      try {
        await fetch('/api/meetings/save', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            ...formattedMeeting,
            status: 'Draf',
            participants: formattedMeeting.participants.map((p) => ({
              name:         p.name         || '',
              jawatan:      p.position     || p.jawatan || '',
              organisation: p.organisation || '',
              status:       p.status       || 'Hadir',
              label:        p.name         || '',
              department:   p.organisation || '',
            })),
          }),
        });
      } catch (_) { /* non-blocking */ }

      onExtracted(formattedMeeting);
    } catch (err) {
      alert('Ralat pengekstrakan: ' + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Download transcript ──────────────────────────────────────────────────
  const downloadTranscript = (format) => {
    const filename = `transcript_${new Date().toISOString().slice(0, 10)}`;
    let content, mime, ext;

    if (format === 'txt') {
      content = transcript;
      mime    = 'text/plain';
      ext     = 'txt';

    } else if (format === 'json') {
      const segments = transcript
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, i) => ({ index: i + 1, text: line }));
      content = JSON.stringify({ transcript, segments }, null, 2);
      mime    = 'application/json';
      ext     = 'json';

    } else if (format === 'srt') {
      // Split into non-empty lines; assign 5-second windows per segment
      const lines = transcript.split('\n').map((l) => l.trim()).filter(Boolean);
      const toSrtTime = (sec) => {
        const h  = Math.floor(sec / 3600);
        const m  = Math.floor((sec % 3600) / 60);
        const s  = Math.floor(sec % 60);
        const ms = 0;
        return [
          String(h).padStart(2, '0'),
          String(m).padStart(2, '0'),
          String(s).padStart(2, '0'),
        ].join(':') + `,${String(ms).padStart(3, '0')}`;
      };
      const SEGMENT_DURATION = 5; // seconds per line
      content = lines
        .map((line, i) => {
          const start = i * SEGMENT_DURATION;
          const end   = start + SEGMENT_DURATION;
          return `${i + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${line}`;
        })
        .join('\n\n');
      mime = 'text/plain';
      ext  = 'srt';
    }

    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${filename}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <section className="space-y-6">

      {/* ── Card: Templat Format Minit ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-7">
        {/* Header */}
        <div className="mb-1">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-[#1b3a5b]">
            Templat Format Minit
          </h3>
          <div className="mt-1.5 h-0.5 bg-[#1b3a5b] rounded-full mb-5" />
        </div>

        {/* Controls row: dropdown + badge + toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1b3a5b]/30 focus:border-[#1b3a5b] transition-colors"
          >
            {Object.values(TEMPLATES).map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          {/* Status badge */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap ${TEMPLATES[selectedTemplate].badgeColor}`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {TEMPLATES[selectedTemplate].badge}
            {/* Show filename when a custom template is loaded */}
            {selectedTemplate === 'custom' && customTemplateText && (
              <span className="ml-1 text-indigo-400 font-normal">(dimuat)</span>
            )}
          </span>

          {/* Accordion toggle */}
          <button
            type="button"
            onClick={() => setShowTemplatePreview((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-semibold text-gray-600 transition-colors whitespace-nowrap"
          >
            Struktur Templat
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-300 ${showTemplatePreview ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Smooth accordion */}
        <div
          className={`grid transition-all duration-300 ease-in-out overflow-hidden ${
            showTemplatePreview
              ? 'grid-rows-[1fr] opacity-100 mt-4'
              : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
          }`}
        >
          <div className="min-h-0 space-y-3">
            <TemplatePreview
              template={TEMPLATES[selectedTemplate]}
              customTemplateText={customTemplateText}
              onUploadCustom={() => customTemplateRef.current?.click()}
            />

            {/* Footnote + replace button — only when custom is selected */}
            {selectedTemplate === 'custom' && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                <p className="flex-1 text-[11px] text-gray-400">
                  {customTemplateText
                    ? 'Templat khusus berjaya dimuatkan. Klik "Ganti" untuk menukar.'
                    : 'Tiada templat khusus disimpan. Anda boleh menambah templat khusus di bahagian \'Muat Turun Templat\' pada dashboard.'}
                </p>
                <button
                  type="button"
                  onClick={() => customTemplateRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  {customTemplateText ? 'Ganti Templat' : '+ Muat Naik Templat'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hidden file input for custom template */}
        <input
          type="file"
          ref={customTemplateRef}
          className="hidden"
          accept=".txt,.md,.docx"
          onChange={(e) => {
            if (e.target.files?.[0]) handleCustomTemplateUpload(e.target.files[0]);
            e.target.value = '';   // allow re-uploading the same file
          }}
        />
      </div>

      {/* ── Audio Dropzone & Configuration ──────────────────────────────── */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xs font-bold uppercase text-gray-700 mb-1">Muat Naik Dokumen / Audio Mesyuarat</h3>
            <p className="text-xs text-gray-500">
              Seret fail audio (MP3, WAV, M4A) atau teks. Enjin Whisper akan mentranskripsikannya secara tempatan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase text-gray-600">Model Whisper:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isTranscribing}
              className="text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-gray-50 text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="tiny">Tiny (~75MB - Sangat Pantas)</option>
              <option value="base">Base (~145MB - Pantas & Seimbang)</option>
              <option value="small">Small (~480MB - Standard)</option>
              <option value="large-v3-turbo">Large-v3-turbo (~1.6GB - Sangat Tepat)</option>
            </select>
          </div>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e)  => { e.preventDefault(); setIsDragging(true);  }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true);  }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
          }}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition duration-150 ${
            isDragging ? 'border-blue-500 bg-blue-50/80 scale-[1.01]' : 'border-gray-300 hover:border-blue-400 bg-gray-50'
          }`}
        >
          <svg
            className={`mx-auto h-10 w-10 mb-2 transition-transform duration-150 ${isDragging ? 'text-blue-600 scale-110' : 'text-gray-400'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className={`text-xs font-semibold ${isDragging ? 'text-blue-700' : 'text-gray-700'}`}>
            {isDragging ? 'Lepaskan fail di sini...' : isTranscribing ? 'Mentranskripsi fail audio...' : 'Klik atau seret fail ke sini'}
          </span>
          <p className="text-[10px] text-gray-400 mt-1">MP3, WAV, M4A, TXT</p>
          <input type="file" ref={fileInputRef} className="hidden" accept=".mp3,.wav,.m4a,.txt"
            onChange={(e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); }} />
        </div>

        {isDownloadingModel && (
          <div className="mt-3 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg flex items-center gap-3 text-xs animate-pulse">
            <svg className="animate-spin h-4 w-4 text-amber-700 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <div>
              <span className="font-bold">Memuat Turun Model Whisper:</span> Fail model Whisper ({selectedModel}) sedang dimuat turun ke komputer buat kali pertama. Sila tunggu sebentar (proses ini hanya berlaku sekali).
            </div>
          </div>
        )}

        {fileStatus && (
          <div className="mt-3 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-blue-700">{fileStatus}</span>
              {isTranscribing && (
                <span className="font-bold text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded text-[11px]">
                  {progressPct}% {timeInfo && `(${timeInfo})`}
                </span>
              )}
            </div>
            {isTranscribing && (
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out" style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Transcript + Extract ─────────────────────────────────────────── */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-xs font-bold uppercase text-gray-700 mb-1">Pengekstrak AI — Transkrip ke Minit</h3>
        <p className="text-xs text-gray-500 mb-3">Teks transkripsi langsung dipaparkan di sini atau tampal teks perbincangan.</p>

        <textarea
          rows={9}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded text-xs font-mono whitespace-pre-wrap focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="Transkrip teks perbincangan mesyuarat akan muncul di sini..."
        />

        <div className="flex justify-between items-center mt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setTranscript(''); sessionStorage.removeItem(SESSION_KEY); }}
              className="text-xs text-gray-500 hover:underline"
            >
              Kosongkan
            </button>

            {/* Download buttons — only shown when there is transcript text */}
            {transcript?.trim() && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase text-gray-400 tracking-widest mr-0.5">Muat turun:</span>

                {/* TXT */}
                <button
                  type="button"
                  onClick={() => downloadTranscript('txt')}
                  title="Muat turun sebagai teks biasa (.txt)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-[11px] font-semibold text-gray-600 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  TXT
                </button>

                {/* JSON */}
                <button
                  type="button"
                  onClick={() => downloadTranscript('json')}
                  title="Muat turun sebagai JSON (.json)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-[11px] font-semibold text-gray-600 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  JSON
                </button>

                {/* SRT */}
                <button
                  type="button"
                  onClick={() => downloadTranscript('srt')}
                  title="Muat turun sebagai subtitle (.srt)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-[11px] font-semibold text-gray-600 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  SRT
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleTriggerExtract}
            disabled={isExtracting || isTranscribing || !transcript?.trim()}
            className="bg-[#1b3a5b] hover:bg-blue-900 disabled:opacity-50 text-white text-xs font-semibold px-6 py-2.5 rounded shadow transition flex items-center gap-2"
          >
            {isExtracting && (
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {isExtracting ? 'Mengekstrak via Claude...' : 'Ekstrak dengan AI'}
          </button>
        </div>
      </div>
    </section>
  );
}

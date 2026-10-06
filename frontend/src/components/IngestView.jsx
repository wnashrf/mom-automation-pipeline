import { useState, useRef, useEffect, useCallback } from 'react';
import { CheckCircle2, ChevronDown, Download, Info, Sparkles, Upload } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import SectionHeader from './ui/SectionHeader';
import FormField from './ui/FormField';
import ProgressBar from './ui/ProgressBar';
import { useToast } from './ui/toastContext';
import { clampPercent, formatAudioProgress } from '../lib/progress';
import { buildErrorMessage } from '../lib/errors';
import { cx } from '../lib/cx';
import { T } from '../lib/terminology';

const SESSION_KEY = 'mom_transcript_id';
const S = T.ingest;

// ─── Template definitions ────────────────────────────────────────────────────
// Tag classes are complete static strings (Req 1.6); neutral/info tone, not a record status.
const TEMPLATES = {
  standard: {
    id: 'standard',
    label: S.templateStandard,
    tag: S.templateStandardTag,
    tagClass: 'border-neutral-border bg-neutral-bg text-neutral-fg',
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
    label: S.templateCustom,
    tag: S.templateCustomTag,
    tagClass: 'border-info-border bg-info-bg text-info-fg',
    preview: [],
  },
};

const WHISPER_MODELS = [
  { value: 'tiny', label: S.models.tiny },
  { value: 'base', label: S.models.base },
  { value: 'small', label: S.models.small },
  { value: 'large-v3-turbo', label: S.models.large },
];

// Stage keys drive both the visible stage label and the polite live region (Req 8.9).
const STAGE_LABEL = {
  'muat-turun-model': S.stages.downloading,
  mentranskripsi: S.stages.transcribing,
  selesai: S.stages.transcribed,
  ralat: S.stages.transcribeFailed,
  mengekstrak: S.stages.extracting,
  'ekstrak-selesai': S.stages.extracted,
  'ekstrak-ralat': S.stages.extractFailed,
};

// Dropzone colours: drag state changes border/background colour only, no scale (Req 2.6).
const DROPZONE_BASE = 'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ease-standard';
const DROPZONE_IDLE = 'border-neutral-500 bg-neutral-50 hover:border-primary hover:bg-primary-subtle cursor-pointer';
const DROPZONE_ACTIVE = 'border-primary bg-primary-subtle cursor-copy';
const DROPZONE_BUSY = 'border-neutral-300 bg-neutral-100 cursor-not-allowed';

const PREVIEW_ROW_CLASS = {
  title: 'font-semibold text-primary tracking-wide',
  heading: 'font-semibold text-neutral-900 mt-0.5',
  meta: 'text-neutral-700',
  item: 'pl-4 text-neutral-600',
};

// ─── Standard skeleton renderer ───────────────────────────────────────────────
function StandardPreview({ rows }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4 font-mono text-xs leading-relaxed select-none">
      {rows.map((row, i) =>
        row.level === 'divider' ? (
          <div key={i} className="my-1.5 border-t border-dashed border-neutral-300" />
        ) : (
          <p key={i} className={PREVIEW_ROW_CLASS[row.level] ?? PREVIEW_ROW_CLASS.item}>{row.text}</p>
        ),
      )}
    </div>
  );
}

// ─── Template Preview Block ────────────────────────────────────────────────────
// customTemplateText: string | null  — the loaded custom template content
// onUploadCustom: () => void          — triggers the file-input click
function TemplatePreview({ template, customTemplateText, onUploadCustom }) {
  if (template.id !== 'custom') {
    return <StandardPreview rows={template.preview} />;
  }

  if (customTemplateText) {
    return (
      <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4 font-mono text-xs leading-relaxed text-neutral-900">
        {customTemplateText}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-neutral-700">{S.templateEmptyTitle}</p>
      <p className="mx-auto max-w-sm text-xs text-neutral-600">{S.templateEmptyDescription}</p>
      <Button size="sm" icon={Upload} onClick={onUploadCustom}>
        {S.templateUpload}
      </Button>
    </div>
  );
}

// `onBack` is still passed by App.jsx; this view does not render a back control.
export default function IngestView({ onExtracted }) {
  const toast = useToast();

  const [transcript, setTranscript] = useState('');
  const [transcriptError, setTranscriptError] = useState('');
  const [fileStatus, setFileStatus] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Progress is stored as raw numbers; formatting happens at render (Req 8.2, 8.3).
  const [progressPct, setProgressPct] = useState(0);
  const [currentTime, setCurrentTime] = useState(null);
  const [totalTime, setTotalTime] = useState(null);
  const [selectedModel, setSelectedModel] = useState('base');
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('standard');
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  // Custom template text loaded by the user (null = nothing uploaded yet)
  const [customTemplateText, setCustomTemplateText] = useState(null);
  // Current stage key + polite announcement text (changes only on stage transitions).
  const [stage, setStage] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const stageRef          = useRef(null);
  const fileInputRef      = useRef(null);
  const customTemplateRef = useRef(null);   // hidden input for template upload

  const dropHintId = 'ingest-dropzone-formats';
  const templatePanelId = 'ingest-template-structure';

  // Update stage and live-region text only when the stage actually changes,
  // so percentage updates never trigger an announcement (Req 8.9).
  const enterStage = useCallback((next) => {
    if (stageRef.current === next) return;
    stageRef.current = next;
    setStage(next);
    setAnnouncement(STAGE_LABEL[next] ?? '');
  }, []);

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
          setFileStatus(S.restored);
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
    } catch (err) {
      toast.error(buildErrorMessage(T.ops.templateRead, err?.message));
    }
  };

  // ── Audio / text transcript upload ──────────────────────────────────────
  const handleFileUpload = async (file) => {
    if (!file) return;

    if (file.name.endsWith('.txt')) {
      setFileStatus(S.readingText(file.name));
      try {
        const text = await file.text();
        setTranscript(text);
        setTranscriptError('');
        setFileStatus(S.textLoaded(file.name));
        toast.success(T.success.loadFile(file.name));
      } catch (err) {
        toast.error(buildErrorMessage(T.ops.loadFile, err?.message));
        setFileStatus(S.readFailed);
      }
      return;
    }

    setFileStatus(S.processingAudio(selectedModel, file.name));
    setIsTranscribing(true);
    setProgressPct(0);
    setCurrentTime(null);
    setTotalTime(null);
    setTranscript('');
    setTranscriptError('');
    enterStage('mentranskripsi');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model_size', selectedModel);

    try {
      const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(S.streamStartFailed);

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
            if (data.message) setFileStatus(data.message);
            enterStage('muat-turun-model');
          } else if (data.type === 'progress') {
            setIsDownloadingModel(false);
            enterStage('mentranskripsi');
            if (data.progress !== undefined) setProgressPct(Number(data.progress));
            if (data.currentTime !== undefined) setCurrentTime(Number(data.currentTime));
            if (data.totalTime !== undefined) setTotalTime(data.totalTime ? Number(data.totalTime) : null);
            const chunkText = (data.text || data.segment || '').trim();
            if (chunkText) setTranscript((prev) => prev ? `${prev}\n${chunkText}` : chunkText);
          } else if (data.type === 'complete') {
            setIsDownloadingModel(false);
            setProgressPct(100);
            setTranscript(data.transcript || data.full_transcript || '');
            setFileStatus(S.transcribeDone(file.name));
            if (data.transcript_id) sessionStorage.setItem(SESSION_KEY, data.transcript_id);
            enterStage('selesai');
            toast.success(T.success.transcribe);
          } else if (data.type === 'error') {
            setIsDownloadingModel(false);
            throw new Error(data.message);
          }
        }
      }
    } catch (err) {
      setIsDownloadingModel(false);
      enterStage('ralat');
      toast.error(buildErrorMessage(T.ops.transcribe, err?.message));
      setFileStatus(S.transcribeFailedStatus);
    } finally {
      setIsTranscribing(false);
    }
  };

  const openFilePicker = () => {
    if (isTranscribing) return;
    fileInputRef.current?.click();
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isTranscribing) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (isTranscribing) return;
    if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
  };

  // ── AI Extraction ────────────────────────────────────────────────────────
  const handleTriggerExtract = async () => {
    if (!transcript || !transcript.trim()) {
      setTranscriptError(S.transcriptRequired);
      return;
    }

    setTranscriptError('');
    setIsExtracting(true);
    enterStage('mengekstrak');
    try {
      // Build the extract payload — include custom template text when available
      const extractPayload = { transcript, template_type: selectedTemplate };
      if (selectedTemplate === 'custom' && customTemplateText) {
        extractPayload.template_text = customTemplateText;
      }

      const res = await fetch('/api/extract', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(extractPayload),
      });
      let result = null;
      try { result = await res.json(); } catch { result = null; }
      if (!res.ok || !result?.data) {
        // Carry the backend `detail` (may be absent or non-string) to the error toast.
        throw Object.assign(new Error(), { backendFailure: true, detail: result?.detail });
      }

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
          || (data.agenda_items?.[0]?.title ? S.discussionPrefix(data.agenda_items[0].title) : S.untitledMeeting),
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

      // Immediately persist as Draf so navigating away never loses the record.
      // Non-blocking: on failure the user still proceeds; editor auto-save retries.
      try {
        const saveRes = await fetch('/api/meetings/save', {
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
        if (!saveRes.ok) {
          let detail;
          try { detail = (await saveRes.json())?.detail; } catch { detail = undefined; }
          toast.error(buildErrorMessage(T.ops.save, detail));
        }
      } catch (saveErr) {
        toast.error(buildErrorMessage(T.ops.save, saveErr?.message));
      }

      enterStage('ekstrak-selesai');
      onExtracted(formattedMeeting);
    } catch (err) {
      enterStage('ekstrak-ralat');
      toast.error(buildErrorMessage(T.ops.extract, err?.backendFailure ? err.detail : err?.message));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleClear = () => {
    setTranscript('');
    setTranscriptError('');
    sessionStorage.removeItem(SESSION_KEY);
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

  const template = TEMPLATES[selectedTemplate];
  const pct = clampPercent(progressPct);
  const hasTranscript = Boolean(transcript?.trim());
  const dropzoneLabel = isTranscribing ? S.dropBusy : isDragging ? S.dropActive : S.dropIdle;
  const dropzoneClass = cx(
    DROPZONE_BASE,
    isTranscribing ? DROPZONE_BUSY : isDragging ? DROPZONE_ACTIVE : DROPZONE_IDLE,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Polite live region: text changes only on stage transitions (Req 8.9). */}
      <div aria-live="polite" className="sr-only">{announcement}</div>

      {/* ── Card: Templat Format Minit ────────────────────────────────────── */}
      <Card as="section" padding="lg" aria-labelledby="ingest-template-title">
        <SectionHeader id="ingest-template-title" title={S.templateTitle} description={S.templateDescription} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <FormField
            as="select"
            label={S.templateLabel}
            className="flex-1"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            {Object.values(TEMPLATES).map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </FormField>

          <span
            className={cx(
              'inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs font-medium',
              template.tagClass,
            )}
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {template.tag}
            {selectedTemplate === 'custom' && customTemplateText ? (
              <span className="font-normal">{S.templateLoadedSuffix}</span>
            ) : null}
          </span>

          <Button
            variant="outline"
            size="sm"
            aria-expanded={showTemplatePreview}
            aria-controls={templatePanelId}
            onClick={() => setShowTemplatePreview((v) => !v)}
            className="whitespace-nowrap"
          >
            {S.templateStructure}
            <ChevronDown
              className={cx(
                'size-4 shrink-0 transition-transform duration-150 ease-standard',
                showTemplatePreview && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </Button>
        </div>

        {showTemplatePreview ? (
          <div id={templatePanelId} className="mt-4 space-y-3">
            <TemplatePreview
              template={template}
              customTemplateText={customTemplateText}
              onUploadCustom={() => customTemplateRef.current?.click()}
            />

            {selectedTemplate === 'custom' && (
              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                <p className="flex-1 text-xs text-neutral-600">
                  {customTemplateText ? S.templateLoadedNote : S.templateMissingNote}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Upload}
                  onClick={() => customTemplateRef.current?.click()}
                >
                  {customTemplateText ? S.templateReplace : S.templateUpload}
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {/* Hidden file input for custom template */}
        <input
          type="file"
          ref={customTemplateRef}
          className="hidden"
          accept=".txt,.md,.docx"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files?.[0]) handleCustomTemplateUpload(e.target.files[0]);
            e.target.value = '';   // allow re-uploading the same file
          }}
        />
      </Card>

      {/* ── Card: Muat Naik Dokumen / Audio Mesyuarat ─────────────────────── */}
      <Card as="section" padding="lg" aria-labelledby="ingest-upload-title">
        <SectionHeader id="ingest-upload-title" title={S.uploadTitle} description={S.uploadDescription} />

        <div className="space-y-4">
          <FormField
            as="select"
            label={S.modelLabel}
            helper={S.modelHelper}
            className="max-w-sm"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isTranscribing}
          >
            {WHISPER_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </FormField>

          <button
            type="button"
            onClick={openFilePicker}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-describedby={dropHintId}
            aria-disabled={isTranscribing ? 'true' : undefined}
            className={dropzoneClass}
          >
            <Upload
              className={cx('size-10', isDragging ? 'text-primary' : 'text-neutral-600')}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-neutral-900">{dropzoneLabel}</span>
            <span id={dropHintId} className="text-xs text-neutral-600">{S.acceptedFormats}</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".mp3,.wav,.m4a,.txt"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
              e.target.value = '';   // allow re-uploading the same file
            }}
          />

          {isDownloadingModel && (
            <div className="flex items-start gap-3 rounded-lg border border-info-border bg-info-bg px-4 py-3 text-sm text-info-fg">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">{S.modelDownloadingTitle} ({selectedModel})</p>
                <p>{T.messages.modelDownloading}</p>
              </div>
            </div>
          )}

          {isTranscribing && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-neutral-900">{STAGE_LABEL[stage] ?? S.stages.transcribing}</span>
                <span className="font-mono text-xs text-neutral-700">
                  {pct}% · {formatAudioProgress(currentTime ?? 0, totalTime)}
                </span>
              </div>
              <ProgressBar value={pct} label={S.progressLabel} />
            </div>
          )}

          {fileStatus && (
            <p className="text-sm text-neutral-700">{fileStatus}</p>
          )}
        </div>
      </Card>

      {/* ── Card: Pengekstrak AI ──────────────────────────────────────────── */}
      <Card as="section" padding="lg" aria-labelledby="ingest-extract-title">
        <SectionHeader id="ingest-extract-title" title={S.extractTitle} description={S.extractDescription} />

        <FormField
          as="textarea"
          label={S.transcriptLabel}
          rows={9}
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            if (transcriptError) setTranscriptError('');
          }}
          placeholder={S.transcriptPlaceholder}
          error={transcriptError || undefined}
          controlClassName="font-mono text-sm leading-relaxed whitespace-pre-wrap max-w-[80ch]"
        />

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClear}>
              {T.actions.clear}
            </Button>

            {hasTranscript && (
              <div role="group" aria-label={S.downloadGroup} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-neutral-600" aria-hidden="true">{T.actions.download}:</span>
                <Button variant="outline" size="sm" icon={Download} title={S.downloadTxt} onClick={() => downloadTranscript('txt')}>
                  TXT
                </Button>
                <Button variant="outline" size="sm" icon={Download} title={S.downloadJson} onClick={() => downloadTranscript('json')}>
                  JSON
                </Button>
                <Button variant="outline" size="sm" icon={Download} title={S.downloadSrt} onClick={() => downloadTranscript('srt')}>
                  SRT
                </Button>
              </div>
            )}
          </div>

          <Button
            variant="primary"
            icon={Sparkles}
            busy={isExtracting}
            disabled={isTranscribing}
            onClick={handleTriggerExtract}
          >
            {isExtracting ? T.messages.extracting : T.actions.extract}
          </Button>
        </div>
      </Card>
    </div>
  );
}

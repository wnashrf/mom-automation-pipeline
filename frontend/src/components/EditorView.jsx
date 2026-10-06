import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { ArrowLeft, Download, Eye, FileCheck, Info, Plus, Trash2 } from 'lucide-react';
import { initForm, serializeParticipants } from './editor/editorForm';
import { useAutoSave } from './editor/useAutoSave';
import DocumentPreview from './editor/DocumentPreview';
import SaveIndicator from './editor/SaveIndicator';
import SectionNav from './editor/SectionNav';
import { EDITOR_SECTIONS } from './editor/editorSections';
import Button from './ui/Button';
import Card from './ui/Card';
import SectionHeader from './ui/SectionHeader';
import FormField from './ui/FormField';
import { useToast } from './ui/toastContext';
import { shouldShowAiDraftNotice } from '../lib/draftNotice';
import { buildErrorMessage } from '../lib/errors';
import { requestJson } from '../lib/api';
import { T } from '../lib/terminology';

const DRAFT_KEY = 'active_meeting_draft';
const E = T.editor;
const F = T.editor.fields;

// Section metadata keyed by id; card order below follows EDITOR_SECTIONS (Req 9.9).
const SECTION = Object.fromEntries(EDITOR_SECTIONS.map((s) => [s.id, s]));

function writeDraft(data) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
}

/** Normalised id of the incoming meeting prop, or null. */
function meetingId(meeting) {
  return (meeting?.id && String(meeting.id).trim()) || null;
}

/** Form card whose heading is the SectionNav focus target (Req 9.10). */
function EditorCard({ sectionId, description, children }) {
  const section = SECTION[sectionId];
  return (
    <Card as="section" padding="lg" aria-labelledby={section.headingId}>
      <SectionHeader
        title={section.title}
        level={3}
        id={section.headingId}
        tabIndex={-1}
        description={description}
        className="scroll-mt-24"
      />
      {children}
    </Card>
  );
}

/** Repeated sub-block (participant / agenda / action) with an h4 and a remove button. */
function RowBlock({ title, removeLabel, onRemove, children }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-neutral-900">{title}</h4>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={Trash2}
          aria-label={removeLabel}
          onClick={onRemove}
        />
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="mb-4 text-sm text-neutral-600">{children}</p>;
}

// ─── Main Component ────────────────────────────────────────────────────────────
const EditorView = forwardRef(function EditorView({ meeting, previewMode, setPreviewMode, onBack }, ref) {
  const toast = useToast();

  // ── formData ───────────────────────────────────────────────────────────────
  // initForm runs once (lazy initialiser) so the minted UUID stays stable across
  // App re-renders. When App passes a meeting with a different id (switching
  // records), the form is re-initialised during render (React's "adjust state
  // on prop change" pattern) instead of through a ref.
  const [formData, setFormData] = useState(() => initForm(meeting));
  const incomingId = meetingId(meeting);
  const [syncedId, setSyncedId] = useState(incomingId);
  if (incomingId !== syncedId) {
    setSyncedId(incomingId);
    if (incomingId && incomingId !== formData.id) setFormData(initForm(meeting));
  }

  // ── id-minted callback ─────────────────────────────────────────────────────
  const handleIdMinted = useCallback((newId) => {
    setFormData((prev) => {
      if (prev.id === newId) return prev;
      const updated = { ...prev, id: newId };
      writeDraft(updated);
      return updated;
    });
  }, []);

  // ── Auto-save failure toast (one at a time, with "Cuba Lagi") ─────────────
  const failureToastRef = useRef(null);
  const flushRef = useRef(null);

  const handleAutoSaveFailure = useCallback((detail) => {
    if (failureToastRef.current != null) toast.dismiss(failureToastRef.current);
    failureToastRef.current = toast.error(buildErrorMessage(T.ops.autosave, detail), {
      action: { label: T.actions.retry, onAction: () => flushRef.current?.() },
    });
  }, [toast]);

  const { saveState, flush } = useAutoSave(formData, true, handleIdMinted, {
    onFailure: handleAutoSaveFailure,
  });

  useEffect(() => { flushRef.current = flush; }, [flush]);

  // A later successful save clears the outstanding failure toast.
  useEffect(() => {
    if (saveState.phase === 'saved' && failureToastRef.current != null) {
      toast.dismiss(failureToastRef.current);
      failureToastRef.current = null;
    }
  }, [saveState.phase, toast]);

  // Expose flush() to parent (App.jsx) so it can force a save before unmounting
  useImperativeHandle(ref, () => ({ flush }), [flush]);

  // ── Keep sessionStorage in sync on every formData change ──────────────────
  useEffect(() => {
    if (!formData.id) return;
    writeDraft(formData);
  }, [formData]);

  // ── Field helpers ──────────────────────────────────────────────────────────
  const updateField = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const addRow = (key, row) =>
    setFormData((prev) => ({ ...prev, [key]: [...prev[key], row] }));

  const updateRow = (key, idx, field, value) =>
    setFormData((prev) => {
      const updated = [...prev[key]];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, [key]: updated };
    });

  const removeRow = (key, idx) =>
    setFormData((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));

  // ── Jana Minit Mesyuarat (final save) ─────────────────────────────────────
  // Always overwrites the SAME file (formData.id minted at initForm time).
  // Sets status=Selesai, then clears the draft from sessionStorage.
  const [generating, setGenerating] = useState(false);

  const handleSave = async () => {
    if (generating) return;
    setGenerating(true);
    const payload = {
      ...formData,
      participants:  serializeParticipants(formData.participants || []),
      meeting_title: formData.meeting_title || E.untitledMeeting,
      status:        'Selesai',
    };
    const result = await requestJson('/api/meetings/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    setGenerating(false);
    if (!result.ok) {
      // Form stays intact so the user can retry.
      toast.error(buildErrorMessage(T.ops.generate, result.detail));
      return;
    }
    // Mark the form Selesai so the flush-on-unmount auto-save does not revert the status.
    setFormData((prev) => ({ ...prev, status: 'Selesai' }));
    // Draft fulfilled — clear it so the nav card resets to "Minit Baharu"
    clearDraft();
    toast.success(T.success.generate);
    onBack();
  };

  const showAiNotice = shouldShowAiDraftNotice(meeting?.status ?? 'Draf', formData.raw_transcript);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <section aria-label={T.views.editor.title}>
      {/* ── Sticky action bar (Req 9.6) ─────────────────────────────────── */}
      <div
        role="region"
        aria-label={E.actionBarLabel}
        className="sticky top-0 z-30 -mx-4 md:-mx-6 mb-6 border-b border-neutral-200 bg-white px-4 md:px-6 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-h-10 flex items-center">
            {!previewMode ? <SaveIndicator state={saveState} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {formData.id ? (
              <Button
                as="a"
                variant="outline"
                icon={Download}
                href={`/api/meetings/${formData.id}/export`}
                download
              >
                {T.history.downloadDocx}
              </Button>
            ) : null}
            <Button
              variant="outline"
              icon={previewMode ? ArrowLeft : Eye}
              onClick={() => setPreviewMode(!previewMode)}
            >
              {previewMode ? T.actions.backToForm : T.actions.preview}
            </Button>
            <Button variant="primary" icon={FileCheck} busy={generating} onClick={handleSave}>
              {T.actions.generate}
            </Button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* VIEW A — EDITABLE FORM                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {!previewMode && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <SectionNav sections={EDITOR_SECTIONS} />
          </div>

          <div className="min-w-0 space-y-6 [&_input]:scroll-mt-24 [&_select]:scroll-mt-24 [&_textarea]:scroll-mt-24">
            {showAiNotice ? (
              <div
                role="note"
                className="flex items-start gap-3 rounded-md border border-info-border bg-info-bg p-4 text-sm text-info-fg"
              >
                <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <p>
                  <span className="font-semibold">{E.aiDraftTitle}: </span>
                  {T.messages.aiDraftNotice}
                </p>
              </div>
            ) : null}

            {/* Maklumat Mesyuarat */}
            <EditorCard sectionId="maklumat">
              <div className="space-y-4">
                <FormField
                  label={F.title}
                  required
                  value={formData.meeting_title}
                  onChange={(e) => updateField('meeting_title', e.target.value)}
                  placeholder={F.titlePlaceholder}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    label={F.number}
                    value={formData.meeting_number}
                    onChange={(e) => updateField('meeting_number', e.target.value)}
                    placeholder={F.numberPlaceholder}
                  />
                  <FormField
                    label={F.date}
                    required
                    type="date"
                    value={formData.date}
                    onChange={(e) => updateField('date', e.target.value)}
                  />
                </div>
                <FormField
                  label={F.location}
                  value={formData.location}
                  onChange={(e) => updateField('location', e.target.value)}
                  placeholder={F.locationPlaceholder}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    label={F.startTime}
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => updateField('start_time', e.target.value)}
                  />
                  <FormField
                    label={F.endTime}
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => updateField('end_time', e.target.value)}
                  />
                </div>
              </div>
            </EditorCard>

            {/* Pengerusi & Pencatat */}
            <EditorCard sectionId="pengerusi">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  label={F.chairName}
                  value={formData.chairperson_name}
                  onChange={(e) => updateField('chairperson_name', e.target.value)}
                  placeholder={F.chairNamePlaceholder}
                />
                <FormField
                  label={F.chairRole}
                  value={formData.chairperson_role}
                  onChange={(e) => updateField('chairperson_role', e.target.value)}
                  placeholder={F.chairRolePlaceholder}
                />
                <FormField
                  label={F.secretaryName}
                  value={formData.secretary_name}
                  onChange={(e) => updateField('secretary_name', e.target.value)}
                  placeholder={F.secretaryNamePlaceholder}
                />
                <FormField
                  label={F.secretaryRole}
                  value={formData.secretary_role}
                  onChange={(e) => updateField('secretary_role', e.target.value)}
                  placeholder={F.secretaryRolePlaceholder}
                />
              </div>
            </EditorCard>

            {/* Senarai Kehadiran */}
            <EditorCard sectionId="kehadiran">
              {formData.participants.length > 0 ? (
                <div className="mb-4 space-y-3">
                  {formData.participants.map((p, idx) => (
                    <RowBlock
                      key={idx}
                      title={E.participant(idx + 1)}
                      removeLabel={E.removeParticipant(idx + 1)}
                      onRemove={() => removeRow('participants', idx)}
                    >
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <FormField
                          label={F.participantName}
                          value={p.name}
                          onChange={(e) => updateRow('participants', idx, 'name', e.target.value)}
                        />
                        <FormField
                          label={F.participantPosition}
                          value={p.position}
                          onChange={(e) => updateRow('participants', idx, 'position', e.target.value)}
                        />
                        <FormField
                          label={F.participantOrg}
                          value={p.organisation}
                          onChange={(e) => updateRow('participants', idx, 'organisation', e.target.value)}
                        />
                        <FormField
                          as="select"
                          label={F.participantStatus}
                          value={p.status}
                          onChange={(e) => updateRow('participants', idx, 'status', e.target.value)}
                        >
                          <option value="Hadir">{E.attendance.present}</option>
                          <option value="Tidak Hadir - Bersebab">{E.attendance.absentExcused}</option>
                          <option value="Turut Hadir">{E.attendance.inAttendance}</option>
                        </FormField>
                      </div>
                    </RowBlock>
                  ))}
                </div>
              ) : (
                <EmptyNote>{E.noParticipants}</EmptyNote>
              )}
              <Button
                variant="outline"
                icon={Plus}
                onClick={() => addRow('participants', { name: '', position: '', organisation: '', status: 'Hadir' })}
              >
                {E.addParticipant}
              </Button>
            </EditorCard>

            {/* Perkara Berbangkit */}
            <EditorCard sectionId="berbangkit">
              <FormField
                as="textarea"
                rows={4}
                label={F.mattersArising}
                helper={F.mattersArisingHelper}
                value={formData.matters_arising}
                onChange={(e) => updateField('matters_arising', e.target.value)}
                placeholder={F.mattersArisingPlaceholder}
                controlClassName="resize-y leading-relaxed"
              />
            </EditorCard>

            {/* Perkara Dibincangkan */}
            <EditorCard sectionId="perbincangan">
              {formData.agenda_items.length > 0 ? (
                <div className="mb-4 space-y-3">
                  {formData.agenda_items.map((ag, idx) => (
                    <RowBlock
                      key={idx}
                      title={E.agendaItem(idx + 1)}
                      removeLabel={E.removeAgendaItem(idx + 1)}
                      onRemove={() => removeRow('agenda_items', idx)}
                    >
                      <div className="space-y-4">
                        <FormField
                          label={F.agendaTitle}
                          value={ag.title}
                          onChange={(e) => updateRow('agenda_items', idx, 'title', e.target.value)}
                          placeholder={F.agendaTitlePlaceholder}
                        />
                        <FormField
                          as="textarea"
                          rows={4}
                          label={F.agendaSummary}
                          value={ag.summary}
                          onChange={(e) => updateRow('agenda_items', idx, 'summary', e.target.value)}
                          placeholder={F.agendaSummaryPlaceholder}
                          controlClassName="resize-y leading-relaxed"
                        />
                        <FormField
                          as="textarea"
                          rows={3}
                          label={F.agendaDecision}
                          value={ag.decision}
                          onChange={(e) => updateRow('agenda_items', idx, 'decision', e.target.value)}
                          placeholder={F.agendaDecisionPlaceholder}
                          controlClassName="resize-y leading-relaxed border-l-4 border-l-success"
                        />
                      </div>
                    </RowBlock>
                  ))}
                </div>
              ) : (
                <EmptyNote>{E.noAgendaItems}</EmptyNote>
              )}
              <Button
                variant="outline"
                icon={Plus}
                onClick={() => addRow('agenda_items', { title: '', summary: '', decision: '' })}
              >
                {E.addAgendaItem}
              </Button>
            </EditorCard>

            {/* Tindakan Susulan */}
            <EditorCard sectionId="tindakan">
              {formData.action_items.length > 0 ? (
                <div className="mb-4 space-y-3">
                  {formData.action_items.map((item, idx) => (
                    <RowBlock
                      key={idx}
                      title={E.actionItem(idx + 1)}
                      removeLabel={E.removeActionItem(idx + 1)}
                      onRemove={() => removeRow('action_items', idx)}
                    >
                      <div className="space-y-4">
                        <FormField
                          label={F.actionTask}
                          value={item.task}
                          onChange={(e) => updateRow('action_items', idx, 'task', e.target.value)}
                          placeholder={F.actionTaskPlaceholder}
                        />
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <FormField
                            label={F.actionAssignee}
                            value={item.assignee}
                            onChange={(e) => updateRow('action_items', idx, 'assignee', e.target.value)}
                            placeholder={F.actionAssigneePlaceholder}
                          />
                          <FormField
                            label={F.actionDeadline}
                            type="date"
                            value={item.deadline}
                            onChange={(e) => updateRow('action_items', idx, 'deadline', e.target.value)}
                          />
                          <FormField
                            as="select"
                            label={F.actionStatus}
                            value={item.status}
                            onChange={(e) => updateRow('action_items', idx, 'status', e.target.value)}
                          >
                            <option value="Belum Mula">{T.status.notStarted}</option>
                            <option value="Sedang Berjalan">{T.status.inProgress}</option>
                            <option value="Selesai">{T.status.done}</option>
                          </FormField>
                        </div>
                      </div>
                    </RowBlock>
                  ))}
                </div>
              ) : (
                <EmptyNote>{E.noActionItems}</EmptyNote>
              )}
              <Button
                variant="outline"
                icon={Plus}
                onClick={() => addRow('action_items', { task: '', assignee: '', deadline: '', status: 'Belum Mula' })}
              >
                {E.addActionItem}
              </Button>
            </EditorCard>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* VIEW B — OFFICIAL PKPA PRINTABLE PREVIEW                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {previewMode && <DocumentPreview formData={formData} />}
    </section>
  );
});

export default EditorView;

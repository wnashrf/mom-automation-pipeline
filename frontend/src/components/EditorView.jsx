import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <div className="mb-5">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-[#1b3a5b]">{title}</h3>
      <div className="mt-1.5 h-0.5 bg-[#1b3a5b] rounded-full" />
    </div>
  );
}

// ─── Form Card ─────────────────────────────────────────────────────────────────
function FormCard({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-md border border-gray-100 p-7 ${className}`}>
      {children}
    </div>
  );
}

// ─── Label + Input helpers ─────────────────────────────────────────────────────
function Label({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

const inputCls =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3a5b]/30 focus:border-[#1b3a5b] transition-colors bg-white';

const textareaCls =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3a5b]/30 focus:border-[#1b3a5b] transition-colors bg-white resize-y leading-relaxed';

// ─── initForm — MODULE LEVEL (not inside the component) ───────────────────────
// Keeping this outside the component is critical: if it were defined inside,
// every render would create a new function reference.  The useEffect that calls
// it would then fire on every render, minting a fresh UUID each time and
// producing duplicate meeting records.
function initForm(m) {
  // Stable ID: reuse existing, or mint exactly once here.
  // The ID written here is the ID used for every auto-save and the final
  // "Jana Minit" save, so there is never more than one file per session.
  const stableId =
    (m?.id && String(m.id).trim()) ||
    `meet_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

  return {
    id: stableId,
    meeting_title:    m?.meeting_title    || m?.title          || '',
    meeting_number:   m?.meeting_number   || '',
    location:         m?.location         || m?.venue          || '',
    date:             m?.date             || m?.meeting_date   || '',
    start_time:       m?.start_time       || m?.masa_mula      || '',
    end_time:         m?.end_time         || m?.masa_tamat     || '',
    // Chairperson — flat keys take priority, then nested object shape
    chairperson_name: m?.chairperson_name || m?.pengerusi_nama      || m?.chairperson?.name || '',
    chairperson_role: m?.chairperson_role || m?.pengerusi_jawatan   || m?.chairperson?.role || '',
    // Secretary
    secretary_name:   m?.secretary_name   || m?.pencatat_nama       || m?.secretary?.name   || '',
    secretary_role:   m?.secretary_role   || m?.pencatat_jawatan    || m?.secretary?.role   || '',
    // Participants
    // Internal form shape: { name, position (= jawatan displayed), organisation, status }
    // "position" is the in-form key for jawatan so the input binding is explicit.
    participants: Array.isArray(m?.participants)
      ? m.participants.map((p) =>
          typeof p === 'string'
            ? { name: p, position: '', organisation: '', status: 'Hadir' }
            : {
                name:         p.name         || p.label      || p.nama        || '',
                // jawatan from JSON → position inside form
                position:     p.position     || p.jawatan    || p.role        || p.designation || '',
                organisation: p.organisation || p.department || p.organisasi  || '',
                status:       p.status       || 'Hadir',
              }
        )
      : [],
    matters_arising: m?.matters_arising || '',
    agenda_items: Array.isArray(m?.agenda_items)
      ? m.agenda_items.map((ag) => ({
          title:    ag.title    || ag.tajuk     || '',
          summary:  ag.summary  || ag.ringkasan || '',
          decision: ag.decision || ag.keputusan || '',
        }))
      : [],
    action_items: Array.isArray(m?.action_items)
      ? m.action_items.map((act) => ({
          task:     act.task     || act.description || '',
          assignee: act.assignee || '',
          deadline: act.deadline || '',
          status:   act.status   || 'Belum Mula',
        }))
      : [],
    raw_transcript: m?.raw_transcript || '',
  };
}

// ─── hasMeaningfulContent ─────────────────────────────────────────────────────
// Returns true only when the form has at least one real piece of data.
// Used to suppress auto-save and flush for blank "Minit Baharu" forms.
const EMPTY_TITLES = new Set(['', 'draf tanpa tajuk', 'mesyuarat tanpa tajuk']);

function hasMeaningfulContent(data) {
  if (!data) return false;
  const title = (data.meeting_title || '').trim().toLowerCase();
  if (!EMPTY_TITLES.has(title)) return true;
  if ((data.participants  || []).some((p) => (p.name || '').trim())) return true;
  if ((data.agenda_items  || []).some((a) => (a.title || '').trim())) return true;
  if ((data.action_items  || []).length > 0) return true;
  if ((data.matters_arising || '').trim()) return true;
  return false;
}
// Converts the in-form shape → canonical wire shape.
// Backend ParticipantModel.model_validator accepts all these keys.
function serializeParticipants(participants) {
  return (participants || []).map((p) => ({
    name:         p.name         || p.nama  || '',
    jawatan:      p.position     || p.jawatan || p.role || '',  // form uses `position`
    organisation: p.organisation || p.department || p.organisasi || '',
    status:       p.status       || 'Hadir',
    // keep legacy mirrors so existing JSON files round-trip without data loss
    label:        p.name         || p.nama  || '',
    department:   p.organisation || p.department || p.organisasi || '',
  }));
}

// ─── useAutoSave ──────────────────────────────────────────────────────────────
// Debounces saves by 3 s.  onIdMinted(id) is called once if the backend
// returns a different id (shouldn't happen when initForm pre-mints the id,
// but it's a safe-guard).
// Returns { saving, lastSaved, flush } — flush() forces an immediate save.
function useAutoSave(formData, enabled, onIdMinted) {
  const timerRef    = useRef(null);
  const formDataRef = useRef(formData);        // always current, no stale closure
  const [lastSaved, setLastSaved] = useState(null);
  const [saving,    setSaving]    = useState(false);

  // Keep ref in sync so flush() / unmount handler always see latest formData
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const save = useCallback(async (data) => {
    // Skip entirely if the form is blank — avoids "Draf Tanpa Tajuk" pollution
    if (!hasMeaningfulContent(data)) return;
    if (!data.id && !data.meeting_title) return;
    setSaving(true);
    try {
      const payload = {
        ...data,
        participants:  serializeParticipants(data.participants || []),
        meeting_title: data.meeting_title || 'Draf Tanpa Tajuk',
        status: data.status === 'Selesai' ? 'Selesai' : 'Draf',
      };
      const res = await fetch('/api/meetings/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.id && json.id !== data.id) onIdMinted?.(json.id);
        setLastSaved(new Date());
      }
    } catch (_) {
      // silent — background save failures are non-blocking
    } finally {
      setSaving(false);
    }
  }, [onIdMinted]);

  // Debounced auto-save
  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(formData), 3000);
    return () => clearTimeout(timerRef.current);
  }, [formData, enabled, save]);

  // Flush on unmount — cancel the pending debounce and save immediately
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Fire-and-forget; component is unmounting so we can't await
      save(formDataRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // intentionally empty — runs only on unmount

  // Expose flush so callers can trigger an immediate synchronous-style save
  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    return save(formDataRef.current);   // returns the Promise
  }, [save]);

  return { saving, lastSaved, flush };
}

// ─── Main Component ────────────────────────────────────────────────────────────
const EditorView = forwardRef(function EditorView({ meeting, previewMode, setPreviewMode, onBack }, ref) {

  // ── formData ───────────────────────────────────────────────────────────────
  // initializedRef prevents re-running initForm (and minting a new UUID) when
  // App re-renders and passes a logically identical meeting object via
  // `currentMeeting ?? readDraft()`.  We only re-initialize when the meeting's
  // id actually changes (switching from one record to another).
  const initializedRef = useRef(null);

  const [formData, setFormData] = useState(() => {
    const form = initForm(meeting);
    initializedRef.current = form.id;
    return form;
  });

  useEffect(() => {
    if (!meeting) return;
    const incomingId = (meeting.id && String(meeting.id).trim()) || null;
    // Only re-init if a different meeting is loaded (id changed or first load
    // with a real server id replacing the locally-minted placeholder)
    if (incomingId && incomingId !== initializedRef.current) {
      const form = initForm(meeting);
      initializedRef.current = form.id;
      setFormData(form);
    }
  }, [meeting]);

  // ── id-minted callback ─────────────────────────────────────────────────────
  const handleIdMinted = useCallback((newId) => {
    setFormData((prev) => {
      if (prev.id === newId) return prev;
      const updated = { ...prev, id: newId };
      initializedRef.current = newId;
      try { sessionStorage.setItem('active_meeting_draft', JSON.stringify(updated)); } catch (_) {}
      return updated;
    });
  }, []);

  const { saving, lastSaved, flush } = useAutoSave(formData, true, handleIdMinted);

  // Expose flush() to parent (App.jsx) so it can force a save before unmounting
  useImperativeHandle(ref, () => ({ flush }), [flush]);

  // ── Keep sessionStorage in sync on every formData change ──────────────────
  useEffect(() => {
    if (!formData.id) return;
    try { sessionStorage.setItem('active_meeting_draft', JSON.stringify(formData)); } catch (_) {}
  }, [formData]);

  // ── Field helpers ──────────────────────────────────────────────────────────
  const updateField = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // ── Participants ───────────────────────────────────────────────────────────
  const addParticipant = () =>
    setFormData((prev) => ({
      ...prev,
      participants: [...prev.participants, { name: '', position: '', organisation: '', status: 'Hadir' }],
    }));

  const updateParticipant = (idx, field, value) =>
    setFormData((prev) => {
      const updated = [...prev.participants];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, participants: updated };
    });

  const removeParticipant = (idx) =>
    setFormData((prev) => ({
      ...prev,
      participants: prev.participants.filter((_, i) => i !== idx),
    }));

  // ── Agenda ─────────────────────────────────────────────────────────────────
  const addAgendaItem = () =>
    setFormData((prev) => ({
      ...prev,
      agenda_items: [...prev.agenda_items, { title: '', summary: '', decision: '' }],
    }));

  const updateAgendaItem = (idx, field, value) =>
    setFormData((prev) => {
      const updated = [...prev.agenda_items];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, agenda_items: updated };
    });

  const removeAgendaItem = (idx) =>
    setFormData((prev) => ({
      ...prev,
      agenda_items: prev.agenda_items.filter((_, i) => i !== idx),
    }));

  // ── Action Items ───────────────────────────────────────────────────────────
  const addActionItem = () =>
    setFormData((prev) => ({
      ...prev,
      action_items: [...prev.action_items, { task: '', assignee: '', deadline: '', status: 'Belum Mula' }],
    }));

  const updateActionItem = (idx, field, value) =>
    setFormData((prev) => {
      const updated = [...prev.action_items];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, action_items: updated };
    });

  const removeActionItem = (idx) =>
    setFormData((prev) => ({
      ...prev,
      action_items: prev.action_items.filter((_, i) => i !== idx),
    }));

  // ── Jana Minit Mesyuarat (final save) ─────────────────────────────────────
  // Always overwrites the SAME file (formData.id minted at initForm time).
  // Sets status=Selesai, then clears the draft from sessionStorage.
  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        participants:  serializeParticipants(formData.participants || []),
        meeting_title: formData.meeting_title || 'Mesyuarat Tanpa Tajuk',
        status:        'Selesai',
      };

      const res = await fetch('/api/meetings/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Gagal menyimpan rekod ke pelayan.');

      // Draft fulfilled — clear it so the nav card resets to "Minit Baharu"
      try { sessionStorage.removeItem('active_meeting_draft'); } catch (_) {}

      alert('Minit mesyuarat berjaya dijana dan disimpan!');
      onBack();
    } catch (err) {
      alert('Ralat menyimpan minit: ' + err.message);
    }
  };

  // ── Date formatter for preview ─────────────────────────────────────────────
  const fmtDate = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('ms-MY', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <section className="pb-28">
      {/* ── Top toggle bar ──────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 mb-6">
        {/* Download DOCX — only shown when the record has a saved id */}
        {formData.id && (
          <a
            href={`/api/meetings/${formData.id}/export`}
            download
            className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-[#1b3a5b] border-2 border-[#1b3a5b] text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Muat Turun DOCX
          </a>
        )}
        <button
          onClick={() => setPreviewMode(!previewMode)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1b3a5b] hover:bg-[#14304e] text-white text-sm font-semibold rounded-xl shadow transition-colors"
        >
          {previewMode ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Kembali ke Borang
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Pratonton Dokumen Rasmi
            </>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* VIEW A — EDITABLE FORM                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {!previewMode && (
        <div className="space-y-6">

          {/* Card 1: MAKLUMAT MESYUARAT */}
          <FormCard>
            <SectionHeader title="Maklumat Mesyuarat" />
            <div className="mb-4">
              <Label required>Tajuk Mesyuarat</Label>
              <input type="text" value={formData.meeting_title}
                onChange={(e) => updateField('meeting_title', e.target.value)}
                placeholder="Contoh: Mesyuarat Jawatankuasa Teknikal Bil. 3/2026"
                className={inputCls} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Bilangan Mesyuarat</Label>
                <input type="text" value={formData.meeting_number}
                  onChange={(e) => updateField('meeting_number', e.target.value)}
                  placeholder="Contoh: 3/2026" className={inputCls} />
              </div>
              <div>
                <Label required>Tarikh</Label>
                <input type="date" value={formData.date}
                  onChange={(e) => updateField('date', e.target.value)}
                  className={inputCls} />
              </div>
            </div>
            <div className="mb-4">
              <Label>Tempat</Label>
              <input type="text" value={formData.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="Contoh: Bilik Mesyuarat Utama, Tingkat 3"
                className={inputCls} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Masa Mula</Label>
                <input type="time" value={formData.start_time}
                  onChange={(e) => updateField('start_time', e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <Label>Masa Tamat</Label>
                <input type="time" value={formData.end_time}
                  onChange={(e) => updateField('end_time', e.target.value)}
                  className={inputCls} />
              </div>
            </div>
          </FormCard>

          {/* Card 2: PENGERUSI & PENCATAT */}
          <FormCard>
            <SectionHeader title="Pengerusi & Pencatat" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Nama Pengerusi</Label>
                <input type="text" value={formData.chairperson_name}
                  onChange={(e) => updateField('chairperson_name', e.target.value)}
                  placeholder="Nama penuh pengerusi" className={inputCls} />
              </div>
              <div>
                <Label>Jawatan Pengerusi</Label>
                <input type="text" value={formData.chairperson_role}
                  onChange={(e) => updateField('chairperson_role', e.target.value)}
                  placeholder="Contoh: Ketua Setiausaha" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nama Pencatat</Label>
                <input type="text" value={formData.secretary_name}
                  onChange={(e) => updateField('secretary_name', e.target.value)}
                  placeholder="Nama penuh pencatat minit" className={inputCls} />
              </div>
              <div>
                <Label>Jawatan Pencatat</Label>
                <input type="text" value={formData.secretary_role}
                  onChange={(e) => updateField('secretary_role', e.target.value)}
                  placeholder="Contoh: Penolong Setiausaha" className={inputCls} />
              </div>
            </div>
          </FormCard>

          {/* Card 3: SENARAI KEHADIRAN */}
          <FormCard>
            <SectionHeader title="Senarai Kehadiran" />
            {formData.participants.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_180px_40px] gap-2 px-1">
                  {['Nama', 'Jawatan', 'Organisasi / Bahagian', 'Status Kehadiran', ''].map((h) => (
                    <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</span>
                  ))}
                </div>
                {formData.participants.map((p, idx) => (
                  <div key={idx}
                    className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_180px_40px] gap-2 items-center bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <input type="text" value={p.name}
                      onChange={(e) => updateParticipant(idx, 'name', e.target.value)}
                      placeholder="Nama" className={inputCls} />
                    <input type="text" value={p.position}
                      onChange={(e) => updateParticipant(idx, 'position', e.target.value)}
                      placeholder="Jawatan" className={inputCls} />
                    <input type="text" value={p.organisation}
                      onChange={(e) => updateParticipant(idx, 'organisation', e.target.value)}
                      placeholder="Organisasi / Bahagian" className={inputCls} />
                    <select value={p.status}
                      onChange={(e) => updateParticipant(idx, 'status', e.target.value)}
                      className={inputCls}>
                      <option value="Hadir">Hadir</option>
                      <option value="Tidak Hadir - Bersebab">Tidak Hadir - Bersebab</option>
                      <option value="Turut Hadir">Turut Hadir</option>
                    </select>
                    <div className="flex justify-end md:justify-center">
                      <button type="button" onClick={() => removeParticipant(idx)} title="Buang ahli"
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-base transition-colors">
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {formData.participants.length === 0 && (
              <p className="text-sm text-gray-400 italic mb-4">Tiada ahli ditambah lagi.</p>
            )}
            <button type="button" onClick={addParticipant}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 hover:border-[#1b3a5b] text-gray-500 hover:text-[#1b3a5b] rounded-xl text-sm font-semibold transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Ahli
            </button>
          </FormCard>

          {/* Card 4: PERKARA BERBANGKIT */}
          <FormCard>
            <SectionHeader title="Perkara Berbangkit" />
            <p className="text-xs text-gray-500 mb-3">Tindakan susulan dari mesyuarat lepas yang perlu dimaklumkan.</p>
            <textarea rows={4} value={formData.matters_arising}
              onChange={(e) => updateField('matters_arising', e.target.value)}
              placeholder="Contoh: Tindakan dari mesyuarat lepas (Bil. 2/2026) — laporan dikemukakan oleh Unit A..."
              className={textareaCls} />
          </FormCard>

          {/* Card 5: PERKARA DIBINCANGKAN (AGENDA) */}
          <FormCard>
            <SectionHeader title="Perkara Dibincangkan (Agenda)" />
            <div className="space-y-5 mb-5">
              {formData.agenda_items.map((ag, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl bg-gray-50/60 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-[#1b3a5b]/5 border-b border-gray-200">
                    <span className="text-xs font-black uppercase tracking-widest text-[#1b3a5b]">Perkara {idx + 1}</span>
                    <button type="button" onClick={() => removeAgendaItem(idx)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Buang
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <Label>Tajuk Perkara</Label>
                      <input type="text" value={ag.title}
                        onChange={(e) => updateAgendaItem(idx, 'title', e.target.value)}
                        placeholder="Tajuk agenda / perkara" className={inputCls} />
                    </div>
                    <div>
                      <Label>Ringkasan Perbincangan</Label>
                      <textarea rows={4} value={ag.summary}
                        onChange={(e) => updateAgendaItem(idx, 'summary', e.target.value)}
                        placeholder="Huraikan perbincangan yang berlaku..." className={textareaCls} />
                    </div>
                    <div>
                      <Label>Keputusan / Ketetapan</Label>
                      <textarea rows={3} value={ag.decision}
                        onChange={(e) => updateAgendaItem(idx, 'decision', e.target.value)}
                        placeholder="Nyatakan keputusan atau ketetapan mesyuarat..."
                        className={`${textareaCls} border-emerald-300 focus:border-emerald-500 focus:ring-emerald-200`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {formData.agenda_items.length === 0 && (
              <p className="text-sm text-gray-400 italic mb-4">Tiada perkara agenda ditambah lagi.</p>
            )}
            <button type="button" onClick={addAgendaItem}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 hover:border-[#1b3a5b] text-gray-500 hover:text-[#1b3a5b] rounded-xl text-sm font-semibold transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Perkara
            </button>
          </FormCard>

          {/* Card 6: TINDAKAN SUSULAN */}
          <FormCard>
            <SectionHeader title="Tindakan Susulan" />
            <div className="space-y-4 mb-5">
              {formData.action_items.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl bg-gray-50/60 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-[#1b3a5b]/5 border-b border-gray-200">
                    <span className="text-xs font-black uppercase tracking-widest text-[#1b3a5b]">Tindakan {idx + 1}</span>
                    <button type="button" onClick={() => removeActionItem(idx)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Buang
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <Label>Tindakan</Label>
                      <input type="text" value={item.task}
                        onChange={(e) => updateActionItem(idx, 'task', e.target.value)}
                        placeholder="Huraikan tindakan yang perlu diambil..." className={inputCls} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Tanggungjawab (Nama / Jawatan)</Label>
                        <input type="text" value={item.assignee}
                          onChange={(e) => updateActionItem(idx, 'assignee', e.target.value)}
                          placeholder="Nama atau jawatan pegawai" className={inputCls} />
                      </div>
                      <div>
                        <Label>Tarikh Akhir</Label>
                        <input type="date" value={item.deadline}
                          onChange={(e) => updateActionItem(idx, 'deadline', e.target.value)}
                          className={inputCls} />
                      </div>
                      <div>
                        <Label>Status</Label>
                        <select value={item.status}
                          onChange={(e) => updateActionItem(idx, 'status', e.target.value)}
                          className={inputCls}>
                          <option value="Belum Mula">Belum Mula</option>
                          <option value="Sedang Berjalan">Sedang Berjalan</option>
                          <option value="Selesai">Selesai</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {formData.action_items.length === 0 && (
              <p className="text-sm text-gray-400 italic mb-4">Tiada tindakan susulan ditambah lagi.</p>
            )}
            <button type="button" onClick={addActionItem}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 hover:border-[#1b3a5b] text-gray-500 hover:text-[#1b3a5b] rounded-xl text-sm font-semibold transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Tindakan
            </button>
          </FormCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* VIEW B — OFFICIAL PKPA PRINTABLE PREVIEW                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {previewMode && (
        <div className="bg-white p-10 rounded-2xl border border-gray-200 shadow-sm font-serif text-gray-900">
          <div className="text-center border-b-2 border-[#1b3a5b] pb-6 mb-6">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Minit Mesyuarat Rasmi</p>
            <h2 className="text-xl font-bold uppercase tracking-wide text-[#1b3a5b]">
              {formData.meeting_title || 'MINIT MESYUARAT'}
            </h2>
            {formData.meeting_number && (
              <p className="text-sm font-semibold text-gray-600 mt-1">Bilangan {formData.meeting_number}</p>
            )}
          </div>

          <table className="w-full text-xs mb-8 font-sans">
            <tbody className="divide-y divide-gray-100">
              {[
                ['Tarikh',    fmtDate(formData.date)],
                ['Tempat',    formData.location || '-'],
                ['Masa',      formData.start_time
                                ? `${formData.start_time}${formData.end_time ? ` – ${formData.end_time}` : ''}`
                                : '-'],
                ['Pengerusi', [formData.chairperson_name, formData.chairperson_role].filter(Boolean).join(', ') || '-'],
                ['Pencatat',  [formData.secretary_name,   formData.secretary_role  ].filter(Boolean).join(', ') || '-'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5 font-bold text-gray-700 w-32">{k}</td>
                  <td className="py-1.5 text-gray-600">: {v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-8 text-xs leading-relaxed font-sans">
            {/* 1. Kehadiran */}
            <div>
              <h4 className="font-black text-[11px] uppercase tracking-widest text-[#1b3a5b] border-b border-[#1b3a5b] pb-1 mb-3">
                1.0 Kehadiran
              </h4>
              {formData.participants.length ? (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600 uppercase text-[10px]">
                      <th className="p-2 text-center w-8">Bil.</th>
                      <th className="p-2 text-left">Nama</th>
                      <th className="p-2 text-left">Jawatan</th>
                      <th className="p-2 text-left">Organisasi / Bahagian</th>
                      <th className="p-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {formData.participants.map((p, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2 text-center text-gray-500">{i + 1}.</td>
                        <td className="p-2 font-semibold">{p.name || '-'}</td>
                        {/* position is the in-form key for jawatan */}
                        <td className="p-2">{p.position || '-'}</td>
                        <td className="p-2">{p.organisation || '-'}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.status === 'Hadir'       ? 'bg-emerald-100 text-emerald-700' :
                            p.status === 'Turut Hadir' ? 'bg-blue-100 text-blue-700' :
                                                         'bg-orange-100 text-orange-700'
                          }`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="italic text-gray-400">Tiada rekod kehadiran.</p>
              )}
            </div>

            {/* 2. Perkara Berbangkit */}
            {formData.matters_arising && (
              <div>
                <h4 className="font-black text-[11px] uppercase tracking-widest text-[#1b3a5b] border-b border-[#1b3a5b] pb-1 mb-3">
                  2.0 Perkara Berbangkit
                </h4>
                <p className="text-gray-700 whitespace-pre-line leading-relaxed">{formData.matters_arising}</p>
              </div>
            )}

            {/* 3. Perbincangan */}
            <div>
              <h4 className="font-black text-[11px] uppercase tracking-widest text-[#1b3a5b] border-b border-[#1b3a5b] pb-1 mb-3">
                {formData.matters_arising ? '3.0' : '2.0'} Perkara-perkara Dibincangkan
              </h4>
              {formData.agenda_items.length ? (
                formData.agenda_items.map((ag, idx) => (
                  <div key={idx} className="mb-6">
                    <p className="font-bold text-gray-900 mb-2">
                      {(formData.matters_arising ? 3 : 2)}.{idx + 1} {ag.title}
                    </p>
                    <p className="text-gray-700 pl-4 whitespace-pre-line leading-relaxed">{ag.summary}</p>
                    {ag.decision && (
                      <div className="mt-3 ml-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                        <p className="font-bold text-emerald-800 mb-1">Keputusan / Ketetapan:</p>
                        <p className="text-gray-700 whitespace-pre-line">{ag.decision}</p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="italic text-gray-400">Tiada perkara perbincangan direkodkan.</p>
              )}
            </div>

            {/* 4. Tindakan Susulan */}
            <div>
              <h4 className="font-black text-[11px] uppercase tracking-widest text-[#1b3a5b] border-b border-[#1b3a5b] pb-1 mb-3">
                {formData.matters_arising ? '4.0' : '3.0'} Matriks Tindakan Susulan
              </h4>
              {formData.action_items.length ? (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#1b3a5b] text-white text-[10px] uppercase tracking-wide">
                      <th className="p-2.5 text-center w-8">Bil.</th>
                      <th className="p-2.5 text-left">Tindakan</th>
                      <th className="p-2.5 text-left w-44">Tanggungjawab</th>
                      <th className="p-2.5 text-center w-28">Tarikh Akhir</th>
                      <th className="p-2.5 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {formData.action_items.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2.5 text-center text-gray-500">{idx + 1}.</td>
                        <td className="p-2.5 font-medium">{item.task}</td>
                        <td className="p-2.5">{item.assignee || <span className="italic text-gray-400">Belum Ditetapkan</span>}</td>
                        <td className="p-2.5 text-center">{item.deadline ? fmtDate(item.deadline) : '-'}</td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            item.status === 'Selesai'         ? 'bg-emerald-100 text-emerald-700' :
                            item.status === 'Sedang Berjalan' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-gray-100 text-gray-600'
                          }`}>{item.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="italic text-gray-400">Tiada tindakan susulan direkodkan.</p>
              )}
            </div>
          </div>

          {/* Signature block */}
          <div className="mt-12 grid grid-cols-2 gap-16 text-xs font-sans">
            {[
              { label: 'Pengerusi',     name: formData.chairperson_name, role: formData.chairperson_role },
              { label: 'Pencatat Minit', name: formData.secretary_name,   role: formData.secretary_role   },
            ].map((sig) => (
              <div key={sig.label}>
                <div className="border-b border-gray-400 mt-10 mb-2" />
                <p className="font-bold">{sig.name || '( )'}</p>
                {sig.role && <p className="text-gray-500">{sig.role}</p>}
                <p className="text-gray-400 mt-1">{sig.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STICKY BOTTOM ACTION BAR — shown in both form and preview modes    */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-2xl">
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left slot — auto-save indicator in form mode, empty spacer in preview */}
            {!previewMode ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  <span className="text-amber-600 font-medium">Menyimpan draf...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>
                    Auto-simpan aktif —{' '}
                    <span className="font-medium text-gray-700">draf disimpan secara automatik</span>
                    {lastSaved && (
                      <span className="text-gray-400 ml-1">
                        (terakhir: {lastSaved.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
                  </span>
                </>
              )}
            </div>
            ) : <div />}
            <button type="button" onClick={handleSave}
              className="flex items-center gap-2.5 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-lg hover:shadow-emerald-200 transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Jana Minit Mesyuarat
            </button>
          </div>
        </div>
    </section>
  );
});

export default EditorView;

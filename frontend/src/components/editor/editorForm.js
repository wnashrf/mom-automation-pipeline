// ─── Editor form helpers ──────────────────────────────────────────────────────
// Moved verbatim from EditorView.jsx so they can be tested directly.
// Logic is intentionally unchanged.

// ─── initForm — MODULE LEVEL (not inside the component) ───────────────────────
// Keeping this outside the component is critical: if it were defined inside,
// every render would create a new function reference.  The useEffect that calls
// it would then fire on every render, minting a fresh UUID each time and
// producing duplicate meeting records.
export function initForm(m) {
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

export function hasMeaningfulContent(data) {
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
export function serializeParticipants(participants) {
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

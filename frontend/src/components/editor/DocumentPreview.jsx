import { formatDisplayDate } from '../../lib/dates';

/*
 * Official PKPA printable preview of the minutes (Req 3.5, 5.4, 9.11, 13.7).
 *
 * Page sizing: `aspect-a4` sets `aspect-ratio: 1 / 1.414` on a `height: auto`
 * box with visible overflow. Under CSS aspect-ratio rules this acts as a
 * minimum height (automatic minimum size), so a short document keeps the A4
 * proportion while a long one grows taller instead of being clipped.
 *
 * Only `doc-*` colours are used inside the page surface; status values are
 * plain text because coloured chips belong to the application chrome.
 */

// Serif stack the title block used before the redesign (Tailwind's former font-serif).
const TITLE_FONT = { fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif' };

const sectionHeadingCls =
  'font-bold text-xs uppercase tracking-widest text-doc-ink border-b border-doc-rule pb-1 mb-3';

function displayDate(value) {
  return value ? formatDisplayDate(value) : '-';
}

export default function DocumentPreview({ formData }) {
  const hasMatters = Boolean(formData.matters_arising);
  const participants = formData.participants || [];
  const agendaItems = formData.agenda_items || [];
  const actionItems = formData.action_items || [];

  return (
    <div className="overflow-x-auto bg-neutral-100 p-4 md:p-8 rounded-lg">
      <article className="mx-auto w-full max-w-[794px] min-w-[600px] aspect-a4 bg-doc-paper text-doc-ink shadow-md p-12 font-sans">
        <header className="text-center border-b-2 border-doc-rule pb-6 mb-6" style={TITLE_FONT}>
          <p className="text-xs uppercase tracking-widest text-doc-muted mb-1">Minit Mesyuarat Rasmi</p>
          <h3 className="text-lg font-bold uppercase tracking-wide text-doc-ink">
            {formData.meeting_title || 'MINIT MESYUARAT'}
          </h3>
          {formData.meeting_number && (
            <p className="text-sm font-semibold text-doc-muted mt-1">Bilangan {formData.meeting_number}</p>
          )}
        </header>

        <table className="w-full text-xs mb-8">
          <tbody>
            {[
              ['Tarikh',    displayDate(formData.date)],
              ['Tempat',    formData.location || '-'],
              ['Masa',      formData.start_time
                              ? `${formData.start_time}${formData.end_time ? ` – ${formData.end_time}` : ''}`
                              : '-'],
              ['Pengerusi', [formData.chairperson_name, formData.chairperson_role].filter(Boolean).join(', ') || '-'],
              ['Pencatat',  [formData.secretary_name,   formData.secretary_role  ].filter(Boolean).join(', ') || '-'],
            ].map(([k, v]) => (
              <tr key={k}>
                <th scope="row" className="py-1.5 text-left font-bold text-doc-ink w-32">{k}</th>
                <td className="py-1.5 text-doc-ink">: {v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-8 text-xs leading-relaxed">
          {/* 1. Kehadiran */}
          <section>
            <h4 className={sectionHeadingCls}>1.0 Kehadiran</h4>
            {participants.length ? (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-doc-rule uppercase text-doc-ink">
                    <th scope="col" className="p-2 text-center w-8">Bil.</th>
                    <th scope="col" className="p-2 text-left">Nama</th>
                    <th scope="col" className="p-2 text-left">Jawatan</th>
                    <th scope="col" className="p-2 text-left">Organisasi / Bahagian</th>
                    <th scope="col" className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p, i) => (
                    <tr key={i}>
                      <td className="p-2 text-center text-doc-muted">{i + 1}.</td>
                      <td className="p-2 font-semibold">{p.name || '-'}</td>
                      {/* position is the in-form key for jawatan */}
                      <td className="p-2">{p.position || '-'}</td>
                      <td className="p-2">{p.organisation || '-'}</td>
                      <td className="p-2">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="italic text-doc-muted">Tiada rekod kehadiran.</p>
            )}
          </section>

          {/* 2. Perkara Berbangkit */}
          {hasMatters && (
            <section>
              <h4 className={sectionHeadingCls}>2.0 Perkara Berbangkit</h4>
              <p className="text-doc-ink whitespace-pre-line leading-relaxed">{formData.matters_arising}</p>
            </section>
          )}

          {/* 3. Perbincangan */}
          <section>
            <h4 className={sectionHeadingCls}>
              {hasMatters ? '3.0' : '2.0'} Perkara-perkara Dibincangkan
            </h4>
            {agendaItems.length ? (
              agendaItems.map((ag, idx) => (
                <div key={idx} className="mb-6">
                  <p className="font-bold text-doc-ink mb-2">
                    {(hasMatters ? 3 : 2)}.{idx + 1} {ag.title}
                  </p>
                  <p className="text-doc-ink pl-4 whitespace-pre-line leading-relaxed">{ag.summary}</p>
                  {ag.decision && (
                    <div className="mt-3 ml-4 p-3 border border-doc-rule">
                      <p className="font-bold text-doc-ink mb-1">Keputusan / Ketetapan:</p>
                      <p className="text-doc-ink whitespace-pre-line">{ag.decision}</p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="italic text-doc-muted">Tiada perkara perbincangan direkodkan.</p>
            )}
          </section>

          {/* 4. Tindakan Susulan */}
          <section>
            <h4 className={sectionHeadingCls}>
              {hasMatters ? '4.0' : '3.0'} Matriks Tindakan Susulan
            </h4>
            {actionItems.length ? (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-doc-rule uppercase tracking-wide text-doc-ink">
                    <th scope="col" className="p-2.5 text-center w-8">Bil.</th>
                    <th scope="col" className="p-2.5 text-left">Tindakan</th>
                    <th scope="col" className="p-2.5 text-left w-44">Tanggungjawab</th>
                    <th scope="col" className="p-2.5 text-center w-28">Tarikh Akhir</th>
                    <th scope="col" className="p-2.5 text-center w-28">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {actionItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 text-center text-doc-muted">{idx + 1}.</td>
                      <td className="p-2.5 font-medium">{item.task}</td>
                      <td className="p-2.5">
                        {item.assignee || <span className="italic text-doc-muted">Belum Ditetapkan</span>}
                      </td>
                      <td className="p-2.5 text-center">{displayDate(item.deadline)}</td>
                      <td className="p-2.5 text-center">{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="italic text-doc-muted">Tiada tindakan susulan direkodkan.</p>
            )}
          </section>
        </div>

        {/* Signature block */}
        <div className="mt-12 grid grid-cols-2 gap-16 text-xs">
          {[
            { label: 'Pengerusi',      name: formData.chairperson_name, role: formData.chairperson_role },
            { label: 'Pencatat Minit', name: formData.secretary_name,   role: formData.secretary_role   },
          ].map((sig) => (
            <div key={sig.label}>
              <div className="border-b border-doc-rule mt-10 mb-2" />
              <p className="font-bold">{sig.name || '( )'}</p>
              {sig.role && <p className="text-doc-muted">{sig.role}</p>}
              <p className="text-doc-muted mt-1">{sig.label}</p>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

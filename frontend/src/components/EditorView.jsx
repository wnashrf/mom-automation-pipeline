import React, { useState } from 'react';

export default function EditorView({ meeting, previewMode, setPreviewMode, onBack }) {
  const [formData, setFormData] = useState({
    id: meeting?.id || null,
    meeting_title: meeting?.meeting_title || '',
    meeting_number: meeting?.meeting_number || '',
    location: meeting?.location || '',
    date: meeting?.date || '',
    start_time: meeting?.start_time || '',
    end_time: meeting?.end_time || '',
    chairperson_name: meeting?.chairperson_name || '',
    chairperson_role: meeting?.chairperson_role || '',
    participants: meeting?.participants || [],
    agenda_items: meeting?.agenda_items || [],
    action_items: meeting?.action_items || [],
    raw_transcript: meeting?.raw_transcript || '',
  });

  const [newParticipant, setNewParticipant] = useState({ label: '', department: '' });

  // Update Field Helper
  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Participant Handlers
  const addParticipant = () => {
    if (!newParticipant.label.trim()) return;
    setFormData((prev) => ({
      ...prev,
      participants: [...prev.participants, { ...newParticipant }],
    }));
    setNewParticipant({ label: '', department: '' });
  };

  const removeParticipant = (idx) => {
    setFormData((prev) => ({
      ...prev,
      participants: prev.participants.filter((_, i) => i !== idx),
    }));
  };

  // Agenda Handlers
  const addAgendaItem = () => {
    setFormData((prev) => ({
      ...prev,
      agenda_items: [...prev.agenda_items, { title: '', summary: '', decision: '' }],
    }));
  };

  const updateAgendaItem = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.agenda_items];
      updated[index][field] = value;
      return { ...prev, agenda_items: updated };
    });
  };

  const removeAgendaItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      agenda_items: prev.agenda_items.filter((_, i) => i !== index),
    }));
  };

  // Action Item Handlers
  const addActionItem = () => {
    setFormData((prev) => ({
      ...prev,
      action_items: [...prev.action_items, { task: '', assignee: '', deadline: '', status: 'Belum Mula' }],
    }));
  };

  const updateActionItem = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.action_items];
      updated[index][field] = value;
      return { ...prev, action_items: updated };
    });
  };

  const removeActionItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      action_items: prev.action_items.filter((_, i) => i !== index),
    }));
  };

  // Save to Backend
  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        meeting_title: formData.meeting_title || 'Mesyuarat Tanpa Tajuk',
        status: 'Selesai',
      };

      const res = await fetch('/api/meetings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Gagal menyimpan rekod ke pelayan.');
      alert('Minit mesyuarat berjaya disimpan!');
      onBack();
    } catch (err) {
      alert('Ralat menyimpan minit: ' + err.message);
    }
  };

  return (
    <section className="space-y-6">
      {/* Top Controls */}
      <div className="flex justify-between items-center">
        <button
          onClick={onBack}
          className="text-xs bg-gray-600 hover:bg-gray-700 text-white font-semibold px-4 py-2 rounded shadow transition"
        >
          ← Kembali ke Dashboard
        </button>
        <div className="space-x-2">
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded shadow transition"
          >
            {previewMode ? 'Kembali ke Borang' : 'Pratonton Dokumen Rasmi'}
          </button>
          {!previewMode && (
            <button
              onClick={handleSave}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded shadow transition"
            >
              Simpan Draf ke Sejarah
            </button>
          )}
        </div>
      </div>

      {/* VIEW A: EDITABLE FORM */}
      {!previewMode ? (
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Maklumat Mesyuarat</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tajuk Mesyuarat *</label>
              <input
                type="text"
                value={formData.meeting_title}
                onChange={(e) => updateField('meeting_title', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Bilangan Mesyuarat</label>
                <input
                  type="text"
                  value={formData.meeting_number}
                  onChange={(e) => updateField('meeting_number', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tempat</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => updateField('location', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tarikh</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => updateField('date', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Masa Mula</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => updateField('start_time', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Masa Tamat</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => updateField('end_time', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-xs"
                />
              </div>
            </div>
          </div>

          {/* Chairperson Card */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 border-b pb-2">Pengerusi & Pencatat</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nama Pengerusi</label>
                <input
                  type="text"
                  value={formData.chairperson_name}
                  onChange={(e) => updateField('chairperson_name', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Jawatan Pengerusi</label>
                <input
                  type="text"
                  value={formData.chairperson_role}
                  onChange={(e) => updateField('chairperson_role', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-xs"
                />
              </div>
            </div>
          </div>

          {/* Participants Badges */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Kehadiran Mesyuarat</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nama Pegawai..."
                value={newParticipant.label}
                onChange={(e) => setNewParticipant((prev) => ({ ...prev, label: e.target.value }))}
                className="p-1.5 border border-gray-300 rounded text-xs flex-1"
              />
              <input
                type="text"
                placeholder="Bahagian / Jabatan..."
                value={newParticipant.department}
                onChange={(e) => setNewParticipant((prev) => ({ ...prev, department: e.target.value }))}
                className="p-1.5 border border-gray-300 rounded text-xs w-48"
              />
              <button
                type="button"
                onClick={addParticipant}
                className="text-xs bg-gray-100 hover:bg-gray-200 border px-3 py-1 rounded font-semibold text-gray-700"
              >
                + Tambah
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {formData.participants.map((p, idx) => (
                <div key={idx} className="inline-flex items-center bg-blue-50 border border-blue-200 text-blue-900 rounded px-3 py-1 text-xs gap-2">
                  <span className="font-semibold">{p.label || 'Nama Pegawai'}</span>
                  {p.department && <span className="text-blue-500 text-[10px]">({p.department})</span>}
                  <button type="button" onClick={() => removeParticipant(idx)} className="text-blue-400 hover:text-red-600 font-bold ml-1">
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Agenda & Decisions */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Perkara-perkara Perbincangan & Keputusan</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Format perbincangan dan ketetapan selaras dengan PKPA Bil. 2/1991.</p>
              </div>
              <button
                type="button"
                onClick={addAgendaItem}
                className="text-xs bg-gray-100 hover:bg-gray-200 border px-3 py-1 rounded font-semibold"
              >
                + Tambah Perkara
              </button>
            </div>
            <div className="space-y-4">
              {formData.agenda_items.map((ag, idx) => (
                <div key={idx} className="p-4 rounded border border-gray-200 bg-gray-50/50 space-y-2 relative">
                  <button
                    type="button"
                    onClick={() => removeAgendaItem(idx)}
                    className="absolute top-2 right-3 text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Padam
                  </button>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-gray-600 mb-1">Tajuk Perkara</label>
                    <input
                      type="text"
                      value={ag.title}
                      onChange={(e) => updateAgendaItem(idx, 'title', e.target.value)}
                      className="w-full bg-white p-2 border border-gray-300 rounded text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-gray-600 mb-1">Ringkasan Perbincangan</label>
                    <textarea
                      rows={3}
                      value={ag.summary}
                      onChange={(e) => updateAgendaItem(idx, 'summary', e.target.value)}
                      className="w-full bg-white p-2 border border-gray-300 rounded text-xs leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-emerald-700 mb-1">Keputusan / Ketetapan Mesyuarat</label>
                    <textarea
                      rows={2}
                      value={ag.decision}
                      onChange={(e) => updateAgendaItem(idx, 'decision', e.target.value)}
                      className="w-full bg-white p-2 border border-emerald-300 rounded text-xs text-gray-800"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Items Table */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Senarai Tindakan Susulan</h3>
              <button
                type="button"
                onClick={addActionItem}
                className="text-xs bg-gray-100 hover:bg-gray-200 border px-3 py-1 rounded font-semibold"
              >
                + Tambah Tindakan
              </button>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 uppercase text-gray-500 font-semibold border-b">
                <tr>
                  <th className="p-2 w-1/2">Tindakan / Tugas</th>
                  <th className="p-2">Pegawai</th>
                  <th className="p-2">Tarikh Akhir</th>
                  <th className="p-2 text-center">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {formData.action_items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.task}
                        onChange={(e) => updateActionItem(idx, 'task', e.target.value)}
                        placeholder="Deskripsi tugasan..."
                        className="w-full border rounded p-1.5 text-xs border-gray-300 focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.assignee}
                        onChange={(e) => updateActionItem(idx, 'assignee', e.target.value)}
                        placeholder="Tugaskan pegawai..."
                        className={`w-full border rounded p-1.5 text-xs focus:ring-1 focus:ring-blue-500 ${
                          !item.assignee ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'
                        }`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.deadline}
                        onChange={(e) => updateActionItem(idx, 'deadline', e.target.value)}
                        placeholder="YYYY-MM-DD..."
                        className={`w-full border rounded p-1.5 text-xs focus:ring-1 focus:ring-blue-500 ${
                          !item.deadline ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'
                        }`}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeActionItem(idx)}
                        className="text-red-600 text-xs hover:underline font-semibold"
                      >
                        Padam
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VIEW B: OFFICIAL PKPA PRINTABLE PREVIEW */
        <div className="bg-white p-8 rounded-lg border border-gray-200 shadow-sm font-serif">
          <div className="text-center border-b pb-4 mb-6">
            <h2 className="text-xl font-bold uppercase tracking-wide text-gray-900">
              {formData.meeting_title || 'MINIT MESYUARAT'}
            </h2>
            <p className="text-xs font-semibold text-gray-600 mt-1">
              BILANGAN: {formData.meeting_number || '-'}
            </p>
          </div>

          <table className="w-full text-xs mb-6 border-collapse font-sans">
            <tbody>
              <tr>
                <td className="font-bold py-1 w-24">Tarikh</td>
                <td>: {formData.date || '-'}</td>
              </tr>
              <tr>
                <td className="font-bold py-1">Tempat</td>
                <td>: {formData.location || '-'}</td>
              </tr>
              <tr>
                <td className="font-bold py-1">Pengerusi</td>
                <td>
                  : {formData.chairperson_name || '-'}
                  {formData.chairperson_role ? ` (${formData.chairperson_role})` : ''}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="space-y-6 text-xs text-gray-800 leading-relaxed font-sans">
            <div>
              <h4 className="font-bold text-xs uppercase border-b pb-1 text-[#1b3a5b] mb-2">1.0 KEHADIRAN</h4>
              <ol className="list-decimal pl-5 space-y-1">
                {formData.participants.length ? (
                  formData.participants.map((p, idx) => (
                    <li key={idx}>
                      {p.label} {p.department && `(${p.department})`}
                    </li>
                  ))
                ) : (
                  <li className="italic text-gray-500">Tiada rekod kehadiran.</li>
                )}
              </ol>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase border-b pb-1 text-[#1b3a5b] mb-2">
                2.0 PERKARA-PERKARA BERBANGKIT & PERBINCANGAN
              </h4>
              {formData.agenda_items.length ? (
                formData.agenda_items.map((ag, idx) => (
                  <div key={idx} className="mb-4">
                    <p className="font-bold text-gray-900">
                      {idx + 1}.0 {ag.title}
                    </p>
                    <p className="text-gray-700 pl-4 mt-1 leading-relaxed whitespace-pre-line">{ag.summary}</p>
                    {ag.decision && (
                      <div className="mt-2 pl-4 text-emerald-950 bg-emerald-50/70 p-2.5 rounded border border-emerald-200">
                        <strong>Tindakan / Ketetapan:</strong>
                        <div className="whitespace-pre-line mt-1">{ag.decision}</div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="italic text-gray-500">Tiada perkara perbincangan direkodkan.</p>
              )}
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase border-b pb-1 text-[#1b3a5b] mb-2">
                3.0 MATRIKS TINDAKAN SUSULAN
              </h4>
              <table className="w-full text-left text-xs border border-gray-200 mt-2">
                <thead className="bg-gray-100 uppercase text-gray-600 font-bold border-b">
                  <tr>
                    <th className="p-2 text-center w-10">Bil</th>
                    <th className="p-2">Tugasan</th>
                    <th className="p-2 w-44">Tindakan Oleh</th>
                    <th className="p-2 w-28 text-center">Tarikh Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {formData.action_items.length ? (
                    formData.action_items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 text-center align-top">{idx + 1}.</td>
                        <td className="p-2 align-top font-medium">{item.task}</td>
                        <td className="p-2 align-top">{item.assignee || 'Belum Ditetapkan'}</td>
                        <td className="p-2 align-top text-center">{item.deadline || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-gray-500 italic">
                        Tiada tindakan susulan direkodkan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
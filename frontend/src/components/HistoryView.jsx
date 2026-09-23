import React, { useState } from 'react';

export default function HistoryView({ meetings, onSelectMeeting, onEditMeeting, onDeleteMeeting }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const total = meetings.length;
  const draftCount = meetings.filter(m => m.status === 'Draf').length;
  const completedCount = meetings.filter(m => m.status === 'Selesai').length;

  const filtered = meetings.filter(m => {
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    const term = searchTerm.toLowerCase();
    const matchesSearch = (
      (m.meeting_title || '').toLowerCase().includes(term) ||
      (m.chairperson_name || '').toLowerCase().includes(term) ||
      (m.location || '').toLowerCase().includes(term) ||
      (m.date || '').toLowerCase().includes(term)
    );
    return matchesStatus && matchesSearch;
  });

  return (
    <section className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-lg border border-gray-200 text-center shadow-sm">
          <p className="text-2xl font-black text-blue-900">{total}</p>
          <p className="text-xs font-semibold text-gray-500 mt-1">Jumlah Minit</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-gray-200 text-center shadow-sm">
          <p className="text-2xl font-black text-amber-600">{draftCount}</p>
          <p className="text-xs font-semibold text-gray-500 mt-1">Draf</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-gray-200 text-center shadow-sm">
          <p className="text-2xl font-black text-emerald-600">{completedCount}</p>
          <p className="text-xs font-semibold text-gray-500 mt-1">Selesai</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-2 justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <input
          type="text"
          placeholder="Cari mengikut tajuk, pengerusi, tempat, tarikh..."
          className="p-2 border border-gray-300 rounded text-xs w-full md:w-80"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="flex space-x-1">
          {['all', 'Draf', 'Selesai'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded border ${
                statusFilter === s ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700' : 'border-gray-300 hover:bg-gray-50 text-gray-600'
              }`}
            >
              {s === 'all' ? 'Semua' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Meeting Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">Tiada rekod minit mesyuarat dijumpai.</p>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-bold text-gray-800">{m.meeting_title}</h4>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      m.status === 'Selesai'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {m.status || 'Draf'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {m.date || 'Tarikh tidak dinyatakan'} | {m.location || 'Tempat tidak dinyatakan'}
                </p>
              </div>
              <div className="flex space-x-1">
                <button
                  onClick={() => onSelectMeeting(m.id)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded border"
                >
                  Lihat
                </button>
                <button
                  onClick={() => onEditMeeting(m.id)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded border"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDeleteMeeting(m.id)}
                  className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded border border-red-200"
                >
                  Padam
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
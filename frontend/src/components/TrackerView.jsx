import React from 'react';

export default function TrackerView({ meetings, onBack }) {
  let total = 0;
  let notStarted = 0;
  let inProgress = 0;
  let overdue = 0;

  meetings.forEach((m) => {
    (m.action_items || []).forEach((item) => {
      total++;
      if (item.status === 'Sedang Berjalan') inProgress++;
      else if (item.status === 'Tertunggak') overdue++;
      else notStarted++;
    });
  });

  const rate = total > 0 ? Math.round(((total - overdue - notStarted) / total) * 100) : 0;

  return (
    <section className="space-y-6">
      <div className="flex justify-start">
        <button
          onClick={onBack}
          className="text-xs bg-gray-600 hover:bg-gray-700 text-white font-semibold px-4 py-2 rounded shadow transition"
        >
          ← Kembali ke Dashboard
        </button>
      </div>

      {/* Tracker KPI Counters */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-800">{total}</p>
          <p className="text-xs text-gray-500 mt-1">Jumlah</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
          <p className="text-2xl font-bold text-emerald-600">{notStarted}</p>
          <p className="text-xs text-gray-500 mt-1">Belum Mula</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200 text-center shadow-sm">
          <p className="text-2xl font-bold text-blue-600">{inProgress}</p>
          <p className="text-xs text-gray-500 mt-1">Sedang Berjalan</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-red-200 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-600">{overdue}</p>
          <p className="text-xs text-gray-500 mt-1">Tertunggak</p>
        </div>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col items-center justify-center">
          <h3 className="text-xs font-bold uppercase text-gray-600 mb-6">Status Tindakan Susulan</h3>
          <div className="w-full max-w-xs space-y-3">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-emerald-700">Belum Mula</span>
                <span>{notStarted} ({total > 0 ? Math.round((notStarted / total) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${total > 0 ? (notStarted / total) * 100 : 0}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-blue-700">Sedang Berjalan</span>
                <span>{inProgress} ({total > 0 ? Math.round((inProgress / total) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${total > 0 ? (inProgress / total) * 100 : 0}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-red-700">Tertunggak</span>
                <span>{overdue} ({total > 0 ? Math.round((overdue / total) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-red-500 h-2 rounded-full" style={{ width: `${total > 0 ? (overdue / total) * 100 : 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-center">
          <h3 className="text-xs font-bold uppercase text-gray-600 mb-2">Kadar Penyelesaian</h3>
          <p className="text-4xl font-extrabold text-blue-900 mb-4">{rate}%</p>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="bg-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: `${rate}%` }}></div>
          </div>
        </div>
      </div>
    </section>
  );
}
import React from 'react';

export default function Navigation({ currentView, setView, onNewMeeting }) {
  const titles = {
    history: 'Sejarah Minit Mesyuarat',
    tracker: 'Penjejak Tindakan Susulan',
    ingest: 'Pengekstrak Minit & Audio AI',
    editor: 'Borang Minit Mesyuarat'
  };

  return (
    <nav className="max-w-6xl mx-auto w-full px-4 mt-6 flex justify-between items-center">
      <h2 className="text-lg font-bold text-gray-700">{titles[currentView]}</h2>
      <div className="flex space-x-2">
        <button
          onClick={() => setView('tracker')}
          className={`text-xs font-semibold px-4 py-2 rounded shadow transition ${
            currentView === 'tracker' ? 'bg-amber-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'
          }`}
        >
          Penjejak Tindakan
        </button>
        <button
          onClick={() => setView('ingest')}
          className={`text-xs font-semibold px-4 py-2 rounded shadow transition ${
            currentView === 'ingest' ? 'bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          AI Ekstrak / Fail
        </button>
        <button
          onClick={onNewMeeting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded shadow transition"
        >
          + Minit Baharu
        </button>
      </div>
    </nav>
  );
}
import React from 'react';

export default function Navigation({ currentView, setView, onNewMeeting }) {
  const NavCard = ({ onClick, active, icon, title, subtitle, color }) => (
    <button
      onClick={onClick}
      className={`
        group relative overflow-hidden rounded-2xl p-5 transition-all duration-300
        ${active
          ? `bg-gradient-to-br ${color} text-white shadow-2xl scale-105`
          : 'bg-white hover:bg-gray-50 text-gray-700 shadow-lg hover:shadow-xl hover:scale-105'
        }
      `}
    >
      <div className="flex items-start gap-4">
        <div className={`
          text-4xl p-3 rounded-xl transition-all
          ${active ? 'bg-white/20' : 'bg-gray-100 group-hover:bg-gray-200'}
        `}>
          {icon}
        </div>
        <div className="text-left flex-1">
          <div className="font-bold text-base mb-1">{title}</div>
          <div className={`text-xs ${active ? 'text-white/80' : 'text-gray-500'}`}>
            {subtitle}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <NavCard
          onClick={() => setView('history')}
          active={currentView === 'history'}
          icon="📚"
          title="Sejarah"
          subtitle="Lihat semua minit mesyuarat"
          color="from-purple-600 to-indigo-600"
        />

        <NavCard
          onClick={() => setView('tracker')}
          active={currentView === 'tracker'}
          icon="📊"
          title="Penjejak"
          subtitle="Pantau tindakan susulan"
          color="from-violet-600 to-purple-600"
        />

        <NavCard
          onClick={() => setView('ingest')}
          active={currentView === 'ingest'}
          icon="🤖"
          title="Ekstrak AI"
          subtitle="Proses audio & teks"
          color="from-indigo-600 to-blue-600"
        />

        <NavCard
          onClick={onNewMeeting}
          active={currentView === 'editor'}
          icon="✨"
          title="Minit Baharu"
          subtitle="Cipta dari awal"
          color="from-fuchsia-600 to-pink-600"
        />
      </div>
    </div>
  );
}

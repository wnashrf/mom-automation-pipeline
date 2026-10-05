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
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
      {/* Left Sidebar - Stats & Filters */}
      <div className="lg:col-span-1 space-y-6">
        {/* Quick Stats */}
        <div className="bg-white rounded-2xl p-6 shadow-xl border border-purple-100">
          <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Overview
          </h3>
          
          <div className="space-y-4">
            <div className="group cursor-pointer p-4 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 hover:shadow-lg transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">📋</span>
                <span className="text-3xl font-black text-purple-900">{total}</span>
              </div>
              <div className="text-xs font-bold text-purple-700 uppercase">Jumlah Mesyuarat</div>
            </div>
            
            <div className="group cursor-pointer p-4 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100 hover:shadow-lg transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">✏️</span>
                <span className="text-3xl font-black text-amber-900">{draftCount}</span>
              </div>
              <div className="text-xs font-bold text-amber-700 uppercase">Draf</div>
            </div>
            
            <div className="group cursor-pointer p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100 hover:shadow-lg transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">✓</span>
                <span className="text-3xl font-black text-emerald-900">{completedCount}</span>
              </div>
              <div className="text-xs font-bold text-emerald-700 uppercase">Selesai</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-6 shadow-xl border border-purple-100">
          <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Tapis Mengikut Status
          </h3>
          
          <div className="space-y-2">
            {[
              { key: 'all', label: 'Semua Mesyuarat', icon: '📁', count: total },
              { key: 'Draf', label: 'Draf', icon: '✏️', count: draftCount },
              { key: 'Selesai', label: 'Selesai', icon: '✓', count: completedCount }
            ].map((filter) => (
              <button
                key={filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-between ${
                  statusFilter === filter.key
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>{filter.icon}</span>
                  {filter.label}
                </span>
                <span className={`px-2 py-1 rounded-lg text-xs font-black ${
                  statusFilter === filter.key ? 'bg-white/20' : 'bg-gray-200 text-gray-600'
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="lg:col-span-3 space-y-6">
        {/* Search Bar */}
        <div className="bg-white rounded-2xl p-6 shadow-xl border border-purple-100">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cari mengikut tajuk, pengerusi, tempat, atau tarikh..."
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Meeting Cards */}
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center shadow-xl border border-purple-100">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-purple-100 rounded-full mb-4">
                <svg className="w-10 h-10 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Tiada mesyuarat dijumpai</h3>
              <p className="text-sm text-gray-500">Cuba laraskan carian atau penapis anda</p>
            </div>
          ) : (
            filtered.map((m) => (
              <div
                key={m.id}
                className="group bg-white rounded-2xl p-6 shadow-lg border border-purple-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between gap-6">
                  {/* Meeting Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-4 mb-3">
                      <div className="p-3 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-xl">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-bold text-gray-900">{m.meeting_title}</h4>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              m.status === 'Selesai'
                                ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 border border-emerald-200'
                                : 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {m.status || 'Draf'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">{m.date || 'No date'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="font-medium">{m.location || 'No location'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => onSelectMeeting(m.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-sm shadow-lg transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Lihat
                    </button>
                    <button
                      onClick={() => onEditMeeting(m.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <a
                      href={`/api/meetings/${m.id}/export`}
                      download
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-semibold text-sm transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Muat Turun DOCX
                    </a>
                    <button
                      onClick={() => onDeleteMeeting(m.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-semibold text-sm transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Padam
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
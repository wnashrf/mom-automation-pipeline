import React, { useState, useEffect } from 'react';

export default function TrackerView({ meetings, onBack }) {
  const [localMeetings, setLocalMeetings] = useState(meetings);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  useEffect(() => {
    setLocalMeetings(meetings);
  }, [meetings]);

  // Helper to check if a date is overdue
  const isOverdue = (deadline, status) => {
    if (!deadline || status === 'Selesai') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);
    return deadlineDate < today;
  };

  // Calculate stats with overdue detection
  let total = 0;
  let belumMula = 0;
  let sedangBerjalan = 0;
  let tertunggak = 0;
  let selesai = 0;

  const enrichedMeetings = localMeetings.map(meeting => ({
    ...meeting,
    action_items: (meeting.action_items || []).map(item => ({
      ...item,
      isOverdue: isOverdue(item.deadline, item.status)
    }))
  }));

  enrichedMeetings.forEach((m) => {
    (m.action_items || []).forEach((item) => {
      total++;
      if (item.isOverdue) {
        tertunggak++;
      } else if (item.status === 'Sedang Berjalan') {
        sedangBerjalan++;
      } else if (item.status === 'Selesai') {
        selesai++;
      } else {
        belumMula++;
      }
    });
  });

  const rate = total > 0 ? Math.round((selesai / total) * 100) : 0;

  // Filter action items
  const filteredItems = enrichedMeetings.flatMap(meeting =>
    (meeting.action_items || []).map((item, idx) => ({
      ...item,
      meetingId: meeting.id,
      meetingTitle: meeting.meeting_title,
      actionIndex: idx
    }))
  ).filter(item => {
    // Status filter
    let statusMatch = true;
    if (statusFilter === 'Belum Mula') statusMatch = !item.isOverdue && item.status === 'Belum Mula';
    else if (statusFilter === 'Sedang Berjalan') statusMatch = !item.isOverdue && item.status === 'Sedang Berjalan';
    else if (statusFilter === 'Tertunggak') statusMatch = item.isOverdue;
    else if (statusFilter === 'Selesai') statusMatch = item.status === 'Selesai';

    // Text search
    const term = searchTerm.toLowerCase();
    const textMatch = !searchTerm || 
      (item.task || '').toLowerCase().includes(term) ||
      (item.assignee || '').toLowerCase().includes(term) ||
      (item.meetingTitle || '').toLowerCase().includes(term);

    return statusMatch && textMatch;
  });

  const handleStatusChange = async (meetingId, actionIndex, newStatus) => {
    // Update local state immediately
    setLocalMeetings(prev => prev.map(meeting => {
      if (meeting.id === meetingId) {
        const updatedActionItems = [...meeting.action_items];
        updatedActionItems[actionIndex] = {
          ...updatedActionItems[actionIndex],
          status: newStatus
        };
        return { ...meeting, action_items: updatedActionItems };
      }
      return meeting;
    }));

    // Persist to backend
    try {
      const meeting = localMeetings.find(m => m.id === meetingId);
      if (!meeting) return;

      const updatedMeeting = {
        ...meeting,
        action_items: meeting.action_items.map((item, idx) =>
          idx === actionIndex ? { ...item, status: newStatus } : item
        )
      };

      await fetch('/api/meetings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedMeeting)
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const StatusCard = ({ title, value, total, icon, gradient, textColor }) => {
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
      <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} rounded-2xl p-6 shadow-xl border border-white/20`}>
        <div className="absolute -right-6 -top-6 text-8xl opacity-10">{icon}</div>
        <div className="relative z-10">
          <div className={`text-5xl font-black ${textColor} mb-2`}>{value}</div>
          <div className="text-sm font-bold text-gray-700 mb-3">{title}</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/40 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${textColor.replace('text-', 'bg-')}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-700">{percentage}%</span>
          </div>
        </div>
      </div>
    );
  };

  const getStatusColor = (status, isOverdue) => {
    if (isOverdue) return 'bg-red-100 text-red-800 border-red-300';
    if (status === 'Selesai') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (status === 'Sedang Berjalan') return 'bg-blue-100 text-blue-800 border-blue-300';
    return 'bg-slate-100 text-slate-800 border-slate-300';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard
          title="Jumlah"
          value={total}
          total={total}
          icon="📊"
          gradient="from-purple-100 via-indigo-100 to-purple-100"
          textColor="text-purple-900"
        />
        <StatusCard
          title="Belum Mula"
          value={belumMula}
          total={total}
          icon="⏳"
          gradient="from-slate-100 via-gray-100 to-slate-100"
          textColor="text-slate-700"
        />
        <StatusCard
          title="Sedang Berjalan"
          value={sedangBerjalan}
          total={total}
          icon="⚡"
          gradient="from-blue-100 via-cyan-100 to-blue-100"
          textColor="text-blue-700"
        />
        <StatusCard
          title="Tertunggak"
          value={tertunggak}
          total={total}
          icon="🚨"
          gradient="from-red-100 via-rose-100 to-red-100"
          textColor="text-red-700"
        />
      </div>

      {/* Completion Rate & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Completion Rate */}
        <div className="lg:col-span-1 bg-gradient-to-br from-purple-600 via-indigo-600 to-violet-600 rounded-2xl p-8 shadow-2xl text-white relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-lg">Kadar Penyelesaian</h3>
            </div>
            
            <div className="flex flex-col items-center py-8">
              <div className="relative w-48 h-48">
                <svg className="transform -rotate-90 w-48 h-48">
                  <circle cx="96" cy="96" r="88" stroke="white" strokeOpacity="0.2" strokeWidth="16" fill="none" />
                  <circle 
                    cx="96" 
                    cy="96" 
                    r="88" 
                    stroke="white"
                    strokeWidth="16" 
                    fill="none" 
                    strokeDasharray={`${2 * Math.PI * 88}`}
                    strokeDashoffset={`${2 * Math.PI * 88 * (1 - rate / 100)}`}
                    className="transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-6xl font-black">{rate}%</span>
                  <span className="text-sm font-medium text-white/80">Selesai</span>
                </div>
              </div>
            </div>
            
            <div className="text-center text-sm font-medium text-white/90">
              {selesai} daripada {total} tindakan selesai
            </div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-8 shadow-xl border border-purple-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-xl">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900">Taburan Status</h3>
          </div>
          
          <div className="space-y-6">
            {[
              { label: 'Belum Mula', value: belumMula, color: 'slate', bgColor: 'bg-slate-500', lightBg: 'bg-slate-50' },
              { label: 'Sedang Berjalan', value: sedangBerjalan, color: 'blue', bgColor: 'bg-blue-500', lightBg: 'bg-blue-50' },
              { label: 'Tertunggak', value: tertunggak, color: 'red', bgColor: 'bg-red-500', lightBg: 'bg-red-50' },
              { label: 'Selesai', value: selesai, color: 'emerald', bgColor: 'bg-emerald-500', lightBg: 'bg-emerald-50' }
            ].map((item) => {
              const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.label} className={`p-4 rounded-xl ${item.lightBg} border border-${item.color}-200`}>
                  <div className="flex justify-between items-center mb-3">
                    <span className={`font-bold text-${item.color}-900`}>{item.label}</span>
                    <div className={`px-4 py-1.5 ${item.lightBg} border border-${item.color}-300 rounded-lg`}>
                      <span className={`text-lg font-black text-${item.color}-900`}>{item.value}</span>
                      <span className="text-sm text-gray-600 ml-2">({percentage}%)</span>
                    </div>
                  </div>
                  <div className="relative w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div 
                      className={`${item.bgColor} h-4 rounded-full transition-all duration-1000 ease-out relative`}
                      style={{ width: `${percentage}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl p-6 shadow-xl border border-purple-100">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cari tugasan, pegawai, atau mesyuarat..."
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="all">Semua Status</option>
            <option value="Belum Mula">Belum Mula</option>
            <option value="Sedang Berjalan">Sedang Berjalan</option>
            <option value="Tertunggak">Tertunggak</option>
            <option value="Selesai">Selesai</option>
          </select>
        </div>
      </div>

      {/* Action Items List */}
      <div className="bg-white rounded-2xl p-8 shadow-xl border border-purple-100">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Senarai Tindakan Susulan</h3>
              <p className="text-xs text-gray-500 mt-0.5">{filteredItems.length} daripada {total} tindakan dipaparkan</p>
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="mx-auto w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-semibold">Tiada tindakan susulan dijumpai</p>
            <p className="text-xs text-gray-400 mt-1">Cuba laraskan carian atau penapis</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <div key={`${item.meetingId}-${item.actionIndex}`} className="flex flex-col md:flex-row md:items-start gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-purple-300 hover:shadow-lg transition-all">
                <div className="flex-1 space-y-3">
                  <div>
                    <h4 className="font-bold text-gray-900 text-base mb-2">{item.task}</h4>
                    {item.isOverdue && (
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 border-2 border-red-300 rounded-lg mb-2">
                        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-black text-red-700 uppercase">TERTUNGGAK</span>
                        {item.deadline && <span className="text-xs font-bold text-red-600">· {formatDate(item.deadline)}</span>}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="font-semibold">Tanggungjawab:</span>
                      <span className="font-medium">{item.assignee || 'Belum Ditetapkan'}</span>
                    </div>
                    
                    {item.deadline && !item.isOverdue && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="font-semibold">Tarikh Akhir:</span>
                        <span className="font-medium">{formatDate(item.deadline)}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 text-gray-500 text-xs">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>{item.meetingTitle}</span>
                    </div>
                  </div>
                </div>
                
                <div className="md:min-w-[200px]">
                  <label className="block text-xs font-bold text-gray-600 mb-2 uppercase">Status Tindakan</label>
                  <select
                    value={item.status || 'Belum Mula'}
                    onChange={(e) => handleStatusChange(item.meetingId, item.actionIndex, e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl border-2 font-bold text-sm transition-all cursor-pointer ${getStatusColor(item.status, item.isOverdue)}`}
                  >
                    <option value="Belum Mula">Belum Mula</option>
                    <option value="Sedang Berjalan">Sedang Berjalan</option>
                    <option value="Selesai">Selesai</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

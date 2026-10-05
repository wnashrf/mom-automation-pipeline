import React from 'react';

export default function Header() {
  return (
    <header className="relative bg-gradient-to-br from-indigo-950 via-purple-900 to-violet-950 text-white py-8 px-8 shadow-2xl">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-500/30 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>
      
      <div className="relative max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20">
            <svg className="w-10 h-10 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              Penjana Minit Mesyuarat
            </h1>
            <p className="text-sm text-purple-200 mt-1 font-medium">
              Sistem Automasi Minit Mesyuarat Bertenaga AI · Sektor Awam Malaysia
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
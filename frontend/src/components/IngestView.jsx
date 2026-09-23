import React, { useState, useRef } from 'react';

export default function IngestView({ onExtracted, onBack }) {
  const [transcript, setTranscript] = useState('');
  const [fileStatus, setFileStatus] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (file) => {
    if (!file) return;

    if (file.name.endsWith('.txt')) {
      setFileStatus(`Membaca fail teks: ${file.name}...`);
      try {
        const text = await file.text();
        setTranscript(text);
        setFileStatus(`Fail teks dimuatkan: ${file.name}`);
      } catch (err) {
        alert('Gagal membaca fail teks: ' + err.message);
        setFileStatus('Ralat membaca fail.');
      }
      return;
    }

    setFileStatus(`Memuat naik & memproses audio dengan Whisper: ${file.name}...`);
    setIsTranscribing(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Ralat semasa transkripsi audio.');

      setTranscript(data.transcript || '');
      setFileStatus(`Transkripsi selesai untuk: ${file.name}`);
    } catch (err) {
      alert('Ralat transkripsi: ' + err.message);
      setFileStatus('Ralat pemprosesan audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTriggerExtract = async () => {
    if (!transcript.trim()) {
      alert('Sila pastikan teks transkrip sah dan tidak kosong.');
      return;
    }

    setIsExtracting(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const result = await res.json();
      if (!res.ok || !result.data) throw new Error(result.detail || 'Gagal mengekstrak minit mesyuarat.');

      const data = result.data;
      const decisionsByAgenda = {};
      (data.decisions || []).forEach((d) => {
        const key = d.agenda_item_id || 'general';
        if (!decisionsByAgenda[key]) decisionsByAgenda[key] = [];
        decisionsByAgenda[key].push(d.statement);
      });

      const formattedMeeting = {
        id: null,
        meeting_title: data.meeting_title || (data.agenda_items?.[0]?.title ? `Perbincangan: ${data.agenda_items[0].title}` : 'Mesyuarat Tanpa Tajuk'),
        meeting_number: data.meeting_number || '',
        location: data.location || '',
        date: data.meeting_date || '',
        start_time: '',
        end_time: '',
        chairperson_name: data.chairperson_name || '',
        chairperson_role: data.chairperson_role || '',
        participants: (data.participants || []).map((p) => ({
          label: p.label || '',
          department: p.department || '',
        })),
        agenda_items: (data.agenda_items || []).map((ag) => ({
          title: ag.title || '',
          summary: ag.summary || '',
          decision: (decisionsByAgenda[ag.id] || []).join('\n• '),
        })),
        action_items: (data.action_items || []).map((item) => ({
          task: item.description || item.task || '',
          assignee: item.assignee && item.assignee !== 'null' ? item.assignee : '',
          deadline: item.deadline && item.deadline !== 'null' ? item.deadline : '',
          status: 'Belum Mula',
        })),
        raw_transcript: transcript,
      };

      onExtracted(formattedMeeting);
    } catch (err) {
      alert('Ralat pengekstrakan: ' + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

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

      {/* Audio Dropzone */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-xs font-bold uppercase text-gray-700 mb-1">Muat Naik Dokumen / Audio Mesyuarat</h3>
        <p className="text-xs text-gray-500 mb-4">
          Seret dan lepas fail audio (MP3, WAV, M4A) atau dokumen teks. Enjin Whisper akan mentranskripsikannya secara tempatan.
        </p>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
          }}
          className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-lg p-8 text-center cursor-pointer bg-gray-50 transition"
        >
          <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-xs font-semibold text-gray-700">
            {isTranscribing ? 'Mentranskripsi fail audio...' : 'Klik atau seret fail ke sini'}
          </span>
          <p className="text-[10px] text-gray-400 mt-1">MP3, WAV, M4A, TXT</p>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".mp3,.wav,.m4a,.txt"
            onChange={(e) => {
              if (e.target.files[0]) handleFileUpload(e.target.files[0]);
            }}
          />
        </div>
        {fileStatus && <p className="mt-2 text-xs font-semibold text-blue-700">{fileStatus}</p>}
      </div>

      {/* Transcript Textarea */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-xs font-bold uppercase text-gray-700 mb-1">Pengekstrak AI — Transkrip ke Minit</h3>
        <p className="text-xs text-gray-500 mb-3">Teks transkripsi langsung dipaparkan di sini atau tampal teks perbincangan.</p>

        <textarea
          rows={9}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="Transkrip teks perbincangan mesyuarat akan muncul di sini..."
        />

        <div className="flex justify-between items-center mt-4">
          <button onClick={() => setTranscript('')} className="text-xs text-gray-500 hover:underline">
            Kosongkan
          </button>
          <button
            onClick={handleTriggerExtract}
            disabled={isExtracting || isTranscribing}
            className="bg-[#1b3a5b] hover:bg-blue-900 disabled:opacity-50 text-white text-xs font-semibold px-6 py-2.5 rounded shadow transition"
          >
            {isExtracting ? 'Mengekstrak via Claude...' : 'Ekstrak dengan AI'}
          </button>
        </div>
      </div>
    </section>
  );
}
import React, { useState, useRef, useEffect } from 'react';

const SESSION_KEY = 'mom_transcript_id';

export default function IngestView({ onExtracted, onBack }) {
  const [transcript, setTranscript] = useState('');
  const [fileStatus, setFileStatus] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [timeInfo, setTimeInfo] = useState('');
  const [selectedModel, setSelectedModel] = useState('base'); // Default to fast & balanced model
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const fileInputRef = useRef(null);

  // On mount: if a transcript_id was saved in sessionStorage from a previous run,
  // fetch the transcript text from the server so the user doesn't lose their work.
  useEffect(() => {
    const savedId = sessionStorage.getItem(SESSION_KEY);
    if (!savedId) return;

    fetch(`/api/transcript/${savedId}`)
      .then((res) => {
        if (!res.ok) {
          // Cache entry gone (server restart / cleared) — clean up the stale ID
          sessionStorage.removeItem(SESSION_KEY);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.transcript) {
          setTranscript(data.transcript);
          setFileStatus('Transkrip dipulihkan daripada sesi sebelumnya.');
        }
      })
      .catch(() => sessionStorage.removeItem(SESSION_KEY));
  }, []);

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

    setFileStatus(`Memproses audio dengan Whisper (${selectedModel}): ${file.name}`);
    setIsTranscribing(true);
    setProgressPct(0);
    setTimeInfo('');
    setTranscript('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model_size', selectedModel);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Ralat memulakan penstriman audio.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          let data;
          try {
            data = JSON.parse(line.replace('data: ', ''));
          } catch (e) {
            continue;
          }

          if (data.type === 'status' && data.stage === 'downloading') {
            setIsDownloadingModel(true);
            setFileStatus(data.message);
          } else if (data.type === 'progress') {
            setIsDownloadingModel(false);
            if (data.progress !== undefined) setProgressPct(data.progress);
            if (data.currentTime !== undefined) {
              setTimeInfo(data.totalTime ? `${data.currentTime}s / ${data.totalTime}s` : `${data.currentTime}s`);
            }
            
            const chunkText = (data.text || data.segment || '').trim();
            if (chunkText) {
              setTranscript((prev) => (prev ? `${prev}\n${chunkText}` : chunkText));
            }
          } else if (data.type === 'complete') {
            setIsDownloadingModel(false);
            setProgressPct(100);
            setTranscript(data.transcript || data.full_transcript || '');
            setFileStatus(`Transkripsi siap sepenuhnya untuk: ${file.name}`);
            // Persist only the short ID — the actual text lives on the server
            if (data.transcript_id) {
              sessionStorage.setItem(SESSION_KEY, data.transcript_id);
            }
          } else if (data.type === 'error') {
            setIsDownloadingModel(false);
            throw new Error(data.message);
          }
        }
      }
    } catch (err) {
      alert('Ralat transkripsi: ' + err.message);
      setFileStatus('Ralat pemprosesan audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTriggerExtract = async () => {
    if (!transcript || !transcript.trim()) {
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

      {/* Audio Dropzone & Configuration */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xs font-bold uppercase text-gray-700 mb-1">Muat Naik Dokumen / Audio Mesyuarat</h3>
            <p className="text-xs text-gray-500">
              Seret fail audio (MP3, WAV, M4A) atau teks. Enjin Whisper akan mentranskripsikannya secara tempatan.
            </p>
          </div>

          {/* Whisper Model Selector */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase text-gray-600">Model Whisper:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isTranscribing}
              className="text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-gray-50 text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="tiny">Tiny (~75MB - Sangat Pantas)</option>
              <option value="base">Base (~145MB - Pantas & Seimbang)</option>
              <option value="small">Small (~480MB - Standard)</option>
              <option value="large-v3-turbo">Large-v3-turbo (~1.6GB - Sangat Tepat)</option>
            </select>
          </div>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
          }}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition duration-150 ${
            isDragging
              ? 'border-blue-500 bg-blue-50/80 scale-[1.01]'
              : 'border-gray-300 hover:border-blue-400 bg-gray-50'
          }`}
        >
          <svg
            className={`mx-auto h-10 w-10 mb-2 transition-transform duration-150 ${
              isDragging ? 'text-blue-600 scale-110' : 'text-gray-400'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className={`text-xs font-semibold ${isDragging ? 'text-blue-700' : 'text-gray-700'}`}>
            {isDragging
              ? 'Lepaskan fail di sini...'
              : isTranscribing
              ? 'Mentranskripsi fail audio...'
              : 'Klik atau seret fail ke sini'}
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

        {isDownloadingModel && (
          <div className="mt-3 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg flex items-center gap-3 text-xs animate-pulse">
            <svg className="animate-spin h-4 w-4 text-amber-700 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <div>
              <span className="font-bold">Memuat Turun Model Whisper:</span> Fail model Whisper ({selectedModel}) sedang dimuat turun ke komputer buat kali pertama. Sila tunggu sebentar (proses ini hanya berlaku sekali).
            </div>
          </div>
        )}

        {/* Progress Feedback with Real Percentage and Duration */}
        {fileStatus && (
          <div className="mt-3 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-blue-700">{fileStatus}</span>
              {isTranscribing && (
                <span className="font-bold text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded text-[11px]">
                  {progressPct}% {timeInfo && `(${timeInfo})`}
                </span>
              )}
            </div>

            {isTranscribing && (
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transcript Textarea */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-xs font-bold uppercase text-gray-700 mb-1">Pengekstrak AI — Transkrip ke Minit</h3>
        <p className="text-xs text-gray-500 mb-3">Teks transkripsi langsung dipaparkan di sini atau tampal teks perbincangan.</p>

        <textarea
          rows={9}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded text-xs font-mono whitespace-pre-wrap focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="Transkrip teks perbincangan mesyuarat akan muncul di sini..."
        />

        <div className="flex justify-between items-center mt-4">
          <button onClick={() => { setTranscript(''); sessionStorage.removeItem(SESSION_KEY); }} className="text-xs text-gray-500 hover:underline">
            Kosongkan
          </button>
          <button
            onClick={handleTriggerExtract}
            disabled={isExtracting || isTranscribing || !transcript?.trim()}
            className="bg-[#1b3a5b] hover:bg-blue-900 disabled:opacity-50 text-white text-xs font-semibold px-6 py-2.5 rounded shadow transition flex items-center gap-2"
          >
            {isExtracting && (
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {isExtracting ? 'Mengekstrak via Claude...' : 'Ekstrak dengan AI'}
          </button>
        </div>
      </div>
    </section>
  );
}
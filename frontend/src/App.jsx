import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import HistoryView from './components/HistoryView';
import TrackerView from './components/TrackerView';
import IngestView from './components/IngestView';
import EditorView from './components/EditorView';

export default function App() {
  const [view, setView]                     = useState('history');
  const [meetings, setMeetings]             = useState([]);
  const [currentMeeting, setCurrentMeeting] = useState(null);
  const [previewMode, setPreviewMode]       = useState(false);

  // Ref to EditorView — lets us call editorRef.current.flush() before unmounting
  const editorRef = useRef(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) setMeetings(await res.json());
    } catch (err) {
      console.error('Failed to load meetings:', err);
    }
  };

  useEffect(() => {
    fetchMeetings();
    // No sessionStorage draft-restore on mount.
    // Drafts are resumed exclusively via the "Edit" button in HistoryView.
  }, []);

  // ── Core navigation helper ─────────────────────────────────────────────────
  // Before switching away from the editor, flush any pending auto-save so the
  // draft lands on disk immediately (not after the 3-s debounce expires).
  const navigateTo = async (newView) => {
    if (view === 'editor' && newView !== 'editor' && editorRef.current?.flush) {
      await editorRef.current.flush();
    }
    // Leaving the editor or ingest view → clear in-memory state so the next
    // visit to "Ekstrak AI" or "Minit Baharu" always opens a fresh form.
    if (newView !== 'editor') {
      setCurrentMeeting(null);
      setPreviewMode(false);
      try { sessionStorage.removeItem('active_meeting_draft'); } catch (_) {}
      // Refresh the meetings list so History/Tracker always show up-to-date data
      await fetchMeetings();
    }
    setView(newView);
  };

  // ── Meeting action handlers ────────────────────────────────────────────────

  /** Opens a blank EditorView ready for manual entry. */
  const handleNewMeeting = () => {
    setCurrentMeeting(null);
    setPreviewMode(false);
    setView('editor');
  };

  /** Opens a saved meeting in read-only preview mode. */
  const handleSelectMeeting = async (id) => {
    try {
      const res = await fetch(`/api/meetings/${id}`);
      if (res.ok) {
        setCurrentMeeting(await res.json());
        setPreviewMode(true);
        setView('editor');
      }
    } catch (err) {
      alert('Gagal memuatkan rekod minit: ' + err.message);
    }
  };

  /**
   * Opens an existing meeting (draft or completed) in editable form mode.
   * This is the ONLY way to resume a draft — via the "Edit" button in
   * HistoryView.  The stable id from the loaded record means every subsequent
   * save overwrites the same file.
   */
  const handleEditMeeting = async (id) => {
    try {
      const res = await fetch(`/api/meetings/${id}`);
      if (res.ok) {
        setCurrentMeeting(await res.json());
        setPreviewMode(false);
        setView('editor');
      }
    } catch (err) {
      alert('Gagal memuatkan rekod untuk suntingan: ' + err.message);
    }
  };

  const handleDeleteMeeting = async (id) => {
    if (!window.confirm('Adakah anda pasti ingin memadam minit mesyuarat ini?')) return;
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== id));
      } else {
        alert('Gagal memadam minit dari pelayan.');
      }
    } catch (err) {
      alert('Ralat semasa pemadaman: ' + err.message);
    }
  };

  /**
   * Called by EditorView after "Jana Minit Mesyuarat" succeeds.
   * EditorView already cleared sessionStorage before calling this.
   * Awaits the fetch so HistoryView renders with fresh data, not a stale list.
   */
  const handleEditorBack = async () => {
    setCurrentMeeting(null);
    setPreviewMode(false);
    await fetchMeetings();   // wait for the updated list before switching view
    setView('history');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/20 to-indigo-50/30">
      <Header />
      <Navigation
        currentView={view}
        setView={navigateTo}
        onNewMeeting={handleNewMeeting}
      />

      <main className="max-w-7xl mx-auto px-6 pb-16">
        {view === 'history' && (
          <HistoryView
            meetings={meetings}
            onSelectMeeting={handleSelectMeeting}
            onEditMeeting={handleEditMeeting}
            onDeleteMeeting={handleDeleteMeeting}
          />
        )}

        {view === 'tracker' && (
          <TrackerView
            meetings={meetings}
            onBack={() => navigateTo('history')}
          />
        )}

        {view === 'ingest' && (
          <IngestView
            onExtracted={(data) => {
              // data already has a stable id and was saved to disk by IngestView
              setCurrentMeeting(data);
              setPreviewMode(false);
              setView('editor');
            }}
            onBack={() => navigateTo('history')}
          />
        )}

        {view === 'editor' && (
          <EditorView
            ref={editorRef}
            meeting={currentMeeting}
            previewMode={previewMode}
            setPreviewMode={setPreviewMode}
            onBack={handleEditorBack}
          />
        )}
      </main>
    </div>
  );
}

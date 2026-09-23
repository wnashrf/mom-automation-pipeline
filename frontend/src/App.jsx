import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import HistoryView from './components/HistoryView';
import TrackerView from './components/TrackerView';
import IngestView from './components/IngestView';
import EditorView from './components/EditorView';

export default function App() {
  const [view, setView] = useState('history');
  const [meetings, setMeetings] = useState([]);
  const [currentMeeting, setCurrentMeeting] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      }
    } catch (err) {
      console.error('Failed to load meetings:', err);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleNewMeeting = () => {
    setCurrentMeeting({
      id: null,
      meeting_title: '',
      meeting_number: '',
      location: '',
      date: '',
      start_time: '',
      end_time: '',
      chairperson_name: '',
      chairperson_role: '',
      participants: [],
      agenda_items: [],
      action_items: [],
      raw_transcript: ''
    });
    setPreviewMode(false);
    setView('editor');
  };

  const handleSelectMeeting = async (id) => {
    try {
      const res = await fetch(`/api/meetings/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentMeeting(data);
        setPreviewMode(true);
        setView('editor');
      }
    } catch (err) {
      alert('Gagal memuatkan rekod minit: ' + err.message);
    }
  };

  const handleEditMeeting = async (id) => {
    try {
      const res = await fetch(`/api/meetings/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentMeeting(data);
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
        setMeetings(prev => prev.filter(m => m.id !== id));
      } else {
        alert('Gagal memadam minit dari pelayan.');
      }
    } catch (err) {
      alert('Ralat semasa pemadaman: ' + err.message);
    }
  };

  return (
    <div className="bg-gray-100 text-gray-800 font-sans min-h-screen flex flex-col">
      <Header />
      <Navigation currentView={view} setView={setView} onNewMeeting={handleNewMeeting} />
      <main className="max-w-6xl mx-auto w-full px-4 my-6 flex-1">
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
            onBack={() => setView('history')}
          />
        )}
        {view === 'ingest' && (
          <IngestView
            onExtracted={(data) => {
              setCurrentMeeting(data);
              setPreviewMode(false);
              setView('editor');
            }}
            onBack={() => setView('history')}
          />
        )}
        {view === 'editor' && (
          <EditorView
            meeting={currentMeeting}
            previewMode={previewMode}
            setPreviewMode={setPreviewMode}
            onBack={() => {
              fetchMeetings();
              setView('history');
            }}
          />
        )}
      </main>
    </div>
  );
}
import { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import PageHeader from './components/PageHeader';
import HistoryView from './components/HistoryView';
import TrackerView from './components/TrackerView';
import IngestView from './components/IngestView';
import EditorView from './components/EditorView';
import ToastProvider from './components/ui/ToastProvider';
import ConfirmDialog from './components/ui/ConfirmDialog';
import { useToast } from './components/ui/toastContext';
import { createNavigationGuard } from './lib/navGuard';
import { requestJson } from './lib/api';
import { buildErrorMessage } from './lib/errors';
import { T } from './lib/terminology';

const HISTORY_HEADING_ID = 'page-heading-history';

/**
 * Root component. `useToast()` only works inside the provider, so the provider
 * wraps the real app shell (AppContent).
 */
export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const toast = useToast();

  const [view, setView]                       = useState('history');
  const [meetings, setMeetings]               = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [currentMeeting, setCurrentMeeting]   = useState(null);
  const [previewMode, setPreviewMode]         = useState(false);
  const [navBusy, setNavBusy]                 = useState(false);
  const [pendingDelete, setPendingDelete]     = useState(null); // { id, title } | null
  const [deleteBusy, setDeleteBusy]           = useState(false);

  // Ref to EditorView — lets us call editorRef.current.flush() before unmounting
  const editorRef = useRef(null);
  // Element that opened the delete dialog (focus returns there on close).
  const deleteTriggerRef = useRef(null);
  // History view h2 — fallback focus target when the opener was removed by the delete.
  const historyHeadingRef = useRef(null);
  // Set when the dialog closes; the effect below decides whether to use the fallback.
  const deleteClosedRef = useRef(false);

  // One guard for every navigation change: at most one in flight (Req 4.10).
  const navGuardRef = useRef(null);
  if (navGuardRef.current === null) {
    navGuardRef.current = createNavigationGuard(setNavBusy);
  }

  /** Runs a navigation task through the guard; unexpected throws become an error toast. */
  const runNavigation = async (task) => {
    try {
      await navGuardRef.current.run(task);
    } catch (err) {
      console.error('Navigation failed:', err);
      toast.error(T.messages.genericError);
    }
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  // `meetingsLoading` starts true and only covers the first load: later refreshes
  // (after navigation) keep showing the current list instead of flashing skeletons.
  // On failure the previous list is kept so the user does not lose context.
  const applyMeetingsResult = useCallback((result) => {
    if (result.ok) {
      if (Array.isArray(result.data)) setMeetings(result.data);
    } else {
      toast.error(buildErrorMessage(T.ops.loadMeetings, result.detail));
    }
    setMeetingsLoading(false);
  }, [toast]);

  const fetchMeetings = async () => {
    applyMeetingsResult(await requestJson('/api/meetings'));
  };

  useEffect(() => {
    // No sessionStorage draft-restore on mount.
    // Drafts are resumed exclusively via the "Sunting" button in HistoryView.
    // State is only set in the async callback, never synchronously in the effect.
    let cancelled = false;
    requestJson('/api/meetings').then((result) => {
      if (!cancelled) applyMeetingsResult(result);
    });
    return () => { cancelled = true; };
  }, [applyMeetingsResult]);

  // ── Core navigation helper ─────────────────────────────────────────────────
  /**
   * Before switching away from the editor, flush any pending auto-save so the
   * draft lands on disk immediately. Only an explicit `{ ok: false }` from
   * flush() counts as failure (undefined = nothing to save / ok). On failure
   * the user stays in the editor with the form untouched (Req 4.11).
   * @returns {Promise<boolean>} true when it is safe to leave
   */
  const flushEditorBeforeLeaving = async (newView) => {
    if (view !== 'editor' || newView === 'editor' || !editorRef.current?.flush) return true;
    const result = await editorRef.current.flush();
    if (result && result.ok === false) {
      const detail = typeof result.detail === 'string' ? result.detail.trim() : '';
      toast.error(detail ? `${T.ops.navigateFlush} ${detail}` : T.ops.navigateFlush);
      return false;
    }
    return true;
  };

  const navigateTo = (newView) => runNavigation(async () => {
    if (!(await flushEditorBeforeLeaving(newView))) return;
    // Leaving the editor or ingest view → clear in-memory state so the next
    // visit to "Ekstrak AI" or "Minit Baharu" always opens a fresh form.
    if (newView !== 'editor') {
      setCurrentMeeting(null);
      setPreviewMode(false);
      try { sessionStorage.removeItem('active_meeting_draft'); } catch { /* storage unavailable */ }
      // Refresh the meetings list so History/Tracker always show up-to-date data
      await fetchMeetings();
    }
    setView(newView);
  });

  // ── Meeting action handlers ────────────────────────────────────────────────

  /** Opens a blank EditorView ready for manual entry. */
  const handleNewMeeting = () => runNavigation(async () => {
    setCurrentMeeting(null);
    setPreviewMode(false);
    setView('editor');
  });

  /** Loads a meeting and opens it in the editor (preview or form mode). */
  const openMeeting = (id, asPreview) => runNavigation(async () => {
    const result = await requestJson(`/api/meetings/${id}`);
    if (!result.ok) {
      toast.error(buildErrorMessage(T.ops.loadMeeting, result.detail));
      return;
    }
    setCurrentMeeting(result.data);
    setPreviewMode(asPreview);
    setView('editor');
  });

  /** Opens a saved meeting in read-only preview mode ("Lihat"). */
  const handleSelectMeeting = (id) => openMeeting(id, true);

  /**
   * Opens an existing meeting (draft or completed) in editable form mode.
   * This is the ONLY way to resume a draft — via "Sunting" in HistoryView.
   * The stable id from the loaded record means every subsequent save
   * overwrites the same file.
   */
  const handleEditMeeting = (id) => openMeeting(id, false);

  /**
   * Called by EditorView after "Jana Minit Mesyuarat" succeeds.
   * EditorView already cleared sessionStorage before calling this.
   * Awaits the fetch so HistoryView renders with fresh data, not a stale list.
   */
  const handleEditorBack = () => runNavigation(async () => {
    setCurrentMeeting(null);
    setPreviewMode(false);
    await fetchMeetings();   // wait for the updated list before switching view
    setView('history');
  });

  // ── Delete flow (Confirm_Dialog) ───────────────────────────────────────────
  /**
   * Opens the delete dialog. `triggerEl` is the button that requested it;
   * the current HistoryView only passes the id, so fall back to the focused element.
   */
  const handleDeleteMeeting = (id, triggerEl) => {
    const meeting = meetings.find((m) => m.id === id);
    deleteTriggerRef.current =
      triggerEl ?? (typeof document !== 'undefined' ? document.activeElement : null);
    setPendingDelete({ id, title: meeting?.meeting_title || 'Tanpa tajuk' });
  };

  const closeDeleteDialog = () => {
    deleteClosedRef.current = true;
    setPendingDelete(null);
  };

  const handleCancelDelete = () => {
    if (deleteBusy) return;
    closeDeleteDialog();
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleteBusy) return;
    const { id } = pendingDelete;
    setDeleteBusy(true);
    const result = await requestJson(`/api/meetings/${id}`, { method: 'DELETE' });
    if (result.ok) {
      setMeetings((prev) => prev.filter((m) => m.id !== id));
      toast.success(T.success.delete);
    } else {
      toast.error(buildErrorMessage(T.ops.delete, result.detail));
    }
    setDeleteBusy(false);
    closeDeleteDialog();
  };

  // After the dialog closes: ConfirmDialog returns focus to the opener if it is
  // still in the document. If the opener's row was removed, focus the History
  // heading instead (Req 10.9). Runs after the child's cleanup in the same commit.
  useEffect(() => {
    if (pendingDelete || !deleteClosedRef.current) return;
    deleteClosedRef.current = false;
    const opener = deleteTriggerRef.current;
    deleteTriggerRef.current = null;
    if (!opener || !opener.isConnected) historyHeadingRef.current?.focus();
  }, [pendingDelete]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <Navigation
        currentView={view}
        setView={navigateTo}
        onNewMeeting={handleNewMeeting}
        navBusy={navBusy}
      />

      <main className="mx-auto w-full max-w-(--container-content) px-4 md:px-6 pb-16">
        {view === 'history' && (
          <>
            <PageHeader
              view="history"
              id={HISTORY_HEADING_ID}
              tabIndex={-1}
              ref={historyHeadingRef}
            />
            <HistoryView
              meetings={meetings}
              loading={meetingsLoading}
              onSelectMeeting={handleSelectMeeting}
              onEditMeeting={handleEditMeeting}
              onDeleteMeeting={handleDeleteMeeting}
              onDeleteRequest={handleDeleteMeeting}
              onNewMeeting={handleNewMeeting}
              onOpenIngest={() => navigateTo('ingest')}
            />
          </>
        )}

        {view === 'tracker' && (
          <>
            <PageHeader view="tracker" />
            <TrackerView
              meetings={meetings}
              loading={meetingsLoading}
              onBack={() => navigateTo('history')}
              onNewMeeting={handleNewMeeting}
              onOpenIngest={() => navigateTo('ingest')}
            />
          </>
        )}

        {view === 'ingest' && (
          <>
            <PageHeader view="ingest" />
            <IngestView
              onExtracted={(data) => {
                // data already has a stable id and was saved to disk by IngestView
                setCurrentMeeting(data);
                setPreviewMode(false);
                setView('editor');
              }}
              onBack={() => navigateTo('history')}
            />
          </>
        )}

        {view === 'editor' && (
          <>
            <PageHeader view="editor" />
            <EditorView
              ref={editorRef}
              meeting={currentMeeting}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              onBack={handleEditorBack}
            />
          </>
        )}
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Padam minit mesyuarat?"
        message={
          pendingDelete ? (
            <>
              Minit <strong className="font-semibold text-neutral-900">{pendingDelete.title}</strong>{' '}
              akan dipadam secara kekal. Tindakan ini tidak boleh dibatalkan.
            </>
          ) : null
        }
        confirmLabel={T.actions.delete}
        cancelLabel={T.actions.cancel}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        returnFocusRef={deleteTriggerRef}
        busy={deleteBusy}
      />
    </div>
  );
}

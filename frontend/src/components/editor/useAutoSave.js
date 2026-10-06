import { useEffect, useRef, useCallback, useReducer } from 'react';
import { hasMeaningfulContent, serializeParticipants } from './editorForm';
import { initialSaveState, saveReducer } from '../../lib/saveState';
import { requestJson } from '../../lib/api';

/**
 * Debounced auto-save for the editor form (Req 9.1–9.4, 13.3–13.6).
 *
 * Debounces saves by 3 s. onIdMinted(id) is called once if the backend returns a
 * different id (shouldn't happen when initForm pre-mints the id, but it's a
 * safe-guard). onFailure(detail) is called whenever a save attempt fails.
 *
 * @param {object} formData
 * @param {boolean} enabled
 * @param {(id: string) => void} [onIdMinted]
 * @param {{ onFailure?: (detail: string) => void }} [options]
 * @returns {{
 *   saveState: import('../../lib/saveState').SaveState,
 *   save: (data: object) => Promise<{ ok: boolean, skipped?: boolean, detail?: string }>,
 *   flush: () => Promise<{ ok: boolean, skipped?: boolean, detail?: string }>,
 * }}
 */
export function useAutoSave(formData, enabled, onIdMinted, { onFailure } = {}) {
  const timerRef    = useRef(null);
  const formDataRef = useRef(formData);        // always current, no stale closure
  const [saveState, dispatch] = useReducer(saveReducer, initialSaveState);

  // Keep ref in sync so flush() / unmount handler always see latest formData
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const save = useCallback(async (data) => {
    // Skip entirely if the form is blank — avoids "Draf Tanpa Tajuk" pollution
    if (!hasMeaningfulContent(data)) return { ok: true, skipped: true };
    if (!data.id && !data.meeting_title) return { ok: true, skipped: true };
    dispatch({ type: 'SAVE_START' });
    const payload = {
      ...data,
      participants:  serializeParticipants(data.participants || []),
      meeting_title: data.meeting_title || 'Draf Tanpa Tajuk',
      status: data.status === 'Selesai' ? 'Selesai' : 'Draf',
    };
    const r = await requestJson('/api/meetings/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (r.ok) {
      if (r.data?.id && r.data.id !== data.id) onIdMinted?.(r.data.id);
      dispatch({ type: 'SAVE_SUCCESS', at: new Date() });
      return { ok: true };
    }
    dispatch({ type: 'SAVE_FAILURE' });
    onFailure?.(r.detail);
    return { ok: false, detail: r.detail };
  }, [onIdMinted, onFailure]);

  // Debounced auto-save
  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(formData), 3000);
    return () => clearTimeout(timerRef.current);
  }, [formData, enabled, save]);

  // Flush on unmount — cancel the pending debounce and save immediately
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Fire-and-forget; component is unmounting so we can't await
      save(formDataRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // intentionally empty — runs only on unmount

  // Expose flush so callers can trigger an immediate save; resolves to the save result
  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    return save(formDataRef.current);
  }, [save]);

  return { saveState, save, flush };
}

export default useAutoSave;

/**
 * Decides whether the editor shows the AI_Draft_Notice (Req 9.7, 9.8).
 *
 * Shown only when the record is still a draft ('Draf') and it carries a
 * transcript with at least one non-whitespace character, i.e. the content
 * was AI-extracted and still needs human review. Non-string transcripts
 * (null, undefined, numbers, objects) are treated as having no content.
 *
 * @param {unknown} status Meeting status, e.g. 'Draf' or 'Selesai'.
 * @param {unknown} rawTranscript The meeting's raw transcript text.
 * @returns {boolean}
 */
export function shouldShowAiDraftNotice(status, rawTranscript) {
  if (status !== 'Draf') return false;
  if (typeof rawTranscript !== 'string') return false;
  return /\S/.test(rawTranscript);
}

/**
 * Ordered Editor_View form sections (Req 9.9). The same array drives the card
 * order and SectionNav, and follows the PKPA Bil. 2/1991 preview sequence:
 * header table → Kehadiran → Perkara Berbangkit → Perkara Dibincangkan →
 * Tindakan Susulan.
 *
 * `headingId` is the DOM id of each card's heading (tabIndex -1) that
 * SectionNav scrolls to and focuses (Req 9.10).
 */
export const EDITOR_SECTIONS = Object.freeze([
  { id: 'maklumat', title: 'Maklumat Mesyuarat', headingId: 'section-maklumat' },
  { id: 'pengerusi', title: 'Pengerusi & Pencatat', headingId: 'section-pengerusi' },
  { id: 'kehadiran', title: 'Senarai Kehadiran', headingId: 'section-kehadiran' },
  { id: 'berbangkit', title: 'Perkara Berbangkit', headingId: 'section-berbangkit' },
  { id: 'perbincangan', title: 'Perkara Dibincangkan', headingId: 'section-perbincangan' },
  { id: 'tindakan', title: 'Tindakan Susulan', headingId: 'section-tindakan' },
]);

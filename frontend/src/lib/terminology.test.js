import { describe, it, expect } from 'vitest';
import { T } from './terminology.js';

/** Collect every string reachable from `node`; functions are called with a sample arg. */
function collectStrings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (typeof node === 'function') out.push(String(node('SAMPLE')));
  else if (Array.isArray(node)) node.forEach((v) => collectStrings(v, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => collectStrings(v, out));
  return out;
}

describe('terminology module', () => {
  it('keeps every view description at 120 characters or fewer (Req 3.4)', () => {
    const views = Object.entries(T.views);
    expect(views.length).toBeGreaterThan(0);
    for (const [, view] of views) {
      expect(typeof view.description).toBe('string');
      expect(view.description.length).toBeLessThanOrEqual(120);
    }
  });

  it('uses one distinct term per action concept (Req 5.2)', () => {
    const values = Object.values(T.actions);
    expect(new Set(values).size).toBe(values.length);
  });

  it('contains none of the banned terms in any string value (Req 5.3)', () => {
    const strings = collectStrings(T);
    const banned = [/\bOverview\b/i, /\bNo date\b/i, /\bNo location\b/i, /\bEdit\b/, /\bUbah\b/i, /\bHapus\b/i];
    for (const s of strings) {
      for (const re of banned) {
        expect(re.test(s), `"${s}" matches banned term ${re}`).toBe(false);
      }
    }
  });

  it('lists the 12 Bahasa Melayu month names in order (Req 5.4)', () => {
    expect(T.months).toEqual([
      'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
      'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember',
    ]);
  });
});

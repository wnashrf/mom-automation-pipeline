import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CircleHelp } from 'lucide-react';
import { STATUS_KEYS, STATUS_CONFIG, UNKNOWN_STATUS, getStatusConfig, TONE_CLASSES } from './status.js';

const EXPECTED_TONES = {
  Draf: 'warning',
  Selesai: 'success',
  'Belum Mula': 'neutral',
  'Sedang Berjalan': 'info',
  Tertunggak: 'danger',
};

describe('status mapping', () => {
  // Feature: professional-ui-redesign, Property 3: Status mapping is total, fixed and distinct
  // **Validates: Requirements 1.10, 6.1, 6.2, 6.7**
  it('maps every string to a fixed, idempotent configuration', () => {
    const statusArb = fc.oneof(fc.constantFrom(...STATUS_KEYS, ''), fc.string());

    fc.assert(
      fc.property(statusArb, (s) => {
        const config = getStatusConfig(s);
        // Idempotence: same input, same configuration object.
        expect(getStatusConfig(s)).toBe(config);
        // Every tone has a corresponding class string.
        expect(TONE_CLASSES[config.tone]).toBeTypeOf('string');

        if (Object.hasOwn(EXPECTED_TONES, s)) {
          expect(config.label).toBe(s);
          expect(config.tone).toBe(EXPECTED_TONES[s]);
          expect(config.Icon).not.toBe(CircleHelp);
        } else {
          expect(config).toBe(UNKNOWN_STATUS);
          expect(config.label).toBe('Tidak Diketahui');
          expect(config.tone).toBe('neutral');
          expect(config.Icon).toBe(CircleHelp);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('defines exactly the five statuses with pairwise-distinct icons different from the generic icon', () => {
    expect([...STATUS_KEYS].sort()).toEqual(Object.keys(EXPECTED_TONES).sort());
    const icons = STATUS_KEYS.map((k) => STATUS_CONFIG[k].Icon);
    expect(new Set(icons).size).toBe(5);
    expect(icons).not.toContain(UNKNOWN_STATUS.Icon);
    expect(UNKNOWN_STATUS.Icon).toBe(CircleHelp);
  });
});

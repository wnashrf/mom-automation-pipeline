import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { selectListState } from './listState.js';

// Counts with 0 <= visibleCount <= totalCount.
const countsArb = fc
  .nat({ max: 10_000 })
  .chain((totalCount) =>
    fc.record({
      totalCount: fc.constant(totalCount),
      visibleCount: fc.integer({ min: 0, max: totalCount }),
    }),
  );

describe('list state selection', () => {
  // Feature: professional-ui-redesign, Property 14: List state selection
  // **Validates: Requirements 8.1, 8.7, 8.8, 12.5**
  it('selects loading, empty, no-match or list with the correct precedence', () => {
    fc.assert(
      fc.property(fc.boolean(), countsArb, (loading, { totalCount, visibleCount }) => {
        const state = selectListState({ loading, totalCount, visibleCount });

        let expected;
        if (loading) expected = 'loading';
        else if (totalCount === 0) expected = 'empty';
        else if (visibleCount === 0) expected = 'no-match';
        else expected = 'list';

        expect(state).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('handles the boundary examples', () => {
    expect(selectListState({ loading: true, totalCount: 0, visibleCount: 0 })).toBe('loading');
    expect(selectListState({ loading: false, totalCount: 0, visibleCount: 0 })).toBe('empty');
    expect(selectListState({ loading: false, totalCount: 3, visibleCount: 0 })).toBe('no-match');
    expect(selectListState({ loading: false, totalCount: 3, visibleCount: 1 })).toBe('list');
  });
});

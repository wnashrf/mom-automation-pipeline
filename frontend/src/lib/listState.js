/**
 * Picks which list state a view should render (Req 8.1, 8.7, 8.8, 12.5).
 *
 * Precedence: `loading` wins; then no records at all → 'empty';
 * then records exist but none survive filtering → 'no-match'; else 'list'.
 *
 * @param {{ loading?: boolean, totalCount?: number, visibleCount?: number }} input
 * @returns {'loading' | 'empty' | 'no-match' | 'list'}
 */
export function selectListState({ loading, totalCount, visibleCount }) {
  if (loading) return 'loading';
  if (totalCount === 0) return 'empty';
  if (visibleCount === 0) return 'no-match';
  return 'list';
}

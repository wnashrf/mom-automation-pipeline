/** Joins complete, statically written class strings. Falsy entries are dropped. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

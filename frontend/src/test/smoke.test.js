// Smoke test: confirms the test toolchain (jsdom, jest-dom matchers, fast-check) is wired up.
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

describe('test toolchain', () => {
  it('provides jsdom and jest-dom matchers', () => {
    const el = document.createElement('div')
    el.textContent = 'Minit Mesyuarat'
    document.body.appendChild(el)

    expect(el).toBeInTheDocument()
    expect(el).toHaveTextContent('Minit Mesyuarat')
  })

  it('loads fast-check and runs a property', () => {
    fc.assert(
      fc.property(fc.string(), (s) => s.length >= 0),
      { numRuns: 20 },
    )
  })
})

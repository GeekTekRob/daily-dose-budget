import { describe, it, expect } from 'vitest'
import { nextOccurrence } from '../utils.js'

describe('nextOccurrence', () => {
  it('adds 1 month by default', () => {
    expect(nextOccurrence('2025-08-14', 'Monthly')).toBe('2025-09-14')
  })
  it('handles weekly', () => {
    expect(nextOccurrence('2025-08-14', 'Weekly')).toBe('2025-08-21')
  })
  it('handles bi-weekly', () => {
    expect(nextOccurrence('2025-08-14', 'Bi-Weekly')).toBe('2025-08-28')
  })
  it('handles annually', () => {
    expect(nextOccurrence('2025-08-14', 'Annually')).toBe('2026-08-14')
  })
  it('handles semi-monthly: before 15th goes to 15th', () => {
    expect(nextOccurrence('2025-08-10', 'Semi-Monthly')).toBe('2025-08-15')
  })
  it('handles semi-monthly: on/after 15th goes to 1st next month', () => {
    expect(nextOccurrence('2025-08-15', 'Semi-Monthly')).toBe('2025-09-01')
  })
})

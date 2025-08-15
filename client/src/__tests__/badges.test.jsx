import { describe, it, expect } from 'vitest'
import { getTransactionBadges } from '../App.jsx'

describe('getTransactionBadges', () => {
  it('yields Adjustment when description contains Manual Adjustment', () => {
    const t = { Description: 'Manual Adjustment (Initial Balance)', TransactionType: 'Credit' }
    const badges = getTransactionBadges(t)
    expect(badges.some(b => b.label === 'Adjustment')).toBe(true)
  })

  it('yields Debit badge for debits', () => {
    const t = { Description: 'Groceries', TransactionType: 'Debit' }
    const badges = getTransactionBadges(t)
    expect(badges.some(b => b.label === 'Debit')).toBe(true)
  })

  it('yields Credit badge for credits', () => {
    const t = { Description: 'Paycheck', TransactionType: 'Credit' }
    const badges = getTransactionBadges(t)
    expect(badges.some(b => b.label === 'Credit')).toBe(true)
  })

  it('combines multiple badges', () => {
    const t = { Description: 'Manual Adjustment', TransactionType: 'Debit' }
    const badges = getTransactionBadges(t)
    expect(badges.map(b => b.label)).toEqual(['Adjustment', 'Debit'])
  })
})

import React, { useEffect, useMemo, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function useApi(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${API_URL}${path}`)
      .then(r => {
        if (!r.ok) throw new Error('Network error')
        return r.json()
      })
      .then(json => !cancelled && setData(json))
      .catch(e => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))
    return () => (cancelled = true)
  }, [path])

  return { data, loading, error }
}

function Card({ title, value, accent = 'slate', children }) {
  const accentClass = {
    slate: 'from-slate-700 to-slate-900',
    green: 'from-emerald-600 to-emerald-800',
    red: 'from-rose-600 to-rose-800',
    blue: 'from-blue-600 to-blue-800',
  }[accent]

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg bg-white border border-slate-200">
      <div className={`p-4 text-white bg-gradient-to-br ${accentClass}`}>
        <div className="text-sm opacity-80">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
      {children}
    </div>
  )
}

function List({ items, renderItem, empty }) {
  if (!items?.length) return <div className="p-4 text-slate-500 text-sm">{empty}</div>
  return (
    <ul className="divide-y divide-slate-200">
      {items.map((item, i) => (
        <li key={i} className="p-4">{renderItem(item)}</li>
      ))}
    </ul>
  )
}

function App() {
  const { data: summary, loading: loadingSummary } = useApi('/api/summary')
  const { data: transactions, loading: loadingTx } = useApi('/api/transactions')
  const { data: bills, loading: loadingBills } = useApi('/api/bills')
  const { data: accounts } = useApi('/api/accounts')
  const { data: accountSummary, loading: loadingAcct } = useApi('/api/accounts-summary')

  const acctDisplay = useMemo(() => {
    const map = new Map()
    accounts?.forEach(a => map.set(a.AccountName, a.DisplayName || a.AccountName))
    return name => map.get(name) || name
  }, [accounts])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Daily Dose Budget</h1>
        <div className="text-slate-500 text-sm">Simple. Clear. Daily.</div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card title="Current Balance" value={loadingSummary ? '—' : currency(summary?.currentBalance || 0)} accent="blue" />
        <Card title="Bills (Upcoming)" value={loadingSummary ? '—' : currency(summary?.upcomingTotal || 0)} accent="red" />
        <Card title="Real Balance" value={loadingSummary ? '—' : currency(summary?.realBalance || 0)} accent="green" />
      </section>

  <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <Card title="Recent Transactions" value={loadingTx ? 'Loading…' : `${transactions?.length ?? 0} items`}>
            <List
              items={transactions?.slice(0, 20)}
              empty="No transactions"
              renderItem={t => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">{acctDisplay(t.AccountName)}</div>
                    <div className="text-xs text-slate-500">{new Date(t.TransactionDate).toLocaleDateString()} • {t.TransactionType}</div>
                  </div>
                  <div className={`font-semibold ${t.Amount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currency(t.Amount)}</div>
                </div>
              )}
            />
          </Card>
        </div>

  <div className="space-y-3">
          <Card title="Upcoming Bills" value={loadingBills ? 'Loading…' : `${bills?.length ?? 0} items`}>
            <List
              items={bills}
              empty="No upcoming bills"
              renderItem={b => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 truncate">{b.BillName}</div>
                    <div className="text-xs text-slate-500">{new Date(b.StartDate).toLocaleDateString()} {b.IsRecurring ? `• ${b.RecurringType}` : ''}</div>
                  </div>
                  <div className="font-semibold text-rose-700">{currency(b.Amount)}</div>
                </div>
              )}
            />
          </Card>
        </div>

        <div className="space-y-3">
          <Card title="Accounts" value={loadingAcct ? 'Loading…' : `${accountSummary?.length ?? 0} accounts`}>
            <List
              items={accountSummary}
              empty="No accounts"
              renderItem={a => (
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-800">{a.DisplayName}</div>
                  <div className={`font-semibold ${a.Balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currency(a.Balance)}</div>
                </div>
              )}
            />
          </Card>
        </div>
      </section>

      <footer className="mt-8 text-center text-xs text-slate-400">Self-hosted • Mobile first • Privacy friendly</footer>
    </div>
  )
}

export default App

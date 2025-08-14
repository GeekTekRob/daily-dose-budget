import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || ''

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function useApi(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)

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
  }, [path, tick])

  const reload = () => setTick(x => x + 1)
  return { data, loading, error, reload }
}

function Card({ title, value, accent = 'slate', children }) {
  const accentClass = {
    slate: 'from-mardiGras to-ink',
    green: 'from-emerald to-ink',
    red: 'from-redPantone to-ink',
    blue: 'from-mardiGras to-ink',
  }[accent]

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg app-card app-border border">
      <div className={`px-4 py-3 text-white bg-gradient-to-br ${accentClass}`}>
        <div className="text-base md:text-lg font-semibold opacity-90">{title}</div>
        <div className="text-2xl md:text-3xl font-extrabold leading-tight">{value}</div>
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
  const { data: summary, loading: loadingSummary, reload: reloadSummary } = useApi('/api/summary')
  const { data: transactions, loading: loadingTx, reload: reloadTx } = useApi('/api/transactions')
  const { data: bills, loading: loadingBills, reload: reloadBills } = useApi('/api/bills')
  const { data: accounts, reload: reloadAccounts } = useApi('/api/accounts')
  const { data: accountSummary, loading: loadingAcct, reload: reloadAcct } = useApi('/api/accounts-summary')

  const acctDisplay = useMemo(() => {
    const map = new Map()
    accounts?.forEach(a => map.set(a.AccountName, a.DisplayName || a.AccountName))
    return name => map.get(name) || name
  }, [accounts])

  async function postJson(url, body) {
    const r = await fetch(`${API_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error('Request failed')
    return r.json().catch(() => ({}))
  }

  async function patchJson(url, body) {
    const r = await fetch(`${API_URL}${url}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error('Request failed')
    return r.json().catch(() => ({}))
  }

  async function del(url) {
    const r = await fetch(`${API_URL}${url}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('Request failed')
    return r.json().catch(() => ({}))
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme')
    return stored === 'dark' || stored === 'light' ? stored : 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    const isDark = theme === 'dark'
    root.classList.toggle('dark', isDark)
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <BrowserRouter>
      <div className="min-h-screen app-bg app-text">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 app-border border-b">
          <button aria-label="Open Menu" onClick={() => setSidebarOpen(true)} className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6"><path d="M4 6h16M4 12h16M4 18h16" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
          <div className="font-bold">Daily Dose Budget</div>
          {/* Theme toggle moved to sidebar only */}
          <span className="w-6" />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
          {/* Sidebar desktop */}
          <aside className="hidden md:block app-border border-r p-4">
            <div className="font-bold mb-4">Daily Dose Budget</div>
            <nav className="space-y-1 text-sm">
              <NavLink to="/" end className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Dashboard</NavLink>
              <NavLink to="/accounts" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Accounts</NavLink>
              <NavLink to="/bills" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Bills</NavLink>
              <NavLink to="/transactions" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Transactions</NavLink>
            </nav>
            <div className="mt-6"><ThemeToggle theme={theme} setTheme={setTheme} /></div>
          </aside>

          {/* Sidebar mobile drawer */}
          {sidebarOpen && (
            <div className="md:hidden fixed inset-0 z-40">
              <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
              <div className="absolute inset-y-0 left-0 w-72 app-card app-border border-r p-4 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="font-bold">Menu</div>
                  <button aria-label="Close Menu" onClick={() => setSidebarOpen(false)} className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10">✕</button>
                </div>
                <nav className="space-y-1 text-sm" onClick={() => setSidebarOpen(false)}>
                  <NavLink to="/" end className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Dashboard</NavLink>
                  <NavLink to="/accounts" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Accounts</NavLink>
                  <NavLink to="/bills" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Bills</NavLink>
                  <NavLink to="/transactions" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Transactions</NavLink>
                </nav>
                <div className="mt-6"><ThemeToggle theme={theme} setTheme={setTheme} /></div>
              </div>
            </div>
          )}

          {/* Main content */}
          <main className="p-4 max-w-6xl mx-auto w-full">
            <Routes>
              <Route path="/" element={<DashboardPage {...{summary, loadingSummary, transactions, loadingTx, bills, loadingBills, accountSummary, loadingAcct, accounts, postJson, patchJson, del, reloadSummary, reloadTx, reloadBills, reloadAcct, reloadAccounts, acctDisplay}} />} />
              <Route path="/accounts" element={<AccountsPage {...{accountSummary, loadingAcct, accounts, postJson, del, reloadSummary, reloadAcct, reloadAccounts}} />} />
              <Route path="/bills" element={<BillsPage {...{bills, loadingBills, postJson, del, reloadBills, reloadSummary}} />} />
              <Route path="/transactions" element={<TransactionsPage {...{transactions, loadingTx, accounts, postJson, patchJson, reloadTx, reloadSummary, reloadAcct}} />} />
            </Routes>
            <footer className="mt-8 text-center text-xs app-muted">Self-hosted • Mobile first • Privacy friendly</footer>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App

function Field({ label, children }) {
  return (
    <label className="block text-sm mb-3">
      <span className="block mb-1 app-muted">{label}</span>
      {children}
    </label>
  )
}

function AccountForm({ onSubmit }) {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [initialBalance, setInitialBalance] = useState('0')
  return (
    <form className="p-4 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      await onSubmit({ name, displayName, initialBalance: Number(initialBalance || 0) });
      setName(''); setDisplayName(''); setInitialBalance('0');
    }}>
      <Field label="Internal Name">
  <input value={name} onChange={e => setName(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <Field label="Display Name">
  <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <Field label="Initial Balance">
  <input type="number" step="0.01" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" />
      </Field>
  <button className="mt-2 px-3 py-2 rounded btn-primary">Add Account</button>
    </form>
  )
}

function BillForm({ onSubmit }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringType, setRecurringType] = useState('Monthly')

  return (
    <form className="p-4 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      await onSubmit({ name, amount: Number(amount), startDate, isRecurring, recurringType: isRecurring ? recurringType : null });
      setName(''); setAmount(''); setStartDate(''); setIsRecurring(false);
    }}>
      <Field label="Bill Name">
  <input value={name} onChange={e => setName(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <Field label="Amount">
  <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <Field label="Due Date">
  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <div className="flex items-center gap-3">
  <label className="text-sm app-text flex items-center gap-2"><input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} /> Recurring</label>
        {isRecurring && (
          <select value={recurringType} onChange={e => setRecurringType(e.target.value)} className="border app-border rounded px-3 py-2 app-card">
            <option>Monthly</option>
            <option>Weekly</option>
            <option>Annually</option>
          </select>
        )}
      </div>
  <button className="mt-2 px-3 py-2 rounded btn-primary">Add Bill</button>
    </form>
  )
}

function TransactionForm({ onSubmit, accounts }) {
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('Debit')
  const [status, setStatus] = useState('pending')
  const [description, setDescription] = useState('')

  return (
    <form className="p-4 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      await onSubmit({ accountId: Number(accountId), date, amount: Number(amount), type, status, description });
      setAccountId(''); setDate(''); setAmount(''); setType('Debit'); setStatus('pending'); setDescription('');
    }}>
      <Field label="Account">
  <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required>
          <option value="" disabled>Select account</option>
          {accounts?.map(a => (
            <option key={a.id || a.AccountName} value={a.id}>{a.DisplayName}</option>
          ))}
        </select>
      </Field>
      <Field label="Date">
  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <Field label="Amount">
  <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <div className="flex items-center gap-3">
  <select value={type} onChange={e => setType(e.target.value)} className="border app-border rounded px-3 py-2 app-card">
          <option>Debit</option>
          <option>Credit</option>
        </select>
  <select value={status} onChange={e => setStatus(e.target.value)} className="border app-border rounded px-3 py-2 app-card">
          <option>pending</option>
          <option>confirmed</option>
        </select>
      </div>
      <Field label="Description">
  <input value={description} onChange={e => setDescription(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" />
      </Field>
  <button className="mt-2 px-3 py-2 rounded btn-primary">Add Transaction</button>
    </form>
  )
}

function DashboardPage({ summary, loadingSummary, transactions, loadingTx, bills, loadingBills, accountSummary, loadingAcct, accounts, postJson, patchJson, del, reloadSummary, reloadTx, reloadBills, reloadAcct, reloadAccounts, acctDisplay }) {
  return (
    <div>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card title="Real Balance" value={loadingSummary ? '—' : currency(summary?.realBalance || 0)} accent="green" />
        <Card title="Current Balance" value={loadingSummary ? '—' : currency(summary?.currentBalance || 0)} accent="blue" />
        <Card title="Bills (Upcoming)" value={loadingSummary ? '—' : currency(summary?.upcomingTotal || 0)} accent="red" />        
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
                    <div className="text-xs text-slate-500">{new Date(t.TransactionDate).toLocaleDateString()} • {t.TransactionType} • {t.Status || 'confirmed'}</div>
                  </div>
                  <div className={`font-semibold ${t.Amount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currency(t.Amount)}</div>
                  {t.Status === 'pending' && (
                    <button
                      onClick={async () => { await patchJson(`/api/transactions/${t.id}`, { status: 'confirmed' }); reloadTx(); reloadSummary(); reloadAcct(); }}
                      className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    >Confirm</button>
                  )}
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
    </div>
  )
}

function AccountsPage({ accountSummary, loadingAcct, accounts, postJson, del, reloadSummary, reloadAcct, reloadAccounts }) {
  return (
    <div className="space-y-6">
      <Card title="Accounts" value={loadingAcct ? 'Loading…' : `${accountSummary?.length ?? 0} accounts`}>
        <List
          items={accountSummary}
          empty="No accounts"
          renderItem={a => (
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-slate-800">{a.DisplayName}</div>
              <div className={`font-semibold ${a.Balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currency(a.Balance)}</div>
              <button onClick={async () => { await del(`/api/accounts/${a.AccountId}`); reloadAccounts(); reloadAcct(); reloadSummary(); }} className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">Archive</button>
            </div>
          )}
        />
      </Card>
      <Card title="Add Account" value="">
        <AccountForm onSubmit={async (payload) => { await postJson('/api/accounts', payload); reloadAccounts(); reloadAcct(); reloadSummary(); }} />
      </Card>
    </div>
  )
}

function BillsPage({ bills, loadingBills, postJson, del, reloadBills, reloadSummary }) {
  return (
    <div className="space-y-6">
      <Card title="Bills" value={loadingBills ? 'Loading…' : `${bills?.length ?? 0} upcoming`}>
        <List
          items={bills}
          empty="No bills"
          renderItem={b => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{b.BillName}</div>
                <div className="text-xs text-slate-500">{new Date(b.StartDate).toLocaleDateString()} {b.IsRecurring ? `• ${b.RecurringType}` : ''}</div>
              </div>
              <div className="font-semibold text-rose-700">{currency(b.Amount)}</div>
              <button onClick={async () => { await del(`/api/bills/${b.id}`); reloadBills(); reloadSummary(); }} className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">Delete</button>
            </div>
          )}
        />
      </Card>
      <Card title="Add Bill" value="">
        <BillForm onSubmit={async (payload) => { await postJson('/api/bills', payload); reloadBills(); reloadSummary(); }} />
      </Card>
    </div>
  )
}

function TransactionsPage({ transactions, loadingTx, accounts, postJson, patchJson, reloadTx, reloadSummary, reloadAcct }) {
  return (
    <div className="space-y-6">
      <Card title="Transactions" value={loadingTx ? 'Loading…' : `${transactions?.length ?? 0}`}>
        <List
          items={transactions}
          empty="No transactions"
          renderItem={t => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{t.DisplayName || t.AccountName}</div>
                <div className="text-xs text-slate-500">{new Date(t.TransactionDate).toLocaleDateString()} • {t.TransactionType} • {t.Status || 'confirmed'}</div>
              </div>
              <div className={`font-semibold ${t.Amount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currency(t.Amount)}</div>
              {t.Status === 'pending' && (
                <button
                  onClick={async () => { await patchJson(`/api/transactions/${t.id}`, { status: 'confirmed' }); reloadTx(); reloadSummary(); reloadAcct(); }}
                  className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                >Confirm</button>
              )}
            </div>
          )}
        />
      </Card>
      <Card title="Add Transaction" value="">
        <TransactionForm accounts={accounts} onSubmit={async (payload) => { await postJson('/api/transactions', payload); reloadTx(); reloadSummary(); reloadAcct(); }} />
      </Card>
    </div>
  )
}

function ThemeToggle({ theme, setTheme }) {
  const isDark = theme === 'dark'
  const toggle = () => setTheme(isDark ? 'light' : 'dark')
  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-2 px-3 py-2 rounded app-border border hover:bg-black/5 dark:hover:bg-white/10"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="text-sm">{isDark ? 'Dark' : 'Light'}</span>
      <span role="img" aria-label={isDark ? 'moon' : 'sun'}>{isDark ? '🌙' : '☀️'}</span>
    </button>
  )
}

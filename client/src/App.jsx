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
  // Flat color palette
  const accentClass = {
    slate: 'bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100',
    green: 'bg-[#2fbf71] text-white', // emerald
    red: 'bg-[#e71d36] text-white',   // red-pantone
    blue: 'bg-[#7f29d2] text-white',  // purple (mardi-gras)
    purple: 'bg-[#7f29d2] text-white',
    gray: 'bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100',
  }[accent] || 'bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100';

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg app-card app-border border">
      <div className={`px-4 py-2 ${accentClass}`}>
        <div className="text-base md:text-lg font-semibold opacity-90">{title}</div>
        <div className="text-2xl md:text-3xl font-extrabold leading-tight">{value}</div>
      </div>
      {children}
    </div>
  )
}

function List({ items, renderItem, empty }) {
  if (!items?.length) return <div className="p-4 app-muted text-sm">{empty}</div>
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i} className="p-4 border-b app-border last:border-b-0">{renderItem(item)}</li>
      ))}
    </ul>
  )
}

function App() {
  const { data: summary, loading: loadingSummary, reload: reloadSummary } = useApi('/api/summary')
  const { data: transactions, loading: loadingTx, reload: reloadTx } = useApi('/api/transactions')
  const { data: bills, loading: loadingBills, reload: reloadBills } = useApi('/api/bills')
  const { data: paychecks, loading: loadingPaychecks, reload: reloadPaychecks } = useApi('/api/paychecks')
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

  // Centralized monetary refresh helper
  const refreshMoney = ({
    summary = true,
    accountBalances = true,
    accountList = false,
    transactions = false,
    bills = false,
    paychecks = false,
  } = {}) => {
    if (summary) reloadSummary()
    if (accountBalances) reloadAcct()
    if (accountList) reloadAccounts()
    if (transactions) reloadTx()
    if (bills) reloadBills()
    if (paychecks) reloadPaychecks()
  }

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
        <NavLink to="/recurring" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Recurring</NavLink>
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
                  <NavLink to="/recurring" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Recurring</NavLink>
                  <NavLink to="/transactions" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Transactions</NavLink>
                </nav>
                <div className="mt-6"><ThemeToggle theme={theme} setTheme={setTheme} /></div>
              </div>
            </div>
          )}

          {/* Main content */}
          <main className="p-4 max-w-6xl mx-auto w-full">
            <Routes>
              <Route path="/" element={<DashboardPage {...{summary, loadingSummary, transactions, loadingTx, bills, loadingBills, paychecks, loadingPaychecks, accountSummary, loadingAcct, accounts, postJson, patchJson, del, reloadSummary, reloadTx, reloadBills, reloadPaychecks, reloadAcct, reloadAccounts, acctDisplay, refreshMoney}} />} />
              <Route path="/accounts" element={<AccountsPage {...{accountSummary, loadingAcct, accounts, postJson, del, reloadSummary, reloadAcct, reloadAccounts, refreshMoney}} />} />
              <Route path="/bills" element={<BillsPage {...{bills, loadingBills, postJson, del, reloadBills, reloadSummary, refreshMoney}} />} />
              <Route path="/recurring" element={<RecurringPage {...{accounts, postJson, patchJson, del, reloadSummary, reloadAcct, reloadTx, reloadBills, reloadPaychecks, refreshMoney}} />} />
              <Route path="/transactions" element={<TransactionsPage {...{transactions, loadingTx, accounts, postJson, patchJson, del, reloadTx, reloadSummary, reloadAcct, reloadBills, reloadPaychecks, refreshMoney}} />} />
            </Routes>
            <footer className="mt-8 text-center text-xs app-muted">Self-hosted • Mobile first • Privacy friendly</footer>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App

// Small badge for labeling transaction types
export function Badge({ kind = 'neutral', children }) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border'
  const tone = {
    debit: 'text-rose-700 border-rose-600/40',
    credit: 'text-emerald-700 border-emerald-600/40',
    adjustment: 'app-muted app-border',
    neutral: 'app-muted app-border',
  }[String(kind).toLowerCase()] || 'app-muted app-border'
  return <span className={`${base} ${tone}`}>{children}</span>
}

// Helper to determine badges for a transaction
export function getTransactionBadges(t) {
  const badges = []
  const desc = (t?.Description || '').toLowerCase()
  if (desc.includes('manual adjustment')) badges.push({ label: 'Adjustment', kind: 'adjustment' })
  const type = (t?.TransactionType || '').toLowerCase()
  if (type === 'debit') badges.push({ label: 'Debit', kind: 'debit' })
  if (type === 'credit') badges.push({ label: 'Credit', kind: 'credit' })
  return badges
}

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

function AccountInlineEdit({ a, onSaved }) {
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState(a.DisplayName || '')
  const [balanceResetAmount, setBalanceResetAmount] = useState('')
  const [balanceResetDate, setBalanceResetDate] = useState('')
  const save = async () => {
    const payload = { displayName }
    if (balanceResetAmount !== '' && balanceResetDate) {
      payload.balanceResetAmount = Number(balanceResetAmount)
      payload.balanceResetDate = balanceResetDate
    }
    await fetch(`${API_URL}/api/accounts/${a.AccountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    setOpen(false)
    onSaved && onSaved()
  }
  return open ? (
    <div className="flex items-center gap-2">
      <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display Name" className="border app-border rounded px-2 py-1 app-card text-sm" />
      <input type="number" step="0.01" value={balanceResetAmount} onChange={e => setBalanceResetAmount(e.target.value)} placeholder="Set Balance" className="border app-border rounded px-2 py-1 app-card text-sm w-28" />
      <input type="date" value={balanceResetDate} onChange={e => setBalanceResetDate(e.target.value)} className="border app-border rounded px-2 py-1 app-card text-sm" />
      <button onClick={save} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">Save</button>
      <button onClick={() => setOpen(false)} className="text-xs px-2 py-1 rounded border app-border">Cancel</button>
    </div>
  ) : (
    <button onClick={() => setOpen(true)} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10">Edit</button>
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
  const [description, setDescription] = useState('')

  return (
    <form className="p-4 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      await onSubmit({ accountId: Number(accountId), date, amount: Number(amount), type, status: 'confirmed', description });
      setAccountId(''); setDate(''); setAmount(''); setType('Debit'); setDescription('');
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
        <span className="text-xs app-muted">Status: confirmed</span>
      </div>
      <Field label="Description">
  <input value={description} onChange={e => setDescription(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" />
      </Field>
  <button className="mt-2 px-3 py-2 rounded btn-primary">Add Transaction</button>
    </form>
  )
}

function DashboardPage({ summary, loadingSummary, transactions, loadingTx, bills, loadingBills, paychecks, loadingPaychecks, accountSummary, loadingAcct, accounts, postJson, patchJson, del, reloadSummary, reloadTx, reloadBills, reloadPaychecks, reloadAcct, reloadAccounts, acctDisplay, refreshMoney }) {
  // Compute Daily Spend to the sooner of next paycheck (from API if available) or end of month,
  // and include estimated inflows/outflows within that horizon.
  const { horizonDays, horizonEnd, startOfToday } = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // start of today
    // Next paycheck strictly AFTER today
    let nextPayAfterToday = null;
    if (Array.isArray(paychecks) && paychecks.length) {
      const dates = paychecks
        .map(p => new Date(p.StartDate || p.start_date))
        .filter(d => !isNaN(d) && d > start)
        .sort((a,b) => a - b);
      nextPayAfterToday = dates[0] || null;
    }
    // Fallback semi-monthly schedule (ensure strictly after today)
    if (!nextPayAfterToday) {
      const d = today.getDate();
      const np = new Date(today);
      if (d < 15) np.setDate(15); else np.setMonth(today.getMonth() + 1, 1);
      if (np <= start) np.setMonth(np.getMonth() + 1, 1);
      nextPayAfterToday = np;
    }
    // End of month
    const eom = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    // Horizon is sooner of next paycheck after today or EOM
    const horizonEnd = (nextPayAfterToday < eom ? nextPayAfterToday : eom);
    const msPerDay = 24 * 60 * 60 * 1000;
    const endDay = new Date(horizonEnd.getFullYear(), horizonEnd.getMonth(), horizonEnd.getDate());
    const days = Math.max(1, Math.round((endDay - start) / msPerDay));
    return { horizonDays: days, horizonEnd, startOfToday: start };
  }, [paychecks]);

  const dailySpend = useMemo(() => {
    const real = Number(summary?.realBalance || 0);
    // If real balance is positive, split ONLY real balance across horizon
    if (real > 0) return real / horizonDays;
    // Otherwise include upcoming inflows/outflows within today..horizonEnd
    const withinHorizon = (dateStr) => {
      const d = new Date(dateStr);
      if (isNaN(d)) return false;
      return d >= startOfToday && d <= horizonEnd;
    };
    const payIn = (Array.isArray(paychecks) ? paychecks : [])
      .filter(p => withinHorizon(p.StartDate || p.start_date))
      .reduce((s,p) => s + Math.abs(Number(p.Amount ?? p.estimated_amount ?? 0)), 0);
    const billsOut = (Array.isArray(bills) ? bills : [])
      .filter(b => withinHorizon(b.StartDate || b.start_date))
      .reduce((s,b) => s + Math.abs(Number(b.Amount ?? b.estimated_amount ?? 0)), 0);
    const spendable = real + payIn - billsOut;
    return spendable / horizonDays;
  }, [summary?.realBalance, paychecks, bills, horizonDays, horizonEnd, startOfToday]);

  const recentDebits = useMemo(() => (transactions || []).filter(t => Number(t.Amount) < 0).slice(0, 20), [transactions]);

  return (
    <div>
      {/* Row 1:       npm --workspace client run dev, Daily Spend, Upcoming Bills total */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card title="Real Balance" value={loadingSummary ? '—' : currency(summary?.realBalance || 0)} accent="green" />
        <Card title="Daily Spend" value={loadingSummary ? '—' : currency(dailySpend)} accent="purple" />
        <Card title="Bills (Upcoming)" value={loadingSummary ? '—' : currency(summary?.upcomingTotal || 0)} accent="red" />
      </section>

      {/* Row 2: Accounts, Upcoming Paychecks, Upcoming Bills */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <Card title="Accounts">
            <List
              items={accountSummary}
              empty="No accounts"
              renderItem={a => (
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium app-text">{a.DisplayName}</div>
                  <div className={`font-semibold ${a.Balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currency(a.Balance)}</div>
                </div>
              )}
            />
          </Card>
        </div>
        <div className="space-y-3">
          <Card title="Upcoming Paychecks">
            <List
              items={paychecks}
              empty="No upcoming paychecks"
              renderItem={p => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate app-text">{p.PaycheckName || p.name}</div>
                    <div className="text-xs app-muted">{new Date(p.StartDate || p.start_date).toLocaleDateString()} {(p.IsRecurring || p.is_recurring) ? `• ${p.RecurringType || p.recurring_type}` : ''}</div>
                  </div>
                  <div className="font-semibold text-emerald-700">{currency(p.Amount || p.estimated_amount)}</div>
                </div>
              )}
            />
          </Card>
        </div>
        <div className="space-y-3">
          <Card title="Upcoming Bills">
            <List
              items={bills}
              empty="No upcoming bills"
              renderItem={b => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate app-text">{b.BillName || b.name}</div>
                    <div className="text-xs app-muted">{new Date(b.StartDate || b.start_date).toLocaleDateString()} {(b.IsRecurring || b.is_recurring) ? `• ${b.RecurringType || b.recurring_type}` : ''}</div>
                  </div>
                  <div className="font-semibold text-rose-700">{currency(b.Amount || b.estimated_amount)}</div>
                </div>
              )}
            />
          </Card>
        </div>
        {/* Row 3: Recent debits full-width */}
        <div className="lg:col-span-3 space-y-3">
          <Card title="Recent Transactions">
            <List
              items={recentDebits}
              empty="No recent debits"
              renderItem={t => (
                <div className="grid grid-cols-3 items-center gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate app-text">{t.Description}</div>
                    <div className="text-xs app-muted">{new Date(t.TransactionDate).toLocaleDateString()}</div>
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {getTransactionBadges(t).map((b, i) => (
                        <Badge key={`${b.label}-${i}`} kind={b.kind}>{b.label}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0 text-sm app-muted truncate">{t.DisplayName || t.AccountName}</div>
                  <div className="flex items-center justify-end gap-2">
                    <div className="font-semibold text-rose-700">{currency(t.Amount)}</div>
                    {t.Synthetic ? (
                      <button
                        onClick={async () => { await postJson(`/api/recurrings/${t.RecurringId}/skip`, {}); refreshMoney({ summary: true, accountBalances: true, transactions: true, bills: true, paychecks: true }); }}
                        className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
                      >Clear</button>
                    ) : null}
                  </div>
                </div>
              )}
            />
            <div className="p-4 pt-0 text-right">
              <NavLink to="/transactions" className="text-sm text-emerald-700 hover:underline">View all transactions →</NavLink>
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}

function AccountsPage({ accountSummary, loadingAcct, accounts, postJson, del, reloadSummary, reloadAcct, reloadAccounts, refreshMoney }) {
  return (
    <div className="space-y-6">
      <Card title="Accounts" value="">
        <List
          items={accountSummary}
          empty="No accounts"
          renderItem={a => (
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium app-text">{a.DisplayName}</div>
              <div className={`font-semibold ${a.Balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currency(a.Balance)}</div>
              <div className="flex items-center gap-2">
                <AccountInlineEdit a={a} onSaved={async () => { refreshMoney({ summary: true, accountBalances: true, accountList: true }); }} />
                <button onClick={async () => { await del(`/api/accounts/${a.AccountId}`); refreshMoney({ summary: true, accountBalances: true, accountList: true }); }} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10">Archive</button>
              </div>
            </div>
          )}
        />
      </Card>
      <Card title="Add Account" value="">
  <AccountForm onSubmit={async (payload) => { await postJson('/api/accounts', payload); refreshMoney({ summary: true, accountBalances: true, accountList: true }); }} />
      </Card>
    </div>
  )
}

function BillsPage({ bills, loadingBills, postJson, del, reloadBills, reloadSummary, refreshMoney }) {
  return (
    <div className="space-y-6">
  <Card title="Bills" value="">
        <List
          items={bills}
          empty="No bills"
          renderItem={b => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium app-text truncate">{b.BillName}</div>
                <div className="text-xs app-muted">{new Date(b.StartDate).toLocaleDateString()} {b.IsRecurring ? `• ${b.RecurringType}` : ''}</div>
              </div>
              <div className="font-semibold text-rose-700">{currency(b.Amount)}</div>
              <button onClick={async () => { await del(`/api/bills/${b.id}`); reloadBills(); refreshMoney({ summary: true }); }} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-rose-700 hover:bg-black/5 dark:text-rose-400 dark:hover:bg-white/10">Delete</button>
            </div>
          )}
        />
      </Card>
      <Card title="Add Bill" value="">
  <BillForm onSubmit={async (payload) => { await postJson('/api/bills', payload); reloadBills(); refreshMoney({ summary: true }); }} />
      </Card>
    </div>
  )
}

function RecurringForm({ onSubmit }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('Bill')
  const [estimatedAmount, setEstimatedAmount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [isRecurring, setIsRecurring] = useState(true)
  const [recurringType, setRecurringType] = useState('Monthly')
  return (
    <form className="p-4 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      await onSubmit({ name, type, estimatedAmount: Number(estimatedAmount), startDate, isRecurring, recurringType: isRecurring ? recurringType : null });
      setName(''); setEstimatedAmount(''); setStartDate(''); setIsRecurring(true); setRecurringType('Monthly'); setType('Bill');
    }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
        </Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card">
            <option>Bill</option>
            <option>Paycheck</option>
          </select>
        </Field>
        <Field label="Estimated Amount">
          <input type="number" step="0.01" value={estimatedAmount} onChange={e => setEstimatedAmount(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
        </Field>
        <Field label="Start Date">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm app-text flex items-center gap-2"><input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} /> Recurring</label>
        {isRecurring && (
          <select value={recurringType} onChange={e => setRecurringType(e.target.value)} className="border app-border rounded px-3 py-2 app-card">
            <option>Monthly</option>
            <option>Weekly</option>
            <option>Bi-Weekly</option>
            <option>Semi-Monthly</option>
            <option>Annually</option>
          </select>
        )}
      </div>
      <button className="mt-2 px-3 py-2 rounded btn-primary">Add Recurring</button>
    </form>
  )
}

function RecurringConfirm({ r, accounts, onConfirm }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10))
  const [amount, setAmount] = useState(String(r.estimated_amount || r.Amount || ''))
  const [accountId, setAccountId] = useState('')
  return (
    <div className="flex items-center gap-2">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">Confirm</button>
      ) : (
        <form className="flex items-center gap-2" onSubmit={async (e) => { e.preventDefault(); await onConfirm({ date, amount: Number(amount), accountId: Number(accountId) }); setOpen(false); }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border app-border rounded px-2 py-1 app-card text-sm" required />
          <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="border app-border rounded px-2 py-1 app-card w-28 text-sm" required />
          <select value={accountId} onChange={e => setAccountId(e.target.value)} className="border app-border rounded px-2 py-1 app-card text-sm" required>
            <option value="" disabled>Select account</option>
            {accounts?.map(a => (
              <option key={a.id || a.AccountId || a.AccountName} value={a.id || a.AccountId}>{a.DisplayName}</option>
            ))}
          </select>
          <button className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">Save</button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">Cancel</button>
        </form>
      )}
    </div>
  )
}

function RecurringPage({ accounts, postJson, patchJson, del, reloadSummary, reloadAcct, reloadTx, reloadBills, reloadPaychecks, refreshMoney }) {
  const { data: recurrings, loading: loadingRecurrings, reload: reloadRecurrings } = useApi('/api/recurrings')
  const bills = useMemo(() => (recurrings || []).filter(r => r.type === 'Bill'), [recurrings])
  const paychecks = useMemo(() => (recurrings || []).filter(r => r.type === 'Paycheck'), [recurrings])
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ name: '', type: 'Bill', estimatedAmount: '', startDate: '', isRecurring: true, recurringType: 'Monthly' })
  const beginEdit = (r) => {
    setEdit(r.id)
    setForm({
      name: r.name,
      type: r.type,
      estimatedAmount: String(r.estimated_amount ?? r.Amount ?? ''),
      startDate: (r.start_date || r.StartDate || '').slice(0,10),
      isRecurring: Boolean(r.is_recurring ?? true),
      recurringType: r.recurring_type || 'Monthly',
    })
  }
  return (
    <div className="space-y-6">
  <Card title="Recurring" value="">
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="font-semibold mb-2">Paychecks</div>
            <List
              items={paychecks}
              empty="No paychecks"
              renderItem={r => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium app-text truncate">{r.name}</div>
                    <div className="text-xs app-muted">{new Date(r.start_date || r.StartDate).toLocaleDateString()} • {r.recurring_type || r.RecurringType || 'Once'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-emerald-700">{currency(r.estimated_amount || r.Amount)}</div>
                    <RecurringConfirm r={r} accounts={accounts} onConfirm={async (payload) => { await postJson(`/api/recurrings/${r.id}/confirm`, payload); reloadRecurrings(); refreshMoney({ summary: true, accountBalances: true, transactions: true, bills: true, paychecks: true }); }} />
                    <button onClick={() => beginEdit(r)} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10">Edit</button>
                    <button onClick={async () => { await del(`/api/recurrings/${r.id}`); reloadRecurrings(); refreshMoney({ summary: true, accountBalances: true, bills: true, paychecks: true }); }} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-rose-700 hover:bg-black/5 dark:text-rose-400 dark:hover:bg-white/10">Delete</button>
                  </div>
                </div>
              )}
            />
          </div>
          <div>
            <div className="font-semibold mb-2">Bills</div>
            <List
              items={bills}
              empty="No bills"
              renderItem={r => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium app-text truncate">{r.name || r.BillName}</div>
                    <div className="text-xs app-muted">{new Date(r.start_date || r.StartDate).toLocaleDateString()} • {r.recurring_type || r.RecurringType || 'Once'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-rose-700">{currency(r.estimated_amount || r.Amount)}</div>
                    <RecurringConfirm r={r} accounts={accounts} onConfirm={async (payload) => { await postJson(`/api/recurrings/${r.id}/confirm`, payload); reloadRecurrings(); refreshMoney({ summary: true, accountBalances: true, transactions: true, bills: true, paychecks: true }); }} />
                    <button onClick={() => beginEdit(r)} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10">Edit</button>
                    <button onClick={async () => { await del(`/api/recurrings/${r.id}`); reloadRecurrings(); refreshMoney({ summary: true, accountBalances: true, bills: true, paychecks: true }); }} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-rose-700 hover:bg-black/5 dark:text-rose-400 dark:hover:bg-white/10">Delete</button>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </Card>
      {edit && (
        <Card title="Edit Recurring" value="">
          <form className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
              name: form.name,
              type: form.type,
              estimatedAmount: Number(form.estimatedAmount),
              startDate: form.startDate,
              isRecurring: Boolean(form.isRecurring),
              recurringType: form.isRecurring ? form.recurringType : null,
            }
            await patchJson(`/api/recurrings/${edit}`, payload)
            setEdit(null)
            reloadRecurrings();
            refreshMoney({ summary: true, accountBalances: true, bills: true, paychecks: true });
          }}>
            <input value={form.name} onChange={e => setForm(v => ({...v, name: e.target.value}))} placeholder="Name" className="border app-border rounded px-3 py-2 app-card" required />
            <select value={form.type} onChange={e => setForm(v => ({...v, type: e.target.value}))} className="border app-border rounded px-3 py-2 app-card">
              <option>Bill</option>
              <option>Paycheck</option>
            </select>
            <input type="number" step="0.01" value={form.estimatedAmount} onChange={e => setForm(v => ({...v, estimatedAmount: e.target.value}))} placeholder="Amount" className="border app-border rounded px-3 py-2 app-card" required />
            <input type="date" value={form.startDate} onChange={e => setForm(v => ({...v, startDate: e.target.value}))} className="border app-border rounded px-3 py-2 app-card" required />
            <label className="sm:col-span-2 text-sm app-text flex items-center gap-2">
              <input type="checkbox" checked={form.isRecurring} onChange={e => setForm(v => ({...v, isRecurring: e.target.checked}))} /> Recurring
            </label>
            {form.isRecurring && (
              <select value={form.recurringType} onChange={e => setForm(v => ({...v, recurringType: e.target.value}))} className="sm:col-span-2 border app-border rounded px-3 py-2 app-card">
                <option>Monthly</option>
                <option>Weekly</option>
                <option>Bi-Weekly</option>
                <option>Semi-Monthly</option>
                <option>Annually</option>
              </select>
            )}
            <div className="sm:col-span-2 flex gap-2">
              <button className="px-3 py-2 rounded btn-primary">Save</button>
              <button type="button" onClick={() => setEdit(null)} className="px-3 py-2 rounded border app-border">Cancel</button>
            </div>
          </form>
        </Card>
      )}
      <Card title="Add Recurring" value="">
  <RecurringForm onSubmit={async (payload) => { await postJson('/api/recurrings', payload); reloadRecurrings(); refreshMoney({ summary: true, accountBalances: true, bills: true, paychecks: true }); }} />
      </Card>
    </div>
  )
}

function TransactionsPage({ transactions, loadingTx, accounts, postJson, patchJson, del, reloadTx, reloadSummary, reloadAcct, reloadBills, reloadPaychecks, refreshMoney }) {
  const [editId, setEditId] = useState(null)
  const [editSynthetic, setEditSynthetic] = useState(false)
  const [form, setForm] = useState({ date: '', amount: '', type: 'Debit', status: 'confirmed', description: '', accountId: '' })
  const beginEdit = (t) => {
    setEditId(t.id)
    const synthetic = Boolean(t.Synthetic)
    setEditSynthetic(synthetic)
    const status = (t.Status || 'confirmed')
    const normalizedStatus = synthetic ? status : 'confirmed'
    setForm({
      date: t.TransactionDate?.slice(0,10) || '',
      amount: String(Math.abs(Number(t.Amount || 0))),
      type: (Number(t.Amount) < 0 ? 'Debit' : 'Credit'),
      status: normalizedStatus,
      description: t.Description || '',
      accountId: (t.account_id || t.accountId || '')
    })
  }
  return (
    <div className="space-y-6">
  <Card title="Transactions" value="">
        <List
          items={transactions}
          empty="No transactions"
          renderItem={t => (
            <div className="grid grid-cols-3 items-center gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate app-text">{t.Description}</div>
                <div className="text-xs app-muted">{new Date(t.TransactionDate).toLocaleDateString()}</div>
                <div className="mt-1 flex gap-1 flex-wrap">
                  {getTransactionBadges(t).map((b, i) => (
                    <Badge key={`${b.label}-${i}`} kind={b.kind}>{b.label}</Badge>
                  ))}
                </div>
              </div>
              <div className="min-w-0 text-sm app-muted truncate">{t.DisplayName || t.AccountName}</div>
              <div className="flex items-center justify-end gap-2">
                <div className={`font-semibold ${t.Amount < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{currency(t.Amount)}</div>
                {t.Synthetic ? (
                  <button
                    onClick={async () => { await postJson(`/api/recurrings/${t.RecurringId}/skip`, {}); refreshMoney({ summary: true, accountBalances: true, transactions: true, bills: true, paychecks: true }); }}
                    className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
                  >Clear</button>
                ) : (
                  <>
                    {t.Status === 'pending' && (
                      <button
                        onClick={async () => { await patchJson(`/api/transactions/${t.id}`, { status: 'confirmed' }); refreshMoney({ summary: true, accountBalances: true, transactions: true }); }}
                        className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      >Confirm</button>
                    )}
                    <button onClick={() => beginEdit(t)} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10">Edit</button>
                    <button onClick={async () => { await del(`/api/transactions/${t.id}`); refreshMoney({ summary: true, accountBalances: true, transactions: true }); }} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-rose-700 hover:bg-black/5 dark:text-rose-400 dark:hover:bg-white/10">Delete</button>
                  </>
                )}
              </div>
            </div>
          )}
        />
      </Card>
      {editId && (
        <Card title="Edit Transaction" value="">
          <form className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
              date: form.date,
              amount: Number(form.amount),
              type: form.type,
              status: form.status,
              description: form.description,
              accountId: Number(form.accountId)
            };
            await patchJson(`/api/transactions/${editId}`, payload);
            setEditId(null);
            reloadTx(); reloadSummary(); reloadAcct();
          }}>
            <input type="date" value={form.date} onChange={e => setForm(v => ({...v, date: e.target.value}))} className="border app-border rounded px-3 py-2 app-card" required />
            <input type="number" step="0.01" value={form.amount} onChange={e => setForm(v => ({...v, amount: e.target.value}))} className="border app-border rounded px-3 py-2 app-card" required />
            <select value={form.type} onChange={e => setForm(v => ({...v, type: e.target.value}))} className="border app-border rounded px-3 py-2 app-card">
              <option>Debit</option>
              <option>Credit</option>
            </select>
            {editSynthetic ? (
              <select value={form.status} onChange={e => setForm(v => ({...v, status: e.target.value}))} className="border app-border rounded px-3 py-2 app-card">
                <option>pending</option>
                <option>confirmed</option>
              </select>
            ) : (
              <select value={form.status} disabled className="border app-border rounded px-3 py-2 app-card bg-slate-100 dark:bg-slate-800">
                <option>confirmed</option>
              </select>
            )}
            <input value={form.description} onChange={e => setForm(v => ({...v, description: e.target.value}))} placeholder="Description" className="border app-border rounded px-3 py-2 app-card sm:col-span-2" />
            <select value={form.accountId} onChange={e => setForm(v => ({...v, accountId: e.target.value}))} className="border app-border rounded px-3 py-2 app-card sm:col-span-2" required>
              <option value="" disabled>Select account</option>
              {accounts?.map(a => (
                <option key={a.id || a.AccountId} value={a.id || a.AccountId}>{a.DisplayName}</option>
              ))}
            </select>
            <div className="sm:col-span-2 flex gap-2">
              <button className="px-3 py-2 rounded btn-primary">Save</button>
              <button type="button" onClick={() => setEditId(null)} className="px-3 py-2 rounded border app-border">Cancel</button>
            </div>
          </form>
        </Card>
      )}
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

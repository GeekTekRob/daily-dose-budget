import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import LoginPage from './LoginPage'

const API_URL = import.meta.env.VITE_API_URL || ''

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

// Parse a date string like 'YYYY-MM-DD' as a local date (avoid UTC off-by-one)
function localDate(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  const dt = new Date(d);
  return isNaN(dt) ? null : dt;
}

// Compute next occurrence for a recurring type (matches server/utils.js logic)
function nextOccurrenceLocal(start, recurringType) {
  if (!start) return null;
  const d = (start instanceof Date) ? new Date(start) : localDate(start);
  if (!d || isNaN(d)) return null;
  const rt = String(recurringType || '').toLowerCase();
  if (rt === 'weekly') { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }
  if (rt === 'bi-weekly' || rt === 'biweekly') { const n = new Date(d); n.setDate(n.getDate() + 14); return n; }
  if (rt === 'semi-monthly' || rt === 'semimonthly') {
    const n = new Date(d);
    const day = n.getDate();
    if (day < 15) { n.setDate(15); return n; }
    // first of next month
    n.setMonth(n.getMonth() + 1, 1);
    return n;
  }
  if (rt === 'annually' || rt === 'yearly') { const n = new Date(d); n.setFullYear(n.getFullYear() + 1); return n; }
  // default monthly
  const n = new Date(d);
  n.setMonth(n.getMonth() + 1);
  return n;
}

// Expand paychecks into multiple future occurrence dates (Date objects)
function expandPaycheckDates(paychecks, today, maxPerRecurring = 3) {
  const out = [];
  (Array.isArray(paychecks) ? paychecks : []).forEach(p => {
    const start = localDate(p.StartDate || p.start_date);
    if (!start || isNaN(start)) return;
    const isRec = Boolean(p.IsRecurring || p.is_recurring);
    const rtype = p.RecurringType || p.recurring_type || '';
    const amt = Number(p.Amount ?? p.estimated_amount ?? p.estimatedAmount ?? 0) || 0;
    if (isRec) {
      // generate up to maxPerRecurring future occurrences
      let cur = new Date(start);
      // advance until cur > today
      let safety = 0;
      while (cur <= today && safety < 100) { cur = nextOccurrenceLocal(cur, rtype); safety++; }
      for (let i = 0; i < maxPerRecurring && cur && !isNaN(cur); i++) {
        if (cur > today) out.push({ date: new Date(cur), amount: amt });
        cur = nextOccurrenceLocal(cur, rtype);
      }
    } else {
      if (start > today) out.push({ date: new Date(start), amount: amt });
    }
  });
  return out.sort((a,b) => a.date.getTime() - b.date.getTime());
}

// Format any numeric-ish value as a fixed 2-decimal string (fallback 0.00)
function formatMoneyStr(v) {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(2) : '0.00';
}

function useApi(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(r => {
        if (!r.ok) {
          if (r.status === 401) window.dispatchEvent(new Event('auth:required'))
          throw new Error('Network error')
        }
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

function Card({ title, value, accent = 'slate', children, titleHelp, titleAction }) {
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
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-base md:text-lg font-semibold opacity-90">{title}</div>
            {titleHelp ? (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-current/40 text-[10px] opacity-80"
                title={titleHelp}
                aria-label="Info"
              >i</span>
            ) : null}
          </div>
          {titleAction ? (
            <div className="text-xs font-medium opacity-90">{titleAction}</div>
          ) : null}
        </div>
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
  const navigate = useNavigate()
  useEffect(() => {
    const onAuthRequired = () => navigate('/login')
    window.addEventListener('auth:required', onAuthRequired)
    return () => window.removeEventListener('auth:required', onAuthRequired)
  }, [navigate])
  const [loggedIn, setLoggedIn] = useState(() => !!(localStorage.getItem('token') || sessionStorage.getItem('token')))
  const { data: summary, loading: loadingSummary, reload: reloadSummary } = useApi('/api/summary')
  const { data: transactions, loading: loadingTx, reload: reloadTx } = useApi('/api/transactions')
  const { data: bills, loading: loadingBills, reload: reloadBills } = useApi('/api/bills')
  const { data: paychecks, loading: loadingPaychecks, reload: reloadPaychecks } = useApi('/api/paychecks')
  const { data: accounts, reload: reloadAccounts } = useApi('/api/accounts')
  const { data: accountSummary, loading: loadingAcct, reload: reloadAcct } = useApi('/api/accounts-summary')
  // Centralized logout helper: clear token, set state and show login modal, and refresh UI data
  const logout = () => {
    localStorage.removeItem('token')
    sessionStorage.removeItem('token')
    setLoggedIn(false)
    navigate('/login')
    // Force reloads so sensitive data is cleared / re-fetched (will trigger auth modal on 401)
    refreshMoney({ summary: true, accountBalances: true, accountList: true, transactions: true, bills: true, paychecks: true })
  }

  const acctDisplay = useMemo(() => {
    const map = new Map()
    accounts?.forEach(a => map.set(a.AccountName, a.DisplayName || a.AccountName))
    return name => map.get(name) || name
  }, [accounts])

  async function postJson(url, body) {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const r = await fetch(`${API_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      if (r.status === 401) window.dispatchEvent(new Event('auth:required'))
      throw new Error('Request failed')
    }
    return r.json().catch(() => ({}))
  }

  async function patchJson(url, body) {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const r = await fetch(`${API_URL}${url}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      if (r.status === 401) window.dispatchEvent(new Event('auth:required'))
      throw new Error('Request failed')
    }
    return r.json().catch(() => ({}))
  }

  async function del(url) {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const r = await fetch(`${API_URL}${url}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!r.ok) {
      if (r.status === 401) window.dispatchEvent(new Event('auth:required'))
      throw new Error('Request failed')
    }
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
    <div>
        <header className="md:hidden flex items-center justify-between px-4 py-3 app-border border-b">
          <button aria-label="Open Menu" onClick={() => setSidebarOpen(true)} className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6"><path d="M4 6h16M4 12h16M4 18h16" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
          <div className="font-bold">Daily Dose Budget</div>
          <button onClick={() => (loggedIn ? logout() : navigate('/login'))} className="text-xs px-2 py-1 rounded border app-border">
            {loggedIn ? 'Logout' : 'Login'}
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] md:h-screen">
          {/* Sidebar desktop */}
          <aside className="hidden md:block app-border border-r p-4 md:sticky md:top-0 md:self-start md:h-screen md:flex md:flex-col">
            <div className="font-bold mb-4">Daily Dose Budget</div>
            <nav className="space-y-1 text-sm">
              <NavLink to="/" end className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Dashboard</NavLink>
              <NavLink to="/accounts" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Accounts</NavLink>
              <NavLink to="/recurring" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Recurring</NavLink>
              <NavLink to="/transactions" className={({isActive}) => `block px-2 py-1 rounded ${isActive ? 'bg-ink text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>Transactions</NavLink>
            </nav>
            <div className="mt-auto pt-6 flex items-center justify-between gap-2">
              <ThemeToggle theme={theme} setTheme={setTheme} />
              <button onClick={() => (loggedIn ? logout() : navigate('/login'))} className="inline-flex items-center text-xs px-2 py-2 rounded border app-border">
                {loggedIn ? 'Logout' : 'Login'}
              </button>
            </div>
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
                <div className="mt-6 flex items-center justify-between gap-2">
                  <ThemeToggle theme={theme} setTheme={setTheme} />
                  <button onClick={() => { setSidebarOpen(false); loggedIn ? logout() : navigate('/login') }} className="inline-flex items-center text-xs px-2 py-2 rounded border app-border">
                    {loggedIn ? 'Logout' : 'Login'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <main className="p-4 max-w-6xl mx-auto w-full md:h-screen md:overflow-y-auto flex flex-col">
            <Routes>
              <Route path="/login" element={loggedIn ? <Navigate to="/" replace /> : (
                <div className="flex items-center justify-center h-[60vh] w-full">
                  <LoginPage onLoggedIn={() => { setLoggedIn(true); refreshMoney({ summary: true, accountBalances: true, accountList: true, transactions: true, bills: true, paychecks: true }); navigate('/'); }} />
                </div>
              )} />
              <Route path="/" element={loggedIn ? <DashboardPage {...{summary, loadingSummary, transactions, loadingTx, bills, loadingBills, paychecks, loadingPaychecks, accountSummary, loadingAcct, accounts, postJson, patchJson, del, reloadSummary, reloadTx, reloadBills, reloadPaychecks, reloadAcct, reloadAccounts, acctDisplay, refreshMoney}} /> : <Navigate to="/login" replace />} />
              <Route path="/accounts" element={loggedIn ? <AccountsPage {...{accountSummary, loadingAcct, accounts, postJson, del, reloadSummary, reloadAcct, reloadAccounts, refreshMoney}} /> : <Navigate to="/login" replace />} />
              <Route path="/bills" element={loggedIn ? <BillsPage {...{bills, loadingBills, postJson, del, reloadBills, reloadSummary, refreshMoney}} /> : <Navigate to="/login" replace />} />
              <Route path="/recurring" element={loggedIn ? <RecurringPage {...{accounts, postJson, patchJson, del, reloadSummary, reloadAcct, reloadTx, reloadBills, reloadPaychecks, refreshMoney}} /> : <Navigate to="/login" replace />} />
              <Route path="/transactions" element={loggedIn ? <TransactionsPage {...{transactions, loadingTx, accounts, postJson, patchJson, del, reloadTx, reloadSummary, reloadAcct, reloadBills, reloadPaychecks, refreshMoney}} /> : <Navigate to="/login" replace />} />
            </Routes>
            <footer className="mt-auto pt-6 text-center text-xs app-muted">Self-hosted • Mobile first • Privacy friendly</footer>
          </main>
        </div>
  {/* Auth handled via /login route; no modal fallback */}
    </div>
  )
}

export default App

// Small badge for labeling transaction types
export function Badge({ kind = 'neutral', children }) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border'
  const tone = {
    debit: 'text-rose-700 border-rose-600/40',
    credit: 'text-emerald-700 border-emerald-600/40',
  pending: 'text-rose-700 border-rose-600/60',
    adjustment: 'app-muted app-border',
    neutral: 'app-muted app-border',
  }[String(kind).toLowerCase()] || 'app-muted app-border'
  return <span className={`${base} ${tone}`}>{children}</span>
}

// Helper to determine badges for a transaction
export function getTransactionBadges(t) {
  const badges = []
  const desc = (t?.Description || '').toLowerCase()
  if (desc.includes('manual adjustment') || desc.includes('initial balance') || desc.includes('balance adjustment')) badges.push({ label: 'Adjustment', kind: 'adjustment' })
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
  const [initialBalance, setInitialBalance] = useState('0.00')
  const [type, setType] = useState('Checking')
  return (
    <form className="p-4 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await onSubmit({ name, displayName, initialBalance: Number(initialBalance || 0), type });
        setName(''); setDisplayName(''); setInitialBalance('0.00'); setType('Checking');
      } catch (err) {
        if (/Unauthorized/i.test(String(err))) window.dispatchEvent(new Event('auth:required'))
        else alert('Failed to add account')
      }
    }}>
      <Field label="Internal Name">
  <input value={name} onChange={e => setName(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <Field label="Display Name">
  <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
      </Field>
      <Field label="Type">
        <select value={type} onChange={e => setType(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card">
          <option>Checking</option>
          <option>Savings</option>
        </select>
      </Field>
    <Field label="Initial Balance">
  <input type="number" step="0.01" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} onBlur={e => setInitialBalance(formatMoneyStr(e.target.value))} className="w-full border app-border rounded px-3 py-2 app-card" />
      </Field>
  <button className="mt-2 px-3 py-2 rounded btn-primary">Add Account</button>
    </form>
  )
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-[520px] app-card app-border border rounded-xl shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b app-border flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="px-2 py-1 text-sm rounded border app-border">Close</button>
        </div>
        <div className="p-4">
          {children}
        </div>
        {footer ? (
          <div className="px-4 py-3 border-t app-border bg-black/5 dark:bg-white/5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

function AccountInlineEdit({ a, onSaved }) {
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState(a.DisplayName || '')
  const [type, setType] = useState(a.AccountType || 'Checking')
  const [balanceResetAmount, setBalanceResetAmount] = useState('')
  const [balanceResetDate, setBalanceResetDate] = useState('')
  const save = async () => {
  const payload = { displayName, type }
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
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10">Edit</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit Account">
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={async (e) => { e.preventDefault(); await save(); }}>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display Name" className="border app-border rounded px-3 py-2 app-card sm:col-span-2" required />
          <select value={type} onChange={e => setType(e.target.value)} className="border app-border rounded px-3 py-2 app-card">
            <option>Checking</option>
            <option>Savings</option>
          </select>
          <input type="number" step="0.01" value={balanceResetAmount} onChange={e => setBalanceResetAmount(e.target.value)} onBlur={e => setBalanceResetAmount(formatMoneyStr(e.target.value))} placeholder="Set Balance (optional)" className="border app-border rounded px-3 py-2 app-card" />
          <input type="date" value={balanceResetDate} onChange={e => setBalanceResetDate(e.target.value)} className="border app-border rounded px-3 py-2 app-card" />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded border app-border">Cancel</button>
            <button className="px-3 py-2 rounded btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </>
  )
}

function BillForm({ onSubmit }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('0.00')
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
  <input type="number" step="0.01" value={amount || '0.00'} onChange={e => setAmount(e.target.value)} onBlur={e => setAmount(formatMoneyStr(e.target.value))} className="w-full border app-border rounded px-3 py-2 app-card" required />
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
  const [accountId, setAccountId] = useState(() => {
    if (accounts && accounts.length === 1) return String(accounts[0].id || accounts[0].AccountId)
    return ''
  })
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
  <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} onBlur={e => setAmount(formatMoneyStr(e.target.value))} className="w-full border app-border rounded px-3 py-2 app-card" required />
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
        .map(p => localDate(p.StartDate || p.start_date))
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

  // Compute adjusted Real Balance: current available after accounting for bills up to the next
  // paycheck. If those bills exceed current + next paycheck, include the second upcoming
  // paycheck to cover shortfall if it occurs within 20 days of today. Always clamp >= 0.
  const adjustedRealBalance = useMemo(() => {
    const real = Number(summary?.realBalance || 0);
    // total available across accounts (do not allow adjusted to exceed this)
    const totalAvailable = (Array.isArray(accountSummary) ? accountSummary : [])
      .reduce((s, a) => s + Number(a.Balance ?? a.Balance ?? 0), 0);
    const today = startOfToday || new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const msPerDay = 24 * 60 * 60 * 1000;
    const fallbackMaxDate = new Date(today.getTime() + 20 * msPerDay);

    // Expanded paycheck occurrences with amounts
    const occ = expandPaycheckDates(paychecks, today, 3) || [];
    const next = occ[0] || null;
    const second = occ[1] || null;

    // helper to sum bills before a date (strictly before)
    const sumBillsBefore = (cutoffDate) => {
      return (Array.isArray(bills) ? bills : [])
        .map(b => ({ d: localDate(b.StartDate || b.start_date), amt: Math.abs(Number(b.Amount ?? b.estimated_amount ?? 0)) }))
        .filter(x => x.d && !isNaN(x.d) && x.d >= today && x.d < cutoffDate)
        .reduce((s, x) => s + x.amt, 0);
    };

    // helper to sum bills on/after a date up to an upper bound (inclusive)
    const sumBillsOnOrAfterTo = (startDate, upperDate) => {
      return (Array.isArray(bills) ? bills : [])
        .map(b => ({ d: localDate(b.StartDate || b.start_date), amt: Math.abs(Number(b.Amount ?? b.estimated_amount ?? 0)) }))
        .filter(x => x.d && !isNaN(x.d) && x.d >= startDate && x.d <= upperDate)
        .reduce((s, x) => s + x.amt, 0);
    };

    // No upcoming paycheck -> consider bills up to 20 days
    if (!next) {
      const billsUpTo = sumBillsOnOrAfterTo(today, fallbackMaxDate);
  return Math.min(totalAvailable, real - billsUpTo);
    }

    // Bills strictly before next paycheck
    const billsBeforeNext = sumBillsBefore(next.date);
    const baseAfterBeforeNext = real - billsBeforeNext;

    // Determine evaluation window for bills/paychecks on/after next (second paycheck date or 20 days)
    const upperForAfterNext = (second && second.date && second.date <= fallbackMaxDate) ? second.date : fallbackMaxDate;

    // Sum bills and paychecks within [next.date .. upperForAfterNext]
    const billsBetween = sumBillsOnOrAfterTo(next.date, upperForAfterNext);
    const payInBetween = occ
      .filter(p => p.date && p.date >= next.date && p.date <= upperForAfterNext)
      .reduce((s, p) => s + Math.abs(Number(p.amount || 0)), 0);

    const netBetween = payInBetween - billsBetween;
    const adjusted = baseAfterBeforeNext + (netBetween < 0 ? netBetween : 0);
    return Math.min(totalAvailable, adjusted);
  }, [summary?.realBalance, paychecks, bills, startOfToday, accountSummary]);

  const dailySpend = useMemo(() => {
    // Use the same Real Balance shown on the card (server value preferred)
    const base = Number((summary?.adjustedRealBalance ?? adjustedRealBalance) || 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const today = startOfToday || new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    // If balance is not positive right now, you shouldn't spend -> 0 per requirement
    if (base <= 0) return 0;

    const occ = expandPaycheckDates(paychecks, today, 6) || [];
    const fallbackMax = new Date(today.getTime() + 20 * msPerDay);
    const nextPay = occ.length ? occ[0].date : null;
    const targetDate = nextPay ? (nextPay < fallbackMax ? nextPay : fallbackMax) : fallbackMax;

    const endDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const days = Math.max(1, Math.round((endDay - today) / msPerDay));
    return Math.max(0, base / days);
  }, [summary?.adjustedRealBalance, adjustedRealBalance, paychecks, startOfToday]);

  // Show most recent transactions (both debits and credits), so Manual Adjustments are included
  const recentTx = useMemo(() => (transactions || []).slice(0, 20), [transactions]);

  // Compute upcoming bills to show on the Dashboard: only bills due between today
  // and the second upcoming paycheck (exclusive). If only one upcoming paycheck
  // exists we use that paycheck as the upper bound (exclusive). If no paychecks
  // are loaded, fall back to the next 15 days. Limit to the next 5 items.
  const upcomingBills = useMemo(() => {
  const today = startOfToday || new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  // Expand paychecks into multiple future dates to account for recurring schedules
  const payDates = (expandPaycheckDates(paychecks, today, 3) || []).map(p => (p && p.date) ? p.date : p);
  // initial upper bound: second upcoming paycheck, or first, or 20 days
  let initialUpper;
  if (payDates.length >= 2) initialUpper = payDates[1];
  else if (payDates.length === 1) initialUpper = payDates[0];
  else initialUpper = new Date(today.getTime() + 20 * msPerDay);

    const allBills = Array.isArray(bills) ? bills : [];
    const inWindow = (dateStr, up) => {
      const d = localDate(dateStr);
      if (isNaN(d)) return false;
      return d >= today && d <= up;
    };

    const sortByDate = (arr) => arr.sort((a,b) => new Date((a.StartDate || a.start_date)).getTime() - new Date((b.StartDate || b.start_date)).getTime());

    // Try primary window first
    let filtered = sortByDate(allBills.filter(b => inWindow(b.StartDate || b.start_date, initialUpper)));
    if (filtered.length >= 5) return filtered.slice(0,5);

  // Not enough items: extend to third paycheck or 30 days as a second pass
  let extendedUpper = null;
  if (payDates.length >= 3) extendedUpper = payDates[2];
  else extendedUpper = new Date(today.getTime() + 30 * msPerDay);

    // Ensure extendedUpper is at least as large as initialUpper
    if (extendedUpper.getTime() < initialUpper.getTime()) extendedUpper = initialUpper;

    filtered = sortByDate(allBills.filter(b => inWindow(b.StartDate || b.start_date, extendedUpper)));
    return filtered.slice(0,5);
  }, [bills, paychecks, startOfToday]);

  // Client-side upcoming total: sum of bills due from today up to the paycheck after next
  const upcomingTotalClient = useMemo(() => {
  const today = startOfToday || new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const payDates = (expandPaycheckDates(paychecks, today, 3) || []).map(p => (p && p.date) ? p.date : p);
  // upper bound is the paycheck after next (second future paycheck), or the first if only one, or today+20d
  let upper;
  if (payDates.length >= 2) upper = payDates[1];
  else if (payDates.length === 1) upper = payDates[0];
  else upper = new Date(today.getTime() + 20 * msPerDay);

    const allBills = Array.isArray(bills) ? bills : [];
    const total = allBills
      .filter(b => {
        const d = localDate(b.StartDate || b.start_date);
        if (isNaN(d)) return false;
        return d >= today && d <= upper;
      })
      .reduce((s,b) => s + Math.abs(Number(b.Amount ?? b.estimated_amount ?? 0)), 0);
    return total;
  }, [bills, paychecks, startOfToday]);

  return (
    <div>
      {/* Row 1:       npm --workspace client run dev, Daily Spend, Upcoming Bills total */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card
          title="Real Balance"
          value={loadingSummary ? '—' : currency((summary?.adjustedRealBalance ?? adjustedRealBalance) || 0)}
          accent="green"
          titleHelp="Current available balance after accounting for upcoming bills through next paycheck (and shortfall handling)."
        >
          {summary?.shortfallUsed ? (
            <div className="px-4 py-2 text-xs app-muted">
              Shortfall window: {summary.shortfallWindowStart} → {summary.shortfallWindowEnd}
            </div>
          ) : null}
        </Card>
        <Card
          title="Daily Spend"
          value={loadingSummary ? '—' : currency((summary?.dailySpend ?? dailySpend) || 0)}
          accent="purple"
          titleHelp="Estimated amount you can spend per day until the next paycheck that makes net positive (or 20 days)."
        />
        <Card
          title="Bills (Upcoming)"
          value={loadingSummary ? '—' : currency(upcomingTotalClient || 0)}
          accent="red"
          titleHelp="Sum of upcoming bills due between today and the paycheck after next."
        />
      </section>

      {/* Row 2: Accounts, Upcoming Paychecks, Upcoming Bills */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <Card title="Accounts" titleAction={<NavLink to="/accounts" className="hover:underline">View →</NavLink>}>
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
          <Card title="Upcoming Paychecks" titleAction={<NavLink to="/recurring" className="hover:underline">View →</NavLink>}>
            <List
              items={paychecks}
              empty="No upcoming paychecks"
              renderItem={p => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate app-text">{p.PaycheckName || p.name}</div>
                    <div className="text-xs app-muted">{localDate(p.StartDate || p.start_date)?.toLocaleDateString()} {(p.IsRecurring || p.is_recurring) ? `• ${p.RecurringType || p.recurring_type}` : ''}</div>
                  </div>
                  <div className="font-semibold text-emerald-700">{currency(p.Amount || p.estimated_amount)}</div>
                </div>
              )}
            />
          </Card>
        </div>
        <div className="space-y-3">
          <Card title="Upcoming Bills" titleAction={<NavLink to="/recurring" className="hover:underline">View →</NavLink>}>
            <List
              items={upcomingBills}
              empty="No upcoming bills"
              renderItem={b => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate app-text">{b.BillName || b.name}</div>
                    <div className="text-xs app-muted">{localDate(b.StartDate || b.start_date)?.toLocaleDateString()} {(b.IsRecurring || b.is_recurring) ? `• ${b.RecurringType || b.recurring_type}` : ''}</div>
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
            <div className="px-4 py-2 text-[11px] uppercase tracking-wide app-muted grid grid-cols-3 gap-3 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
              <div>Description • Date • Badges</div>
              <div>Account</div>
              <div className="text-right">Amount • Actions</div>
            </div>
            <List
        items={recentTx}
        empty="No recent transactions"
              renderItem={t => (
                <div className="grid grid-cols-3 items-center gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate app-text">{t.Description}</div>
                    <div className="text-xs app-muted">{localDate(t.TransactionDate)?.toLocaleDateString()}</div>
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {getTransactionBadges(t).map((b, i) => (
                        <Badge key={`${b.label}-${i}`} kind={b.kind}>{b.label}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0 text-sm app-muted truncate">
                    {t.Synthetic ? <Badge kind="pending">PENDING</Badge> : (t.DisplayName || t.AccountName)}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <div className={`font-semibold ${t.Amount < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{currency(t.Amount)}</div>
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
  const [showAdd, setShowAdd] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  // Default account for adjustment: if exactly one account, default to it; otherwise remember last choice
  const onlyAccountId = accounts && accounts.length === 1 ? (accounts[0].id || accounts[0].AccountId) : null
  const [adjustAcctId, setAdjustAcctId] = useState(onlyAccountId || '')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustDate, setAdjustDate] = useState(() => new Date().toISOString().slice(0,10))
  // Keep default in sync when accounts list changes and only one exists
  useEffect(() => {
    if (accounts && accounts.length === 1) {
      setAdjustAcctId(accounts[0].id || accounts[0].AccountId)
    }
  }, [accounts])
  // Fetch archived accounts
  const { data: archivedAccounts } = useApi('/api/accounts?archived=1')
  return (
    <div className="space-y-6">
      <Card title="Accounts" value="" titleAction={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAdd(true)} className="text-xs px-2 py-1 rounded btn-primary">Add Account</button>
          <button onClick={() => setShowAdjust(true)} className="text-xs px-2 py-1 rounded border app-border">Set Manual Balance</button>
        </div>
      }>
        {/* Checking Accounts */}
        <div className="px-4 py-2 text-[11px] uppercase tracking-wide app-muted sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur">Checking</div>
        <div className="px-4 py-2 text-[11px] uppercase tracking-wide app-muted grid grid-cols-5 gap-3 sticky top-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
          <div>Type</div>
          <div>Internal Name</div>
          <div>Display Name</div>
          <div>Amount</div>
          <div className="text-right">Actions</div>
        </div>
        <List
          items={(accountSummary || []).filter(a => (a.AccountType || 'Checking') !== 'Savings')}
          empty="No checking accounts"
          renderItem={a => (
            <div className="grid grid-cols-5 items-center gap-3">
              <div className="text-xs app-muted">{a.AccountType || 'Checking'}</div>
              <div className="min-w-0 text-sm app-muted truncate">{a.AccountName}</div>
              <div className="min-w-0 font-medium app-text truncate">{a.DisplayName}</div>
              <div className={`font-semibold ${a.Balance < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{currency(a.Balance)}</div>
              <div className="flex items-center justify-end gap-2">
                <AccountInlineEdit a={a} onSaved={async () => { refreshMoney({ summary: true, accountBalances: true, accountList: true, transactions: true }); }} />
                <button onClick={async () => { await del(`/api/accounts/${a.AccountId}`); refreshMoney({ summary: true, accountBalances: true, accountList: true }); }} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10">Archive</button>
              </div>
            </div>
          )}
        />
        {/* Savings Accounts */}
        <div className="mt-6 px-4 py-2 text-[11px] uppercase tracking-wide app-muted sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur">Savings</div>
        <div className="px-4 py-2 text-[11px] uppercase tracking-wide app-muted grid grid-cols-5 gap-3 sticky top-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
          <div>Type</div>
          <div>Internal Name</div>
          <div>Display Name</div>
          <div>Amount</div>
          <div className="text-right">Actions</div>
        </div>
        <List
          items={(accountSummary || []).filter(a => (a.AccountType || 'Checking') === 'Savings')}
          empty="No savings accounts"
          renderItem={a => (
            <div className="grid grid-cols-5 items-center gap-3">
              <div className="text-xs app-muted">{a.AccountType || 'Savings'}</div>
              <div className="min-w-0 text-sm app-muted truncate">{a.AccountName}</div>
              <div className="min-w-0 font-medium app-text truncate">{a.DisplayName}</div>
              <div className={`font-semibold ${a.Balance < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{currency(a.Balance)}</div>
              <div className="flex items-center justify-end gap-2">
                <AccountInlineEdit a={a} onSaved={async () => { refreshMoney({ summary: true, accountBalances: true, accountList: true, transactions: true }); }} />
                <button onClick={async () => { await del(`/api/accounts/${a.AccountId}`); refreshMoney({ summary: true, accountBalances: true, accountList: true }); }} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-slate-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10">Archive</button>
              </div>
            </div>
          )}
        />
      </Card>
      {/* Add Account Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Account">
  <AccountForm onSubmit={async (payload) => { await postJson('/api/accounts', payload); setShowAdd(false); refreshMoney({ summary: true, accountBalances: true, accountList: true, transactions: true }); }} />
      </Modal>
      {/* Set Manual Balance Adjustment Modal */}
      <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title="Set Manual Balance">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!adjustAcctId) return;
          await fetch(`${API_URL}/api/accounts/${adjustAcctId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balanceResetDate: adjustDate, balanceResetAmount: Number(adjustAmount || 0) })
          })
          setShowAdjust(false)
          setAdjustAmount('')
          refreshMoney({ summary: true, accountBalances: true, accountList: true, transactions: true })
        }}>
          {(!accounts || accounts.length !== 1) && (
            <Field label="Account">
              <select value={adjustAcctId} onChange={e => setAdjustAcctId(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required>
                <option value="" disabled>Select account</option>
                {accounts?.map(a => (
                  <option key={a.id || a.AccountId} value={a.id || a.AccountId}>{a.DisplayName}</option>
                ))}
              </select>
            </Field>
          )}
          {accounts && accounts.length === 1 && (
            <div className="text-sm app-muted">Account: {accounts[0].DisplayName}</div>
          )}
          <Field label="Set Balance To">
            <input type="number" step="0.01" value={adjustAmount || '0.00'} onChange={e => setAdjustAmount(e.target.value)} onBlur={e => setAdjustAmount(formatMoneyStr(e.target.value))} className="w-full border app-border rounded px-3 py-2 app-card" required />
          </Field>
          <Field label="Effective Date">
            <input type="date" value={adjustDate} onChange={e => setAdjustDate(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdjust(false)} className="px-3 py-2 rounded border app-border">Cancel</button>
            <button className="px-3 py-2 rounded btn-primary">Save</button>
          </div>
        </form>
      </Modal>
      {/* Archived Accounts */}
      <Card title="Archived Accounts" value="">
        <List
          items={archivedAccounts}
          empty="No archived accounts"
          renderItem={a => (
            <div className="grid grid-cols-4 items-center gap-3">
              <div className="min-w-0 text-sm app-muted truncate">{a.AccountName}</div>
              <div className="min-w-0 font-medium app-text truncate">{a.DisplayName}</div>
              <div className="text-sm app-muted">—</div>
              <div className="text-right text-xs app-muted">Archived</div>
            </div>
          )}
        />
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
                <div className="text-xs app-muted">{localDate(b.StartDate)?.toLocaleDateString()} {b.IsRecurring ? `• ${b.RecurringType}` : ''}</div>
              </div>
              <div className="font-semibold text-rose-700">{currency(b.Amount)}</div>
              <button onClick={async () => { await del(`/api/bills/${b.id}`); reloadBills(); refreshMoney({ summary: true, transactions: true }); window.dispatchEvent(new Event('recurrings:reload')); window.dispatchEvent(new Event('transactions:reload')); }} className="text-xs px-2 py-1 rounded border app-border bg-transparent text-rose-700 hover:bg-black/5 dark:text-rose-400 dark:hover:bg-white/10">Delete</button>
            </div>
          )}
        />
      </Card>
      <Card title="Add Bill" value="">
  <BillForm onSubmit={async (payload) => { await postJson('/api/bills', payload); reloadBills(); refreshMoney({ summary: true, transactions: true }); window.dispatchEvent(new Event('recurrings:reload')); window.dispatchEvent(new Event('transactions:reload')); }} />
      </Card>
    </div>
  )
}

function RecurringForm({ onSubmit, defaultType = 'Bill', defaultRecurringType = 'Monthly' }) {
  const [name, setName] = useState('')
  const [type, setType] = useState(defaultType)
  const [estimatedAmount, setEstimatedAmount] = useState('0.00')
  const [startDate, setStartDate] = useState('')
  const [isRecurring, setIsRecurring] = useState(true)
  const [recurringType, setRecurringType] = useState(defaultRecurringType)
  useEffect(() => {
    setType(defaultType);
    setRecurringType(defaultRecurringType);
    setIsRecurring(true);
  }, [defaultType, defaultRecurringType]);
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
          <input type="number" step="0.01" value={estimatedAmount} onChange={e => setEstimatedAmount(e.target.value)} onBlur={e => setEstimatedAmount(formatMoneyStr(e.target.value))} className="w-full border app-border rounded px-3 py-2 app-card" required />
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
  const [amount, setAmount] = useState(formatMoneyStr(String(r.estimated_amount || r.Amount || '0')))
  const [accountId, setAccountId] = useState(() => {
    if (accounts && accounts.length === 1) return String(accounts[0].id || accounts[0].AccountId)
    return ''
  })
  return (
    <div className="flex items-center gap-2">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">Confirm</button>
      ) : (
        <form className="flex items-center gap-2" onSubmit={async (e) => { e.preventDefault(); await onConfirm({ date, amount: Number(amount), accountId: Number(accountId) }); setOpen(false); }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border app-border rounded px-2 py-1 app-card text-sm" required />
          <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} onBlur={e => setAmount(formatMoneyStr(e.target.value))} className="border app-border rounded px-2 py-1 app-card w-28 text-sm" required />
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
  const [showAddBill, setShowAddBill] = useState(false)
  const [showAddPaycheck, setShowAddPaycheck] = useState(false)
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
  useEffect(() => {
    const onReload = () => reloadRecurrings();
    window.addEventListener('recurrings:reload', onReload);
    return () => window.removeEventListener('recurrings:reload', onReload);
  }, [reloadRecurrings]);
  return (
    <div className="space-y-6">
  <Card title="Recurring" value="" titleAction={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddPaycheck(true)} className="text-xs px-2 py-1 rounded btn-primary">Add Paycheck</button>
          <button onClick={() => setShowAddBill(true)} className="text-xs px-2 py-1 rounded border app-border">Add Bill</button>
        </div>
      }>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="font-semibold mb-2">Paychecks</div>
            <div className="px-4 py-2 text-[11px] uppercase tracking-wide app-muted grid grid-cols-3 gap-3 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
              <div>Name • Status</div>
              <div>Start Date</div>
              <div className="text-right">Amount • Actions</div>
            </div>
            <List
              items={paychecks}
              empty="No paychecks"
              renderItem={r => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium app-text truncate">{r.name}</div>
                    <div className="text-xs app-muted">{localDate(r.start_date || r.StartDate)?.toLocaleDateString()} • {r.recurring_type || r.RecurringType || 'Once'}</div>
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
            <div className="px-4 py-2 text-[11px] uppercase tracking-wide app-muted grid grid-cols-3 gap-3 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
              <div>Name • Status</div>
              <div>Start Date</div>
              <div className="text-right">Amount • Actions</div>
            </div>
            <List
              items={bills}
              empty="No bills"
              renderItem={r => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium app-text truncate">{r.name || r.BillName}</div>
                    <div className="text-xs app-muted">{localDate(r.start_date || r.StartDate)?.toLocaleDateString()} • {r.recurring_type || r.RecurringType || 'Once'}</div>
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
  <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit Recurring">
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={async (e) => {
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
    <input type="number" step="0.01" value={form.estimatedAmount} onChange={e => setForm(v => ({...v, estimatedAmount: e.target.value}))} onBlur={e => setForm(v => ({...v, estimatedAmount: formatMoneyStr(e.target.value)}))} placeholder="Amount" className="border app-border rounded px-3 py-2 app-card" required />
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
  </Modal>
      <Modal open={showAddPaycheck} onClose={() => setShowAddPaycheck(false)} title="Add Paycheck">
        <RecurringForm
          defaultType="Paycheck"
          defaultRecurringType="Bi-Weekly"
          onSubmit={async (payload) => {
            await postJson('/api/recurrings', payload);
            setShowAddPaycheck(false);
            reloadRecurrings();
            refreshMoney({ summary: true, accountBalances: true, bills: true, paychecks: true });
          }}
        />
      </Modal>
      <Modal open={showAddBill} onClose={() => setShowAddBill(false)} title="Add Bill">
        <RecurringForm
          defaultType="Bill"
          defaultRecurringType="Monthly"
          onSubmit={async (payload) => {
            await postJson('/api/recurrings', payload);
            setShowAddBill(false);
            reloadRecurrings();
            refreshMoney({ summary: true, accountBalances: true, bills: true, paychecks: true });
          }}
        />
      </Modal>
    </div>
  )
}

function TransactionsPage({ transactions, loadingTx, accounts, postJson, patchJson, del, reloadTx, reloadSummary, reloadAcct, reloadBills, reloadPaychecks, refreshMoney }) {
  const [editId, setEditId] = useState(null)
  const [editSynthetic, setEditSynthetic] = useState(false)
  const [form, setForm] = useState({ date: '', amount: '', type: 'Debit', status: 'confirmed', description: '', accountId: '' })
  const [showAdd, setShowAdd] = useState(false)
  // Filters
  const [filterAccountName, setFilterAccountName] = useState('')
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')
  const [filterQuery, setFilterQuery] = useState('')
  useEffect(() => {
    const onReload = () => reloadTx();
    window.addEventListener('transactions:reload', onReload);
    return () => window.removeEventListener('transactions:reload', onReload);
  }, [reloadTx]);
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
  const filteredTx = useMemo(() => {
    let list = Array.isArray(transactions) ? transactions : [];
    if (filterAccountName) {
      if (filterAccountName === '__unassigned__') list = list.filter(t => t.Synthetic);
      else list = list.filter(t => (t.AccountName || '') === filterAccountName);
    }
    if (filterStart) {
      const s = localDate(filterStart);
      list = list.filter(t => {
        const d = localDate(t.TransactionDate);
        return d && s && d >= s;
      });
    }
    if (filterEnd) {
      const e = localDate(filterEnd);
      const end = e ? new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999) : null;
      list = list.filter(t => {
        const d = localDate(t.TransactionDate);
        return d && end && d <= end;
      });
    }
    const q = (filterQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter(t => {
        const desc = String(t.Description || '').toLowerCase();
        const amtStr = Math.abs(Number(t.Amount || 0)).toFixed(2);
        return desc.includes(q) || amtStr.includes(q);
      });
    }
    return list;
  }, [transactions, filterAccountName, filterStart, filterEnd, filterQuery]);
  return (
    <div className="space-y-6">
  <Card title="Transactions" value="" titleAction={<button onClick={() => setShowAdd(true)} className="text-xs px-2 py-1 rounded btn-primary">Add</button>}>
        {/* Filters */}
        <div className="p-4 pt-3 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 flex gap-2">
            <input value={filterQuery} onChange={e => setFilterQuery(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card text-sm" placeholder="Search description or amount" />
            <button type="button" onClick={() => { setFilterAccountName(''); setFilterStart(''); setFilterEnd(''); setFilterQuery(''); }} className="px-3 py-2 rounded border app-border text-sm">Clear</button>
          </div>
          <div>
            <select value={filterAccountName} onChange={e => setFilterAccountName(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card text-sm min-w-[10rem]">
              <option value="">All accounts</option>
              <option value="__unassigned__">Pending</option>
              {accounts?.map(a => (
                <option key={a.id || a.AccountName} value={a.AccountName}>{a.DisplayName}</option>
              ))}
            </select>
          </div>
          <div>
            <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card text-sm" placeholder="Start" />
          </div>
          <div>
            <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card text-sm" placeholder="End" />
          </div>
        </div>
  <div className="px-4 py-2 text-[11px] uppercase tracking-wide app-muted grid grid-cols-3 gap-3 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
          <div>Description • Date • Transaction Type</div>
          <div>Account</div>
          <div className="text-right">Amount • Actions</div>
        </div>
        <List
          items={filteredTx}
          empty="No transactions"
          renderItem={t => (
            <div className="grid grid-cols-3 items-center gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate app-text">{t.Description}</div>
                <div className="text-xs app-muted">{localDate(t.TransactionDate)?.toLocaleDateString()}</div>
                <div className="mt-1 flex gap-1 flex-wrap">
                  {getTransactionBadges(t).map((b, i) => (
                    <Badge key={`${b.label}-${i}`} kind={b.kind}>{b.label}</Badge>
                  ))}
                </div>
              </div>
                  <div className="min-w-0 text-sm app-muted truncate">
                    {t.Synthetic ? <Badge kind="pending">PENDING</Badge> : (t.DisplayName || t.AccountName)}
                  </div>
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
  <Modal open={!!editId} onClose={() => setEditId(null)} title="Edit Transaction">
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={async (e) => {
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
    <input type="number" step="0.01" value={form.amount} onChange={e => setForm(v => ({...v, amount: e.target.value}))} onBlur={e => setForm(v => ({...v, amount: formatMoneyStr(e.target.value)}))} className="border app-border rounded px-3 py-2 app-card" required />
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
  </Modal>
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Transaction">
        <TransactionForm accounts={accounts} onSubmit={async (payload) => { await postJson('/api/transactions', payload); setShowAdd(false); reloadTx(); reloadSummary(); reloadAcct(); }} />
      </Modal>
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

// LoginPage component moved to separate file: client/src/LoginPage.jsx

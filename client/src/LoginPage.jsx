import React, { useEffect, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

function Field({ label, children }) {
  return (
    <label className="block text-sm mb-3">
      <span className="block mb-1 app-muted">{label}</span>
      {children}
    </label>
  )
}

export default function LoginPage({ onLoggedIn }) {
  const [tab, setTab] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(false)
  const userRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setUsername('')
    setPassword('')
    setConfirm('')
    setRemember(false)
    setError('')
    setBusy(false)
    setTab('login')
    setTimeout(() => userRef.current && userRef.current.focus(), 50)
  }, [])

  const submit = async (e) => {
    e && e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const endpoint = tab === 'login' ? '/api/login' : '/api/register'
      if (tab === 'register' && password !== confirm) {
        throw new Error('Passwords do not match')
      }
      const r = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (!r.ok) {
        const msg = await r.json().catch(() => ({}))
        throw new Error(msg?.error || 'Request failed')
      }
      const data = await r.json().catch(() => ({}))
      if (tab === 'login') {
        if (!data?.token) throw new Error('No token returned')
        if (remember) localStorage.setItem('token', data.token); else sessionStorage.setItem('token', data.token)
        onLoggedIn && onLoggedIn()
      } else {
        const rl = await fetch(`${API_URL}/api/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
        })
        const dj = await rl.json().catch(() => ({}))
        if (dj?.token) {
          if (remember) localStorage.setItem('token', dj.token); else sessionStorage.setItem('token', dj.token)
          onLoggedIn && onLoggedIn()
        } else {
          setTab('login')
        }
      }
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 app-card app-border rounded-lg">
      <div className="mb-3 flex gap-2 text-sm">
        <button className={`px-2 py-1 rounded border app-border ${tab==='login' ? 'bg-black/5 dark:bg-white/10' : ''}`} onClick={() => setTab('login')}>Login</button>
        <button className={`px-2 py-1 rounded border app-border ${tab==='register' ? 'bg-black/5 dark:bg-white/10' : ''}`} onClick={() => setTab('register')}>Register</button>
      </div>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Username">
          <input ref={userRef} value={username} onChange={e => setUsername(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
        </Field>
        {tab === 'register' ? (
          <Field label="Confirm Password">
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full border app-border rounded px-3 py-2 app-card" required />
          </Field>
        ) : null}
        {tab === 'register' && (
          <div className="text-sm mb-2">
            <div className={`mb-1 ${confirm && confirm !== password ? 'text-rose-700' : 'text-slate-600'}`}>{confirm ? (confirm === password ? 'Passwords match' : 'Passwords do not match') : ''}</div>
            <div className="text-xs app-muted">Password strength: {password.length >= 12 ? 'strong' : password.length >= 8 ? 'ok' : 'weak'}</div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input id="remember" type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <label htmlFor="remember" className="text-sm">Remember me</label>
        </div>
        {error ? <div className="text-sm text-rose-700">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button disabled={busy} className="px-3 py-2 rounded btn-primary">{tab === 'login' ? 'Login' : 'Register'}</button>
        </div>
      </form>
    </div>
  )
}

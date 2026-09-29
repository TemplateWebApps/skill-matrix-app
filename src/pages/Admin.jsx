import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useFeedback } from '../contexts/FeedbackContext'
import './admin.css'

// "3 days ago" reads faster than a timestamp when you're scanning for who has
// gone quiet, which is the main thing this page is for.
function ago(iso) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function exact(iso) {
  return iso ? new Date(iso).toLocaleString() : 'never'
}

export default function Admin() {
  const { isAdmin, loading: authLoading } = useAuth()
  const { confirm, toast } = useFeedback()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [query, setQuery] = useState('')

  // Starts with the await on purpose: nothing in here runs synchronously when
  // the effect below calls it, which is what keeps this out of the
  // cascading-render trap React warns about.
  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_accounts')
    if (rpcError) setError(rpcError.message)
    else {
      setRows(data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authLoading && isAdmin) load()
  }, [authLoading, isAdmin, load])

  function refresh() {
    setLoading(true)
    load()
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.email?.toLowerCase().includes(q) || r.workspace_name?.toLowerCase().includes(q),
    )
  }, [rows, query])

  const stats = useMemo(() => {
    const accounts = new Set(rows.map((r) => r.user_id)).size
    const paid = rows.filter((r) => r.plan === 'unlimited' && r.workspace_id).length
    // Someone who signed up and never added anything hasn't really tried it.
    const activated = rows.filter((r) => (r.people ?? 0) > 0 || (r.skills ?? 0) > 0).length
    return { accounts, paid, activated }
  }, [rows])

  async function setPlan(row, plan) {
    const ok = await confirm({
      title: plan === 'unlimited' ? `Upgrade ${row.workspace_name}?` : `Move to Free?`,
      message:
        plan === 'unlimited'
          ? `${row.email} gets unlimited people and skills, and the dashboard. No data moves.`
          : `${row.workspace_name} goes back to 25 people and 25 skills. Nothing is deleted — they just can't add more while over.`,
      confirmLabel: plan === 'unlimited' ? 'Upgrade' : 'Move to Free',
      destructive: plan === 'free',
    })
    if (!ok) return

    setBusyId(row.workspace_id)
    const { error: rpcError } = await supabase.rpc('admin_set_plan', {
      p_workspace_id: row.workspace_id,
      p_plan: plan,
    })
    setBusyId(null)

    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setRows((prev) =>
      prev.map((r) => (r.workspace_id === row.workspace_id ? { ...r, plan } : r)),
    )
    toast(`${row.workspace_name} is now ${plan === 'unlimited' ? 'Unlimited' : 'Free'}`)
  }

  if (authLoading) return <div className="page-center">Loading…</div>

  // The database refuses these calls on its own; this only decides what to
  // draw, so someone who isn't an admin gets a plain answer rather than a
  // page full of failed requests.
  if (!isAdmin) {
    return (
      <div className="page-center">
        <p>This page is for administrators.</p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Accounts</h1>
          <p className="admin-sub">
            {stats.accounts} {stats.accounts === 1 ? 'account' : 'accounts'} · {stats.activated}{' '}
            added something · {stats.paid} on Unlimited
          </p>
        </div>
        <div className="admin-actions">
          <input
            className="admin-search"
            placeholder="Search email or workspace…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="secondary" onClick={refresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <p className="auth-error">{error}</p>}

      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Workspace</th>
              <th>Plan</th>
              <th className="num">People</th>
              <th className="num">Skills</th>
              <th className="num">Rated</th>
              <th>Signed up</th>
              <th>Last seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.user_id}:${r.workspace_id ?? 'none'}`}>
                <td>
                  <span className="admin-email">{r.email}</span>
                  {!r.confirmed && <span className="admin-flag">unconfirmed</span>}
                </td>
                <td>{r.workspace_name ?? <span className="admin-none">no workspace</span>}</td>
                <td>
                  {r.workspace_id && (
                    <span className={`admin-plan plan-${r.plan}`}>
                      {r.plan === 'unlimited' ? 'Unlimited' : 'Free'}
                    </span>
                  )}
                </td>
                <td className="num">{r.people ?? '—'}</td>
                <td className="num">{r.skills ?? '—'}</td>
                <td className="num">{r.ratings_filled ?? '—'}</td>
                <td title={exact(r.signed_up)}>{ago(r.signed_up) ?? '—'}</td>
                <td title={exact(r.last_sign_in)} className={r.last_sign_in ? '' : 'admin-none'}>
                  {ago(r.last_sign_in) ?? 'never'}
                </td>
                <td className="admin-row-action">
                  {r.workspace_id && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busyId === r.workspace_id}
                      onClick={() => setPlan(r, r.plan === 'unlimited' ? 'free' : 'unlimited')}
                    >
                      {busyId === r.workspace_id
                        ? '…'
                        : r.plan === 'unlimited'
                          ? 'Move to Free'
                          : 'Upgrade'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <p className="admin-empty">{query ? 'Nothing matches that.' : 'No accounts yet.'}</p>
        )}
      </div>

      <p className="admin-note">
        Passwords aren&rsquo;t shown because they can&rsquo;t be — they&rsquo;re hashed, and
        nobody can read them back. If someone is locked out, send them a reset link.
      </p>
    </div>
  )
}

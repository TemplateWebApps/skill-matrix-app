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
  // The account whose audit trail is open, and the trail itself once fetched.
  const [detailFor, setDetailFor] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)

  async function openDetail(row) {
    setDetailFor(row)
    setDetail(null)
    setDetailError(null)
    const { data, error: rpcError } = await supabase.rpc('admin_workspace_history', {
      p_workspace_id: row.workspace_id,
    })
    if (rpcError) setDetailError(rpcError.message)
    else setDetail(data ?? [])
  }

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
              <th>Signed up</th>
              <th title="When this workspace last became a paying one. Blank means never.">
                Upgraded
              </th>
              <th className="num">People</th>
              <th className="num">Skills</th>
              <th className="num" title="Cells with a current level set, out of the whole grid">
                Rated
              </th>
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
                <td title={exact(r.signed_up)}>{ago(r.signed_up) ?? '—'}</td>
                <td
                  title={
                    r.upgraded_at
                      ? `${exact(r.upgraded_at)}${r.plan_changes > 1 ? ` · ${r.plan_changes} plan changes` : ''}`
                      : 'Never on a paid plan'
                  }
                >
                  {r.workspace_id &&
                    (r.upgraded_at ? (
                      <>
                        {ago(r.upgraded_at)}
                        {/* The mark that says this date isn't the whole story. */}
                        {r.plan_changes > 1 && <span className="admin-flag">×{r.plan_changes}</span>}
                      </>
                    ) : (
                      <span className="admin-none">—</span>
                    ))}
                </td>
                <td className="num">{r.people ?? '—'}</td>
                <td className="num">{r.skills ?? '—'}</td>
                {/* Out of the whole grid, because 62 means nothing without
                    knowing whether the grid holds 70 cells or 700. */}
                <td className="num" title={`${r.ratings_filled ?? 0} of ${(r.people ?? 0) * (r.skills ?? 0)} cells filled in`}>
                  {r.workspace_id ? (
                    <>
                      {r.ratings_filled ?? 0}
                      <span className="admin-of"> / {(r.people ?? 0) * (r.skills ?? 0)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td title={exact(r.last_sign_in)} className={r.last_sign_in ? '' : 'admin-none'}>
                  {ago(r.last_sign_in) ?? 'never'}
                </td>
                <td className="admin-row-action">
                  {r.workspace_id && (
                    <>
                      {/* Always available, but only lit when there's a story
                          worth reading — more than one plan change. */}
                      <button
                        type="button"
                        className={r.plan_changes > 1 ? 'admin-detail-btn is-lit' : 'admin-detail-btn'}
                        onClick={() => openDetail(r)}
                      >
                        Details
                      </button>
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
                    </>
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

      {detailFor && (
        <div className="modal-backdrop" onClick={() => setDetailFor(null)}>
          <div className="modal-card admin-detail" onClick={(e) => e.stopPropagation()}>
            <h2>{detailFor.email}</h2>
            <dl className="admin-detail-facts">
              <div>
                <dt>Workspace</dt>
                <dd>{detailFor.workspace_name}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{detailFor.role ?? '—'}</dd>
              </div>
              <div>
                <dt>Signed up</dt>
                <dd>{exact(detailFor.signed_up)}</dd>
              </div>
              <div>
                <dt>Last seen</dt>
                <dd>{exact(detailFor.last_sign_in)}</dd>
              </div>
              <div>
                <dt>Current plan</dt>
                <dd>{detailFor.plan === 'unlimited' ? 'Unlimited' : 'Free'}</dd>
              </div>
              <div>
                <dt>Built</dt>
                <dd>
                  {detailFor.people} people · {detailFor.skills} skills ·{' '}
                  {detailFor.ratings_filled} rated
                </dd>
              </div>
            </dl>

            <h3 className="admin-detail-h">Account history</h3>
            {detailError && <p className="auth-error">{detailError}</p>}
            {!detail && !detailError && <p className="admin-none">Loading…</p>}
            {detail && (
              <ol className="admin-trail">
                {detail.map((e, i) => (
                  <li key={i} className={e.is_created ? 'is-created' : ''}>
                    <span className="trail-when">{exact(e.changed_at)}</span>
                    <span className="trail-what">
                      {e.is_created ? (
                        <>
                          Workspace created on{' '}
                          <strong>{e.to_plan === 'unlimited' ? 'Unlimited' : 'Free'}</strong>
                        </>
                      ) : (
                        <>
                          <strong>{e.from_plan === 'unlimited' ? 'Unlimited' : 'Free'}</strong> →{' '}
                          <strong>{e.to_plan === 'unlimited' ? 'Unlimited' : 'Free'}</strong>
                          {e.changed_by && <span className="trail-by">by {e.changed_by}</span>}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setDetailFor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="admin-note">
        Passwords aren&rsquo;t shown because they can&rsquo;t be — they&rsquo;re hashed, and
        nobody can read them back. If someone is locked out, send them a reset link.
      </p>
    </div>
  )
}

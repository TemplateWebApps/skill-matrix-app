import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { fetchMatrix } from '../lib/matrixApi'
import { computeInsights } from '../lib/insights'
import { levelClass } from '../lib/levels'
import './dashboard.css'

// One decimal everywhere, so a column of levels lines up as 3.0 / 3.5 / 2.0
// rather than 3 / 3.5 / 2.
function fmt1(n) {
  return n == null ? '—' : n.toFixed(1)
}

function StatTile({ label, value, unit, sub, fillPct }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <p className="stat-value">
        {value ?? '—'}
        {value != null && unit && <span className="stat-unit">{unit}</span>}
      </p>
      {fillPct != null && (
        <div className="stat-track" aria-hidden="true">
          <div className="stat-fill" style={{ width: `${Math.min(100, fillPct)}%` }} />
        </div>
      )}
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  )
}

function RankedList({ title, hint, rows, emptyText }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {hint && <p className="panel-hint">{hint}</p>}
      {rows.length === 0 ? (
        <p className="panel-hint">{emptyText}</p>
      ) : (
        <ol className="ranked">
          {rows.map((row, i) => (
            <li key={row.id}>
              <span className="rank-num">{i + 1}</span>
              <span className="rank-name">
                {row.name}
                {row.meta && <span className="rank-meta">{row.meta}</span>}
              </span>
              <span className="rank-value">{row.display}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default function Dashboard() {
  const { workspace } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!workspace?.id) return
    setLoading(true)
    try {
      setData(await fetchMatrix(workspace.id))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [workspace?.id])

  useEffect(() => {
    load()
  }, [load])

  const insights = useMemo(() => (data ? computeInsights(data) : null), [data])

  async function loadSampleData() {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('seed_sample_data', {
      p_workspace_id: workspace.id,
    })
    setBusy(false)
    if (rpcError) setError(rpcError.message)
    else await load()
  }

  async function clearSampleData() {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('clear_sample_data', {
      p_workspace_id: workspace.id,
    })
    setBusy(false)
    if (rpcError) setError(rpcError.message)
    else await load()
  }

  if (loading) return <div className="page-center">Loading insights…</div>

  if (insights?.isEmpty) {
    return (
      <div className="dashboard-page">
        <section className="panel empty-panel">
          <h2>Nothing to measure yet</h2>
          <p className="panel-hint">
            Insights appear once people have been rated against skills. Add them on the{' '}
            <Link to="/app">Matrix</Link> tab, or drop in a small sample set to see what this
            looks like with data.
          </p>
          {error && <p className="auth-error">{error}</p>}
          <div className="panel-actions">
            <button type="button" onClick={loadSampleData} disabled={busy}>
              {busy ? 'Working…' : 'Load sample data'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  const maxCount = Math.max(...insights.distribution.map((d) => d.count), 1)

  return (
    <div className="dashboard-page">
      {error && <p className="auth-error">{error}</p>}

      <div className="stat-row">
        <StatTile
          label="Current proficiency"
          value={insights.currentPct}
          unit="%"
          fillPct={insights.currentPct}
          sub={`avg level ${insights.avgCurrent ?? '—'} of 4`}
        />
        <StatTile
          label="Target proficiency"
          value={insights.targetPct}
          unit="%"
          fillPct={insights.targetPct}
          sub={insights.avgTarget != null ? `avg target ${insights.avgTarget} of 4` : 'no targets set'}
        />
        <StatTile
          label="Average gap"
          value={insights.avgGap}
          sub={insights.avgGap ? 'levels from target' : 'targets met'}
        />
        <StatTile
          label="Matrix filled in"
          value={insights.coveragePct}
          unit="%"
          fillPct={insights.coveragePct}
          sub={`${insights.ratedCount} of ${insights.totalCells} cells rated`}
        />
      </div>

      <section className="panel">
        <h2>Proficiency distribution</h2>
        <p className="panel-hint">
          Every person-and-skill pairing in the matrix, counted by current level.
        </p>
        <ul className="bar-list">
          {insights.distribution.map((d) => (
            <li key={d.value ?? 'none'} title={`${d.label}: ${d.count} of ${insights.totalCells}`}>
              <span className={`bar-swatch ${levelClass(d.value)}`} aria-hidden="true">
                {d.short}
              </span>
              <span className="bar-label">{d.label}</span>
              <span className="bar-track">
                <span
                  className={`bar-fill ${levelClass(d.value)}${d.count === 0 ? ' is-zero' : ''}`}
                  style={{ width: `${(d.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="bar-value">{d.count}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Department coverage</h2>
        <p className="panel-hint">
          Average current level against average target, on the same 1–4 scale.
        </p>
        <ul className="dept-list">
          {insights.departmentCoverage.map((d) => (
            <li key={d.id} title={`${d.name}: current ${d.current ?? '—'}, target ${d.target ?? '—'}`}>
              <span className="dept-name">{d.name}</span>
              <span className="dept-track">
                {d.target != null && (
                  <span className="dept-target" style={{ width: `${(d.target / 4) * 100}%` }} />
                )}
                {d.current != null && (
                  <span className="dept-current" style={{ width: `${(d.current / 4) * 100}%` }} />
                )}
              </span>
              <span className="dept-value">
                {fmt1(d.current)} <span className="dept-sep">/</span> {fmt1(d.target)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="panel-pair">
        <RankedList
          title="Leading people"
          hint="Highest average current level."
          emptyText="Nobody has been rated yet."
          rows={insights.leadingMembers.map((m) => ({
            id: m.id,
            name: m.name,
            meta: m.role,
            display: `${m.pct}%`,
          }))}
        />
        <RankedList
          title="Growth opportunities"
          hint={
            insights.unassessedCount > 0
              ? `Lowest average current level. ${insights.unassessedCount} not yet assessed and excluded.`
              : 'Lowest average current level.'
          }
          emptyText="Nobody has been rated yet."
          rows={insights.growthMembers.map((m) => ({
            id: m.id,
            name: m.name,
            meta: m.role,
            display: `${m.pct}%`,
          }))}
        />
      </div>

      <div className="panel-pair">
        <RankedList
          title="Strongest skills"
          hint="Highest average current level across the team."
          emptyText="No skills rated yet."
          rows={insights.strongestSkills.map((s) => ({
            id: s.id,
            name: s.name,
            meta: s.departmentName,
            display: fmt1(s.current),
          }))}
        />
        <RankedList
          title="Biggest gaps"
          hint="Levels below target, averaged across the team."
          emptyText="No targets set, so there's nothing to measure against."
          rows={insights.biggestGaps.map((s) => ({
            id: s.id,
            name: s.name,
            meta: s.departmentName,
            display: `${fmt1(s.gap)} below`,
          }))}
        />
      </div>

      <section className="panel demo-panel">
        <h2>Demo data</h2>
        <p className="panel-hint">
          Adds or removes a small example set. Only ever touches rows it created — anything you
          typed yourself is left alone.
        </p>
        <div className="panel-actions">
          <button type="button" onClick={loadSampleData} disabled={busy}>
            {busy ? 'Working…' : 'Load sample data'}
          </button>
          <button type="button" className="secondary" onClick={clearSampleData} disabled={busy}>
            Clear sample data
          </button>
        </div>
      </section>
    </div>
  )
}

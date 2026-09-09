import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Dashboard() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function loadSampleData() {
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc('seed_sample_data')
    setBusy(false)
    setMessage(error ? error.message : 'Sample data loaded — switch to the Matrix tab to see it.')
  }

  async function clearSampleData() {
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc('clear_sample_data')
    setBusy(false)
    setMessage(error ? error.message : 'Sample data cleared.')
  }

  return (
    <div className="page-center">
      <div className="dashboard-card">
        <p className="eyebrow">Coming soon</p>
        <h1>Insights dashboard</h1>
        <p>Team proficiency charts and gap analysis will live here.</p>

        <div className="dashboard-actions">
          <button onClick={loadSampleData} disabled={busy}>
            Load sample data
          </button>
          <button onClick={clearSampleData} disabled={busy} className="secondary">
            Clear sample data
          </button>
        </div>

        {message && <p className="dashboard-message">{message}</p>}
      </div>
    </div>
  )
}

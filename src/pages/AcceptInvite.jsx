import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function AcceptInvite() {
  const { token } = useParams()
  const { session, loading: authLoading, refreshWorkspaces, switchWorkspace } = useAuth()
  const navigate = useNavigate()

  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    supabase
      .rpc('get_invite_preview', { p_token: token })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        if (rpcError) setError(rpcError.message)
        else setPreview(data?.[0] ?? null)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  async function join() {
    setJoining(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('accept_invite', { p_token: token })
    if (rpcError) {
      setJoining(false)
      setError(rpcError.message)
      return
    }
    await refreshWorkspaces()
    switchWorkspace(data)
    navigate('/app')
  }

  if (loading || authLoading) {
    return <div className="page-center">Loading invite…</div>
  }

  if (!preview) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invite not found</h1>
          <p>This invite link isn&apos;t valid. Ask whoever sent it for a new one.</p>
          <Link to="/">Go to the app</Link>
        </div>
      </div>
    )
  }

  if (!preview.is_valid) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Invite expired</h1>
          <p>
            This link to join <strong>{preview.workspace_name}</strong> has expired or was already
            used. Ask for a fresh one.
          </p>
          <Link to="/">Go to the app</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Join {preview.workspace_name}</h1>

        {session ? (
          <>
            <p>You&apos;ve been invited to collaborate on this skill matrix.</p>
            {error && <p className="auth-error">{error}</p>}
            <button type="button" onClick={join} disabled={joining}>
              {joining ? 'Joining…' : `Join ${preview.workspace_name}`}
            </button>
          </>
        ) : (
          <>
            <p>
              Log in or create an account to join. We&apos;ll bring you right back here
              afterwards.
            </p>
            <div className="invite-actions">
              <Link to={`/login?invite=${token}`}>Log in</Link>
              <Link to={`/signup?invite=${token}`}>Sign up</Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

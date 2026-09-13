import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const inviteToken = searchParams.get('invite')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    // Send the confirmation link back to wherever this signup actually
    // happened — localhost during development, the live site in production —
    // instead of always using the one Site URL configured in the dashboard.
    // Someone who came from an invite goes straight back to that invite after
    // confirming; everyone else lands on "/", where the router sends them to
    // the app or to login depending on whether they're signed in.
    const destination = inviteToken ? `/invite/${inviteToken}` : '/'

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${destination}` },
    })

    setSubmitting(false)
    if (signUpError) {
      setError(signUpError.message)
      return
    }

    // Email confirmation is on by default: no session until the link is clicked.
    if (!data.session) {
      setConfirmSent(true)
      return
    }

    navigate(inviteToken ? `/invite/${inviteToken}` : '/app')
  }

  if (confirmSent) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Check your email</h1>
          <p>
            We sent a confirmation link to {email}.{' '}
            {inviteToken
              ? "Click it and you'll be taken straight back to the invite."
              : 'Click it, then log in.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>{inviteToken ? 'Create your account' : 'Create your workspace'}</h1>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Sign up'}
        </button>
        <p className="auth-switch">
          Already have an account?{' '}
          <Link to={inviteToken ? `/login?invite=${inviteToken}` : '/login'}>Log in</Link>
        </p>
      </form>
    </div>
  )
}

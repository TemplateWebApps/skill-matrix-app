import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import './team.css'

export default function Team() {
  const { workspace, canInvite, user, refreshWorkspaces } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inviteLink, setInviteLink] = useState(null)
  const [inviteRole, setInviteRole] = useState('member')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    setName(workspace?.name ?? '')
  }, [workspace?.name])

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === workspace.name) return
    setSavingName(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('workspaces')
      .update({ name: trimmed })
      .eq('id', workspace.id)
    setSavingName(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await refreshWorkspaces()
  }

  const load = useCallback(async () => {
    if (!workspace?.id) return
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('list_workspace_members', {
      p_workspace_id: workspace.id,
    })
    if (rpcError) setError(rpcError.message)
    else setMembers(data ?? [])
    setLoading(false)
  }, [workspace?.id])

  useEffect(() => {
    load()
  }, [load])

  async function createInvite() {
    setCreating(true)
    setError(null)
    setCopied(false)
    const { data, error: rpcError } = await supabase.rpc('create_invite', {
      p_workspace_id: workspace.id,
      p_role: inviteRole,
    })
    setCreating(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setInviteLink(`${window.location.origin}/invite/${data}`)
  }

  async function removeMember(member) {
    const ok = window.confirm(
      `Remove ${member.email} from ${workspace.name}? They'll lose access immediately.`,
    )
    if (!ok) return

    setError(null)
    const { error: deleteError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspace.id)
      .eq('user_id', member.user_id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await load()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
    } catch {
      setError('Could not copy automatically — select the link and copy it manually.')
    }
  }

  if (!workspace) return <div className="page-center">Loading…</div>

  return (
    <div className="team-page">
      <header className="team-header">
        <h1>{workspace.name}</h1>
        <p className="team-sub">
          {members.length} {members.length === 1 ? 'person' : 'people'} with access
        </p>
      </header>

      {error && <p className="auth-error">{error}</p>}

      {canInvite && (
        <section className="team-panel">
          <h2>Workspace name</h2>
          <p className="team-hint">
            Everyone who joins sees this name, and it&apos;s how you tell workspaces apart when you
            belong to more than one.
          </p>
          <div className="team-invite-row">
            <input
              className="team-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
            />
            <button
              type="button"
              onClick={saveName}
              disabled={savingName || !name.trim() || name.trim() === workspace.name}
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>
      )}

      <section className="team-panel">
        <h2>People</h2>
        {loading ? (
          <p className="team-empty">Loading…</p>
        ) : (
          <ul className="team-list">
            {members.map((m) => (
              <li key={m.user_id}>
                <span className="team-email">
                  {m.email}
                  {m.user_id === user?.id && <span className="team-you">you</span>}
                </span>
                <span className="team-row-end">
                  <span className={`team-role role-${m.role}`}>{m.role}</span>
                  {canInvite && m.role !== 'owner' && m.user_id !== user?.id && (
                    <button
                      type="button"
                      className="team-remove"
                      title={`Remove ${m.email}`}
                      onClick={() => removeMember(m)}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canInvite ? (
        <section className="team-panel">
          <h2>Invite someone</h2>
          <p className="team-hint">
            Creates a link that lets one person join this workspace. It expires in 7 days and can
            only be used once.
          </p>
          <div className="team-invite-row">
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="member">Member — can view and edit the matrix</option>
              <option value="admin">Admin — can also invite others</option>
            </select>
            <button type="button" onClick={createInvite} disabled={creating}>
              {creating ? 'Creating…' : 'Create invite link'}
            </button>
          </div>

          {inviteLink && (
            <div className="team-link-box">
              <code>{inviteLink}</code>
              <button type="button" className="secondary" onClick={copyLink}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="team-panel">
          <p className="team-hint">Only an owner or admin can invite people to this workspace.</p>
        </section>
      )}
    </div>
  )
}

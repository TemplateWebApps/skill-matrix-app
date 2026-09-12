import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(undefined)

const LAST_WORKSPACE_KEY = 'skillmatrix.workspaceId'

function readStoredWorkspaceId() {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY)
  } catch {
    return null
  }
}

function storeWorkspaceId(id) {
  try {
    localStorage.setItem(LAST_WORKSPACE_KEY, id)
  } catch {
    // Private browsing / blocked storage — the app still works, it just
    // won't remember which workspace was open last.
  }
}

// A workspace row is created by a database trigger the moment someone signs
// up, and joining someone else's workspace adds a second membership — so a
// person can legitimately have more than one.
async function fetchWorkspaces(currentSession) {
  if (!currentSession) return []

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, created_at, workspaces (id, name, owner_id, created_at)')
    .eq('user_id', currentSession.user.id)
    .order('created_at')

  if (error) {
    console.error('fetchWorkspaces failed', error)
    return []
  }

  return (data ?? [])
    .filter((row) => row.workspaces)
    .map((row) => ({ ...row.workspaces, role: row.role }))
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceId, setWorkspaceId] = useState(() => readStoredWorkspaceId())
  const [loading, setLoading] = useState(true)

  const loadWorkspaces = useCallback(async (currentSession) => {
    const list = await fetchWorkspaces(currentSession)
    setWorkspaces(list)
    setWorkspaceId((current) => {
      const stillValid = list.some((w) => w.id === current)
      return stillValid ? current : (list[0]?.id ?? null)
    })
    return list
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadWorkspaces(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!active) return
      setSession(newSession)
      await loadWorkspaces(newSession)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadWorkspaces])

  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null

  function switchWorkspace(id) {
    setWorkspaceId(id)
    storeWorkspaceId(id)
  }

  const value = {
    session,
    user: session?.user ?? null,
    workspace,
    workspaces,
    role: workspace?.role ?? null,
    canInvite: workspace?.role === 'owner' || workspace?.role === 'admin',
    loading,
    switchWorkspace,
    refreshWorkspaces: () => loadWorkspaces(session),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

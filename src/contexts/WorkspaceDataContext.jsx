import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchMatrix } from '../lib/matrixApi'

const WorkspaceDataContext = createContext(undefined)

const EMPTY = { departments: [], skills: [], members: [], ratings: [] }

/**
 * Holds one copy of the workspace's data for every tab that needs it.
 *
 * Each screen used to fetch independently on mount, so moving between Matrix
 * and Dashboard refetched the same four tables and blanked the page behind a
 * spinner every time. Loading once per workspace and sharing it makes tab
 * switches instant; a refresh happens quietly in the background instead of
 * hiding what's already on screen.
 */
export function WorkspaceDataProvider({ children }) {
  const { workspace, initialData, consumeInitialData } = useAuth()
  const workspaceId = workspace?.id ?? null

  const [data, setData] = useState(EMPTY)
  const [loadedFor, setLoadedFor] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const requestRef = useRef(0)

  const load = useCallback(
    async (id) => {
      if (!id) return
      const ticket = ++requestRef.current
      setRefreshing(true)
      try {
        const next = await fetchMatrix(id)
        // Ignore a slow response for a workspace we've since switched away from.
        if (ticket !== requestRef.current) return
        setData(next)
        setLoadedFor(id)
        setError(null)
      } catch (err) {
        if (ticket === requestRef.current) setError(err.message)
      } finally {
        if (ticket === requestRef.current) setRefreshing(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!workspaceId) {
      setData(EMPTY)
      setLoadedFor(null)
      return
    }
    if (workspaceId === loadedFor) return

    // The startup request already brought these rows back with the workspace
    // list — use them instead of asking again.
    if (initialData && initialData.workspaceId === workspaceId) {
      const { workspaceId: _id, ...rows } = initialData
      setData(rows)
      setLoadedFor(workspaceId)
      consumeInitialData()
      return
    }

    setData(EMPTY) // don't show the previous workspace's rows while loading
    load(workspaceId)
  }, [workspaceId, loadedFor, load, initialData, consumeInitialData])

  const value = useMemo(
    () => ({
      ...data,
      // Setters so screens can update optimistically without a refetch.
      setDepartments: (fn) => setData((d) => ({ ...d, departments: typeof fn === 'function' ? fn(d.departments) : fn })),
      setSkills: (fn) => setData((d) => ({ ...d, skills: typeof fn === 'function' ? fn(d.skills) : fn })),
      setMembers: (fn) => setData((d) => ({ ...d, members: typeof fn === 'function' ? fn(d.members) : fn })),
      setRatings: (fn) => setData((d) => ({ ...d, ratings: typeof fn === 'function' ? fn(d.ratings) : fn })),
      reload: () => load(workspaceId),
      // Only true before this workspace has ever loaded — a background refresh
      // must not blank the screen.
      loading: workspaceId != null && loadedFor !== workspaceId,
      refreshing,
      error,
      setError,
    }),
    [data, load, workspaceId, loadedFor, refreshing, error],
  )

  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>
}

export function useWorkspaceData() {
  const ctx = useContext(WorkspaceDataContext)
  if (!ctx) throw new Error('useWorkspaceData must be used within WorkspaceDataProvider')
  return ctx
}

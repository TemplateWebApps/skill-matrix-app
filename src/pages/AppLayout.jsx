import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function AppLayout() {
  const { workspace, workspaces, switchWorkspace, user, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-brand">
          <span className="app-title">Skill Matrix</span>
          {workspaces.length > 1 ? (
            <select
              className="workspace-switcher"
              value={workspace?.id ?? ''}
              onChange={(e) => switchWorkspace(e.target.value)}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="app-workspace">{workspace?.name ?? '…'}</span>
          )}
        </div>
        <nav className="app-nav">
          <NavLink to="/app" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Matrix
          </NavLink>
          <NavLink to="/app/team" className={({ isActive }) => (isActive ? 'active' : '')}>
            Team
          </NavLink>
          <NavLink to="/app/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
        </nav>
        <div className="app-user">
          <span>{user?.email}</span>
          <button type="button" onClick={signOut}>
            Log out
          </button>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}

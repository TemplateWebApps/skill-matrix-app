import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import AppLayout from './pages/AppLayout'
import Matrix from './pages/Matrix'
import Team from './pages/Team'
import Dashboard from './pages/Dashboard'
import AcceptInvite from './pages/AcceptInvite'
import './App.css'

// Signed in, go straight to work. Signed out, this is the public front door —
// it used to redirect to a bare login form, so anyone arriving from a link had
// no idea what the product was.
function Home() {
  const { session, loading } = useAuth()
  if (loading) return <div className="page-center">Loading…</div>
  if (session) return <Navigate to="/app" replace />
  return <Landing />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Matrix />} />
        <Route path="team" element={<Team />} />
        <Route path="dashboard" element={<Dashboard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

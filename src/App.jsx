import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import AppLayout from './pages/AppLayout'
import Matrix from './pages/Matrix'
import Team from './pages/Team'
import Dashboard from './pages/Dashboard'
import AcceptInvite from './pages/AcceptInvite'
import './App.css'

function Home() {
  const { session, loading } = useAuth()
  if (loading) return <div className="page-center">Loading…</div>
  return <Navigate to={session ? '/app' : '/login'} replace />
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

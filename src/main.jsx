import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { FeedbackProvider } from './contexts/FeedbackContext.jsx'
import NotConfigured from './components/NotConfigured.jsx'
import { isConfigured } from './lib/supabaseClient.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isConfigured ? (
      <BrowserRouter>
        <AuthProvider>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <NotConfigured />
    )}
  </StrictMode>,
)

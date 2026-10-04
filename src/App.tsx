import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './state/AuthContext'
import { LandingPage } from './pages/LandingPage'
import { SignInPage } from './pages/SignInPage'
import { SignUpPage } from './pages/SignUpPage'
import { ChatPage } from './pages/ChatPage'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="grid min-h-full place-items-center">Loading…</div>
  if (!session) return <Navigate to="/sign-in" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route
        path="/chat"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

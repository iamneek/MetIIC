import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  email_verified: boolean
  suspended: boolean
  created_at: string
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  resendVerification: (email: string) => Promise<string | null>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('rate') || m.includes('too many') || m.includes('over_email_send_rate_limit')) {
    return 'Rate limit reached. Please wait a few minutes before trying again.'
  }
  if (m.includes('email not confirmed')) {
    return 'Please verify your email address before signing in.'
  }
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Invalid email or password.'
  }
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const lastFetchedUserRef = useRef<string | null>(null)

  const refreshProfile = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').maybeSingle()
    if (error) {
      // eslint-disable-next-line no-console
      console.error('profile fetch failed', error.message)
      setProfile(null)
      return
    }
    setProfile(data as Profile | null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user?.id) {
        lastFetchedUserRef.current = data.session.user.id
        void refreshProfile()
      }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (s?.user?.id) {
        if (lastFetchedUserRef.current !== s.user.id || event === 'USER_UPDATED') {
          lastFetchedUserRef.current = s.user.id
          void refreshProfile()
        }
      } else {
        lastFetchedUserRef.current = null
        setProfile(null)
      }
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [refreshProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return friendlyAuthError(error.message)
    return null
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/chat` },
    })
    if (error) return friendlyAuthError(error.message)
    return null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    lastFetchedUserRef.current = null
  }, [])

  const resendVerification = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/chat` },
    })
    return error ? friendlyAuthError(error.message) : null
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      resendVerification,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signUp, signOut, resendVerification, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

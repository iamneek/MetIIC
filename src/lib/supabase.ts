import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surface a clear failure instead of silently hitting an undefined endpoint.
  // eslint-disable-next-line no-console
  console.error(
    'Campus Connect: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. See .env.example.',
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type CallRole = 'initiator' | 'responder'

export type MatchmakingState =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'matched'; callId: string; role: CallRole }
  | { kind: 'error'; message: string }

const POLL_MS = 8000
const HEARTBEAT_MS = 25000

function friendlyRpcError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('not_eligible')) return 'Your account is not eligible or has been suspended.'
  if (m.includes('not_verified')) return 'Please verify your email address first.'
  if (m.includes('slow_down')) return 'You are doing that too often. Please wait a moment.'
  if (m.includes('in_call')) return 'You already have an active call.'
  return message
}

export function useMatchmaking(userId: string | null) {
  const [state, setState] = useState<MatchmakingState>({ kind: 'idle' })
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const generationRef = useRef(0)

  const cleanupWatchers = useCallback(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (pollRef.current) clearInterval(pollRef.current)
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    pollRef.current = null
    heartbeatRef.current = null
  }, [])

  useEffect(() => cleanupWatchers, [cleanupWatchers])

  /** Check the server for an existing queue row or live call (reconnect recovery). */
  const recover = useCallback(async (): Promise<MatchmakingState | null> => {
    const { data, error } = await supabase.rpc('my_state')
    if (error || !data) return null
    const s = data as { status: string; call_id?: string; role?: CallRole }
    if (s.status === 'in_call' && s.call_id && s.role) {
      return { kind: 'matched', callId: s.call_id, role: s.role }
    }
    if (s.status === 'waiting') return { kind: 'waiting' }
    return { kind: 'idle' }
  }, [])

  const start = useCallback(async () => {
    const generation = ++generationRef.current
    setState({ kind: 'waiting' })

    const { data, error } = await supabase.rpc('matchmake')
    if (generation !== generationRef.current) return

    if (error) {
      setState({ kind: 'error', message: friendlyRpcError(error.message) })
      return
    }

    const res = data as { status: string; call_id?: string; role?: CallRole }
    if (res.status === 'matched' && res.call_id && res.role) {
      setState({ kind: 'matched', callId: res.call_id, role: res.role })
      return
    }
    if (res.status === 'in_call' && res.call_id && res.role) {
      setState({ kind: 'matched', callId: res.call_id, role: res.role })
      return
    }

    // Waiting: watch for our row to appear in call_participants (postgres_changes),
    // with a slow poll fallback in case the realtime event is missed.
    cleanupWatchers()
    if (!userId) return
    const channel = supabase
      .channel(`matchnotify:${userId}:${generation}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_participants', filter: `user_id=eq.${userId}` },
        async () => {
          if (generation !== generationRef.current) return
          const recovered = await recover()
          if (recovered && recovered.kind !== 'idle' && generation === generationRef.current) {
            cleanupWatchers()
            setState(recovered)
          }
        },
      )
      .subscribe()
    channelRef.current = channel
    pollRef.current = setInterval(async () => {
      if (generation !== generationRef.current) return
      const recovered = await recover()
      if (recovered && recovered.kind !== 'waiting' && generation === generationRef.current) {
        cleanupWatchers()
        setState(recovered)
      }
    }, POLL_MS)
    heartbeatRef.current = setInterval(() => {
      void supabase.rpc('heartbeat')
    }, HEARTBEAT_MS)
  }, [cleanupWatchers, recover, userId])

  const cancel = useCallback(async () => {
    generationRef.current += 1
    cleanupWatchers()
    await supabase.rpc('leave_queue')
    setState({ kind: 'idle' })
  }, [cleanupWatchers])

  const reset = useCallback(() => {
    generationRef.current += 1
    cleanupWatchers()
    setState({ kind: 'idle' })
  }, [cleanupWatchers])

  return { state, start, cancel, reset, recover }
}

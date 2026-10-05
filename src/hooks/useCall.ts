import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { buildIceServers, CONNECTION_TIMEOUT_MS, ICE_TRANSPORT_POLICY } from '../lib/config'
import { parseSignal } from '../lib/signaling'
import { logDiag } from '../lib/diagnostics'
import type { CallRole } from './useMatchmaking'

export type UiCallState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'ended'

export interface CallError {
  message: string
}

interface UseCallArgs {
  callId: string | null
  role: CallRole | null
  localStream: MediaStream | null
  callDbStatus: string | null
  onRemoteStream: (s: MediaStream | null) => void
  onRemoteEnded: () => void
  onChatMessage?: (text: string) => void
}

/**
 * Owns one RTCPeerConnection + one private signaling channel for a single call.
 * All signaling is authorized server-side by realtime RLS policies on
 * realtime.messages plus the call-participant check, and every message is
 * validated and scoped to the current callId (a stale channel from a previous
 * call is fully torn down before a new one is opened).
 */
export function useCall({
  callId,
  role,
  localStream,
  callDbStatus,
  onRemoteStream,
  onRemoteEnded,
  onChatMessage,
}: UseCallArgs): { uiState: UiCallState; error: CallError | null; sendEnd: () => void; sendChat: (text: string) => void } {
  const [uiState, setUiState] = useState<UiCallState>('idle')
  const [error, setError] = useState<CallError | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const sendEndRef = useRef<() => void>(() => {})
  const sendChatRef = useRef<(text: string) => void>(() => {})
  // callbacks via refs to avoid re-running the lifecycle effect
  const onRemoteStreamRef = useRef(onRemoteStream)
  const onRemoteEndedRef = useRef(onRemoteEnded)
  const onChatMessageRef = useRef(onChatMessage)
  onRemoteStreamRef.current = onRemoteStream
  onRemoteEndedRef.current = onRemoteEnded
  onChatMessageRef.current = onChatMessage

  useEffect(() => {
    if (!callId || !role) {
      setUiState('idle')
      return
    }
    let cancelled = false
    setError(null)
    setUiState('connecting')
    const restartedRef = { flag: false }
    logDiag('call', `starting call ${callId} as ${role}; ice policy=${ICE_TRANSPORT_POLICY}`)

    const remote = new MediaStream()
    remoteStreamRef.current = remote
    onRemoteStreamRef.current(remote)

    const pc = new RTCPeerConnection({
      iceServers: buildIceServers(),
      iceTransportPolicy: ICE_TRANSPORT_POLICY,
    })
    pcRef.current = pc

    if (localStream) {
      for (const track of localStream.getTracks()) pc.addTrack(track, localStream)
      logDiag(
        'call',
        `local tracks: ${localStream.getTracks().map((t) => `${t.kind}:${t.readyState}`).join(', ') || 'none'}`,
      )
    } else {
      logDiag('call', 'no local stream available')
    }

    pc.ontrack = (e) => {
      const ms = e.streams[0]
      if (ms) {
        for (const t of ms.getTracks()) {
          if (!remote.getTracks().includes(t)) remote.addTrack(t)
        }
      } else if (!remote.getTracks().includes(e.track)) {
        remote.addTrack(e.track)
      }
      // Hand over a NEW MediaStream reference: React bails out of re-renders when
      // the reference is unchanged, so tracks arriving after the first render would
      // otherwise never make the <video> visible.
      onRemoteStreamRef.current(new MediaStream(remote.getTracks()))
      logDiag('call', `remote track received: ${e.track.kind} (${remote.getTracks().length} total)`)
      if (!cancelled) setUiState('connected')
    }

    pc.oniceconnectionstatechange = () => {
      logDiag('call', `ice connection state: ${pc.iceConnectionState}`)
      if (cancelled) return
      if (pc.iceConnectionState === 'failed') {
        // Full ICE restart: the initiator sends a new offer with iceRestart so a new
        // candidate pair (ideally via TURN) is negotiated.
        if (role === 'initiator' && !restartedRef.flag) {
          restartedRef.flag = true
          void (async () => {
            try {
              const offer = await pc.createOffer({ iceRestart: true })
              await pc.setLocalDescription(offer)
              offerSent = true
              logDiag('call', 'sent ICE restart offer')
              send({ type: 'offer', sdp: pc.localDescription })
            } catch (err) {
              logDiag('call', `ice restart failed: ${String(err)}`)
            }
          })()
        }
      }
    }

    pc.onconnectionstatechange = () => {
      logDiag('call', `connection state: ${pc.connectionState}`)
      if (cancelled) return
      if (pc.connectionState === 'connected') setUiState('connected')
      else if (pc.connectionState === 'disconnected') setUiState('reconnecting')
      else if (pc.connectionState === 'failed') {
        try {
          pc.restartIce()
        } catch {
          /* not supported everywhere */
        }
        setError({
          message:
            'The direct connection failed. This network likely needs a TURN relay — check that VITE_TURN_URL / USERNAME / CREDENTIAL are set in your host and that the site was rebuilt.',
        })
      } else if (pc.connectionState === 'closed') {
        setUiState('ended')
      }
    }

    let offerSent = false
    let remoteDescSet = false
    const pendingCandidates: RTCIceCandidateInit[] = []

    const channel = supabase.channel(`call:${callId}`, {
      config: { private: true },
    })
    channelRef.current = channel

    const send = (payload: unknown) => {
      void channel.send({ type: 'broadcast', event: 'signal', payload })
    }

    sendEndRef.current = () => send({ type: 'end', reason: 'user' })
    sendChatRef.current = (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || trimmed.length > 1000) return
      void channel.send({ type: 'broadcast', event: 'chat', payload: { text: trimmed } })
    }

    channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
      const t = (payload as { text?: unknown } | undefined)?.text
      if (typeof t === 'string' && t.length > 0 && t.length <= 1000 && !cancelled) {
        onChatMessageRef.current?.(t)
      }
    })

    const flushCandidates = async () => {
      const queued = pendingCandidates.splice(0)
      for (const c of queued) {
        try {
          await pc.addIceCandidate(c)
        } catch {
          /* stale candidate, ignore */
        }
      }
    }

    channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
      const msg = parseSignal(payload)
      if (!msg || cancelled) return
      try {
        if (msg.type === 'end') {
          onRemoteEndedRef.current()
          return
        }
        if (msg.type === 'ready') {
          if (role === 'initiator') {
            if (!offerSent && pc.signalingState === 'stable' && !remoteDescSet) {
              offerSent = true
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              logDiag('call', 'sent SDP offer')
              send({ type: 'offer', sdp: pc.localDescription })
            }
          } else {
            // Re-announce readiness so a late-joining initiator receives it;
            // broadcasts are not replayed, so without this the offer never fires.
            if (!offerSent && !remoteDescSet) {
              logDiag('call', 're-announced ready to initiator')
              send({ type: 'ready' })
            }
          }
          return
        }
        if (msg.type === 'offer' && msg.sdp) {
          if (remoteDescSet && pc.signalingState !== 'stable') return // ignore duplicates
          await pc.setRemoteDescription(msg.sdp)
          remoteDescSet = true
          await flushCandidates()
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          logDiag('call', 'applied offer, sent SDP answer')
          send({ type: 'answer', sdp: pc.localDescription })
          return
        }
        if (msg.type === 'answer' && msg.sdp) {
          if (remoteDescSet) return // duplicate answer
          await pc.setRemoteDescription(msg.sdp)
          remoteDescSet = true
          await flushCandidates()
          logDiag('call', 'applied SDP answer')
          return
        }
        if (msg.type === 'ice') {
          if (!remoteDescSet) {
            if (msg.candidate) {
              pendingCandidates.push(msg.candidate)
              logDiag('call', `buffered ICE candidate (${pendingCandidates.length})`)
            }
            return
          }
          try {
            await pc.addIceCandidate(msg.candidate ?? null)
          } catch {
            /* ignore individual bad candidates */
          }
        }
      } catch (err) {
        logDiag('call', `signaling error: ${String(err)}`)
      }
    })

    let sentCandidates = 0
    pc.onicecandidate = (e) => {
      if (e.candidate) sentCandidates += 1
      send({ type: 'ice', candidate: e.candidate ? e.candidate.toJSON() : null })
    }

    const timeout = setTimeout(() => {
      if (cancelled) return
      logDiag(
        'call',
        `connection timeout after ${Math.round(CONNECTION_TIMEOUT_MS / 1000)}s ` +
          `(local candidates sent: ${sentCandidates}, ice state: ${pc.iceConnectionState})`,
      )
      setUiState((s) => {
        if (s === 'connecting' || s === 'reconnecting') {
          setError({
            message:
              'Could not establish a connection in time. This is often caused by restrictive networks — ask your administrator about TURN, or press Next to try again.',
          })
          return 'failed'
        }
        return s
      })
    }, CONNECTION_TIMEOUT_MS)

    channel.subscribe((status) => {
      logDiag('call', `signaling channel status: ${status}`)
      if (status === 'SUBSCRIBED' && !cancelled) {
        // Tell the peer we are ready; the initiator will offer on receipt.
        send({ type: 'ready' })
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timeout)
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pcRef.current = null
      channelRef.current = null
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      void supabase.removeChannel(channel)
      onRemoteStreamRef.current(null)
      remoteStreamRef.current = null
      sendEndRef.current = () => {}
      sendChatRef.current = () => {}
    }
  }, [callId, role, localStream])

  // Remote hangup / ended via database (e.g., other user ended from another tab).
  useEffect(() => {
    if (callDbStatus === 'ended' || callDbStatus === 'failed') {
      setUiState('ended')
    }
  }, [callDbStatus])

  const sendEnd = () => sendEndRef.current()
  const sendChat = (text: string) => sendChatRef.current(text)

  return { uiState, error, sendEnd, sendChat }
}

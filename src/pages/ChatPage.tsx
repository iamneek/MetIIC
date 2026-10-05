import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../state/AuthContext'
import { useLocalMedia, MEDIA_ERROR_MESSAGES } from '../hooks/useLocalMedia'
import { useMatchmaking } from '../hooks/useMatchmaking'
import { useCall } from '../hooks/useCall'
import { VideoView } from '../components/VideoView'
import { ControlBar } from '../components/ControlBar'
import { ReportDialog } from '../components/ReportDialog'
import { BlockConfirm } from '../components/BlockConfirm'
import { APP_NAME } from '../lib/config'

type Phase = 'idle' | 'waiting' | 'inCall'

export function ChatPage() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const media = useLocalMedia()
  const mm = useMatchmaking(user?.id ?? null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [activeCall, setActiveCall] = useState<{ callId: string; role: 'initiator' | 'responder' } | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [callDbStatus, setCallDbStatus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showBlock, setShowBlock] = useState(false)
  const [serverConnected, setServerConnected] = useState(false)
  const [messages, setMessages] = useState<{ mine: boolean; text: string }[]>([])
  const [draft, setDraft] = useState('')
  const enteringRef = useRef(false)

  const handleRemoteMessage = useCallback((text: string) => {
    setMessages((m) => [...m.slice(-199), { mine: false, text }])
  }, [])

  const handleRemoteEnded = useCallback(() => {
    setNotice('The other person ended the call.')
    setActiveCall(null)
    setRemoteStream(null)
    setPhase('idle')
    setMessages([])
    void supabase.rpc('end_call', { p_call_id: activeCall?.callId })
  }, [activeCall])

  const { uiState: callUi, error: callError, sendEnd, sendChat } = useCall({
    callId: activeCall?.callId ?? null,
    role: activeCall?.role ?? null,
    localStream: media.stream,
    callDbStatus,
    onRemoteStream: setRemoteStream,
    onRemoteEnded: handleRemoteEnded,
    onChatMessage: handleRemoteMessage,
  })

  // Move to inCall when matchmaking finds a partner.
  useEffect(() => {
    if (mm.state.kind === 'matched') {
      setActiveCall({ callId: mm.state.callId, role: mm.state.role })
      setPhase('inCall')
      setCallDbStatus('matched')
    } else if (mm.state.kind === 'waiting' && phase !== 'waiting' && !enteringRef.current) {
      setPhase('waiting')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mm.state])

  // Watch the call row for status changes (e.g. remote ended from another tab).
  useEffect(() => {
    if (!activeCall) return
    const ch = supabase
      .channel(`callwatch:${activeCall.callId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${activeCall.callId}` },
        (payload) => {
          const status = (payload.new as { status?: string }).status
          if (status) setCallDbStatus(status)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [activeCall])

  useEffect(() => {
    if (callDbStatus === 'ended' || callDbStatus === 'failed') {
      setActiveCall(null)
      setRemoteStream(null)
      setPhase('idle')
    }
  }, [callDbStatus])

  // Recover an in-progress call after a refresh.
  useEffect(() => {
    if (phase === 'idle' && profile?.email_verified) {
      void mm.recover().then((recovered) => {
        if (recovered?.kind === 'matched') {
          setActiveCall({ callId: recovered.callId, role: recovered.role })
          setPhase('inCall')
        } else if (recovered?.kind === 'waiting') {
          // Re-arm queue watchers (heartbeat/poll) and re-add our queue row.
          setPhase('waiting')
          void mm.start()
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.email_verified])

  // Track realtime connection health.
  useEffect(() => {
    const ch = supabase.channel('healthcheck').subscribe((s) => {
      setServerConnected(s === 'SUBSCRIBED')
    })
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [])

  const startChat = useCallback(async () => {
    setNotice(null)
    enteringRef.current = true
    let stream = media.stream
    if (!stream) {
      stream = (await media.start()) ?? null
      if (!stream) {
        enteringRef.current = false
        return
      }
    }
    setPhase('waiting')
    await mm.start()
    enteringRef.current = false
  }, [media, mm])

  const cancelWaiting = useCallback(async () => {
    await mm.cancel()
    setPhase('idle')
  }, [mm])

  const endCall = useCallback(async () => {
    setBusy(true)
    if (phase === 'waiting') {
      await mm.cancel()
      setPhase('idle')
      setBusy(false)
      return
    }
    const callId = activeCall?.callId
    sendEnd()
    setActiveCall(null)
    setRemoteStream(null)
    setPhase('idle')
    setMessages([])
    mm.reset()
    if (callId) await supabase.rpc('end_call', { p_call_id: callId })
    setBusy(false)
  }, [activeCall, phase, sendEnd, mm])

  const nextCall = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const callId = activeCall?.callId
    sendEnd()
    setActiveCall(null)
    setRemoteStream(null)
    mm.reset()
    setMessages([])
    if (callId) await supabase.rpc('end_call', { p_call_id: callId })
    setPhase('waiting')
    enteringRef.current = true
    await mm.start()
    enteringRef.current = false
    setBusy(false)
  }, [activeCall, busy, mm, sendEnd])

  const onBlock = useCallback(async () => {
    setShowBlock(false)
    setBusy(true)
    const callId = activeCall?.callId
    if (callId) {
      await supabase.rpc('block_participant', { p_call_id: callId })
    }
    sendEnd()
    setActiveCall(null)
    setRemoteStream(null)
    setPhase('idle')
    setMessages([])
    mm.reset()
    setNotice('User blocked. You will not be matched with them again.')
    setBusy(false)
  }, [activeCall, mm, sendEnd])

  const onReport = useCallback(
    async (reason: string, details: string) => {
      const callId = activeCall?.callId
      if (!callId) throw new Error('No active call.')
      const { error } = await supabase.rpc('report_participant', {
        p_call_id: callId,
        p_reason: reason,
        p_details: details,
      })
      if (error) throw new Error(error.message)
      setNotice('Report submitted. Thank you for helping keep Campus Connect safe.')
    },
    [activeCall],
  )

  const onSignOut = useCallback(async () => {
    mm.reset()
    media.stop()
    await signOut()
    navigate('/')
  }, [mm, media, signOut, navigate])

  // --- chat ---
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submitChat = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const t = draft.trim()
      if (!t || phase !== 'inCall') return
      sendChat(t)
      setMessages((m) => [...m, { mine: true, text: t }])
      setDraft('')
    },
    [draft, phase, sendChat],
  )

  // --- draggable local preview ---
  const videoWrapRef = useRef<HTMLDivElement | null>(null)
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null)
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null)

  const onPipPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const rect = target.getBoundingClientRect()
    dragOffsetRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    target.setPointerCapture(e.pointerId)
  }, [])

  const onPipPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragOffsetRef.current || !videoWrapRef.current) return
    const wrap = videoWrapRef.current.getBoundingClientRect()
    const pip = e.currentTarget
    const x = Math.min(Math.max(0, e.clientX - wrap.left - dragOffsetRef.current.dx), wrap.width - pip.offsetWidth)
    const y = Math.min(Math.max(0, e.clientY - wrap.top - dragOffsetRef.current.dy), wrap.height - pip.offsetHeight)
    setPipPos({ x, y })
  }, [])

  const onPipPointerUp = useCallback(() => {
    dragOffsetRef.current = null
  }, [])

  useEffect(() => {
    if (!activeCall && mm.state.kind === 'error') {
      setNotice(mm.state.message)
      setPhase('idle')
    }
  }, [mm.state, activeCall])

  if (profile && !profile.email_verified) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Verify your email</h1>
          <p className="mt-3 text-sm text-ink/70">
            We sent a verification link to your @iic.edu.np address. Verify it, then sign in again.
          </p>
          <button
            className="mt-5 rounded-full border border-ink/15 px-4 py-2 text-sm"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (profile?.suspended) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Account suspended</h1>
          <p className="mt-3 text-sm text-ink/70">
            Your account has been suspended. Contact the moderation team if you believe this is a mistake.
          </p>
          <button className="mt-5 rounded-full border border-ink/15 px-4 py-2 text-sm" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">{APP_NAME}</h1>
          <span
            className={`text-xs ${serverConnected ? 'text-green-700' : 'text-ink/40'}`}
            role="status"
          >
            {serverConnected ? 'online' : 'offline'}
          </span>
        </div>
        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-sm hover:bg-ink/5"
        >
          <LogOut size={14} aria-hidden /> Sign out
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-6 sm:px-6 lg:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
        <div ref={videoWrapRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink">
          <VideoView
            stream={phase === 'inCall' ? remoteStream : null}
            placeholder={phase === 'waiting' ? 'waiting' : 'partner'}
            label="Remote video"
            mirror
            className="h-full w-full"
          />
          <div
            onPointerDown={onPipPointerDown}
            onPointerMove={onPipPointerMove}
            onPointerUp={onPipPointerUp}
            style={pipPos ? { top: pipPos.y, left: pipPos.x } : undefined}
            className={`absolute h-28 w-20 cursor-grab touch-none overflow-hidden rounded-lg shadow-lg active:cursor-grabbing sm:h-36 sm:w-24 ${
              pipPos ? '' : 'bottom-3 right-3'
            }`}
            aria-label="Your video (drag to move)"
          >
            <VideoView
              stream={media.stream}
              muted
              mirror
              showCamOff={!media.camOn}
              label="Your video"
              className="h-full w-full pointer-events-none"
            />
          </div>
          {phase === 'inCall' && callUi !== 'idle' && (
            <div className="absolute left-3 top-3 rounded-full bg-ink/60 px-3 py-1 text-xs text-cream" role="status">
              {callUi === 'connected'
                ? 'Connected'
                : callUi === 'reconnecting'
                  ? 'Reconnecting…'
                  : callUi === 'failed'
                    ? 'Connection failed'
                    : callUi === 'ended'
                      ? 'Ended'
                      : 'Connecting…'}
            </div>
          )}
        </div>

        {callError && <p className="text-sm text-red-600">{callError.message}</p>}
        {media.error && <p className="text-sm text-red-600">{MEDIA_ERROR_MESSAGES[media.error]}</p>}
        {notice && (
          <div className="flex items-center justify-between rounded-lg border border-ink/10 bg-white px-4 py-2 text-sm">
            <span>{notice}</span>
            <button className="text-ink/50 underline" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="max-w-md text-sm text-ink/70">
              Meet another verified student anonymously. Be kind — reports help keep the community safe.
            </p>
            <button
              onClick={startChat}
              className="rounded-full bg-ink px-8 py-3 text-sm font-medium text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Start video chat
            </button>
          </div>
        )}

        {phase === 'waiting' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
            <p className="text-sm text-ink/70">Waiting for another student to connect…</p>
            <button
              onClick={cancelWaiting}
              className="rounded-full border border-ink/15 px-6 py-2 text-sm hover:bg-ink/5"
            >
              Cancel
            </button>
          </div>
        )}

        {(phase === 'inCall' || media.stream) && (
          <div className="rounded-2xl border border-ink/10 bg-white px-2 py-2">
            <ControlBar
            micOn={media.micOn}
            camOn={media.camOn}
            inCall={phase === 'inCall'}
            busy={busy}
            onToggleMic={media.toggleMic}
            onToggleCam={media.toggleCam}
            onNext={nextCall}
            onEnd={endCall}
            onReport={() => setShowReport(true)}
            onBlock={() => setShowBlock(true)}
            />
          </div>
        )}
        </section>

        <aside className="flex w-full flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white lg:w-[clamp(280px,28vw,380px)] lg:min-h-0 lg:self-stretch">
          <div className="min-h-[200px] flex-1 space-y-2 overflow-y-auto p-4 lg:min-h-0" aria-live="polite">
            {messages.length === 0 && (
              <p className="text-sm text-ink/40">Messages appear here during a call.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.mine ? 'text-ink/90' : 'text-ink/70'}`}>
                <span className="font-medium">{m.mine ? 'You' : 'Stranger'}:</span> {m.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={submitChat} className="flex gap-2 border-t border-ink/10 p-3">
            <label htmlFor="chat-input" className="sr-only">Type a message</label>
            <input
              id="chat-input"
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message"
              disabled={phase !== 'inCall'}
              className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-cream px-3 py-2 text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={phase !== 'inCall' || !draft.trim()}
              aria-label="Send message"
              className="rounded-lg bg-ink px-3 py-2 text-sm text-cream disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </aside>
      </main>

      <ReportDialog open={showReport} onClose={() => setShowReport(false)} onSubmit={onReport} />
      <BlockConfirm open={showBlock} onCancel={() => setShowBlock(false)} onConfirm={onBlock} />
    </div>
  )
}

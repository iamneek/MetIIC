import { useCallback, useEffect, useRef, useState } from 'react'
import { VideoOff, Volume2 } from 'lucide-react'

interface VideoViewProps {
  stream: MediaStream | null
  muted?: boolean
  mirror?: boolean
  showCamOff?: boolean
  placeholder?: 'partner' | 'none' | 'waiting'
  label?: string
  className?: string
}

export function VideoView({
  stream,
  muted,
  mirror,
  showCamOff,
  placeholder,
  label,
  className,
}: VideoViewProps) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const [liveVideoTracks, setLiveVideoTracks] = useState(0)
  const [needsGesture, setNeedsGesture] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!stream) {
      el.srcObject = null
      setLiveVideoTracks(0)
      return
    }

    el.srcObject = stream
    const count = () => stream.getVideoTracks().filter((t) => t.readyState === 'live').length
    setLiveVideoTracks(count())

    // Tracks can be attached after the stream object is handed to React, so poll
    // liveness: without this the placeholder/opacity state can stay stale.
    const poll = setInterval(() => setLiveVideoTracks(count()), 600)

    void el.play().catch(() => setNeedsGesture(true))

    return () => clearInterval(poll)
  }, [stream])

  const tryPlay = useCallback(() => {
    const el = ref.current
    if (!el) return
    void el
      .play()
      .then(() => setNeedsGesture(false))
      .catch(() => setNeedsGesture(true))
  }, [])

  const hasVideo = liveVideoTracks > 0 && !showCamOff

  return (
    <div className={`relative overflow-hidden bg-ink ${className ?? ''}`} onClick={tryPlay}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted ?? false}
        aria-label={label ?? 'video'}
        className={`h-full w-full object-cover ${mirror ? '[transform:scaleX(-1)]' : ''} ${
          hasVideo ? '' : 'opacity-0'
        }`}
      />
      {!hasVideo && (
        <div className="absolute inset-0 grid place-items-center text-cream/70">
          {placeholder === 'waiting' ? (
            <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />
              <p className="text-sm">Looking for a student…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <VideoOff size={28} aria-hidden />
              <p className="text-xs uppercase tracking-widest text-cream/50">
                {showCamOff
                  ? 'Camera off'
                  : placeholder === 'partner'
                    ? 'No partner yet'
                    : 'No video'}
              </p>
            </div>
          )}
        </div>
      )}
      {needsGesture && stream && (
        <button
          type="button"
          onClick={tryPlay}
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-ink/70 px-3 py-2 text-xs text-cream"
        >
          <Volume2 size={14} aria-hidden /> Tap to enable audio &amp; video
        </button>
      )}
    </div>
  )
}
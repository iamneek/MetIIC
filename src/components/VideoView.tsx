import { useEffect, useRef } from 'react'
import { VideoOff } from 'lucide-react'

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

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (stream) {
      if (el.srcObject !== stream) el.srcObject = stream
      void el.play().catch(() => undefined)
    } else {
      el.srcObject = null
    }
  }, [stream])

  const hasVideo =
    !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)

  return (
    <div className={`relative overflow-hidden bg-ink ${className ?? ''}`}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted ?? false}
        aria-label={label ?? 'video'}
        className={`h-full w-full object-cover ${mirror ? '[transform:scaleX(-1)]' : ''} ${
          hasVideo && !showCamOff ? '' : 'opacity-0'
        }`}
      />
      {(!hasVideo || showCamOff) && (
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
                {showCamOff ? 'Camera off' : placeholder === 'partner' ? 'No partner yet' : 'No video'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

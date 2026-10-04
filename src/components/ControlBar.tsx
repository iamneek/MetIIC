import { Mic, MicOff, Video, VideoOff, SkipForward, PhoneOff, Flag, Ban } from 'lucide-react'

interface ControlBarProps {
  micOn: boolean
  camOn: boolean
  inCall: boolean
  busy?: boolean
  onToggleMic: () => void
  onToggleCam: () => void
  onNext: () => void
  onEnd: () => void
  onReport: () => void
  onBlock: () => void
}

export function ControlBar({
  micOn,
  camOn,
  inCall,
  busy,
  onToggleMic,
  onToggleCam,
  onNext,
  onEnd,
  onReport,
  onBlock,
}: ControlBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="toolbar" aria-label="Call controls">
      <button
        type="button"
        onClick={onToggleMic}
        aria-pressed={!micOn}
        aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        className="rounded-full border border-ink/15 p-3 hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      <button
        type="button"
        onClick={onToggleCam}
        aria-pressed={!camOn}
        aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
        className="rounded-full border border-ink/15 p-3 hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        {camOn ? <Video size={18} /> : <VideoOff size={18} />}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!inCall || busy}
        aria-label="Next person"
        className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-cream disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <SkipForward size={16} aria-hidden /> Next
      </button>
      <button
        type="button"
        onClick={onEnd}
        disabled={busy}
        aria-label="End call"
        className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <PhoneOff size={16} aria-hidden /> End
      </button>
      <button
        type="button"
        onClick={onReport}
        disabled={!inCall}
        aria-label="Report this user"
        className="rounded-full border border-ink/15 p-3 hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
      >
        <Flag size={18} />
      </button>
      <button
        type="button"
        onClick={onBlock}
        disabled={!inCall}
        aria-label="Block this user"
        className="rounded-full border border-ink/15 p-3 hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
      >
        <Ban size={18} />
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getDiagEvents, subscribeDiag, type DiagEvent } from '../lib/diagnostics'

function time(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour12: false })
}

/** Collapsible diagnostics viewer; works in production builds. */
export function DebugPanel() {
  const [events, setEvents] = useState<DiagEvent[]>(() => getDiagEvents())
  const [open, setOpen] = useState(false)

  useEffect(() => subscribeDiag((e) => setEvents((prev) => [...prev.slice(-119), e])), [])

  return (
    <div className="border-t border-ink/10 bg-white/70 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-1.5 text-left text-ink/50 hover:text-ink/80"
        aria-expanded={open}
      >
        <span>Diagnostics ({events.length})</span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto border-t border-ink/10 px-4 py-2">
          {events.length === 0 ? (
            <p className="text-ink/40">No events yet.</p>
          ) : (
            <ul className="space-y-0.5 font-mono">
              {events.map((e, i) => (
                <li key={i} className="text-ink/70">
                  <span className="text-ink/40">{time(e.at)}</span> [{e.tag}] {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
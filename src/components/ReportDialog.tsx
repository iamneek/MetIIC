import { useState } from 'react'
import { X } from 'lucide-react'

export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate or explicit behavior' },
  { value: 'spam', label: 'Spam or scamming' },
  { value: 'underage', label: 'Appears to be underage' },
  { value: 'other', label: 'Other' },
] as const

export function ReportDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (reason: string, details: string) => Promise<void>
}) {
  const [reason, setReason] = useState<string>('harassment')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-label="Report user">
      <div className="w-full max-w-sm rounded-xl bg-cream p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Report this person</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-ink/5">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-ink/60">
          Reports are private and never shared with the other person. No video or audio is recorded.
        </p>
        <div className="mt-4 space-y-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-ink/70">Details (optional, max 500 chars)</span>
          <textarea
            value={details}
            maxLength={500}
            onChange={(e) => setDetails(e.target.value)}
            className="mt-1 w-full rounded border border-ink/15 bg-white p-2 text-sm"
            rows={3}
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onSubmit(reason, details)
              onClose()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to submit report.')
            } finally {
              setBusy(false)
            }
          }}
          className="mt-4 w-full rounded-lg bg-ink py-2 text-sm font-medium text-cream disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Submit report'}
        </button>
      </div>
    </div>
  )
}

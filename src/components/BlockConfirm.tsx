export function BlockConfirm({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" role="alertdialog" aria-modal="true" aria-label="Block user">
      <div className="w-full max-w-sm rounded-xl bg-cream p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Block this person?</h2>
        <p className="mt-2 text-sm text-ink/70">
          You will never be matched with each other again, in either direction. The current call will end.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-ink/15 px-4 py-2 text-sm hover:bg-ink/5">
            Cancel
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Block
          </button>
        </div>
      </div>
    </div>
  )
}

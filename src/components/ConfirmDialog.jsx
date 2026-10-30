import React, { useEffect, useRef } from 'react'

// Small modal for confirming a destructive action. Escape or tapping outside cancels.
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  const cancelRef = useRef(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  // Runs once when the dialog opens, even though callers pass a new onCancel each render
  useEffect(() => {
    // Focus Cancel, so pressing Enter by accident doesn't confirm
    cancelRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onCancelRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onCancel}
      data-testid="confirm-backdrop"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-xl bg-gray-800 border border-gray-700 p-5 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
        data-testid="confirm-dialog"
      >
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        <p id="confirm-message" className="mt-2 text-sm text-gray-300 break-words">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 font-semibold"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

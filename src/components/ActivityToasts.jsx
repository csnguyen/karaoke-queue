import React, { useState, useCallback, useRef, useEffect } from 'react'

export const ACTIVITY_TOAST_MS = 7000
const MAX_VISIBLE = 3

// Short-lived "who did what" notices; newest at the bottom
export function useActivityToasts() {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)
  const timers = useRef(new Set())

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const announce = useCallback((events) => {
    if (events.length === 0) return
    const added = events.map((event) => ({ ...event, id: nextId.current++ }))
    setToasts((list) => [...list, ...added].slice(-MAX_VISIBLE))
    for (const { id } of added) {
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        setToasts((list) => list.filter((t) => t.id !== id))
      }, ACTIVITY_TOAST_MS)
      timers.current.add(timer)
    }
  }, [])

  return { toasts, announce }
}

export default function ActivityToasts({ toasts }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex flex-col gap-2"
      role="status"
      aria-live="polite"
      data-testid="activity-toasts"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-lg border border-purple-700/60 bg-gray-800/95 px-3 py-2 text-sm text-gray-300 shadow-lg"
          data-testid="activity-toast"
        >
          <span className="font-semibold text-purple-300">{t.actor}</span>
          {' '}{t.verb}
          {t.song && <>{' '}<span className="font-medium text-white">“{t.song}”</span></>}
          {t.suffix && <>{' '}{t.suffix}</>}
        </div>
      ))}
    </div>
  )
}

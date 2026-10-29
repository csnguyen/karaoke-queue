import { useState, useEffect, useCallback, useRef } from 'react'

// Fallbacks for when the caller can't measure its content (e.g. before layout)
export const SIDEBAR_DEFAULT_WIDTH = 260
export const SIDEBAR_MIN_WIDTH = 260
// The player column never gets narrower than this, so the Now Playing bar stays usable
export const MAIN_MIN_WIDTH = 560
// v2: the default changed to "narrowest that fits the header", so older saved widths are dropped
const STORAGE_KEY = 'karaoke-tv-sidebar-width-v2'
const KEY_STEP = 16
const KEY_STEP_LARGE = 64

function loadWidth() {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  } catch {
    return null
  }
}

function saveWidth(width) {
  try {
    if (width === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(width))
  } catch {}
}

// Right-hand sidebar whose width is set by dragging a handle on its left edge.
// Until the user picks a width, it uses defaultWidth; the rendered width is always
// clamped between minWidth and what leaves MAIN_MIN_WIDTH for the player.
export function useResizableSidebar({
  defaultWidth = SIDEBAR_DEFAULT_WIDTH,
  minWidth = SIDEBAR_MIN_WIDTH,
} = {}) {
  const [preferredWidth, setPreferredWidth] = useState(loadWidth)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const maxWidthFor = useCallback(
    (vw) => Math.max(minWidth, vw - MAIN_MIN_WIDTH),
    [minWidth]
  )
  const clamp = useCallback(
    (w, vw) => Math.round(Math.min(Math.max(w, minWidth), maxWidthFor(vw))),
    [minWidth, maxWidthFor]
  )

  const width = clamp(preferredWidth ?? defaultWidth, viewportWidth)
  const widthRef = useRef(width)
  widthRef.current = width
  const clampRef = useRef(clamp)
  clampRef.current = clamp

  const commit = useCallback((next) => {
    const clamped = clampRef.current(next, window.innerWidth)
    setPreferredWidth(clamped)
    saveWidth(clamped)
  }, [])

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    setDragging(true)

    const onMove = (ev) => {
      if (!Number.isFinite(ev.clientX)) return
      setPreferredWidth(clampRef.current(window.innerWidth - ev.clientX, window.innerWidth))
    }
    const onUp = () => {
      setDragging(false)
      saveWidth(widthRef.current)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [])

  const onKeyDown = useCallback((e) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    // Handle sits on the sidebar's left edge: moving it left widens the sidebar
    if (e.key === 'ArrowLeft') commit(widthRef.current + step)
    else if (e.key === 'ArrowRight') commit(widthRef.current - step)
    else if (e.key === 'Home') commit(0)
    else if (e.key === 'End') commit(Infinity)
    else return
    e.preventDefault()
  }, [commit])

  // Back to the (measured) default, and forget the saved preference
  const reset = useCallback(() => {
    setPreferredWidth(null)
    saveWidth(null)
  }, [])

  return {
    width,
    dragging,
    handleProps: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize sidebar',
      'aria-valuemin': minWidth,
      'aria-valuemax': maxWidthFor(viewportWidth),
      'aria-valuenow': width,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
      onDoubleClick: reset,
    },
  }
}

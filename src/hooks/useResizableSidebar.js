import { useState, useEffect, useCallback, useRef } from 'react'

export const SIDEBAR_DEFAULT_WIDTH = 440
export const SIDEBAR_MIN_WIDTH = 260
// The player column never gets narrower than this, so the Now Playing bar stays usable
export const MAIN_MIN_WIDTH = 560
const STORAGE_KEY = 'karaoke-tv-sidebar-width'
const KEY_STEP = 16
const KEY_STEP_LARGE = 64

function maxWidthFor(viewportWidth) {
  return Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - MAIN_MIN_WIDTH)
}

function clamp(width, viewportWidth) {
  return Math.round(Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), maxWidthFor(viewportWidth)))
}

function loadWidth() {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

function saveWidth(width) {
  try { localStorage.setItem(STORAGE_KEY, String(width)) } catch {}
}

// Right-hand sidebar whose width is set by dragging a handle on its left edge.
// The stored width is the user's preference; the rendered width is clamped to the viewport.
export function useResizableSidebar() {
  const [preferredWidth, setPreferredWidth] = useState(loadWidth)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [dragging, setDragging] = useState(false)
  const widthRef = useRef(preferredWidth)

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const width = clamp(preferredWidth, viewportWidth)
  widthRef.current = width

  const commit = useCallback((next) => {
    const clamped = clamp(next, window.innerWidth)
    setPreferredWidth(clamped)
    saveWidth(clamped)
  }, [])

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    setDragging(true)

    const onMove = (ev) => {
      if (!Number.isFinite(ev.clientX)) return
      setPreferredWidth(clamp(window.innerWidth - ev.clientX, window.innerWidth))
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
    else if (e.key === 'Home') commit(SIDEBAR_MIN_WIDTH)
    else if (e.key === 'End') commit(maxWidthFor(window.innerWidth))
    else return
    e.preventDefault()
  }, [commit])

  const reset = useCallback(() => commit(SIDEBAR_DEFAULT_WIDTH), [commit])

  return {
    width,
    dragging,
    handleProps: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize sidebar',
      'aria-valuemin': SIDEBAR_MIN_WIDTH,
      'aria-valuemax': maxWidthFor(viewportWidth),
      'aria-valuenow': width,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
      onDoubleClick: reset,
    },
  }
}

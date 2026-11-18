import { useEffect, useRef, useState } from 'react'
import { t } from '@/i18n'
import { activeLevel, floorBadge, levelName, useLayout } from '@/model/layoutStore'

/** Fades to 10% this long after the last interaction */
const IDLE_MS = 2000
/** Button size + gap (px): the lit ring slides by this per floor */
const STEP = 48

/**
 * Floor buttons on the left edge, styled like an elevator panel: a small amber display with the current floor, round
 * buttons from the top floor down, and a lit ring that slides to the active one. Fades to 10% opacity 2 s after the
 * pointer leaves (or after a floor change made elsewhere) and wakes on hover or focus. Not shown for a single floor.
 */
export function FloorRail() {
  const levels = useLayout((s) => s.layout?.levels)
  const active = useLayout((s) => activeLevel(s))
  const mode = useLayout((s) => s.mode)
  const [awake, setAwake] = useState(true)
  const hover = useRef(false)
  const timer = useRef(0)
  const sleepSoon = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (!hover.current) setAwake(false)
    }, IDLE_MS)
  }
  const wake = () => {
    setAwake(true)
    if (!hover.current) sleepSoon()
  }
  // A floor change from anywhere (menu, search, walk) shows the panel briefly
  const activeId = active?.id
  const seen = useRef(activeId)
  if (seen.current !== activeId) {
    seen.current = activeId
    if (!awake) setAwake(true)
  }
  useEffect(() => {
    if (!hover.current) sleepSoon()
    return () => window.clearTimeout(timer.current)
    // sleepSoon only touches refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  if (!levels || levels.length < 2 || !active) return null
  const sorted = [...levels].sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0))
  const idx = sorted.findIndex((l) => l.id === active.id)
  return (
    <nav
      id="floor-rail"
      aria-label={t('Floors')}
      className={`elevator pointer-events-auto absolute top-1/2 z-30 -translate-y-1/2 ${mode === 'edit' ? 'left-[76px]' : 'left-4'}`}
      data-awake={awake ? '1' : '0'}
      onPointerEnter={() => {
        hover.current = true
        window.clearTimeout(timer.current)
        setAwake(true)
      }}
      onPointerLeave={() => {
        hover.current = false
        sleepSoon()
      }}
      onFocus={wake}
      onBlur={sleepSoon}
    >
      <div className="elevator-display" aria-hidden>
        {floorBadge(active)}
      </div>
      <div className="relative grid gap-2">
        <span className="elevator-halo" style={{ transform: `translateY(${idx * STEP}px)` }} aria-hidden />
        {sorted.map((l) => (
          <button
            key={l.id}
            type="button"
            className="elevator-btn"
            data-floor-rail={l.id}
            data-active={l.id === active.id}
            aria-pressed={l.id === active.id}
            aria-label={levelName(l)}
            title={levelName(l)}
            onClick={() => {
              useLayout.getState().setLevel(l.id)
              wake()
            }}
          >
            {floorBadge(l)}
          </button>
        ))}
      </div>
    </nav>
  )
}

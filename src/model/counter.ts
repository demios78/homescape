import { CATALOG } from './catalog'
import type { Item } from './types'

/*
 * Built-in sink of the kitchen counter, with a faucet. Chosen on the card (Item.sink: none, left, center, right); when not
 * chosen it sits in the middle unless a separate sink item stands within 1 m of either end of the counter, so the
 * automatic plan does not get two sinks next to each other. Drawn by kit/furniture.tsx > CounterRun; the person's washing
 * spot is in model/people.ts > workSpots.
 */

/** Sink width and distance from the counter end (m) */
export const SINK_W = 0.56
const EDGE = 0.45
const CORNER = 0.6 + SINK_W / 2 + 0.06

/**
 * Base cabinet fronts of a counter run (Item.fronts), left to right as seen from the front: "kind:width,..." in meters,
 * scaled to fill the run. Kinds: door, doors (a pair), drawer (a drawer over a door), trash (a drawer over a pull-out bin),
 * drawers (three), spice (a narrow pull-out), sink (a false front over two doors, the built-in sink above it), corner (a
 * blind panel where another run meets it), and two appliance gaps that leave room for a separate item: dw (a dishwasher,
 * the worktop runs over it) and range (a slide-in range, no worktop).
 */
export type FrontKind = 'door' | 'doors' | 'drawer' | 'trash' | 'drawers' | 'spice' | 'sink' | 'corner' | 'dw' | 'range'
const FRONT_KINDS: FrontKind[] = ['door', 'doors', 'drawer', 'trash', 'drawers', 'spice', 'sink', 'corner', 'dw', 'range']
export interface CounterFront {
  kind: FrontKind
  /** left and right edge along local x */
  x0: number
  x1: number
}
/** Appliance gaps: no cabinet (and over a range no worktop) */
export const isGap = (k: FrontKind) => k === 'dw' || k === 'range'

export function counterFronts(fronts: string | undefined, len: number): CounterFront[] | null {
  if (!fronts) return null
  const parts = fronts
    .split(',')
    .map((p) => p.trim().split(':'))
    .map(([k, w]) => ({ kind: k as FrontKind, w: Number(w) }))
    .filter((p) => FRONT_KINDS.includes(p.kind) && p.w > 0)
  const sum = parts.reduce((a, p) => a + p.w, 0)
  if (!parts.length || sum <= 0) return null
  let x = -len / 2
  return parts.map((p) => {
    const x0 = x
    x += (p.w * len) / sum
    return { kind: p.kind, x0, x1: x }
  })
}

/** Center of the counter's built-in sink along local x; null without a sink. */
export function counterSink(items: Item[], c: Item): number | null {
  if (c.kind !== 'kitchenCounter') return null
  const L = c.len ?? CATALOG.kitchenCounter.size[0]
  // A run laid out with fronts has its sink over its sink cabinet (unless switched off on the card)
  const sinkFront = counterFronts(c.fronts, L)?.find((f) => f.kind === 'sink')
  if (sinkFront) return c.sink === 'none' ? null : (sinkFront.x0 + sinkFront.x1) / 2
  if (L < 0.9) return null
  let side = c.sink
  if (!side) {
    const ax = Math.cos(c.rot)
    const az = -Math.sin(c.rot)
    const near = items.some((i) => {
      if (i.kind !== 'sink') return false
      const along = (i.x - c.x) * ax + (i.z - c.z) * az
      const across = Math.abs(-(i.x - c.x) * az + (i.z - c.z) * ax)
      return across < 0.6 && Math.abs(along) < L / 2 + 1
    })
    side = near ? 'none' : 'center'
  }
  if (side === 'none') return null
  // On an L counter it stays out of the corner square (0.6 m): at that end it starts one arm depth inward
  const lo = -L / 2 + (c.variant === 'lLeft' ? CORNER : EDGE)
  const hi = L / 2 - (c.variant === 'lRight' ? CORNER : EDGE)
  if (lo > hi) return null
  const x = side === 'left' ? lo : side === 'right' ? hi : 0
  return Math.min(hi, Math.max(lo, x))
}

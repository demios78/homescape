import type { Item, Level, Rect } from './types'

/*
 * Stairwell: stairs on the lower level open a hole of their footprint in the floor of the level above (the stairs below
 * are visible through it); the arrival end of the hole (the top of the stairs, local -z) is open, the other edges get a
 * railing (except an edge on a wall). On the lower level the ceiling of the stairs' room is open at the same spot. The
 * stairs (kit/outdoor.tsx > Stairs) are 1 m wide and 3.2 m long; the hole is 5 cm wider on each side.
 */

export type Side = 'l' | 'r' | 't' | 'b'
export interface Stairwell {
  id: string
  r: Rect
  /** Arrival edge (top of the stairs): no railing */
  open: Side
  /**
   * The hole lies under stairs on this level that are closed underneath (Item.variant 'closed'): a closet under the
   * stairs, as with basement stairs below the main stairs. No railing is drawn; in the walk only its long sides block.
   */
  closet?: boolean
}

const HALF_W = 0.55
const HALF_L = 1.65

/** Footprint of the stairs (axis-aligned after rotation) and the arrival edge */
export function stairFootprint(it: Item): Stairwell {
  const c = Math.cos(it.rot)
  const s = Math.sin(it.rot)
  const hx = Math.abs(c) * HALF_W + Math.abs(s) * HALF_L
  const hz = Math.abs(s) * HALF_W + Math.abs(c) * HALF_L
  // The top end is local -z: direction (-sin, -cos) in the world
  const open: Side = Math.abs(s) > Math.abs(c) ? (s > 0 ? 'l' : 'r') : c > 0 ? 't' : 'b'
  return { id: it.id, r: { x: it.x - hx, z: it.z - hz, w: hx * 2, d: hz * 2 }, open }
}

/** Overlap area of two rectangles */
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z))

/** Holes in this level's floor opened by the stairs on the level right below */
export function stairwellsOf(levels: Level[], level: Level): Stairwell[] {
  const e = level.elevation ?? 0
  const below = levels.find((l) => (l.elevation ?? 0) === e - 1)
  if (!below) return []
  const closed = level.items.filter((it) => it.kind === 'stairs' && it.variant === 'closed').map((it) => stairFootprint(it).r)
  return below.items
    .filter((it) => it.kind === 'stairs')
    .map((it) => {
      const w = stairFootprint(it)
      return closed.some((r) => overlap(r, w.r) > 0.5 * w.r.w * w.r.d) ? { ...w, closet: true } : w
    })
}

/** The long sides of a hole (parallel to its stairs): the walls of a closet under the stairs */
export function closetSides(w: Stairwell) {
  const { x, z, w: W, d: D } = w.r
  return w.open === 't' || w.open === 'b'
    ? [{ a: { x, z }, b: { x, z: z + D } }, { a: { x: x + W, z }, b: { x: x + W, z: z + D } }]
    : [{ a: { x, z }, b: { x: x + W, z } }, { a: { x, z: z + D }, b: { x: x + W, z: z + D } }]
}

/** Holes in the ceiling opened by this level's stairs */
export const ceilingHoles = (level: Level) => level.items.filter((it) => it.kind === 'stairs').map((it) => stairFootprint(it).r)

const EPS = 1e-6

/** Subtracts the holes from a rectangle: the remaining parts (the rectangle itself without holes) */
export function subtractRects(r: Rect, holes: Rect[]): Rect[] {
  let parts = [r]
  for (const h of holes) {
    const next: Rect[] = []
    for (const p of parts) {
      const x0 = Math.max(p.x, h.x)
      const x1 = Math.min(p.x + p.w, h.x + h.w)
      const z0 = Math.max(p.z, h.z)
      const z1 = Math.min(p.z + p.d, h.z + h.d)
      if (x1 - x0 <= EPS || z1 - z0 <= EPS) {
        next.push(p)
        continue
      }
      // Top and bottom strips at full width, left and right in the middle
      if (z0 - p.z > EPS) next.push({ x: p.x, z: p.z, w: p.w, d: z0 - p.z })
      if (p.z + p.d - z1 > EPS) next.push({ x: p.x, z: z1, w: p.w, d: p.z + p.d - z1 })
      if (x0 - p.x > EPS) next.push({ x: p.x, z: z0, w: x0 - p.x, d: z1 - z0 })
      if (p.x + p.w - x1 > EPS) next.push({ x: x1, z: z0, w: p.x + p.w - x1, d: z1 - z0 })
    }
    parts = next
  }
  return parts.filter((p) => p.w > 0.02 && p.d > 0.02)
}

/** Railing edges of the hole (except the arrival edge and edges on the room boundary, i.e. a wall) */
export function railEdges(w: Stairwell, room: Rect[]): { a: { x: number; z: number }; b: { x: number; z: number } }[] {
  const { x, z, w: W, d: D } = w.r
  const sides: [Side, { x: number; z: number }, { x: number; z: number }][] = [
    ['t', { x, z }, { x: x + W, z }],
    ['b', { x, z: z + D }, { x: x + W, z: z + D }],
    ['l', { x, z }, { x, z: z + D }],
    ['r', { x: x + W, z }, { x: x + W, z: z + D }],
  ]
  // An edge closer than 12 cm to the room's outer boundary is on a wall: no railing needed
  const onWall = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const mx = (a.x + b.x) / 2
    const mz = (a.z + b.z) / 2
    const inside = (px: number, pz: number) => room.some((q) => px > q.x && px < q.x + q.w && pz > q.z && pz < q.z + q.d)
    const nx = a.x === b.x ? 0.12 : 0
    const nz = a.z === b.z ? 0.12 : 0
    return !inside(mx + nx, mz + nz) || !inside(mx - nx, mz - nz)
  }
  // Without a room (walk mode collision) all edges
  return sides.filter(([s, a, b]) => s !== w.open && (!room.length || !onWall(a, b))).map(([, a, b]) => ({ a, b }))
}

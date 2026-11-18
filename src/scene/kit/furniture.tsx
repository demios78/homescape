import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { domainOf, isActive, lightColor, lightLevel } from '@/ha/derive'
import { t } from '@/i18n'
import { HEADBOARD } from '@/model/bindings'
import { BED_FLORAL, bedModel, CATALOG, COVER_LEAF, CUSHION_FLORAL, RUG_DEFAULT, sizeOf } from '@/model/catalog'
import { DRAWER_SLIDE } from '@/model/containers'
import { counterFronts, isGap, SINK_W, type CounterFront } from '@/model/counter'
import { markShadows } from '../frame'
import { Glow, Spin, StripGlow, useEased, useLitMaterial, Wash } from './effects'
import { BOOK_COLORS, C } from './palette'
import { Ball, Box, Cyl, mat, rng } from './primitives'
import { baseplateTopTexture, diamondFabricTexture, woodGrainTexture, beadboardTexture, wineLatticeTexture, carvedPanelTexture, dashSeatTexture, embroideredBackTexture, paintedTopTexture, chintzTexture, damaskStripeTexture, floralTexture, latticeTexture, leafPrintTexture, medallionTexture, rugTexture, splatTopTexture, wickerLatticeTexture, wickerTexture } from './textures'
import { gainOf, type Visual } from './visual'

/*
 * Furniture: not bound to HA, makes the home recognizable. Dimensions match the footprints in the catalog.
 * Local convention: origin at the center of the base on the floor, front faces +z.
 */

/* ---------- cabinet interiors: carcass, door, drawer ---------- */

/*
 * Furniture with doors and drawers holds items inside (every part that opens; compartments in model/containers.ts >
 * INTERIOR). The carcass is hollow (sides, bottom, top, back, shelves); doors swing on their hinges, drawers slide out
 * (Visual.open; for drawers only those with items inside, all of them if none). Closed, it looks like a solid cabinet.
 */
const shade = (hex: string, k: number) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`
const T = 0.018

/** Hollow carcass, open at the front; shelves (heights from the carcass bottom). top false: the countertop covers it (room for the sink bowl) */
function Carcass({ w, h, d, y = 0, z = 0, color, shelves = [], top = true }: { w: number; h: number; d: number; y?: number; z?: number; color: string; shelves?: number[]; top?: boolean }) {
  const inner = shade(color, 0.9)
  return (
    <group position={[0, y, z]}>
      <Box size={[T, h, d]} position={[-w / 2 + T / 2, h / 2, 0]} color={color} />
      <Box size={[T, h, d]} position={[w / 2 - T / 2, h / 2, 0]} color={color} />
      <Box size={[w, T, d]} position={[0, T / 2, 0]} color={color} />
      {top && <Box size={[w, T, d]} position={[0, h - T / 2, 0]} color={color} />}
      <Box size={[w - 2 * T, h - 2 * T, 0.012]} position={[0, h / 2, -d / 2 + 0.006]} color={inner} shadow={false} />
      {shelves.map((sy) => (
        <Box key={sy} size={[w - 2 * T, T, d - 0.03]} position={[0, sy, -0.01]} color={color} />
      ))}
    </group>
  )
}

/** Hinged door: swings about 100° on the hinge edge; handle on the free edge */
function SwingDoor({ w, h, at, hinge, open, color, handle = 0.3, material }: { w: number; h: number; at: [number, number, number]; hinge: 'l' | 'r'; open: number; color: string; handle?: number; material?: THREE.Material }) {
  const s = hinge === 'l' ? 1 : -1
  const ref = useEased(open * -s * 1.8)
  return (
    <group ref={ref} position={[at[0] - (s * w) / 2, at[1], at[2]]}>
      <Box size={[w, h, T]} position={[(s * w) / 2, 0, 0]} color={color} material={material} shadow={false} />
      {handle > 0 && <Box size={[0.022, Math.min(handle, h * 0.5), 0.022]} position={[s * (w - 0.045), h * 0.12, 0.02]} color={C.steel} shadow={false} />}
    </group>
  )
}

/** Sliding drawer: front, sides, back and bottom (open top); slides DRAWER_SLIDE forward when open */
function Drawer({ w, h, d, at, open, color }: { w: number; h: number; d: number; at: [number, number, number]; open: number; color: string }) {
  const ref = useRef<THREE.Group>(null)
  const invalidate = useThree((st) => st.invalidate)
  const target = open * DRAWER_SLIDE
  useEffect(() => invalidate(), [target, invalidate])
  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    const dz = target - g.position.z
    if (Math.abs(dz) < 0.0005) return
    g.position.z += dz * Math.min(1, dt * 6)
    markShadows(1)
    state.invalidate()
  })
  const inner = shade(color, 0.92)
  return (
    <group position={at}>
      <group ref={ref}>
        <Box size={[w, h, T]} position={[0, 0, d / 2]} color={color} shadow={false} />
        <Box size={[w * 0.36, 0.014, 0.018]} position={[0, h * 0.22, d / 2 + 0.014]} color={C.steel} shadow={false} />
        <Box size={[w - 0.04, 0.012, d - 0.03]} position={[0, -h / 2 + 0.02, 0]} color={inner} shadow={false} />
        <Box size={[0.012, h - 0.04, d - 0.03]} position={[-w / 2 + 0.026, -0.01, 0]} color={inner} shadow={false} />
        <Box size={[0.012, h - 0.04, d - 0.03]} position={[w / 2 - 0.026, -0.01, 0]} color={inner} shadow={false} />
        <Box size={[w - 0.04, h - 0.04, 0.012]} position={[0, -0.01, -d / 2 + 0.03]} color={inner} shadow={false} />
      </group>
    </group>
  )
}

/* ---------- kitchen sink ---------- */

// No environment map: high metalness turns steel dark, so use a light color with little metalness
const steelBright = mat('#dfe3ea', { roughness: 0.28, metalness: 0.25 })
const steelBowl = mat('#c3c8d1', { roughness: 0.42, metalness: 0.15 })

/**
 * Countertop (top surface at y + 0.025). With a sink (sinkAt: local x) the top is split into pieces around the bowl: a
 * hollow steel bowl (19 cm deep, with drain and rim) and a gooseneck faucet at the back (body, arc, spout, lever).
 */
function CounterTop({ len, color, sinkAt, y = 0.885, d = 0.62 }: { len: number; color: string; sinkAt?: number; y?: number; d?: number }) {
  if (sinkAt == null) return <Box size={[len, 0.05, d]} position={[0, y, 0]} color={color} />
  const hw = SINK_W / 2
  const z0 = -0.18
  const z1 = 0.22
  const top = y + 0.025
  const L0 = -len / 2
  const L1 = len / 2
  const D = 0.19
  const cz = (z0 + z1) / 2
  return (
    <group>
      {sinkAt - hw > L0 + 0.001 && <Box size={[sinkAt - hw - L0, 0.05, d]} position={[(L0 + sinkAt - hw) / 2, y, 0]} color={color} />}
      {L1 - (sinkAt + hw) > 0.001 && <Box size={[L1 - (sinkAt + hw), 0.05, d]} position={[(sinkAt + hw + L1) / 2, y, 0]} color={color} />}
      <Box size={[SINK_W, 0.05, z0 + d / 2]} position={[sinkAt, y, (-d / 2 + z0) / 2]} color={color} />
      <Box size={[SINK_W, 0.05, d / 2 - z1]} position={[sinkAt, y, (z1 + d / 2) / 2]} color={color} />
      {/* bowl: bottom, four sides, drain; thin rim on top */}
      <group position={[sinkAt, top, cz]}>
        <Box size={[SINK_W - 0.02, 0.01, z1 - z0 - 0.02]} position={[0, -D, 0]} material={steelBowl} shadow={false} />
        <Box size={[0.01, D, z1 - z0]} position={[-hw + 0.005, -D / 2, 0]} material={steelBowl} shadow={false} />
        <Box size={[0.01, D, z1 - z0]} position={[hw - 0.005, -D / 2, 0]} material={steelBowl} shadow={false} />
        <Box size={[SINK_W, D, 0.01]} position={[0, -D / 2, (z0 - z1) / 2 + 0.005]} material={steelBowl} shadow={false} />
        <Box size={[SINK_W, D, 0.01]} position={[0, -D / 2, (z1 - z0) / 2 - 0.005]} material={steelBowl} shadow={false} />
        <Cyl r={0.032} h={0.006} position={[0, -D + 0.008, 0]} color={C.inkSoft} segments={18} shadow={false} />
        {[-1, 1].map((sx) => (
          <Box key={`x${sx}`} size={[0.018, 0.006, z1 - z0 + 0.036]} position={[sx * (hw + 0.009), 0.003, 0]} material={steelBright} shadow={false} />
        ))}
        {[-1, 1].map((sz) => (
          <Box key={`z${sz}`} size={[SINK_W + 0.036, 0.006, 0.018]} position={[0, 0.003, sz * ((z1 - z0) / 2 + 0.009)]} material={steelBright} shadow={false} />
        ))}
      </group>
      {/* gooseneck faucet: body at the back, arc up and forward, spout pointing down; lever on the side */}
      <group position={[sinkAt, top, -0.245]}>
        <Cyl r={0.026} h={0.03} position={[0, 0.015, 0]} material={steelBright} segments={18} />
        <Cyl r={0.014} h={0.27} position={[0, 0.165, 0]} material={steelBright} segments={14} />
        <mesh position={[0, 0.3, 0.095]} rotation={[0, -Math.PI / 2, 0]} material={steelBright} castShadow>
          <torusGeometry args={[0.095, 0.014, 10, 24, Math.PI]} />
        </mesh>
        <Cyl r={0.014} h={0.06} position={[0, 0.27, 0.19]} material={steelBright} segments={14} />
        <Cyl r={0.017} h={0.012} position={[0, 0.24, 0.19]} color={C.inkSoft} segments={14} shadow={false} />
        <Box size={[0.012, 0.012, 0.09]} position={[0.03, 0.13, 0.02]} rotation={[0.35, 0.5, 0]} material={steelBright} />
      </group>
    </group>
  )
}

/** Is compartment i open: while the cabinet is open, the compartments that hold items (all of them if none do) */
const partOpen = (v: Visual, i: number) => (v.open ? (!v.openParts?.length || v.openParts.includes(i) ? v.open : 0) : 0)

const legs4 = (w: number, d: number, h: number, color: string = C.ink, r = 0.03) =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={r} h={h} position={[sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06)]} color={color} />))

/**
 * Sofa with a chaise (Item.variant 'chaiseLeft' | 'chaiseRight', seen from the front): track arms, a 2.2 m frame with three
 * back cushions; on the chaise side the seat runs forward 0.66 m more as one long cushion. Fabric Item.body.
 */
function ChaiseSofa({ v }: { v: Visual }) {
  const fabric = v.opts.body ?? '#b8332f'
  const cushion = shade(fabric, 1.06)
  const sx = v.opts.variant === 'chaiseLeft' ? -1 : 1
  const legs = '#3a2a20'
  const cx = sx * 0.74
  return (
    <group>
      {[-1.02, 1.02].flatMap((x) => [-0.36, 0.36].map((z) => <Box key={`${x}${z}`} size={[0.06, 0.08, 0.06]} position={[x, 0.04, z]} color={legs} />))}
      {[-0.36, 0.36].map((x) => (
        <Box key={x} size={[0.06, 0.08, 0.06]} position={[cx + x, 0.04, 1.08]} color={legs} />
      ))}
      {/* base: the sofa and the chaise */}
      <Box size={[2.2, 0.3, 0.9]} position={[0, 0.23, 0]} color={fabric} radius={0.04} />
      <Box size={[0.72, 0.3, 0.7]} position={[cx, 0.23, 0.77]} color={fabric} radius={0.04} />
      {/* back and track arms; the arm on the chaise side runs along the chaise */}
      <Box size={[2.2, 0.5, 0.2]} position={[0, 0.62, -0.35]} color={fabric} radius={0.05} />
      <Box size={[0.16, 0.26, 0.9]} position={[-sx * 1.02, 0.51, 0]} color={fabric} radius={0.04} />
      <Box size={[0.16, 0.26, 1.55]} position={[sx * 1.02, 0.51, 0.33]} color={fabric} radius={0.04} />
      {/* seat cushions: two on the sofa side, one long chaise cushion */}
      {[0.38, -0.2].map((x) => (
        <Box key={x} size={[0.58, 0.12, 0.66]} position={[-sx * x, 0.44, 0.1]} color={cushion} radius={0.05} />
      ))}
      <Box size={[0.7, 0.12, 1.36]} position={[cx - sx * 0.08, 0.44, 0.43]} color={cushion} radius={0.05} />
      {/* back cushions */}
      {[-0.66, 0, 0.66].map((x) => (
        <Box key={x} size={[0.64, 0.44, 0.18]} position={[x, 0.71, -0.17]} rotation-x={-0.12} color={cushion} radius={0.07} />
      ))}
    </group>
  )
}

/**
 * Tufted velvet sofa (Item.variant 'tufted'): a low bench seat with button tufting, a low back and track arms at one
 * height, tapered walnut legs with brass caps, loose back pillows (one patterned). Fabric Item.body (emerald teal default).
 */
function TuftedSofa({ v }: { v: Visual }) {
  const fabric = mat(v.opts.body ?? '#1d5560', { roughness: 0.45 })
  const dark = mat(shade(v.opts.body ?? '#1d5560', 0.7), { roughness: 0.5 })
  const walnut = mat('#5a3420', { roughness: 0.5 })
  const brass = mat('#c9a227', { metalness: 0.7, roughness: 0.3 })
  return (
    <group>
      {[-0.95, 0, 0.95].flatMap((x) => [-0.32, 0.32].map((z) => (
        <group key={`${x}${z}`}>
          <Cyl r={0.022} rTop={0.03} h={0.15} position={[x, 0.09, z]} material={walnut} segments={10} />
          <Cyl r={0.022} h={0.025} position={[x, 0.012, z]} material={brass} segments={10} shadow={false} />
        </group>
      )))}
      <Box size={[2.2, 0.3, 0.88]} position={[0, 0.32, 0]} material={fabric} radius={0.04} />
      {[-0.8, -0.4, 0, 0.4, 0.8].flatMap((x) => [-0.1, 0.18].map((z) => <Ball key={`${x}${z}`} r={0.012} position={[x, 0.47, z]} material={dark} detail={0} shadow={false} />))}
      <Box size={[2.2, 0.32, 0.16]} position={[0, 0.62, -0.36]} material={fabric} radius={0.04} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.16, 0.32, 0.88]} position={[s * 1.02, 0.62, 0]} material={fabric} radius={0.04} />
      ))}
      {[-0.45, 0.45].map((x) => (
        <Box key={x} size={[0.55, 0.5, 0.16]} position={[x, 0.72, -0.2]} rotation-x={-0.15} material={fabric} radius={0.07} />
      ))}
      {[-1, 1].map((s) => (
        <Box key={`p${s}`} size={[0.14, 0.42, 0.42]} position={[s * 0.84, 0.62, 0.02]} rotation-z={s * 0.25} material={fabric} radius={0.06} />
      ))}
      <Box size={[0.42, 0.42, 0.12]} position={[0.05, 0.7, -0.08]} rotation-x={-0.18} color="#dfe8e0" radius={0.05} />
    </group>
  )
}

export function Sofa({ v }: { v: Visual }) {
  if (v.opts.variant === 'chaiseLeft' || v.opts.variant === 'chaiseRight') return <ChaiseSofa v={v} />
  if (v.opts.variant === 'tufted') return <TuftedSofa v={v} />
  // Seat top at 0.49 m (a real sofa): a seated person's feet reach the floor; the back cushions keep them forward
  // (seats in model/people.ts, pose in scene/Human.tsx)
  return (
    <group>
      {legs4(2.1, 0.8, 0.08)}
      <Box size={[2.2, 0.28, 0.9]} position={[0, 0.22, 0]} color={C.brand} radius={0.08} />
      <Box size={[2.2, 0.62, 0.24]} position={[0, 0.62, -0.33]} color={C.brand} radius={0.08} />
      <Box size={[0.22, 0.5, 0.9]} position={[-1, 0.39, 0]} color={C.brand} radius={0.08} />
      <Box size={[0.22, 0.5, 0.9]} position={[1, 0.39, 0]} color={C.brand} radius={0.08} />
      {[-0.595, 0, 0.595].map((x) => (
        <group key={x}>
          <Box size={[0.58, 0.14, 0.66]} position={[x, 0.42, 0.11]} color={C.brandLight} radius={0.06} />
          <Box size={[0.58, 0.4, 0.16]} position={[x, 0.68, -0.14]} rotation={[-0.12, 0, 0]} color={C.brandLight} radius={0.07} />
        </group>
      ))}
      <Box size={[0.28, 0.26, 0.1]} position={[0.75, 0.62, 0]} rotation={[-0.15, -0.65, 0.08]} color={C.sun} radius={0.045} />
    </group>
  )
}

export function Armchair() {
  return (
    <group>
      {legs4(0.8, 0.75, 0.08)}
      <Box size={[0.9, 0.36, 0.85]} position={[0, 0.26, 0]} color={C.coral} radius={0.08} />
      <Box size={[0.9, 0.55, 0.2]} position={[0, 0.6, -0.32]} color={C.coral} radius={0.07} />
      <Box size={[0.18, 0.5, 0.85]} position={[-0.36, 0.42, 0]} color={C.coral} radius={0.07} />
      <Box size={[0.18, 0.5, 0.85]} position={[0.36, 0.42, 0]} color={C.coral} radius={0.07} />
      <Box size={[0.54, 0.4, 0.14]} position={[0, 0.64, -0.15]} rotation={[-0.12, 0, 0]} color={C.coral} radius={0.06} />
    </group>
  )
}

/* ---------- loveseat, wicker armchair, shell chair ---------- */

/**
 * Patterned material cache: one per texture, tint and repeat. turn: the pattern turned a quarter (stripes running along a
 * cylinder's length instead of around it).
 */
const patternMats = new Map<string, THREE.MeshStandardMaterial>()
function patternMaterial(name: string, tex: () => THREE.Texture, color: string, rx: number, ry: number, o: { turn?: boolean; alpha?: boolean; roughness?: number } = {}) {
  const key = `${name}:${color}:${rx.toFixed(2)}:${ry.toFixed(2)}:${o.turn ? 1 : 0}`
  let m = patternMats.get(key)
  if (!m) {
    const map = tex().clone()
    map.repeat.set(rx, ry)
    // centered, so the middle of a piece shows the middle of a stripe on every size
    map.offset.set((((1 - rx) / 2) % 1 + 1) % 1, 0)
    if (o.turn) {
      map.center.set(0.5, 0.5)
      map.rotation = Math.PI / 2
    }
    map.needsUpdate = true
    m = new THREE.MeshStandardMaterial({ color, map, roughness: o.roughness ?? 0.9, ...(o.alpha ? { alphaTest: 0.5, side: THREE.DoubleSide } : {}) })
    patternMats.set(key, m)
  }
  return m
}

/** Damask stripes repeat every 45 cm across a piece (u), leaves every 45 cm up it (v) */
const DAMASK = 0.45
const LOVESEAT_WOOD = '#6e4227'

/** Carved (cabriole) leg: a knee bulging outward, a slim ankle and a pad foot; local +z points outward. */
function CabrioleLeg({ at, color }: { at: [number, number, number]; color: string }) {
  return (
    <group position={at} rotation-y={Math.atan2(at[0], at[2])}>
      <Cyl r={0.02} rTop={0.03} h={0.075} position={[0, 0.108, 0.012]} rotation-x={-0.3} color={color} segments={12} />
      <Cyl r={0.014} rTop={0.021} h={0.075} position={[0, 0.045, 0.014]} rotation-x={0.32} color={color} segments={12} />
      <Ball r={0.022} position={[0, 0.012, 0.002]} scale={[1, 0.55, 1.25]} color={color} detail={1} />
    </group>
  )
}

/**
 * Loveseat (like a traditional striped damask loveseat): carved wooden legs, an upholstered base, one long seat cushion,
 * rolled arms that scroll at the front, a camelback with a loose back cushion. Fabric Item.variant: 'striped' (damask
 * stripes, the default) or 'plain' in Item.body. Seat top 0.47 m (people sit like on a sofa: model/people.ts > seats).
 */
export function Loveseat({ v }: { v: Visual }) {
  const plain = v.opts.variant === 'plain'
  const color = v.opts.body ?? '#2f3a5c'
  // turn: on a cylinder lying on its side the stripes run along its length instead of around it
  const fab = (w: number, h: number, turn = false) =>
    plain ? mat(color, { roughness: 0.92 }) : patternMaterial('damask', damaskStripeTexture, '#ffffff', w / DAMASK, h / DAMASK, { turn })
  const scroll = plain ? mat(shade(color, 0.85), { roughness: 0.92 }) : fab(0.15, 0.15)
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <CabrioleLeg key={`${sx}${sz}`} at={[sx * 0.56, 0, sz * 0.29]} color={LOVESEAT_WOOD} />))}
      {/* base and seat cushion */}
      <Box size={[1.26, 0.17, 0.74]} position={[0, 0.225, 0]} radius={0.03} material={fab(1.26, 0.17)} />
      <Box size={[1.02, 0.16, 0.6]} position={[0, 0.39, 0.06]} radius={0.05} material={fab(1.02, 0.6)} />
      {/* rolled arms: a panel under a roll that ends in a scroll at the front */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[0.17, 0.32, 0.72]} position={[s * 0.6, 0.46, 0]} radius={0.04} material={fab(0.72, 0.32)} />
          <Cyl r={0.085} h={0.74} position={[s * 0.625, 0.625, 0]} rotation-x={Math.PI / 2} material={fab(0.53, 0.74, true)} segments={20} />
          <Cyl r={0.07} h={0.012} position={[s * 0.625, 0.625, 0.372]} rotation-x={Math.PI / 2} material={scroll} segments={20} shadow={false} />
        </group>
      ))}
      {/* camelback and the loose back cushion */}
      <Box size={[1.08, 0.5, 0.15]} position={[0, 0.58, -0.33]} radius={0.05} material={fab(1.08, 0.5)} />
      <Cyl r={0.075} h={1.1} position={[0, 0.82, -0.33]} rotation-z={Math.PI / 2} material={fab(0.47, 1.1, true)} segments={20} />
      <Box size={[0.98, 0.32, 0.17]} position={[0, 0.62, -0.19]} rotation-x={-0.14} radius={0.07} material={fab(0.98, 0.32)} />
    </group>
  )
}

/** Wicker rim: one woven roll from the front of the left arm, around the horseshoe back, to the front of the right arm. */
let wickerRimGeo: THREE.TubeGeometry | null = null
function wickerRim() {
  if (!wickerRimGeo) {
    const half: [number, number, number][] = [
      [-0.325, 0.47, 0.31],
      [-0.34, 0.6, 0.22],
      [-0.345, 0.635, 0.02],
      [-0.33, 0.67, -0.18],
      [-0.28, 0.8, -0.29],
      [-0.16, 0.92, -0.33],
    ]
    const pts = [...half, [0, 0.955, -0.345] as [number, number, number], ...[...half].reverse().map(([x, y, z]) => [-x, y, z] as [number, number, number])]
    wickerRimGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 96, 0.045, 10, false)
  }
  return wickerRimGeo
}

/** Open lattice of the horseshoe back: a rectangle with an arched top (meters, so the UVs are meters too). */
let wickerBackGeo: THREE.ShapeGeometry | null = null
function wickerBack() {
  if (!wickerBackGeo) {
    const s = new THREE.Shape()
    s.moveTo(-0.28, 0)
    s.lineTo(0.28, 0)
    s.lineTo(0.28, 0.2)
    s.bezierCurveTo(0.28, 0.4, 0.12, 0.45, 0, 0.45)
    s.bezierCurveTo(-0.12, 0.45, -0.28, 0.4, -0.28, 0.2)
    s.closePath()
    wickerBackGeo = new THREE.ShapeGeometry(s, 16)
  }
  return wickerBackGeo
}

/** Lattice diamonds about every 7 cm */
const LATTICE = 1 / 0.07

/**
 * Wicker armchair (like a painted white wicker chair): a thick woven rim running from the arm fronts around a tall
 * horseshoe back, open diamond lattice in the back and under the arms, a woven apron with a row of loops under the seat,
 * wrapped legs and a tufted seat cushion. Frame Item.body (white, natural, black), cushion Item.top (floral print or plain).
 */
export function WickerChair({ v }: { v: Visual }) {
  const color = v.opts.body ?? '#f2efe8'
  const cushion = v.opts.top ?? CUSHION_FLORAL
  const weave = (rx: number, ry: number, turn = false) => patternMaterial('wicker', wickerTexture, color, rx, ry, { turn, roughness: 0.8 })
  const lattice = (rx: number, ry: number) => patternMaterial('wicker-lattice', wickerLatticeTexture, color, rx, ry, { alpha: true, roughness: 0.8 })
  const pad = cushion === CUSHION_FLORAL ? patternMaterial('chintz', chintzTexture, '#ffffff', 0.6 / 0.4, 0.56 / 0.4) : mat(cushion, { roughness: 0.92 })
  return (
    <group>
      {/* wrapped legs, the front ones splaying slightly */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.024} rTop={0.03} h={0.4} position={[sx * 0.305, 0.2, sz * 0.28]} rotation-z={sx * (sz > 0 ? 0.06 : 0.03)} material={weave(1, 6, true)} segments={10} />),
      )}
      {[-1, 1].map((s) => (
        <Cyl key={s} r={0.01} h={0.58} position={[s * 0.3, 0.1, 0]} rotation-x={Math.PI / 2} color={shade(color, 0.92)} segments={8} shadow={false} />
      ))}
      {/* apron, a row of loops, the seat frame */}
      <Box size={[0.62, 0.2, 0.025]} position={[0, 0.22, 0.3]} material={weave(5, 1.6)} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.025, 0.2, 0.56]} position={[s * 0.31, 0.22, 0]} material={weave(4.5, 1.6)} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[(i - 4) * 0.064, 0.35, 0.305]} castShadow material={mat(color, { roughness: 0.8 })}>
          <torusGeometry args={[0.024, 0.007, 6, 14]} />
        </mesh>
      ))}
      <Box size={[0.64, 0.05, 0.6]} position={[0, 0.405, 0]} radius={0.015} material={weave(5, 1)} />
      {/* rim, lattice back with a braided band, lattice under the arms */}
      <mesh geometry={wickerRim()} material={weave(40, 1, true)} castShadow receiveShadow />
      <group position={[0, 0.47, -0.31]} rotation-x={-0.1}>
        <mesh geometry={wickerBack()} material={lattice(LATTICE, LATTICE)} castShadow />
        <Box size={[0.56, 0.035, 0.03]} position={[0, 0.2, 0]} material={weave(4, 0.4)} />
        <Box size={[0.56, 0.05, 0.035]} position={[0, 0.0, 0]} material={weave(4, 0.4)} />
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.325, 0.535, 0.03]} rotation-y={Math.PI / 2} material={lattice(0.5 * LATTICE, 0.13 * LATTICE)} castShadow>
          <planeGeometry args={[0.5, 0.13]} />
        </mesh>
      ))}
      {/* tufted cushion */}
      <Box size={[0.6, 0.085, 0.56]} position={[0, 0.47, 0.01]} radius={0.035} material={pad} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Ball key={`${sx}${sz}`} r={0.012} position={[sx * 0.14, 0.513, 0.01 + sz * 0.13]} scale={[1, 0.4, 1]} color={shade(cushion, 0.8)} detail={1} shadow={false} />))}
    </group>
  )
}

/**
 * Shell chair (like a velvet scallop swivel chair): six channel-tufted petals in a fan around a round seat, the outer
 * ones curling forward as arms, on a chrome five-star base with casters. Velvet Item.body. Fits under a desk.
 */
export function ShellChair({ v }: { v: Visual }) {
  const color = v.opts.body ?? '#f0cfcd'
  const velvet = mat(color, { roughness: 0.96 })
  // the inner shell joining the petals (seen from both sides)
  const inner = useMemo(() => new THREE.MeshStandardMaterial({ color: shade(color, 0.97), roughness: 0.96, side: THREE.DoubleSide }), [color])
  useEffect(() => () => inner.dispose(), [inner])
  const R = 0.22
  const petals = Array.from({ length: 6 }, (_, i) => -1.7 + (i * 3.4) / 5)
  return (
    <group>
      {/* five-star base, casters, gas lift */}
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation-y={(i * Math.PI * 2) / 5}>
          <Box size={[0.036, 0.026, 0.27]} position={[0, 0.07, 0.135]} rotation-x={0.08} material={steelBright} />
          <Ball r={0.024} position={[0, 0.026, 0.265]} color={C.ink} detail={1} shadow={false} />
        </group>
      ))}
      <Cyl r={0.038} h={0.05} position={[0, 0.085, 0]} material={steelBright} segments={16} />
      <Cyl r={0.022} h={0.26} position={[0, 0.235, 0]} material={steelBright} segments={14} />
      <Cyl r={0.1} h={0.02} position={[0, 0.37, 0]} color={C.ink} segments={16} shadow={false} />
      {/* round seat */}
      <Cyl r={0.24} rTop={0.27} h={0.05} position={[0, 0.405, 0.02]} material={velvet} segments={32} />
      <Cyl r={0.27} h={0.08} position={[0, 0.47, 0.02]} material={velvet} segments={32} />
      {/* petals: tallest at the back, the outer ones lower and forward; overlapping, so the seams read as channels */}
      {petals.map((a) => {
        const h = 0.42 - 0.1 * (a / 1.7) ** 2
        return (
          <group key={a} rotation-y={-a}>
            <group position={[0, 0.43, -R]} rotation-x={-0.12}>
              <Box size={[0.2, h, 0.09]} position={[0, h / 2, 0]} radius={0.045} material={velvet} />
            </group>
          </group>
        )
      })}
      <mesh position={[0, 0.6, 0]} material={inner}>
        <cylinderGeometry args={[R + 0.005, R - 0.03, 0.32, 28, 1, true, Math.PI - 1.8, 3.6]} />
      </mesh>
    </group>
  )
}

/**
 * Task chair (like an upholstered swivel desk chair): one fabric shell, a seat that sweeps up into a rounded back, on a
 * five-star base with casters. Fabric Item.body, base Item.top (white or black). Fits under a desk.
 */
export function TaskChair({ v }: { v: Visual }) {
  const fabric = mat(v.opts.body ?? '#93a79b', { roughness: 0.95 })
  const edge = mat(shade(v.opts.body ?? '#93a79b', 0.82), { roughness: 0.95 })
  const frame = v.opts.top ?? '#f2efe8'
  const wheel = shade(frame, 0.72)
  return (
    <group>
      {/* five-star base: legs angled down to the casters */}
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation-y={(i * Math.PI * 2) / 5 + 0.3}>
          <Box size={[0.034, 0.03, 0.27]} position={[0, 0.085, 0.135]} rotation-x={0.12} color={frame} />
          <Cyl r={0.026} h={0.024} position={[0, 0.03, 0.265]} rotation-z={Math.PI / 2} color={wheel} segments={14} shadow={false} />
        </group>
      ))}
      <Cyl r={0.032} rTop={0.026} h={0.32} position={[0, 0.24, 0]} color={frame} segments={14} />
      <Box size={[0.2, 0.03, 0.2]} position={[0, 0.405, 0]} color={frame} shadow={false} />
      {/* shell: seat, a curved sweep and a rounded back, with a darker piping edge */}
      <Box size={[0.48, 0.075, 0.46]} position={[0, 0.455, 0.03]} rotation-x={-0.04} radius={0.035} material={fabric} />
      <Box size={[0.46, 0.14, 0.06]} position={[0, 0.5, -0.2]} rotation-x={-0.75} radius={0.028} material={fabric} />
      <group position={[0, 0.54, -0.23]} rotation-x={-0.18}>
        <Box size={[0.44, 0.42, 0.06]} position={[0, 0.23, 0]} radius={0.029} material={fabric} />
        <Cyl r={0.22} h={0.06} position={[0, 0.39, 0]} rotation-x={Math.PI / 2} scale={[1, 1, 0.45]} material={fabric} segments={24} />
        <Box size={[0.452, 0.44, 0.012]} position={[0, 0.24, -0.032]} radius={0.006} material={edge} shadow={false} />
      </group>
    </group>
  )
}

/* ---------- fold-top writing desk, three-drawer nightstand ---------- */

/** Writing desk side cheek: a slanted profile in (z, y), extruded 2 cm along -x (built once) */
let cheekGeo: THREE.ExtrudeGeometry | null = null
function deskCheek() {
  if (!cheekGeo) {
    const sh = new THREE.Shape()
    sh.moveTo(-0.25, 0.78)
    sh.lineTo(0.25, 0.78)
    sh.lineTo(0.25, 0.81)
    sh.lineTo(-0.05, 0.95)
    sh.lineTo(-0.25, 0.95)
    sh.closePath()
    cheekGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false })
    // shape x becomes local z; the extrusion runs along -x
    cheekGeo.rotateY(-Math.PI / 2)
  }
  return cheekGeo
}

/**
 * Fold-top writing desk (like a campaign secretary on an X base): a wooden case on black crossed legs; the slanted lid opens
 * flat into a writing surface in front of two small drawers, under a shelf with a gallery back. Lid Item.variant 'open'
 * (default) or 'closed', wood Item.body. Chairs tuck under it; small items stand on the top shelf.
 */
export function WritingDesk({ v }: { v: Visual }) {
  const wood = v.opts.body ?? '#5a3a28'
  const legs = '#262220'
  const W = CATALOG.writingDesk.size[0]
  const D = CATALOG.writingDesk.size[1]
  const open = v.opts.variant !== 'closed'
  const lid = shade(wood, 1.12)
  const bar = Math.atan2(0.42, 0.6)
  return (
    <group>
      {/* crossed legs on both sides, foot bars, a stretcher */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (W / 2 - 0.04), 0, 0]}>
          <Box size={[0.035, 0.732, 0.035]} position={[0, 0.32, 0]} rotation-x={bar} color={legs} />
          <Box size={[0.035, 0.732, 0.035]} position={[0, 0.32, 0]} rotation-x={-bar} color={legs} />
          <Box size={[0.045, 0.03, D - 0.04]} position={[0, 0.015, 0]} color={legs} />
          <Box size={[0.045, 0.03, D - 0.04]} position={[0, 0.605, 0]} color={legs} />
        </group>
      ))}
      <Box size={[W - 0.1, 0.03, 0.03]} position={[0, 0.32, 0]} color={legs} />
      {/* case, drawers behind the writing surface, side cheeks */}
      <Box size={[W, 0.16, D]} position={[0, 0.7, 0]} color={wood} />
      <Box size={[W - 0.04, 0.12, 0.2]} position={[0, 0.84, -0.15]} color={wood} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Box size={[0.33, 0.1, 0.012]} position={[sx * 0.175, 0.84, -0.044]} color={shade(wood, 1.08)} shadow={false} />
          <Ball r={0.012} position={[sx * 0.175, 0.84, -0.034]} color={C.inkSoft} detail={1} shadow={false} />
        </group>
      ))}
      <mesh geometry={deskCheek()} position={[-W / 2 + 0.02, 0, 0]} castShadow material={mat(wood)} />
      <mesh geometry={deskCheek()} position={[W / 2, 0, 0]} castShadow material={mat(wood)} />
      {open ? (
        <Box size={[W - 0.04, 0.02, 0.33]} position={[0, 0.79, 0.115]} color={lid} />
      ) : (
        <Box size={[W - 0.04, 0.02, 0.335]} position={[0, 0.875, 0.1]} rotation-x={Math.atan2(0.15, 0.3)} color={lid} />
      )}
      {/* top shelf with a gallery back and a front lip */}
      <Box size={[W, 0.02, 0.22]} position={[0, 0.95, -0.14]} color={wood} />
      <Box size={[W, 0.18, 0.02]} position={[0, 1.03, -0.24]} color={wood} />
      <Box size={[W, 0.03, 0.015]} position={[0, 0.975, -0.035]} color={wood} shadow={false} />
    </group>
  )
}

/**
 * Three-drawer nightstand (like a farmhouse bedside chest): a top with a small overhang, three drawers on a plinth with
 * bracket feet. Wood Item.body. Drawers open like any cabinet (model/containers.ts > INTERIOR); a lamp stands on top.
 */
export function BedsideChest({ v }: { v: Visual }) {
  const wood = v.opts.body ?? '#8a7563'
  const [W, D] = CATALOG.bedsideChest.size
  const front = shade(wood, 1.06)
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.06, 0.05, 0.06]} position={[sx * (W / 2 - 0.04), 0.025, sz * (D / 2 - 0.04)]} color={shade(wood, 0.9)} />))}
      <Box size={[W - 0.02, 0.05, D - 0.02]} position={[0, 0.075, 0]} color={shade(wood, 0.95)} />
      <Carcass w={W - 0.04} h={0.6} d={D - 0.04} y={0.1} color={wood} />
      <Box size={[W, 0.025, D]} position={[0, 0.7075, 0]} color={wood} radius={0.006} />
      {[0, 1, 2].map((i) => (
        <Drawer key={i} w={W - 0.1} h={0.18} d={D - 0.08} at={[0, 0.2 + i * 0.2, 0.03]} open={partOpen(v, i)} color={front} />
      ))}
    </group>
  )
}

/* ---------- storage bench, wicker wing chair, ironing board ---------- */

/** Storage bench: height of the cabinet top (the cushion sits on it) */
const BENCH_H = 0.47

/**
 * Storage bench (like a carved mango wood window seat): a low cabinet on short feet with carved openwork doors (one about
 * every 40 cm, Item.len 0.8-2 m) and a loose seat cushion. Finish Item.body, cushion Item.top. Doors open like any cabinet
 * (model/containers.ts > INTERIOR); people sit on the cushion.
 */
export function StorageBench({ v }: { v: Visual }) {
  const L = v.opts.len ?? CATALOG.storageBench.size[0]
  const D = CATALOG.storageBench.size[1]
  const wood = v.opts.body ?? '#cfcac2'
  const cushion = v.opts.top ?? '#dfe5ea'
  const n = Math.max(2, Math.round(L / 0.4))
  const gap = 0.025
  const doorW = (L - 0.07 - (n - 1) * gap) / n
  const carved = patternMaterial('carved', carvedPanelTexture, wood, 1, 1, { roughness: 0.85 })
  const open = v.open ?? 0
  const H = BENCH_H - 0.05
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.022} rTop={0.03} h={0.05} position={[sx * (L / 2 - 0.05), 0.025, sz * (D / 2 - 0.05)]} color={shade(wood, 0.85)} segments={10} />))}
      <Carcass w={L} h={H} d={D - 0.02} y={0.05} color={wood} shelves={[0.21]} />
      {Array.from({ length: n }, (_, i) => (
        <SwingDoor key={i} w={doorW} h={H - 0.06} at={[-L / 2 + 0.035 + doorW / 2 + i * (doorW + gap), 0.05 + H / 2, (D - 0.02) / 2 + 0.009]} hinge={i === n - 1 ? 'r' : 'l'} open={open} color={wood} handle={0} material={carved} />
      ))}
      <Box size={[L - 0.01, 0.075, D - 0.01]} position={[0, BENCH_H + 0.04, 0]} radius={0.03} color={cushion} />
    </group>
  )
}

/** Wingback crest: tall wings at the sides, a dip, a gentle peak in the middle (local x, y in meters) */
const WING_CREST: [number, number][] = [
  [-0.38, 0.62],
  [-0.36, 0.76],
  [-0.27, 0.8],
  [-0.15, 0.7],
  [0, 0.75],
  [0.15, 0.7],
  [0.27, 0.8],
  [0.36, 0.76],
  [0.38, 0.62],
]
let wingGeo: readonly [THREE.ExtrudeGeometry, THREE.TubeGeometry] | null = null
function wingBack() {
  if (!wingGeo) {
    const crest = new THREE.SplineCurve(WING_CREST.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(40)
    const sh = new THREE.Shape()
    sh.moveTo(-0.38, 0)
    for (const p of crest) sh.lineTo(p.x, p.y)
    sh.lineTo(0.38, 0)
    sh.closePath()
    const back = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false, curveSegments: 24 })
    back.translate(0, 0, -0.035)
    const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(WING_CREST.map(([x, y]) => new THREE.Vector3(x, y, 0))), 64, 0.035, 8, false)
    wingGeo = [back, rim] as const
  }
  return wingGeo
}

/**
 * Wicker wing chair (like a tall rattan wingback): a high back with a wavy braided crest, wings that sweep into thick rolled
 * arms, a woven apron with a round medallion in front, wrapped legs and a seat cushion. Frame Item.body, cushion Item.top.
 */
export function WickerWing({ v }: { v: Visual }) {
  const color = v.opts.body ?? '#9c8a78'
  const cushion = v.opts.top ?? '#9d8796'
  const weave = (rx: number, ry: number, turn = false) => patternMaterial('wicker', wickerTexture, color, rx, ry, { turn, roughness: 0.85 })
  const pad = cushion === CUSHION_FLORAL ? patternMaterial('chintz', chintzTexture, '#ffffff', 0.62 / 0.4, 0.6 / 0.4) : mat(cushion, { roughness: 0.95 })
  const [back, crest] = wingBack()
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.026} rTop={0.032} h={0.16} position={[sx * 0.34, 0.08, sz * 0.3]} material={weave(1, 4, true)} segments={10} />))}
      {/* woven base with the apron medallion */}
      <Box size={[0.74, 0.2, 0.66]} position={[0, 0.26, 0.01]} radius={0.03} material={weave(5, 1.5)} />
      <mesh position={[0, 0.25, 0.345]} castShadow material={weave(6, 1, true)}>
        <torusGeometry args={[0.06, 0.016, 8, 20]} />
      </mesh>
      <Box size={[0.62, 0.1, 0.6]} position={[0, 0.41, 0.04]} radius={0.04} material={pad} />
      {/* rolled arms over woven side panels */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[0.08, 0.26, 0.62]} position={[s * 0.36, 0.48, 0.02]} radius={0.03} material={weave(4.5, 2)} />
          <Cyl r={0.065} h={0.66} position={[s * 0.37, 0.62, 0.02]} rotation-x={Math.PI / 2} material={weave(30, 1, true)} segments={16} />
        </group>
      ))}
      {/* wings: rise from the arms to the crest, flaring outward at the front */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.37, 0.62, -0.3]} rotation-y={s * 0.22}>
          <Box size={[0.06, 0.56, 0.36]} position={[0, 0.28, 0.16]} radius={0.025} material={weave(2.5, 4)} />
          <Cyl r={0.04} h={0.56} position={[0, 0.3, 0.33]} rotation-x={0.12} material={weave(1, 25, true)} segments={12} />
        </group>
      ))}
      {/* high back with a braided crest */}
      <group position={[0, 0.36, -0.34]} rotation-x={-0.08}>
        <mesh geometry={back} material={weave(1 / 0.15, 1 / 0.15)} castShadow receiveShadow />
        <mesh geometry={crest} position={[0, 0, 0.02]} material={weave(40, 1, true)} castShadow />
      </group>
    </group>
  )
}

/** Ironing board outline: a square end at +x and a rounded nose at -x (local x, z; meters) */
let boardGeo: THREE.ExtrudeGeometry | null = null
function boardTop() {
  if (!boardGeo) {
    const sh = new THREE.Shape()
    sh.moveTo(0.64, -0.19)
    sh.quadraticCurveTo(0.685, -0.19, 0.685, -0.15)
    sh.lineTo(0.685, 0.15)
    sh.quadraticCurveTo(0.685, 0.19, 0.64, 0.19)
    sh.lineTo(-0.2, 0.19)
    sh.bezierCurveTo(-0.5, 0.19, -0.685, 0.1, -0.685, 0)
    sh.bezierCurveTo(-0.685, -0.1, -0.5, -0.19, -0.2, -0.19)
    sh.closePath()
    boardGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 20 })
    // the shape lies in x, y and is extruded along +z; turned flat its top face is at y 0
    boardGeo.rotateX(Math.PI / 2)
  }
  return boardGeo
}

/** A tube from a to b (local x, y; at a fixed z) */
function Rod({ a, b, z, r, color }: { a: [number, number]; b: [number, number]; z: number; r: number; color: string }) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return <Cyl r={r} h={Math.hypot(dx, dy)} position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z]} rotation-z={-Math.atan2(dx, dy)} color={color} segments={10} />
}

/** Ironing board: height of the board top */
const BOARD_Y = 0.9

/**
 * Ironing board: a padded board with a nose at one end on crossed tube legs with T feet, and an iron standing on its heel at
 * the square end. Cover Item.top (leaf print or plain), frame Item.body. A bound plug or switch is the iron: its light glows
 * red while on.
 */
export function IroningBoard({ v }: { v: Visual }) {
  const cover = v.opts.top ?? COVER_LEAF
  const frame = v.opts.body ?? '#f1f1ef'
  const top = cover === COVER_LEAF ? patternMaterial('leaf-print', leafPrintTexture, '#ffffff', 1 / 0.4, 1 / 0.4) : mat(cover, { roughness: 0.95 })
  const on = v.on && !v.unavailable
  return (
    <group>
      <mesh geometry={boardTop()} position={[0, BOARD_Y, 0]} material={top} castShadow receiveShadow />
      <Box size={[1.1, 0.02, 0.3]} position={[0.05, BOARD_Y - 0.045, 0]} color={shade(frame, 0.9)} shadow={false} />
      {/* crossed legs, one pair on each side, T feet on the floor */}
      {[-0.1, 0.1].map((z) => (
        <group key={z}>
          <Rod a={[-0.32, BOARD_Y - 0.05]} b={[0.3, 0.03]} z={z} r={0.013} color={frame} />
          <Rod a={[0.36, BOARD_Y - 0.05]} b={[-0.36, 0.03]} z={z} r={0.013} color={frame} />
        </group>
      ))}
      {[0.3, -0.36].map((x) => (
        <group key={x}>
          <Cyl r={0.016} h={0.4} position={[x, 0.02, 0]} rotation-x={Math.PI / 2} color={frame} segments={10} />
          {[-0.2, 0.2].map((z) => (
            <Cyl key={z} r={0.02} h={0.03} position={[x, 0.02, z]} rotation-x={Math.PI / 2} color={C.inkSoft} segments={10} shadow={false} />
          ))}
        </group>
      ))}
      <Cyl r={0.014} h={0.24} position={[-0.02, 0.46, 0]} rotation-x={Math.PI / 2} color={frame} segments={10} shadow={false} />
      {/* the iron, standing on its heel */}
      <group position={[0.52, BOARD_Y + 0.01, 0.02]}>
        <Box size={[0.07, 0.25, 0.11]} position={[0, 0.125, 0]} radius={0.03} color="#3a2a30" />
        <Box size={[0.02, 0.26, 0.115]} position={[0.042, 0.13, 0]} radius={0.008} material={steelBright} />
        <Box size={[0.07, 0.04, 0.05]} position={[-0.05, 0.14, 0]} radius={0.015} color="#7a1f2a" />
        <Ball r={0.012} position={[-0.038, 0.05, 0.035]} color={on ? '#ff5a3a' : '#5a4044'} detail={1} shadow={false} />
        {on && <Glow position={[-0.05, 0.05, 0.035]} color="#ff5a3a" opacity={v.night ? 0.9 : 0.5} size={0.12} />}
      </group>
    </group>
  )
}

/**
 * Brick play table (coffee table variant 'lego'): a dark wooden coffee table with a lower shelf, its top covered with
 * glued baseplates (blue with a green plate and a train track loop, baseplateTopTexture). Same footprint and top height as
 * the coffee table, so models on it keep their place.
 */
function LegoTable({ W, D }: { W: number; D: number }) {
  const wood = '#4a2e22'
  const top = useMemo(() => {
    const t = baseplateTopTexture().clone()
    t.repeat.set(1, 0.5)
    t.offset.set(0, 0.5)
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 })
  }, [])
  useEffect(() => () => top.dispose(), [top])
  return (
    <group>
      <Box size={[W, 0.05, D]} position={[0, 0.395, 0]} color={wood} />
      <Box size={[W - 0.02, 0.02, D - 0.02]} position={[0, 0.43, 0]} material={top} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.06, 0.37, 0.06]} position={[sx * (W / 2 - 0.04), 0.185, sz * (D / 2 - 0.04)]} color={wood} />))}
      {[-1, 1].map((s) => (
        <Box key={`a${s}`} size={[W - 0.12, 0.07, 0.025]} position={[0, 0.335, s * (D / 2 - 0.03)]} color={wood} shadow={false} />
      ))}
      <Box size={[W - 0.1, 0.025, D - 0.1]} position={[0, 0.1, 0]} color={wood} />
    </group>
  )
}

/** Scroll (C curl) of round iron bar in the item's local x/y plane, radius r, at (x, y), turning by the sign s */
function Scroll({ x, y, z, r, s, iron }: { x: number; y: number; z: number; r: number; s: number; iron: THREE.Material }) {
  return (
    <mesh position={[x, y, z]} rotation-z={s > 0 ? 0 : Math.PI} material={iron} castShadow>
      <torusGeometry args={[r, 0.008, 6, 20, Math.PI * 1.5]} />
    </mesh>
  )
}

/**
 * Glass and iron tables (coffee table variants): 'glassOval' an oval clear glass top on a bronze iron base with scrolled
 * legs and a ring stretcher; 'glassRect' a taller (0.6 m) rectangular glass end table on scrolled legs with acorn finials.
 */
function GlassTable({ W, D, oval }: { W: number; D: number; oval: boolean }) {
  const iron = mat('#4a4438', { metalness: 0.5, roughness: 0.5 })
  const glass = mat('#cfe3dc', { opacity: 0.28, roughness: 0.05 })
  const H = oval ? 0.44 : 0.6
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  return (
    <group>
      {oval ? (
        <group scale={[W / 2, 1, D / 2]}>
          <Cyl r={1} h={0.012} position={[0, H - 0.006, 0]} material={glass} segments={48} shadow={false} />
          <mesh position={[0, H - 0.04, 0]} rotation-x={Math.PI / 2} material={iron}>
            <torusGeometry args={[0.86, 0.012, 6, 48]} />
          </mesh>
          <mesh position={[0, 0.12, 0]} rotation-x={Math.PI / 2} material={iron}>
            <torusGeometry args={[0.6, 0.012, 6, 48]} />
          </mesh>
        </group>
      ) : (
        <>
          <Box size={[W, 0.012, D]} position={[0, H - 0.006, 0]} material={glass} shadow={false} />
          {[-1, 1].map((s) => (
            <Box key={`a${s}`} size={[W - 0.12, 0.04, 0.025]} position={[0, H - 0.04, s * (D / 2 - 0.06)]} material={iron} />
          ))}
          {[-1, 1].map((s) => (
            <Box key={`b${s}`} size={[0.025, 0.04, D - 0.12]} position={[s * (W / 2 - 0.06), H - 0.04, 0]} material={iron} />
          ))}
        </>
      )}
      {legs.map(([sx, sz]) => {
        const lx = sx * (W / 2 - (oval ? 0.16 : 0.06))
        const lz = sz * (D / 2 - (oval ? 0.1 : 0.06))
        return (
          <group key={`${sx}${sz}`}>
            <Cyl r={0.014} h={H - 0.06} position={[lx, (H - 0.06) / 2, lz]} material={iron} segments={8} />
            <Scroll x={lx - sx * 0.05} y={H - 0.12} z={lz} r={0.05} s={sx} iron={iron} />
            <Scroll x={lx - sx * 0.05} y={0.14} z={lz} r={0.05} s={-sx} iron={iron} />
            {!oval && <Ball r={0.03} position={[lx, H + 0.02, lz]} scale={[1, 1.4, 1]} material={mat('#8a7a52', { metalness: 0.5, roughness: 0.5 })} detail={1} />}
          </group>
        )
      })}
    </group>
  )
}

export function CoffeeTable({ v }: { v: Visual }) {
  // Length Item.len, depth Item.len2 (catalog RESIZABLE, RESIZABLE2); the plain table is drawn at 1.1 × 0.6 m and scaled
  const W = v.opts.len ?? 1.1
  const D = v.opts.len2 ?? 0.6
  if (v.opts.variant === 'lego') return <LegoTable W={W} D={D} />
  if (v.opts.variant === 'glassOval' || v.opts.variant === 'glassRect') return <GlassTable W={W} D={D} oval={v.opts.variant === 'glassOval'} />
  return (
    <group scale={[W / 1.1, 1, D / 0.6]}>
      <Box size={[1.1, 0.07, 0.6]} position={[0, 0.4, 0]} color={C.kraft} radius={0.03} />
      {legs4(1.1, 0.6, 0.37, C.ink, 0.025)}
      <Box size={[0.28, 0.04, 0.2]} position={[-0.25, 0.455, 0.02]} rotation={[0, 0.25, 0]} color={C.coral} />
      <Cyl r={0.05} h={0.1} position={[0.28, 0.485, 0.06]} color={C.white} />
    </group>
  )
}

/** Small round side table: wooden top, single leg, round base, a cup on top. Lamps and diffusers can stand on it. */
/** Hand-painted side table (round table variant 'painted'): a mango wood tray top painted turquoise with birds and flowers, three splayed tapered legs */
function PaintedTable() {
  const wood = mat('#c9a77a', { roughness: 0.7 })
  const top = useMemo(() => new THREE.MeshStandardMaterial({ map: paintedTopTexture(), roughness: 0.5 }), [])
  useEffect(() => () => top.dispose(), [top])
  return (
    <group>
      <Cyl r={0.27} h={0.035} position={[0, 0.45, 0]} material={wood} segments={40} />
      <mesh position={[0, 0.4685, 0]} rotation-x={-Math.PI / 2} material={top}>
        <circleGeometry args={[0.255, 40]} />
      </mesh>
      {[0, 1, 2].map((i) => {
        // Splayed outward: tops close together under the tray (11 cm from the center), feet on a wider triangle (21 cm)
        const a = (i / 3) * Math.PI * 2
        const tilt = Math.atan2(0.1, 0.44)
        return (
          <group key={i} position={[Math.sin(a) * 0.16, 0.22, Math.cos(a) * 0.16]} rotation={[-Math.cos(a) * tilt, 0, Math.sin(a) * tilt]}>
            <Cyl r={0.012} rTop={0.022} h={0.452} material={wood} segments={10} />
          </group>
        )
      })}
    </group>
  )
}

export function RoundTable({ v }: { v: Visual }) {
  if (v.opts.variant === 'painted') return <PaintedTable />
  return (
    <group>
      <Cyl r={0.3} h={0.04} position={[0, 0.45, 0]} color={C.kraft} segments={40} />
      <Cyl r={0.302} h={0.012} position={[0, 0.426, 0]} color={C.kraftDark} segments={40} shadow={false} />
      <Cyl r={0.028} h={0.4} position={[0, 0.22, 0]} color={C.ink} segments={16} />
      <Cyl r={0.15} rTop={0.13} h={0.03} position={[0, 0.015, 0]} color={C.ink} segments={32} />
      <Cyl r={0.04} rTop={0.045} h={0.07} position={[0.1, 0.505, 0.06]} color={C.white} segments={20} />
      <Cyl r={0.06} h={0.006} position={[0.1, 0.473, 0.06]} color={C.coral} segments={24} shadow={false} />
    </group>
  )
}

/** Rug outline in the unit square (0-1; y = 1 is the item's back, -z). Hides have four legs; the sheepskin is a soft blob. */
function rugOutline(shape: string): THREE.Vector2[] {
  const V = (x: number, y: number) => new THREE.Vector2(x, y)
  if (shape === 'round') return Array.from({ length: 96 }, (_, i) => V(0.5 + Math.cos((i / 96) * Math.PI * 2) * 0.5, 0.5 + Math.sin((i / 96) * Math.PI * 2) * 0.5))
  if (shape === 'sheep') {
    return Array.from({ length: 128 }, (_, i) => {
      const a = (i / 128) * Math.PI * 2
      // Slightly wavy edge with four short leg bumps on the diagonals
      const r = 0.9 + 0.035 * Math.sin(3 * a + 0.5) + 0.025 * Math.sin(7 * a + 1.3) + 0.06 * Math.max(0, -Math.cos(4 * a)) ** 6
      return V(0.5 + Math.cos(a) * r * 0.49, 0.5 + Math.sin(a) * r * 0.49)
    })
  }
  if (shape === 'cowhide') {
    // Right half from neck to tail; the left half mirrors it. The centripetal curve does not self-intersect at the pointed legs.
    const half: [number, number][] = [
      [0.5, 0.985], [0.585, 0.965], [0.615, 0.9], [0.7, 0.875], [0.82, 0.92], [0.93, 0.995], [0.985, 0.95], [0.92, 0.84], [0.875, 0.74], [0.895, 0.6],
      [0.88, 0.46], [0.9, 0.34], [0.95, 0.2], [0.995, 0.06], [0.94, 0.015], [0.84, 0.11], [0.72, 0.15], [0.62, 0.1], [0.555, 0.03], [0.5, 0.0],
    ]
    const left = half.slice(1, -1).reverse().map(([x, y]) => [1 - x, y] as [number, number])
    const curve = new THREE.CatmullRomCurve3([...half, ...left].map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal')
    return curve.getSpacedPoints(160).slice(0, -1).map((p) => V(p.x, p.y))
  }
  // Rectangle with slightly rounded corners
  const r = 0.02
  const pts: THREE.Vector2[] = []
  const corners: [number, number, number][] = [[1 - r, 1 - r, 0], [r, 1 - r, Math.PI / 2], [r, r, Math.PI], [1 - r, r, (Math.PI * 3) / 2]]
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= 4; k++) pts.push(V(cx + Math.cos(a0 + (k / 4) * (Math.PI / 2)) * r, cy + Math.sin(a0 + (k / 4) * (Math.PI / 2)) * r))
  return pts
}

/** Rug geometry: the unit outline extruded (puffy edge for the sheepskin), laid flat and centered; built once per shape. */
const rugGeos = new Map<string, THREE.BufferGeometry>()
function rugGeometry(shape: string) {
  const key = shape === 'zebra' ? 'cowhide' : shape
  let g = rugGeos.get(key)
  if (g) return g
  const sheep = key === 'sheep'
  const depth = sheep ? 0.02 : key === 'cowhide' ? 0.005 : 0.012
  const bevel = 0.012
  g = new THREE.ExtrudeGeometry(new THREE.Shape(rugOutline(key)), { depth, bevelEnabled: sheep, bevelThickness: bevel, bevelSize: 0.025, bevelSegments: 3, curveSegments: 4 })
  // UVs come from the outline's 0-1 square (top face); then center, lay flat (thickness up) and lift 1 mm off the floor
  g.translate(-0.5, -0.5, 0)
  g.rotateX(-Math.PI / 2)
  g.translate(0, (sheep ? bevel : 0) + 0.001, 0)
  rugGeos.set(key, g)
  return g
}

/**
 * Rug: shape Item.variant (rectangle, round, cowhide, zebra hide, sheepskin), width Item.len, length Item.len2, color
 * Item.body. The unit outline is scaled to size (round becomes oval when width and length differ); the pattern is drawn
 * at the size's aspect ratio.
 */
export function Rug({ v }: { v: Visual }) {
  const shape = v.opts.variant ?? 'rect'
  const w = v.opts.len ?? CATALOG.rug.size[0]
  const d = v.opts.len2 ?? CATALOG.rug.size[1]
  const color = v.opts.body ?? RUG_DEFAULT[shape] ?? RUG_DEFAULT.rect
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: rugTexture(shape, color, w, d), roughness: shape === 'sheep' ? 1 : 0.9 }), [shape, color, w, d])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={rugGeometry(shape)} material={material} scale={[w, 1, d]} receiveShadow />
}

/* ---------- doormat ---------- */

const matCache = new Map<string, THREE.CanvasTexture>()
/**
 * Doormat texture (Item.variant): coir (fibrous brown, dark border), rubber (anthracite, grid of holes), welcome (text on
 * coir), striped (colored bands). 200 px per meter, so width and length extend the pattern instead of stretching it.
 */
function doormatTexture(kind: string, color: string, w: number, d: number) {
  const key = `${kind}-${color}-${w.toFixed(2)}-${d.toFixed(2)}`
  let tex = matCache.get(key)
  if (tex) return tex
  const P = 200
  const c = document.createElement('canvas')
  c.width = Math.max(32, Math.round(w * P))
  c.height = Math.max(32, Math.round(d * P))
  const g = c.getContext('2d')!
  const W = c.width
  const H = c.height
  let k = 11
  const rnd = () => (k = (k * 9301 + 49297) % 233280) / 233280
  const shadeHex = (hex: string, f: number) => {
    const n = parseInt(hex.slice(1), 16)
    const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
    return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`
  }
  const fibre = (base: string) => {
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < (W * H) / 6; i++) {
      g.fillStyle = shadeHex(color, 0.7 + rnd() * 0.55)
      g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1, 2 + Math.round(rnd() * 3))
    }
  }
  if (kind === 'rubber') {
    g.fillStyle = shadeHex(color === '#b08452' ? '#4a4f5c' : color, 0.75)
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(0, 0, 0, 0.55)'
    const step = 0.06 * P
    for (let y = step; y < H - step / 2; y += step) for (let x = step; x < W - step / 2; x += step) g.fillRect(x - 0.012 * P, y - 0.02 * P, 0.024 * P, 0.04 * P)
  } else if (kind === 'striped') {
    const stripes = [color, shadeHex(color, 1.35), shadeHex(color, 0.7)]
    const sw = 0.07 * P
    for (let x = 0, i = 0; x < W; x += sw, i++) {
      g.fillStyle = stripes[i % 3]
      g.fillRect(x, 0, sw, H)
    }
  } else fibre(shadeHex(color, 0.9))
  // border
  const e = 0.035 * P
  g.strokeStyle = shadeHex(color, 0.45)
  g.lineWidth = e
  g.strokeRect(e / 2, e / 2, W - e, H - e)
  if (kind === 'welcome') {
    g.fillStyle = shadeHex(color, 0.35)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = Math.min(H * 0.32, (W * 0.8) / 7)
    g.font = `800 ${size}px system-ui, sans-serif`
    const text = t('WELCOME')
    while (g.measureText(text).width > W * 0.82 && size > 6) g.font = `800 ${(size *= 0.92)}px system-ui, sans-serif`
    g.fillText(text, W / 2, H / 2)
  }
  tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  matCache.set(key, tex)
  return tex
}

/** Doormat: 1.5 cm thick, adjustable width and length (Item.len, Item.len2); type and color on the card. */
export function Doormat({ v }: { v: Visual }) {
  const w = v.opts.len ?? CATALOG.doormat.size[0]
  const d = v.opts.len2 ?? CATALOG.doormat.size[1]
  const kind = v.opts.variant ?? 'coir'
  const color = v.opts.body ?? (kind === 'rubber' ? '#4a4f5c' : '#b08452')
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: doormatTexture(kind, color, w, d), roughness: kind === 'rubber' ? 0.75 : 1 }), [kind, color, w, d])
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh position={[0, 0.0075, 0]} material={material} receiveShadow>
      <boxGeometry args={[w, 0.015, d]} />
    </mesh>
  )
}

/** State of the LED entity picked on the card (among the extra entities; same rule as bindings.ts > ledSource), else null. */
function pickedLed(v: Visual) {
  const id = v.opts.ledEntity
  const e = id ? v.related.find((x) => x.entity_id === id) : undefined
  return e ? { on: isActive(e), level: Math.max(0.35, lightLevel(e) || 1) * gainOf(v), color: lightColor(e) } : null
}

/** Source of the headboard light (main or extra entity): the one picked on the card, else a light, else a switch whose name looks like a headboard light. */
function headboardLight(v: Visual) {
  const picked = pickedLed(v)
  if (picked) return picked
  const self = v.bound && (v.domain === 'light' || v.domain === 'switch') ? { on: v.on, level: v.level, color: v.color, d: v.domain } : null
  const light = v.related.find((e) => domainOf(e.entity_id) === 'light')
  if (light) return { on: isActive(light), level: Math.max(0.35, lightLevel(light)) * gainOf(v), color: lightColor(light) }
  if (self?.d === 'light') return self
  const sw = v.related.find((e) => domainOf(e.entity_id) === 'switch' && HEADBOARD.test(e.entity_id))
  if (sw) return { on: isActive(sw), level: gainOf(v), color: lightColor(sw) }
  return self
}

/**
 * Bed. Headboard light Item.led: 'strip' is a horizontal LED strip on the front of the headboard below its top edge with a
 * soft halo in front; 'back' is a hidden LED behind the headboard casting a rectangular halo on the wall. It glows while
 * the bound light or plug is on, takes the light's color and also lights the room slightly (roomLights.ts).
 */
/**
 * Bed. Size from Item.len / len2 (catalog.ts > bedModel, BED_SIZES), headboard style from Item.variant: flat (the original
 * look), framed (a wood frame with a crown cap, three dark embossed panels, side rails and a footboard with posts),
 * tufted (an upholstered headboard with buttons) or arched (a curved headboard and a tall curved footboard with carved
 * rosettes and finial posts) or lattice (a frame with four carved see-through panels and a low lattice footboard).
 * Frame color Item.body, bedding Item.top. Back edge at local -d/2.
 */
export function Bed({ v }: { v: Visual }) {
  const src = headboardLight(v)
  // Not chosen: strip if a light is bound; only for a bed in the plan (ghosts and thumbnails have no v.at)
  const mode = v.opts.led ?? (src && v.at ? 'strip' : 'none')
  const on = Boolean(src?.on)
  const color = src?.color ?? '#ffd29a'
  const level = src?.level ?? 1
  const strip = useLitMaterial('#d9dbe6', on, color, level, 2.6)
  const { w, d, style, head, front, stripY, backY } = bedModel(v.opts)
  const back = -d / 2
  const frame = v.opts.body ?? C.kraft
  const headColor = v.opts.body ? shade(v.opts.body, 0.82) : C.kraftDark
  const sheet = v.opts.top ?? C.brandLight
  const pillows = w < 1.3 ? [0] : [-w * 0.235, w * 0.235]
  const pw = w < 1.3 ? 0.6 : Math.min(0.9, w / 2 - 0.25)
  const dd = d * 0.548
  const sw = w - 0.14
  return (
    <group>
      {style === 'framed' ? (
        <FramedBed w={w} d={d} head={head} color={frame} />
      ) : style === 'arched' ? (
        <ArchedBed w={w} d={d} head={head} color={frame} />
      ) : style === 'lattice' ? (
        <LatticeBed w={w} d={d} head={head} color={frame} />
      ) : (
        <>
          <Box size={[w, 0.3, d - 0.05]} position={[0, 0.2, 0]} color={frame} radius={0.04} />
          {style === 'flat' && <Box size={[w, 0.85, 0.08]} position={[0, head - 0.425, back + 0.05]} color={headColor} radius={0.03} />}
          {style === 'tufted' && <TuftedHead w={w} back={back} head={head} color={frame} />}
        </>
      )}
      <Box size={[w - 0.08, 0.2, d - 0.15]} position={[0, 0.44, 0.02]} color={C.white} radius={0.06} />
      {mode === 'strip' && (
        <>
          <Box size={[sw, 0.022, 0.016]} position={[0, stripY, back + front + 0.008]} material={strip} shadow={false} />
          {on && (
            <>
              <StripGlow length={sw} width={0.07} position={[0, stripY, back + front + 0.016]} color={color} opacity={level * (v.night ? 1 : 0.6)} />
              {/* light spreading down the headboard face */}
              <Wash length={w - 0.06} depth={0.62} position={[0, stripY - 0.01 - 0.31, back + front + 0.005]} color={color} opacity={level * (v.night ? 0.75 : 0.36)} />
            </>
          )}
        </>
      )}
      {mode === 'back' && (
        <>
          <Box size={[w - 0.2, 0.02, 0.02]} position={[0, backY, back]} material={strip} shadow={false} />
          {on && (
            <>
              <StripGlow length={w - 0.2} width={0.06} position={[0, backY + 0.02, back]} color={color} opacity={level * (v.night ? 0.9 : 0.48)} />
              {/* light spreading up the wall from behind the headboard */}
              <Wash length={w + 0.4} depth={0.95} position={[0, backY + 0.51, back - 0.014]} rotation={[0, 0, Math.PI]} color={color} opacity={level * (v.night ? 0.8 : 0.4)} />
            </>
          )}
        </>
      )}
      {pillows.map((x) => (
        <Box key={x} size={[pw, 0.12, 0.38]} position={[x, 0.6, back + 0.33]} color={C.offWhite} radius={0.05} />
      ))}
      <Box size={[w - 0.04, 0.06, dd]} position={[0, 0.56, d / 2 - 0.095 - dd / 2]} color={sheet} material={sheet === BED_FLORAL ? floralMaterial(w - 0.04, dd) : undefined} radius={0.03} />
    </group>
  )
}

/** Floral bedding: one material per duvet size (the print repeats about every 60 cm). */
const floralMats = new Map<string, THREE.MeshStandardMaterial>()
function floralMaterial(w: number, d: number) {
  const key = `${w.toFixed(2)}x${d.toFixed(2)}`
  let m = floralMats.get(key)
  if (!m) {
    const map = floralTexture().clone()
    map.repeat.set(w / 0.6, d / 0.6)
    map.needsUpdate = true
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.9 })
    floralMats.set(key, m)
  }
  return m
}

/** Framed bed: posts, crown cap, three embossed panels; side rails, a slat deck and a low footboard with posts. */
function FramedBed({ w, d, head, color }: { w: number; d: number; head: number; color: string }) {
  const back = -d / 2
  const panel = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: shade(color, 0.36), map: medallionTexture(), roughness: 0.55, metalness: 0.15 })
    return m
  }, [color])
  useEffect(() => () => panel.dispose(), [panel])
  const z = back + 0.045
  const inner = w - 0.16
  const stile = 0.06
  const pw = (inner - stile * 2) / 3
  const lo = 0.5
  const hi = head - 0.17
  const foot = d / 2 - 0.045
  return (
    <>
      {/* headboard */}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.08, head - 0.04, 0.08]} position={[s * (w / 2 - 0.04), (head - 0.04) / 2, z]} color={color} radius={0.01} />
      ))}
      <Box size={[w, 0.13, 0.07]} position={[0, head - 0.105, z]} color={color} radius={0.01} />
      <Box size={[w + 0.06, 0.04, 0.11]} position={[0, head - 0.02, z + 0.005]} color={shade(color, 0.92)} radius={0.01} />
      <Box size={[inner, 0.1, 0.07]} position={[0, lo - 0.05, z]} color={color} radius={0.01} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[stile, hi - lo, 0.07]} position={[s * (pw / 2 + stile / 2), (lo + hi) / 2, z]} color={color} radius={0.008} />
      ))}
      {[-1, 0, 1].map((s) => (
        <Box key={s} size={[pw, hi - lo, 0.03]} position={[s * (pw + stile), (lo + hi) / 2, z - 0.005]} material={panel} />
      ))}
      {/* rails and slat deck */}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.05, 0.24, d - 0.17]} position={[s * (w / 2 - 0.025), 0.27, 0.0]} color={color} radius={0.01} />
      ))}
      <Box size={[w - 0.1, 0.04, d - 0.17]} position={[0, 0.32, 0]} color={shade(color, 0.6)} />
      {/* footboard */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (w / 2 - 0.045), 0, foot]}>
          <Box size={[0.09, 0.47, 0.09]} position={[0, 0.335, 0]} color={color} radius={0.01} />
          <Box size={[0.065, 0.1, 0.065]} position={[0, 0.05, 0]} color={color} radius={0.01} />
          <Box size={[0.11, 0.03, 0.11]} position={[0, 0.585, 0]} color={shade(color, 0.92)} radius={0.008} />
        </group>
      ))}
      <Box size={[w - 0.12, 0.3, 0.04]} position={[0, 0.3, d / 2 - 0.03]} color={color} radius={0.01} />
      <Box size={[w - 0.12, 0.035, 0.06]} position={[0, 0.465, d / 2 - 0.035]} color={shade(color, 0.92)} radius={0.008} />
    </>
  )
}

/**
 * Arched board: flat at the bottom, its top edge curving from h at the sides to h + rise in the middle; centered on x,
 * base at y 0, t thick around z 0. One geometry per size.
 */
const archGeos = new Map<string, THREE.ExtrudeGeometry>()
function archGeometry(w: number, h: number, rise: number, t: number) {
  const key = [w, h, rise, t].map((n) => n.toFixed(3)).join(':')
  let g = archGeos.get(key)
  if (!g) {
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0)
    s.lineTo(w / 2, 0)
    s.lineTo(w / 2, h)
    s.quadraticCurveTo(0, h + rise * 2, -w / 2, h)
    s.closePath()
    g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 })
    g.translate(0, 0, -t / 2)
    archGeos.set(key, g)
  }
  return g
}

/** Carved rosette: a center bud with four petals and two leaves, facing +z. */
function Rosette({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <Ball r={0.022} position={[0, 0, 0.01]} color={color} shadow={false} />
      {[0, 1, 2, 3].map((i) => (
        <Ball key={i} r={0.016} position={[Math.cos((i * Math.PI) / 2 + 0.78) * 0.026, Math.sin((i * Math.PI) / 2 + 0.78) * 0.026, 0]} scale={[1, 1, 0.5]} color={color} shadow={false} />
      ))}
      {[-1, 1].map((k) => (
        <Ball key={k} r={0.02} position={[k * 0.06, -0.008, -0.002]} scale={[1.8, 0.6, 0.4]} color={color} shadow={false} />
      ))}
    </group>
  )
}

/** Post with a turned finial: a square post, a cap and a ball on a neck. */
function FinialPost({ h, at, color }: { h: number; at: [number, number, number]; color: string }) {
  return (
    <group position={at}>
      <Box size={[0.065, 0.1, 0.065]} position={[0, 0.05, 0]} color={color} radius={0.01} />
      <Box size={[0.09, h - 0.1, 0.09]} position={[0, 0.1 + (h - 0.1) / 2, 0]} color={color} radius={0.012} />
      <Box size={[0.11, 0.03, 0.11]} position={[0, h + 0.015, 0]} color={color} radius={0.008} />
      <Cyl r={0.022} h={0.04} position={[0, h + 0.05, 0]} color={color} segments={12} />
      <Ball r={0.042} position={[0, h + 0.1, 0]} color={color} />
    </group>
  )
}

/**
 * Arched bed (like a white carved youth bed): finial posts at the four corners, an arched headboard and a tall arched
 * footboard, each with a raised inner panel and a rosette at the top; side rails and a slat deck under the mattress.
 */
function ArchedBed({ w, d, head, color }: { w: number; d: number; head: number; color: string }) {
  const back = -d / 2
  const zh = back + 0.045
  const zf = d / 2 - 0.03
  const pw = w - 0.12
  const trim = shade(color, 0.9)
  const m = mat(color)
  const mi = mat(shade(color, 0.96))
  return (
    <>
      {/* headboard: sides 1.05 m, peak at head */}
      {[-1, 1].map((s) => (
        <FinialPost key={`h${s}`} h={head - 0.2} at={[s * (w / 2 - 0.045), 0, zh]} color={color} />
      ))}
      <mesh geometry={archGeometry(pw, head - 0.55, 0.25, 0.04)} material={m} position={[0, 0.3, zh]} castShadow receiveShadow />
      <mesh geometry={archGeometry(pw - 0.24, head - 0.85, 0.2, 0.012)} material={mi} position={[0, 0.48, zh + 0.028]} receiveShadow />
      <Rosette position={[0, head - 0.07, zh + 0.03]} color={trim} />
      {/* rails and slat deck */}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.05, 0.24, d - 0.17]} position={[s * (w / 2 - 0.025), 0.27, 0]} color={color} radius={0.01} />
      ))}
      <Box size={[w - 0.1, 0.04, d - 0.17]} position={[0, 0.32, 0]} color={shade(color, 0.75)} />
      {/* footboard: sides 0.82 m, peak 0.94 m */}
      {[-1, 1].map((s) => (
        <FinialPost key={`f${s}`} h={0.92} at={[s * (w / 2 - 0.045), 0, d / 2 - 0.045]} color={color} />
      ))}
      <mesh geometry={archGeometry(pw, 0.62, 0.12, 0.035)} material={m} position={[0, 0.2, zf]} castShadow receiveShadow />
      <mesh geometry={archGeometry(pw - 0.2, 0.4, 0.09, 0.012)} material={mi} position={[0, 0.3, zf + 0.022]} receiveShadow />
      <Rosette position={[0, 0.86, zf + 0.025]} color={trim} />
    </>
  )
}

/**
 * Twin loft bed (like a white youth low loft): square posts, slatted ends with a raised center panel and an arched cap
 * (head end taller), the deck at about 0.92 m with open space below, a guard rail on the ladder side from the head to
 * the ladder, and a ladder near the foot. Item.variant: ladder on the 'right' (default) or 'left' side, as seen from the
 * foot. Frame color Item.body, bedding Item.top. Head end at local -z; the footprint includes the ladder.
 */
export function LoftBed({ v }: { v: Visual }) {
  const s = v.opts.variant === 'left' ? -1 : 1
  const [W, d] = CATALOG.loftBed.size
  const fw = 1.07
  const fx = -s * (W - fw) / 2
  const color = v.opts.body ?? '#f3f1ec'
  const sheet = v.opts.top ?? '#f6f4ef'
  const deck = 0.92
  const top = deck + 0.18
  const ladderZ = d / 2 - 0.55
  const guardFrom = -d / 2 + 0.1
  const guardTo = ladderZ - 0.22
  const dd = d * 0.6
  return (
    <group>
      <LoftEnd z={-d / 2 + 0.04} x={fx} w={fw} h={1.68} deck={deck} color={color} />
      <LoftEnd z={d / 2 - 0.04} x={fx} w={fw} h={1.42} deck={deck} color={color} />
      {/* side rails and slat deck */}
      {[-1, 1].map((k) => (
        <Box key={k} size={[0.04, 0.14, d - 0.16]} position={[fx + k * (fw / 2 - 0.04), deck - 0.07, 0]} color={color} radius={0.008} />
      ))}
      <Box size={[fw - 0.12, 0.03, d - 0.16]} position={[fx, deck - 0.03, 0]} color={shade(color, 0.8)} />
      {/* stretcher under the deck on the wall side */}
      <Box size={[0.04, 0.08, d - 0.16]} position={[fx - s * (fw / 2 - 0.04), 0.55, 0]} color={color} radius={0.008} />
      {/* guard rail: two boards between end posts */}
      {[guardFrom + 0.025, guardTo - 0.025].map((z) => (
        <Box key={z} size={[0.03, 0.42, 0.05]} position={[fx + s * (fw / 2 - 0.02), deck + 0.21, z]} color={color} radius={0.006} />
      ))}
      {[deck + 0.24, deck + 0.38].map((y) => (
        <Box key={y} size={[0.025, 0.07, guardTo - guardFrom]} position={[fx + s * (fw / 2 - 0.005), y, (guardFrom + guardTo) / 2]} color={color} radius={0.006} />
      ))}
      {/* ladder: two rails up to grab height, three rungs */}
      {[-1, 1].map((k) => (
        <Box key={k} size={[0.045, 1.42, 0.05]} position={[s * (W / 2 - 0.0225), 0.71, ladderZ + k * 0.19]} color={color} radius={0.008} />
      ))}
      {[0.3, 0.6, deck + 0.06].map((y) => (
        <Box key={y} size={[0.04, 0.035, 0.34]} position={[s * (W / 2 - 0.025), y, ladderZ]} color={color} radius={0.006} />
      ))}
      {/* mattress, pillow, duvet */}
      <Box size={[fw - 0.12, 0.18, d - 0.18]} position={[fx, deck + 0.09, 0]} color={C.white} radius={0.05} />
      <Box size={[0.6, 0.11, 0.36]} position={[fx, top + 0.05, -d / 2 + 0.3]} color={C.offWhite} radius={0.05} />
      <Box size={[fw - 0.1, 0.05, dd]} position={[fx, top + 0.02, d / 2 - 0.1 - dd / 2]} color={sheet} material={sheet === BED_FLORAL ? floralMaterial(fw - 0.1, dd) : undefined} radius={0.025} />
    </group>
  )
}

/**
 * Daybed with a pull-out (like a white beadboard daybed with three drawers): a beadboard back along the long side and two
 * arms, a twin mattress, and a pull-out in front whose face has three drawers. Item.len2 is the depth: closed (1.05 m) or
 * pulled out into a king (DAYBED_DEPTH), where the pull-out rises with a second mattress. Frame color Item.body, bedding
 * Item.top. Back at local -z.
 */
export function Daybed({ v }: { v: Visual }) {
  const [L, d] = sizeOf('daybed', v.opts.len, v.opts.len2)
  const back = -d / 2
  const color = v.opts.body ?? '#f3f1ec'
  const sheet = v.opts.top ?? '#f6f4ef'
  const king = d > 1.5
  const armD = 1.05
  const mw = L - 0.12
  const md = 0.95
  const deckY = 0.3
  const front = back + d
  const bb = (w: number, h: number) => beadboardMaterial(color, w, h)
  const lit = shade(color, 0.86)
  const bedD = king ? d - 0.06 : md
  return (
    <group>
      {/* back: beadboard panel between posts, with a top rail */}
      <Box size={[L - 0.1, 0.62, 0.03]} position={[0, 0.5, back + 0.03]} material={bb(L - 0.1, 0.62)} />
      <Box size={[L, 0.05, 0.07]} position={[0, 0.81, back + 0.035]} color={color} radius={0.01} />
      <Box size={[L - 0.1, 0.12, 0.04]} position={[0, 0.13, back + 0.03]} color={color} />
      {/* arms: beadboard panels from the back to the front posts */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (L / 2 - 0.035), 0, 0]}>
          <Box size={[0.07, 0.8, 0.07]} position={[0, 0.4, back + 0.035]} color={color} radius={0.01} />
          <Box size={[0.07, 0.76, 0.07]} position={[0, 0.38, back + armD - 0.035]} color={color} radius={0.01} />
          <Box size={[0.03, 0.5, armD - 0.14]} position={[0, 0.5, back + armD / 2]} material={bb(armD - 0.14, 0.5)} />
          <Box size={[0.08, 0.05, armD]} position={[0, 0.765, back + armD / 2]} color={color} radius={0.01} />
          <Box size={[0.05, 0.12, armD - 0.14]} position={[0, 0.17, back + armD / 2]} color={color} />
        </group>
      ))}
      {/* upper deck and mattress */}
      <Box size={[L - 0.14, 0.06, armD - 0.1]} position={[0, deckY - 0.03, back + 0.05 + (armD - 0.1) / 2]} color={lit} />
      <Box size={[mw, 0.16, md]} position={[0, deckY + 0.08, back + 0.05 + md / 2]} color={C.white} radius={0.04} />
      {/* pull-out: closed it sits under the deck with its drawer face flush with the arms; pulled out it carries the second mattress */}
      {king && (
        <>
          <Box size={[L - 0.14, 0.06, d - armD]} position={[0, deckY - 0.03, back + armD + (d - armD) / 2 - 0.02]} color={lit} />
          <Box size={[mw, 0.16, md]} position={[0, deckY + 0.08, back + 0.05 + md + md / 2 - 0.01]} color={C.white} radius={0.04} />
        </>
      )}
      <Box size={[L - 0.16, king ? 0.27 : 0.25, 0.03]} position={[0, king ? 0.135 : 0.14, front - 0.035]} color={color} />
      {[-1, 0, 1].map((k) => {
        const fw = (L - 0.24) / 3
        return (
          <group key={k} position={[k * (fw + 0.02), king ? 0.135 : 0.14, front - 0.015]}>
            <Box size={[fw, 0.2, 0.012]} position={[0, 0, 0]} color={shade(color, 0.97)} radius={0.004} />
            <Cyl r={0.012} h={0.02} position={[0, 0.03, 0.012]} rotation={[Math.PI / 2, 0, 0]} color={shade(color, 0.7)} segments={10} />
          </group>
        )
      })}
      {/* bedding and a pillow at the left arm */}
      <Box size={[mw - 0.02, 0.04, bedD - 0.04]} position={[0, deckY + 0.18, back + 0.05 + bedD / 2]} color={sheet} material={sheet === BED_FLORAL ? floralMaterial(mw - 0.02, bedD - 0.04) : undefined} radius={0.02} />
      <Box size={[0.38, 0.11, king ? 0.8 : 0.6]} position={[-L / 2 + 0.3, deckY + 0.25, back + 0.05 + (king ? bedD / 2 : md / 2)]} color={C.offWhite} radius={0.05} />
    </group>
  )
}

/** Beadboard material: one per color and panel size (a groove about every 8 cm). */
const beadboardMats = new Map<string, THREE.MeshStandardMaterial>()
function beadboardMaterial(color: string, w: number, h: number) {
  const key = `${color}:${w.toFixed(2)}:${h.toFixed(2)}`
  let m = beadboardMats.get(key)
  if (!m) {
    const map = beadboardTexture().clone()
    map.repeat.set(w / 0.32, Math.max(1, h / 0.32))
    map.needsUpdate = true
    m = new THREE.MeshStandardMaterial({ color, map, roughness: 0.75 })
    beadboardMats.set(key, m)
  }
  return m
}

/** One end of the loft bed: corner posts, an arched cap, slats with a raised center panel above the deck, a rail below. */
function LoftEnd({ z, x, w, h, deck, color }: { z: number; x: number; w: number; h: number; deck: number; color: string }) {
  const m = mat(color)
  const panelH = h - 0.12 - deck
  return (
    <group position={[x, 0, z]}>
      {[-1, 1].map((k) => (
        <Box key={k} size={[0.075, h - 0.04, 0.075]} position={[k * (w / 2 - 0.0375), (h - 0.04) / 2, 0]} color={color} radius={0.01} />
      ))}
      <mesh geometry={archGeometry(w - 0.02, 0.08, 0.04, 0.045)} material={m} position={[0, h - 0.12, 0]} castShadow receiveShadow />
      <Box size={[w - 0.1, 0.1, 0.04]} position={[0, deck - 0.02, 0]} color={color} radius={0.008} />
      {[-0.36, -0.22, 0.22, 0.36].map((sx) => (
        <Box key={sx} size={[0.055, panelH, 0.025]} position={[sx * (w / 1.07), deck + panelH / 2, 0]} color={color} radius={0.005} />
      ))}
      <Box size={[0.22, panelH, 0.03]} position={[0, deck + panelH / 2, 0]} color={color} radius={0.006} />
      {[-1, 1].map((k) => (
        <Box key={k} size={[0.13, Math.min(0.15, panelH - 0.1), 0.012]} position={[0, deck + panelH / 2, k * 0.02]} color={shade(color, 0.95)} radius={0.004} shadow={false} />
      ))}
    </group>
  )
}

/** Carved lattice panel material: one per color and panel size, the carving repeating about every 38 cm. */
const latticeMats = new Map<string, THREE.MeshStandardMaterial>()
function latticeMaterial(color: string, w: number, h: number) {
  const rx = Math.max(1, Math.round(w / 0.38))
  const ry = Math.max(1, Math.round(h / 0.38))
  const key = `${color}:${rx}:${ry}`
  let m = latticeMats.get(key)
  if (!m) {
    const map = latticeTexture().clone()
    map.repeat.set(rx, ry)
    map.needsUpdate = true
    m = new THREE.MeshStandardMaterial({ color, map, alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide })
    latticeMats.set(key, m)
  }
  return m
}

/**
 * Lattice bed (like a carved whitewashed wood bed): posts, a capped top rail, a middle rail and a center stile framing four
 * see-through carved panels; side rails, a slat deck and a low footboard with a lattice band between two rails.
 */
function LatticeBed({ w, d, head, color }: { w: number; d: number; head: number; color: string }) {
  const back = -d / 2
  const z = back + 0.045
  const inner = w - 0.16
  const lo = 0.5
  const hi = head - 0.16
  const mid = lo + (hi - lo) * 0.42
  const pw = (inner - 0.06) / 2
  const ft = d / 2 - 0.032
  return (
    <>
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.08, head - 0.04, 0.08]} position={[s * (w / 2 - 0.04), (head - 0.04) / 2, z]} color={color} radius={0.01} />
      ))}
      <Box size={[w, 0.12, 0.07]} position={[0, head - 0.1, z]} color={color} radius={0.01} />
      <Box size={[w + 0.04, 0.035, 0.09]} position={[0, head - 0.018, z + 0.005]} color={shade(color, 0.95)} radius={0.008} />
      <Box size={[inner, 0.1, 0.07]} position={[0, lo - 0.05, z]} color={color} radius={0.01} />
      <Box size={[inner, 0.07, 0.07]} position={[0, mid, z]} color={color} radius={0.008} />
      <Box size={[0.06, hi - lo, 0.07]} position={[0, (lo + hi) / 2, z]} color={color} radius={0.008} />
      {[-1, 1].flatMap((s) =>
        [
          [lo, mid - 0.035],
          [mid + 0.035, hi],
        ].map(([y0, y1]) => <Box key={`${s}${y0}`} size={[pw, y1 - y0, 0.025]} position={[s * (pw / 2 + 0.03), (y0 + y1) / 2, z]} material={latticeMaterial(color, pw, y1 - y0)} />),
      )}
      {/* rails and slat deck */}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.05, 0.24, d - 0.16]} position={[s * (w / 2 - 0.025), 0.27, 0]} color={color} radius={0.01} />
      ))}
      <Box size={[w - 0.1, 0.04, d - 0.16]} position={[0, 0.32, 0]} color={shade(color, 0.7)} />
      {/* footboard */}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.085, 0.52, 0.085]} position={[s * (w / 2 - 0.0425), 0.26, ft]} color={color} radius={0.01} />
      ))}
      <Box size={[w - 0.1, 0.05, 0.045]} position={[0, 0.475, ft]} color={color} radius={0.008} />
      <Box size={[w - 0.1, 0.06, 0.045]} position={[0, 0.15, ft]} color={color} radius={0.008} />
      <Box size={[0.05, 0.27, 0.05]} position={[0, 0.315, ft]} color={color} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[(w - 0.22) / 2, 0.27, 0.022]} position={[s * ((w - 0.22) / 4 + 0.025), 0.315, ft]} material={latticeMaterial(color, (w - 0.22) / 2, 0.27)} />
      ))}
    </>
  )
}

/** Upholstered headboard: a padded panel on two legs, buttons in a diamond grid. */
function TuftedHead({ w, back, head, color }: { w: number; back: number; head: number; color: string }) {
  const h = head - 0.3
  const cols = Math.max(4, Math.round(w / 0.24))
  const buttons: [number, number][] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < cols - (r % 2); c++) buttons.push([(c - (cols - 1 - (r % 2)) / 2) * ((w - 0.2) / (cols - 1)), head - 0.18 - r * 0.17])
  }
  const dark = shade(color, 0.7)
  return (
    <>
      <Box size={[w + 0.04, h, 0.12]} position={[0, head - h / 2, back + 0.07]} color={color} radius={0.05} />
      {buttons.map(([x, y]) => (
        <Ball key={`${x}-${y}`} r={0.012} position={[x, y, back + 0.13]} color={dark} shadow={false} />
      ))}
    </>
  )
}

export function Nightstand({ v }: { v: Visual }) {
  // Lower compartment, drawer on top (model/containers.ts: 0 lower compartment, 1 drawer). Item.variant 'lattice' closes
  // the compartment with a carved lattice door; Item.body colors the whole piece (unset: the original white and pale blue).
  const body = v.opts.body
  const color = body ?? C.white
  return (
    <group>
      <Carcass w={0.45} h={0.48} d={0.4} color={color} shelves={[0.27]} />
      <Drawer w={0.41} h={0.17} d={0.36} at={[0, 0.365, -0.01]} open={partOpen(v, 1)} color={body ? shade(body, 0.96) : C.brandPale} />
      {v.opts.variant === 'lattice' && (
        <SwingDoor w={0.41} h={0.23} at={[0, 0.15, 0.209]} hinge="l" open={partOpen(v, 0)} color={color} material={latticeMaterial(color, 0.41, 0.23)} handle={0.05} />
      )}
    </group>
  )
}

/** Narrow console table (sofa or bed-end table): top, apron, four legs and a low shelf. Length Item.len, colors top / body. */
export function ConsoleTable({ v }: { v: Visual }) {
  const [, d] = CATALOG.consoleTable.size
  const len = v.opts.len ?? CATALOG.consoleTable.size[0]
  const top = v.opts.top ?? '#6b4a34'
  const body = v.opts.body ?? '#6b4a34'
  return (
    <group>
      <Box size={[len, 0.035, d]} position={[0, 0.7425, 0]} color={top} radius={0.008} />
      <Box size={[len - 0.06, 0.08, d - 0.06]} position={[0, 0.685, 0]} color={body} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} size={[0.045, 0.725, 0.045]} position={[sx * (len / 2 - 0.04), 0.3625, sz * (d / 2 - 0.04)]} color={body} />))}
      <Box size={[len - 0.1, 0.025, d - 0.06]} position={[0, 0.18, 0]} color={top} />
    </group>
  )
}

/** Two-door wardrobe: carcass and door colors are selectable (v.opts.body / top). */
export function Wardrobe({ v }: { v: Visual }) {
  const body = v.opts.body ?? C.white
  const door = v.opts.top ?? C.sunPale
  const open = v.open ?? 0
  return (
    <group>
      <Carcass w={1.4} h={2.1} d={0.6} color={body} shelves={[0.6, 1.6]} />
      {/* hanging rail */}
      <Cyl r={0.012} h={1.34} position={[0, 1.5, 0]} rotation={[0, 0, Math.PI / 2]} color={C.steel} segments={10} shadow={false} />
      <SwingDoor w={0.69} h={2.06} at={[-0.35, 1.05, 0.309]} hinge="l" open={open} color={door} />
      <SwingDoor w={0.69} h={2.06} at={[0.35, 1.05, 0.309]} hinge="r" open={open} color={door} />
    </group>
  )
}

/**
 * Dresser with mirror: wide three-drawer body, top in a separate color, framed mirror leaning on the wall at the back.
 * Lamps and pots can stand on the top (surface at 0.81 m). With a light or plug bound, the mirror frame glows.
 */
export function Dresser({ v }: { v: Visual }) {
  const body = v.opts.body ?? C.white
  const top = v.opts.top ?? '#dcb98c'
  const glow = useLitMaterial(C.white, v.on, v.on ? v.color : C.white, v.level || 1, 1.4)
  const mirror = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dfe8f5', metalness: 0.75, roughness: 0.08, emissive: '#cfdcf0', emissiveIntensity: 0.15 }), [])
  return (
    <group>
      {[-0.44, 0.44].flatMap((x) => [-0.17, 0.17].map((z) => <Cyl key={`${x}${z}`} r={0.018} h={0.06} position={[x, 0.03, z]} color={C.ink} segments={10} shadow={false} />))}
      <group position={[0, 0.06, 0]}>
        <Drawers w={1} h={0.72} d={0.45} color={body} n={3} v={v} />
      </group>
      <Box size={[1.02, 0.025, 0.47]} position={[0, 0.795, 0]} color={top} radius={0.008} />
      {/* mirror: at the back, resting on the top */}
      <Box size={[0.78, 0.82, 0.03]} position={[0, 1.235, -0.19]} material={v.bound && v.on ? glow : mat(body)} radius={0.02} />
      <mesh position={[0, 1.235, -0.173]} material={mirror}>
        <planeGeometry args={[0.68, 0.72]} />
      </mesh>
    </group>
  )
}

/**
 * Mirror cabinet: wall-hung, 60 × 70 cm, two mirrored doors; above the washbasin (center at 1.5 m).
 * With a light bound, the strip on its bottom edge glows and lights the washbasin.
 */
export function MirrorCabinet({ v }: { v: Visual }) {
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dfe8f5', metalness: 0.75, roughness: 0.08, emissive: '#cfdcf0', emissiveIntensity: 0.15 }), [])
  const strip = useLitMaterial(C.offWhite, v.on, v.on ? v.color : C.white, v.level || 1, 1.6)
  return (
    <group>
      <Box size={[0.6, 0.7, 0.14]} position={[0, 1.5, -0.01]} color={v.opts.body ?? C.white} radius={0.015} />
      <mesh material={glass} position={[-0.148, 1.5, 0.0625]}>
        <planeGeometry args={[0.285, 0.66]} />
      </mesh>
      <mesh material={glass} position={[0.148, 1.5, 0.0625]}>
        <planeGeometry args={[0.285, 0.66]} />
      </mesh>
      <Box size={[0.56, 0.016, 0.03]} position={[0, 1.145, 0.03]} material={strip} shadow={false} />
      {v.on && (
        <>
          <StripGlow length={0.56} width={0.05} position={[0, 1.14, 0.04]} color={v.color} opacity={v.level * (v.night ? 0.85 : 0.4)} />
          {/* wall face at local z -0.09: spreads down the wall and onto the washbasin from below the cabinet */}
          <Wash length={0.72} depth={0.7} position={[0, 1.14 - 0.35, -0.086]} color={v.color} opacity={v.level * (v.night ? 0.5 : 0.22)} />
        </>
      )}
    </group>
  )
}

/** Laundry basket: wicker style box, lid ajar, a piece of laundry sticking out. */
export function LaundryBasket() {
  return (
    <group>
      <Box size={[0.45, 0.55, 0.35]} position={[0, 0.275, 0]} color={C.kraft} radius={0.04} />
      {[0.14, 0.27, 0.4].map((y) => (
        <Box key={y} size={[0.455, 0.02, 0.355]} position={[0, y, 0]} color={C.kraftDark} shadow={false} />
      ))}
      <Box size={[0.2, 0.08, 0.14]} position={[0.08, 0.57, 0.02]} rotation={[0.2, 0.3, 0.1]} color={C.coral} radius={0.03} shadow={false} />
      <Box size={[0.46, 0.03, 0.36]} position={[-0.02, 0.6, -0.04]} rotation={[-0.35, 0, 0]} color={C.kraftDark} radius={0.01} />
    </group>
  )
}

/** Trash bin: pedal bin, stainless body, white lid. */
export function TrashBin() {
  return (
    <group>
      <Cyl r={0.14} rTop={0.15} h={0.42} position={[0, 0.21, 0]} color={C.steel} segments={24} />
      <Cyl r={0.155} h={0.035} position={[0, 0.437, 0]} color={C.white} segments={24} />
      <Box size={[0.1, 0.02, 0.06]} position={[0, 0.03, 0.15]} color={C.ink} />
    </group>
  )
}

/** Single-door wardrobe (60 cm): the door is hinged on the right, handle on the left. Colors as for the two-door wardrobe. */
export function WardrobeSingle({ v }: { v: Visual }) {
  const body = v.opts.body ?? C.white
  const door = v.opts.top ?? C.sunPale
  return (
    <group>
      <Carcass w={0.6} h={2.1} d={0.6} color={body} shelves={[0.53]} />
      <SwingDoor w={0.59} h={2.06} at={[0, 1.05, 0.309]} hinge="r" open={v.open ?? 0} color={door} />
    </group>
  )
}

/**
 * Shower enclosure 90 × 90: square (glass at the front and side, sliding door line at the corner) or round (quarter circle
 * curved glass). Stands against the back wall (-z) and the left side wall; with v.hingeRight against the right wall
 * (mirrored). The shower head is on the back wall, not the ceiling.
 */
export function Shower({ v }: { v: Visual }) {
  const round = v.opts.shape === 'round'
  const S = 0.9
  const H = 1.95
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#dff1ff', transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    [],
  )
  const tray = mat(C.white, { roughness: 0.4 })
  const frame = C.steel
  return (
    <group scale-x={v.hingeRight ? -1 : 1}>
      {round ? (
        <>
          {/* quarter circle tray and curved glass: corner at (-S/2, -S/2), arc from the front to the right */}
          <mesh position={[-S / 2, 0.03, -S / 2]} material={tray} castShadow receiveShadow>
            <cylinderGeometry args={[S, S, 0.06, 32, 1, false, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[-S / 2, 0.06 + H / 2, -S / 2]} material={glass} renderOrder={4}>
            <cylinderGeometry args={[S - 0.02, S - 0.02, H, 32, 1, true, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[-S / 2, 0.06 + H, -S / 2]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[S - 0.02, 0.012, 6, 32, Math.PI / 2]} />
            <meshStandardMaterial color={frame} roughness={0.4} />
          </mesh>
        </>
      ) : (
        <>
          <Box size={[S, 0.06, S]} position={[0, 0.03, 0]} material={tray} />
          {/* front and right glass, thin frame, corner post */}
          <mesh position={[0, 0.06 + H / 2, S / 2 - 0.01]} material={glass} renderOrder={4}>
            <boxGeometry args={[S, H, 0.012]} />
          </mesh>
          <mesh position={[S / 2 - 0.01, 0.06 + H / 2, 0]} material={glass} renderOrder={4}>
            <boxGeometry args={[0.012, H, S]} />
          </mesh>
          <Box size={[0.025, H, 0.025]} position={[S / 2 - 0.01, 0.06 + H / 2, S / 2 - 0.01]} color={frame} shadow={false} />
          <Box size={[S, 0.02, 0.02]} position={[0, 0.06 + H, S / 2 - 0.01]} color={frame} shadow={false} />
          <Box size={[0.02, 0.02, S]} position={[S / 2 - 0.01, 0.06 + H, 0]} color={frame} shadow={false} />
          <Box size={[0.012, H - 0.1, 0.02]} position={[0.02, 0.06 + H / 2, S / 2]} color={frame} shadow={false} />
        </>
      )}
      {/* drain, mixer, riser pipe and head (on the back wall) */}
      <Cyl r={0.04} h={0.004} position={[-S / 2 + 0.3, 0.062, -S / 2 + 0.3]} color={C.steel} segments={16} shadow={false} />
      <Box size={[0.14, 0.06, 0.05]} position={[-S / 2 + 0.3, 1.05, -S / 2 + 0.03]} color={C.steel} />
      <Cyl r={0.012} h={1.0} position={[-S / 2 + 0.3, 1.55, -S / 2 + 0.03]} color={C.steel} segments={8} />
      <Cyl r={0.09} h={0.02} position={[-S / 2 + 0.3, 2.05, -S / 2 + 0.12]} rotation={[0.35, 0, 0]} color={C.steel} segments={20} />
    </group>
  )
}

/** Chest of drawers: hollow, the drawers slide (compartments 0, 1, 2... from the bottom up). */
function Drawers({ w, h, d, color, n, v }: { w: number; h: number; d: number; color: string; n: number; v: Visual }) {
  const dh = (h - 0.04) / n
  return (
    <group>
      <Carcass w={w} h={h} d={d} color={color} />
      {Array.from({ length: n }, (_, i) => (
        <Drawer key={i} w={w - 0.03} h={dh - 0.016} d={d - 0.04} at={[0, 0.02 + dh * (i + 0.5), -0.01]} open={partOpen(v, i)} color={color} />
      ))}
    </group>
  )
}

/** Drawer pedestal: a box with drawer fronts and handles (front faces +z). */
function DrawerStack({ x, w, h, d, color, n = 3 }: { x: number; w: number; h: number; d: number; color: string; n?: number }) {
  const dh = (h - 0.04) / n
  return (
    <group position={[x, 0, 0]}>
      <Box size={[w, h, d]} position={[0, h / 2, 0]} color={color} radius={0.012} />
      {Array.from({ length: n }, (_, i) => {
        const y = 0.02 + dh * (i + 0.5)
        return (
          <group key={i}>
            <Box size={[w - 0.03, dh - 0.016, 0.012]} position={[0, y, d / 2 + 0.004]} color={color} shadow={false} />
            <Box size={[w * 0.36, 0.014, 0.018]} position={[0, y + dh * 0.22, d / 2 + 0.014]} color={C.steel} shadow={false} />
          </group>
        )
      })}
    </group>
  )
}

/**
 * Desk: adjustable length (v.opts.len), selectable top and body colors, optional drawer pedestal on the left, right or
 * both sides (left and right as seen by the person sitting at the desk; desk front is +z).
 */
export function Desk({ v }: { v: Visual }) {
  const L = v.opts.len ?? 1.4
  const D = 0.7
  const top = v.opts.top ?? C.white
  const legs = v.opts.body ?? C.ink
  const drawerColor = v.opts.body ?? C.white
  const dr = v.opts.drawers ?? 'none'
  const PED = 0.42
  return (
    <group>
      <Box size={[L, 0.05, D]} position={[0, 0.725, 0]} color={top} radius={0.02} />
      {([-1, 1] as const).map((sgn) => {
        const has = dr === 'both' || (dr === 'left' && sgn < 0) || (dr === 'right' && sgn > 0)
        return has ? (
          <DrawerStack key={sgn} x={sgn * (L / 2 - PED / 2 - 0.02)} w={PED} h={0.7} d={D - 0.06} color={drawerColor} />
        ) : (
          <Box key={sgn} size={[0.05, 0.7, D - 0.04]} position={[sgn * (L / 2 - 0.04), 0.35, 0]} color={legs} />
        )
      })}
    </group>
  )
}

/** Drawer unit (like a rolling pedestal): four drawers, top in a separate color. Fits under a desk. */
export function DrawerUnit({ v }: { v: Visual }) {
  return (
    <group>
      <Drawers w={0.42} h={0.69} d={0.5} color={v.opts.body ?? C.white} n={4} v={v} />
      <Box size={[0.42, 0.025, 0.5]} position={[0, 0.7, 0]} color={v.opts.top ?? v.opts.body ?? C.white} radius={0.008} />
    </group>
  )
}

/** Folding bistro chair (chair variant 'bistro'): black metal X frame, weathered wooden seat and back slats */
function BistroChair() {
  const iron = '#1d1e22'
  const wood = '#9a8b78'
  return (
    <group>
      {[-0.2, 0.2].map((x) => (
        <group key={x}>
          <Box size={[0.02, 0.86, 0.02]} position={[x, 0.43, 0.02]} rotation-x={0.22} color={iron} />
          <Box size={[0.02, 0.5, 0.02]} position={[x, 0.24, -0.02]} rotation-x={-0.35} color={iron} />
        </group>
      ))}
      {[-0.15, -0.05, 0.05, 0.15].map((z) => (
        <Box key={z} size={[0.42, 0.018, 0.085]} position={[0, 0.45, z + 0.03]} color={wood} />
      ))}
      {[0.66, 0.78].map((y) => (
        <Box key={y} size={[0.4, 0.07, 0.016]} position={[0, y, -0.15]} rotation-x={0.22} color={wood} />
      ))}
    </group>
  )
}

/** Embroidered folding chair (chair variant 'embroidered'): pale wood X frame, a peach embroidered back with a bird, a lime seat with pink dashes, lilac piping */
function EmbroideredChair() {
  const wood = mat('#d8c39e', { roughness: 0.7 })
  const back = useMemo(() => new THREE.MeshStandardMaterial({ map: embroideredBackTexture(), roughness: 0.9 }), [])
  const seat = useMemo(() => new THREE.MeshStandardMaterial({ map: dashSeatTexture(), roughness: 0.9 }), [])
  useEffect(() => () => {
    back.dispose()
    seat.dispose()
  }, [back, seat])
  return (
    <group>
      {[-0.22, 0.22].map((x) => (
        <group key={x}>
          <Box size={[0.035, 0.9, 0.035]} position={[x, 0.45, -0.04]} rotation-x={-0.28} material={wood} />
          <Box size={[0.03, 0.5, 0.03]} position={[x, 0.22, 0.04]} rotation-x={0.5} material={wood} />
        </group>
      ))}
      <Box size={[0.4, 0.03, 0.03]} position={[0, 0.12, 0.14]} material={wood} />
      <Box size={[0.48, 0.05, 0.42]} position={[0, 0.43, 0.04]} material={wood} />
      <Box size={[0.42, 0.07, 0.4]} position={[0, 0.48, 0.04]} material={seat} radius={0.02} />
      <group position={[0, 0.74, -0.15]} rotation-x={-0.28}>
        <Box size={[0.42, 0.42, 0.06]} material={back} radius={0.02} />
        {[-1, 1].map((s) => (
          <Box key={s} size={[0.012, 0.42, 0.065]} position={[s * 0.215, 0, 0]} color="#b9a6d2" shadow={false} />
        ))}
      </group>
    </group>
  )
}

/* ---------- carved dining set ---------- */

const woods = new Map<string, THREE.MeshStandardMaterial>()
function sharedWood(color: string, roughness: number) {
  let m = woods.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, map: woodGrainTexture(), roughness })
    woods.set(color, m)
  }
  return m
}
let seatFabric: THREE.MeshStandardMaterial | null = null

/** Lattice of the carved chair back: four bowed bars crossing into pointed ovals, built once (0 at the seat). */
let latticeGeo: THREE.BufferGeometry | null = null
function chairLattice() {
  if (latticeGeo) return latticeGeo
  const bars = [-0.16, -0.055, 0.055, 0.16].map((x0) => {
    const bow = Math.abs(x0) < 0.1 ? Math.sign(x0) * 0.075 : -Math.sign(x0) * 0.06
    const pts = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8
      return new THREE.Vector3(x0 + bow * Math.sin(Math.PI * t), 0.16 + t * 0.33, 0)
    })
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.011, 6)
  })
  latticeGeo = mergeGeometries(bars)
  bars.forEach((g) => g.dispose())
  return latticeGeo
}

/**
 * Carved dining chair (chair variant 'carved'): honey-toned wood, fluted tapered front legs, raked back legs, a seat in a
 * gold diamond weave, a tall back with a carved leaf top rail, rosettes on the post tops and a lattice of bowed bars.
 */
function CarvedChair() {
  const wood = sharedWood('#9b5f2c', 0.55)
  seatFabric ??= new THREE.MeshStandardMaterial({ map: diamondFabricTexture(), roughness: 0.9 })
  return (
    <group>
      {[-0.2, 0.2].map((x) => (
        <group key={x}>
          <Cyl r={0.017} rTop={0.024} h={0.43} position={[x, 0.215, 0.19]} material={wood} segments={10} />
          <Cyl r={0.027} h={0.04} position={[x, 0.4, 0.19]} material={wood} segments={10} shadow={false} />
          <Box size={[0.035, 0.45, 0.04]} position={[x, 0.22, -0.2]} rotation-x={0.12} material={wood} />
        </group>
      ))}
      <Box size={[0.47, 0.07, 0.44]} position={[0, 0.43, 0]} material={wood} />
      <Box size={[0.49, 0.075, 0.46]} position={[0, 0.495, 0.01]} material={seatFabric} radius={0.03} />
      <group position={[0, 0.46, -0.215]} rotation-x={-0.1}>
        {[-1, 1].map((sx) => (
          <group key={sx}>
            <Box size={[0.04, 0.62, 0.035]} position={[sx * 0.205, 0.31, 0]} material={wood} />
            <Cyl r={0.03} h={0.05} position={[sx * 0.215, 0.6, -0.01]} rotation-z={Math.PI / 2} material={wood} segments={14} />
          </group>
        ))}
        <Box size={[0.42, 0.11, 0.04]} position={[0, 0.55, 0]} material={wood} />
        {Array.from({ length: 9 }, (_, i) => (
          <Box key={i} size={[0.02, 0.055, 0.012]} position={[-0.16 + i * 0.04, 0.55, 0.022]} color="#7d4a20" shadow={false} />
        ))}
        <Box size={[0.4, 0.035, 0.03]} position={[0, 0.15, 0]} material={wood} />
        <mesh geometry={chairLattice()} material={wood} castShadow />
      </group>
    </group>
  )
}

/** Keyboard bench (chair variant 'keyboardBench'): black padded seat on two crossed steel legs with T feet, 48 cm high. */
function KeyboardBench() {
  const steel = mat('#1d1f24', { roughness: 0.5, metalness: 0.4 })
  return (
    <group>
      {[-0.22, 0.22].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-1, 1].map((s) => (
            <Box key={s} size={[0.025, 0.52, 0.03]} position={[0, 0.23, 0]} rotation-x={s * 0.62} material={steel} />
          ))}
          {[-1, 1].map((s) => (
            <Box key={s} size={[0.04, 0.03, 0.06]} position={[0, 0.015, s * 0.14]} material={steel} />
          ))}
        </group>
      ))}
      <Box size={[0.44, 0.025, 0.025]} position={[0, 0.23, 0]} material={steel} />
      <Box size={[0.56, 0.03, 0.26]} position={[0, 0.425, 0]} material={steel} />
      <Box size={[0.6, 0.06, 0.3]} position={[0, 0.47, 0]} color="#15161a" radius={0.025} />
    </group>
  )
}

/** Top outline of the pedestal table: a rectangle whose corners are cut by concave quarter circles. */
function notchedTop(L: number, D: number, r: number, depth: number) {
  const s = new THREE.Shape()
  const x = L / 2
  const z = D / 2
  s.moveTo(-x + r, -z)
  s.lineTo(x - r, -z)
  s.absarc(x, -z, r, Math.PI, Math.PI / 2, true)
  s.lineTo(x, z - r)
  s.absarc(x, z, r, -Math.PI / 2, -Math.PI, true)
  s.lineTo(-x + r, z)
  s.absarc(-x, z, r, 0, -Math.PI / 2, true)
  s.lineTo(-x, -z + r)
  s.absarc(-x, -z, r, Math.PI / 2, 0, true)
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 })
  g.rotateX(Math.PI / 2)
  // wood grain across the top: uv from x and z
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.2, p.getZ(i) / 1.2)
  return g
}
const tops = new Map<string, THREE.BufferGeometry>()

/**
 * Pedestal dining table (diningTable variant 'pedestal'): an Item.len × Item.len2 top (default 1.85 × 1.0) with concave
 * notched corners, a darker inlaid field and a molded apron, on two pedestals of three carved columns each (in a row across
 * the table) on shaped plinths. Walnut, no cloth.
 */
function PedestalTable({ L, D }: { L: number; D: number }) {
  const key = `${L.toFixed(2)}x${D.toFixed(2)}`
  let top = tops.get(key)
  if (!top) {
    top = notchedTop(L, D, 0.1, 0.035)
    tops.set(key, top)
  }
  const wood = sharedWood('#8a5428', 0.4)
  const dark = sharedWood('#5e3519', 0.45)
  const px = L / 2 - Math.min(0.45, L * 0.24)
  const cols = [-0.24, 0, 0.24].map((z) => z * Math.min(1, D))
  return (
    <group>
      <mesh geometry={top} position={[0, 0.79, 0]} material={wood} castShadow receiveShadow />
      <Box size={[L - 0.36, 0.002, D - 0.3]} position={[0, 0.7995, 0]} material={dark} shadow={false} />
      <Box size={[L - 0.16, 0.08, D - 0.14]} position={[0, 0.71, 0]} material={wood} />
      <Box size={[L - 0.2, 0.025, D - 0.18]} position={[0, 0.66, 0]} material={dark} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * px, 0, 0]}>
          <Box size={[0.16, 0.06, D * 0.72]} position={[0, 0.62, 0]} material={wood} />
          {cols.map((z) => (
            <group key={z} position={[0, 0, z]}>
              <Cyl r={0.06} h={0.08} position={[0, 0.55, 0]} material={wood} segments={12} />
              <Cyl r={0.045} rTop={0.06} h={0.06} position={[0, 0.48, 0]} material={dark} segments={12} />
              <Cyl r={0.042} h={0.3} position={[0, 0.3, 0]} material={wood} segments={12} />
              <Cyl r={0.05} h={0.05} position={[0, 0.2, 0]} material={dark} segments={12} />
              <Cyl r={0.055} rTop={0.045} h={0.06} position={[0, 0.14, 0]} material={wood} segments={12} />
            </group>
          ))}
          <Box size={[0.26, 0.05, D * 0.78]} position={[0, 0.085, 0]} material={wood} radius={0.02} />
          <Box size={[0.32, 0.06, D * 0.86]} position={[0, 0.03, 0]} material={dark} radius={0.025} />
        </group>
      ))}
    </group>
  )
}

export function Chair({ v }: { v: Visual }) {
  if (v.opts.variant === 'bistro') return <BistroChair />
  if (v.opts.variant === 'embroidered') return <EmbroideredChair />
  if (v.opts.variant === 'carved') return <CarvedChair />
  if (v.opts.variant === 'keyboardBench') return <KeyboardBench />
  if (v.opts.variant === 'barStool') return <BarStool />
  return (
    <group>
      {legs4(0.44, 0.44, 0.44, C.ink, 0.022)}
      <Box size={[0.5, 0.06, 0.5]} position={[0, 0.46, 0]} color={C.sun} radius={0.03} />
      <Box size={[0.5, 0.48, 0.05]} position={[0, 0.74, -0.22]} color={C.sun} radius={0.03} />
    </group>
  )
}

export function DiningTable({ v }: { v: Visual }) {
  if (v.opts.variant === 'pedestal') return <PedestalTable L={v.opts.len ?? 1.85} D={v.opts.len2 ?? 1} />
  return (
    <group>
      <Box size={[1.4, 0.06, 0.85]} position={[0, 0.75, 0]} color={C.white} radius={0.03} />
      {legs4(1.4, 0.85, 0.72, C.kraft, 0.03)}
      <Cyl r={0.08} rTop={0.16} h={0.08} position={[0, 0.82, 0]} color={C.brandPale} />
      <Ball r={0.055} position={[0.02, 0.88, 0.02]} color={C.sun} />
      <Ball r={0.05} position={[-0.06, 0.87, -0.03]} color={C.coral} />
    </group>
  )
}

/**
 * Counter run: base cabinets with doors, countertop, wall cabinets; optional LED.
 * Local: length along x, front faces +z, back against the wall. LED "under": below the wall cabinets, lights the counter;
 * "plinth": in the plinth, lights the floor.
 */
function CounterRun({ len, top, body, door, led, lit, v, uppers = true, sinkAt }: { len: number; top: string; body: string; door: string; led: NonNullable<Visual['opts']['led']>; lit: THREE.Material; v: Visual; uppers?: boolean; sinkAt?: number }) {
  const n = Math.max(1, Math.round(len / 0.5))
  const dw = len / n
  const fronts = Array.from({ length: n }, (_, i) => -len / 2 + dw * (i + 0.5))
  // Base cabinet: plinth, hollow carcass with a shelf, hinged doors; wall cabinet likewise (compartments 0-1 base, 2-3 wall)
  const lower = Math.max(partOpen(v, 0), partOpen(v, 1))
  const upper = Math.max(partOpen(v, 2), partOpen(v, 3))
  return (
    <group>
      <Box size={[len, 0.08, 0.52]} position={[0, 0.04, -0.04]} color={shade(body, 0.8)} />
      <Carcass w={len} h={0.78} d={0.6} y={0.08} color={body} shelves={[0.37]} top={sinkAt == null} />
      {fronts.map((x, i) => (
        <SwingDoor key={x} w={dw - 0.012} h={0.74} at={[x, 0.47, 0.309]} hinge={i % 2 ? 'r' : 'l'} open={lower} color={door} handle={0.14} />
      ))}
      <CounterTop len={len + 0.02} color={top} sinkAt={sinkAt} />
      {uppers && <Carcass w={len} h={0.6} d={0.34} y={1.65} z={-0.13} color={body} shelves={[0.3]} />}
      {uppers &&
        fronts.map((x, i) => (
          <SwingDoor key={x} w={dw - 0.012} h={0.58} at={[x, 1.95, 0.049]} hinge={i % 2 ? 'r' : 'l'} open={upper} color={door} handle={0.14} />
        ))}
      {led === 'under' && uppers && (
        <>
          <Box size={[len - 0.04, 0.012, 0.02]} position={[0, 1.643, 0.0]} material={lit} shadow={false} />
          {v.on && (
            <>
              <StripGlow length={len - 0.04} width={0.05} position={[0, 1.636, 0.0]} color={v.color} opacity={v.level * (v.night ? 1 : 0.6)} />
              {/* counter surface: bright at the back (by the wall), fading towards the front */}
              <Wash length={len} depth={0.6} position={[0, 0.913, 0]} rotation={[-Math.PI / 2, 0, 0]} color={v.color} opacity={v.level * (v.night ? 0.8 : 0.4)} />
              {/* backsplash: from below the wall cabinets down to the counter */}
              <Wash length={len} depth={0.72} position={[0, 1.643 - 0.36, -0.316]} color={v.color} opacity={v.level * (v.night ? 0.72 : 0.34)} />
            </>
          )}
        </>
      )}
      {led === 'plinth' && (
        <>
          <Box size={[len - 0.04, 0.012, 0.012]} position={[0, 0.03, 0.27]} material={lit} shadow={false} />
          {v.on && (
            <>
              <StripGlow length={len - 0.04} width={0.04} position={[0, 0.03, 0.28]} color={v.color} opacity={v.level * (v.night ? 1 : 0.55)} />
              {/* floor: fading forward from the cabinet base */}
              <Wash length={len} depth={0.5} position={[0, 0.004, 0.27 + 0.25]} rotation={[-Math.PI / 2, 0, 0]} color={v.color} opacity={v.level * (v.night ? 0.8 : 0.4)} />
            </>
          )}
        </>
      )}
    </group>
  )
}

/* ---------- counter run laid out with fronts (Item.fronts) ---------- */

const BRONZE = '#3b342e'
/** Raised panel front: a flat frame and a raised center panel, slightly lighter. */
function PanelFront({ x, y, w, h, color, z = 0.309 }: { x: number; y: number; w: number; h: number; color: string; z?: number }) {
  return (
    <group position={[x, y, z]}>
      <Box size={[w, h, 0.02]} color={color} shadow={false} />
      {w > 0.16 && h > 0.14 && <Box size={[w - 0.11, h - 0.11, 0.012]} position={[0, 0, 0.014]} color={shade(color, 1.07)} shadow={false} />}
    </group>
  )
}
/** Cup pull (drawers) and round knob (doors), oil-rubbed bronze */
const Cup = ({ x, y, z = 0.335 }: { x: number; y: number; z?: number }) => (
  <Cyl r={0.02} h={0.075} position={[x, y, z]} rotation-z={Math.PI / 2} color={BRONZE} segments={10} shadow={false} />
)
const Knob = ({ x, y, z = 0.335 }: { x: number; y: number; z?: number }) => <Ball r={0.015} position={[x, y, z]} color={BRONZE} detail={1} shadow={false} />

/** One base cabinet front between x0 and x1 (body from 0.1 to 0.86 m). */
function BaseFront({ f, color }: { f: CounterFront; color: string }) {
  const w = f.x1 - f.x0 - 0.008
  const x = (f.x0 + f.x1) / 2
  const top = 0.855
  const bottom = 0.11
  const H = top - bottom
  const drawerH = 0.17
  switch (f.kind) {
    case 'dw':
    case 'range':
      return null
    case 'corner':
      return <Box size={[w + 0.008, H, 0.02]} position={[x, bottom + H / 2, 0.305]} color={shade(color, 0.92)} shadow={false} />
    case 'door':
    case 'spice':
      return (
        <>
          <PanelFront x={x} y={bottom + H / 2} w={w} h={H} color={color} />
          <Knob x={f.kind === 'spice' ? x : x + w / 2 - 0.05} y={top - 0.07} />
        </>
      )
    case 'doors':
      return (
        <>
          {[-1, 1].map((s) => (
            <group key={s}>
              <PanelFront x={x + (s * w) / 4} y={bottom + H / 2} w={w / 2 - 0.004} h={H} color={color} />
              <Knob x={x + s * 0.04} y={top - 0.07} />
            </group>
          ))}
        </>
      )
    case 'drawer':
    case 'trash':
    case 'sink': {
      const dh = H - drawerH - 0.006
      return (
        <>
          <PanelFront x={x} y={top - drawerH / 2} w={w} h={drawerH} color={color} />
          {f.kind !== 'sink' && <Cup x={x} y={top - drawerH / 2} />}
          {f.kind === 'sink' ? (
            [-1, 1].map((s) => (
              <group key={s}>
                <PanelFront x={x + (s * w) / 4} y={bottom + dh / 2} w={w / 2 - 0.004} h={dh} color={color} />
                <Knob x={x + s * 0.04} y={bottom + dh - 0.07} />
              </group>
            ))
          ) : (
            <>
              <PanelFront x={x} y={bottom + dh / 2} w={w} h={dh} color={color} />
              {f.kind === 'trash' ? <Knob x={x} y={bottom + dh - 0.06} /> : <Knob x={x + w / 2 - 0.05} y={bottom + dh - 0.07} />}
            </>
          )}
        </>
      )
    }
    case 'drawers': {
      const hs = [0.18, (H - 0.18) / 2, (H - 0.18) / 2]
      let y = top
      return (
        <>
          {hs.map((h, i) => {
            const cy = y - h / 2
            y -= h
            return (
              <group key={i}>
                <PanelFront x={x} y={cy} w={w} h={h - 0.006} color={color} />
                <Cup x={x} y={i ? cy + h / 2 - 0.07 : cy} />
              </group>
            )
          })}
        </>
      )
    }
  }
}

/** Contiguous stretches of fronts not interrupted by the given kinds: [x0, x1] pairs. */
function stretches(fronts: CounterFront[], cut: (f: CounterFront) => boolean) {
  const out: [number, number][] = []
  let start: number | null = null
  fronts.forEach((f, i) => {
    if (!cut(f) && start == null) start = f.x0
    if (start != null && !cut(f) && (i === fronts.length - 1 || cut(fronts[i + 1]))) {
      out.push([start, f.x1])
      start = null
    }
  })
  return out
}

/**
 * Counter run laid out with fronts (Item.fronts, model/counter.ts): raised panel doors and drawers with bronze cup pulls
 * and knobs in the given order; appliance gaps hold a separate dishwasher or range (no cabinet; over a range no worktop
 * either, and the wall cabinet above it is a short one over the microwave). uppers false leaves the wall cabinets out;
 * bar adds a worktop overhang at the back over a beadboard back panel, for bar stools.
 */
function LaidRun({ len, fronts, top, body, sinkAt, uppers, bar }: { len: number; fronts: CounterFront[]; top: string; body: string; sinkAt?: number; uppers: boolean; bar: number }) {
  const boxes = stretches(fronts, (f) => isGap(f.kind))
  const tops = stretches(fronts, (f) => f.kind === 'range')
  const back = useMemo(() => {
    if (!bar) return null
    const map = beadboardTexture().clone()
    map.needsUpdate = true
    map.repeat.set(len / 0.6, 1)
    return new THREE.MeshStandardMaterial({ map, color: body, roughness: 0.6 })
  }, [bar, len, body])
  useEffect(() => () => back?.dispose(), [back])
  const upperDoors = (x0: number, x1: number, y: number, h: number) => {
    const n = Math.max(1, Math.round((x1 - x0) / 0.45))
    const dw = (x1 - x0) / n
    return Array.from({ length: n }, (_, i) => {
      const cx = x0 + dw * (i + 0.5)
      return (
        <group key={`${x0}-${i}`}>
          <PanelFront x={cx} y={y + h / 2} w={dw - 0.01} h={h - 0.01} color={body} z={0.05} />
          <Knob x={cx + (i % 2 ? -1 : 1) * (dw / 2 - 0.05)} y={y + 0.07} z={0.075} />
        </group>
      )
    })
  }
  return (
    <group>
      {boxes.map(([a, b]) => (
        <group key={`c${a}`} position={[(a + b) / 2, 0, 0]}>
          <Box size={[b - a, 0.1, 0.52]} position={[0, 0.05, -0.04]} color={shade(body, 0.7)} />
          <Carcass w={b - a} h={0.77} d={0.6} y={0.09} color={body} shelves={[0.37]} top={false} />
        </group>
      ))}
      {fronts.map((f) => (
        <BaseFront key={`f${f.x0}`} f={f} color={body} />
      ))}
      {tops.map(([a, b]) => (
        <group key={`t${a}`} position={[(a + b) / 2, 0, 0]}>
          <CounterTop len={b - a + (a <= -len / 2 + 0.001 || b >= len / 2 - 0.001 ? 0.01 : 0)} color={top} sinkAt={sinkAt != null && sinkAt > a && sinkAt < b ? sinkAt - (a + b) / 2 : undefined} />
        </group>
      ))}
      {bar > 0 && back && (
        <>
          <Box size={[len + 0.02, 0.05, bar]} position={[0, 0.885, -0.31 - bar / 2]} color={top} />
          <mesh position={[0, 0.45, -0.31]} material={back} castShadow receiveShadow>
            <boxGeometry args={[len, 0.86, 0.02]} />
          </mesh>
          {[-1, 1].map((s) => (
            <Box key={s} size={[0.02, 0.86, 0.62]} position={[s * (len / 2 - 0.01), 0.45, 0]} color={body} />
          ))}
        </>
      )}
      {uppers &&
        fronts.map((f) => {
          const short = f.kind === 'range'
          const y = short ? 1.98 : 1.6
          const h = 2.3 - y
          return (
            <group key={`u${f.x0}`}>
              <group position={[(f.x0 + f.x1) / 2, 0, 0]}>
                <Carcass w={f.x1 - f.x0} h={h} d={0.34} y={y} z={-0.13} color={body} shelves={short ? [] : [0.3]} />
              </group>
              {upperDoors(f.x0, f.x1, y, h)}
            </group>
          )
        })}
      {uppers && (
        <>
          <Box size={[len + 0.04, 0.06, 0.4]} position={[0, 2.33, -0.11]} color={shade(body, 0.85)} />
          <Box size={[len + 0.02, 0.025, 0.37]} position={[0, 2.3, -0.12]} color="#2b2420" shadow={false} />
        </>
      )}
    </group>
  )
}

/**
 * Kitchen counter: adjustable length (v.opts.len); the L variants (left or right corner) add a second run along the side
 * wall (len2: total length of that run from the corner). Counter and cabinet colors are selectable. With a light bound, the
 * LED follows that light.
 */
export function KitchenCounter({ v }: { v: Visual }) {
  const L = v.opts.len ?? 2
  const D = 0.6
  const top = v.opts.top ?? C.offWhite
  const body = v.opts.body ?? C.white
  const door = v.opts.body ? v.opts.body : C.brandPale
  const led = v.opts.led ?? 'none'
  // The LED follows the entity picked on the card, else the counter's main entity
  const picked = pickedLed(v)
  const lv: Visual = picked ? { ...v, on: picked.on, color: picked.color, level: picked.level } : v
  const lit = useLitMaterial(C.offWhite, lv.on, lv.color, lv.level || 1, 2)
  const variant = v.opts.variant ?? 'straight'
  const isL = variant === 'lLeft' || variant === 'lRight'
  const leg = Math.max(D + 0.2, v.opts.len2 ?? 1.8)
  const sx = variant === 'lRight' ? 1 : -1
  const run = { top, body, door, led, lit, v: lv }
  const laid = variant === 'straight' ? counterFronts(v.opts.fronts, L) : null
  if (laid) return <LaidRun len={L} fronts={laid} top={top} body={body} sinkAt={v.opts.sinkAt} uppers={v.opts.uppers !== false} bar={v.opts.bar ?? 0} />
  return (
    <group>
      <CounterRun len={L} {...run} sinkAt={v.opts.sinkAt} uppers={v.opts.uppers !== false} />
      {isL && (
        // Run along the side wall: starts after the corner square, its front faces into the room (towards the opposite corner).
        <group position={[sx * (L / 2 - D / 2), 0, D / 2 + (leg - D) / 2]} rotation-y={sx > 0 ? -Math.PI / 2 : Math.PI / 2}>
          {/* No wall cabinets on this run: there may be no side wall (it can reach into the room like a peninsula). */}
          <CounterRun len={leg - D} {...run} uppers={false} led={led === 'under' ? 'none' : led} />
        </group>
      )}
    </group>
  )
}

export function Fridge() {
  return (
    <group>
      <Box size={[0.74, 1.9, 0.68]} position={[0, 0.95, 0]} color={C.white} radius={0.05} />
      <Box size={[0.75, 0.02, 0.02]} position={[0, 1.28, 0.34]} color={C.steel} shadow={false} />
      <Box size={[0.03, 0.36, 0.04]} position={[0.28, 1.55, 0.36]} color={C.steel} />
      <Box size={[0.03, 0.44, 0.04]} position={[0.28, 0.9, 0.36]} color={C.steel} />
    </group>
  )
}

/**
 * Slide-in range (stove variant 'range'): stainless, 76 cm, flush with the worktop. Black glass cooktop with four burner
 * rings, a front control strip with knobs and a display, an oven door with a window and a bar handle, a storage drawer at
 * the bottom. No hood: an over-the-range microwave above it does that job.
 */
function SlideInRange() {
  const steel = mat('#c9ccd2', { metalness: 0.55, roughness: 0.32 })
  return (
    <group>
      <Box size={[0.76, 0.82, 0.6]} position={[0, 0.43, -0.01]} material={steel} />
      <Box size={[0.76, 0.014, 0.63]} position={[0, 0.912, 0]} color="#101114" />
      {[
        [-0.18, -0.12, 0.1],
        [0.18, -0.12, 0.08],
        [-0.18, 0.14, 0.08],
        [0.18, 0.14, 0.1],
      ].map(([x, z, r]) => (
        <mesh key={`${x}${z}`} position={[x, 0.9205, z]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[r - 0.008, r, 32]} />
          <meshStandardMaterial color="#4a4d55" roughness={0.4} />
        </mesh>
      ))}
      <Box size={[0.74, 0.09, 0.03]} position={[0, 0.85, 0.3]} color="#2a2c33" shadow={false} />
      {[-0.3, -0.2, 0.2, 0.3].map((x) => (
        <Cyl key={x} r={0.02} h={0.025} position={[x, 0.85, 0.322]} rotation-x={Math.PI / 2} material={steel} segments={14} shadow={false} />
      ))}
      <Box size={[0.2, 0.04, 0.004]} position={[0, 0.85, 0.317]} color="#14161c" shadow={false} />
      <Box size={[0.72, 0.52, 0.02]} position={[0, 0.5, 0.3]} material={steel} shadow={false} />
      <Box size={[0.5, 0.26, 0.006]} position={[0, 0.48, 0.312]} color="#15171c" shadow={false} />
      <Cyl r={0.013} h={0.64} position={[0, 0.73, 0.345]} rotation-z={Math.PI / 2} material={steel} segments={10} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.02, 0.02, 0.04]} position={[s * 0.3, 0.73, 0.325]} material={steel} shadow={false} />
      ))}
      <Box size={[0.72, 0.15, 0.02]} position={[0, 0.14, 0.3]} material={steel} shadow={false} />
      <Cyl r={0.01} h={0.5} position={[0, 0.19, 0.325]} rotation-z={Math.PI / 2} material={steel} segments={10} />
      <Box size={[0.76, 0.05, 0.5]} position={[0, 0.025, -0.04]} color="#202227" />
    </group>
  )
}

/**
 * Swivel bar stool (chair variant 'barStool'): espresso wood, four splayed legs with a ring footrest, a round black padded
 * seat at 76 cm and a ladder back of two curved slats.
 */
function BarStool() {
  const wood = mat('#3a2418', { roughness: 0.55 })
  const footring = useMemo(() => new THREE.TorusGeometry(0.2, 0.014, 8, 36).rotateX(Math.PI / 2), [])
  useEffect(() => () => footring.dispose(), [footring])
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Box key={`${sx}${sz}`} size={[0.038, 0.74, 0.038]} position={[sx * 0.165, 0.37, sz * 0.165]} rotation={[sz * -0.07, 0, sx * 0.07]} material={wood} />
        )),
      )}
      <mesh geometry={footring} position={[0, 0.28, 0]} material={wood} castShadow />
      <Cyl r={0.2} h={0.04} position={[0, 0.725, 0]} material={wood} segments={28} />
      <Cyl r={0.205} rTop={0.19} h={0.07} position={[0, 0.78, 0]} color="#141416" segments={28} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.035, 0.36, 0.035]} position={[s * 0.15, 0.96, -0.17]} rotation-x={-0.1} material={wood} />
      ))}
      {[0.93, 1.08].map((y) => (
        <Box key={y} size={[0.34, 0.065, 0.025]} position={[0, y, -0.18 - (y - 0.93) * 0.1]} rotation-x={-0.1} material={wood} />
      ))}
    </group>
  )
}

export function Stove({ v }: { v: Visual }) {
  if (v.opts.variant === 'range') return <SlideInRange />
  return (
    <group>
      <Box size={[0.74, 0.86, 0.6]} position={[0, 0.43, 0]} color={C.white} />
      <Box size={[0.76, 0.04, 0.62]} position={[0, 0.88, 0]} color={C.ink} />
      {[-0.16, 0.16].flatMap((x) => [-0.13, 0.13].map((z) => <Cyl key={`${x}${z}`} r={0.09} h={0.012} position={[x, 0.905, z]} color={C.inkSoft} shadow={false} />))}
      <Box size={[0.6, 0.42, 0.02]} position={[0, 0.42, 0.305]} color={C.ink} shadow={false} />
      <Box size={[0.76, 0.12, 0.48]} position={[0, 1.82, -0.06]} color={C.steel} />
      <Box size={[0.28, 0.68, 0.26]} position={[0, 2.22, -0.16]} color={C.steel} />
    </group>
  )
}

/** Sink cabinet: plinth, two-door base cabinet, inset steel bowl and gooseneck faucet (CounterTop). */
export function Sink() {
  return (
    <group>
      <Box size={[1, 0.08, 0.52]} position={[0, 0.04, -0.04]} color={shade(C.white, 0.8)} />
      <Carcass w={1} h={0.78} d={0.6} y={0.08} color={C.white} top={false} />
      <SwingDoor w={0.49} h={0.74} at={[-0.25, 0.47, 0.309]} hinge="l" open={0} color={C.brandPale} handle={0.14} />
      <SwingDoor w={0.49} h={0.74} at={[0.25, 0.47, 0.309]} hinge="r" open={0} color={C.brandPale} handle={0.14} />
      <CounterTop len={1.02} color={C.offWhite} sinkAt={0} />
    </group>
  )
}

export function Bathtub() {
  return (
    <group>
      <Box size={[1.6, 0.55, 0.75]} position={[0, 0.275, 0]} color={C.white} radius={0.08} />
      <Box size={[1.4, 0.02, 0.56]} position={[0, 0.555, 0]} material={mat('#bfe0ff', { roughness: 0.15 })} shadow={false} />
      <Cyl r={0.02} h={0.2} position={[-0.7, 0.68, -0.3]} color={C.steel} />
    </group>
  )
}

export function Toilet() {
  return (
    <group>
      <Box size={[0.38, 0.36, 0.16]} position={[0, 0.55, -0.24]} color={C.white} radius={0.04} />
      <Cyl r={0.17} rTop={0.19} h={0.4} position={[0, 0.2, 0.05]} color={C.white} />
      <Cyl r={0.2} h={0.03} position={[0, 0.415, 0.05]} color={C.offWhite} />
    </group>
  )
}

export function Washbasin() {
  return (
    <group>
      <Box size={[0.6, 0.5, 0.42]} position={[0, 0.55, 0]} color={C.white} radius={0.03} />
      <Box size={[0.42, 0.02, 0.28]} position={[0, 0.81, 0.02]} color={C.steel} shadow={false} />
      <Cyl r={0.018} h={0.18} position={[0, 0.88, -0.15]} color={C.steel} />
    </group>
  )
}

export function ShoeCabinet({ v }: { v: Visual }) {
  const open = v.open ?? 0
  return (
    <group>
      <Carcass w={1} h={0.9} d={0.35} color={C.white} shelves={[0.44]} />
      <SwingDoor w={0.49} h={0.86} at={[-0.25, 0.45, 0.184]} hinge="l" open={open} color={C.sunPale} handle={0.16} />
      <SwingDoor w={0.49} h={0.86} at={[0.25, 0.45, 0.184]} hinge="r" open={open} color={C.sunPale} handle={0.16} />
      <Cyl r={0.07} h={0.18} position={[0.3, 0.99, 0]} color={C.terracotta} />
      <Ball r={0.1} position={[0.3, 1.13, 0]} color={C.leaf} flat detail={1} />
    </group>
  )
}

export function Bookshelf() {
  const books = useMemo(() => {
    const rand = rng(11)
    const out: { x: number; y: number; w: number; h: number; color: string }[] = []
    for (const base of [0.05, 0.55, 1.05, 1.55]) {
      let x = -0.54
      while (x < 0.5) {
        const w = 0.05 + rand() * 0.06
        if (rand() < 0.12) {
          x += w * 1.6
          continue
        }
        const h = 0.24 + rand() * 0.16
        out.push({ x: x + w / 2, y: base + h / 2, w, h, color: BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)] })
        x += w + 0.008
      }
    }
    return out
  }, [])
  return (
    <group>
      <Box size={[0.05, 2, 0.35]} position={[-0.6, 1, 0]} color={C.white} />
      <Box size={[0.05, 2, 0.35]} position={[0.6, 1, 0]} color={C.white} />
      <Box size={[1.25, 0.05, 0.35]} position={[0, 1.975, 0]} color={C.white} />
      <Box size={[1.25, 0.05, 0.35]} position={[0, 0.025, 0]} color={C.white} />
      <Box size={[1.25, 2, 0.02]} position={[0, 1, -0.165]} color={C.brandPale} />
      {[0.52, 1.02, 1.52].map((y) => (
        <Box key={y} size={[1.15, 0.035, 0.32]} position={[0, y, 0]} color={C.white} />
      ))}
      {books.map((b, i) => (
        <Box key={i} size={[b.w, b.h, 0.24]} position={[b.x, b.y, 0.02]} color={b.color} shadow={false} />
      ))}
    </group>
  )
}

/** Cane plant (Item.variant 'cane', like a corn plant dracaena): two ringed trunks in a glazed teal pot, arching leaf rosettes */
function CanePlant() {
  const leaf = mat('#3f8f3a', { roughness: 0.6 })
  const light = mat('#6bb04a', { roughness: 0.6 })
  const head = (y: number, x: number, n: number, seed: number) => {
    const r = rng(seed)
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + r() * 0.4
      const tilt = 0.5 + r() * 0.7
      const len = 0.38 + r() * 0.2
      return (
        <group key={i} position={[x, y, 0]} rotation-y={a}>
          <group rotation-z={-tilt}>
            <Box size={[0.07, len, 0.008]} position={[0, len / 2, 0]} material={i % 3 ? leaf : light} shadow={false} />
          </group>
        </group>
      )
    })
  }
  return (
    <group>
      <Cyl r={0.2} rTop={0.19} h={0.06} position={[0, 0.03, 0]} color="#21524f" segments={24} />
      <Cyl r={0.21} rTop={0.24} h={0.34} position={[0, 0.23, 0]} material={mat('#2e6f6a', { roughness: 0.25 })} segments={24} />
      <Cyl r={0.2} h={0.02} position={[0, 0.39, 0]} color="#3b2a20" segments={24} shadow={false} />
      <Cyl r={0.045} rTop={0.04} h={1.0} position={[-0.04, 0.9, 0]} color="#b49a78" segments={10} />
      <Cyl r={0.035} rTop={0.03} h={0.55} position={[0.07, 0.67, 0.03]} color="#a88c6a" segments={10} />
      {head(1.4, -0.04, 14, 3)}
      {head(0.95, 0.07, 9, 7)}
    </group>
  )
}

export function Plant({ v }: { v: Visual }) {
  if (v.opts.variant === 'cane') return <CanePlant />
  return (
    <group>
      <Cyl r={0.2} rTop={0.24} h={0.42} position={[0, 0.21, 0]} color={C.terracotta} />
      <Ball r={0.3} position={[0, 0.82, 0]} color={C.leaf} flat detail={1} />
      <Ball r={0.24} position={[0.18, 1.02, 0.08]} color={C.leafDark} flat detail={1} />
      <Ball r={0.18} position={[-0.12, 1.18, -0.05]} color={C.mint} flat detail={1} />
    </group>
  )
}

/**
 * TV unit: adjustable length (Item.len, 0.8-3.2 m), number of doors follows the length (one per ~90 cm).
 * Surface at 0.5 m (rules.ts > SURFACE_Y): holds a TV, console, lamp or pot. Door and body colors are selectable.
 */
export function TvUnit({ v }: { v: Visual }) {
  const L = v.opts.len ?? 1.8
  const D = 0.42
  const H = 0.48
  const n = Math.max(2, Math.round(L / 0.9))
  const gap = 0.02
  const doorW = (L - 0.04 - (n - 1) * gap) / n
  const body = v.opts.body ?? C.white
  const door = v.opts.top ?? C.brandPale
  const open = v.open ?? 0
  return (
    <group>
      <Carcass w={L} h={H} d={D} y={0.01} color={body} />
      {Array.from({ length: n }, (_, i) => (
        <SwingDoor key={i} w={doorW} h={H - 0.03} at={[-L / 2 + 0.02 + doorW / 2 + i * (doorW + gap), 0.01 + H / 2, D / 2 + 0.009]} hinge={i % 2 ? 'r' : 'l'} open={open} color={door} handle={0.1} />
      ))}
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[0.05, 0.02, D - 0.1]} position={[sx * (L / 2 - 0.12), 0.01, 0]} color={C.ink} shadow={false} />
      ))}
    </group>
  )
}

/**
 * Gaming chair: five-star base with casters, gas lift, racing seat (side bolsters), slightly reclined high back (wings,
 * center stripe), head and lumbar pillows, armrests. Front faces +z (towards the desk). Body color Item.body, stripe color
 * Item.top (bright colors). Fits under a desk (rules.ts > TUCKS).
 */
export function GamingChair({ v }: { v: Visual }) {
  const body = v.opts.body ?? C.ink
  const accent = v.opts.top ?? '#e2564b'
  const legs = [0, 1, 2, 3, 4].map((i) => (i * Math.PI * 2) / 5)
  return (
    <group>
      {/* five-star base and casters */}
      {legs.map((a) => (
        <group key={a} rotation-y={a}>
          <Box size={[0.05, 0.035, 0.3]} position={[0, 0.07, 0.15]} color={C.ink} shadow={false} />
          <Ball r={0.028} position={[0, 0.03, 0.29]} color={C.inkSoft} detail={1} shadow={false} />
        </group>
      ))}
      <Cyl r={0.045} h={0.06} position={[0, 0.09, 0]} color={C.ink} segments={14} shadow={false} />
      <Cyl r={0.026} h={0.28} position={[0, 0.24, 0]} color={C.steel} segments={12} />
      <Box size={[0.24, 0.04, 0.24]} position={[0, 0.39, 0]} color={C.ink} shadow={false} />
      {/* seat and side bolsters */}
      <Box size={[0.54, 0.09, 0.52]} position={[0, 0.455, 0.02]} color={body} radius={0.035} />
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[0.07, 0.06, 0.48]} position={[sx * 0.245, 0.51, 0.02]} color={accent} radius={0.02} shadow={false} />
      ))}
      {/* armrests */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 0.31, 0, -0.02]}>
          <Box size={[0.04, 0.22, 0.05]} position={[0, 0.6, 0]} color={C.ink} shadow={false} />
          <Box size={[0.08, 0.035, 0.26]} position={[0, 0.725, 0.02]} color={C.ink} radius={0.012} />
        </group>
      ))}
      {/* backrest: slightly reclined */}
      <group position={[0, 0.5, -0.25]} rotation-x={-0.12}>
        <Box size={[0.5, 0.88, 0.1]} position={[0, 0.46, 0]} color={body} radius={0.04} />
        {[-1, 1].map((sx) => (
          <Box key={sx} size={[0.07, 0.62, 0.13]} position={[sx * 0.245, 0.36, 0.02]} color={accent} radius={0.025} shadow={false} />
        ))}
        <Box size={[0.07, 0.58, 0.102]} position={[0, 0.4, 0.004]} color={accent} shadow={false} />
        {/* head and lumbar pillows */}
        <Box size={[0.26, 0.12, 0.07]} position={[0, 0.78, 0.075]} color={C.ink} radius={0.03} shadow={false} />
        <Box size={[0.3, 0.13, 0.07]} position={[0, 0.2, 0.075]} color={C.ink} radius={0.03} shadow={false} />
      </group>
    </group>
  )
}

/** Round swivel chair outline: a round seat and a back hugging the rear half (built once) */
let roundBackGeo: THREE.ExtrudeGeometry | null = null
function roundChairBack() {
  if (!roundBackGeo) {
    const sh = new THREE.Shape()
    // ring segment around the back (angles from +x, the back is local -z)
    const a0 = Math.PI * 0.95
    const a1 = Math.PI * 2.05
    sh.absarc(0, 0, 0.525, a0, a1, false)
    sh.absarc(0, 0, 0.36, a1, a0, true)
    sh.closePath()
    roundBackGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 32 })
    // shape in (x, y) becomes (x, z) on the floor; extrusion goes up
    roundBackGeo.rotateX(Math.PI / 2)
    roundBackGeo.translate(0, 0.78, 0)
  }
  return roundBackGeo
}

/**
 * Round swivel cuddle chair (like a velvet barrel swivel chair): a deep round seat on a round base, a low curved back that
 * wraps the rear half and ends in two short arms, two loose pillows. Fabric Item.body; front +z.
 */
export function RoundChair({ v }: { v: Visual }) {
  const fabric = v.opts.body ?? '#8a9488'
  const m = mat(fabric, { roughness: 0.95 })
  return (
    <group>
      <Cyl r={0.5} h={0.3} position={[0, 0.15, 0]} material={m} segments={40} />
      <Cyl r={0.51} h={0.14} position={[0, 0.37, 0]} material={mat(shade(fabric, 1.05), { roughness: 0.95 })} segments={40} />
      <mesh geometry={roundChairBack()} material={m} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.2, 0.38, 0.18]} position={[s * 0.3, 0.6, -0.26]} rotation-y={s * -0.5} rotation-x={-0.1} color={shade(fabric, 0.96)} radius={0.06} />
      ))}
    </group>
  )
}

/** Balloon back outline of the carved wingback (meters, x across, y up from the seat): wide crest, narrow waist (built once) */
let balloonGeo: readonly [THREE.ExtrudeGeometry, THREE.ExtrudeGeometry] | null = null
function balloonBack() {
  if (!balloonGeo) {
    const outline = (k: number) => {
      const s = new THREE.Shape()
      s.moveTo(-0.3 * k, 0)
      s.bezierCurveTo(-0.3 * k, 0.25, -0.2 * k, 0.32, -0.26 * k, 0.55)
      s.bezierCurveTo(-0.33 * k, 0.78, -0.3 * k, 0.9, 0, 0.92 + (k - 1) * 0.5)
      s.bezierCurveTo(0.3 * k, 0.9, 0.33 * k, 0.78, 0.26 * k, 0.55)
      s.bezierCurveTo(0.2 * k, 0.32, 0.3 * k, 0.25, 0.3 * k, 0)
      s.closePath()
      return s
    }
    const panel = new THREE.ExtrudeGeometry(outline(1), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 24 })
    const frame = new THREE.ExtrudeGeometry(outline(1.1), { depth: 0.04, bevelEnabled: false, curveSegments: 24 })
    balloonGeo = [panel, frame] as const
  }
  return balloonGeo
}

/**
 * Carved wingback chair (like a Louis style balloon back wing chair): a tall upholstered back with a narrow waist, edged in
 * carved dark wood with nailheads, curved wings sweeping into the arms, a deep seat cushion on a wood apron with turned
 * legs, and a navy brocade pillow. Fabric Item.body; front +z.
 */
export function WingChair({ v }: { v: Visual }) {
  const fabric = mat(v.opts.body ?? '#a9bcc4', { roughness: 0.6 })
  const wood = mat('#4a2c1c', { roughness: 0.5 })
  const brass = mat('#b08d57', { metalness: 0.6, roughness: 0.35 })
  const [panel, frame] = balloonBack()
  return (
    <group>
      {[-0.3, 0.3].flatMap((x) => [-0.28, 0.28].map((z) => <Cyl key={`${x}${z}`} r={0.025} rTop={0.03} h={0.2} position={[x, 0.1, z]} material={wood} segments={10} />))}
      <Box size={[0.72, 0.08, 0.7]} position={[0, 0.22, 0.02]} material={wood} radius={0.02} />
      <Box size={[0.7, 0.16, 0.7]} position={[0, 0.33, 0.03]} material={fabric} radius={0.05} />
      <Box size={[0.58, 0.1, 0.56]} position={[0, 0.45, 0.08]} material={fabric} radius={0.05} />
      <group position={[0, 0.42, -0.3]} rotation-x={-0.1}>
        <mesh geometry={frame} material={wood} position={[0, -0.02, -0.03]} castShadow />
        <mesh geometry={panel} material={fabric} castShadow receiveShadow />
        {Array.from({ length: 18 }, (_, i) => {
          const t = (i / 17) * Math.PI
          return <Ball key={i} r={0.008} position={[Math.cos(t) * 0.3, 0.62 + Math.sin(t) * 0.3, 0.14]} material={brass} detail={0} shadow={false} />
        })}
      </group>
      {/* wings: curved side panels from the back into the arms, wood edged */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.33, 0.62, -0.08]} rotation-y={s * -0.35}>
          <Box size={[0.08, 0.42, 0.42]} material={fabric} radius={0.04} />
          <Box size={[0.03, 0.44, 0.03]} position={[s * 0.02, 0, 0.21]} material={wood} />
        </group>
      ))}
      <Box size={[0.3, 0.3, 0.08]} position={[0, 0.66, -0.12]} rotation-x={-0.12} color="#1f2a44" radius={0.03} />
    </group>
  )
}

/**
 * Built-in coffee bar hutch (like a two-tone kitchen buffet): a distressed black base with drawers and raised panel doors
 * between cherry fluted columns, a granite top at 0.91 m (coffee machines stand on it); above, two black glass-front
 * cabinets, a cherry cabinet over a diagonal wine rack, three cherry drawers, and cherry crown molding. 1.75 × 0.6 m, back
 * against the wall, front +z.
 */
export function CoffeeHutch() {
  const W = 1.75
  const D = 0.6
  const black = mat('#1f1d1a', { roughness: 0.55 })
  const panel = mat('#2a2723', { roughness: 0.5 })
  const cherry = mat('#8a4a2a', { roughness: 0.5 })
  const bronze = mat('#5a4430', { metalness: 0.6, roughness: 0.4 })
  const granite = mat('#b8a07a', { roughness: 0.35 })
  const glass = mat('#2f3a40', { opacity: 0.55, roughness: 0.1 })
  const rack = useMemo(() => {
    const t = wineLatticeTexture().clone()
    t.repeat.set(5, 3)
    t.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })
  }, [])
  useEffect(() => () => rack.dispose(), [rack])
  const fz = D / 2
  const door = (x: number, w: number, y: number, h: number, knob: number) => (
    <group key={`${x}${y}`}>
      <Box size={[w, h, 0.02]} position={[x, y, fz + 0.01]} material={black} radius={0.006} />
      <Box size={[w - 0.08, h - 0.08, 0.008]} position={[x, y, fz + 0.022]} material={panel} shadow={false} />
      <Ball r={0.014} position={[x + knob, y + (h > 0.3 ? 0.16 - h / 2 + 0.3 : 0), fz + 0.03]} material={bronze} detail={1} shadow={false} />
    </group>
  )
  const upZ = -D / 2 + 0.16
  return (
    <group>
      {/* base */}
      <Box size={[W, 0.1, D - 0.04]} position={[0, 0.05, -0.02]} material={cherry} />
      <Box size={[W - 0.12, 0.78, D - 0.04]} position={[0, 0.49, -0.02]} material={black} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl r={0.04} h={0.72} position={[s * (W / 2 - 0.04), 0.48, fz - 0.04]} material={cherry} segments={12} />
          <Box size={[0.08, 0.88, D - 0.04]} position={[s * (W / 2 - 0.04), 0.44, -0.04]} material={cherry} />
        </group>
      ))}
      {door(-0.58, 0.36, 0.78, 0.14, 0)}
      {door(-0.58, 0.36, 0.42, 0.52, 0.13)}
      {door(-0.19, 0.38, 0.5, 0.68, 0.14)}
      {door(0.21, 0.38, 0.5, 0.68, -0.14)}
      {door(0.6, 0.34, 0.78, 0.14, 0)}
      {door(0.6, 0.34, 0.42, 0.52, -0.12)}
      <Box size={[W + 0.04, 0.03, D + 0.03]} position={[0, 0.895, 0.01]} material={granite} radius={0.008} />
      <Box size={[W, 0.08, 0.02]} position={[0, 0.95, -D / 2 + 0.01]} material={granite} shadow={false} />
      {/* uppers: left glass cabinet */}
      <Box size={[0.42, 1.0, 0.32]} position={[-0.6, 1.9, upZ]} material={black} />
      <Box size={[0.32, 0.88, 0.01]} position={[-0.6, 1.9, upZ + 0.163]} material={glass} shadow={false} />
      {/* center: cherry cabinet over the wine rack */}
      <Box size={[0.74, 0.5, 0.34]} position={[0.04, 2.15, upZ]} material={cherry} />
      {[-0.17, 0.17].map((x) => (
        <group key={x}>
          <Box size={[0.33, 0.44, 0.01]} position={[0.04 + x, 2.15, upZ + 0.175]} material={mat('#9a5634', { roughness: 0.5 })} shadow={false} />
          <Ball r={0.013} position={[0.04 + x - Math.sign(x) * 0.13, 2.0, upZ + 0.19]} material={bronze} detail={1} shadow={false} />
        </group>
      ))}
      <Box size={[0.74, 0.46, 0.34]} position={[0.04, 1.67, upZ]} material={cherry} />
      <Box size={[0.66, 0.38, 0.005]} position={[0.04, 1.66, upZ + 0.172]} material={rack} shadow={false} />
      {/* right: three cherry drawers on the counter, a narrow glass cabinet above */}
      <Box size={[0.26, 0.48, 0.3]} position={[0.55, 1.15, upZ]} material={cherry} />
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <Box size={[0.24, 0.14, 0.01]} position={[0.55, 0.99 + i * 0.155, upZ + 0.155]} material={mat('#9a5634', { roughness: 0.5 })} shadow={false} />
          <Box size={[0.06, 0.015, 0.015]} position={[0.55, 0.99 + i * 0.155, upZ + 0.165]} material={bronze} shadow={false} />
        </group>
      ))}
      <Box size={[0.3, 0.9, 0.32]} position={[0.7, 1.95, upZ]} material={black} />
      <Box size={[0.22, 0.78, 0.01]} position={[0.7, 1.95, upZ + 0.163]} material={glass} shadow={false} />
      {/* crown */}
      <Box size={[0.48, 0.08, 0.38]} position={[-0.6, 2.44, upZ + 0.02]} material={cherry} />
      <Box size={[0.8, 0.1, 0.4]} position={[0.04, 2.45, upZ + 0.03]} material={cherry} />
      <Box size={[0.36, 0.08, 0.38]} position={[0.7, 2.44, upZ + 0.02]} material={cherry} />
    </group>
  )
}

/* ---------- kids corner: rainbow drawer cart, splat stool and activity table ---------- */

const CART_COLORS = ['#25c2cf', '#5a3bd6', '#ff7f9a', '#9fe33a', '#ec6fbf', '#2b40c2', '#f4e626', '#2fb043', '#f7a82a', '#e8383a']
const CART_W = 0.36
const CART_D = 0.36
const CART_TOP = 0.93
const CORNERS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

/**
 * Rainbow rolling drawer cart: a chrome tube frame on four casters, ten translucent drawers (teal at the top to red at the
 * bottom) with chrome knobs, a metal top with a loop handle on each side. Small items stand on the top (rules SURFACE_Y).
 */
export function DrawerCart() {
  const chrome = mat('#dfe3e8', { metalness: 0.45, roughness: 0.22 })
  const rh = (CART_TOP - 0.14) / CART_COLORS.length
  return (
    <group>
      {CORNERS.map(([sx, sz]) => (
        <group key={`${sx}${sz}`} position={[(sx * CART_W) / 2, 0, (sz * CART_D) / 2]}>
          <Cyl r={0.009} h={CART_TOP - 0.06} position={[0, 0.06 + (CART_TOP - 0.06) / 2, 0]} material={chrome} segments={10} />
          <Cyl r={0.032} h={0.022} position={[0, 0.032, 0]} rotation-x={Math.PI / 2} color="#1b1c20" segments={14} />
          <Box size={[0.03, 0.02, 0.03]} position={[0, 0.06, 0]} color="#2a2b30" shadow={false} />
          {/* loop handle posts rising above the top */}
          <Cyl r={0.009} h={0.07} position={[0, CART_TOP + 0.035, 0]} material={chrome} segments={10} />
        </group>
      ))}
      {[-1, 1].map((sx) => (
        <Cyl key={sx} r={0.009} h={CART_D} position={[(sx * CART_W) / 2, CART_TOP + 0.07, 0]} rotation-x={Math.PI / 2} material={chrome} segments={10} />
      ))}
      <Box size={[CART_W, 0.012, CART_D]} position={[0, CART_TOP, 0]} material={chrome} />
      {[-1, 1].map((sz) => (
        <Box key={sz} size={[CART_W, 0.012, 0.012]} position={[0, 0.1, (sz * CART_D) / 2]} material={chrome} shadow={false} />
      ))}
      {CART_COLORS.map((c, i) => {
        const y = CART_TOP - 0.01 - rh * (i + 0.5)
        return (
          <group key={c} position={[0, y, 0.005]}>
            <Box size={[CART_W - 0.03, rh - 0.012, CART_D - 0.01]} material={mat(c, { opacity: 0.82, roughness: 0.25 })} shadow={false} />
            <Box size={[CART_W - 0.012, 0.012, 0.016]} position={[0, rh / 2 - 0.012, CART_D / 2 - 0.005]} material={mat(c, { opacity: 0.9, roughness: 0.25 })} shadow={false} />
            <Ball r={0.011} position={[0, 0, CART_D / 2 + 0.008]} material={chrome} shadow={false} />
            {[-1, 1].map((sx) => (
              <Box key={sx} size={[0.008, 0.006, CART_D]} position={[(sx * CART_W) / 2, rh / 2 - 0.004, 0]} material={chrome} shadow={false} />
            ))}
          </group>
        )
      })}
    </group>
  )
}

/** Flat shape with separate left and right corner radii (x across, shape y = -z), uvs over its bounding box. */
function sideRoundGeometry(w: number, d: number, rl: number, rr: number, depth: number) {
  const s = new THREE.Shape()
  const x0 = -w / 2
  const y0 = -d / 2
  s.moveTo(x0 + rl, y0)
  s.lineTo(x0 + w - rr, y0)
  s.absarc(x0 + w - rr, y0 + rr, rr, -Math.PI / 2, 0, false)
  s.lineTo(x0 + w, y0 + d - rr)
  s.absarc(x0 + w - rr, y0 + d - rr, rr, 0, Math.PI / 2, false)
  s.lineTo(x0 + rl, y0 + d)
  s.absarc(x0 + rl, y0 + d - rl, rl, Math.PI / 2, Math.PI, false)
  s.lineTo(x0, y0 + rl)
  s.absarc(x0 + rl, y0 + rl, rl, Math.PI, Math.PI * 1.5, false)
  const g = depth > 0 ? new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 16 }) : new THREE.ShapeGeometry(s, 16)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + d / 2) / d)
  uv.needsUpdate = true
  g.rotateX(-Math.PI / 2)
  return g
}

const splatGeos = new Map<string, { body: THREE.BufferGeometry; face: THREE.BufferGeometry }>()

/** A kids furniture top: a red slab with the splat painted face on it (geometry built once per kind). */
function SplatTop({ kind, w, d, rl, rr, y, thick }: { kind: 'stool' | 'table'; w: number; d: number; rl: number; rr: number; y: number; thick: number }) {
  let g = splatGeos.get(kind)
  if (!g) {
    g = { body: sideRoundGeometry(w, d, rl, rr, thick), face: sideRoundGeometry(w, d, rl, rr, 0) }
    splatGeos.set(kind, g)
  }
  const face = useMemo(() => new THREE.MeshStandardMaterial({ map: splatTopTexture(kind, w, d, rl, rr), roughness: 0.35 }), [kind, w, d, rl, rr])
  useEffect(() => () => face.dispose(), [face])
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={g.body} material={mat('#d03a28', { roughness: 0.5 })} castShadow receiveShadow />
      <mesh geometry={g.face} material={face} position={[0, thick + 0.001, 0]} receiveShadow />
    </group>
  )
}

const KID_WOOD = '#dcc08a'

/** Kids stool: a rounded 42 × 28 cm top, red rim and black field with paint splats, on four plain wood legs (30 cm). */
export function KidsStool() {
  const wood = mat(KID_WOOD, { roughness: 0.75 })
  return (
    <group>
      {CORNERS.map(([sx, sz]) => (
        <Box key={`${sx}${sz}`} size={[0.04, 0.28, 0.04]} position={[sx * 0.15, 0.14, sz * 0.085]} material={wood} />
      ))}
      <SplatTop kind="stool" w={0.42} d={0.28} rl={0.035} rr={0.035} y={0.28} thick={0.022} />
    </group>
  )
}

const KT_W = 1.2
const KT_D = 0.7
const KT_Y = 0.6
const KT_PED = 0.42
const KT_SHELVES: { y: number; plates: [number, number, number, string][] }[] = [
  { y: 0.05, plates: [[-0.08, 0.2, 0.34, '#3aa64a'], [0.1, 0.17, 0.28, '#3aa64a']] },
  { y: 0.3, plates: [[-0.08, 0.2, 0.34, '#7a5434'], [0.1, 0.17, 0.28, '#2a6fd0']] },
]

/**
 * Kids activity table: a splat top with a fully rounded left end and a red rim, on a plywood shelf pedestal at the right
 * (two shelves open to the back, with brick baseplates and a clear box) and two wood legs at the left; a pale wood frame
 * tray with a paper sheet under the top, a red paper roll knob on the left apron.
 */
export function KidsTable() {
  const wood = mat(KID_WOOD, { roughness: 0.75 })
  const ply = mat('#e2c590', { roughness: 0.7 })
  const px = KT_W / 2 - KT_PED / 2 - 0.03
  const under = KT_Y - 0.03
  const trayL = KT_W - KT_PED - 0.24
  const trayX = -KT_W / 2 + 0.13 + trayL / 2
  return (
    <group position={[0, 0, -0.04]}>
      <SplatTop kind="table" w={KT_W} d={KT_D} rl={0.32} rr={0.05} y={under} thick={0.03} />
      {/* pedestal: sides, a closed front panel, shelves open to the back */}
      <group position={[px, 0, 0]}>
        {[-1, 1].map((sx) => (
          <Box key={sx} size={[0.018, under, KT_D - 0.06]} position={[(sx * KT_PED) / 2, under / 2, 0]} material={ply} />
        ))}
        <Box size={[KT_PED, under - 0.04, 0.016]} position={[0, under / 2 + 0.02, KT_D / 2 - 0.04]} material={ply} />
        {KT_SHELVES.map((sh) => (
          <group key={sh.y} position={[0, sh.y, 0]}>
            <Box size={[KT_PED - 0.02, 0.018, KT_D - 0.08]} position={[0, 0, -0.01]} material={ply} />
            {sh.plates.map(([x, w, d, c]) => (
              <Box key={x} size={[w, 0.006, d]} position={[x, 0.012, -0.05]} color={c} shadow={false} />
            ))}
            <Box size={[0.12, 0.07, 0.08]} position={[0.08, 0.05, -0.14]} material={mat('#e8eef2', { opacity: 0.5, roughness: 0.1 })} shadow={false} />
          </group>
        ))}
      </group>
      {/* left legs with a foot rail */}
      {[-1, 1].map((sz) => (
        <Box key={sz} size={[0.045, under, 0.045]} position={[-KT_W / 2 + 0.2, under / 2, sz * 0.24]} material={wood} />
      ))}
      <Box size={[0.03, 0.04, 0.48]} position={[-KT_W / 2 + 0.2, 0.06, 0]} material={wood} />
      {/* apron and paper roll knob */}
      <Box size={[0.03, 0.06, 0.4]} position={[-KT_W / 2 + 0.1, under - 0.03, 0]} material={ply} shadow={false} />
      <Cyl r={0.025} h={0.03} position={[-KT_W / 2 + 0.08, under - 0.03, 0]} rotation-z={Math.PI / 2} color="#c8242a" segments={14} shadow={false} />
      {/* pull-out tray: wood frame, paper sheet */}
      <group position={[trayX, under - 0.1, 0.1]}>
        {[-1, 1].map((sx) => (
          <Box key={sx} size={[0.03, 0.03, KT_D - 0.08]} position={[(sx * trayL) / 2, 0, 0]} material={wood} />
        ))}
        {[-1, 1].map((sz) => (
          <Box key={sz} size={[trayL, 0.03, 0.03]} position={[0, 0, (sz * (KT_D - 0.08)) / 2]} material={wood} />
        ))}
        <Box size={[trayL - 0.02, 0.003, KT_D - 0.1]} position={[0, 0.006, 0]} color="#eef0f2" shadow={false} />
      </group>
    </group>
  )
}

/**
 * Elliptical trainer (1.75 × 0.7 m): the drive housing with its flywheel at the back (-z, against the wall), a long base rail,
 * pedal arms on rollers, moving handles and a console on the mast. A bound plug or switch that is on spins the flywheel and
 * lights the console display.
 */
export function Elliptical({ v }: { v: Visual }) {
  const frame = mat('#1d1f24', { roughness: 0.5, metalness: 0.35 })
  const shell = mat('#4d525b', { roughness: 0.45 })
  const display = useLitMaterial('#1a2230', v.on, '#5fd0ff', 0.9, 1.6)
  return (
    <group>
      <Box size={[0.12, 0.08, 1.5]} position={[0, 0.06, 0.1]} material={frame} />
      {[-0.78, 0.82].map((z) => (
        <Box key={z} size={[0.66, 0.05, 0.08]} position={[0, 0.025, z]} material={frame} />
      ))}
      <Box size={[0.26, 0.55, 0.5]} position={[0, 0.33, -0.56]} material={shell} radius={0.06} />
      <group position={[0, 0.33, -0.56]} rotation-y={Math.PI / 2}>
        <Spin speed={v.on ? 6 : 0}>
          {[-1, 1].map((s) => (
            <Cyl key={s} r={0.2} h={0.02} position={[0, 0, s * 0.14]} rotation-x={Math.PI / 2} color="#2a2d33" segments={28} />
          ))}
          {[-1, 1].map((s) => (
            <Box key={s} size={[0.3, 0.025, 0.012]} position={[0, 0, s * 0.152]} color="#8a8f99" shadow={false} />
          ))}
        </Spin>
      </group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[0.05, 0.05, 1.05]} position={[s * 0.12, 0.3, 0.02]} rotation-x={0.17} material={frame} />
          <Cyl r={0.04} h={0.04} position={[s * 0.12, 0.13, 0.52]} rotation-z={Math.PI / 2} color="#2a2d33" segments={16} />
          <Box size={[0.15, 0.035, 0.38]} position={[s * 0.15, 0.3, 0.2]} color="#2a2d33" />
          <Box size={[0.03, 1.15, 0.03]} position={[s * 0.24, 0.95, -0.36]} rotation-x={0.22} material={frame} />
          <Box size={[0.04, 0.22, 0.04]} position={[s * 0.24, 1.6, -0.21]} rotation-x={0.22} color="#1a1b1f" />
          <Box size={[0.03, 0.03, 0.3]} position={[s * 0.15 + s * 0.03, 0.62, -0.44]} rotation-x={-0.6} material={frame} />
        </group>
      ))}
      <Box size={[0.08, 1.05, 0.08]} position={[0, 0.98, -0.6]} rotation-x={-0.12} material={shell} />
      <group position={[0, 1.48, -0.56]} rotation-x={-0.5}>
        <Box size={[0.38, 0.22, 0.06]} material={shell} radius={0.02} />
        <Box size={[0.2, 0.1, 0.006]} position={[0, 0.02, 0.031]} material={display} shadow={false} />
        <Box size={[0.4, 0.03, 0.03]} position={[0, -0.13, 0.04]} color="#1a1b1f" />
      </group>
    </group>
  )
}

/**
 * Adjustable weight bench (0.55 × 1.3 m): a steel spine with front and rear feet, a seat and an inclined back pad on a strut,
 * foam leg rollers at the front (+z) and transport wheels at the back.
 */
export function WeightBench() {
  const steel = mat('#1d1f24', { roughness: 0.5, metalness: 0.4 })
  const pad = '#141518'
  return (
    <group>
      <Box size={[0.08, 0.06, 1.2]} position={[0, 0.2, 0]} rotation-x={-0.02} material={steel} />
      {[-0.55, 0.55].map((z) => (
        <group key={z}>
          <Box size={[0.07, 0.2, 0.06]} position={[0, 0.1, z]} material={steel} />
          <Box size={[0.52, 0.05, 0.07]} position={[0, 0.025, z]} material={steel} />
        </group>
      ))}
      {[-1, 1].map((s) => (
        <Cyl key={s} r={0.04} h={0.03} position={[s * 0.28, 0.045, -0.6]} rotation-z={Math.PI / 2} color="#2a2d33" segments={14} />
      ))}
      <Box size={[0.06, 0.2, 0.06]} position={[0, 0.32, 0.32]} material={steel} />
      <Box size={[0.28, 0.07, 0.36]} position={[0, 0.45, 0.33]} color={pad} radius={0.025} />
      <Box size={[0.05, 0.36, 0.05]} position={[0, 0.34, -0.15]} rotation-x={0.5} material={steel} />
      <Box size={[0.28, 0.07, 0.78]} position={[0, 0.58, -0.22]} rotation-x={0.32} color={pad} radius={0.025} />
      <Box size={[0.05, 0.25, 0.05]} position={[0, 0.3, 0.58]} rotation-x={-0.3} material={steel} />
      {[0.4, 0.26].map((y, i) => (
        <group key={y} position={[0, y, 0.6 + i * 0.03]}>
          <Cyl r={0.012} h={0.36} rotation-z={Math.PI / 2} material={steel} segments={8} shadow={false} />
          {[-1, 1].map((s) => (
            <Cyl key={s} r={0.05} h={0.13} position={[s * 0.1, 0, 0]} rotation-z={Math.PI / 2} color={pad} segments={16} />
          ))}
        </group>
      ))}
    </group>
  )
}

/** Hex dumbbell lying along z: a knurled steel handle and two black hex heads of radius r. */
function Dumbbell({ r, position }: { r: number; position: [number, number, number] }) {
  const L = 0.12 + r * 1.6
  return (
    <group position={position}>
      <Cyl r={0.016} h={L} rotation-x={Math.PI / 2} color="#b9bcc2" segments={8} shadow={false} />
      {[-1, 1].map((s) => (
        <Cyl key={s} r={r} h={r * 0.9} position={[0, 0, s * (L / 2 + r * 0.35)]} rotation-x={Math.PI / 2} color="#1b1c20" segments={6} />
      ))}
    </group>
  )
}

/**
 * Two-tier dumbbell rack (1.1 × 0.45 m, back to the wall): A-frame ends with angled rails, ten hex dumbbells from light (top,
 * back) to heavy (bottom, front).
 */
export function DumbbellRack() {
  const steel = mat('#1d1f24', { roughness: 0.5, metalness: 0.4 })
  const tiers: [number, number, number[]][] = [
    [0.78, -0.07, [0.04, 0.042, 0.045, 0.048, 0.05]],
    [0.46, 0.09, [0.055, 0.06, 0.065, 0.07, 0.075]],
  ]
  return (
    <group>
      {[-0.52, 0.52].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Box size={[0.05, 0.04, 0.44]} position={[0, 0.02, 0]} material={steel} />
          <Box size={[0.04, 0.82, 0.04]} position={[0, 0.41, -0.08]} rotation-x={0.12} material={steel} />
          <Box size={[0.04, 0.5, 0.04]} position={[0, 0.25, 0.12]} rotation-x={-0.12} material={steel} />
        </group>
      ))}
      {tiers.map(([y, z, rs]) => (
        <group key={y}>
          {[-0.09, 0.09].map((dz) => (
            <Box key={dz} size={[1.08, 0.03, 0.03]} position={[0, y, z + dz]} material={steel} />
          ))}
          {rs.map((r, i) => (
            <Dumbbell key={i} r={r} position={[-0.4 + i * 0.2, y + 0.015 + r * 0.87, z]} />
          ))}
        </group>
      ))}
    </group>
  )
}

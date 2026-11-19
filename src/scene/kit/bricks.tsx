import { type JSX, useMemo } from 'react'
import * as THREE from 'three'
import { BRICK_MODEL_SIZE, CATALOG } from '@/model/catalog'
import { Glow } from './effects'
import { Ball, Box, Cyl, mat } from './primitives'
import type { Visual } from './visual'

/*
 * Brick models: built display models (a loop coaster, an airliner, starfighters, a flying aircraft carrier) at their real
 * size, for shelves, desks and cabinets. One kind, the model in Item.variant (catalog.ts > BRICK_MODEL_SIZE sets the
 * footprint). Simplified shapes in brick colors; no logos. Origin at the base center, the nose toward +x.
 * Lights (like a brick light kit): engines, cockpits, landing and navigation lights, track bulbs; lit while the bound
 * switch or light is on.
 */

const GRAY = '#b9bec4'
const DARK = '#5c6168'
const STAND = '#2a2b2e'
const BLUE_GLOW = '#8fc2ff'

/** Wall-hung brick model: the top of its floating shelf above the floor (rules.ts > WALL_SPAN.brickModel) */
const BRICK_SHELF_Y = 1.4

/** Light part: bright while lit, a faint tint while off */
const glowMat = (color: string, lit = false) => mat(color, { emissive: color, emissiveIntensity: lit ? 1.6 : 0.06, roughness: 0.4 })

type M = { bare?: boolean; lit?: boolean }

/** A small bulb with a halo while lit */
function Bulb({ at, color, lit, r = 0.006, halo = 0.07 }: { at: [number, number, number]; color: string; lit?: boolean; r?: number; halo?: number }) {
  return (
    <>
      <Ball r={r} position={at} material={glowMat(color, lit)} detail={1} shadow={false} />
      {lit && <Glow position={at} color={color} opacity={0.85} size={halo} />}
    </>
  )
}

/** Display stand: a dark plate and a post up to y */
function Stand({ y, w = 0.16, d = 0.1, x = 0 }: { y: number; w?: number; d?: number; x?: number }) {
  return (
    <group position={[x, 0, 0]}>
      <Box size={[w, 0.02, d]} position={[0, 0.01, 0]} color={STAND} radius={0.004} />
      <Box size={[0.03, y - 0.02, 0.03]} position={[0, y / 2 + 0.01, 0]} color={STAND} />
    </group>
  )
}

/** Midi-scale freighter: a saucer, two forward mandibles, a cockpit tube on the right, a blue engine strip at the back */
function Falcon({ lit }: M) {
  return (
    <group position={[0, 0.045, 0]}>
      <Box size={[0.12, 0.012, 0.08]} position={[0, -0.039, 0]} color={STAND} />
      <Box size={[0.03, 0.03, 0.03]} position={[0, -0.02, 0]} color={STAND} />
      <Cyl r={0.15} rTop={0.13} h={0.025} position={[-0.02, 0, 0]} color={GRAY} segments={24} />
      <Cyl r={0.13} rTop={0.15} h={0.025} position={[-0.02, -0.025, 0]} color={GRAY} segments={24} />
      <Cyl r={0.05} h={0.02} position={[-0.03, 0.02, 0]} color={DARK} segments={16} />
      <Cyl r={0.025} h={0.008} position={[-0.06, 0.035, -0.06]} color="#e4e6e8" segments={12} shadow={false} />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.12, 0.03, 0.055]} position={[0.17, -0.01, s * 0.055]} color={GRAY} />
      ))}
      <Box size={[0.07, 0.022, 0.03]} position={[0.07, -0.005, 0.12]} color={GRAY} />
      <Cyl r={0.022} h={0.06} position={[0.11, -0.005, 0.135]} rotation-z={Math.PI / 2} color={GRAY} segments={12} />
      <Ball r={0.022} position={[0.14, -0.005, 0.135]} color={DARK} detail={1} />
      <Box size={[0.012, 0.012, 0.2]} position={[-0.165, -0.012, 0]} material={glowMat(BLUE_GLOW, lit)} shadow={false} />
      {lit && [-0.07, 0, 0.07].map((z) => <Glow key={z} position={[-0.175, -0.012, z]} color={BLUE_GLOW} opacity={0.8} size={0.12} />)}
      {[-1, 1].map((s) => (
        <Bulb key={s} at={[0.232, -0.01, s * 0.055]} color="#fff3d6" lit={lit} r={0.005} />
      ))}
      <Bulb at={[0.155, -0.005, 0.135]} color="#ffe2a0" lit={lit} r={0.008} halo={0.05} />
      {[-0.06, 0.06].map((z) => (
        <Box key={z} size={[0.12, 0.006, 0.02]} position={[-0.04, 0.0145, z]} color={DARK} shadow={false} />
      ))}
    </group>
  )
}

/** Fighter with four wings in attack position, engines at the roots, cannons at the tips, red stripes */
function XWing({ lit }: M) {
  const wings = [-1, 1].flatMap((sy) => [-1, 1].map((sz) => [sy, sz] as const))
  return (
    <group position={[0, 0.07, 0]}>
      {[-0.1, 0.06].map((x) => (
        <Cyl key={x} r={0.004} h={0.07} position={[x, -0.035, 0]} color={DARK} segments={6} shadow={false} />
      ))}
      <Box size={[0.2, 0.05, 0.06]} position={[-0.05, 0, 0]} color="#e8e8e4" radius={0.01} />
      <Box size={[0.16, 0.035, 0.04]} position={[0.12, -0.005, 0]} color="#e8e8e4" />
      <Cyl r={0.004} rTop={0.02} h={0.06} position={[0.22, -0.005, 0]} rotation-z={Math.PI / 2} color="#e8e8e4" segments={8} />
      <Box size={[0.06, 0.02, 0.035]} position={[0.03, 0.03, 0]} color={DARK} />
      <Ball r={0.012} position={[-0.05, 0.03, 0]} color="#e6e0d0" detail={1} />
      <Bulb at={[0.03, 0.041, 0]} color="#bfe0ff" lit={lit} r={0.006} halo={0.05} />
      <Box size={[0.03, 0.005, 0.042]} position={[0.08, 0.016, 0]} color="#c8402e" shadow={false} />
      {wings.map(([sy, sz]) => (
        <group key={`${sy}${sz}`} position={[-0.09, sy * 0.012, sz * 0.03]} rotation-x={sz * sy * -0.22}>
          <Box size={[0.1, 0.006, 0.15]} position={[0, 0, sz * 0.075]} color="#e8e8e4" />
          <Box size={[0.02, 0.007, 0.06]} position={[-0.02, 0, sz * 0.09]} color="#c8402e" shadow={false} />
          <Cyl r={0.018} h={0.11} position={[-0.01, sy * 0.012, sz * 0.012]} rotation-z={Math.PI / 2} color="#d6d6d2" segments={12} />
          <Cyl r={0.012} h={0.006} position={[-0.067, sy * 0.012, sz * 0.012]} rotation-z={Math.PI / 2} material={glowMat('#ff7a5a', lit)} segments={12} shadow={false} />
          {lit && <Glow position={[-0.075, sy * 0.012, sz * 0.012]} color="#ff7a5a" opacity={0.85} size={0.07} />}
          <Cyl r={0.004} h={0.2} position={[0.05, 0, sz * 0.15]} rotation-z={Math.PI / 2} color={DARK} segments={6} />
        </group>
      ))}
    </group>
  )
}

/** Ball cockpit between two hexagonal wing panels */
function TieFighter({ lit }: M) {
  return (
    <group position={[0, 0.125, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * 0.115]}>
          <Cyl r={0.125} h={0.012} rotation-x={Math.PI / 2} color="#3c4047" segments={6} />
          <Cyl r={0.13} h={0.008} rotation-x={Math.PI / 2} position={[0, 0, s * 0.002]} color="#7c8187" segments={6} shadow={false} />
          {[0, 1, 2].map((k) => (
            <Box key={k} size={[0.24, 0.008, 0.016]} position={[0, 0, s * 0.006]} rotation-z={(k * Math.PI) / 3} color="#7c8187" shadow={false} />
          ))}
          <Cyl r={0.025} h={0.016} rotation-x={Math.PI / 2} color="#7c8187" segments={12} />
        </group>
      ))}
      <Cyl r={0.018} h={0.2} rotation-x={Math.PI / 2} color="#8d9298" segments={12} />
      <Ball r={0.055} color="#8d9298" detail={2} />
      <Cyl r={0.03} h={0.01} position={[0.052, 0, 0]} rotation-z={Math.PI / 2} material={lit ? glowMat('#9fd0ff', true) : mat('#1d2025')} segments={8} />
      {lit && <Glow position={[0.06, 0, 0]} color="#9fd0ff" opacity={0.8} size={0.1} />}
      <Bulb at={[-0.055, 0, 0]} color="#ff5a4a" lit={lit} r={0.008} halo={0.06} />
    </group>
  )
}

/** Silver racer: a slender fuselage with a long tail spike, two engines on side pylons with pointed nose cones */
function N1({ lit }: M) {
  const chrome = mat('#cfd4dc', { metalness: 0.65, roughness: 0.25 })
  return (
    <group position={[0, 0.05, 0]}>
      {[-0.06, 0.05].map((x) => (
        <Cyl key={x} r={0.004} h={0.05} position={[x, -0.025, 0]} color={DARK} segments={6} shadow={false} />
      ))}
      <Ball r={0.06} position={[0.0, 0, 0]} scale={[1.9, 0.38, 0.6]} material={chrome} detail={2} />
      <Cyl r={0.002} rTop={0.012} h={0.08} position={[0.145, 0, 0]} rotation-z={-Math.PI / 2} material={chrome} segments={10} />
      <Cyl r={0.003} rTop={0.012} h={0.12} position={[-0.16, 0, 0]} rotation-z={Math.PI / 2} material={chrome} segments={10} />
      <Ball r={0.018} position={[0.03, 0.02, 0]} scale={[1.4, 0.6, 0.8]} color="#2a3442" detail={1} />
      <Ball r={0.01} position={[-0.04, 0.025, 0]} color="#3b6fd6" detail={1} shadow={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[0.07, 0.006, 0.07]} position={[-0.02, 0, s * 0.055]} material={chrome} />
          <Cyl r={0.016} h={0.12} position={[-0.01, 0, s * 0.095]} rotation-z={Math.PI / 2} material={chrome} segments={14} />
          <Cyl r={0.001} rTop={0.016} h={0.05} position={[0.075, 0, s * 0.095]} rotation-z={-Math.PI / 2} material={chrome} segments={14} />
          <Cyl r={0.011} h={0.004} position={[-0.071, 0, s * 0.095]} rotation-z={Math.PI / 2} material={glowMat('#ff9a4a', lit)} segments={12} shadow={false} />
          {lit && <Glow position={[-0.076, 0, s * 0.095]} color="#ff9a4a" opacity={0.85} size={0.07} />}
        </group>
      ))}
    </group>
  )
}

/** Troop carrier: a boxy hull with a wedge cockpit, two big engines at the back, wings swept forward */
function UWing({ lit }: M) {
  const hull = '#c9ccc8'
  return (
    <group position={[0, 0.06, 0]}>
      {[-0.1, 0.08].map((x) => (
        <Cyl key={x} r={0.005} h={0.06} position={[x, -0.03, 0]} color={DARK} segments={6} shadow={false} />
      ))}
      <Box size={[0.22, 0.05, 0.08]} position={[0, 0, 0]} color={hull} radius={0.006} />
      <Box size={[0.06, 0.035, 0.06]} position={[0.135, -0.004, 0]} rotation-z={-0.25} color={hull} />
      <Box size={[0.04, 0.02, 0.05]} position={[0.14, 0.018, 0]} rotation-z={-0.25} color="#2b3540" />
      <Box size={[0.1, 0.006, 0.084]} position={[-0.01, 0.026, 0]} color="#5d7088" shadow={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl r={0.028} h={0.1} position={[-0.11, 0.005, s * 0.065]} rotation-z={Math.PI / 2} color={hull} segments={14} />
          <Cyl r={0.02} h={0.004} position={[-0.162, 0.005, s * 0.065]} rotation-z={Math.PI / 2} material={glowMat(BLUE_GLOW, lit)} segments={12} shadow={false} />
          {lit && <Glow position={[-0.168, 0.005, s * 0.065]} color={BLUE_GLOW} opacity={0.85} size={0.09} />}
          <Bulb at={[-0.09, 0.005, s * 0.2]} color={s > 0 ? '#58e07a' : '#ff5a4a'} lit={lit} r={0.005} halo={0.05} />
          <group position={[-0.12, 0.005, s * 0.09]} rotation-y={s * 0.5}>
            <Box size={[0.05, 0.006, 0.12]} position={[0, 0, s * 0.06]} color={hull} />
            <Box size={[0.02, 0.007, 0.08]} position={[0.008, 0, s * 0.07]} color="#5d7088" shadow={false} />
          </group>
        </group>
      ))}
    </group>
  )
}

/** Supersonic airliner on a display stand: slim fuselage, drooped nose, delta wing, four engines, tall fin */
function Concorde({ bare, lit }: M) {
  const white = '#f3f3f0'
  const wing = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0.2, 0)
    s.bezierCurveTo(0.05, 0.05, -0.2, 0.2, -0.36, 0.215)
    s.lineTo(-0.42, 0.2)
    s.lineTo(-0.42, -0.2)
    s.lineTo(-0.36, -0.215)
    s.bezierCurveTo(-0.2, -0.2, 0.05, -0.05, 0.2, 0)
    const g = new THREE.ShapeGeometry(s, 16)
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  const fin = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-0.33, 0)
    s.lineTo(-0.46, 0.13)
    s.lineTo(-0.5, 0.13)
    s.lineTo(-0.49, 0)
    return new THREE.ShapeGeometry(s)
  }, [])
  const whiteMat = useMemo(() => new THREE.MeshStandardMaterial({ color: white, roughness: 0.5, side: THREE.DoubleSide }), [])
  return (
    <group>
      {!bare && <Stand y={0.24} w={0.26} d={0.14} x={-0.05} />}
      <group position={[0, bare ? 0.06 : 0.27, 0]} rotation-z={bare ? 0 : 0.05}>
        <Cyl r={0.028} h={0.86} rotation-z={Math.PI / 2} color={white} segments={16} />
        {/* drooped nose: the wide end meets the fuselage, the point leads (+x), tipped slightly down */}
        <Cyl r={0.002} rTop={0.028} h={0.14} position={[0.5, -0.012, 0]} rotation-z={Math.PI / 2 - 0.08} color={white} segments={16} />
        <Cyl r={0.028} rTop={0.006} h={0.08} position={[-0.47, 0.004, 0]} rotation-z={Math.PI / 2} color={white} segments={16} />
        <Box size={[0.04, 0.012, 0.02]} position={[0.42, 0.018, 0]} color={DARK} shadow={false} />
        <mesh geometry={wing} material={whiteMat} position={[0, -0.012, 0]} castShadow />
        <mesh geometry={fin} material={whiteMat} position={[0, 0.02, 0]} castShadow />
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box size={[0.17, 0.028, 0.06]} position={[-0.3, -0.032, s * 0.1]} color="#e2e2de" />
            {/* cabin windows, landing lights under the wing, navigation lights at the tips (red left, green right) */}
            <Box size={[0.6, 0.006, 0.002]} position={[0.05, 0.008, s * 0.0285]} material={glowMat('#ffe6a8', lit)} shadow={false} />
            <Bulb at={[-0.05, -0.022, s * 0.09]} color="#fffaf0" lit={lit} r={0.007} halo={0.09} />
            <Bulb at={[-0.37, -0.012, s * 0.218]} color={s > 0 ? '#58e07a' : '#ff5a4a'} lit={lit} r={0.007} halo={0.08} />
          </group>
        ))}
        <Bulb at={[-0.5, 0.15, 0]} color="#fffaf0" lit={lit} r={0.006} halo={0.06} />
      </group>
    </group>
  )
}

/** Flying aircraft carrier on a stand: a long flight deck, a tower on one side, four rotor rings */
function Helicarrier({ bare, lit }: M) {
  const deck = '#7d8389'
  return (
    <group>
      {!bare && <Stand y={0.13} w={0.18} d={0.12} />}
      <group position={[0, bare ? 0.055 : 0.17, 0]}>
        <Box size={[0.42, 0.04, 0.12]} position={[0, 0, 0]} color={deck} radius={0.008} />
        <Box size={[0.44, 0.008, 0.1]} position={[0.01, 0.024, -0.005]} color="#4f555b" />
        <Box size={[0.4, 0.002, 0.004]} position={[0.01, 0.029, -0.005]} material={glowMat('#fff1c2', lit)} shadow={false} />
        {[-0.16, -0.08, 0, 0.08, 0.16].map((x) => (
          <Bulb key={x} at={[x, 0.03, -0.05]} color="#9fd0ff" lit={lit} r={0.004} halo={0.04} />
        ))}
        <Box size={[0.08, 0.06, 0.03]} position={[-0.04, 0.05, 0.05]} color={deck} />
        <Box size={[0.03, 0.03, 0.02]} position={[-0.03, 0.095, 0.05]} color={DARK} />
        <Box size={[0.06, 0.012, 0.01]} position={[0.02, 0.06, 0.066]} color="#9bc8f0" shadow={false} />
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <group key={`${sx}${sz}`} position={[sx * 0.13, -0.005, sz * 0.105]}>
              <mesh rotation-x={Math.PI / 2} castShadow material={mat(deck)}>
                <torusGeometry args={[0.045, 0.008, 6, 20]} />
              </mesh>
              <Cyl r={0.012} h={0.006} material={glowMat('#8fc2ff', lit)} segments={10} shadow={false} />
              {lit && <Glow position={[0, -0.01, 0]} color="#8fc2ff" opacity={0.7} size={0.1} />}
              <Box size={[0.08, 0.003, 0.012]} rotation-y={0.6} color={DARK} shadow={false} />
              <Box size={[0.08, 0.003, 0.012]} rotation-y={-0.9} color={DARK} shadow={false} />
              <Box size={[0.03, 0.012, 0.03]} position={[0, 0.0, -sz * 0.04]} color={deck} />
            </group>
          )),
        )}
      </group>
    </group>
  )
}

/** Loop coaster: a lift hill, a drop into a vertical loop, a return run to the station, white supports, a train on the lift */
let coasterCurve: THREE.CatmullRomCurve3 | null = null
function coaster() {
  if (!coasterCurve) {
    const p: [number, number, number][] = [
      [-0.42, 0.12, 0.1],
      [-0.37, 0.25, 0.1],
      [-0.33, 0.6, 0.1],
      [-0.3, 0.95, 0.1],
      [-0.24, 1.0, 0.1],
      [-0.18, 0.9, 0.09],
      [-0.1, 0.42, 0.07],
      [-0.02, 0.16, 0.06],
    ]
    const cx = 0.12
    const cy = 0.44
    const r = 0.3
    for (let i = 0; i <= 12; i++) {
      const th = (i / 12) * Math.PI * 2
      p.push([cx + r * Math.sin(th), cy - r * Math.cos(th), 0.05 - 0.1 * (i / 12)])
    }
    p.push([0.3, 0.15, -0.08], [0.4, 0.15, -0.12], [0.3, 0.13, -0.13], [0, 0.12, -0.13], [-0.36, 0.12, -0.12], [-0.44, 0.12, -0.02])
    coasterCurve = new THREE.CatmullRomCurve3(
      p.map((q) => new THREE.Vector3(...q)),
      true,
      'centripetal',
    )
  }
  return coasterCurve
}
function LoopCoaster({ lit }: M) {
  const curve = coaster()
  const track = useMemo(() => new THREE.TubeGeometry(curve, 360, 0.012, 8, true), [curve])
  // supports: under the lift and the drop, and the two sides of the loop
  const posts = useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; i < 60; i++) {
      const q = curve.getPointAt(i / 60)
      if (q.y > 0.18 && q.x < -0.08) out.push([q.x, q.y, q.z])
    }
    out.push([-0.18, 0.44, 0.03], [0.42, 0.44, 0.0])
    return out
  }, [curve])
  const cars = useMemo(() => [0.06, 0.075, 0.09].map((u) => curve.getPointAt(u)), [curve])
  // bulbs along the track, alternating warm white, gold and blue
  const bulbs = useMemo(() => Array.from({ length: 48 }, (_, i) => curve.getPointAt(i / 48)), [curve])
  return (
    <group>
      <Box size={[0.9, 0.02, 0.32]} position={[0, 0.01, 0]} color="#5e9e4e" radius={0.004} />
      <Box size={[0.16, 0.08, 0.1]} position={[-0.33, 0.06, 0.0]} color="#e8d27a" />
      <Box size={[0.18, 0.015, 0.12]} position={[-0.33, 0.105, 0.0]} color="#c8402e" />
      <mesh geometry={track} material={mat('#d2382b', { roughness: 0.45 })} castShadow />
      {posts.map(([x, y, z], i) => (
        <Cyl key={i} r={0.006} h={y - 0.03} position={[x, (y - 0.03) / 2 + 0.02, z]} color="#f2f2ee" segments={6} />
      ))}
      {bulbs.map((q, i) => (
        <Ball key={i} r={0.005} position={[q.x, q.y + 0.016, q.z]} material={glowMat(['#fff1c2', '#ffd04a', '#8fc2ff'][i % 3], lit)} detail={0} shadow={false} />
      ))}
      {lit && bulbs.filter((_, i) => i % 4 === 0).map((q, i) => <Glow key={i} position={[q.x, q.y + 0.016, q.z]} color="#ffe7a8" opacity={0.6} size={0.08} />)}
      <Box size={[0.1, 0.02, 0.004]} position={[-0.33, 0.14, 0.062]} material={glowMat('#ff8ad8', lit)} shadow={false} />
      {cars.map((q, i) => (
        <Box key={i} size={[0.035, 0.022, 0.03]} position={[q.x + 0.012, q.y + 0.02, q.z]} color={['#3b6fd6', '#f2c230', '#3fa34d'][i]} />
      ))}
    </group>
  )
}

/**
 * Lighthouse (like the motorized brick lighthouse): a dark blue baseplate with gray rocks, a grassy top, the keeper's house
 * (cream stone, white walls, dark red roof), a tall white tower with windows, a black gallery and a clear lantern; a small
 * white rowing boat at the dock. Lit: the lantern glows.
 */
function Lighthouse({ lit }: M) {
  const white = '#f2f2ee'
  return (
    <group>
      <Box size={[0.38, 0.012, 0.38]} position={[0, 0.006, 0]} color="#22304f" />
      <Box size={[0.32, 0.09, 0.3]} position={[0.01, 0.055, -0.02]} color="#8a8f96" radius={0.02} />
      <Box size={[0.24, 0.04, 0.22]} position={[-0.03, 0.12, -0.03]} color="#6b6f76" radius={0.015} />
      <Box size={[0.3, 0.012, 0.28]} position={[0, 0.103, -0.02]} color="#7a8a52" />
      {/* keeper's house */}
      <Box size={[0.14, 0.1, 0.12]} position={[0.06, 0.16, 0.05]} color={white} />
      <Box size={[0.145, 0.03, 0.125]} position={[0.06, 0.12, 0.05]} color="#d9c9a0" shadow={false} />
      <group position={[0.06, 0.21, 0.05]}>
        <Box size={[0.16, 0.012, 0.09]} position={[0, 0.02, -0.03]} rotation-x={0.6} color="#8c2a26" />
        <Box size={[0.16, 0.012, 0.09]} position={[0, 0.02, 0.03]} rotation-x={-0.6} color="#8c2a26" />
      </group>
      {/* tower */}
      <Cyl r={0.06} rTop={0.048} h={0.42} position={[-0.06, 0.32, -0.06]} color={white} segments={16} />
      {[0.22, 0.32, 0.42].map((y) => (
        <Box key={y} size={[0.018, 0.035, 0.008]} position={[-0.06, y, -0.008]} color="#3a3c40" shadow={false} />
      ))}
      <Cyl r={0.07} h={0.014} position={[-0.06, 0.535, -0.06]} color="#2a2b2e" segments={16} shadow={false} />
      <Cyl r={0.04} h={0.07} position={[-0.06, 0.575, -0.06]} material={lit ? glowMat('#fff2c0', true) : mat('#dfe9f2', { opacity: 0.45, roughness: 0.05 })} segments={14} shadow={false} />
      <Cyl r={0.046} rTop={0.01} h={0.03} position={[-0.06, 0.625, -0.06]} color="#1d1e22" segments={14} shadow={false} />
      <Cyl r={0.002} h={0.05} position={[-0.06, 0.665, -0.06]} color="#1d1e22" segments={4} shadow={false} />
      {lit && <Glow position={[-0.06, 0.575, -0.06]} color="#fff2c0" opacity={0.9} size={0.3} />}
      {/* boat */}
      <Box size={[0.1, 0.025, 0.04]} position={[-0.11, 0.025, 0.15]} rotation-y={0.4} color={white} radius={0.01} />
    </group>
  )
}

const MODELS: Record<string, (p: M) => JSX.Element> = {
  lighthouse: Lighthouse,
  falcon: Falcon,
  xwing: XWing,
  tie: TieFighter,
  n1: N1,
  uwing: UWing,
  concorde: Concorde,
  helicarrier: Helicarrier,
  coaster: LoopCoaster,
}

/**
 * Brick model: the variant picks the model (the freighter by default). Hung on the wall (Item.mount 'wall') it stands on a
 * slim floating shelf without its display stand (the airliner hangs on two slim brackets instead); wall snapping uses the
 * catalog depth, so the model shifts to keep its back against the wall.
 */
export function BrickModel({ v }: { v: Visual }) {
  const key = v.opts.variant && BRICK_MODEL_SIZE[v.opts.variant] ? v.opts.variant : 'falcon'
  const Model = MODELS[key]
  const lit = v.on && !v.unavailable
  if (v.opts.mount !== 'wall') return <Model lit={lit} />
  const [L, D] = [v.opts.len ?? BRICK_MODEL_SIZE[key][0], v.opts.len2 ?? BRICK_MODEL_SIZE[key][1]]
  const shift = (D - CATALOG.brickModel.size[1]) / 2
  return (
    <group position={[0, BRICK_SHELF_Y, shift]}>
      {key === 'concorde' ? (
        [-0.15, 0.15].map((x) => (
          <group key={x}>
            <Box size={[0.012, 0.012, D / 2]} position={[x, 0.03, -D / 4]} color={STAND} shadow={false} />
            <Box size={[0.012, 0.02, 0.012]} position={[x, 0.04, 0]} color={STAND} shadow={false} />
          </group>
        ))
      ) : (
        <Box size={[L * 0.9, 0.02, D * 0.8]} position={[0, -0.01, -D * 0.1]} color="#f2f0ec" radius={0.004} />
      )}
      <Model bare lit={lit} />
    </group>
  )
}

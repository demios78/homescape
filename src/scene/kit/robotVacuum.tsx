import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { deviceClass, domainOf, isActive } from '@/ha/derive'
import { activeLevel, useLayout } from '@/model/layoutStore'
import { buildPetGrid, findPath, gridRoom, randomSpot, type PetGrid } from '@/model/pets'
import { markShadows } from '../frame'
import { useLitMaterial } from './effects'
import { Ball, Box, Cyl, mat } from './primitives'
import { beamFadeTexture, spotPoolTexture, vacuumIssueTexture, type VacuumIssue } from './textures'
import type { Visual } from './visual'

type P = { v: Visual }
type Pt = { x: number; z: number }

const R = 0.165
const SPEED = 0.3
const TURN = 2.4
const GOLD = '#cbb791'
const DARK = '#1d1e22'
/** Where the robot sits on each dock (local z) and how far in front of it it drives before turning */
const DOCK_Z: Record<string, number> = { classic: 0.22, base: 0.03 }
const EXIT = 0.45

/** What the robot should do: roam while cleaning, wait where it is while paused or idle, otherwise go home. */
function wantOf(v: Visual): 'roam' | 'stay' | 'home' {
  if (v.edit || !v.bound) return 'home'
  if (v.domain !== 'vacuum') return v.on ? 'roam' : 'home'
  if (v.state === 'cleaning') return 'roam'
  if (v.state === 'paused' || v.state === 'idle' || v.state === 'error') return 'stay'
  return 'home'
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Error words to issue icons, checked in order against the vacuum's error text (any language HA reports in English). */
const ISSUES: [RegExp, VacuumIssue][] = [
  [/brush|tangle|roller|hair/, 'brush'],
  [/bin|dust|debris|full|bag|evacuat|empty/, 'bin'],
  [/water|tank|mop|pad|clean water|dirty water/, 'water'],
  [/battery|charg|power|low/, 'battery'],
  [/cliff|sensor|lidar|laser|bumper|camera|lens|navig/, 'sensor'],
  [/stuck|trap|wheel|lift|tilt|blocked|obstacle|motor/, 'stuck'],
]

/**
 * The robot's error, or null: its vacuum entity (main or bound) in the 'error' state, or a bound problem sensor that is on.
 * The issue comes from the error text in the attributes (error, error_message, status...) or an error sensor's state.
 */
function issueOf(v: Visual): VacuumIssue | null {
  const vac = v.domain === 'vacuum' ? { state: v.state, attributes: v.attrs } : v.related.find((e) => domainOf(e.entity_id) === 'vacuum')
  const problem = v.related.find((e) => domainOf(e.entity_id) === 'binary_sensor' && deviceClass(e) === 'problem' && isActive(e))
  const sensor = v.related.find((e) => domainOf(e.entity_id) === 'sensor' && /error/.test(e.entity_id) && !/^(none|ok|no error|0|unknown|unavailable|)$/i.test(e.state))
  if (vac?.state !== 'error' && !problem && !sensor) return null
  const a = vac?.attributes ?? {}
  const text = [a.error, a.error_message, a.error_code, a.status, sensor?.state, sensor?.attributes.error].filter((x) => x != null).join(' ').toLowerCase()
  for (const [re, kind] of ISSUES) if (re.test(text)) return kind
  return 'alert'
}

const red = '#ff3b30'
let beam: THREE.MeshBasicMaterial | null = null
const beamMat = () =>
  (beam ??= new THREE.MeshBasicMaterial({ color: red, map: beamFadeTexture(), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }))
let pool: THREE.MeshBasicMaterial | null = null
const poolMat = () =>
  (pool ??= new THREE.MeshBasicMaterial({ color: red, map: spotPoolTexture(), transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }))
const issueMats = new Map<VacuumIssue, THREE.SpriteMaterial>()
const issueMat = (k: VacuumIssue) => {
  let m = issueMats.get(k)
  if (!m) {
    m = new THREE.SpriteMaterial({ map: vacuumIssueTexture(k), toneMapped: false, depthWrite: false, sizeAttenuation: false })
    issueMats.set(k, m)
  }
  return m
}
const noHit = () => null

/**
 * Red error spotlight from above (beam cone fading upward, a red pool on the floor) with the issue badge floating at
 * badgeY. r: the pool radius on the floor.
 */
function ErrorSpot({ issue, r, badgeY }: { issue: VacuumIssue; r: number; badgeY: number }) {
  const H = 1.7
  return (
    <group>
      <mesh position={[0, H / 2, 0]} material={beamMat()} renderOrder={12} userData={{ selectionAid: true }} raycast={noHit}>
        <cylinderGeometry args={[0.05, r * 0.85, H, 28, 1, true]} />
      </mesh>
      <mesh position={[0, 0.016, 0]} rotation-x={-Math.PI / 2} material={poolMat()} renderOrder={4} userData={{ selectionAid: true }} raycast={noHit}>
        <planeGeometry args={[r * 2, r * 2]} />
      </mesh>
      <sprite position={[0, badgeY, 0]} scale={[0.032, 0.032, 1]} material={issueMat(issue)} renderOrder={13} raycast={noHit} />
    </group>
  )
}

/** The robot: round body, front sensor windows with a camera, the lidar turret on top, a side brush underneath. */
function Robot({ color, active, brush }: { color: string; active: boolean; brush: React.RefObject<THREE.Group | null> }) {
  const black = color !== '#f2f2ef'
  const led = useLitMaterial('#7d8290', active, '#4fd27a', 1, 2.4)
  const top = black ? '#36373d' : '#e7e7e3'
  const windows = [-0.42, 0.42]
  return (
    <group>
      <Cyl r={R} h={0.07} position={[0, 0.042, 0]} color={color} segments={40} />
      <Cyl r={R - 0.006} h={0.006} position={[0, 0.08, 0]} color={top} segments={40} shadow={false} />
      <Cyl r={R - 0.004} h={0.012} position={[0, 0.012, 0]} color={DARK} segments={40} shadow={false} />
      {/* front sensor windows and the camera between them */}
      {windows.map((a) => (
        <Box key={a} size={[0.07, 0.034, 0.012]} position={[Math.sin(a) * (R - 0.002), 0.045, Math.cos(a) * (R - 0.002)]} rotation={[0, a, 0]} color={DARK} radius={0.008} shadow={false} />
      ))}
      <Box size={[0.034, 0.034, 0.012]} position={[0, 0.045, R]} color={GOLD} radius={0.005} shadow={false} />
      <Box size={[0.018, 0.018, 0.006]} position={[0, 0.045, R + 0.005]} color={DARK} shadow={false} />
      {/* side window and wheel well hints */}
      <Box size={[0.055, 0.028, 0.012]} position={[R - 0.004, 0.045, 0.04]} rotation={[0, Math.PI / 2 + 0.25, 0]} color={DARK} radius={0.01} shadow={false} />
      {/* lidar turret */}
      <Cyl r={0.044} h={0.014} position={[0.0, 0.089, -0.02]} color={DARK} segments={28} shadow={false} />
      <Cyl r={0.052} h={0.02} position={[0.0, 0.105, -0.02]} material={mat(GOLD, { metalness: 0.35, roughness: 0.35 })} segments={32} />
      <Box size={[0.05, 0.004, 0.012]} position={[0, 0.087, 0.09]} color={DARK} shadow={false} />
      <Ball r={0.006} position={[0.06, 0.086, 0.09]} material={led} shadow={false} />
      {/* side brush (front left) */}
      <group ref={brush} position={[-0.105, 0.004, 0.105]}>
        {[0, 1, 2].map((i) => (
          <Box key={i} size={[0.004, 0.002, 0.07]} position={[Math.sin((i * 2 * Math.PI) / 3) * 0.035, 0, Math.cos((i * 2 * Math.PI) / 3) * 0.035]} rotation={[0, (i * 2 * Math.PI) / 3, 0]} color="#3a3c44" shadow={false} />
        ))}
      </group>
    </group>
  )
}

/** Self-emptying base: a two tank tower over a bay the robot backs into, a champagne band, a ribbed ramp in front. 0.4 m wide. */
function Base({ color }: { color: string }) {
  const black = color !== '#f2f2ef'
  const water = mat('#5b8fe0', { opacity: 0.75, roughness: 0.15 })
  const glass = mat('#30333c', { opacity: 0.85, roughness: 0.1 })
  const inner = black ? '#232428' : '#ecece8'
  return (
    <group>
      {/* ramp and plinth */}
      <Box size={[0.38, 0.012, 0.3]} position={[0, 0.006, 0.0]} color={DARK} radius={0.004} />
      {[-0.1, -0.04, 0.02, 0.08].map((z) => (
        <Box key={z} size={[0.36, 0.004, 0.012]} position={[0, 0.014, z + 0.07]} color="#2b2d33" shadow={false} />
      ))}
      <Box size={[0.4, 0.03, 0.3]} position={[0, 0.015, -0.05]} color={DARK} />
      {/* bay: side columns and back */}
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.03, 0.2, 0.3]} position={[s * 0.185, 0.13, -0.05]} color={color} radius={0.006} />
      ))}
      <Box size={[0.34, 0.2, 0.03]} position={[0, 0.13, -0.185]} color={inner} />
      {/* band and the tank tower */}
      <Box size={[0.405, 0.035, 0.305]} position={[0, 0.247, -0.05]} material={mat(GOLD, { metalness: 0.35, roughness: 0.35 })} radius={0.006} />
      <Box size={[0.08, 0.016, 0.01]} position={[0, 0.247, 0.103]} color="#e2d6bd" radius={0.004} shadow={false} />
      <Box size={[0.4, 0.22, 0.3]} position={[0, 0.375, -0.05]} color={color} radius={0.018} />
      {/* ribbed lid front, handle notch */}
      {Array.from({ length: 9 }, (_, i) => (
        <Box key={i} size={[0.004, 0.19, 0.004]} position={[-0.07 + i * 0.02, 0.37, 0.101]} color={black ? '#3a3b42' : '#e4e4e0'} shadow={false} />
      ))}
      <Box size={[0.05, 0.01, 0.01]} position={[0, 0.476, 0.08]} color={black ? '#3a3b42' : '#dcdcd8'} shadow={false} />
      {/* clean water window (right) and dirty water window (left) */}
      <Box size={[0.06, 0.18, 0.006]} position={[0.135, 0.37, 0.101]} material={glass} radius={0.004} shadow={false} />
      <Box size={[0.05, 0.1, 0.006]} position={[0.135, 0.33, 0.104]} material={water} shadow={false} />
      <Box size={[0.02, 0.16, 0.006]} position={[-0.17, 0.37, 0.101]} material={glass} shadow={false} />
    </group>
  )
}

/** Old charging dock: a low block against the wall */
function ClassicDock() {
  return <Box size={[0.36, 0.12, 0.12]} position={[0, 0.06, -0.06]} color={DARK} radius={0.03} />
}

/**
 * Robot vacuum on its dock (Item.variant 'classic' charging dock | 'base' self-emptying base; color Item.body white or black).
 * While its vacuum entity is cleaning the robot drives off the dock and roams the floor on the walking grid (model/pets.ts,
 * 'robot': it keeps clear of walls and furniture and passes under tables and chairs): mostly in its own room, now and then
 * another reachable room. Returning or docked, it drives back, turns and reverses onto the dock; paused or idle, it waits.
 * The robot is drawn in world coordinates (the item group's transform undone, like the ceiling strip), so it can leave the
 * footprint. Only on the active floor and in View; in Edit it sits on the dock. In an error (issueOf) a red spotlight with a
 * floating issue badge shines on the dock, and on the robot too once it is off the dock.
 */
export function RobotVacuum({ v }: P) {
  const variant = v.opts.variant === 'base' ? 'base' : 'classic'
  const color = v.opts.body ?? '#f2f2ef'
  const level = useLayout((s) => activeLevel(s))
  const at = v.at
  const onLevel = Boolean(at && level?.items.some((i) => i.kind === 'robotVacuum' && Math.abs(i.x - at.x) < 1e-4 && Math.abs(i.z - at.z) < 1e-4))
  const grid = useMemo<PetGrid | null>(() => (onLevel && level ? buildPetGrid(level, 'robot') : null), [onLevel, level])
  const invalidate = useThree((s) => s.invalidate)
  const want = wantOf(v)
  useEffect(() => invalidate(), [want, invalidate])

  const body = useRef<THREE.Group>(null)
  const brush = useRef<THREE.Group>(null)
  // The robot's own error spot: hidden while it sits on the dock (the dock's spot covers both)
  const spot = useRef<THREE.Group>(null)
  const sim = useRef({ out: false, x: 0, z: 0, yaw: 0, queue: [] as Pt[], backing: false, docking: false, wait: 0, init: false })

  // Docked pose in the frame the robot is drawn in (world when the item position is known, else item local)
  const dz = DOCK_Z[variant]
  const toFrame = (lx: number, lz: number): Pt => {
    if (!at) return { x: lx, z: lz }
    const c = Math.cos(at.rot)
    const s = Math.sin(at.rot)
    return { x: at.x + lx * c + lz * s, z: at.z - lx * s + lz * c }
  }
  const dockYaw = at ? at.rot : 0

  useFrame((state, dt) => {
    const g = body.current
    if (!g) return
    const s = sim.current
    const dock = toFrame(0, dz)
    const exit = toFrame(0, dz + EXIT)
    const step = Math.min(dt, 0.1)
    let moving = false
    if (!s.out || !grid || !s.init) {
      s.init = true
      s.x = dock.x
      s.z = dock.z
      s.yaw = dockYaw
      s.out = want === 'roam' && Boolean(grid)
      s.backing = false
      s.docking = false
      s.queue = s.out ? [exit] : []
    } else if (want === 'home' && !s.backing) {
      // Head straight for the spot in front of the dock (dropping the rest of the cleaning run), then reverse in
      const path = findPath(grid, s, exit) ?? []
      s.queue = [...path, exit]
      s.backing = true
    } else if (want === 'roam' && s.backing) {
      s.backing = false
      s.docking = false
      s.queue = []
    }
    if (s.out && want !== 'stay') {
      if (!s.queue.length && want === 'roam') {
        s.wait -= step
        if (s.wait <= 0) {
          const room = gridRoom(grid!, exit.x, exit.z)
          const rnd = Math.random
          const to = (rnd() < 0.7 ? randomSpot(grid!, rnd, false, room) : null) ?? randomSpot(grid!, rnd, false)
          const path = to ? findPath(grid!, s, to) : null
          if (path && path.length) s.queue = path
          s.wait = 0.6 + rnd() * 1.2
        }
      }
      const p = s.queue[0]
      if (p) {
        const dx = p.x - s.x
        const dzz = p.z - s.z
        const d = Math.hypot(dx, dzz)
        if (d < 0.01) {
          s.queue.shift()
          if (s.backing && !s.queue.length) s.docking = true
          moving = true
        } else {
          const aim = Math.atan2(dx, dzz)
          const diff = wrap(aim - s.yaw)
          const turn = Math.sign(diff) * Math.min(Math.abs(diff), TURN * step)
          s.yaw = wrap(s.yaw + turn)
          if (Math.abs(diff) < 0.2) {
            const m = Math.min(d, SPEED * step)
            s.x += (dx / d) * m
            s.z += (dzz / d) * m
          }
          moving = true
        }
      } else if (s.docking) {
        // In front of the dock: face away from it, then reverse onto it
        const diff = wrap(dockYaw - s.yaw)
        if (Math.abs(diff) > 0.01) {
          s.yaw = wrap(s.yaw + Math.sign(diff) * Math.min(Math.abs(diff), TURN * step))
          moving = true
        } else {
          const dx = dock.x - s.x
          const dzz = dock.z - s.z
          const d = Math.hypot(dx, dzz)
          if (d < 0.005) {
            s.out = false
            s.backing = false
            s.docking = false
            s.x = dock.x
            s.z = dock.z
          } else {
            const m = Math.min(d, SPEED * 0.6 * step)
            s.x += (dx / d) * m
            s.z += (dzz / d) * m
            moving = true
          }
        }
      }
    }
    if (g.position.x !== s.x || g.position.z !== s.z || g.rotation.y !== s.yaw) {
      g.position.set(s.x, 0, s.z)
      g.rotation.y = s.yaw
      markShadows(1)
    }
    if (spot.current) {
      const away = Math.hypot(s.x - dock.x, s.z - dock.z) > 0.3
      if (spot.current.visible !== away) {
        spot.current.visible = away
        moving = true
      }
    }
    if (brush.current && s.out && want === 'roam') brush.current.rotation.y += step * 14
    // Keep frames coming while away and not paused: a frame that only pops a waypoint moves nothing but must not end the loop
    if (moving || (s.out && want !== 'stay')) state.invalidate()
  })

  // In an error: a red spotlight and the issue badge over the dock and over the robot (wherever it stopped)
  const issue = v.edit ? null : issueOf(v)
  const robot = (
    <group ref={body}>
      <Robot color={color} active={want === 'roam'} brush={brush} />
      {issue && (
        <group ref={spot} visible={false}>
          <ErrorSpot issue={issue} r={0.42} badgeY={0.6} />
        </group>
      )}
    </group>
  )
  return (
    <group>
      {variant === 'base' ? <Base color={color} /> : <ClassicDock />}
      {issue && (
        <group position={[0, 0, variant === 'base' ? -0.05 : -0.06]}>
          <ErrorSpot issue={issue} r={0.38} badgeY={variant === 'base' ? 0.72 : 0.36} />
        </group>
      )}
      {at ? (
        <group rotation-y={-at.rot}>
          <group position={[-at.x, 0, -at.z]}>{robot}</group>
        </group>
      ) : (
        robot
      )}
    </group>
  )
}

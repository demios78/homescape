import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { formatNumber } from '@/i18n'
import { isActive, num } from '@/ha/derive'
import { useAmbient, useLitMaterial } from './effects'
import { C } from './palette'
import { Ball, Box, Cyl, mat } from './primitives'
import type { Visual } from './visual'
import { TUB_FULL_GAL, toGallons, useFlowOf, useWaterRunning } from './water'

/* ---------- running water ---------- */

/** Vertical streaks of falling water (repeats along v); its offset scrolls while water runs */
let streakTex: THREE.CanvasTexture | null = null
function streakTexture() {
  if (streakTex) return streakTex
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillRect(0, 0, 32, 64)
  g.fillStyle = 'rgba(255,255,255,1)'
  for (const [x, y, h] of [[2, 4, 18], [9, 30, 22], [15, 10, 14], [21, 40, 18], [27, 20, 24], [5, 50, 10], [18, 56, 8]]) g.fillRect(x, y, 2, h)
  streakTex = new THREE.CanvasTexture(c)
  streakTex.wrapS = streakTex.wrapT = THREE.RepeatWrapping
  return streakTex
}

/** Streak textures of every water material in the scene; they scroll together */
const streams = new Set<THREE.Texture>()

/** Scrolls the water textures downward while water runs (once per frame, whoever calls first) */
let lastFrame = -1
function useFlowing(active: boolean) {
  useAmbient(active)
  useFrame((state) => {
    if (!active || state.clock.elapsedTime === lastFrame) return
    lastFrame = state.clock.elapsedTime
    const y = (state.clock.elapsedTime * 1.6) % 1
    for (const t of streams) t.offset.y = y
  })
}

function useWaterMaterial(opacity: number, repeat: [number, number]) {
  const m = useMemo(() => {
    const map = streakTexture().clone()
    map.repeat.set(repeat[0], repeat[1])
    map.needsUpdate = true
    return new THREE.MeshStandardMaterial({ color: '#a9dcff', map, transparent: true, opacity, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide })
  }, [opacity, repeat[0], repeat[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = m.map
    if (map) streams.add(map)
    return () => {
      if (map) streams.delete(map)
      m.dispose()
    }
  }, [m])
  return m
}

/** A thin stream of water falling `length` from `at` (its top), with a small splash ring where it lands */
function Stream({ at, length, r = 0.008 }: { at: [number, number, number]; length: number; r?: number }) {
  const m = useWaterMaterial(0.8, [1, length * 6])
  return (
    <group position={at}>
      <mesh position={[0, -length / 2, 0]} material={m} renderOrder={5}>
        <cylinderGeometry args={[r, r * 1.15, length, 10, 1, true]} />
      </mesh>
      <mesh position={[0, -length + 0.003, 0]} rotation-x={-Math.PI / 2} renderOrder={5}>
        <ringGeometry args={[r * 1.6, r * 4, 20]} />
        <meshBasicMaterial color="#e6f5ff" transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Faucet stream that runs while the house's water flow is below the shower threshold (water.ts > useWaterRunning) */
export function FaucetFlow({ at, length, r }: { at: [number, number, number]; length: number; r?: number }) {
  const run = useWaterRunning() === 'sink'
  useFlowing(run)
  return run ? <Stream at={at} length={length} r={r} /> : null
}

/** Shower spray from the head down to the tray while the flow is at or above the shower threshold */
export function ShowerFlow({ at, length, top = 0.07, bottom = 0.22 }: { at: [number, number, number]; length: number; top?: number; bottom?: number }) {
  const run = useWaterRunning() === 'shower'
  useFlowing(run)
  const m = useWaterMaterial(0.42, [4, length * 3])
  if (!run) return null
  return (
    <group position={at}>
      <mesh position={[0, -length / 2, 0]} material={m} renderOrder={5}>
        <cylinderGeometry args={[top, bottom, length, 24, 1, true]} />
      </mesh>
      <mesh position={[0, -length + 0.004, 0]} rotation-x={-Math.PI / 2} renderOrder={5}>
        <circleGeometry args={[bottom * 1.05, 24]} />
        <meshBasicMaterial color="#d8efff" transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ---------- bathtub filled by today's water use ---------- */

/**
 * Tub water: bound to a water total sensor (today's use), the tub fills in proportion to Item.fullAt gallons (default 200)
 * and overflows past it: water at the rim, sheets running down the front and both ends, a puddle around the tub.
 * w, d: inner size; y0 / y1: inner bottom and rim height; ow, od: outer size.
 */
export function TubWater({ v, w, d, y0, y1, ow, od }: { v: Visual; w: number; d: number; y0: number; y1: number; ow: number; od: number }) {
  const n = v.domain === 'sensor' && !v.unavailable ? num(v.state) : null
  const gal = n != null ? toGallons(n, v.attrs.unit_of_measurement) : null
  const frac = gal == null ? 0 : gal / (v.opts.fullAt ?? TUB_FULL_GAL)
  const over = frac > 1
  useFlowing(over)
  const sheet = useWaterMaterial(0.55, [3, 2])
  const water = mat('#8ecbf2', { opacity: 0.78, roughness: 0.08 })
  if (frac <= 0.005) return null
  const h = Math.min(1, frac) * (y1 - y0 - 0.01)
  return (
    <group>
      <Box size={[w, h, d]} position={[0, y0 + h / 2, 0]} material={water} shadow={false} />
      {over && (
        <>
          {/* sheets over the front rim and both ends */}
          <mesh position={[0, y1 / 2, od / 2 + 0.004]} material={sheet} renderOrder={5}>
            <planeGeometry args={[ow * 0.8, y1]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (ow / 2 + 0.004), y1 / 2, 0]} rotation-y={Math.PI / 2} material={sheet} renderOrder={5}>
              <planeGeometry args={[od * 0.7, y1]} />
            </mesh>
          ))}
          <mesh position={[0, 0.004, 0.12]} rotation-x={-Math.PI / 2} scale={[ow / 2 + 0.45, od / 2 + 0.45, 1]} renderOrder={4}>
            <circleGeometry args={[1, 40]} />
            <meshStandardMaterial color="#8ecbf2" transparent opacity={0.5} roughness={0.05} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

/* ---------- water meter ---------- */

/** Register face of the water meter: today's total as odometer digits with its unit; dashes while unbound */
function registerTexture(text: string, unit: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#f3efe2'
  g.beginPath()
  g.arc(128, 128, 126, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#2a2b30'
  g.lineWidth = 3
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const r0 = i % 5 ? 112 : 104
    g.beginPath()
    g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0)
    g.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120)
    g.stroke()
  }
  g.fillStyle = '#16171b'
  g.fillRect(36, 92, 184, 50)
  g.fillStyle = '#ffffff'
  g.font = '600 34px ui-monospace, Menlo, monospace'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const fit = Math.min(1, 172 / g.measureText(text).width)
  g.font = `600 ${Math.floor(34 * fit)}px ui-monospace, Menlo, monospace`
  g.fillText(text, 128, 118)
  g.fillStyle = '#2a2b30'
  g.font = '600 22px ui-sans-serif, system-ui, sans-serif'
  g.fillText(unit, 128, 172)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Water meter on the main pipe (waterMeter, like a utility meter with a Flume sensor strapped to it): a copper pipe along
 * the wall, a brass meter body with a register showing today's total (the main entity) and a red flow star that spins
 * while water runs (a flow rate sensor among the extras), and the gray smart sensor with its light: blue while water
 * flows, red when a bound leak sensor is on. Center 45 cm above the floor (height adjustable); back -z.
 */
export function WaterMeter({ v }: { v: Visual }) {
  const Y = 0.45
  const n = v.domain === 'sensor' && !v.unavailable ? num(v.state) : null
  const unit = typeof v.attrs.unit_of_measurement === 'string' ? v.attrs.unit_of_measurement : 'gal'
  const text = n == null ? '-----' : formatNumber(Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10, 1)
  const tex = useMemo(() => registerTexture(text, unit), [text, unit])
  useEffect(() => () => tex.dispose(), [tex])
  const flow = useFlowOf(v.related.map((e) => e.entity_id))
  const running = flow != null && flow > 0.02
  const leak = v.related.some((e) => e.entity_id.startsWith('binary_sensor.') && /leak/i.test(e.entity_id) && isActive(e))
  useAmbient(running)
  const copper = mat('#c8875a', { metalness: 0.3, roughness: 0.4 })
  const brass = mat('#b8913f', { metalness: 0.35, roughness: 0.4 })
  const gray = mat('#5d6068', { roughness: 0.5 })
  const led = useLitMaterial('#8d93ae', v.bound && (running || leak), leak ? C.alarm : C.cool, 1, 2.6)
  return (
    <group position={[0, Y, 0]}>
      {/* pipe along the wall, elbows into the wall at both ends */}
      <Cyl r={0.022} h={0.5} position={[0, 0, 0.0]} rotation-z={Math.PI / 2} material={copper} segments={14} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Ball r={0.026} position={[s * 0.25, 0, 0]} material={copper} detail={1} />
          <Cyl r={0.022} h={0.06} position={[s * 0.25, 0, -0.03]} rotation-x={Math.PI / 2} material={copper} segments={14} />
          <Cyl r={0.03} h={0.025} position={[s * 0.1, 0, 0]} rotation-z={Math.PI / 2} material={brass} segments={6} />
        </group>
      ))}
      {/* meter body and register (tilted toward the room) */}
      <Cyl r={0.055} h={0.14} position={[0, 0, 0]} rotation-z={Math.PI / 2} material={brass} segments={20} />
      <group position={[0, 0.055, 0.01]} rotation-x={0.7}>
        <Cyl r={0.068} h={0.05} position={[0, 0.02, 0]} material={brass} segments={24} />
        <mesh position={[0, 0.0455, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.06, 32]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        <FlowStar running={running} />
      </group>
      {/* smart sensor strapped under the pipe */}
      <group position={[0.05, -0.06, 0.02]}>
        <Box size={[0.09, 0.05, 0.06]} material={gray} radius={0.015} />
        <Box size={[0.02, 0.012, 0.13]} position={[0.03, 0.035, -0.015]} color="#2a2b30" shadow={false} />
        <Ball r={0.006} position={[-0.025, 0.01, 0.031]} material={led} detail={1} shadow={false} />
      </group>
    </group>
  )
}

/** Red flow indicator on the register: a small three-point star that spins while water runs */
function FlowStar({ running }: { running: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (running && g) g.rotation.y += dt * 9
  })
  return (
    <group ref={ref} position={[0.025, 0.048, 0.025]}>
      {[0, 1, 2].map((i) => (
        <Box key={i} size={[0.003, 0.002, 0.018]} position={[Math.sin((i * Math.PI * 2) / 3) * 0.007, 0, Math.cos((i * Math.PI * 2) / 3) * 0.007]} rotation-y={(i * Math.PI * 2) / 3} color="#d23a2f" shadow={false} />
      ))}
    </group>
  )
}

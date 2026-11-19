import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Glow, Spin, useLitMaterial } from './effects'
import { C } from './palette'
import { Ball, Box, Cyl, mat } from './primitives'
import type { Visual } from './visual'

/*
 * Major appliances: washer, dryer, dishwasher, oven.
 * All 60 × 60 cm, back against the wall (-z), front at +z. Washer/dryer/dishwasher can be stacked
 * (rules.ts > APPLIANCE_STACK); the upper one is raised in ItemNode. Runs while the bound entity is "on":
 * the drum spins, the display lights up, the oven glass glows orange.
 */

type P = { v: Visual }
const W = 0.6
const H = 0.85
const D = 0.58
const FRONT = D / 2

/** Door glass: translucent dark blue; the spinning laundry shows behind it. */
function useDoorGlass(tint: string) {
  return useMemo(() => new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2 }), [tint])
}

/** Machine with a round front door (shared body of washer and dryer). */
function DrumMachine({ v, ring, tint, panel }: P & { ring: string; tint: string; panel: string }) {
  const glass = useDoorGlass(tint)
  const led = useLitMaterial('#9aa0b8', v.on, C.ok, 1, 2.2)
  const speed = v.on ? 7 : 0
  return (
    <group>
      <Box size={[W, H, D]} position={[0, H / 2, 0]} color={C.white} radius={0.025} />
      {/* control panel */}
      <Box size={[W - 0.04, 0.11, 0.012]} position={[0, H - 0.08, FRONT + 0.004]} color={panel} shadow={false} />
      <Cyl r={0.032} h={0.02} position={[0.18, H - 0.08, FRONT + 0.012]} rotation={[Math.PI / 2, 0, 0]} color={C.steel} segments={18} shadow={false} />
      <Box size={[0.12, 0.035, 0.008]} position={[-0.12, H - 0.08, FRONT + 0.012]} material={led} shadow={false} />
      {/* door: ring, glass, spinning laundry inside */}
      <group position={[0, 0.4, FRONT + 0.006]}>
        <mesh>
          <torusGeometry args={[0.17, 0.025, 10, 36]} />
          <meshStandardMaterial color={ring} roughness={0.35} metalness={0.3} />
        </mesh>
        <Spin speed={speed}>
          <Ball r={0.05} position={[0.06, 0.03, -0.03]} color={C.coral} detail={1} shadow={false} />
          <Ball r={0.045} position={[-0.05, -0.04, -0.03]} color={C.brandLight} detail={1} shadow={false} />
          <Ball r={0.04} position={[0.01, -0.07, -0.03]} color={C.sun} detail={1} shadow={false} />
        </Spin>
        <mesh material={glass} position={[0, 0, 0.004]} renderOrder={3}>
          <circleGeometry args={[0.155, 36]} />
        </mesh>
      </group>
    </group>
  )
}

const CHROME = mat('#d9dce2', { metalness: 0.45, roughness: 0.18 })
const GLASS_BLACK = mat('#15171c', { roughness: 0.12, metalness: 0.2 })

/**
 * Large front loader (Item.variant 'profile'): 0.71 × 0.81 m, 1 m tall, body color Item.body. A black glass control panel
 * framed in chrome across the top (washer: detergent drawer on the left; dryer: a round logo), power and start buttons, a
 * chrome cycle knob, a display that lights while running; a big chrome ring door with smoked glass over a recessed plinth.
 */
function ProfileMachine({ v, washer }: P & { washer: boolean }) {
  const body = v.opts.body ?? '#eeeeec'
  const glass = useDoorGlass('#1c2130')
  const display = useLitMaterial('#262a33', v.on, '#8fd0ff', 1, 1.8)
  const PW = 0.71
  const PH = 1.0
  const PD = 0.78
  const F = PD / 2
  const py = 0.895
  return (
    <group>
      <Box size={[PW - 0.06, 0.035, PD - 0.08]} position={[0, 0.0175, -0.02]} color="#1b1c20" />
      <Box size={[PW, PH - 0.035, PD]} position={[0, 0.035 + (PH - 0.035) / 2, 0]} color={body} radius={0.03} />
      {/* control panel: black glass in a chrome frame */}
      <Box size={[PW - 0.02, 0.165, 0.02]} position={[0, py, F + 0.006]} material={GLASS_BLACK} radius={0.008} shadow={false} />
      <Box size={[PW - 0.02, 0.008, 0.026]} position={[0, py - 0.085, F + 0.006]} material={CHROME} shadow={false} />
      <Box size={[PW - 0.02, 0.006, 0.026]} position={[0, py + 0.083, F + 0.006]} material={CHROME} shadow={false} />
      {washer ? (
        <>
          <Box size={[0.15, 0.13, 0.012]} position={[-0.26, py, F + 0.019]} color={body} radius={0.006} shadow={false} />
          <Box size={[0.07, 0.012, 0.006]} position={[-0.26, py - 0.045, F + 0.026]} color="#1b1c20" shadow={false} />
        </>
      ) : (
        <>
          <Cyl r={0.018} h={0.004} position={[-0.3, py + 0.05, F + 0.018]} rotation={[Math.PI / 2, 0, 0]} material={CHROME} segments={20} shadow={false} />
          <Box size={[0.07, 0.012, 0.004]} position={[-0.27, py - 0.03, F + 0.018]} color="#3a3d46" shadow={false} />
        </>
      )}
      {/* power and start buttons, cycle knob, display */}
      <Box size={[0.032, 0.075, 0.006]} position={[-0.14, py, F + 0.018]} color="#2a2d35" radius={0.008} shadow={false} />
      <Cyl r={0.048} h={0.03} position={[-0.04, py, F + 0.026]} rotation={[Math.PI / 2, 0, 0]} material={CHROME} segments={28} />
      <Cyl r={0.036} h={0.006} position={[-0.04, py, F + 0.042]} rotation={[Math.PI / 2, 0, 0]} color="#2d3038" segments={28} shadow={false} />
      <Box size={[0.24, 0.12, 0.006]} position={[0.19, py, F + 0.018]} material={display} radius={0.01} shadow={false} />
      {/* door: chrome ring, smoked glass, laundry turning behind it */}
      <group position={[0, 0.43, F + 0.012]}>
        <mesh>
          <torusGeometry args={[0.26, 0.02, 12, 48]} />
          <primitive object={CHROME} attach="material" />
        </mesh>
        <Cyl r={0.25} h={0.012} position={[0, 0, -0.004]} rotation={[Math.PI / 2, 0, 0]} color="#22252c" segments={48} shadow={false} />
        <Spin speed={v.on ? 7 : 0}>
          <Ball r={0.05} position={[0.09, 0.05, -0.01]} color="#c97a6c" detail={1} shadow={false} />
          <Ball r={0.045} position={[-0.08, -0.06, -0.01]} color="#7d8fc9" detail={1} shadow={false} />
          <Ball r={0.04} position={[0.03, -0.12, -0.01]} color="#d8c48a" detail={1} shadow={false} />
        </Spin>
        <mesh material={glass} position={[0, 0, 0.012]} renderOrder={3}>
          <circleGeometry args={[0.245, 48]} />
        </mesh>
      </group>
    </group>
  )
}

export function Washer({ v }: P) {
  if (v.opts.variant === 'profile') return <ProfileMachine v={v} washer />
  return <DrumMachine v={v} ring={C.steel} tint="#2a3a6a" panel={C.offWhite} />
}

export function Dryer({ v }: P) {
  if (v.opts.variant === 'profile') return <ProfileMachine v={v} washer={false} />
  return <DrumMachine v={v} ring={C.white} tint="#59627e" panel={C.brandPale} />
}

/** Dishwasher: full height door, horizontal handle and LED strip at the top. */
export function Dishwasher({ v }: P) {
  const led = useLitMaterial('#9aa0b8', v.on, C.cool, 1, 2.2)
  // Stainless (variant 'steel'): a brushed steel door, like a built-in under a worktop
  const steel = v.opts.variant === 'steel'
  const face = steel ? mat('#c9ccd2', { metalness: 0.55, roughness: 0.32 }) : undefined
  return (
    <group>
      <Box size={[W, H, D]} position={[0, H / 2, 0]} color={steel ? '#2a2c33' : C.white} radius={0.02} />
      <Box size={[W - 0.03, H - 0.14, 0.014]} position={[0, (H - 0.14) / 2 + 0.03, FRONT + 0.005]} color={C.offWhite} material={face} shadow={false} />
      <Box size={[W - 0.03, 0.08, 0.014]} position={[0, H - 0.06, FRONT + 0.005]} color={C.steel} shadow={false} />
      <Box size={[0.36, 0.02, 0.03]} position={[0, H - 0.17, FRONT + 0.022]} color={C.steel} />
      <Box size={[0.2, 0.012, 0.008]} position={[0.12, H - 0.06, FRONT + 0.014]} material={led} shadow={false} />
      {v.on && <Glow position={[0, 0.05, FRONT + 0.15]} color={C.cool} opacity={v.night ? 0.5 : 0.2} size={0.7} />}
    </group>
  )
}

/**
 * Oven: "Under counter" (85 cm body, counter on top) or "Tall unit" (210 cm cabinet, oven at eye level).
 * The glass glows orange while the bound entity is on.
 */
export function Oven({ v }: P) {
  const tall = v.opts.variant === 'tall'
  const glass = useLitMaterial('#1b2036', v.on, '#ff9a4a', 0.9, 1.6)
  const y0 = tall ? 0.9 : 0.12
  const oven = (
    <group position={[0, y0, 0]}>
      <Box size={[W - 0.03, 0.58, 0.014]} position={[0, 0.29, FRONT + 0.005]} color={C.ink} shadow={false} />
      <Box size={[0.46, 0.3, 0.008]} position={[0, 0.25, FRONT + 0.014]} material={glass} shadow={false} />
      <Box size={[0.4, 0.02, 0.03]} position={[0, 0.48, FRONT + 0.03]} color={C.steel} />
      <Box size={[W - 0.03, 0.08, 0.014]} position={[0, 0.62, FRONT + 0.005]} color={C.steel} shadow={false} />
      {[-0.18, -0.06, 0.06, 0.18].map((x) => (
        <Cyl key={x} r={0.02} h={0.02} position={[x, 0.62, FRONT + 0.016]} rotation={[Math.PI / 2, 0, 0]} color={C.ink} segments={14} shadow={false} />
      ))}
      {v.on && <Glow position={[0, 0.25, FRONT + 0.15]} color="#ff9a4a" opacity={v.night ? 0.6 : 0.3} size={0.8} />}
    </group>
  )
  if (!tall)
    return (
      <group>
        <Box size={[W, 0.87, D]} position={[0, 0.435, 0]} color={C.white} />
        <Box size={[W + 0.02, 0.04, D + 0.02]} position={[0, 0.89, 0]} color={C.offWhite} />
        {oven}
      </group>
    )
  return (
    <group>
      <Box size={[W, 2.1, D]} position={[0, 1.05, 0]} color={C.white} radius={0.015} />
      {/* bottom drawer and top door */}
      <Box size={[W - 0.03, 0.8, 0.012]} position={[0, 0.44, FRONT + 0.004]} color={C.sunPale} shadow={false} />
      <Box size={[0.2, 0.02, 0.025]} position={[0, 0.78, FRONT + 0.02]} color={C.steel} shadow={false} />
      <Box size={[W - 0.03, 0.48, 0.012]} position={[0, 1.8, FRONT + 0.004]} color={C.sunPale} shadow={false} />
      {oven}
    </group>
  )
}

/**
 * Water dispenser: 34 × 36 cm body, tap nook at the front (red hot tap, blue cold tap, drip tray).
 * "Top": upside down 19 L bottle (translucent blue, with water). "Bottom": bottle inside the cabinet, flat top.
 * While the bound plug is on, the heating and cooling LEDs light up; at night the tap nook glows softly.
 */
export function WaterDispenser({ v }: P) {
  const bottom = v.opts.variant === 'bottom'
  const SW = 0.32
  const SD = 0.34
  const SF = SD / 2
  const H2 = bottom ? 1.02 : 0.92
  const bottle = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a9d2ff', transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.1, depthWrite: false }), [])
  const water = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4f9dff', transparent: true, opacity: 0.42, roughness: 0.15, depthWrite: false }), [])
  useEffect(
    () => () => {
      bottle.dispose()
      water.dispose()
    },
    [bottle, water],
  )
  const hot = useLitMaterial('#9aa0b8', v.on, C.alarm, 1, 2)
  const cold = useLitMaterial('#9aa0b8', v.on, '#4f9dff', 1, 2)
  const power = useLitMaterial('#9aa0b8', v.on, C.ok, 1, 2)
  const nook = H2 - 0.36
  return (
    <group>
      <Box size={[SW, H2, SD]} position={[0, H2 / 2, 0]} color={C.white} radius={0.02} />
      {/* tap nook, drip tray grille, taps */}
      <Box size={[0.22, 0.24, 0.012]} position={[0, nook, SF + 0.002]} color="#dfe2f0" shadow={false} />
      <Box size={[0.2, 0.012, 0.07]} position={[0, nook - 0.115, SF + 0.03]} color={C.steel} />
      <Box size={[0.034, 0.05, 0.04]} position={[-0.055, nook + 0.07, SF + 0.025]} color={C.alarm} />
      <Box size={[0.034, 0.05, 0.04]} position={[0.055, nook + 0.07, SF + 0.025]} color="#4f9dff" />
      {[-0.05, 0, 0.05].map((x, i) => (
        <Box key={x} size={[0.022, 0.012, 0.006]} position={[x, nook + 0.16, SF + 0.004]} material={[hot, power, cold][i]} shadow={false} />
      ))}
      {/* lower part: vents or the bottle cabinet door */}
      {bottom ? (
        <>
          <Box size={[SW - 0.03, 0.46, 0.01]} position={[0, 0.27, SF + 0.003]} color={C.offWhite} shadow={false} />
          <Box size={[0.012, 0.12, 0.02]} position={[0.12, 0.34, SF + 0.014]} color={C.steel} shadow={false} />
        </>
      ) : (
        [0.14, 0.18, 0.22, 0.26].map((y) => <Box key={y} size={[0.2, 0.008, 0.004]} position={[0, y, SF + 0.002]} color={C.steel} shadow={false} />)
      )}
      {/* cup holder on the side */}
      <Cyl r={0.035} h={0.2} position={[SW / 2 + 0.036, nook - 0.02, 0.06]} color={C.offWhite} segments={16} />
      <Cyl r={0.038} h={0.012} position={[SW / 2 + 0.036, nook + 0.085, 0.06]} color={C.white} segments={16} shadow={false} />
      {!bottom && (
        <group position={[0, H2, 0]}>
          <Cyl r={0.06} h={0.03} position={[0, 0.015, 0]} color={C.steel} segments={18} />
          <Cyl r={0.03} h={0.05} position={[0, 0.045, 0]} material={bottle} segments={14} shadow={false} />
          <Cyl r={0.135} rTop={0.135} h={0.36} position={[0, 0.27, 0]} material={bottle} segments={28} shadow={false} />
          <Cyl r={0.04} rTop={0.135} h={0.06} position={[0, 0.06, 0]} material={bottle} segments={28} shadow={false} />
          <Cyl r={0.124} h={0.25} position={[0, 0.215, 0]} material={water} segments={24} shadow={false} />
          {[0.18, 0.34].map((y) => (
            <Cyl key={y} r={0.138} h={0.012} position={[0, y, 0]} material={bottle} segments={28} shadow={false} />
          ))}
        </group>
      )}
      {v.on && v.night && <Glow position={[0, nook, SF + 0.12]} color={C.cool} opacity={0.35} size={0.45} />}
    </group>
  )
}

/**
 * Upright freezer (70 × 68 cm, 1.75 m tall, back to the wall): one full-height white door with a long vertical handle on the
 * right, a kick plate grille and a temperature panel at the top of the door. A bound plug that is on lights the panel.
 */
export function UprightFreezer({ v }: P) {
  const led = useLitMaterial('#9aa0b8', v.on, C.cool, 1, 2)
  const FH = 1.75
  const FD = 0.68
  return (
    <group>
      <Box size={[0.7, FH, FD - 0.04]} position={[0, FH / 2, -0.02]} color={C.white} radius={0.02} />
      <Box size={[0.68, FH - 0.12, 0.05]} position={[0, (FH - 0.12) / 2 + 0.1, FD / 2 - 0.025]} color="#f4f5f7" radius={0.015} />
      <Box size={[0.025, 0.7, 0.035]} position={[0.29, 1.05, FD / 2 + 0.025]} color={C.steel} />
      <Box size={[0.66, 0.08, 0.012]} position={[0, 0.05, FD / 2 - 0.02]} color="#3a3d47" shadow={false} />
      <Box size={[0.14, 0.04, 0.006]} position={[0, FH - 0.14, FD / 2 + 0.003]} color="#2a2d36" shadow={false} />
      <Box size={[0.05, 0.014, 0.004]} position={[0, FH - 0.14, FD / 2 + 0.007]} material={led} shadow={false} />
    </group>
  )
}

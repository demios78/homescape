import * as THREE from 'three'
import type { FloorMaterial } from '@/model/types'
import { C } from './palette'

/* All textures are drawn on a 2D canvas at runtime; no files are loaded. */

const cache = new Map<string, THREE.CanvasTexture>()

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return [c, c.getContext('2d')!] as const
}

function base(key: string, draw: (g: CanvasRenderingContext2D, size: number) => void, size = 256) {
  let t = cache.get(key)
  if (!t) {
    const [c, g] = canvas(size)
    draw(g, size)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    cache.set(key, t)
  }
  return t
}

/**
 * Floor texture; returns a copy with its repeat set for the room size. flow: traffic direction of a road (from the road
 * pieces it connects to, computed by RoomMesh); without it the road runs along the long side of the area.
 */
export function floorTexture(kind: FloorMaterial, w: number, d: number, flow?: 'x' | 'z' | null) {
  // Road, crosswalk and parking markings follow the area's orientation (below, markedFloor)
  if (kind === 'road' || kind === 'crosswalk' || kind === 'parking') return markedFloor(kind, w, d, flow ?? null)
  const src = base(`floor-${kind}`, (g, s) => {
    if (kind === 'wood') {
      g.fillStyle = C.woodFloor
      g.fillRect(0, 0, s, s)
      g.strokeStyle = C.woodLine
      g.lineWidth = 2
      for (let i = 0; i < 8; i++) {
        const y = i * 32
        g.beginPath()
        g.moveTo(0, y + 1)
        g.lineTo(s, y + 1)
        g.stroke()
        const seam = ((i * 97) % s) + 0.5
        g.beginPath()
        g.moveTo(seam, y)
        g.lineTo(seam, y + 32)
        g.stroke()
      }
    } else if (kind === 'tile') {
      g.fillStyle = C.tile
      g.fillRect(0, 0, s, s)
      g.strokeStyle = C.tileLine
      g.lineWidth = 4
      for (let i = 0; i <= 2; i++) {
        g.beginPath()
        g.moveTo(0, i * (s / 2))
        g.lineTo(s, i * (s / 2))
        g.moveTo(i * (s / 2), 0)
        g.lineTo(i * (s / 2), s)
        g.stroke()
      }
    } else if (kind === 'carpet') {
      g.fillStyle = C.carpet
      g.fillRect(0, 0, s, s)
      const img = g.getImageData(0, 0, s, s)
      for (let i = 0; i < img.data.length; i += 4) {
        const n = ((i * 2654435761) % 255) / 255 - 0.5
        img.data[i] += n * 10
        img.data[i + 1] += n * 10
        img.data[i + 2] += n * 10
      }
      g.putImageData(img, 0, 0)
    } else if (kind === 'grass') {
      // Grass: green ground, short light and dark blade strokes
      g.fillStyle = '#93c46f'
      g.fillRect(0, 0, s, s)
      let seed = 3
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
      g.lineWidth = 1.4
      for (let i = 0; i < 1400; i++) {
        const x = rnd() * s
        const y = rnd() * s
        g.strokeStyle = rnd() > 0.5 ? 'rgba(70, 130, 50, 0.45)' : 'rgba(190, 230, 140, 0.4)'
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 4)
        g.stroke()
      }
    } else if (kind === 'deck') {
      // Wooden deck: wide dark boards with gaps between them
      g.fillStyle = '#b98a5c'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 4; i++) {
        const y = i * (s / 4)
        g.fillStyle = i % 2 ? '#c49668' : '#b48558'
        g.fillRect(0, y + 3, s, s / 4 - 6)
        g.fillStyle = 'rgba(60, 35, 15, 0.55)'
        g.fillRect(0, y, s, 3)
      }
    } else if (kind === 'paving') {
      // Paving: staggered rows of square stones, light joints
      g.fillStyle = '#c9c4ba'
      g.fillRect(0, 0, s, s)
      const n = 4
      const t = s / n
      for (let r = 0; r < n; r++)
        for (let c = -1; c < n; c++) {
          const x = c * t + (r % 2 ? t / 2 : 0)
          g.fillStyle = (r * 7 + c * 3) % 3 === 0 ? '#d8d4cb' : (r + c) % 2 ? '#d1ccc2' : '#dcd8d0'
          g.fillRect(x + 3, r * t + 3, t - 6, t - 6)
        }
    } else if (kind === 'sidewalk') {
      // Sidewalk: 40 cm light gray square tiles, dark joints, slight tone change from tile to tile
      g.fillStyle = '#b4b8c5'
      g.fillRect(0, 0, s, s)
      const n = 4
      const t = s / n
      const tones = ['#dcdee6', '#d3d6df', '#e2e4ea', '#d7d9e1']
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          g.fillStyle = tones[(r * 3 + c * 5 + ((r * c) % 3)) % tones.length]
          g.fillRect(c * t + 2, r * t + 2, t - 4, t - 4)
        }
      speckle(g, s, 5, 900, 'rgba(90, 96, 120, 0.08)', 'rgba(255, 255, 255, 0.18)')
    } else if (kind === 'gravel') {
      // Gravel: warm beige ground, small overlapping round stones (stones crossing an edge continue on the opposite side)
      g.fillStyle = '#cdc3b1'
      g.fillRect(0, 0, s, s)
      let seed = 21
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
      const stones = ['#e9e3d7', '#d9d0bf', '#c2b8a5', '#f3efe7', '#b5aa96', '#dcd6cc']
      for (let i = 0; i < 1500; i++) {
        const x = rnd() * s
        const y = rnd() * s
        const rx = 1.6 + rnd() * 2.8
        const ry = rx * (0.6 + rnd() * 0.35)
        const a = rnd() * Math.PI
        const col = stones[Math.floor(rnd() * stones.length)]
        for (const ox of [-s, 0, s])
          for (const oy of [-s, 0, s]) {
            if (x + ox < -6 || x + ox > s + 6 || y + oy < -6 || y + oy > s + 6) continue
            g.fillStyle = 'rgba(80, 66, 46, 0.22)'
            g.beginPath()
            g.ellipse(x + ox + 0.6, y + oy + 0.9, rx, ry, a, 0, Math.PI * 2)
            g.fill()
            g.fillStyle = col
            g.beginPath()
            g.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2)
            g.fill()
          }
      }
    } else if (kind === 'water') {
      // Water (pond): wavy bands from deep to light blue and light wave crests; integer frequencies tile seamlessly
      const img = g.createImageData(s, s)
      const deep = [61, 143, 214]
      const light = [124, 196, 238]
      const P2 = Math.PI * 2
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          const u = x / s
          const v = y / s
          const w1 = Math.sin(P2 * (2 * v + 0.18 * Math.sin(P2 * (3 * u + 0.4 * Math.sin(P2 * v)))))
          const w2 = Math.sin(P2 * (3 * u + 2 * v + 0.25 * Math.sin(P2 * 2 * v)))
          const t = 0.5 + 0.32 * w1 + 0.18 * w2
          const crest = Math.max(0, w1 * 0.6 + w2 * 0.4 - 0.72) * 2.2
          const i = (y * s + x) * 4
          for (let k = 0; k < 3; k++) img.data[i + k] = Math.min(255, Math.round(deep[k] + (light[k] - deep[k]) * t + (255 - light[k]) * crest))
          img.data[i + 3] = 255
        }
      g.putImageData(img, 0, 0)
    } else {
      g.fillStyle = C.concrete
      g.fillRect(0, 0, s, s)
      g.strokeStyle = '#d8d9e2'
      g.lineWidth = 3
      g.strokeRect(1.5, 1.5, s - 3, s - 3)
    }
  })
  const scale = kind === 'tile' ? 1.2 : kind === 'wood' ? 1.6 : kind === 'grass' ? 2.5 : kind === 'deck' ? 1.4 : kind === 'sidewalk' ? 1.6 : kind === 'gravel' ? 1.4 : kind === 'water' ? 3 : 2
  const t = src.clone()
  t.needsUpdate = true
  t.repeat.set(w / scale, d / scale)
  return t
}

/** Seeded fine grain (sidewalk, asphalt): n dots of 1-2 px, half dark and half light. */
function speckle(g: CanvasRenderingContext2D, s: number, seed: number, n: number, dark: string, light: string, h = s) {
  let k = seed
  const rnd = () => (k = (k * 9301 + 49297) % 233280) / 233280
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() > 0.5 ? dark : light
    g.fillRect(Math.floor(rnd() * s), Math.floor(rnd() * h), 1 + Math.round(rnd()), 1 + Math.round(rnd()))
  }
}

/*
 * Outdoor floors. Road, crosswalk and parking markings follow the area's orientation: a road runs in the direction where
 * it connects to another road piece or a crosswalk (a short piece in between is drawn the right way too), otherwise along
 * its long side; crosswalk stripes run parallel to traffic and line up in the crossing direction. The texture repeats
 * along the flow (one period: dash + gap, crosswalk stripe + asphalt, parking bay) and covers the other side (the road
 * width) once. So the texture is drawn per width (in 25 cm steps); markings keep the same thickness at every width. If the
 * area is turned (depth larger than width) the same drawing is rotated by 90°.
 */

/** Asphalt and road marking colors: soft dark gray blue that suits the pastel scene, off-white paint. */
const ASPHALT = '#6d7286'
const MARK = '#f2f3f8'
/** Pixels per meter in marked floor textures. */
const MPX = 64

type MarkKind = 'road' | 'crosswalk' | 'parking'
/** Period (m): road 1.5 m dash + 1.5 m gap, crosswalk 50 cm stripe + 50 cm asphalt, parking 2.5 m bay. */
const PERIOD: Record<MarkKind, number> = { road: 3, crosswalk: 1, parking: 2.5 }

/**
 * Draws the markings laid out lengthwise: x along (P px = one period), y across (A px = area width, across m).
 * Edge lines 30 cm inside; a narrow single lane road (2.5-4.5 m) gets only edge lines, two lanes (4.5-9 m) a dashed center
 * line, four lanes (9 m and up) a double solid center line plus dashed lines between lanes. Roads under 2.5 m are plain asphalt.
 */
function drawMarks(kind: MarkKind, g: CanvasRenderingContext2D, P: number, A: number, across: number) {
  g.fillStyle = kind === 'parking' ? '#757a8d' : ASPHALT
  g.fillRect(0, 0, P, A)
  speckle(g, P, kind.length * 13, Math.round((P * A) / 70), 'rgba(24, 28, 44, 0.12)', 'rgba(255, 255, 255, 0.08)', A)
  g.fillStyle = MARK
  const m = (x: number) => x * MPX
  if (kind === 'road') {
    const lw = m(0.12)
    if (across >= 2.5)
      for (const y of [m(0.3), A - m(0.3) - lw]) g.fillRect(0, y, P, lw)
    if (across >= 9) {
      g.fillRect(0, A / 2 - lw * 1.3, P, lw)
      g.fillRect(0, A / 2 + lw * 0.3, P, lw)
      for (const y of [A / 4, (3 * A) / 4]) g.fillRect(0, y - lw / 2, P / 2, lw)
    } else if (across >= 4.5) g.fillRect(0, A / 2 - lw / 2, P / 2, lw)
  } else if (kind === 'crosswalk') {
    // Crosswalk: 50 cm stripes across the full width (parallel to traffic), 20 cm asphalt at the ends
    const edge = Math.min(m(0.2), A * 0.1)
    g.fillRect(0, edge, P / 2, A - 2 * edge)
  } else {
    // Parking: a line along the back edge, a 5 m deep bay line every 2.5 m; two rows when wider than 10.5 m
    const lw = m(0.1)
    const two = across >= 10.5
    const depth = two ? 5 : Math.max(1, Math.min(5, across - 0.5))
    g.fillRect(0, m(0.12), P, lw)
    g.fillRect(0, 0, lw / 2, m(0.12 + depth))
    g.fillRect(P - lw / 2, 0, lw / 2, m(0.12 + depth))
    if (two) {
      g.fillRect(0, A - m(0.12) - lw, P, lw)
      g.fillRect(0, A - m(0.12 + depth), lw / 2, m(0.12 + depth))
      g.fillRect(P - lw / 2, A - m(0.12 + depth), lw / 2, m(0.12 + depth))
    }
  }
}

const markCache = new Map<string, THREE.CanvasTexture>()
/** Road, crosswalk and parking texture: a centered copy that repeats along the flow (or long side) and covers the width once. */
function markedFloor(kind: MarkKind, w: number, d: number, flow: 'x' | 'z' | null) {
  // Axis the pattern repeats along: traffic direction for a road, crossing direction for a crosswalk (across traffic); long side if unknown
  const alongX = flow && kind !== 'parking' ? (kind === 'road') === (flow === 'x') : w >= d
  const across = Math.max(0.5, Math.round((alongX ? d : w) * 4) / 4)
  const len = alongX ? w : d
  const period = PERIOD[kind]
  const A = Math.min(1024, Math.round(across * MPX))
  const P = Math.round(period * MPX)
  const key = `${kind}-${across}-${alongX ? 'x' : 'z'}`
  let src = markCache.get(key)
  if (!src) {
    const c = document.createElement('canvas')
    c.width = alongX ? P : A
    c.height = alongX ? A : P
    const g = c.getContext('2d')!
    // With the long side on z the lengthwise axis is the canvas vertical: the drawing turns 90° (x' -> down, y' -> left)
    if (!alongX) {
      g.translate(A, 0)
      g.rotate(Math.PI / 2)
    }
    drawMarks(kind, g, P, A, across)
    src = new THREE.CanvasTexture(c)
    src.colorSpace = THREE.SRGBColorSpace
    src.wrapS = src.wrapT = THREE.RepeatWrapping
    src.anisotropy = 8
    markCache.set(key, src)
  }
  const t = src.clone()
  t.needsUpdate = true
  // Pattern symmetric about the area center: the middle of a stripe/bay or of a gap sits in the center
  const off = (((kind === 'parking' ? 0.5 : 0.25) - len / (2 * period)) % 1 + 1) % 1
  if (alongX) {
    t.repeat.set(len / period, 1)
    t.offset.set(off, 0)
  } else {
    t.repeat.set(1, len / period)
    t.offset.set(0, off)
  }
  return t
}

/**
 * Glint sliding over pond water: light wave crests (white, alpha only), integer frequencies: seamless.
 * RoomMesh slides it slowly over the water.
 */
export function waterGlintTexture() {
  const t = dataTexture('water-glint', 128, (u, v) => {
    const P2 = Math.PI * 2
    const a = Math.sin(P2 * (3 * u + 0.35 * Math.sin(P2 * (2 * v + 0.2 * Math.sin(P2 * u)))))
    const b = Math.sin(P2 * (2 * v - u + 0.3 * Math.sin(P2 * 3 * u)))
    const c = Math.exp(-((a / 0.14) ** 2)) * 0.55 + Math.exp(-((b / 0.12) ** 2)) * 0.4
    return [1, 1, 1, Math.min(1, c) * 0.5]
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/*
 * Light textures (halo, TV backlight, strip band, surface wash) are NOT drawn with canvas gradients: Chrome adds random
 * dithering to gradients against banding, and a magnified texture then shows dotted noise on screen. Instead every pixel
 * is written straight from a smooth function (DataTexture; white, alpha only). u: left to right, v: bottom to top (0-1).
 */
const dataCache = new Map<string, THREE.DataTexture>()
/** Every pixel is written directly from f(u, v) => [r, g, b, a] (0-1); colors in sRGB. */
function dataTexture(key: string, size: number, f: (u: number, v: number) => [number, number, number, number]) {
  let t = dataCache.get(key)
  if (t) return t
  const data = new Uint8Array(size * size * 4)
  const byte = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = f((x + 0.5) / size, (y + 0.5) / size)
      const i = (y * size + x) * 4
      for (let k = 0; k < 4; k++) data[i + k] = byte(px[k])
    }
  }
  t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  dataCache.set(key, t)
  return t
}
/** White texture with alpha only. */
const alphaTexture = (key: string, size: number, f: (u: number, v: number) => number) => dataTexture(key, size, (u, v) => [1, 1, 1, f(u, v)])

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** Soft ends: the left and right 12% fade to transparent (so strip ends do not look cut off). */
const ends = (u: number) => smooth(0, 0.12, u) * smooth(0, 0.12, 1 - u)

/** Soft radial texture for light glow: bright center, fading smoothly toward the edge. */
export function glowTexture() {
  return alphaTexture('glow', 128, (u, v) => {
    const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2)
    return Math.pow(1 - r, 2.2) * (0.55 + 0.45 * Math.exp(-r * r * 18))
  })
}

/** Soft rectangular halo: solid center (TV panel sized), fading toward the edges. For the TV backlight. */
export function softRectTexture() {
  return alphaTexture('soft-rect', 256, (u, v) => {
    const dx = Math.max(0.21 - u, 0, u - 0.79)
    const dy = Math.max(0.25 - v, 0, v - 0.75)
    const d = Math.hypot(dx, dy)
    return 0.95 * Math.exp(-((d / 0.075) ** 2))
  })
}

/** Strip light band: bright center, bell curve falloff to both sides; soft ends. LED strip glow. */
export function lineGlowTexture() {
  return alphaTexture('line-glow', 128, (u, v) => {
    const d = Math.abs(v - 0.5) * 2
    return Math.exp(-((d * 3) ** 2)) * ends(u)
  })
}

/** Closed ring band (around a cylinder): bright center, fading to the top and bottom edges; no end fade so there is no seam around it. */
export function bandGlowTexture() {
  return alphaTexture('band-glow', 64, (_u, v) => Math.exp(-(((v - 0.5) * 2 * 2.6) ** 2)))
}

/** Light on a surface: bright at the top edge (at the strip), exponential falloff with distance; soft ends. */
export function washTexture() {
  return alphaTexture('wash', 128, (u, v) => {
    const t = 1 - v
    return Math.exp(-4.2 * t) * (1 - t) ** 1.5 * ends(u)
  })
}

/**
 * Colored wave on the HomePod's top touch surface (Siri / while playing music). Three colored lobes in a circle twist
 * with the radius into a spiral and fade softly toward the edge. variant 0: purple, blue, pink; 1: cyan, green, purple
 * (two layers spin in opposite directions, making colors that pass through each other).
 */
const SIRI: [number, number, number][][] = [
  [
    [0.62, 0.3, 1],
    [0.18, 0.45, 1],
    [1, 0.3, 0.75],
  ],
  [
    [0.2, 0.85, 1],
    [0.3, 1, 0.6],
    [0.75, 0.35, 1],
  ],
]
export function siriTexture(variant: 0 | 1) {
  return dataTexture(`siri-${variant}`, 128, (u, v) => {
    const x = u * 2 - 1
    const y = v * 2 - 1
    const r = Math.hypot(x, y)
    if (r >= 1) return [0, 0, 0, 0]
    const ang = Math.atan2(y, x) + r * (variant ? -2.6 : 2.2)
    let cr = 0
    let cg = 0
    let cb = 0
    let w = 0
    SIRI[variant].forEach((c, k) => {
      const d = Math.cos(ang - (k * 2 * Math.PI) / 3)
      const lobe = Math.pow(Math.max(0, d), 2.4)
      cr += c[0] * lobe
      cg += c[1] * lobe
      cb += c[2] * lobe
      w += lobe
    })
    const n = Math.max(w, 1e-3)
    // Light center (near white), colored ring zone, fading edge.
    const core = Math.exp(-((r / 0.35) ** 2)) * 0.55
    const ring = Math.exp(-(((r - 0.55) / 0.3) ** 2))
    const a = Math.min(1, w * 0.9 * ring + core) * smooth(1, 0.82, r)
    return [cr / n + core, cg / n + core, cb / n + core, a]
  })
}

/**
 * Wood grain (diffuser body): wavy warm dark grain on a white ground; multiplied by the material color (light or dark
 * wood). Integer wave count: no seam on the lathed body (u runs around it). Seeded, the same every time.
 */
export function woodGrainTexture() {
  return base(
    'wood-grain',
    (g, s) => {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, s, s)
      let seed = 7
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
      for (let i = 0; i < 46; i++) {
        const y0 = rnd() * s
        const amp = 3 + rnd() * 12
        const freq = 1 + Math.floor(rnd() * 3)
        const ph = rnd() * Math.PI * 2
        g.strokeStyle = `rgba(70, 38, 14, ${0.07 + rnd() * 0.2})`
        g.lineWidth = 0.8 + rnd() * 2.4
        g.beginPath()
        for (let x = 0; x <= s; x += 4) {
          const y = y0 + Math.sin((x / s) * Math.PI * 2 * freq + ph) * amp
          if (x === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
      }
    },
    512,
  )
}

/** SKÅDIS style pegboard: vertical slots (staggered). White ground, color comes from the material. */
export function pegboardTexture() {
  return base('pegboard', (g, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    g.fillStyle = '#c9cde0'
    const cols = 8
    const rows = 6
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = ((c + (r % 2 ? 0.5 : 0.25)) / cols) * s
        const y = ((r + 0.5) / rows) * s
        g.beginPath()
        g.roundRect(x - 3, y - 11, 6, 22, 3)
        g.fill()
      }
  })
}

/** Painting: pastel abstract composition (in the project's colors). */
export function artTexture() {
  return base('art', (g, s) => {
    g.fillStyle = '#f4efe6'
    g.fillRect(0, 0, s, s)
    g.fillStyle = C.brandPale
    g.fillRect(0, s * 0.62, s, s * 0.38)
    g.fillStyle = C.coral
    g.beginPath()
    g.arc(s * 0.32, s * 0.4, s * 0.17, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = C.brand
    g.beginPath()
    g.arc(s * 0.7, s * 0.62, s * 0.24, Math.PI, 0)
    g.fill()
    g.fillStyle = C.sun
    g.fillRect(s * 0.56, s * 0.18, s * 0.08, s * 0.32)
    g.strokeStyle = C.ink
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(s * 0.12, s * 0.8)
    g.bezierCurveTo(s * 0.35, s * 0.7, s * 0.5, s * 0.92, s * 0.88, s * 0.78)
    g.stroke()
  })
}

/** Keyboard keys: top view, light keys on a dark base. */
export function keyboardTexture() {
  return base(
    'keyboard',
    (g, s) => {
      g.fillStyle = '#2a2e40'
      g.fillRect(0, 0, s, s)
      g.fillStyle = '#e9ebf5'
      const rows = 5
      for (let r = 0; r < rows; r++) {
        const n = r === 4 ? 1 : 13
        const y = 6 + r * ((s - 12) / rows)
        const h = (s - 12) / rows - 6
        if (r === 4) {
          g.fillRect(s * 0.28, y, s * 0.44, h)
          continue
        }
        for (let c = 0; c < n; c++) g.fillRect(6 + c * ((s - 12) / n), y, (s - 12) / n - 5, h)
      }
    },
    256,
  )
}

/* ---------- rug ---------- */

const rugCache = new Map<string, THREE.CanvasTexture>()
const rgbOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}
/** Moves a color toward white (to 255) or black (to 0) by k. */
const tone = (hex: string, to: number, k: number, a = 1) => {
  const [r, g, b] = rgbOf(hex)
  return `rgba(${Math.round(r + (to - r) * k)}, ${Math.round(g + (to - g) * k)}, ${Math.round(b + (to - b) * k)}, ${a})`
}
const paleOf = (hex: string) => {
  const [r, g, b] = rgbOf(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}

/** Irregular soft-edged spot (cowhide): the corners of a jagged polygon joined by curves. */
function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rnd: () => number) {
  const n = 11
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const k = 0.62 + rnd() * 0.6
    return [x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k] as const
  })
  g.beginPath()
  const mid = (i: number) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2] as const
  g.moveTo(...mid(0))
  for (let i = 1; i <= n; i++) g.quadraticCurveTo(pts[i % n][0], pts[i % n][1], ...mid(i))
  g.fill()
}

/**
 * Rug texture (kit/furniture.tsx > Rug). Drawn at the rug's aspect ratio (long side 512 px): border, spots and stripes
 * keep the same thickness in every direction. The pattern is measured in meters (px/m); the color is the ground on a plain
 * rug, the spots on cowhide, the stripes on zebra, the fleece on sheepskin.
 */
export function rugTexture(shape: string, color: string, w: number, d: number) {
  const long = 512
  const short = Math.max(64, Math.round((long * Math.min(w, d)) / Math.max(w, d) / 32) * 32)
  const W = w >= d ? long : short
  const H = w >= d ? short : long
  const key = `${shape}-${color}-${W}x${H}`
  let t = rugCache.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const m = W / Math.max(0.1, w)
  let seed = 11
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const pale = paleOf(color)
  if (shape === 'rect' || shape === 'round') {
    // Ground, weave rows, border and inner line (narrower on a small rug)
    const k = Math.min(1, Math.min(w, d) / 1.4)
    g.fillStyle = color
    g.fillRect(0, 0, W, H)
    for (let y = 0; y < H; y += 3) {
      g.fillStyle = pale ? `rgba(0, 0, 0, ${y % 6 ? 0.02 : 0.045})` : `rgba(255, 255, 255, ${y % 6 ? 0.02 : 0.04})`
      g.fillRect(0, y, W, 1.5)
    }
    const band = tone(color, pale ? 0 : 255, pale ? 0.2 : 0.28)
    const line = tone(color, pale ? 0 : 255, pale ? 0.13 : 0.2)
    const ring = (inset: number, lw: number, style: string) => {
      g.lineWidth = lw * m
      g.strokeStyle = style
      const i = (inset + lw / 2) * m
      if (shape === 'rect') g.strokeRect(i, i, W - 2 * i, H - 2 * i)
      else {
        g.beginPath()
        g.ellipse(W / 2, H / 2, Math.max(1, W / 2 - i), Math.max(1, H / 2 - i), 0, 0, Math.PI * 2)
        g.stroke()
      }
    }
    ring(0.07 * k, 0.08 * k, band)
    ring(0.24 * k, 0.015 * k, line)
    if (shape === 'round') {
      g.fillStyle = tone(color, pale ? 0 : 255, pale ? 0.1 : 0.15)
      g.beginPath()
      g.ellipse(W / 2, H / 2, W * 0.14, H * 0.14, 0, 0, Math.PI * 2)
      g.fill()
    }
  } else if (shape === 'cowhide') {
    // Cream hide, fine hair marks, large irregular spots
    g.fillStyle = '#f1e9db'
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(120, 90, 60, 0.06)'
    for (let i = 0; i < 900; i++) g.fillRect(rnd() * W, rnd() * H, 1, 3 + rnd() * 4)
    g.fillStyle = color
    for (let i = 0; i < 10; i++) {
      const r = (0.08 + rnd() * 0.18) * m
      blob(g, rnd() * W, rnd() * H, r * (0.8 + rnd() * 0.6), r, rnd)
    }
  } else if (shape === 'zebra') {
    // Cream ground; wavy stripes running down both sides from the spine, a spine line in the middle
    g.fillStyle = '#f3efe6'
    g.fillRect(0, 0, W, H)
    g.fillStyle = color
    const gap = 0.12 * m
    for (let y0 = gap * 0.3; y0 < H + gap; y0 += gap) {
      const th = gap * (0.38 + rnd() * 0.18)
      const ph = rnd() * Math.PI * 2
      const at = (x: number) => y0 + Math.sin((x / W) * Math.PI * 3 + ph) * gap * 0.25 + ((x / W - 0.5) ** 2) * gap * 2.2
      g.beginPath()
      for (let x = 0; x <= W; x += 6) g.lineTo(x, at(x) - th / 2)
      for (let x = W; x >= 0; x -= 6) g.lineTo(x, at(x) + th / 2 * (0.6 + 0.4 * Math.abs(Math.sin(x / 40 + ph))))
      g.closePath()
      g.fill()
    }
    g.fillRect(W / 2 - 0.018 * m, 0, 0.036 * m, H)
  } else {
    // Sheepskin: fleece color, slight darkening toward the edge, curly fleece rings
    g.fillStyle = color
    g.fillRect(0, 0, W, H)
    const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.55)
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
    grad.addColorStop(1, 'rgba(60, 45, 30, 0.22)')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    g.lineWidth = 1.4
    for (let i = 0; i < 1600; i++) {
      g.strokeStyle = rnd() > 0.5 ? tone(color, 255, 0.45, 0.4) : tone(color, 0, 0.18, 0.35)
      const r = 2 + rnd() * 4
      const a = rnd() * Math.PI * 2
      g.beginPath()
      g.arc(rnd() * W, rnd() * H, r, a, a + Math.PI * (1 + rnd()))
      g.stroke()
    }
  }
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  rugCache.set(key, t)
  return t
}

/**
 * Embossed panel (like a pressed tin or carved headboard inset): a dark base with a lighter quatrefoil medallion, corner
 * fans and a dotted border. Drawn once; tinted by the material color.
 */
export function medallionTexture() {
  return base('medallion', (g, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    const c = s / 2
    g.lineCap = 'round'
    const stroke = (w: number, a: number) => {
      g.lineWidth = w
      g.strokeStyle = `rgba(40, 34, 30, ${a})`
    }
    // Quatrefoil: four lobes around the center, then a smaller diamond inside
    stroke(s * 0.022, 0.55)
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2
      g.beginPath()
      g.ellipse(c + Math.cos(a) * s * 0.15, c + Math.sin(a) * s * 0.15, s * 0.13, s * 0.085, a, 0, Math.PI * 2)
      g.stroke()
    }
    stroke(s * 0.016, 0.5)
    g.beginPath()
    g.moveTo(c, c - s * 0.36)
    g.lineTo(c + s * 0.36, c)
    g.lineTo(c, c + s * 0.36)
    g.lineTo(c - s * 0.36, c)
    g.closePath()
    g.stroke()
    g.beginPath()
    g.arc(c, c, s * 0.05, 0, Math.PI * 2)
    g.stroke()
    // Corner fans
    stroke(s * 0.014, 0.42)
    for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]]) {
      for (const r of [0.16, 0.22]) {
        g.beginPath()
        g.arc(x, y, s * r, 0, Math.PI * 2)
        g.stroke()
      }
    }
    // Dotted border
    g.fillStyle = 'rgba(40, 34, 30, 0.45)'
    for (let i = 0; i < 24; i++) {
      const k = ((i + 0.5) / 24) * s
      for (const [x, y] of [[k, s * 0.035], [k, s * 0.965], [s * 0.035, k], [s * 0.965, k]]) {
        g.beginPath()
        g.arc(x, y, s * 0.008, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
}

/**
 * Floral bedding print (block-print style: small mauve flower sprigs with green leaves on an off-white ground, a faint
 * lattice between them). Tiles; the bed repeats it about every 60 cm.
 */
export function floralTexture() {
  return base('floral-bedding', (g, s) => {
    g.fillStyle = '#f2efeb'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = 'rgba(140, 170, 160, 0.45)'
    g.lineWidth = s * 0.012
    for (const o of [0, s / 2]) {
      g.beginPath()
      g.ellipse(o + s / 4, s / 2, s * 0.24, s * 0.46, 0, 0, Math.PI * 2)
      g.stroke()
    }
    const sprig = (x: number, y: number) => {
      g.strokeStyle = '#6f8f6c'
      g.lineWidth = s * 0.016
      g.beginPath()
      g.moveTo(x, y + s * 0.15)
      g.lineTo(x, y - s * 0.02)
      g.stroke()
      g.fillStyle = '#7f9d77'
      for (const k of [-1, 1]) {
        g.beginPath()
        g.ellipse(x + k * s * 0.05, y + s * 0.08, s * 0.045, s * 0.018, k * 0.6, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#9b4a73'
      for (const [dx, dy, r] of [[0, -0.06, 0.05], [-0.055, -0.005, 0.04], [0.055, -0.005, 0.04]]) {
        g.beginPath()
        g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#c87fa3'
      g.beginPath()
      g.arc(x, y - s * 0.065, s * 0.02, 0, Math.PI * 2)
      g.fill()
    }
    for (const [x, y] of [[0.25, 0.27], [0.75, 0.77], [0.75, 0.27], [0.25, 0.77]]) sprig(x * s, y * s)
  })
}

/**
 * Carved lattice (like a hand-carved Indian jali panel): white scrolls and petals on a transparent ground, with a few
 * darker flecks for a distressed finish. Tinted by the material color; holes cut with alphaTest.
 */
/** Beadboard: vertical boards with a shadowed groove every quarter of the tile (white, tinted by the material color). */
export function beadboardTexture() {
  return base('beadboard', (g, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 4; i++) {
      const x = (i * s) / 4
      g.fillStyle = 'rgba(0, 0, 0, 0.22)'
      g.fillRect(x, 0, s * 0.012, s)
      g.fillStyle = 'rgba(0, 0, 0, 0.07)'
      g.fillRect(x + s * 0.012, 0, s * 0.02, s)
    }
  }, 128)
}

export function latticeTexture() {
  return base('lattice', (g, s) => {
    g.clearRect(0, 0, s, s)
    g.lineCap = 'round'
    g.strokeStyle = '#ffffff'
    const c = s / 2
    // Frame of the tile: half a bar on each edge, so tiles join into full bars
    g.lineWidth = s * 0.07
    g.strokeRect(0, 0, s, s)
    // Center flower: four petals and a ring
    g.lineWidth = s * 0.05
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2
      g.beginPath()
      g.ellipse(c + Math.cos(a) * s * 0.14, c + Math.sin(a) * s * 0.14, s * 0.12, s * 0.07, a, 0, Math.PI * 2)
      g.stroke()
    }
    g.beginPath()
    g.arc(c, c, s * 0.05, 0, Math.PI * 2)
    g.stroke()
    // Scrolls from each corner toward the flower
    g.lineWidth = s * 0.045
    for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]]) {
      const dx = Math.sign(c - x)
      const dy = Math.sign(c - y)
      g.beginPath()
      g.moveTo(x + dx * s * 0.04, y + dy * s * 0.04)
      g.bezierCurveTo(x + dx * s * 0.3, y + dy * s * 0.05, x + dx * s * 0.05, y + dy * s * 0.3, x + dx * s * 0.24, y + dy * s * 0.24)
      g.stroke()
      g.beginPath()
      g.arc(x + dx * s * 0.17, y + dy * s * 0.17, s * 0.045, 0, Math.PI * 2)
      g.stroke()
    }
    // Leaves on the edge midpoints
    for (const [x, y, a] of [[c, 0, 0], [c, s, 0], [0, c, Math.PI / 2], [s, c, Math.PI / 2]]) {
      g.beginPath()
      g.ellipse(x, y, s * 0.09, s * 0.05, a, 0, Math.PI * 2)
      g.stroke()
    }
    // Distressed flecks on the carving
    g.globalCompositeOperation = 'source-atop'
    const r = rngT(7)
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(150, 132, 108, ${0.25 + r() * 0.35})`
      g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 2)
    }
    g.globalCompositeOperation = 'source-over'
  })
}

/** Draws fn at (x, y) and at its copies one tile away, so a motif crossing the tile edge continues on the next tile. */
function wrapped(s: number, x: number, y: number, fn: (x: number, y: number) => void) {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) fn(x + dx, y + dy)
}

/**
 * Striped damask upholstery (like a traditional loveseat): vertical bands across the tile, a gold rope stripe, a peach band
 * with red acanthus leaves, another rope stripe and a navy band with a gold diamond lattice. Stripes run along v, so on a box
 * they rise up the back and run front to back on the seat. One tile is one full repeat.
 */
export function damaskStripeTexture() {
  return base('damask-stripe', (g, s) => {
    const rope = s * 0.08
    const band = (s - 2 * rope) / 2
    const peach0 = rope
    const navy0 = 2 * rope + band
    // Rope stripes: cream with thin gold edges and green diagonal twists
    for (const x0 of [0, rope + band]) {
      g.fillStyle = '#efe2bd'
      g.fillRect(x0, 0, rope, s)
      g.fillStyle = '#b8954a'
      g.fillRect(x0, 0, rope * 0.12, s)
      g.fillRect(x0 + rope * 0.88, 0, rope * 0.12, s)
      g.save()
      g.beginPath()
      g.rect(x0 + rope * 0.22, 0, rope * 0.56, s)
      g.clip()
      g.strokeStyle = '#5f7350'
      g.lineWidth = rope * 0.16
      for (let y = -rope; y < s + rope; y += rope * 0.42) {
        g.beginPath()
        g.moveTo(x0, y + rope * 0.6)
        g.lineTo(x0 + rope, y)
        g.stroke()
      }
      g.restore()
    }
    // Peach band with acanthus leaves (pale outline, deep red tips), two leaves per tile height
    g.fillStyle = '#e8b892'
    g.fillRect(peach0, 0, band, s)
    g.save()
    g.beginPath()
    g.rect(peach0, 0, band, s)
    g.clip()
    const cx = peach0 + band / 2
    const leaf = (x: number, y: number, flip: number) => {
      g.fillStyle = '#f3d8bd'
      g.beginPath()
      g.moveTo(x, y + s * 0.2)
      g.bezierCurveTo(x - flip * band * 0.42, y + s * 0.1, x - flip * band * 0.3, y - s * 0.14, x + flip * band * 0.1, y - s * 0.2)
      g.bezierCurveTo(x + flip * band * 0.05, y - s * 0.05, x + flip * band * 0.25, y + s * 0.08, x, y + s * 0.2)
      g.fill()
      g.fillStyle = '#a8323a'
      for (const [dx, dy, r] of [[-0.22, -0.08, 0.07], [-0.08, -0.15, 0.06], [-0.28, 0.04, 0.06], [0.08, 0.02, 0.05]]) {
        g.beginPath()
        g.ellipse(x + flip * dx * band, y + dy * s, r * band, r * band * 0.55, flip * 0.7, 0, Math.PI * 2)
        g.fill()
      }
    }
    wrapped(s, cx, s * 0.25, (x, y) => leaf(x, y, 1))
    wrapped(s, cx, s * 0.75, (x, y) => leaf(x, y, -1))
    g.restore()
    // Navy band with a gold diamond lattice and small dots at the crossings
    g.fillStyle = '#2b3557'
    g.fillRect(navy0, 0, band, s)
    g.save()
    g.beginPath()
    g.rect(navy0, 0, band, s)
    g.clip()
    // s / 8 apart, so a line leaving the bottom edge comes back on the top one (seamless vertically)
    const step = s / 8
    g.strokeStyle = 'rgba(214, 186, 112, 0.8)'
    g.lineWidth = s * 0.006
    for (let k = -10; k <= 10; k++) {
      g.beginPath()
      g.moveTo(navy0 + k * step, 0)
      g.lineTo(navy0 + k * step + s, s)
      g.stroke()
      g.beginPath()
      g.moveTo(navy0 + k * step, s)
      g.lineTo(navy0 + k * step + s, 0)
      g.stroke()
    }
    g.restore()
  }, 512)
}

/** Wicker weave: rows of short woven strands with shadowed gaps (white, tinted by the material color). */
export function wickerTexture() {
  return base('wicker', (g, s) => {
    g.fillStyle = '#c9c4ba'
    g.fillRect(0, 0, s, s)
    const rows = 12
    const h = s / rows
    const r = rngT(3)
    for (let i = 0; i < rows; i++) {
      const off = i % 2 ? h * 0.9 : 0
      for (let x = -h * 1.8; x < s + h * 1.8; x += h * 1.8) {
        const k = 0.95 + r() * 0.05
        g.fillStyle = `rgb(${Math.round(255 * k)}, ${Math.round(253 * k)}, ${Math.round(248 * k)})`
        g.beginPath()
        g.ellipse(x + off, i * h + h / 2, h * 0.85, h * 0.4, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  }, 128)
}

/** Open wicker lattice: woven diagonal strands on a transparent ground, one diamond per tile (holes cut with alphaTest). */
export function wickerLatticeTexture() {
  return base('wicker-lattice', (g, s) => {
    g.clearRect(0, 0, s, s)
    g.lineCap = 'round'
    for (const [w, c] of [[s * 0.16, '#a8a39b'], [s * 0.11, '#ffffff']] as const) {
      g.strokeStyle = c
      g.lineWidth = w
      for (const o of [-s, 0, s]) {
        g.beginPath()
        g.moveTo(o, 0)
        g.lineTo(o + s, s)
        g.stroke()
        g.beginPath()
        g.moveTo(o, s)
        g.lineTo(o + s, 0)
        g.stroke()
      }
    }
  }, 64)
}

/**
 * Floral cushion print (like a chintz garden print): large red and gold blooms with teal centers, smaller teal flowers,
 * green leaves and thin brown stems on a cream ground. Tiles about every 40 cm.
 */
export function chintzTexture() {
  return base('chintz', (g, s) => {
    g.fillStyle = '#efe6d2'
    g.fillRect(0, 0, s, s)
    const stem = (x0: number, y0: number, x1: number, y1: number) => {
      g.strokeStyle = '#8a6a48'
      g.lineWidth = s * 0.008
      g.beginPath()
      g.moveTo(x0, y0)
      g.quadraticCurveTo((x0 + x1) / 2 + s * 0.06, (y0 + y1) / 2, x1, y1)
      g.stroke()
    }
    const leafAt = (x: number, y: number, a: number) => {
      g.fillStyle = '#86a06a'
      g.beginPath()
      g.ellipse(x, y, s * 0.05, s * 0.02, a, 0, Math.PI * 2)
      g.fill()
    }
    const bloom = (x: number, y: number, r: number, petal: string, core: string) => {
      g.fillStyle = petal
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7
        g.beginPath()
        g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.32, a, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = core
      g.beginPath()
      g.arc(x, y, r * 0.38, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = petal
      g.beginPath()
      g.arc(x, y, r * 0.16, 0, Math.PI * 2)
      g.fill()
    }
    wrapped(s, s * 0.3, s * 0.3, (x, y) => {
      stem(x, y, x + s * 0.25, y + s * 0.35)
      leafAt(x + s * 0.12, y + s * 0.16, 0.6)
      leafAt(x + s * 0.2, y + s * 0.26, -0.5)
      bloom(x, y, s * 0.13, '#c8483c', '#e7b45a')
    })
    wrapped(s, s * 0.75, s * 0.72, (x, y) => {
      stem(x, y, x - s * 0.2, y - s * 0.3)
      leafAt(x - s * 0.1, y - s * 0.12, -0.7)
      bloom(x, y, s * 0.12, '#d9a441', '#7fb3b0')
    })
    wrapped(s, s * 0.78, s * 0.22, (x, y) => bloom(x, y, s * 0.06, '#7fb3b0', '#e8dcc2'))
    wrapped(s, s * 0.22, s * 0.8, (x, y) => bloom(x, y, s * 0.055, '#d77a6c', '#e7b45a'))
    wrapped(s, s * 0.52, s * 0.5, (x, y) => leafAt(x, y, 0.2))
  }, 256)
}

/**
 * Carved openwork door panel (like a hand-carved mango wood cabinet door): a beveled frame around a pierced panel with a
 * medallion ring, a rosette in the middle, leaf scrolls radiating out and corner sprays; the dark gaps read as openings.
 * Light on dark, tinted by the material color (whitewash, natural, dark wood). One tile is one door.
 */
export function carvedPanelTexture() {
  return base('carved-panel', (g, s) => {
    const c = s / 2
    g.fillStyle = '#f2efe9'
    g.fillRect(0, 0, s, s)
    // frame bevel: lighter outer band, shadow line inside
    g.strokeStyle = '#c9c4bb'
    g.lineWidth = s * 0.012
    g.strokeRect(s * 0.02, s * 0.02, s * 0.96, s * 0.96)
    const m = s * 0.11
    g.fillStyle = '#6f6a62'
    g.fillRect(m, m, s - 2 * m, s - 2 * m)
    g.strokeStyle = '#9d978d'
    g.lineWidth = s * 0.014
    g.strokeRect(m - s * 0.01, m - s * 0.01, s - 2 * m + s * 0.02, s - 2 * m + s * 0.02)
    const light = '#e9e5de'
    const mid = '#cfc9bf'
    const leaf = (x: number, y: number, len: number, a: number, w = 0.38) => {
      g.save()
      g.translate(x, y)
      g.rotate(a)
      g.fillStyle = light
      g.beginPath()
      g.moveTo(0, 0)
      g.quadraticCurveTo(len * 0.5, -len * w, len, 0)
      g.quadraticCurveTo(len * 0.5, len * w, 0, 0)
      g.fill()
      g.strokeStyle = mid
      g.lineWidth = s * 0.004
      g.beginPath()
      g.moveTo(len * 0.1, 0)
      g.lineTo(len * 0.85, 0)
      g.stroke()
      g.restore()
    }
    const scroll = (x: number, y: number, r: number, a: number) => {
      g.strokeStyle = light
      g.lineWidth = s * 0.016
      g.beginPath()
      g.arc(x, y, r, a, a + Math.PI * 1.5)
      g.stroke()
    }
    // dense small leaves fill the panel, so only small gaps stay open (pierced carving)
    const r = rngT(7)
    g.save()
    g.beginPath()
    g.rect(m, m, s - 2 * m, s - 2 * m)
    g.clip()
    for (let i = 0; i < 140; i++) leaf(m + r() * (s - 2 * m), m + r() * (s - 2 * m), s * (0.045 + r() * 0.04), r() * Math.PI * 2, 0.42)
    g.restore()
    // corner sprays and edge scrolls (behind the ring)
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = c + sx * s * 0.3
      const y = c + sy * s * 0.3
      const a = Math.atan2(sy, sx)
      for (const d of [-0.7, 0, 0.7]) leaf(x, y, s * 0.11, a + Math.PI + d, 0.3)
      scroll(c + sx * s * 0.33, c, s * 0.04, a)
      scroll(c, c + sy * s * 0.33, s * 0.04, a + Math.PI / 2)
    }
    // medallion ring
    g.strokeStyle = light
    g.lineWidth = s * 0.03
    g.beginPath()
    g.arc(c, c, s * 0.3, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = mid
    g.lineWidth = s * 0.006
    g.beginPath()
    g.arc(c, c, s * 0.3, 0, Math.PI * 2)
    g.stroke()
    // leaves radiating inside the ring, two layers
    for (let i = 0; i < 12; i++) leaf(c, c, s * 0.27, (i * Math.PI) / 6, 0.26)
    for (let i = 0; i < 12; i++) leaf(c, c, s * 0.18, (i * Math.PI) / 6 + Math.PI / 12, 0.4)
    // rosette
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      g.fillStyle = light
      g.beginPath()
      g.ellipse(c + Math.cos(a) * s * 0.055, c + Math.sin(a) * s * 0.055, s * 0.05, s * 0.03, a, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = mid
      g.lineWidth = s * 0.004
      g.stroke()
    }
    g.fillStyle = mid
    g.beginPath()
    g.arc(c, c, s * 0.035, 0, Math.PI * 2)
    g.fill()
  }, 256)
}

/** Ironing board cover: green branches, small flowers and blue dots on cream. Tiles about every 40 cm. */
export function leafPrintTexture() {
  return base('leaf-print', (g, s) => {
    g.fillStyle = '#f4f2e8'
    g.fillRect(0, 0, s, s)
    const r = rngT(11)
    g.strokeStyle = '#a9bd3c'
    g.lineCap = 'round'
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const x1 = x + Math.cos(a) * len
      const y1 = y + Math.sin(a) * len
      g.lineWidth = w
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x1, y1)
      g.stroke()
      if (depth > 0) for (const d of [-0.6, 0.5]) branch(x1, y1, a + d + (r() - 0.5) * 0.3, len * 0.6, w * 0.65, depth - 1)
    }
    wrapped(s, s * 0.1, s * 0.6, (x, y) => branch(x, y, -0.5, s * 0.25, s * 0.02, 3))
    wrapped(s, s * 0.6, s * 0.15, (x, y) => branch(x, y, 0.6, s * 0.22, s * 0.018, 3))
    for (let i = 0; i < 26; i++) {
      const x = r() * s
      const y = r() * s
      g.fillStyle = i % 3 ? '#b7c75a' : '#8aa3c9'
      wrapped(s, x, y, (px, py) => {
        g.beginPath()
        g.arc(px, py, s * (i % 3 ? 0.012 : 0.008), 0, Math.PI * 2)
        g.fill()
      })
    }
  }, 256)
}

/**
 * Carved shutter mirror frame (like an antique Indonesian window frame): two scrollwork panels across the top, a carved
 * lintel over the mirror, vine strips down both sides, a bottom panel with four-petal flowers, grooves around every panel.
 * Light tones, tinted by the frame color. The tile covers the whole 0.95 x 1.05 m face (x, y in meters from bottom left).
 */
export function shutterFrameTexture() {
  return base('shutter-frame', (g, s) => {
    const W = 0.95
    const H = 1.05
    const px = (x: number) => (x / W) * s
    const py = (y: number) => ((H - y) / H) * s
    const r = rngT(5)
    g.fillStyle = '#e2cdb6'
    g.fillRect(0, 0, s, s)
    // grain
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(120, 90, 60, ${0.06 + r() * 0.08})`
      g.lineWidth = 1 + r() * 2
      const y = r() * s
      g.beginPath()
      g.moveTo(0, y)
      g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 12, s * 0.7, y + (r() - 0.5) * 12, s, y + (r() - 0.5) * 8)
      g.stroke()
    }
    const panel = (x0: number, y0: number, x1: number, y1: number) => {
      g.fillStyle = '#7a6250'
      g.fillRect(px(x0), py(y1), px(x1) - px(x0), py(y0) - py(y1))
      g.strokeStyle = '#a58a72'
      g.lineWidth = s * 0.006
      g.strokeRect(px(x0) - 3, py(y1) - 3, px(x1) - px(x0) + 6, py(y0) - py(y1) + 6)
    }
    const carve = '#ecdccb'
    const leaf = (x: number, y: number, len: number, a: number) => {
      g.save()
      g.translate(x, y)
      g.rotate(a)
      g.fillStyle = carve
      g.beginPath()
      g.moveTo(0, 0)
      g.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0)
      g.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0)
      g.fill()
      g.restore()
    }
    // horizontal vine: a wave with leaves on alternate sides and curls
    const vineH = (x0: number, x1: number, yc: number, amp: number) => {
      g.strokeStyle = carve
      g.lineWidth = s * 0.008
      g.beginPath()
      for (let x = x0; x <= x1; x += 0.005) {
        const y = yc + Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 4) * amp
        if (x === x0) g.moveTo(px(x), py(y))
        else g.lineTo(px(x), py(y))
      }
      g.stroke()
      for (let k = 0; k < 8; k++) {
        const x = x0 + ((k + 0.5) / 8) * (x1 - x0)
        const y = yc + Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 4) * amp
        leaf(px(x), py(y), s * 0.045, k % 2 ? -0.9 : 0.9 + Math.PI)
        leaf(px(x), py(y), s * 0.03, k % 2 ? -2.2 : 2.2 + Math.PI)
      }
    }
    const vineV = (xc: number, y0: number, y1: number, amp: number) => {
      g.strokeStyle = carve
      g.lineWidth = s * 0.008
      g.beginPath()
      for (let y = y0; y <= y1; y += 0.005) {
        const x = xc + Math.sin(((y - y0) / (y1 - y0)) * Math.PI * 5) * amp
        if (y === y0) g.moveTo(px(x), py(y))
        else g.lineTo(px(x), py(y))
      }
      g.stroke()
      for (let k = 0; k < 9; k++) {
        const y = y0 + ((k + 0.5) / 9) * (y1 - y0)
        const x = xc + Math.sin(((y - y0) / (y1 - y0)) * Math.PI * 5) * amp
        leaf(px(x), py(y), s * 0.035, k % 2 ? -0.6 : Math.PI + 0.6)
      }
    }
    const flower = (x: number, y: number) => {
      for (let i = 0; i < 4; i++) leaf(px(x), py(y), s * 0.04, (i * Math.PI) / 2 + Math.PI / 4)
    }
    // top band: two panels
    panel(0.07, 0.885, 0.46, 0.985)
    panel(0.49, 0.885, 0.88, 0.985)
    vineH(0.08, 0.45, 0.935, 0.018)
    vineH(0.5, 0.87, 0.935, 0.018)
    // lintel over the mirror
    panel(0.2, 0.75, 0.75, 0.855)
    vineH(0.21, 0.74, 0.8, 0.022)
    // side strips
    panel(0.06, 0.25, 0.15, 0.85)
    panel(0.8, 0.25, 0.89, 0.85)
    vineV(0.105, 0.27, 0.83, 0.015)
    vineV(0.845, 0.27, 0.83, 0.015)
    // lattice blocks under the strips
    for (const x0 of [0.06, 0.8]) {
      panel(x0, 0.08, x0 + 0.09, 0.22)
      g.strokeStyle = carve
      g.lineWidth = s * 0.006
      for (let i = 1; i < 3; i++) {
        g.beginPath()
        g.moveTo(px(x0 + (i * 0.09) / 3), py(0.08))
        g.lineTo(px(x0 + (i * 0.09) / 3), py(0.22))
        g.stroke()
      }
      for (let j = 1; j < 4; j++) {
        g.beginPath()
        g.moveTo(px(x0), py(0.08 + (j * 0.14) / 4))
        g.lineTo(px(x0 + 0.09), py(0.08 + (j * 0.14) / 4))
        g.stroke()
      }
    }
    // bottom panel with flowers
    panel(0.2, 0.08, 0.75, 0.22)
    g.fillStyle = '#c9b29b'
    g.fillRect(px(0.2), py(0.22), px(0.75) - px(0.2), py(0.08) - py(0.22))
    for (const x of [0.29, 0.41, 0.54, 0.66]) flower(x, 0.15)
  }, 512)
}

function rngT(seed: number) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >> 17
    x ^= x << 5
    x >>>= 0
    return x / 4294967296
  }
}

/**
 * Brick baseplate table top (the whole top, x across, y = depth from the back): blue baseplates with studs, a green plate
 * at the back left and a gray train track loop with sleepers on the right.
 */
export function baseplateTopTexture() {
  return base(
    'baseplate-top',
    (g, s) => {
      const H = s / 2
      g.fillStyle = '#1f5fbf'
      g.fillRect(0, 0, s, H)
      g.fillStyle = '#3c9a3c'
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(s * 0.52, 0)
      g.lineTo(s * 0.46, H * 0.62)
      g.lineTo(0, H * 0.8)
      g.closePath()
      g.fill()
      // studs: a light dot with a dark edge every 8 px
      for (let y = 4; y < H; y += 8) {
        for (let x = 4; x < s; x += 8) {
          g.fillStyle = 'rgba(0,0,0,0.18)'
          g.beginPath()
          g.arc(x + 0.6, y + 0.8, 2.6, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = 'rgba(255,255,255,0.22)'
          g.beginPath()
          g.arc(x, y, 2.4, 0, Math.PI * 2)
          g.fill()
        }
      }
      // track loop: sleepers then two rails along a stadium shape
      const cx = s * 0.66
      const cy = H * 0.55
      const rx = s * 0.26
      const ry = H * 0.32
      const path = () => {
        g.beginPath()
        g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      }
      g.strokeStyle = '#6f7278'
      g.lineWidth = 16
      g.setLineDash([3, 4])
      path()
      g.stroke()
      g.setLineDash([])
      g.strokeStyle = '#a7aab0'
      g.lineWidth = 2.5
      for (const d of [-5, 5]) {
        g.beginPath()
        g.ellipse(cx, cy, rx + d, ry + d, 0, 0, Math.PI * 2)
        g.stroke()
      }
    },
    512,
  )
}

/** Embroidered chair back: a peach ground with a flowering branch, dark blue and rust blooms, a pastel bird */
export function embroideredBackTexture() {
  return base('embroidered-back', (g, s) => {
    g.fillStyle = '#e9a98f'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = '#2f4a2c'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(s * 0.3, s)
    g.bezierCurveTo(s * 0.32, s * 0.6, s * 0.25, s * 0.4, s * 0.3, s * 0.25)
    g.moveTo(s * 0.32, s * 0.85)
    g.bezierCurveTo(s * 0.5, s * 0.7, s * 0.6, s * 0.65, s * 0.85, s * 0.6)
    g.stroke()
    const leaf = (x: number, y: number, a: number) => {
      g.save()
      g.translate(x, y)
      g.rotate(a)
      g.fillStyle = '#2f4f3a'
      g.beginPath()
      g.ellipse(0, 0, s * 0.05, s * 0.018, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }
    for (let i = 0; i < 10; i++) leaf(s * (0.22 + (i % 2) * 0.16), s * (0.4 + i * 0.05), (i % 2 ? -1 : 1) * 0.6)
    for (let i = 0; i < 6; i++) leaf(s * (0.45 + i * 0.07), s * (0.68 + (i % 2) * 0.06), (i % 2 ? -1 : 1) * 0.7)
    const bloom = (x: number, y: number, r: number) => {
      g.fillStyle = '#c4501f'
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#28337a'
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        g.beginPath()
        g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.22, r * 0.12, a, 0, Math.PI * 2)
        g.fill()
      }
    }
    bloom(s * 0.27, s * 0.24, s * 0.1)
    bloom(s * 0.47, s * 0.12, s * 0.07)
    bloom(s * 0.8, s * 0.55, s * 0.07)
    // bird
    g.fillStyle = '#c9c7d6'
    g.beginPath()
    g.ellipse(s * 0.62, s * 0.4, s * 0.12, s * 0.06, -0.2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#5aa0c8'
    g.beginPath()
    g.ellipse(s * 0.63, s * 0.37, s * 0.06, s * 0.03, -0.2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#c45070'
    g.beginPath()
    g.moveTo(s * 0.72, s * 0.38)
    g.lineTo(s * 0.86, s * 0.33)
    g.lineTo(s * 0.8, s * 0.43)
    g.closePath()
    g.fill()
  })
}

/** Embroidered chair seat: a lime ground covered in pink stitched dashes */
export function dashSeatTexture() {
  return base('dash-seat', (g, s) => {
    g.fillStyle = '#c3cf7a'
    g.fillRect(0, 0, s, s)
    let seed = 9
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 160; i++) {
      g.fillStyle = r() < 0.5 ? '#e8338a' : '#f25aa8'
      g.save()
      g.translate(r() * s, r() * s)
      g.rotate(r() * Math.PI)
      g.beginPath()
      g.ellipse(0, 0, s * 0.025, s * 0.011, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }
  })
}

/** Hand-painted round table top: turquoise with a central medallion of two white birds, a flower ring and garlands */
export function paintedTopTexture() {
  return base(
    'painted-top',
    (g, s) => {
      const c = s / 2
      g.fillStyle = '#b48a5c'
      g.fillRect(0, 0, s, s)
      g.fillStyle = '#7fe0cf'
      g.beginPath()
      g.arc(c, c, s * 0.46, 0, Math.PI * 2)
      g.fill()
      // leaves around the medallion
      g.fillStyle = '#8cc63f'
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        g.save()
        g.translate(c + Math.cos(a) * s * 0.25, c + Math.sin(a) * s * 0.25)
        g.rotate(a)
        g.beginPath()
        g.ellipse(0, 0, s * 0.08, s * 0.035, 0, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
      g.fillStyle = '#b8242c'
      g.beginPath()
      g.arc(c, c, s * 0.2, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#f2c230'
      g.beginPath()
      g.arc(c, c, s * 0.185, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#22492c'
      g.beginPath()
      g.arc(c, c, s * 0.15, 0, Math.PI * 2)
      g.fill()
      // flower dots on the ring
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2
        g.fillStyle = ['#ff8fb8', '#3a7ad9', '#e8833a'][i % 3]
        g.beginPath()
        g.arc(c + Math.cos(a) * s * 0.168, c + Math.sin(a) * s * 0.168, s * 0.011, 0, Math.PI * 2)
        g.fill()
      }
      // two white birds
      g.fillStyle = '#f4f4f0'
      for (const [dx, dy, a] of [[-0.03, -0.04, -0.3], [0.03, 0.05, 0.3]]) {
        g.save()
        g.translate(c + dx * s, c + dy * s)
        g.rotate(a)
        g.beginPath()
        g.ellipse(0, 0, s * 0.08, s * 0.035, 0, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
      // garlands near the rim
      for (let k = 0; k < 4; k++) {
        const a0 = (k / 4) * Math.PI * 2 + 0.4
        for (let i = 0; i < 5; i++) {
          const a = a0 + i * 0.12
          const x = c + Math.cos(a) * s * 0.38
          const y = c + Math.sin(a) * s * 0.38
          g.fillStyle = '#2e8a3e'
          g.beginPath()
          g.ellipse(x + 6, y, s * 0.018, s * 0.008, a, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = i % 2 ? '#f7a8c8' : '#e07a3a'
          g.beginPath()
          g.arc(x, y, s * 0.012, 0, Math.PI * 2)
          g.fill()
        }
      }
    },
    512,
  )
}

/** Wine rack front: cherry diagonal lattice over a dark back (one tile, repeats) */
export function wineLatticeTexture() {
  return base('wine-lattice', (g, s) => {
    g.fillStyle = '#2a1810'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = '#9a5634'
    g.lineWidth = s * 0.07
    g.lineCap = 'square'
    for (const d of [-s, 0, s]) {
      g.beginPath()
      g.moveTo(d, 0)
      g.lineTo(d + s, s)
      g.stroke()
      g.beginPath()
      g.moveTo(d + s, 0)
      g.lineTo(d, s)
      g.stroke()
    }
    // a few bottles in the cells
    g.fillStyle = '#111'
    for (const [x, y] of [[0.5, 0.18], [0.18, 0.5], [0.82, 0.5]]) {
      g.beginPath()
      g.arc(x * s, y * s, s * 0.09, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** Rounded rectangle path with separate left and right corner radii (canvas units). */
function sideRoundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rl: number, rr: number) {
  g.beginPath()
  g.moveTo(x + rl, y)
  g.lineTo(x + w - rr, y)
  g.arcTo(x + w, y, x + w, y + rr, rr)
  g.lineTo(x + w, y + h - rr)
  g.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  g.lineTo(x + rl, y + h)
  g.arcTo(x, y + h, x, y + h - rl, rl)
  g.lineTo(x, y + rl)
  g.arcTo(x, y, x + rl, y, rl)
  g.closePath()
}

/** One paint splat: a blob with tapering arms ending in round drops, and a few loose drops around it. */
function splat(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, r0: () => number) {
  g.fillStyle = color
  g.strokeStyle = color
  g.lineCap = 'round'
  g.beginPath()
  g.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
  g.fill()
  const arms = 9 + Math.floor(r0() * 5)
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + r0() * 0.4
    const len = r * (0.75 + r0() * 0.75)
    const ex = cx + Math.cos(a) * len
    const ey = cy + Math.sin(a) * len
    g.lineWidth = r * (0.14 + r0() * 0.1)
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(ex, ey)
    g.stroke()
    g.beginPath()
    g.arc(ex, ey, r * (0.1 + r0() * 0.08), 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 3; i++) {
    const a = r0() * Math.PI * 2
    const d = r * (1.6 + r0() * 0.4)
    g.beginPath()
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.06, 0, Math.PI * 2)
    g.fill()
  }
}

/**
 * Kids furniture top (stool, activity table): a red rim around a black painted field with yellow, green and blue paint
 * splats. Drawn in the top's aspect ratio (w × d m, left and right corner radii rl / rr); u runs along x, v along -z.
 */
export function splatTopTexture(key: 'stool' | 'table', w: number, d: number, rl: number, rr: number) {
  const id = `splat-${key}`
  let t = cache.get(id)
  if (t) return t
  const ppm = 400
  const c = document.createElement('canvas')
  c.width = Math.round(w * ppm)
  c.height = Math.round(d * ppm)
  const g = c.getContext('2d')!
  const W = c.width
  const H = c.height
  g.fillStyle = '#d8402c'
  g.fillRect(0, 0, W, H)
  const rim = 0.045 * ppm
  sideRoundRect(g, rim, rim, W - rim * 2, H - rim * 2, Math.max(4, rl * ppm - rim), Math.max(4, rr * ppm - rim))
  g.fillStyle = '#1c2230'
  g.fill()
  let s = key === 'stool' ? 7 : 19
  const r0 = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  g.save()
  g.clip()
  const spots: [number, number, number, string][] =
    key === 'stool'
      ? [[0.45, 0.45, 0.06, '#e9de1c'], [0.8, 0.33, 0.035, '#7ee02a'], [0.18, 0.7, 0.024, '#5aa0e8']]
      : [[0.3, 0.4, 0.1, '#e9de1c'], [0.62, 0.3, 0.06, '#7ee02a'], [0.14, 0.62, 0.04, '#5aa0e8'], [0.8, 0.62, 0.05, '#e9de1c']]
  for (const [x, y, r, col] of spots) splat(g, x * W, y * H, r * ppm, col, r0)
  // worn chips and marker dots
  for (let i = 0; i < Math.round(w * d * 40); i++) {
    g.fillStyle = r0() < 0.6 ? '#c9b18a' : ['#5aa0e8', '#e9de1c', '#ffffff'][i % 3]
    g.beginPath()
    g.arc(r0() * W, r0() * H, 1 + r0() * 3, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
  // chipped rim: bare particleboard showing through
  g.fillStyle = '#b98a5e'
  for (let i = 0; i < 14; i++) {
    const side = Math.floor(r0() * 4)
    const p = r0()
    const x = side < 2 ? p * W : side === 2 ? r0() * 6 : W - r0() * 6
    const y = side === 0 ? r0() * 6 : side === 1 ? H - r0() * 6 : p * H
    g.fillRect(x, y, 2 + r0() * 7, 1 + r0() * 2)
  }
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  cache.set(id, t)
  return t
}

/** Keybed of an 88-key piano seen from above: 52 white keys with thin gaps (the black keys are separate boxes). */
export function pianoKeysTexture() {
  return base(
    'piano-keys',
    (g, s) => {
      g.fillStyle = '#f6f4ee'
      g.fillRect(0, 0, s, s)
      g.fillStyle = '#9a9890'
      for (let i = 1; i < 52; i++) g.fillRect(Math.round((i / 52) * s) - 1, 0, 2, s)
    },
    1024,
  )
}

/**
 * Upholstery of a carved dining chair seat: gold and olive weave with a scalloped diamond lattice in dark blue-gray lines
 * (repeats seamlessly).
 */
export function diamondFabricTexture() {
  return base('diamond-fabric', (g, s) => {
    g.fillStyle = '#b79c5c'
    g.fillRect(0, 0, s, s)
    let seed = 11
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(222, 200, 140, 0.55)' : 'rgba(120, 104, 60, 0.4)'
      g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 5, 1 + rnd() * 1.5)
    }
    // scalloped lattice: arcs bowing between the diamond corners, 4 diamonds per tile
    const p = s / 4
    g.strokeStyle = '#3c4650'
    g.lineWidth = 2.2
    for (let i = -1; i <= 4; i++)
      for (let j = -1; j <= 4; j++) {
        const x = i * p
        const y = j * p
        g.beginPath()
        g.moveTo(x, y)
        g.quadraticCurveTo(x + p * 0.62, y + p * 0.38, x + p, y + p)
        g.moveTo(x + p, y)
        g.quadraticCurveTo(x + p * 0.38, y + p * 0.38, x, y + p)
        g.stroke()
      }
  })
}

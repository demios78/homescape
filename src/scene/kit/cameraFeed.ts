import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useReducer, type RefObject } from 'react'
import * as THREE from 'three'
import { domainOf } from '@/ha/derive'
import { useHa } from '@/ha/store'
import { kick } from '../frame'
import type { Visual } from './visual'

/*
 * Live camera video on a screen (monitor, vertical monitor, TV) bound to a camera entity.
 * - One feed per camera, shared by every screen showing it (the desk can mirror the same camera twice for one stream).
 * - The stream is HA's HLS stream (camera/stream over the connection; HaSource.cameraStream). Safari plays HLS natively,
 *   other browsers through hls.js, loaded only when a feed starts.
 * - A feed runs only while at least one of its screens is inside the camera view; it stops STOP_MS after the last one
 *   leaves it, and while the tab is hidden. No stream on the demo source: the screen keeps its usual picture.
 * - Frames: each new video frame requests one render (frameloop "demand"), only while a screen is in view.
 */

const STOP_MS = 20_000
const RETRY_MS = 15_000

type HlsLike = { destroy(): void; loadSource(u: string): void; attachMedia(v: HTMLVideoElement): void; on(ev: string, cb: (e: unknown, d: { fatal?: boolean }) => void): void }

interface Feed {
  id: string
  video: HTMLVideoElement | null
  tex: THREE.VideoTexture | null
  mat: THREE.MeshBasicMaterial | null
  hls: HlsLike | null
  /** Screens using it, and the ones currently in view */
  users: Set<symbol>
  seen: Set<symbol>
  state: 'idle' | 'loading' | 'playing'
  stopTimer: number
  retryAt: number
  /** Bumped on every start or stop, so a late answer from an old start is dropped */
  run: number
  listeners: Set<() => void>
  /** Last stream error (debugging) */
  error?: string
}

const feeds = new Map<string, Feed>()

function feedOf(id: string): Feed {
  let f = feeds.get(id)
  if (!f) {
    f = { id, video: null, tex: null, mat: null, hls: null, users: new Set(), seen: new Set(), state: 'idle', stopTimer: 0, retryAt: 0, run: 0, listeners: new Set() }
    feeds.set(id, f)
  }
  return f
}

const notify = (f: Feed) => f.listeners.forEach((l) => l())

function setState(f: Feed, s: Feed['state']) {
  if (f.state === s) return
  f.state = s
  notify(f)
  kick()
}

function stop(f: Feed) {
  f.run++
  window.clearTimeout(f.stopTimer)
  f.stopTimer = 0
  f.hls?.destroy()
  f.hls = null
  if (f.video) {
    f.video.pause()
    f.video.removeAttribute('src')
    f.video.load()
  }
  setState(f, 'idle')
}

async function start(f: Feed) {
  const source = useHa.getState().source
  if (!source?.cameraStream || document.hidden || Date.now() < f.retryAt) return
  const run = ++f.run
  setState(f, 'loading')
  const fail = () => {
    if (run !== f.run) return
    f.retryAt = Date.now() + RETRY_MS
    stop(f)
  }
  let url: string | null = null
  try {
    url = await source.cameraStream(f.id)
  } catch {
    url = null
  }
  if (run !== f.run) return
  if (!url) return fail()
  if (!f.video) {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.autoplay = true
    v.crossOrigin = 'anonymous'
    f.video = v
    f.tex = new THREE.VideoTexture(v)
    f.tex.colorSpace = THREE.SRGBColorSpace
    f.mat = new THREE.MeshBasicMaterial({ map: f.tex, toneMapped: false })
    // A new frame: draw it, but only while a screen with this feed is in view
    const onFrame = () => {
      if (f.seen.size) kick()
      v.requestVideoFrameCallback(onFrame)
    }
    v.requestVideoFrameCallback(onFrame)
    v.addEventListener('playing', () => setState(f, 'playing'))
    v.addEventListener('error', fail)
  }
  const video = f.video
  // hls.js wherever Media Source works (Chrome's own HLS support is new and unreliable); native HLS otherwise (iPhone)
  const { default: Hls } = await import('hls.js')
  if (run !== f.run) return
  if (Hls.isSupported()) {
    const hls = new Hls({ liveSyncDurationCount: 2, maxBufferLength: 6 }) as unknown as HlsLike
    hls.on(Hls.Events.ERROR, (_e, d) => {
      f.error = String((d as { details?: string }).details ?? 'error')
      if (d.fatal) fail()
    })
    hls.loadSource(url)
    hls.attachMedia(video)
    f.hls = hls
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url
  } else {
    return fail()
  }
  void video.play().catch((e: Error) => {
    f.error = e.name
  })
}

/** Test hook (window.__homescape.cameraFeeds): each feed's state, screens in view and last error */
export function cameraFeedsDebug() {
  return [...feeds.values()].map((f) => ({ id: f.id, state: f.state, users: f.users.size, seen: f.seen.size, error: f.error, time: f.video?.currentTime ?? 0, w: f.video?.videoWidth ?? 0 }))
}

/** A screen came into view or left it */
function setSeen(f: Feed, user: symbol, seen: boolean) {
  if (seen === f.seen.has(user)) return
  if (seen) f.seen.add(user)
  else f.seen.delete(user)
  if (f.seen.size) {
    window.clearTimeout(f.stopTimer)
    f.stopTimer = 0
    if (f.state === 'idle') void start(f)
  } else if (f.state !== 'idle' && !f.stopTimer) {
    f.stopTimer = window.setTimeout(() => stop(f), STOP_MS)
  }
}

function release(f: Feed, user: symbol) {
  setSeen(f, user, false)
  f.users.delete(user)
  if (f.users.size) return
  stop(f)
  f.tex?.dispose()
  f.mat?.dispose()
  f.video = null
  f.tex = null
  f.mat = null
  feeds.delete(f.id)
}

// A hidden tab stops every feed; coming back restarts the ones in view
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    for (const f of feeds.values()) {
      if (document.hidden) stop(f)
      else if (f.seen.size) void start(f)
    }
  })
}

/** The camera shown on a screen: the main entity when it is a camera, else the first bound camera. */
export function cameraOf(v: Visual): string | null {
  if (v.bound && v.domain === 'camera' && v.entityId) return v.entityId
  return v.related.find((e) => domainOf(e.entity_id) === 'camera')?.entity_id ?? null
}

const frustum = new THREE.Frustum()
const viewProj = new THREE.Matrix4()
const sphere = new THREE.Sphere()

/** Whether the object and its parents are visible and it lies inside the camera view */
function inView(o: THREE.Object3D, camera: THREE.Camera, r: number) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(viewProj)
  o.getWorldPosition(sphere.center)
  sphere.radius = r
  return frustum.intersectsSphere(sphere)
}

/**
 * Screen material showing the live video of the camera bound to the item, or null (no camera, demo source, or the
 * stream is not playing yet): the screen then keeps its usual picture. `anchor` is the screen (its center), `r` its radius.
 */
export function useCameraFeed(v: Visual, anchor: RefObject<THREE.Object3D | null>, r = 0.5): THREE.Material | null {
  const id = cameraOf(v)
  const user = useMemo(() => Symbol('screen'), [])
  const [, render] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!id) return
    const f = feedOf(id)
    f.users.add(user)
    f.listeners.add(render)
    return () => {
      f.listeners.delete(render)
      release(f, user)
    }
  }, [id, user])
  useFrame(({ camera }) => {
    if (!id || !anchor.current) return
    const f = feeds.get(id)
    if (f) setSeen(f, user, inView(anchor.current, camera, r))
  })
  const f = id ? feeds.get(id) : undefined
  return f?.state === 'playing' && f.mat ? f.mat : null
}

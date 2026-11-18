import type { HassEntity } from '@/ha/types'
import { useHa } from '@/ha/store'
import type { Layout } from '@/model/types'
import { useLayout } from '@/model/layoutStore'

/*
 * Water use from a water meter item (waterMeter, e.g. a Flume): its main entity is today's total, an extra entity with a
 * flow rate (device_class volume_flow_rate) is the current flow. Sinks and showers in the plan run from that flow, tubs
 * fill with a bound total.
 */

/** Flow (gal/min) from which showers run instead of sinks */
export const SHOWER_FLOW = 2
/** Default amount of water (gal) that fills a tub bound to today's water use (Item.fullAt) */
export const TUB_FULL_GAL = 200

/** A volume in gallons from a value and its unit (gal, L, m³, ft³, CCF); unknown units are taken as gallons */
export function toGallons(value: number, unit?: unknown) {
  const u = typeof unit === 'string' ? unit.trim().toLowerCase() : ''
  if (u === 'l') return value / 3.78541
  if (u === 'ml') return value / 3785.41
  if (u === 'm³' || u === 'm3') return value * 264.172
  if (u === 'ft³' || u === 'ft3') return value * 7.48052
  if (u === 'ccf') return value * 748.052
  return value
}

/** A flow rate in gal/min from a value and its unit (gal/min, gal/h, L/min, L/h, m³/h, ft³/min...) */
export function toGpm(value: number, unit?: unknown) {
  const u = typeof unit === 'string' ? unit.trim().toLowerCase() : ''
  const [vol, per] = u.split('/')
  const time = per === 'h' ? 60 : per === 's' ? 1 / 60 : per === 'd' ? 1440 : 1
  return toGallons(value, vol || 'gal') / time
}

/** Per minute flow units first (a Flume also has gal/h and gal/d averages) */
const PER_MIN = /\/\s*min$/i

/** The flow entity among a meter's bindings: per minute flow first, then any volume flow rate */
function flowEntity(ids: string[], entities: Record<string, HassEntity>) {
  const list = ids.map((id) => entities[id]).filter((e): e is HassEntity => Boolean(e) && e.entity_id.startsWith('sensor.'))
  const isFlow = (e: HassEntity) => e.attributes.device_class === 'volume_flow_rate' || /\/\s*(min|h|s)$/i.test(String(e.attributes.unit_of_measurement ?? ''))
  return list.find((e) => isFlow(e) && PER_MIN.test(String(e.attributes.unit_of_measurement ?? ''))) ?? list.find(isFlow)
}

/** Bindings of the first water meter on any floor, as one string (a stable selector value) */
function meterKey(layout: Layout | null) {
  for (const l of layout?.levels ?? []) {
    const m = l.items.find((i) => i.kind === 'waterMeter')
    if (m) return [m.entityId, ...(m.extras ?? [])].filter(Boolean).join(',')
  }
  return ''
}

/** Current water flow in gal/min from the plan's water meter (null when there is none or it is not reporting) */
export function useWaterFlow() {
  const key = useLayout((s) => meterKey(s.layout))
  return useHa((s) => {
    if (!key) return null
    const e = flowEntity(key.split(','), s.entities)
    const n = e ? Number(e.state) : NaN
    return Number.isFinite(n) ? Math.round(toGpm(n, e!.attributes.unit_of_measurement) * 100) / 100 : null
  })
}

/** Flow of a single meter's own bindings (the meter model shows its own flow) */
export function useFlowOf(ids: string[]) {
  const key = ids.join(',')
  return useHa((s) => {
    const e = flowEntity(key.split(','), s.entities)
    const n = e ? Number(e.state) : NaN
    return Number.isFinite(n) ? Math.round(toGpm(n, e!.attributes.unit_of_measurement) * 100) / 100 : null
  })
}

/** What runs now: sinks below SHOWER_FLOW, showers from it, nothing while no water flows */
export function useWaterRunning(): 'none' | 'sink' | 'shower' {
  const f = useWaterFlow()
  if (f == null || f <= 0.02) return 'none'
  return f < SHOWER_FLOW ? 'sink' : 'shower'
}

export interface MotionPoint {
  x: number
  y: number
}

export interface AlphaMask {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface MotionParticle {
  target: MotionPoint
  origin: MotionPoint
  radius: number
  speed: number
  offset: number
  color: string
}

export interface ProjectedParticle extends MotionPoint {
  radius: number
  color: string
}

export type MotionPhaseName = 'drift' | 'assemble' | 'hold' | 'release'

export interface MotionPhase {
  name: MotionPhaseName
  progress: number
}

const CYCLE_MS = 10_000
const ALPHA_THRESHOLD = 64
const BLUE = '#2563eb'
const CYAN = '#0891b2'
const CORAL = '#e56b6f'

export function motionPhaseAt(elapsedMs: number): MotionPhase {
  const time = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS

  if (time < 2800) return { name: 'drift', progress: time / 2800 }
  if (time < 4800) return { name: 'assemble', progress: (time - 2800) / 2000 }
  if (time < 7000) return { name: 'hold', progress: (time - 4800) / 2200 }
  if (time < 9000) return { name: 'release', progress: (time - 7000) / 2000 }
  return { name: 'drift', progress: (time - 9000) / 1000 }
}

export function frameDelta(previousTimestamp: number, timestamp: number): number {
  return clamp(timestamp - previousTimestamp, 0, 1000)
}

export function sampleLogoTargets(
  mask: AlphaMask,
  count: number,
  width: number,
  height: number,
): MotionPoint[] {
  if (mask.width <= 0 || mask.height <= 0 || count <= 0 || width <= 0 || height <= 0) return []

  const visible: MotionPoint[] = []
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const alphaIndex = (y * mask.width + x) * 4 + 3
      if ((mask.data[alphaIndex] ?? 0) >= ALPHA_THRESHOLD) visible.push({ x, y })
    }
  }

  if (visible.length === 0) return []

  const fieldSize = Math.min(width, height) * 0.58
  const imageScale = fieldSize / Math.max(mask.width, mask.height)
  const imageWidth = mask.width * imageScale
  const imageHeight = mask.height * imageScale
  const startX = (width - imageWidth) / 2
  const startY = (height - imageHeight) / 2
  const random = seededRandom(41)

  return Array.from({ length: count }, (_, index) => {
    const sourceIndex = Math.floor((index * visible.length) / count) % visible.length
    const source = visible[sourceIndex]
    const jitter = visible.length < count ? imageScale * 0.28 : 0

    return {
      x: startX + (source.x + 0.5) * imageScale + (random() - 0.5) * jitter,
      y: startY + (source.y + 0.5) * imageScale + (random() - 0.5) * jitter,
    }
  })
}

export function createFallbackTargets(count: number, width: number, height: number): MotionPoint[] {
  if (count <= 0 || width <= 0 || height <= 0) return []

  const random = seededRandom(19)
  const verticalCount = Math.max(1, Math.round(count * 0.58))
  const horizontalCount = count - verticalCount
  const thickness = Math.min(width, height) * 0.055
  const verticalX = width * 0.43
  const horizontalY = height * 0.63
  const points: MotionPoint[] = []

  for (let index = 0; index < verticalCount; index += 1) {
    const progress = verticalCount === 1 ? 0.5 : index / (verticalCount - 1)
    points.push({
      x: verticalX + (random() - 0.5) * thickness,
      y: height * 0.29 + progress * height * 0.34 + (random() - 0.5) * thickness,
    })
  }

  for (let index = 0; index < horizontalCount; index += 1) {
    const progress = horizontalCount === 1 ? 0.5 : index / (horizontalCount - 1)
    points.push({
      x: verticalX + progress * width * 0.24 + (random() - 0.5) * thickness,
      y: horizontalY + (random() - 0.5) * thickness,
    })
  }

  return points
}

export function createParticles(
  targets: MotionPoint[],
  width: number,
  height: number,
  seed = 37,
): MotionParticle[] {
  const random = seededRandom(seed)

  return targets.map((target, index) => ({
    target,
    origin: {
      x: width * (0.12 + random() * 0.76),
      y: height * (0.12 + random() * 0.76),
    },
    radius: 1.35 + random() * 1.5,
    speed: 0.68 + random() * 0.62,
    offset: random() * Math.PI * 2,
    color: index % 17 === 0 ? CORAL : index % 5 === 0 ? CYAN : BLUE,
  }))
}

export function projectParticles(
  particles: MotionParticle[],
  elapsedMs: number,
  width: number,
  height: number,
  parallax: MotionPoint,
): ProjectedParticle[] {
  const phase = motionPhaseAt(elapsedMs)
  const assembly = assemblyAmount(phase)

  return particles.map((particle) => {
    const drift = driftPosition(particle, elapsedMs, width, height)
    const breath = phase.name === 'hold' ? Math.sin(elapsedMs * 0.003 + particle.offset) * 1.25 : 0

    return {
      x: mix(drift.x, particle.target.x, assembly) + breath + parallax.x,
      y: mix(drift.y, particle.target.y, assembly) + breath * 0.65 + parallax.y,
      radius: particle.radius,
      color: particle.color,
    }
  })
}

function assemblyAmount(phase: MotionPhase): number {
  if (phase.name === 'assemble') return smoothstep(phase.progress)
  if (phase.name === 'hold') return 1
  if (phase.name === 'release') return 1 - smoothstep(phase.progress)
  return 0
}

function driftPosition(
  particle: MotionParticle,
  elapsedMs: number,
  width: number,
  height: number,
): MotionPoint {
  const time = elapsedMs * 0.00012 * particle.speed
  const margin = 18
  return {
    x: clamp(
      particle.origin.x + Math.sin(time * 1.7 + particle.offset) * width * 0.09,
      margin,
      Math.max(margin, width - margin),
    ),
    y: clamp(
      particle.origin.y + Math.cos(time * 1.35 + particle.offset * 0.8) * height * 0.085,
      margin,
      Math.max(margin, height - margin),
    ),
  }
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function smoothstep(value: number): number {
  const clamped = clamp(value, 0, 1)
  return clamped * clamped * (3 - 2 * clamped)
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

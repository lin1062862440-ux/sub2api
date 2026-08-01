import { describe, expect, it } from 'vitest'

import {
  createFallbackTargets,
  createParticles,
  motionPhaseAt,
  projectParticles,
  sampleLogoTargets,
} from './brand-motion'

describe('brand motion model', () => {
  it('moves through the full animation cycle', () => {
    expect(motionPhaseAt(1000).name).toBe('drift')
    expect(motionPhaseAt(3600).name).toBe('assemble')
    expect(motionPhaseAt(5600).name).toBe('hold')
    expect(motionPhaseAt(7800).name).toBe('release')
    expect(motionPhaseAt(9600).name).toBe('drift')
    expect(motionPhaseAt(10_000)).toEqual(motionPhaseAt(0))
  })

  it('samples only opaque logo pixels into centered targets', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4)
    data[(1 * 4 + 1) * 4 + 3] = 255
    data[(2 * 4 + 2) * 4 + 3] = 255

    const targets = sampleLogoTargets({ width: 4, height: 4, data }, 8, 320, 320)

    expect(targets).toHaveLength(8)
    expect(targets.every(({ x, y }) => x > 60 && x < 260 && y > 60 && y < 260)).toBe(true)
  })

  it('returns no sampled targets when a mask has no visible pixels', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4)

    expect(sampleLogoTargets({ width: 4, height: 4, data }, 12, 320, 320)).toEqual([])
  })

  it('creates a deterministic LinAI fallback arrangement', () => {
    const first = createFallbackTargets(30, 320, 320)
    const second = createFallbackTargets(30, 320, 320)

    expect(first).toEqual(second)
    expect(first).toHaveLength(30)
    expect(new Set(first.map((point) => Math.round(point.x))).size).toBeGreaterThan(4)
    expect(new Set(first.map((point) => Math.round(point.y))).size).toBeGreaterThan(4)
  })

  it('creates repeatable particles for a fixed seed', () => {
    const targets = createFallbackTargets(12, 320, 320)

    expect(createParticles(targets, 320, 320, 7)).toEqual(createParticles(targets, 320, 320, 7))
  })

  it('projects particles onto the logo during the hold phase', () => {
    const targets = createFallbackTargets(12, 320, 320)
    const particles = createParticles(targets, 320, 320, 7)
    const frame = projectParticles(particles, 5600, 320, 320, { x: 0, y: 0 })

    expect(frame).toHaveLength(12)
    frame.forEach((point, index) => {
      expect(Math.hypot(point.x - targets[index].x, point.y - targets[index].y)).toBeLessThan(3)
    })
  })
})

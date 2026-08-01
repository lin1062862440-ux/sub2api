<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  createFallbackTargets,
  createParticles,
  frameDelta,
  projectParticles,
  sampleLogoTargets,
  type AlphaMask,
  type MotionParticle,
  type MotionPoint,
  type ProjectedParticle,
} from '@/lib/brand-motion'

const props = withDefaults(defineProps<{
  wordmark?: string
}>(), {
  wordmark: 'L AI',
})

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const motionState = ref<'loading' | 'running' | 'paused' | 'static'>('loading')

let context: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null
let motionPreference: MediaQueryList | null = null
let frameId: number | null = null
let mask: AlphaMask | null = null
let particles: MotionParticle[] = []
let fieldWidth = 0
let fieldHeight = 0
let elapsedMs = 0
let previousFrameTime = 0
let focused = true
let reducedMotion = false
let mounted = false
let pointerTarget: MotionPoint = { x: 0, y: 0 }
let pointerPosition: MotionPoint = { x: 0, y: 0 }

onMounted(() => {
  mounted = true
  context = canvas.value?.getContext('2d') ?? null
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionPreference.matches
  mask = createWordmarkMask(props.wordmark)

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    resizeField(entry.contentRect.width, entry.contentRect.height)
  })
  if (root.value) {
    resizeObserver.observe(root.value)
    root.value.addEventListener('pointermove', handlePointerMove, { passive: true })
    root.value.addEventListener('pointerleave', resetPointer, { passive: true })
  }

  document.addEventListener('visibilitychange', syncMotion)
  window.addEventListener('focus', handleFocus)
  window.addEventListener('blur', handleBlur)
  motionPreference.addEventListener('change', handleMotionPreference)

})

watch(
  () => props.wordmark,
  () => {
    if (!mounted) return
    mask = createWordmarkMask(props.wordmark)
    rebuildParticles()
    syncMotion()
  },
)

onBeforeUnmount(() => {
  mounted = false
  stopLoop()
  resizeObserver?.disconnect()
  resizeObserver = null
  root.value?.removeEventListener('pointermove', handlePointerMove)
  root.value?.removeEventListener('pointerleave', resetPointer)
  document.removeEventListener('visibilitychange', syncMotion)
  window.removeEventListener('focus', handleFocus)
  window.removeEventListener('blur', handleBlur)
  motionPreference?.removeEventListener('change', handleMotionPreference)
  motionPreference = null
})

function createWordmarkMask(wordmark: string): AlphaMask | null {
  const width = 256
  const height = 96
  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const offscreenContext = offscreen.getContext('2d')
  if (!offscreenContext) return null

  offscreenContext.clearRect(0, 0, width, height)
  offscreenContext.fillStyle = '#000000'
  offscreenContext.font = "800 64px -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
  offscreenContext.textAlign = 'center'
  offscreenContext.textBaseline = 'middle'
  offscreenContext.fillText(wordmark.trim() || 'L AI', width / 2, height / 2)
  const imageData = offscreenContext.getImageData(0, 0, width, height)
  return { width: imageData.width, height: imageData.height, data: imageData.data }
}

function resizeField(width: number, height: number) {
  fieldWidth = Math.max(0, width)
  fieldHeight = Math.max(0, height)
  const targetCanvas = canvas.value
  if (!targetCanvas || !context || fieldWidth <= 0 || fieldHeight <= 0) {
    particles = []
    syncMotion()
    return
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  targetCanvas.width = Math.max(1, Math.round(fieldWidth * pixelRatio))
  targetCanvas.height = Math.max(1, Math.round(fieldHeight * pixelRatio))
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  rebuildParticles()
  syncMotion()
}

function rebuildParticles() {
  if (fieldWidth <= 0 || fieldHeight <= 0) return
  const count = Math.round(clamp(Math.min(fieldWidth, fieldHeight) * 0.68, 220, 250))
  const sampled = mask ? sampleLogoTargets(mask, count, fieldWidth, fieldHeight, 0.78) : []
  const targets = sampled.length > 0
    ? sampled
    : createFallbackTargets(count, fieldWidth, fieldHeight)
  particles = createParticles(targets, fieldWidth, fieldHeight)
}

function syncMotion() {
  if (!mounted || !context || particles.length === 0) return

  if (reducedMotion) {
    stopLoop()
    motionState.value = 'static'
    drawFrame(5600)
    return
  }

  if (!focused || document.hidden || fieldWidth <= 0 || fieldHeight <= 0) {
    stopLoop()
    motionState.value = 'paused'
    return
  }

  motionState.value = 'running'
  drawFrame(elapsedMs)
  startLoop()
}

function startLoop() {
  if (frameId !== null) return
  frameId = requestAnimationFrame(animate)
}

function stopLoop() {
  if (frameId !== null) cancelAnimationFrame(frameId)
  frameId = null
  previousFrameTime = 0
}

function animate(timestamp: number) {
  frameId = null
  if (!mounted || reducedMotion || !focused || document.hidden) {
    syncMotion()
    return
  }

  if (previousFrameTime === 0) previousFrameTime = timestamp
  const delta = frameDelta(previousFrameTime, timestamp)
  previousFrameTime = timestamp
  elapsedMs += delta
  pointerPosition = {
    x: mix(pointerPosition.x, pointerTarget.x, 0.065),
    y: mix(pointerPosition.y, pointerTarget.y, 0.065),
  }
  drawFrame(elapsedMs)
  startLoop()
}

function drawFrame(time: number) {
  if (!context) return
  context.clearRect(0, 0, fieldWidth, fieldHeight)
  const frame = projectParticles(particles, time, fieldWidth, fieldHeight, pointerPosition)
  drawConnections(context, frame)

  context.globalAlpha = 0.94
  for (const particle of frame) {
    context.beginPath()
    context.fillStyle = particle.color
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
}

function drawConnections(target: CanvasRenderingContext2D, frame: ProjectedParticle[]) {
  const maximumDistance = Math.min(fieldWidth, fieldHeight) * 0.13
  let strokes = 0
  target.strokeStyle = 'rgba(37, 99, 235, 0.16)'
  target.lineWidth = 0.75

  for (let first = 0; first < frame.length && strokes < 36; first += 1) {
    for (let second = first + 1; second < frame.length && strokes < 36; second += 1) {
      const from = frame[first]
      const to = frame[second]
      const distance = Math.hypot(from.x - to.x, from.y - to.y)
      if (distance > maximumDistance) continue

      target.globalAlpha = Math.max(0.04, 0.18 * (1 - distance / maximumDistance))
      target.beginPath()
      target.moveTo(from.x, from.y)
      target.lineTo(to.x, to.y)
      target.stroke()
      strokes += 1
    }
  }
  target.globalAlpha = 1
}

function handlePointerMove(event: PointerEvent) {
  if (!root.value || reducedMotion) return
  const bounds = root.value.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) return
  pointerTarget = {
    x: clamp((event.clientX - bounds.left) / bounds.width - 0.5, -0.5, 0.5) * 16,
    y: clamp((event.clientY - bounds.top) / bounds.height - 0.5, -0.5, 0.5) * 16,
  }
}

function resetPointer() {
  pointerTarget = { x: 0, y: 0 }
}

function handleFocus() {
  focused = true
  syncMotion()
}

function handleBlur() {
  focused = false
  syncMotion()
}

function handleMotionPreference(event: MediaQueryListEvent) {
  reducedMotion = event.matches
  syncMotion()
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}
</script>

<template>
  <div
    ref="root"
    class="brand-motion"
    :data-motion-state="motionState"
    :data-motion-wordmark="wordmark"
    data-testid="brand-motion"
  >
    <canvas ref="canvas" aria-hidden="true" />
  </div>
</template>

<style scoped>
.brand-motion {
  position: relative;
  width: min(360px, 100%);
  aspect-ratio: 1;
  min-height: 280px;
  max-height: 360px;
  margin: auto 0;
  overflow: hidden;
}

.brand-motion canvas {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>

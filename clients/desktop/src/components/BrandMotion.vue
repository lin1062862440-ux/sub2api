<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import fallbackLogo from '@/assets/linai-logo.png'
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

const props = defineProps<{
  logo?: string | null
}>()

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
let loadGeneration = 0
let pointerTarget: MotionPoint = { x: 0, y: 0 }
let pointerPosition: MotionPoint = { x: 0, y: 0 }

onMounted(() => {
  mounted = true
  context = canvas.value?.getContext('2d') ?? null
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionPreference.matches

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

  void loadTargets()
})

watch(
  () => props.logo,
  () => {
    if (mounted) void loadTargets()
  },
)

onBeforeUnmount(() => {
  mounted = false
  loadGeneration += 1
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

async function loadTargets() {
  const generation = ++loadGeneration
  motionState.value = 'loading'

  let nextMask: AlphaMask | null = null
  const sources = [...new Set([props.logo?.trim(), fallbackLogo].filter(Boolean))] as string[]
  for (const source of sources) {
    try {
      nextMask = await decodeLogoMask(source)
      if (nextMask) break
    } catch {
      // A configured logo is optional decoration; the bundled mark is the next source.
    }
  }

  if (!mounted || generation !== loadGeneration) return
  mask = nextMask
  rebuildParticles()
  syncMotion()
}

async function decodeLogoMask(source: string): Promise<AlphaMask> {
  const image = await loadImage(source)
  const size = 96
  const offscreen = document.createElement('canvas')
  offscreen.width = size
  offscreen.height = size
  const offscreenContext = offscreen.getContext('2d')
  if (!offscreenContext) throw new Error('Canvas 2D is unavailable')

  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('Logo has no dimensions')

  const scale = Math.min(size / sourceWidth, size / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  offscreenContext.clearRect(0, 0, size, size)
  offscreenContext.drawImage(
    image,
    (size - drawWidth) / 2,
    (size - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )
  const imageData = offscreenContext.getImageData(0, 0, size, size)
  return { width: imageData.width, height: imageData.height, data: imageData.data }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timeoutId = window.setTimeout(() => reject(new Error('Logo decode timed out')), 4000)
    const settle = (callback: () => void) => {
      window.clearTimeout(timeoutId)
      image.onload = null
      image.onerror = null
      callback()
    }

    image.onload = () => settle(() => resolve(image))
    image.onerror = () => settle(() => reject(new Error('Logo decode failed')))
    if (/^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous'
    image.src = source
  })
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
  const count = Math.round(clamp(Math.min(fieldWidth, fieldHeight) * 0.38, 90, 140))
  const sampled = mask ? sampleLogoTargets(mask, count, fieldWidth, fieldHeight) : []
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

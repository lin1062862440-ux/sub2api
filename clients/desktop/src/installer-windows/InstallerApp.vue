<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ArrowRight,
  Check,
  Folder,
  FolderOpen,
  Minus,
  MonitorUp,
  MousePointer2,
  PanelTop,
  X,
} from '@lucide/vue'

interface InstallerEnvironment {
  defaultInstallDir: string
  requiredBytes: number
  availableBytes: number | null
  payloadReady: boolean
}

interface DiskSpaceInfo {
  availableBytes: number | null
}

interface InstallProgress {
  percent: number
  phase: 'verify' | 'copy' | 'configure' | 'complete'
  message: string
}

interface InstallRequest {
  installDir: string
  launchAtStartup: boolean
  floatingStatus: boolean
  desktopShortcut: boolean
}

interface MotionPoint {
  x: number
  y: number
}

interface Particle {
  origin: MotionPoint
  radius: number
  speed: number
  offset: number
  color: string
}

type UiPhase = 'brand' | 'config' | 'installing' | 'complete' | 'error'

const canvas = ref<HTMLCanvasElement | null>(null)
const scene = ref<HTMLElement | null>(null)
const installDir = ref('C:\\Program Files\\LinAI')
const launchAtStartup = ref(true)
const floatingStatus = ref(true)
const desktopShortcut = ref(true)
const requiredBytes = ref(186 * 1024 * 1024)
const availableBytes = ref<number | null>(null)
const phase = ref<UiPhase>('brand')
const progress = ref(0)
const progressPhase = ref<InstallProgress['phase']>('verify')
const status = ref('正在启动安装程序')
const error = ref('')
const payloadReady = ref(true)

let defaultInstallDir = 'C:\\Program Files\\LinAI'
let unlistenProgress: UnlistenFn | null = null
let verifyTimer: number | null = null
let phaseTimer: number | null = null
let mockTimer: number | null = null
let frameId: number | null = null
let resizeObserver: ResizeObserver | null = null
let motionPreference: MediaQueryList | null = null
let themePreference: MediaQueryList | null = null
let fieldWidth = 0
let fieldHeight = 0
let particleStart = 0
let morphStart = 0
let particles: Particle[] = []
let largeTargets: MotionPoint[] = []
let compactTargets: MotionPoint[] = []

const progressSteps: InstallProgress['phase'][] = ['verify', 'copy', 'configure', 'complete']
const stepLabels = ['验证', '复制文件', '写入配置', '完成']
const activeStep = computed(() => progressSteps.indexOf(progressPhase.value))
const canInstall = computed(() => phase.value === 'config' && installDir.value.trim().length > 0)
const primaryLabel = computed(() => {
  if (phase.value === 'installing') return '安装中…'
  if (phase.value === 'complete') return '立即启动'
  if (phase.value === 'error') return '重试安装'
  return '确认并安装'
})
const requiredLabel = computed(() => formatBytes(requiredBytes.value))
const availableLabel = computed(() => availableBytes.value === null ? '正在计算' : `可用 ${formatBytes(availableBytes.value)}`)

onMounted(async () => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  themePreference = window.matchMedia('(prefers-color-scheme: dark)')
  themePreference.addEventListener('change', rebuildParticles)

  await nextTick()
  resizeObserver = new ResizeObserver(rebuildParticles)
  if (scene.value) resizeObserver.observe(scene.value)
  rebuildParticles()
  particleStart = performance.now()
  frameId = requestAnimationFrame(drawParticles)

  if (isTauri()) {
    unlistenProgress = await listen<InstallProgress>('installer://progress', ({ payload }) => applyProgress(payload))
    try {
      const environment = await invoke<InstallerEnvironment>('installer_environment')
      defaultInstallDir = environment.defaultInstallDir
      installDir.value = environment.defaultInstallDir
      requiredBytes.value = environment.requiredBytes
      availableBytes.value = environment.availableBytes
      payloadReady.value = environment.payloadReady
    } catch (reason) {
      showError(messageFor(reason, '无法读取安装环境'))
      return
    }
  } else {
    availableBytes.value = 92.4 * 1024 * 1024 * 1024
  }

  startIntro()
})

onBeforeUnmount(() => {
  clearTimers()
  if (frameId !== null) cancelAnimationFrame(frameId)
  resizeObserver?.disconnect()
  themePreference?.removeEventListener('change', rebuildParticles)
  unlistenProgress?.()
})

function startIntro() {
  clearTimers()
  error.value = ''
  phase.value = 'brand'
  progress.value = 0
  progressPhase.value = 'verify'
  status.value = '正在启动安装程序'
  particleStart = performance.now()
  morphStart = 0

  if (motionPreference?.matches) {
    progress.value = 18
    status.value = '请选择安装位置，然后继续'
    morphStart = performance.now() - 1000
    phase.value = 'config'
    return
  }

  verifyTimer = window.setInterval(() => {
    progress.value = Math.min(18, progress.value + 1)
    status.value = '正在验证安装环境'
  }, 90)
  phaseTimer = window.setTimeout(() => {
    if (verifyTimer !== null) window.clearInterval(verifyTimer)
    verifyTimer = null
    progress.value = 18
    status.value = '请选择安装位置，然后继续'
    morphStart = performance.now()
    phase.value = 'config'
  }, 2100)
}

async function browseInstallDirectory() {
  if (phase.value !== 'config') return
  if (!isTauri()) {
    installDir.value = installDir.value.startsWith('C:') ? 'D:\\Applications\\LinAI' : defaultInstallDir
    availableBytes.value = 187.2 * 1024 * 1024 * 1024
    return
  }
  try {
    const selected = await invoke<string | null>('choose_install_directory', { initialPath: installDir.value })
    if (!selected) return
    installDir.value = selected
    const space = await invoke<DiskSpaceInfo>('inspect_install_directory', { path: selected })
    availableBytes.value = space.availableBytes
  } catch (reason) {
    showError(messageFor(reason, '无法选择安装目录'))
  }
}

function resetDefaults() {
  if (phase.value !== 'config') return
  installDir.value = defaultInstallDir
  launchAtStartup.value = true
  floatingStatus.value = true
  desktopShortcut.value = true
  error.value = ''
}

async function primaryAction() {
  if (phase.value === 'complete') {
    if (isTauri()) await invoke('launch_installed_app', { installDir: installDir.value })
    return
  }
  if (phase.value === 'error') {
    phase.value = 'config'
    error.value = ''
  }
  if (!canInstall.value) return

  if (!payloadReady.value && isTauri()) {
    showError('安装载荷尚未嵌入，请使用 bundle:windows 生成正式安装包')
    return
  }

  progress.value = 18
  progressPhase.value = 'copy'
  status.value = `正在复制文件到 ${installDir.value}`
  phase.value = 'installing'
  error.value = ''
  applyProgress({ percent: 18, phase: 'copy', message: `正在复制文件到 ${installDir.value}` })
  const request: InstallRequest = {
    installDir: installDir.value.trim(),
    launchAtStartup: launchAtStartup.value,
    floatingStatus: floatingStatus.value,
    desktopShortcut: desktopShortcut.value,
  }

  if (!isTauri()) {
    runMockInstall()
    return
  }
  try {
    await invoke('start_installation', { request })
  } catch (reason) {
    showError(messageFor(reason, '安装失败，请重试'))
  }
}

function runMockInstall() {
  let value = 18
  mockTimer = window.setInterval(() => {
    value = Math.min(100, value + (value < 60 ? 2 : 1))
    const nextPhase: InstallProgress['phase'] = value < 60 ? 'copy' : value < 88 ? 'configure' : value < 100 ? 'complete' : 'complete'
    const message = value < 60
      ? `正在复制文件到 ${installDir.value}`
      : value < 88
        ? '正在写入你的配置'
        : value < 100
          ? '正在完成最后步骤'
          : '安装完成，可以立即启动'
    applyProgress({ percent: value, phase: nextPhase, message })
    if (value === 100 && mockTimer !== null) {
      window.clearInterval(mockTimer)
      mockTimer = null
    }
  }, 70)
}

function applyProgress(next: InstallProgress) {
  progress.value = Math.max(progress.value, Math.min(100, next.percent))
  progressPhase.value = next.phase
  status.value = next.message
  if (next.percent >= 100) phase.value = 'complete'
}

function showError(message: string) {
  clearTimers()
  error.value = message
  status.value = message
  phase.value = 'error'
}

function clearTimers() {
  if (verifyTimer !== null) window.clearInterval(verifyTimer)
  if (phaseTimer !== null) window.clearTimeout(phaseTimer)
  if (mockTimer !== null) window.clearInterval(mockTimer)
  verifyTimer = null
  phaseTimer = null
  mockTimer = null
}

async function minimizeWindow() {
  if (isTauri()) await getCurrentWindow().minimize()
}

async function closeWindow() {
  if (phase.value === 'installing') return
  if (isTauri()) await getCurrentWindow().close()
}

function rebuildParticles() {
  const targetCanvas = canvas.value
  const targetScene = scene.value
  if (!targetCanvas || !targetScene) return
  const bounds = targetScene.getBoundingClientRect()
  fieldWidth = bounds.width
  fieldHeight = bounds.height
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  targetCanvas.width = Math.max(1, Math.round(fieldWidth * pixelRatio))
  targetCanvas.height = Math.max(1, Math.round(fieldHeight * pixelRatio))
  const context = targetCanvas.getContext('2d')
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

  const mask = createWordmarkMask()
  const count = Math.round(clamp(Math.min(fieldWidth, fieldHeight) * 0.58, 220, 250))
  largeTargets = sampleTargets(mask, count, fieldWidth * 0.5, fieldHeight * 0.47, Math.min(fieldWidth * 0.52, 350))
  compactTargets = sampleTargets(mask, count, fieldWidth * 0.19, fieldHeight * 0.49, Math.min(fieldWidth * 0.22, 155))
  const random = seededRandom(37)
  const dark = themePreference?.matches === true
  const colors = dark
    ? { blue: '#60a5fa', cyan: '#22d3ee', coral: '#fb7185' }
    : { blue: '#2563eb', cyan: '#0891b2', coral: '#e56b6f' }
  particles = largeTargets.map((_, index) => ({
    origin: {
      x: fieldWidth * (0.08 + random() * 0.84),
      y: fieldHeight * (0.08 + random() * 0.84),
    },
    radius: 1.35 + random() * 1.5,
    speed: 0.68 + random() * 0.62,
    offset: random() * Math.PI * 2,
    color: index % 17 === 0 ? colors.coral : index % 5 === 0 ? colors.cyan : colors.blue,
  }))
}

function drawParticles(timestamp: number) {
  const targetCanvas = canvas.value
  const context = targetCanvas?.getContext('2d')
  if (!context || fieldWidth <= 0 || fieldHeight <= 0 || particles.length === 0) {
    frameId = requestAnimationFrame(drawParticles)
    return
  }
  context.clearRect(0, 0, fieldWidth, fieldHeight)
  const elapsed = timestamp - particleStart
  const assembly = motionPreference?.matches ? 1 : smoothstep((elapsed - 420) / 1400)
  const morph = morphStart ? smoothstep((timestamp - morphStart) / 950) : 0
  const frame = particles.map((particle, index) => {
    const time = elapsed * 0.00012 * particle.speed
    const driftX = clamp(
      particle.origin.x + Math.sin(time * 1.7 + particle.offset) * fieldWidth * 0.09,
      18,
      fieldWidth - 18,
    )
    const driftY = clamp(
      particle.origin.y + Math.cos(time * 1.35 + particle.offset * 0.8) * fieldHeight * 0.085,
      18,
      fieldHeight - 18,
    )
    const target = {
      x: mix(largeTargets[index].x, compactTargets[index].x, morph),
      y: mix(largeTargets[index].y, compactTargets[index].y, morph),
    }
    const settle = morphStart ? 1 : assembly
    const breath = motionPreference?.matches ? 0 : Math.sin(elapsed * 0.003 + particle.offset) * 1.25
    return {
      x: mix(driftX, target.x, settle) + breath,
      y: mix(driftY, target.y, settle) + breath * 0.65,
      radius: particle.radius,
      color: particle.color,
    }
  })

  const maximumDistance = Math.min(fieldWidth, fieldHeight) * 0.13
  let strokes = 0
  context.strokeStyle = themePreference?.matches
    ? 'rgba(96, 165, 250, 0.20)'
    : 'rgba(37, 99, 235, 0.16)'
  context.lineWidth = 0.75
  for (let first = 0; first < frame.length && strokes < 36; first += 1) {
    for (let second = first + 1; second < frame.length && strokes < 36; second += 1) {
      const from = frame[first]
      const to = frame[second]
      const distance = Math.hypot(from.x - to.x, from.y - to.y)
      if (distance > maximumDistance) continue
      context.globalAlpha = Math.max(0.04, 0.18 * (1 - distance / maximumDistance))
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
      strokes += 1
    }
  }
  context.globalAlpha = 0.94
  for (const particle of frame) {
    context.beginPath()
    context.fillStyle = particle.color
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
  frameId = requestAnimationFrame(drawParticles)
}

function createWordmarkMask(): ImageData {
  const target = document.createElement('canvas')
  target.width = 256
  target.height = 96
  const context = target.getContext('2d')
  if (!context) return new ImageData(256, 96)
  context.fillStyle = '#000000'
  context.font = "500 64px 'Segoe UI Variable', 'Segoe UI', sans-serif"
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('L AI', 128, 48)
  return context.getImageData(0, 0, 256, 96)
}

function sampleTargets(mask: ImageData, count: number, centerX: number, centerY: number, targetWidth: number): MotionPoint[] {
  const visible: MotionPoint[] = []
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if ((mask.data[(y * mask.width + x) * 4 + 3] ?? 0) >= 64) visible.push({ x, y })
    }
  }
  if (visible.length === 0) return Array.from({ length: count }, () => ({ x: centerX, y: centerY }))
  const minimumX = Math.min(...visible.map((point) => point.x))
  const maximumX = Math.max(...visible.map((point) => point.x))
  const minimumY = Math.min(...visible.map((point) => point.y))
  const maximumY = Math.max(...visible.map((point) => point.y))
  const contentWidth = maximumX - minimumX + 1
  const contentHeight = maximumY - minimumY + 1
  const scale = targetWidth / contentWidth
  const random = seededRandom(41)
  return Array.from({ length: count }, (_, index) => {
    const source = visible[Math.floor((index * visible.length) / count) % visible.length]
    return {
      x: centerX - contentWidth * scale / 2 + (source.x - minimumX + 0.5) * scale + (random() - 0.5) * scale * 0.25,
      y: centerY - contentHeight * scale / 2 + (source.y - minimumY + 0.5) * scale + (random() - 0.5) * scale * 0.25,
    }
  })
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
  const bounded = clamp(value, 0, 1)
  return bounded * bounded * (3 - 2 * bounded)
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  return `${Math.ceil(value / 1024 ** 2)} MB`
}

function messageFor(reason: unknown, fallback: string): string {
  if (typeof reason === 'string' && reason.trim()) return reason
  if (reason instanceof Error && reason.message) return reason.message
  return fallback
}
</script>

<template>
  <div class="installer-shell" :class="`phase-${phase}`">
    <header class="titlebar" data-tauri-drag-region>
      <span data-tauri-drag-region>LinAI Setup</span>
      <div class="window-actions">
        <button type="button" aria-label="最小化" @click="minimizeWindow"><Minus :size="16" /></button>
        <button type="button" aria-label="关闭" :disabled="phase === 'installing'" @click="closeWindow"><X :size="16" /></button>
      </div>
    </header>

    <section ref="scene" class="installer-scene">
      <canvas ref="canvas" class="particle-field" aria-hidden="true" />

      <main class="config-panel">
        <span class="kicker">个性化设置</span>
        <h1>确认安装位置与偏好</h1>

        <label class="path-label" for="install-path">安装位置</label>
        <div class="path-control">
          <Folder :size="17" aria-hidden="true" />
          <input id="install-path" v-model="installDir" type="text" spellcheck="false" :disabled="phase !== 'config'" />
          <button type="button" :disabled="phase !== 'config'" @click="browseInstallDirectory">
            <FolderOpen :size="16" aria-hidden="true" />
            浏览
          </button>
        </div>
        <div class="space-copy"><span>需要 {{ requiredLabel }}</span><span>{{ availableLabel }}</span></div>

        <div class="option-list">
          <label class="install-option">
            <span class="option-icon"><MonitorUp :size="17" aria-hidden="true" /></span>
            <span><strong>开机时启动</strong><small>随时查看订阅与用量状态</small></span>
            <input v-model="launchAtStartup" type="checkbox" :disabled="phase !== 'config'" />
          </label>
          <label class="install-option">
            <span class="option-icon"><PanelTop :size="17" aria-hidden="true" /></span>
            <span><strong>显示悬浮状态</strong><small>首次登录后显示用量悬浮窗</small></span>
            <input v-model="floatingStatus" type="checkbox" :disabled="phase !== 'config'" />
          </label>
          <label class="install-option">
            <span class="option-icon"><MousePointer2 :size="17" aria-hidden="true" /></span>
            <span><strong>创建桌面快捷方式</strong><small>从桌面快速打开 LinAI</small></span>
            <input v-model="desktopShortcut" type="checkbox" :disabled="phase !== 'config'" />
          </label>
        </div>

        <p v-if="error" class="install-error" role="alert">{{ error }}</p>
        <div class="config-actions">
          <button type="button" class="secondary-action" :disabled="phase !== 'config'" @click="resetDefaults">使用默认设置</button>
          <button type="button" class="primary-action" :disabled="phase === 'installing' || (phase !== 'complete' && phase !== 'error' && !canInstall)" @click="primaryAction">
            {{ primaryLabel }}
            <ArrowRight v-if="phase !== 'installing'" :size="16" aria-hidden="true" />
          </button>
        </div>
      </main>

      <div class="complete-mark" aria-hidden="true"><Check :size="34" /></div>
    </section>

    <footer class="progress-area">
      <div class="progress-copy"><span>{{ status }}</span><strong>{{ progress }}%</strong></div>
      <div class="progress-track" role="progressbar" aria-label="安装进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progress">
        <span :style="{ width: `${progress}%` }" />
      </div>
      <div class="progress-steps" aria-hidden="true">
        <span v-for="(label, index) in stepLabels" :key="label" :class="{ active: index === activeStep }">{{ label }}</span>
      </div>
    </footer>
  </div>
</template>

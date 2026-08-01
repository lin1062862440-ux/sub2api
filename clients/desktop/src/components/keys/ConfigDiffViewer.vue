<script setup lang="ts">
import { computed } from 'vue'
import { FileCheck2, FileJson2, FileType2 } from '@lucide/vue'

import type { FileDiff } from '@/lib/client-config'
import { buildSideBySideDiff } from '@/lib/line-diff'

const props = defineProps<{ files: FileDiff[] }>()

const renderedFiles = computed(() => props.files.map((file) => ({
  ...file,
  rows: buildSideBySideDiff(file.redactedBefore, file.redactedAfter),
})))

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}
</script>

<template>
  <div class="config-diff" data-testid="config-diff">
    <div class="diff-intro">
      <FileCheck2 :size="17" />
      <span><strong>确认文件变更</strong><small>密钥字段已脱敏，写入前会自动备份</small></span>
    </div>
    <article v-for="file in renderedFiles" :key="file.path" class="diff-file">
      <header>
        <FileJson2 v-if="file.format === 'json'" :size="15" />
        <FileType2 v-else :size="15" />
        <span><strong>{{ fileName(file.path) }}</strong><small :title="file.path">{{ file.path }}</small></span>
        <i :class="{ unchanged: !file.changed }">{{ file.changed ? '将更新' : '无变化' }}</i>
      </header>
      <div v-if="file.changed" class="diff-body" aria-label="逐行配置变更">
        <span class="diff-column-title">当前</span>
        <span class="diff-column-title">写入后</span>
        <template v-for="(row, index) in file.rows" :key="`${file.path}-${index}`">
          <div class="diff-line diff-line--before" :class="`is-${row.kind}`">
            <span class="line-number">{{ row.beforeLine ?? '' }}</span>
            <code>{{ row.before }}</code>
          </div>
          <div class="diff-line diff-line--after" :class="`is-${row.kind}`">
            <span class="line-number">{{ row.afterLine ?? '' }}</span>
            <code>{{ row.after }}</code>
          </div>
        </template>
      </div>
    </article>
  </div>
</template>

<style scoped>
.config-diff { display: grid; gap: 9px; }
.diff-intro { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border: 1px solid #cfe0f8; border-radius: 8px; background: #f4f8ff; color: var(--accent-strong); }
.diff-intro span,.diff-intro strong,.diff-intro small { display: block; }
.diff-intro strong { color: var(--text-primary); font-size: 14px; }
.diff-intro small { margin-top: 2px; color: var(--text-tertiary); font-size: 12px; }
.diff-file { overflow: hidden; border: 1px solid var(--border-subtle); border-radius: 8px; background: #fff; }
.diff-file header { display: grid; min-height: 54px; grid-template-columns: 26px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 0 13px; background: #fafbfd; }
.diff-file header > svg { color: var(--text-tertiary); }
.diff-file header span,.diff-file header strong,.diff-file header small { display: block; min-width: 0; }
.diff-file header strong { color: var(--text-primary); font-size: 13px; }
.diff-file header small { margin-top: 1px; overflow: hidden; color: var(--text-tertiary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.diff-file header i { padding: 3px 7px; border-radius: 5px; background: var(--warning-soft); color: var(--warning); font-size: 12px; font-style: normal; font-weight: 700; }
.diff-file header i.unchanged { background: #edf1f5; color: var(--text-tertiary); }
.diff-body { display: grid; max-height: 280px; grid-template-columns: minmax(0,1fr) minmax(0,1fr); overflow: auto; border-top: 1px solid var(--border-subtle); background: #f8fafc; }
.diff-column-title { position: sticky; z-index: 2; top: 0; display: block; padding: 7px 10px; border-bottom: 1px solid var(--border-subtle); background: rgba(248,250,252,.97); color: var(--text-tertiary); font-size: 12px; font-weight: 700; backdrop-filter: blur(8px); }
.diff-column-title:nth-child(2) { border-left: 1px solid var(--border-subtle); }
.diff-line { display: grid; min-width: 0; min-height: 27px; grid-template-columns: 38px minmax(0,1fr); align-items: stretch; border-bottom: 1px solid rgba(223,229,238,.58); color: #334155; }
.diff-line--after { border-left: 1px solid var(--border-subtle); }
.line-number { display: flex; align-items: flex-start; justify-content: flex-end; padding: 5px 8px 4px 3px; border-right: 1px solid rgba(207,215,227,.72); background: rgba(237,241,246,.75); color: #8995a6; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: 12px; user-select: none; }
.diff-line code { display: block; min-width: 0; padding: 5px 9px 4px; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.diff-line--before.is-changed,.diff-line--before.is-removed { background: #fff0f3; box-shadow: inset 3px 0 0 #d94b68; }
.diff-line--after.is-changed,.diff-line--after.is-added { background: #ecf9f3; box-shadow: inset 3px 0 0 #15936d; }
.diff-line--before.is-changed .line-number,.diff-line--before.is-removed .line-number { background: #fbe1e7; color: #a92e49; }
.diff-line--after.is-changed .line-number,.diff-line--after.is-added .line-number { background: #d9f1e6; color: #087f5b; }
.diff-line--before.is-added,.diff-line--after.is-removed { background: #f2f4f7; }
@media (max-width: 720px) { .diff-body { grid-template-columns: minmax(260px,1fr) minmax(260px,1fr); } }
</style>

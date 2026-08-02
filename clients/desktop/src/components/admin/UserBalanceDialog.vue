<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Coins, LoaderCircle, Save, X } from '@lucide/vue'

import { updateAdminUserBalance } from '@/api/admin/users'
import type { AdminUser } from '@/api/admin/types'
import { formatCost } from '@/lib/format'

const props = defineProps<{ user: AdminUser | null }>()
const emit = defineEmits<{ close: []; updated: [user: AdminUser] }>()

const form = reactive({ operation: 'add' as 'set' | 'add' | 'subtract', amount: 0, notes: '' })
const saving = ref(false)
const error = ref('')

watch(() => props.user?.id, () => {
  form.operation = 'add'
  form.amount = 0
  form.notes = ''
  error.value = ''
})

async function submit() {
  if (!props.user || saving.value) return
  const amount = Number(form.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    error.value = '请输入大于 0 的金额'
    return
  }
  if (form.operation === 'subtract' && amount > props.user.balance) {
    error.value = '扣减金额不能超过当前余额'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const user = await updateAdminUserBalance(props.user.id, {
      balance: amount,
      operation: form.operation,
      notes: form.notes.trim(),
    })
    emit('updated', user)
    emit('close')
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : '余额更新失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Transition name="dialog-fade">
    <div v-if="user" class="dialog-backdrop" @mousedown.self="emit('close')">
      <section class="balance-dialog" role="dialog" aria-modal="true" aria-labelledby="balance-dialog-title">
        <header><span><Coins :size="20" /></span><div><h2 id="balance-dialog-title">调整余额</h2><p>{{ user.email }} · 当前 {{ formatCost(user.balance) }}</p></div><button type="button" aria-label="关闭" @click="emit('close')"><X :size="18" /></button></header>
        <form data-testid="balance-form" @submit.prevent="submit">
          <label><span>操作方式</span><select v-model="form.operation"><option value="add">增加余额</option><option value="subtract">扣减余额</option><option value="set">设为指定金额</option></select></label>
          <label><span>金额</span><input v-model.number="form.amount" data-testid="balance-amount" type="number" min="0.01" step="0.01" autofocus /></label>
          <label><span>操作备注</span><textarea v-model="form.notes" rows="3" placeholder="可选，用于审计记录" /></label>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <footer><button type="button" @click="emit('close')">取消</button><button class="primary" type="submit" :disabled="saving"><LoaderCircle v-if="saving" :size="15" class="spinning" /><Save v-else :size="15" />{{ saving ? '处理中' : '确认调整' }}</button></footer>
        </form>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-backdrop{position:fixed;z-index:120;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.24);backdrop-filter:blur(10px);place-items:center}.balance-dialog{width:min(440px,calc(100vw - 40px));overflow:hidden;background:rgba(252,253,255,.99);border:1px solid rgba(207,217,230,.95);border-radius:8px;box-shadow:0 24px 70px rgba(23,38,59,.23)}header{display:grid;grid-template-columns:42px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:18px;border-bottom:1px solid var(--border-subtle)}header>span{display:grid;width:40px;height:40px;border-radius:8px;background:#e8f4ee;color:#247657;place-items:center}h2{font-size:17px}header p{margin-top:3px;color:var(--text-tertiary);font-size:11px}header button{display:grid;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-tertiary);place-items:center}form{display:grid;gap:13px;padding:18px}label{display:grid;gap:6px}label span{color:var(--text-secondary);font-size:12px;font-weight:650}input,select,textarea{width:100%;min-height:39px;padding:8px 10px;border:1px solid var(--border-strong);border-radius:6px;background:white;color:var(--text-primary);font:inherit;font-size:13px;outline:0}input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}textarea{resize:vertical}.form-error{padding:9px 10px;border:1px solid var(--coral-border);border-radius:6px;background:var(--coral-soft);color:var(--danger);font-size:12px}footer{display:flex;justify-content:flex-end;gap:8px;padding-top:3px}footer button{display:flex;height:36px;align-items:center;gap:6px;padding:0 13px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);font-size:12px;font-weight:650}footer .primary{border-color:var(--accent);background:var(--accent);color:white}.spinning{animation:spin .75s linear infinite}.dialog-fade-enter-active,.dialog-fade-leave-active{transition:opacity 180ms}.dialog-fade-enter-from,.dialog-fade-leave-to{opacity:0}@keyframes spin{to{transform:rotate(360deg)}}
</style>

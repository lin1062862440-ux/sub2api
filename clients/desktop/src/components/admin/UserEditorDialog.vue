<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { LoaderCircle, Save, UserRoundPlus, X } from '@lucide/vue'

import { createAdminUser, updateAdminUser } from '@/api/admin/users'
import type { AdminUser } from '@/api/admin/types'

const props = defineProps<{ modelValue: boolean; user?: AdminUser | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [user: AdminUser] }>()

const form = reactive({ email:'', password:'', username:'', notes:'', role:'user' as 'admin'|'user', concurrency:5, rpmLimit:0 })
const saving = ref(false)
const error = ref('')

function reset(){form.email=props.user?.email??'';form.password='';form.username=props.user?.username??'';form.notes=props.user?.notes??'';form.role=props.user?.role??'user';form.concurrency=props.user?.concurrency??5;form.rpmLimit=props.user?.rpm_limit??0;error.value=''}
watch(()=>[props.modelValue,props.user] as const,([open])=>{if(open)reset()},{immediate:true})
function close(){if(!saving.value)emit('update:modelValue',false)}
async function submit(){error.value='';if(!form.email.trim()){error.value='请输入邮箱';return}if(!props.user&&form.password.length<6){error.value='初始密码至少需要 6 位';return}saving.value=true;try{const common={email:form.email.trim(),username:form.username.trim(),notes:form.notes.trim(),role:form.role,concurrency:Math.max(1,Number(form.concurrency)||1),rpm_limit:Math.max(0,Number(form.rpmLimit)||0)};const saved=props.user?await updateAdminUser(props.user.id,{...common,...(form.password?{password:form.password}:{})}):await createAdminUser({...common,password:form.password});emit('saved',saved);emit('update:modelValue',false)}catch(caught){error.value=caught instanceof Error&&caught.message?caught.message:'用户保存失败'}finally{saving.value=false}}
</script>

<template>
  <Transition name="dialog-fade"><div v-if="modelValue" class="backdrop" @mousedown.self="close"><section class="editor" role="dialog" aria-modal="true"><header><span><UserRoundPlus :size="20" /></span><div><h2>{{ user?'编辑用户':'新增用户' }}</h2><p>仅编辑身份与请求限制</p></div><button type="button" aria-label="关闭" @click="close"><X :size="18" /></button></header><form data-testid="user-editor-submit" @submit.prevent="submit">
    <label><span>邮箱</span><input v-model="form.email" data-testid="user-editor-email" type="email" /></label><label><span>用户名</span><input v-model="form.username" /></label>
    <label><span>{{ user?'新密码（留空不修改）':'初始密码' }}</span><input v-model="form.password" data-testid="user-editor-password" type="password" autocomplete="new-password" /></label><label><span>角色</span><select v-model="form.role"><option value="user">普通用户</option><option value="admin">管理员</option></select></label>
    <label><span>并发上限</span><input v-model.number="form.concurrency" type="number" min="1" /></label><label><span>RPM 上限（0 为不限）</span><input v-model.number="form.rpmLimit" type="number" min="0" /></label>
    <label class="wide"><span>管理员备注</span><textarea v-model="form.notes" rows="3" /></label><p v-if="error" class="error wide">{{ error }}</p><footer class="wide"><button class="secondary" type="button" @click="close">取消</button><button type="submit" :disabled="saving"><LoaderCircle v-if="saving" :size="16" class="spinning" /><Save v-else :size="16" />{{ saving?'保存中':'保存用户' }}</button></footer>
  </form></section></div></Transition>
</template>

<style scoped>
.backdrop{position:fixed;z-index:100;inset:0;display:grid;padding:24px;background:rgba(28,39,56,.22);backdrop-filter:blur(12px);place-items:center}.editor{width:min(680px,100%);max-height:calc(100vh - 48px);overflow:auto;background:rgba(252,253,255,.99);border:1px solid rgba(255,255,255,.9);border-radius:10px;box-shadow:0 28px 72px rgba(27,42,64,.25)}header{display:grid;grid-template-columns:42px 1fr 34px;align-items:center;gap:11px;padding:20px 22px 16px;border-bottom:1px solid var(--border-subtle)}header>span{display:grid;width:40px;height:40px;background:#e9f0ff;border-radius:9px;color:var(--accent);place-items:center}h2{margin:0;font-size:18px}header p{margin:3px 0 0;color:var(--text-tertiary);font-size:12px}header button{display:grid;width:32px;height:32px;padding:0;border:0;background:transparent;color:var(--text-tertiary);cursor:pointer;place-items:center}form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 22px 22px}.wide{grid-column:1/-1}label{display:grid;gap:6px}label span,legend{color:var(--text-secondary);font-size:12px;font-weight:620}input,select,textarea{width:100%;min-height:38px;padding:8px 11px;border:1px solid var(--border-subtle);border-radius:7px;background:white;color:var(--text-primary);font:inherit;font-size:13px;outline:0}input:focus,select:focus,textarea:focus{border-color:rgba(64,111,203,.58);box-shadow:0 0 0 3px rgba(58,105,198,.09)}fieldset{margin:0;padding:0;border:0}fieldset>div{display:flex;flex-wrap:wrap;gap:7px;margin-top:7px}fieldset button{padding:6px 9px;border:1px solid var(--border-subtle);border-radius:6px;background:white;color:var(--text-secondary);cursor:pointer}fieldset button[aria-pressed=true]{background:#eaf1ff;border-color:#bcd0f3;color:#3564ae}fieldset span{color:var(--text-tertiary);font-size:12px}.error{margin:0;color:#b4483a;font-size:12px}footer{display:flex;justify-content:flex-end;gap:9px}footer button{display:flex;height:38px;align-items:center;gap:7px;padding:0 15px;border:0;border-radius:7px;background:var(--accent);color:white;cursor:pointer;font-weight:630}footer .secondary{background:var(--bg-base);border:1px solid var(--border-subtle);color:var(--text-secondary)}.spinning{animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.dialog-fade-enter-active,.dialog-fade-leave-active{transition:opacity 180ms}.dialog-fade-enter-from,.dialog-fade-leave-to{opacity:0}@media(max-width:700px){form{grid-template-columns:1fr}form>*{grid-column:1}}
</style>

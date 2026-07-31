import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { bootstrap } from '@/stores/session'
import './style.css'

// Restore the persisted backend URL and session before the first navigation, so
// the router guard sees final state instead of redirecting to /login and back.
bootstrap().finally(() => {
  createApp(App).use(router).mount('#app')
})

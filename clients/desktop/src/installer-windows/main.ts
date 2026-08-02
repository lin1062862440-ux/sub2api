import { createApp } from 'vue'

import InstallerApp from './InstallerApp.vue'
import { disableWebviewContextMenu } from '@/lib/context-menu'
import './style.css'

disableWebviewContextMenu()
createApp(InstallerApp).mount('#installer-app')

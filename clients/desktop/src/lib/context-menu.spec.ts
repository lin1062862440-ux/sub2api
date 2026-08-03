import { describe, expect, it } from 'vitest'

import { disableWebviewContextMenu } from './context-menu'

describe('disableWebviewContextMenu', () => {
  it('prevents the WebView context menu until disposed', () => {
    const target = new EventTarget() as Window
    const dispose = disableWebviewContextMenu(target)
    const blocked = new Event('contextmenu', { cancelable: true })

    target.dispatchEvent(blocked)
    expect(blocked.defaultPrevented).toBe(true)

    dispose()
    const restored = new Event('contextmenu', { cancelable: true })
    target.dispatchEvent(restored)
    expect(restored.defaultPrevented).toBe(false)
  })
})

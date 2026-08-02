import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const lib = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8')

describe('Android Rust host boundary', () => {
  it('compiles desktop-only modules and plugins behind desktop cfg', () => {
    const [desktopSource, mobileSource = ''] = lib.split('#[cfg(mobile)]')

    expect(lib).toContain('#[cfg(desktop)]\npub mod local_config;')
    expect(lib).toContain('#[cfg(desktop)]\nmod usage_display;')
    expect(lib).toContain('#[cfg(desktop)]\nmod text_export;')
    expect(desktopSource).toContain('#[cfg(desktop)]\npub fn run()')
    expect(desktopSource).toContain('tauri_plugin_single_instance::init')
    expect(mobileSource).toContain('#[tauri::mobile_entry_point]\npub fn run()')
    expect(mobileSource).not.toContain('tauri_plugin_single_instance::init')
    expect(mobileSource).not.toContain('local_config::')
    expect(mobileSource).not.toContain('usage_display::')
    expect(mobileSource).not.toContain('text_export::')
  })
})

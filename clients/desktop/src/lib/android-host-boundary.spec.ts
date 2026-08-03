import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const lib = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8').replace(/\r\n/g, '\n')
const cargo = readFileSync(resolve(process.cwd(), 'src-tauri/Cargo.toml'), 'utf8').replace(/\r\n/g, '\n')

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

  it('registers the native updater only for Android mobile builds', () => {
    expect(lib).toContain('#[cfg(target_os = "android")]\nmod android_plugin;')
    expect(lib).toContain('#[cfg(target_os = "android")]\n    let builder = builder.plugin(android_plugin::init());')
  })

  it('keeps macOS-only Tauri features out of the mobile dependency graph', () => {
    expect(cargo).toContain('tauri = { version = "2.11.3", features = [] }')
    expect(cargo).toContain('[target.\'cfg(target_os = "macos")\'.dependencies]\ntauri = { version = "2.11.3", features = ["macos-private-api", "tray-icon"] }')
  })
})

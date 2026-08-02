import { invoke } from '@tauri-apps/api/core'

export function saveTextExport(content: string, suggestedName: string): Promise<string> {
  return invoke<string>('save_text_export', { content, suggestedName })
}

let enabled = true

export async function getLaunchAtStartup() {
  return enabled
}

export async function setLaunchAtStartup(value: boolean) {
  enabled = value
  return enabled
}

export function startupSettingsErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

const preventContextMenu = (event: Event) => event.preventDefault()

export function disableWebviewContextMenu(target: Window = window): () => void {
  target.addEventListener('contextmenu', preventContextMenu, { capture: true })
  return () => target.removeEventListener('contextmenu', preventContextMenu, { capture: true })
}

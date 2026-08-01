export type DiffRowKind = 'same' | 'changed' | 'removed' | 'added'

export interface SideBySideDiffRow {
  before: string
  after: string
  beforeLine: number | null
  afterLine: number | null
  kind: DiffRowKind
}

type DiffOperation = { kind: 'same' | 'removed' | 'added'; value: string }

function linesOf(content: string) {
  if (!content) return ['']
  const lines = content.split('\n')
  if (lines.length > 1 && lines.at(-1) === '') lines.pop()
  return lines
}

function operations(before: string[], after: string[]): DiffOperation[] {
  const lengths = Array.from(
    { length: before.length + 1 },
    () => new Uint32Array(after.length + 1),
  )

  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      lengths[left]![right] = before[left] === after[right]
        ? lengths[left + 1]![right + 1]! + 1
        : Math.max(lengths[left + 1]![right]!, lengths[left]![right + 1]!)
    }
  }

  const result: DiffOperation[] = []
  let left = 0
  let right = 0
  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) {
      result.push({ kind: 'same', value: before[left]! })
      left += 1
      right += 1
    } else if (lengths[left + 1]![right]! >= lengths[left]![right + 1]!) {
      result.push({ kind: 'removed', value: before[left]! })
      left += 1
    } else {
      result.push({ kind: 'added', value: after[right]! })
      right += 1
    }
  }
  while (left < before.length) result.push({ kind: 'removed', value: before[left++]! })
  while (right < after.length) result.push({ kind: 'added', value: after[right++]! })
  return result
}

export function buildSideBySideDiff(beforeContent: string, afterContent: string) {
  const result: SideBySideDiffRow[] = []
  const diff = operations(linesOf(beforeContent), linesOf(afterContent))
  let beforeLine = 1
  let afterLine = 1
  let index = 0

  while (index < diff.length) {
    const operation = diff[index]!
    if (operation.kind === 'same') {
      result.push({
        before: operation.value,
        after: operation.value,
        beforeLine,
        afterLine,
        kind: 'same',
      })
      beforeLine += 1
      afterLine += 1
      index += 1
      continue
    }

    const removed: string[] = []
    const added: string[] = []
    while (index < diff.length && diff[index]!.kind !== 'same') {
      const changed = diff[index]!
      if (changed.kind === 'removed') removed.push(changed.value)
      else added.push(changed.value)
      index += 1
    }

    const rowCount = Math.max(removed.length, added.length)
    for (let row = 0; row < rowCount; row += 1) {
      const oldValue = removed[row]
      const newValue = added[row]
      const hasOld = oldValue !== undefined
      const hasNew = newValue !== undefined
      result.push({
        before: oldValue || '',
        after: newValue || '',
        beforeLine: hasOld ? beforeLine++ : null,
        afterLine: hasNew ? afterLine++ : null,
        kind: hasOld && hasNew ? 'changed' : hasOld ? 'removed' : 'added',
      })
    }
  }

  return result
}

import { describe, expect, it } from 'vitest'

import { buildSideBySideDiff } from './line-diff'

describe('buildSideBySideDiff', () => {
  it('aligns unchanged, replaced, removed, and added lines', () => {
    const rows = buildSideBySideDiff(
      'same\nold value\nremove only\ntail',
      'same\nnew value\ntail\nadd only',
    )

    expect(rows).toEqual([
      { before: 'same', after: 'same', beforeLine: 1, afterLine: 1, kind: 'same' },
      { before: 'old value', after: 'new value', beforeLine: 2, afterLine: 2, kind: 'changed' },
      { before: 'remove only', after: '', beforeLine: 3, afterLine: null, kind: 'removed' },
      { before: 'tail', after: 'tail', beforeLine: 4, afterLine: 3, kind: 'same' },
      { before: '', after: 'add only', beforeLine: null, afterLine: 4, kind: 'added' },
    ])
  })

  it('returns an empty aligned row for two empty files', () => {
    expect(buildSideBySideDiff('', '')).toEqual([
      { before: '', after: '', beforeLine: 1, afterLine: 1, kind: 'same' },
    ])
  })
})

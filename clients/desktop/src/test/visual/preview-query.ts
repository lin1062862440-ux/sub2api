const booleanTrueValues = new Set(['', '1', 'true'])

function entries(query: URLSearchParams, name: string) {
  return query.getAll(name).flatMap((value) => value.split(',')).map((value) => value.trim())
}

export function previewBoolean(query: URLSearchParams, name: string) {
  return entries(query, name).some((value) => booleanTrueValues.has(value))
}

export function previewRouteFlag(query: URLSearchParams, name: string, route: string) {
  return entries(query, name).some((value) =>
    booleanTrueValues.has(value) || value === 'all' || value === route,
  )
}

export function previewInteger(
  query: URLSearchParams,
  name: string,
  maximum: number,
) {
  const value = query.get(name)?.trim() ?? ''
  if (!/^\d+$/.test(value)) return 0
  return Math.min(maximum, Number(value))
}

export function previewIntegerSet(query: URLSearchParams, name: string) {
  return new Set(entries(query, name).flatMap((value) => {
    if (!/^\d+$/.test(value)) return []
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? [parsed] : []
  }))
}

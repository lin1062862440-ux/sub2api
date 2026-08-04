export function areaGradient(color: string, topOpacity = '70', bottomOpacity = '08') {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: `${color}${topOpacity}` },
      { offset: 1, color: `${color}${bottomOpacity}` }
    ]
  }
}

export function gradientAreaSeries(
  name: string,
  data: number[],
  color: string,
  options: Record<string, unknown> = {}
) {
  return {
    name,
    type: 'line' as const,
    data,
    smooth: 0.35,
    showSymbol: false,
    symbol: 'circle',
    symbolSize: 7,
    lineStyle: { color, width: 2 },
    itemStyle: { color },
    areaStyle: { color: areaGradient(color) },
    emphasis: { focus: 'series' as const },
    ...options
  }
}

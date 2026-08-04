import { afterEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChart',
    props: ['option'],
    setup(props) {
      return () => h('div', { 'data-testid': 'echarts-test-stub' }, JSON.stringify(props.option))
    },
  }),
}))

enableAutoUnmount(afterEach)

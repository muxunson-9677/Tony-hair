import { fireEvent, render, screen } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { describe, expect, test, vi } from 'vitest'

import PrivacyMaskView from './PrivacyMaskView.vue'

describe('privacy mask page shell', () => {
  test('requires the adult ownership or authorization confirmation before file selection', async () => {
    render(PrivacyMaskView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })

    expect(screen.getByRole('heading', { level: 1, name: '隐私遮罩' })).toBeTruthy()
    expect(screen.getByText(/不承诺匿名/)).toBeTruthy()
    expect(screen.getByText(/熟人仍可能识别/)).toBeTruthy()
    expect(screen.queryByLabelText('选择本人或已授权照片')).toBeNull()

    await fireEvent.click(screen.getByRole('checkbox', { name: /已满 18 岁/ }))

    expect(screen.getByLabelText('选择本人或已授权照片')).toBeTruthy()
  })

  test('attaches the local download and retains a retry URL until leaving the page', async () => {
    const result = {
      blob: new Blob(['flat'], { type: 'image/webp' }),
      mimeType: 'image/webp' as const,
      width: 800,
      height: 1000,
      bytes: 4,
      processedAt: '2026-08-10T00:00:00.000Z',
    }
    const EditorStub = defineComponent({
      emits: ['exported'],
      setup(_, { emit }) {
        return () => h('button', { onClick: () => emit('exported', result) }, '生成测试图')
      },
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const remove = vi.spyOn(HTMLAnchorElement.prototype, 'remove')
    const append = vi.spyOn(document.body, 'append')
    const { unmount } = render(PrivacyMaskView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          MaskEditor: EditorStub,
        },
      },
    })
    await fireEvent.click(screen.getByRole('checkbox', { name: /已满 18 岁/ }))
    await fireEvent.click(screen.getByRole('button', { name: '生成测试图' }))

    expect(append).toHaveBeenCalledWith(expect.any(HTMLAnchorElement))
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    const retry = screen.getByRole('link', { name: '未自动保存？再次下载单层图' })
    expect(retry.getAttribute('href')).toBe(vi.mocked(URL.createObjectURL).mock.results[0]?.value)

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      vi.mocked(URL.createObjectURL).mock.results[0]?.value,
    )
  })
})

import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, test } from 'vitest'

import type { HairProfile } from '../../archive/types'
import GuidedDirectionPicker from './GuidedDirectionPicker.vue'

const profile: HairProfile = {
  id: 'guided-picker-profile',
  name: '小林',
  genderIdentity: 'unspecified',
  presentationPreference: 'androgynous',
  hairTexture: 'wavy',
  strandThickness: 'medium',
  density: 'medium',
  stylingMinutes: 5,
  washFrequency: 'every_other_day',
  preferenceNotes: '',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
}

describe('GuidedDirectionPicker', () => {
  test('asks one plain-language question at a time and returns three explained directions', async () => {
    const result = render(GuidedDirectionPicker, { props: { profile } })

    const goal = screen.getByRole('group', { name: '这次最想解决什么？' })
    expect(within(goal).getByRole('button', { name: '每天少打理' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: '每天最多愿意打理多久？' })).toBeNull()

    await fireEvent.click(within(goal).getByRole('button', { name: '每天少打理' }))
    const budget = screen.getByRole('group', { name: '每天最多愿意打理多久？' })
    expect(within(budget).getByRole('button', { name: '5 分钟以内' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: '这次想变化多大？' })).toBeNull()

    await fireEvent.click(within(budget).getByRole('button', { name: '5 分钟以内' }))
    const change = screen.getByRole('group', { name: '这次想变化多大？' })
    await fireEvent.click(within(change).getByRole('button', { name: '有变化，但别太冒险' }))

    expect(screen.getByRole('heading', { name: '先比较这三个方向' })).toBeTruthy()
    expect(screen.getByText('3 个方向 · 按你的需求筛选')).toBeTruthy()
    expect(screen.queryByText('3 DIRECTIONS · LOCAL RULES')).toBeNull()
    expect(screen.getByText('最稳妥')).toBeTruthy()
    expect(screen.getByText('最符合目标')).toBeTruthy()
    expect(screen.getByText('最值得尝试')).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(document.body.textContent).not.toMatch(/AI 推荐|匹配度|\d+%/u)

    await fireEvent.click(screen.getByRole('button', { name: '一起比较这 3 个方向' }))
    const adopted = result.emitted('adopt')
    expect(adopted).toHaveLength(1)
    const payload = adopted?.[0] as [unknown[]] | undefined
    expect(payload?.[0]).toHaveLength(3)
  })

  test('lets the user go back and changes the result after an answer changes', async () => {
    render(GuidedDirectionPicker, { props: { profile } })
    await fireEvent.click(screen.getByRole('button', { name: '两侧别太短' }))
    await fireEvent.click(screen.getByRole('button', { name: '8 分钟以内' }))
    await fireEvent.click(screen.getByRole('button', { name: '尽量稳妥' }))
    const firstNames = screen.getAllByRole('heading', { level: 3 }).map(({ textContent }) => textContent)

    await fireEvent.click(screen.getByRole('button', { name: '修改答案' }))
    expect(screen.getByRole('group', { name: '这次想变化多大？' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '可以明显变一个人' }))
    const secondNames = screen.getAllByRole('heading', { level: 3 }).map(({ textContent }) => textContent)

    expect(secondNames).not.toEqual(firstNames)
  })
})

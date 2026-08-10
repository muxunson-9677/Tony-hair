import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, expectTypeOf, test } from 'vitest'

import { archiveDemoCandidates } from '../archive/demoCandidates'
import { DemoProvider } from '../try-on/DemoProvider'
import {
  STYLE_GOALS,
  STYLE_GOAL_LABELS,
  curatedHairstyles,
  filterCuratedHairstyles,
} from './curatedCatalog'
import type { StyleGoal } from './types'

const expectedCatalogIds = [
  'lin-bob',
  'lin-pixie',
  'qiao-ivy',
  'qiao-taper',
  'ran-crop',
  'ran-sidepart',
] as const

const normalize = (value: string) => (
  value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
)

describe('curated hairstyle catalog', () => {
  test('publishes exactly six active styles with stable unique local identities', () => {
    expect(curatedHairstyles.map(({ id }) => id)).toEqual(expectedCatalogIds)
    expect(curatedHairstyles.every(({ status }) => status === 'active')).toBe(true)
    expect(new Set(curatedHairstyles.map(({ id }) => id)).size).toBe(6)
    expect(new Set(curatedHairstyles.map(({ name }) => normalize(name))).size).toBe(6)
    expect(new Set(curatedHairstyles.map(({ coverImage }) => coverImage)).size).toBe(6)

    const aliases = curatedHairstyles.flatMap(({ aliases }) => aliases.map(normalize))
    expect(aliases.every(Boolean)).toBe(true)
    expect(new Set(aliases).size).toBe(aliases.length)

    for (const style of curatedHairstyles) {
      expect(style.coverImage).toMatch(/^\/demo\/[^/]+\.webp$/)
      expect(style.coverImage).not.toContain('-base.')
      expect(style.coverImage).not.toMatch(/^https?:/)
      expect(existsSync('public' + style.coverImage)).toBe(true)
      expect(style.assetSource).toBe('project_generated_ai')
      expect(style.imageAlt).toContain(style.name)
    }
  })

  test('discloses the synthetic adult front-view limitation and supplies practical detail', () => {
    for (const style of curatedHairstyles) {
      expect(style.disclosure).toContain('AI')
      expect(style.disclosure).toContain('成年')
      expect(style.disclosure).toContain('正面')
      expect(style.disclosure).toContain('侧面')
      expect(style.disclosure).toContain('后脑')
      expect(style.disclosure).toContain('理发师')
      expect(style.reason.trim()).not.toHaveLength(0)
      expect(style.feasibility.trim()).not.toHaveLength(0)
      expect(style.maintenanceSummary.trim()).not.toHaveLength(0)
      expect(style.stylingMinutes).toBeGreaterThanOrEqual(0)
      expect(style.trimIntervalWeeks[0]).toBeGreaterThan(0)
      expect(style.trimIntervalWeeks[1]).toBeGreaterThanOrEqual(style.trimIntervalWeeks[0])
      expect(style.tradeoffs.length).toBeGreaterThanOrEqual(2)
      expect(style.tradeoffs.every((tradeoff) => tradeoff.trim().length > 0)).toBe(true)

      const guide = style.barberGuide
      expect(guide.overall.trim()).not.toHaveLength(0)
      expect(guide.top.trim()).not.toHaveLength(0)
      expect(guide.fringe.trim()).not.toHaveLength(0)
      expect(guide.sides.trim()).not.toHaveLength(0)
      expect(guide.sideburns.trim()).not.toHaveLength(0)
      expect(guide.back.trim()).not.toHaveLength(0)
      expect(guide.topPriorities).toHaveLength(3)
      expect(guide.absoluteAvoids).toHaveLength(3)
      expect(guide.topPriorities.every((item) => item.trim().length > 0)).toBe(true)
      expect(guide.absoluteAvoids.every((item) => item.trim().length > 0)).toBe(true)
    }
  })

  test('keeps StyleGoal closed to the seven approved user goals', () => {
    expect(STYLE_GOALS).toEqual([
      'low_maintenance',
      'no_perm_or_dye',
      'soften_hairline',
      'keep_sides_longer',
      'glasses_friendly',
      'commute_ready',
      'grow_out_gracefully',
    ])
    expect(Object.keys(STYLE_GOAL_LABELS)).toEqual(STYLE_GOALS)
    expectTypeOf<StyleGoal>().toEqualTypeOf<
      | 'low_maintenance'
      | 'no_perm_or_dye'
      | 'soften_hairline'
      | 'keep_sides_longer'
      | 'glasses_friendly'
      | 'commute_ready'
      | 'grow_out_gracefully'
    >()

    const approvedGoals = new Set<StyleGoal>(STYLE_GOALS)
    expect(curatedHairstyles.every(({ goals }) => (
      goals.length > 0 && goals.every((goal) => approvedGoals.has(goal))
    ))).toBe(true)
  })

  test('searches names, aliases, goals and maintenance language', () => {
    expect(filterCuratedHairstyles({ query: '鲍伯' }).map(({ id }) => id)).toEqual(['lin-bob'])
    expect(filterCuratedHairstyles({ query: '低渐变' }).map(({ id }) => id)).toEqual(['qiao-taper'])
    expect(filterCuratedHairstyles({ query: '纹理短⼨' }).map(({ id }) => id)).toEqual(['ran-crop'])
    expect(filterCuratedHairstyles({ query: '戴眼镜' }).map(({ id }) => id)).toContain('qiao-ivy')
    expect(filterCuratedHairstyles({ query: '低维护' }).map(({ id }) => id))
      .toEqual(['qiao-taper', 'ran-crop'])
  })

  test('combines goal, maintenance and hair-texture filters without mutating catalog order', () => {
    const originalIds = curatedHairstyles.map(({ id }) => id)
    const results = filterCuratedHairstyles({
      goals: ['commute_ready', 'glasses_friendly'],
      maintenanceLevels: ['medium'],
      hairTextures: ['straight'],
    })

    expect(results.map(({ id }) => id)).toEqual(['qiao-ivy'])
    expect(curatedHairstyles.map(({ id }) => id)).toEqual(originalIds)
    expect(filterCuratedHairstyles({ query: '不存在的发型' })).toEqual([])
  })

  test('projects the same catalog metadata into demo personas and archive candidates', () => {
    const personas = new DemoProvider().getPersonas()
    expect(personas).toHaveLength(3)
    expect(personas.every(({ options }) => options.length === 2)).toBe(true)

    const demoOptions = personas.flatMap(({ id: personaId, options }) => (
      options.map((option) => ({ personaId, option }))
    ))
    expect(demoOptions).toHaveLength(6)
    expect(archiveDemoCandidates).toHaveLength(6)

    for (const style of curatedHairstyles) {
      const demo = demoOptions.find(({ personaId, option }) => (
        personaId === style.demoPersonaId && option.id === style.demoOptionId
      ))?.option
      const archive = archiveDemoCandidates.find(({ catalogId }) => catalogId === style.id)

      expect(demo).toMatchObject({
        catalogId: style.id,
        name: style.name,
        image: style.coverImage,
        imageAlt: style.imageAlt,
        reason: style.reason,
        feasibility: style.feasibility,
        maintenance: style.maintenanceSummary,
        source: 'demo_ai',
      })
      expect(archive).toMatchObject({
        catalogId: style.id,
        key: `${style.demoPersonaId}:${style.demoOptionId}`,
        name: style.name,
        image: style.coverImage,
        imageAlt: style.imageAlt,
        notes: `${style.reason} ${style.feasibility}`,
      })
    }
  })

  test('documents provenance and forbids inventing side or back coverage', () => {
    const documentation = readFileSync('docs/design/curated-catalog.md', 'utf8')

    expect(documentation).toContain('项目内 AI 合成成年人物')
    expect(documentation).toContain('4:5')
    expect(documentation).toContain('仅有正面视角')
    expect(documentation).toContain('不得声称提供侧面或后脑图片')
  })
})

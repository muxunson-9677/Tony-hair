import { describe, expect, test } from 'vitest'

import { DemoProvider } from './DemoProvider'
import type { ImageProvider } from './types'

describe('DemoProvider', () => {
  test('returns three distinct fictional adults with different presentation and hair texture', () => {
    const provider: ImageProvider = new DemoProvider()
    const personas = provider.getPersonas()

    expect(personas).toHaveLength(3)
    expect(new Set(personas.map((persona) => persona.id)).size).toBe(3)
    expect(new Set(personas.map((persona) => persona.genderPresentation)).size).toBe(3)
    expect(new Set(personas.map((persona) => persona.hairTexture)).size).toBe(3)

    for (const persona of personas) {
      expect(persona.isAdult).toBe(true)
      expect(persona.isFictional).toBe(true)
      expect(persona.ethnicity).toBe('east_asian')
      expect(persona.age).toBeGreaterThanOrEqual(18)
      expect(persona.baseImage).toMatch(/^\/demo\/[^/]+\.webp$/)
      expect(persona.baseAlt).toContain('AI 生成的虚构成年人物')
    }
  })

  test('returns exactly two practical demo-ai short-hair options for each adult', () => {
    const personas = new DemoProvider().getPersonas()

    for (const persona of personas) {
      expect(persona.options).toHaveLength(2)

      for (const option of persona.options) {
        expect(option.source).toBe('demo_ai')
        expect(option.length).toBe('short')
        expect(option.image).toMatch(/^\/demo\/[^/]+\.webp$/)
        expect(option.imageAlt).toContain(persona.name)
        expect(option.reason).not.toHaveLength(0)
        expect(option.feasibility).not.toHaveLength(0)
        expect(option.maintenance).not.toHaveLength(0)
        expect(option.barberConfirmation).toBe('需理发师现场确认')
      }
    }
  })

  test('maps the three base portraits and six hairstyle options to nine WebP assets', () => {
    const personas = new DemoProvider().getPersonas()
    const images = personas.flatMap((persona) => [
      persona.baseImage,
      ...persona.options.map((option) => option.image),
    ])

    expect(images).toHaveLength(9)
    expect(new Set(images).size).toBe(9)
    expect(images.every((image) => image.endsWith('.webp'))).toBe(true)
  })
})

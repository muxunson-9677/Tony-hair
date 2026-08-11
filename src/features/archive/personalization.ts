import type { CuratedHairstyle } from '../hairstyle-library/types'
import type { HairProfile } from './types'

const textureLabels = {
  straight: '直发',
  wavy: '微卷',
  curly: '卷发',
  coily: '强卷',
  unsure: '尚未确认的发质',
} as const

const presentationLabels = {
  feminine: '偏柔和',
  masculine: '偏利落',
  androgynous: '中性',
  unspecified: '',
} as const

const scoreStyle = (style: CuratedHairstyle, profile: HairProfile) => {
  let score = 0
  if (style.hairTextures.includes(profile.hairTexture)) score += 4
  if (style.strandThicknesses.includes(profile.strandThickness)) score += 3
  if (style.densities.includes(profile.density)) score += 2
  if (
    profile.presentationPreference
    && profile.presentationPreference !== 'unspecified'
    && style.genderPresentation === profile.presentationPreference
  ) score += 5
  if (profile.stylingMinutes !== null && style.stylingMinutes <= profile.stylingMinutes) score += 3
  return score
}

export const personalizedStyleReason = (style: CuratedHairstyle, profile: HairProfile) => {
  const facts: string[] = []
  if (style.hairTextures.includes(profile.hairTexture)) {
    facts.push(`适合你的${textureLabels[profile.hairTexture]}`)
  }
  const preference = profile.presentationPreference ?? 'unspecified'
  if (preference !== 'unspecified' && style.genderPresentation === preference) {
    facts.push(`符合你想要的${presentationLabels[preference]}感觉`)
  }
  if (profile.stylingMinutes !== null && style.stylingMinutes <= profile.stylingMinutes) {
    facts.push(`约 ${style.stylingMinutes} 分钟可完成，没超过你的 ${profile.stylingMinutes} 分钟预算`)
  }
  return facts.length ? facts.join('；') : '先作为方向参考，实际效果需要理发师结合你的头型确认'
}

export const rankStylesForProfile = (
  styles: readonly CuratedHairstyle[],
  profile: HairProfile | null,
) => styles
  .map((style, index) => ({
    style,
    score: profile ? scoreStyle(style, profile) : 0,
    reason: profile ? personalizedStyleReason(style, profile) : '',
    index,
  }))
  .sort((left, right) => right.score - left.score || left.index - right.index)

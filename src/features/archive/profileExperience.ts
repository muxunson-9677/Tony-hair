import type { HairProfile, HairProfilePhoto } from './types'

const angleLabels: Record<HairProfilePhoto['angle'], string> = {
  front: '正面',
  side: '侧面',
  back: '后脑',
}

const textureLabels: Record<Exclude<HairProfile['hairTexture'], 'unsure'>, string> = {
  straight: '直发',
  wavy: '有点弯',
  curly: '卷发',
  coily: '小卷很密',
}

const thicknessLabels: Record<Exclude<HairProfile['strandThickness'], 'unsure'>, string> = {
  fine: '发丝细',
  medium: '发丝不粗不细',
  coarse: '发丝粗',
}

const densityLabels: Record<Exclude<HairProfile['density'], 'unsure'>, string> = {
  low: '发量偏少',
  medium: '发量正常',
  high: '发量很多',
}

const presentationLabels: Record<NonNullable<HairProfile['presentationPreference']>, string> = {
  feminine: '想要柔和一点',
  masculine: '想要利落一点',
  androgynous: '中性都行',
  unspecified: '柔和利落都可以',
}

const genderLabels: Record<Exclude<NonNullable<HairProfile['genderIdentity']>, 'unspecified'>, string> = {
  woman: '女',
  man: '男',
  nonbinary: '其他',
}

export const genderIdentityLabel = (profile: HairProfile) => (
  profile.genderIdentity && profile.genderIdentity !== 'unspecified'
    ? genderLabels[profile.genderIdentity]
    : null
)

export const presentationPreferenceLabel = (profile: HairProfile) => (
  presentationLabels[profile.presentationPreference ?? 'unspecified']
)

export const buildKnownProfileTraits = (profile: HairProfile) => [
  profile.hairTexture === 'unsure' ? null : textureLabels[profile.hairTexture],
  profile.strandThickness === 'unsure' ? null : thicknessLabels[profile.strandThickness],
  profile.density === 'unsure' ? null : densityLabels[profile.density],
].filter((label): label is string => Boolean(label))

export const describeProfilePhotoCoverage = (
  photos: readonly HairProfilePhoto[],
) => {
  const present = new Set(photos.map(({ angle }) => angle))
  const missingAngles = (Object.keys(angleLabels) as HairProfilePhoto['angle'][])
    .filter((angle) => !present.has(angle))
    .map((angle) => angleLabels[angle])
  const savedAngles = (Object.keys(angleLabels) as HairProfilePhoto['angle'][])
    .filter((angle) => present.has(angle))
    .map((angle) => angleLabels[angle])

  let message = '先补一张正面照，让档案一眼就是你的。'
  if (savedAngles.length === 3) {
    message = '正面、侧面和后脑都已保存。'
  } else if (savedAngles.length > 0) {
    message = `已保存${savedAngles.join('、')}照；以后可以再补${missingAngles.join('、')}。`
  }

  return { count: savedAngles.length, missingAngles, message }
}

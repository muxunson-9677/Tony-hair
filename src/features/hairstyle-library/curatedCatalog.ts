import type {
  CuratedCatalogFilters,
  CuratedHairstyle,
  MaintenanceLevel,
  StyleGoal,
} from './types'

export const STYLE_GOALS = [
  'low_maintenance',
  'no_perm_or_dye',
  'soften_hairline',
  'keep_sides_longer',
  'glasses_friendly',
  'commute_ready',
  'grow_out_gracefully',
] as const satisfies readonly StyleGoal[]

export const STYLE_GOAL_LABELS: Readonly<Record<StyleGoal, string>> = {
  low_maintenance: '少打理',
  no_perm_or_dye: '不烫不染',
  soften_hairline: '柔化发际线',
  keep_sides_longer: '两侧不要太短',
  glasses_friendly: '戴眼镜',
  commute_ready: '通勤',
  grow_out_gracefully: '留长过渡',
}

export const MAINTENANCE_LEVEL_LABELS: Readonly<Record<MaintenanceLevel, string>> = {
  low: '低维护',
  medium: '中维护',
  high: '高维护',
}

const disclosure = '项目内 AI 合成成年人物正面示例，仅用于发型方向参考；侧面和后脑细节需理发师现场确认。'

export const curatedHairstyles: readonly CuratedHairstyle[] = [
  {
    id: 'lin-bob',
    status: 'active',
    demoPersonaId: 'lin',
    demoOptionId: 'bob',
    name: '齐颌短鲍伯',
    aliases: ['齐下巴波波头', '短鲍伯'],
    coverImage: '/demo/persona-lin-bob.webp',
    imageAlt: '林澄的齐颌短鲍伯示例，预先制作的合成人物素材',
    assetSource: 'project_generated_ai',
    disclosure,
    genderPresentation: 'feminine',
    length: 'jaw_length',
    hairTextures: ['straight', 'wavy'],
    strandThicknesses: ['fine', 'medium'],
    densities: ['low', 'medium', 'high'],
    goals: ['no_perm_or_dye', 'keep_sides_longer', 'commute_ready', 'grow_out_gracefully'],
    maintenanceLevel: 'medium',
    maintenanceSummary: '中：吹干时顺着发流压住毛躁，约 6—8 周修剪轮廓。',
    stylingMinutes: 8,
    trimIntervalWeeks: [6, 8],
    requiresPerm: false,
    reason: '细软直发容易贴顺，齐颌轮廓能保留发量感，也让脸侧线条更干净。',
    feasibility: '可剪参考：保留耳前重量，后区只做轻层次，避免过度打薄。',
    tradeoffs: [
      '齐颌轮廓长出后会较快失去整齐线条，需要按周期修边。',
      '细软发若打薄过多会显得更贴，吹干时仍需整理发根和发尾方向。',
    ],
    barberGuide: {
      overall: '齐颌附近的完整短鲍伯轮廓，保留耳前重量，先按自然落点确认最终长度。',
      top: '顶部只做轻层次维持饱满，不要从发根大量削薄。',
      fringe: '刘海与前侧自然衔接，保留可分缝和别到耳后的长度。',
      sides: '两侧不要推短，耳前轮廓保留完整厚度并与下巴线相接。',
      sideburns: '鬓角融入耳前长发，不单独剪成尖细或贴头皮的短鬓角。',
      back: '后区现场确认头型后做轻微内收，后颈不堆积也不抬高发际线。',
      topPriorities: ['保留耳前重量', '齐颌轮廓完整', '顶部仅做轻层次'],
      absoluteAvoids: ['不要过度打薄', '不要把两侧推短', '不要剪成后高前低的夸张角度'],
    },
  },
  {
    id: 'lin-pixie',
    status: 'active',
    demoPersonaId: 'lin',
    demoOptionId: 'pixie',
    name: '轻层次精灵短发',
    aliases: ['精灵头', '短层次精灵发'],
    coverImage: '/demo/persona-lin-pixie.webp',
    imageAlt: '林澄的轻层次精灵短发示例，预先制作的合成人物素材',
    assetSource: 'project_generated_ai',
    disclosure,
    genderPresentation: 'feminine',
    length: 'very_short',
    hairTextures: ['straight', 'wavy'],
    strandThicknesses: ['fine', 'medium'],
    densities: ['medium', 'high'],
    goals: ['no_perm_or_dye', 'soften_hairline', 'glasses_friendly'],
    maintenanceLevel: 'high',
    maintenanceSummary: '中高：早晨需轻吹发根并整理束感，约 4—6 周修剪。',
    stylingMinutes: 10,
    trimIntervalWeeks: [4, 6],
    requiresPerm: false,
    reason: '较短的顶部层次能给细软发增加空气感，碎刘海让轮廓更轻。',
    feasibility: '可剪参考：顶部保留可活动长度，鬓角和后颈不要一次推得过短。',
    tradeoffs: [
      '短轮廓长出后形状变化明显，需要更频繁修剪。',
      '发根容易贴的人早晨需要吹出蓬松度，不能完全依赖自然晾干。',
    ],
    barberGuide: {
      overall: '轻盈但不过度贴头皮的精灵短发，顶部有活动长度，边缘保持柔和。',
      top: '顶部保留可抓出方向的长度，用轻层次增加空气感，不剪成均匀短寸。',
      fringe: '前额留碎刘海柔化发际线，长度允许向侧边整理。',
      sides: '耳上收短但不推青，保留与顶部自然衔接的柔软层次。',
      sideburns: '鬓角保留短而柔和的尖度，现场结合眼镜腿位置确认。',
      back: '后脑保留圆润支撑，后颈轻收；具体高度需根据头型现场确认。',
      topPriorities: ['顶部保留活动长度', '碎刘海柔化发际线', '边缘柔和不推青'],
      absoluteAvoids: ['不要剪成整齐锅盖线', '不要把鬓角一次推光', '不要把后脑削得过扁'],
    },
  },
  {
    id: 'qiao-ivy',
    status: 'active',
    demoPersonaId: 'qiao',
    demoOptionId: 'ivy',
    name: '常春藤侧分',
    aliases: ['常春藤发型', '商务侧分短发'],
    coverImage: '/demo/persona-qiao-ivy.webp',
    imageAlt: '乔衡的常春藤侧分示例，预先制作的合成人物素材',
    assetSource: 'project_generated_ai',
    disclosure,
    genderPresentation: 'masculine',
    length: 'short',
    hairTextures: ['straight', 'wavy'],
    strandThicknesses: ['medium', 'coarse'],
    densities: ['medium', 'high'],
    goals: ['no_perm_or_dye', 'glasses_friendly', 'commute_ready'],
    maintenanceLevel: 'medium',
    maintenanceSummary: '中：吹出侧分后用轻定型产品压住侧面，约 5—7 周修剪。',
    stylingMinutes: 8,
    trimIntervalWeeks: [5, 7],
    requiresPerm: false,
    reason: '厚硬直发能撑住清楚侧分，顶部留长可平衡较利落的两侧。',
    feasibility: '可剪参考：先确认发旋和自然分缝，再决定分线与顶部最短长度。',
    tradeoffs: [
      '自然分缝与参考方向不同的人，不能只靠剪裁固定分线。',
      '厚硬发的两侧长出后容易外翘，需要吹整或按期修剪。',
    ],
    barberGuide: {
      overall: '利落但不僵硬的常春藤侧分，先按自然发旋确认分线，再建立顶部与两侧比例。',
      top: '顶部保留足够侧梳的长度，前区略长，避免剪到无法改变分线。',
      fringe: '前额可向侧后方梳理，不剪厚重齐刘海。',
      sides: '两侧以剪刀或低号推剪柔和收窄，眼镜腿附近不要留下突兀台阶。',
      sideburns: '鬓角整洁但不推成极细尖角，长度与眼镜腿位置协调。',
      back: '后脑保留自然圆度，后颈干净收边；渐层高度现场确认。',
      topPriorities: ['顺着自然分缝', '顶部保留侧梳长度', '眼镜腿附近衔接干净'],
      absoluteAvoids: ['不要强行改变发旋', '不要把两侧推得过高', '不要把顶部剪成同一长度'],
    },
  },
  {
    id: 'qiao-taper',
    status: 'active',
    demoPersonaId: 'qiao',
    demoOptionId: 'taper',
    name: '清爽渐层',
    aliases: ['低渐层短发', '低渐变'],
    coverImage: '/demo/persona-qiao-taper.webp',
    imageAlt: '乔衡的清爽渐层示例，预先制作的合成人物素材',
    assetSource: 'project_generated_ai',
    disclosure,
    genderPresentation: 'masculine',
    length: 'very_short',
    hairTextures: ['straight', 'wavy'],
    strandThicknesses: ['medium', 'coarse'],
    densities: ['medium', 'high'],
    goals: ['low_maintenance', 'no_perm_or_dye', 'commute_ready'],
    maintenanceLevel: 'low',
    maintenanceSummary: '低至中：吹干后用少量哑光发泥抓出方向。',
    stylingMinutes: 5,
    trimIntervalWeeks: [4, 6],
    requiresPerm: false,
    reason: '厚硬直发的支撑力适合做清楚的顶部纹理，缩短两侧会更利落。',
    feasibility: '可剪参考：采用低渐层并保留顶部长度，避免两侧推得过高。',
    tradeoffs: [
      '低渐层边缘长出后对比会减弱，想保持利落需要较勤修边。',
      '头皮或发际线对短侧面较敏感时，应现场降低渐层对比。',
    ],
    barberGuide: {
      overall: '顶部保留纹理、两侧做低渐层的清爽短发，轮廓利落但不过度暴露头皮。',
      top: '顶部保留可用手抓出方向的长度，沿发流做点状纹理。',
      fringe: '前区短而有参差，不剪成笔直厚重的横线。',
      sides: '渐层从低位开始，耳上逐步过渡，不抬到太阳穴上方。',
      sideburns: '鬓角自然收短并融入低渐层，不做生硬直角块。',
      back: '后脑渐层高度与两侧一致，保留枕骨支撑；后颈线现场确认。',
      topPriorities: ['低位渐层', '顶部保留纹理长度', '过渡柔和不露头皮'],
      absoluteAvoids: ['不要做高渐层', '不要把顶部剪成平头', '不要用过细推剪制造明显白边'],
    },
  },
  {
    id: 'ran-crop',
    status: 'active',
    demoPersonaId: 'ran',
    demoOptionId: 'crop',
    name: '纹理短碎发',
    aliases: ['法式短碎', '纹理短寸'],
    coverImage: '/demo/persona-ran-crop.webp',
    imageAlt: '冉青的纹理短碎发示例，预先制作的合成人物素材',
    assetSource: 'project_generated_ai',
    disclosure,
    genderPresentation: 'androgynous',
    length: 'very_short',
    hairTextures: ['wavy', 'curly'],
    strandThicknesses: ['fine', 'medium', 'coarse'],
    densities: ['medium', 'high'],
    goals: ['low_maintenance', 'no_perm_or_dye', 'soften_hairline'],
    maintenanceLevel: 'low',
    maintenanceSummary: '低：半干时抓入少量轻质造型霜，约 5—7 周修剪。',
    stylingMinutes: 4,
    trimIntervalWeeks: [5, 7],
    requiresPerm: false,
    reason: '短碎层次会把自然微卷转成清晰纹理，也减少顶部堆积感。',
    feasibility: '可剪参考：顺着自然卷向剪出参差边缘，湿发时不要判断得过短。',
    tradeoffs: [
      '卷发干后会回缩，湿发长度若留得不足可能比预期更短。',
      '短碎边缘长出后会变得蓬松，仍需少量产品整理纹理。',
    ],
    barberGuide: {
      overall: '顺着自然卷向形成轻松的短碎轮廓，避免剪成规整一致的短寸。',
      top: '顶部按卷束分区点剪，保留干发回缩余量，不在湿发时追求过短。',
      fringe: '前额做不规则碎边，柔化发际线并保留自然卷向。',
      sides: '两侧轻收但保留卷纹，不推成贴头皮的高反差轮廓。',
      sideburns: '鬓角顺着自然卷收净，保留柔和边缘。',
      back: '后脑按自然蓬松度去除堆积，枕骨以下长度需在干发状态现场确认。',
      topPriorities: ['尊重自然卷向', '预留干发回缩长度', '保持参差纹理'],
      absoluteAvoids: ['不要湿发判断到过短', '不要把两侧推青', '不要过度削薄导致毛躁'],
    },
  },
  {
    id: 'ran-sidepart',
    status: 'active',
    demoPersonaId: 'ran',
    demoOptionId: 'sidepart',
    name: '柔和侧分',
    aliases: ['自然卷侧分', '柔和偏分'],
    coverImage: '/demo/persona-ran-sidepart.webp',
    imageAlt: '冉青的柔和侧分示例，预先制作的合成人物素材',
    assetSource: 'project_generated_ai',
    disclosure,
    genderPresentation: 'androgynous',
    length: 'short',
    hairTextures: ['wavy', 'curly'],
    strandThicknesses: ['fine', 'medium', 'coarse'],
    densities: ['low', 'medium', 'high'],
    goals: [
      'no_perm_or_dye',
      'soften_hairline',
      'keep_sides_longer',
      'glasses_friendly',
      'grow_out_gracefully',
    ],
    maintenanceLevel: 'medium',
    maintenanceSummary: '中：湿发确定分线后自然吹干，必要时用轻蜡整理表层。',
    stylingMinutes: 8,
    trimIntervalWeeks: [6, 8],
    requiresPerm: false,
    reason: '保留微卷的流动方向，侧分能打开额头，同时维持柔和的中性轮廓。',
    feasibility: '可剪参考：保留前额可转换分线的长度，耳侧只做柔和收窄。',
    tradeoffs: [
      '分线会受发旋和湿度影响，无法保证每天固定在同一位置。',
      '耳侧保留长度更适合留长过渡，但闷热时不如渐层清爽。',
    ],
    barberGuide: {
      overall: '保留自然微卷流动的柔和侧分，轮廓可变换，不建立僵硬分界线。',
      top: '顶部保留能随分线移动的长度，轻减堆积但保留卷束完整。',
      fringe: '前额长度可向两侧转换，顺着自然弯曲打开额头。',
      sides: '耳侧只柔和收窄并保留长度，眼镜腿附近避免厚重堆积。',
      sideburns: '鬓角与耳侧自然相连，不单独推短或刻出硬线。',
      back: '后脑保留圆润层次，去除下缘堆积；长度和收窄幅度现场确认。',
      topPriorities: ['分线可以转换', '保留自然卷束', '耳侧柔和收窄'],
      absoluteAvoids: ['不要刻出硬分线', '不要把耳侧推得过短', '不要过度打薄制造毛躁'],
    },
  },
]

const normalizeSearchText = (value: string) => (
  value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN').replace(/\s+/gu, ' ')
)

const buildSearchText = (style: CuratedHairstyle) => normalizeSearchText([
  style.name,
  ...style.aliases,
  ...style.goals.map((goal) => STYLE_GOAL_LABELS[goal]),
  MAINTENANCE_LEVEL_LABELS[style.maintenanceLevel],
  style.maintenanceSummary,
].join(' '))

export const filterCuratedHairstyles = (
  filters: CuratedCatalogFilters = {},
): readonly CuratedHairstyle[] => {
  const terms = normalizeSearchText(filters.query ?? '').split(' ').filter(Boolean)
  const goals = filters.goals ?? []
  const maintenanceLevels = filters.maintenanceLevels ?? []
  const hairTextures = filters.hairTextures ?? []

  return curatedHairstyles.filter((style) => (
    style.status === 'active'
    && terms.every((term) => buildSearchText(style).includes(term))
    && goals.every((goal) => style.goals.includes(goal))
    && (
      maintenanceLevels.length === 0
      || maintenanceLevels.includes(style.maintenanceLevel)
    )
    && (
      hairTextures.length === 0
      || hairTextures.some((texture) => style.hairTextures.includes(texture))
    )
  ))
}

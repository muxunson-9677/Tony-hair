// 三层阅读结构硬约束（V4 4.1）：
// 第 1 层（正面）≤1 图 + 7 条信息；第 2 层最在意 3 + 绝对不要 3；其余折叠进第 3 层。
// 超量内容折叠、不丢失、不溢出正面。

export const BARBER_FACE_INFO_LIMIT = 7
export const BARBER_FOCUS_LIMIT = 3

export interface BarberSection {
  readonly label: string
  readonly text: string
}

export interface BarberLayersInput {
  readonly planTitle: string
  readonly targetName?: string
  readonly backupName?: string
  readonly topPriorities: readonly string[]
  readonly absoluteAvoids: readonly string[]
  readonly sections: readonly BarberSection[]
}

export interface BarberLayers {
  readonly face: {
    readonly infoItems: readonly string[]
  }
  readonly focus: {
    readonly topPriorities: readonly string[]
    readonly absoluteAvoids: readonly string[]
  }
  readonly folded: {
    readonly sections: readonly BarberSection[]
    readonly overflowPriorities: readonly string[]
    readonly overflowAvoids: readonly string[]
  }
}

const cleanList = (items: readonly string[]) => items.map((item) => item.trim()).filter(Boolean)

export const buildBarberLayers = (input: BarberLayersInput): BarberLayers => {
  const topPriorities = cleanList(input.topPriorities)
  const absoluteAvoids = cleanList(input.absoluteAvoids)

  const infoItems = [
    input.planTitle.trim(),
    input.targetName ? `目标方案 · ${input.targetName}` : '',
    input.backupName ? `备选 · ${input.backupName}` : '',
    '请现场确认：结合真实发质、发量与头型再定长度和层次',
  ].filter(Boolean).slice(0, BARBER_FACE_INFO_LIMIT)

  return {
    face: { infoItems },
    focus: {
      topPriorities: topPriorities.slice(0, BARBER_FOCUS_LIMIT),
      absoluteAvoids: absoluteAvoids.slice(0, BARBER_FOCUS_LIMIT),
    },
    folded: {
      sections: input.sections
        .map(({ label, text }) => ({ label, text: text.trim() }))
        .filter(({ text }) => Boolean(text)),
      overflowPriorities: topPriorities.slice(BARBER_FOCUS_LIMIT),
      overflowAvoids: absoluteAvoids.slice(BARBER_FOCUS_LIMIT),
    },
  }
}

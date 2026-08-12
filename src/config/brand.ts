export const PRODUCT_NAME = 'Tony宝'
export const PRODUCT_PERSONA = 'Tony'
export const BARBER_CARD_NAME = 'Tony卡'
export const PRODUCT_PROMISE = '剪前帮你定，剪时替你说，剪后帮你记。每剪一次，Tony 更懂你一分。'

// 补充 2：首页版面只放前半句时从完整承诺派生，不另写死第二份文案。
export const PRODUCT_PROMISE_SHORT = PRODUCT_PROMISE.slice(0, PRODUCT_PROMISE.indexOf('。'))

export const pageTitle = (prefix?: string) => (
  prefix ? `${prefix}｜${PRODUCT_NAME}` : PRODUCT_NAME
)

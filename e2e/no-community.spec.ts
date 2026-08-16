import { expect, test } from '@playwright/test'

const retiredPollUrls = [
  '/archive/plans/plan-1/poll/new',
  '/p/public_poll_id_1234567890',
  '/polls/public_poll_id_1234567890/manage',
  '/community',
  '/posts/demo-post',
  '/styles/submit',
] as const

test.describe('retired public-poll surface', () => {
  for (const path of retiredPollUrls) {
    test(`${path} is unavailable without poll or masked-upload network traffic`, async ({ page }) => {
      const apiRequests: string[] = []
      const webSockets: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/api/')) {
          apiRequests.push(`${request.method()} ${url.pathname}`)
        }
      })
      page.on('websocket', (socket) => webSockets.push(socket.url()))

      await page.goto(path)

      await expect(page.getByRole('heading', { level: 1, name: '页面没找到' })).toBeVisible()
      await expect(page.getByRole('link', { name: '返回首页' })).toBeVisible()
      await expect(page.getByRole('button', { name: /投票|上传并创建|提交这一票|撤销|发帖|评论|点赞/ })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /发起好友投票|查看结果并管理|发布作品|社区广场/ })).toHaveCount(0)
      expect(apiRequests).toEqual([])
      expect(webSockets).toEqual([])
    })
  }
})

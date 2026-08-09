import { fireEvent, render, screen } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { POLL_SERVICE_KEY, type PollServicePort } from '../features/polls/pollRuntime'
import { PollServiceError, type PublicPoll } from '../features/polls/PollService'
import PublicPollView from './PublicPollView.vue'

const poll: PublicPoll = {
  pollId: 'public_poll_id_1234567890',
  title: '帮我选：下次短发计划',
  expiresAt: '2026-08-17T04:00:00.000Z',
  viewerHasVoted: false,
  options: [
    {
      id: '123e4567-e89b-42d3-a456-426614174000',
      label: '<img src=x onerror=alert(1)>轻盈短碎',
      disclosure: 'demo',
      imageUrl: 'https://example.test/one.webp',
    },
    {
      id: '223e4567-e89b-42d3-a456-426614174000',
      label: '自然侧分',
      disclosure: 'reference',
      imageUrl: 'https://example.test/two.webp',
    },
  ],
}

describe('PublicPollView', () => {
  let service: PollServicePort

  beforeEach(() => {
    service = {
      verifyAccess: vi.fn(),
      uploadMasked: vi.fn(),
      createPoll: vi.fn(),
      getPoll: vi.fn(async () => poll),
      vote: vi.fn(async () => {}),
      getResults: vi.fn(),
      revoke: vi.fn(),
    }
  })

  const renderView = async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/p/:id', component: PublicPollView }],
    })
    await router.push(`/p/${poll.pollId}`)
    await router.isReady()
    return render(PublicPollView, {
      global: {
        plugins: [router],
        provide: { [POLL_SERVICE_KEY as symbol]: service },
      },
    })
  }

  test('shows two to four image choices plus none, with a 60-code-point comment field', async () => {
    const { container } = await renderView()

    expect(await screen.findByRole('heading', { level: 1, name: poll.title })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByText('示例体验 · 预制素材')).toBeTruthy()
    expect(screen.getByLabelText('短评（可选，最多 60 字）').getAttribute('maxlength')).toBe('60')
    expect(screen.getByText('<img src=x onerror=alert(1)>轻盈短碎')).toBeTruthy()
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })

  test('submits one choice and reports success only after the service resolves', async () => {
    await renderView()
    await screen.findByRole('heading', { level: 1, name: poll.title })
    await fireEvent.click(screen.getByRole('radio', { name: /自然侧分/ }))
    await fireEvent.update(screen.getByLabelText('短评（可选，最多 60 字）'), '更适合你')
    await fireEvent.click(screen.getByRole('button', { name: '提交这一票' }))

    expect(service.vote).toHaveBeenCalledWith(poll.pollId, {
      optionId: poll.options[1]?.id,
      comment: '更适合你',
    })
    expect(await screen.findByText('这一票已计入')).toBeTruthy()
  })

  test('locks an already-voted browser without posting again', async () => {
    vi.mocked(service.getPoll).mockResolvedValue({ ...poll, viewerHasVoted: true })

    await renderView()

    expect(await screen.findByText('这个浏览器已经投过了')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '提交这一票' })).toBeNull()
    expect(service.vote).not.toHaveBeenCalled()
  })

  test.each([
    [new PollServiceError('http', 'POLL_GONE', '投票已结束', 410), '投票已结束'],
    [new PollServiceError('offline', 'NETWORK_UNAVAILABLE', '网络不可用'), '网络不可用，尚未计票'],
  ])('renders a recoverable terminal or offline state', async (failure, message) => {
    vi.mocked(service.getPoll).mockRejectedValue(failure)

    await renderView()

    expect(await screen.findByText(message)).toBeTruthy()
  })

  test('turns a duplicate response into a locked result state', async () => {
    vi.mocked(service.vote).mockRejectedValue(
      new PollServiceError('http', 'ALREADY_VOTED', '这个浏览器已经投过票', 409),
    )
    await renderView()
    await screen.findByRole('heading', { level: 1, name: poll.title })
    await fireEvent.click(screen.getByRole('radio', { name: /都不合适/ }))
    await fireEvent.click(screen.getByRole('button', { name: '提交这一票' }))

    expect(await screen.findByText('这个浏览器已经投过了')).toBeTruthy()
  })
})

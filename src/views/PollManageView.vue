<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  defaultPollDraftRepository,
  defaultPollService,
  POLL_DRAFT_REPOSITORY_KEY,
  POLL_SERVICE_KEY,
} from '../features/polls/pollRuntime'
import { PollServiceError, type PollResults, type PublicPoll } from '../features/polls/PollService'
import type { PollDraft } from '../features/polls/types'

type ManageState = 'loading' | 'missing-local' | 'active' | 'revoked' | 'gone' | 'local-cleanup-error' | 'offline' | 'error'

const route = useRoute()
const repository = inject(POLL_DRAFT_REPOSITORY_KEY, defaultPollDraftRepository)
const service = inject(POLL_SERVICE_KEY, defaultPollService)
const pollId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const draft = ref<PollDraft | null>(null)
const publicPoll = ref<PublicPoll | null>(null)
const results = ref<PollResults | null>(null)
const state = ref<ManageState>('loading')
const busy = ref(false)
const errorMessage = ref('')
const cleanupTargetState = ref<'gone' | 'revoked'>('gone')

const resultRows = computed(() => publicPoll.value?.options.map((option) => ({
  ...option,
  votes: results.value?.options.find(({ optionId }) => optionId === option.id)?.votes ?? 0,
})) ?? [])
const shareLink = computed(() => `${window.location.origin}/p/${pollId.value}`)
const isTrustedGone = (error: unknown) => error instanceof PollServiceError
  && error.status === 410
  && error.code === 'POLL_GONE'

const finishLocalRevocation = async (local: PollDraft, nextState: 'gone' | 'revoked') => {
  try {
    draft.value = await repository.markRevoked(local.id)
    state.value = nextState
  } catch {
    cleanupTargetState.value = nextState
    state.value = 'local-cleanup-error'
    errorMessage.value = '云端投票已经失效，但本机管理信息未能清除。请稍后刷新重试，或清理本站浏览器数据。'
  }
}

const loadResults = async () => {
  state.value = 'loading'
  errorMessage.value = ''
  try {
    const local = await repository.getByPollId(pollId.value)
    if (!local) {
      state.value = 'missing-local'
      return
    }
    draft.value = local
    if (local.status === 'revoked') {
      state.value = 'revoked'
      return
    }
    if (!local.managementToken) {
      state.value = 'missing-local'
      return
    }
    const [loadedPoll, loadedResults] = await Promise.all([
      service.getPoll(pollId.value),
      service.getResults(pollId.value, local.managementToken),
    ])
    publicPoll.value = loadedPoll
    results.value = loadedResults
    state.value = 'active'
  } catch (error) {
    if (isTrustedGone(error)) {
      if (draft.value) await finishLocalRevocation(draft.value, 'gone')
      else state.value = 'gone'
    } else if (error instanceof PollServiceError && error.kind === 'offline') {
      state.value = 'offline'
    } else {
      state.value = 'error'
      errorMessage.value = error instanceof PollServiceError
        ? error.message
        : '结果暂时无法读取，请稍后重试。'
    }
  }
}

const revokePoll = async () => {
  const local = draft.value
  if (!local?.managementToken || !window.confirm('撤销后分享链接会立即失效，遮罩图和投票将删除。确定继续吗？')) return
  busy.value = true
  errorMessage.value = ''
  try {
    await service.revoke(pollId.value, local.managementToken)
    await finishLocalRevocation(local, 'revoked')
  } catch (error) {
    if ((error instanceof PollServiceError && error.code === 'BLOB_DELETE_PENDING')
      || isTrustedGone(error)) {
      await finishLocalRevocation(local, 'revoked')
    } else {
      errorMessage.value = error instanceof PollServiceError && error.kind === 'offline'
        ? '网络不可用，投票尚未撤销。请联网后重试。'
        : '撤销没有完成，请稍后重试。'
    }
  } finally {
    busy.value = false
  }
}

const retryLocalCleanup = async () => {
  if (!draft.value) return
  await finishLocalRevocation(draft.value, cleanupTargetState.value)
}

onMounted(loadResults)
</script>

<template>
  <section
    class="poll-manage-view"
    aria-labelledby="poll-manage-title"
  >
    <header class="poll-manage-header">
      <p class="eyebrow">
        LOCAL MANAGEMENT KEY
      </p>
      <h1 id="poll-manage-title">
        投票<br>结果
      </h1>
      <p>管理密钥只保存在创建投票的这台设备，不在链接里。</p>
    </header>

    <p
      v-if="state === 'loading'"
      class="poll-state"
      role="status"
    >
      正在读取票数…
    </p>

    <section
      v-else-if="state === 'missing-local'"
      class="poll-manage-terminal"
    >
      <h2>只能在创建投票的这台设备管理</h2>
      <p>这里没有本地管理密钥。我们不会要求你从链接或聊天记录中输入密钥。</p>
      <RouterLink
        class="poll-secondary-link"
        to="/archive"
      >
        返回档案
      </RouterLink>
    </section>

    <section
      v-else-if="state === 'revoked'"
      class="poll-manage-terminal"
    >
      <h2>投票已撤销，分享图正在删除</h2>
      <p>公开链接已经失效；若云端清理暂未完成，每日清理任务会继续处理。</p>
    </section>

    <section
      v-else-if="state === 'gone'"
      class="poll-manage-terminal"
    >
      <h2>投票已结束</h2>
      <p>它可能已经过期，或已在另一页面撤销。</p>
    </section>

    <section
      v-else-if="state === 'local-cleanup-error'"
      class="poll-manage-terminal"
    >
      <h2>云端投票已失效</h2>
      <p role="alert">
        {{ errorMessage }}
      </p>
      <button
        class="poll-primary-button"
        type="button"
        @click="retryLocalCleanup"
      >
        重试本机清理
      </button>
    </section>

    <section
      v-else-if="state === 'offline'"
      class="poll-manage-terminal"
    >
      <h2>网络不可用</h2>
      <p>本地管理密钥仍在，联网后可以重新读取结果。</p>
      <button
        class="poll-primary-button"
        type="button"
        @click="loadResults"
      >
        重新连接
      </button>
    </section>

    <section
      v-else-if="state === 'error'"
      class="poll-manage-terminal"
    >
      <h2>暂时无法读取结果</h2>
      <p role="alert">
        {{ errorMessage }}
      </p>
      <button
        class="poll-primary-button"
        type="button"
        @click="loadResults"
      >
        重试
      </button>
    </section>

    <template v-else-if="results && publicPoll">
      <section
        class="poll-result-total"
        aria-label="总票数"
      >
        <strong>{{ results.total }} 票</strong>
        <span>截至当前设备刚刚刷新</span>
      </section>

      <ol
        class="poll-result-list"
        aria-label="各方案票数"
      >
        <li
          v-for="(option, index) in resultRows"
          :key="option.id"
        >
          <span class="poll-result-list__index">0{{ index + 1 }}</span>
          <img
            :src="option.imageUrl"
            :alt="`${option.label}候选图`"
          >
          <span><b>{{ option.label }}</b><small>{{ option.disclosure === 'demo' ? '示例体验' : '参考图' }}</small></span>
          <strong>{{ option.votes }}</strong>
        </li>
        <li class="poll-result-list__none">
          <span>—</span><span><b>都不合适</b></span><strong>{{ results.none }}</strong>
        </li>
      </ol>

      <section
        class="poll-comments"
        aria-labelledby="poll-comments-title"
      >
        <div>
          <p class="poll-step__index">
            SHORT COMMENTS
          </p>
          <h2 id="poll-comments-title">
            朋友怎么说
          </h2>
        </div>
        <p
          v-if="results.comments.length === 0"
          class="poll-comments__empty"
        >
          还没有短评。
        </p>
        <ol v-else>
          <li
            v-for="item in results.comments"
            :key="`${item.createdAt}:${item.comment}`"
          >
            <p>{{ item.comment }}</p>
            <time :datetime="item.createdAt">{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</time>
          </li>
        </ol>
      </section>

      <section class="poll-manage-actions">
        <a
          class="poll-share-link"
          :href="shareLink"
        >{{ shareLink }}</a>
        <button
          class="poll-danger-button"
          type="button"
          :disabled="busy"
          @click="revokePoll"
        >
          {{ busy ? '正在撤销…' : '撤销并删除投票' }}
        </button>
        <p
          v-if="errorMessage"
          class="poll-error"
          role="alert"
        >
          {{ errorMessage }}
        </p>
      </section>
    </template>
  </section>
</template>

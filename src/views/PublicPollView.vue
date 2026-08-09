<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  defaultPollService,
  POLL_SERVICE_KEY,
} from '../features/polls/pollRuntime'
import { PollServiceError, type PublicPoll } from '../features/polls/PollService'

type PageState = 'loading' | 'active' | 'submitting' | 'voted' | 'gone' | 'not-found' | 'offline' | 'error'

const route = useRoute()
const service = inject(POLL_SERVICE_KEY, defaultPollService)
const pollId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const poll = ref<PublicPoll | null>(null)
const state = ref<PageState>('loading')
const selectedOptionId = ref<string | null | undefined>(undefined)
const comment = ref('')
const errorMessage = ref('')
const duplicateVote = ref(false)

const loadPoll = async () => {
  state.value = 'loading'
  errorMessage.value = ''
  try {
    poll.value = await service.getPoll(pollId.value)
    duplicateVote.value = poll.value.viewerHasVoted
    state.value = poll.value.viewerHasVoted ? 'voted' : 'active'
  } catch (error) {
    if (error instanceof PollServiceError) {
      if (error.code === 'POLL_GONE') state.value = 'gone'
      else if (error.code === 'POLL_NOT_FOUND') state.value = 'not-found'
      else if (error.kind === 'offline') state.value = 'offline'
      else {
        state.value = 'error'
        errorMessage.value = error.message
      }
    } else {
      state.value = 'error'
      errorMessage.value = '投票暂时无法读取，请稍后重试。'
    }
  }
}

const submitVote = async () => {
  if (selectedOptionId.value === undefined) {
    errorMessage.value = '请选择一个方案，或选择“都不合适”。'
    return
  }
  if ([...comment.value].length > 60) {
    errorMessage.value = '短评不能超过 60 个字符。'
    return
  }
  state.value = 'submitting'
  errorMessage.value = ''
  try {
    await service.vote(pollId.value, {
      optionId: selectedOptionId.value,
      comment: comment.value,
    })
    state.value = 'voted'
  } catch (error) {
    if (error instanceof PollServiceError && error.code === 'ALREADY_VOTED') {
      duplicateVote.value = true
      state.value = 'voted'
      return
    }
    if (error instanceof PollServiceError && error.code === 'POLL_GONE') {
      state.value = 'gone'
      return
    }
    state.value = error instanceof PollServiceError && error.kind === 'offline' ? 'offline' : 'active'
    errorMessage.value = error instanceof PollServiceError
      ? error.message
      : '这一票尚未计入，请稍后重试。'
  }
}

onMounted(loadPoll)
</script>

<template>
  <section
    class="public-poll-view"
    aria-live="polite"
  >
    <p
      v-if="state === 'loading'"
      class="public-poll-state"
      role="status"
    >
      正在打开投票…
    </p>

    <section
      v-else-if="state === 'gone'"
      class="public-poll-terminal"
      aria-labelledby="poll-gone-title"
    >
      <p class="eyebrow">
        VOTE CLOSED
      </p>
      <h1 id="poll-gone-title">
        投票已结束
      </h1>
      <p>链接可能已过期，或创建者已经撤销并删除投票。</p>
    </section>

    <section
      v-else-if="state === 'not-found'"
      class="public-poll-terminal"
      aria-labelledby="poll-missing-title"
    >
      <p class="eyebrow">
        LINK NOT FOUND
      </p>
      <h1 id="poll-missing-title">
        没有找到投票
      </h1>
      <p>请向分享者确认链接是否完整。</p>
    </section>

    <section
      v-else-if="state === 'offline'"
      class="public-poll-terminal"
      aria-labelledby="poll-offline-title"
    >
      <p class="eyebrow">
        NOT COUNTED
      </p>
      <h1 id="poll-offline-title">
        网络不可用，尚未计票
      </h1>
      <p>没有收到成功确认前，请不要认为这一票已经提交。</p>
      <button
        class="poll-primary-button"
        type="button"
        @click="loadPoll"
      >
        重新连接
      </button>
    </section>

    <section
      v-else-if="state === 'error'"
      class="public-poll-terminal"
      aria-labelledby="poll-error-title"
    >
      <p class="eyebrow">
        TRY AGAIN
      </p>
      <h1 id="poll-error-title">
        暂时无法打开
      </h1>
      <p role="alert">
        {{ errorMessage }}
      </p>
      <button
        class="poll-primary-button"
        type="button"
        @click="loadPoll"
      >
        重新读取
      </button>
    </section>

    <template v-else-if="poll">
      <header class="public-poll-header">
        <p class="eyebrow">
          咋剪发 · 好友投票
        </p>
        <h1>{{ poll.title }}</h1>
        <p>看发型本身，选你觉得最适合的一张。</p>
      </header>

      <section
        v-if="state === 'voted'"
        class="public-poll-voted"
        aria-labelledby="poll-voted-title"
      >
        <p
          class="public-poll-voted__mark"
          aria-hidden="true"
        >
          ✓
        </p>
        <h2 id="poll-voted-title">
          {{ duplicateVote ? '这个浏览器已经投过了' : '这一票已计入' }}
        </h2>
        <p>同一浏览器不能重复投票。谢谢你帮朋友少一次翻车。</p>
      </section>

      <form
        v-else
        class="public-poll-form"
        @submit.prevent="submitVote"
      >
        <fieldset :disabled="state === 'submitting'">
          <legend class="sr-only">
            选择一个发型方案
          </legend>
          <div class="public-poll-options">
            <label
              v-for="(option, index) in poll.options"
              :key="option.id"
              class="public-poll-option"
            >
              <input
                v-model="selectedOptionId"
                type="radio"
                name="poll-option"
                :value="option.id"
              >
              <span class="public-poll-option__media">
                <img
                  :src="option.imageUrl"
                  :alt="`${option.label}候选图`"
                >
                <span class="public-poll-option__number">0{{ index + 1 }}</span>
              </span>
              <span class="public-poll-option__copy">
                <b>{{ option.label }}</b>
                <small v-if="option.disclosure === 'demo'">示例体验 · 预制素材</small>
                <small v-else>本人或已授权参考图</small>
              </span>
              <span
                class="public-poll-option__check"
                aria-hidden="true"
              >●</span>
            </label>

            <label class="public-poll-none">
              <input
                v-model="selectedOptionId"
                type="radio"
                name="poll-option"
                :value="null"
              >
              <span><b>都不合适</b><small>宁可继续找，也不要勉强选</small></span>
              <span aria-hidden="true">●</span>
            </label>
          </div>
        </fieldset>

        <label class="public-poll-comment">
          <span>短评（可选，最多 60 字）</span>
          <textarea
            v-model="comment"
            maxlength="60"
            rows="3"
            placeholder="一句话说说原因"
          />
        </label>
        <p
          v-if="errorMessage"
          class="poll-error"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <button
          class="poll-primary-button"
          type="submit"
          :disabled="state === 'submitting'"
        >
          {{ state === 'submitting' ? '正在提交…' : '提交这一票' }}
        </button>
      </form>

      <footer class="public-poll-footer">
        <p>不采集设备指纹。清除 Cookie 或更换浏览器后仍可能再次投票。</p>
        <p>照片做过遮罩也不等于匿名，熟人仍可能识别。</p>
      </footer>
    </template>
  </section>
</template>

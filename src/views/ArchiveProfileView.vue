<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  useArchiveStore,
  type HairProfileDraft,
} from '../features/archive/archiveStore'
import { parseArchivePlanReturnPath } from '../features/archive/archiveReturnPath'
import { shouldDiscardPollDraftOnArchiveDeletion } from '../features/polls/archivePollDeletion'
import {
  defaultPollDraftRepository,
  POLL_DRAFT_REPOSITORY_KEY,
} from '../features/polls/pollRuntime'
import type { PollDraft } from '../features/polls/types'

const router = useRouter()
const route = useRoute()
const store = useArchiveStore()
const pollDraftRepository = inject(POLL_DRAFT_REPOSITORY_KEY, defaultPollDraftRepository)
const initializing = ref(true)
const pollDeleteError = ref('')
let viewActive = false
let submitRequest = 0
const canonicalReturnPath = computed(() => {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/')
    ? parseArchivePlanReturnPath(next)?.path ?? null
    : null
})

const form = reactive<HairProfileDraft>({
  name: '',
  hairTexture: 'straight',
  strandThickness: 'medium',
  density: 'medium',
  stylingMinutes: 10,
  washFrequency: 'every_other_day',
  preferenceNotes: '',
})

const populateForm = () => {
  const profile = store.profile
  if (profile) {
    form.name = profile.name
    form.hairTexture = profile.hairTexture
    form.strandThickness = profile.strandThickness
    form.density = profile.density
    form.stylingMinutes = profile.stylingMinutes
    form.washFrequency = profile.washFrequency
    form.preferenceNotes = profile.preferenceNotes
    document.title = '编辑发型档案｜咋剪发'
  }
}

const submit = async () => {
  const request = submitRequest + 1
  submitRequest = request
  const returnPathBeforeSave = canonicalReturnPath.value
  const saved = await store.saveProfile(form)
  if (saved && viewActive && request === submitRequest) {
    const returnPathAfterSave = canonicalReturnPath.value
    await router.replace(
      returnPathBeforeSave && returnPathAfterSave === returnPathBeforeSave
        ? returnPathAfterSave
        : '/archive',
    )
  }
}

const deleteProfile = async () => {
  pollDeleteError.value = ''
  const targetProfileId = store.profile?.id
  if (!targetProfileId) {
    pollDeleteError.value = '没有找到要删除的档案，档案未删除。'
    return
  }

  await store.load()
  if (store.error) return

  const targetProfile = store.profiles.find(({ id }) => id === targetProfileId)
  if (!targetProfile) {
    pollDeleteError.value = '刷新后没有找到要删除的档案，档案未删除。'
    return
  }

  if (store.profile?.id !== targetProfileId) {
    pollDeleteError.value = '主要档案已在其他页面发生变化，本次档案未删除。请返回档案后重新打开要删除的档案。'
    return
  }

  const planIds = store.plans
    .filter(({ profileId }) => profileId === targetProfileId)
    .map(({ id }) => id)
  let pollDrafts: PollDraft[]
  try {
    pollDrafts = (await Promise.all(
      planIds.map((planId) => pollDraftRepository.getByPlanId(planId)),
    )).filter((draft): draft is PollDraft => Boolean(draft))
  } catch {
    pollDeleteError.value = '旧分享草稿暂时无法读取，档案未删除。请稍后重试。'
    return
  }

  const discardableDrafts = pollDrafts.filter(shouldDiscardPollDraftOnArchiveDeletion)
  const confirmation = discardableDrafts.some(({ status }) => status !== 'revoked')
    ? '此档案还有旧分享草稿。继续会先删除其中的遮罩图、上传进度和管理信息，再删除档案、全部发型计划和历史记录。确定继续吗？'
    : '删除档案会同时删除全部发型计划和历史记录，且无法恢复。确定删除吗？'
  if (!window.confirm(confirmation)) return

  try {
    await pollDraftRepository.retireForArchiveDeletion(planIds)
  } catch {
    pollDeleteError.value = '旧分享草稿未能清理，档案未删除。请稍后重试。'
    return
  }

  if (await store.deleteProfile(targetProfileId)) {
    await router.push('/archive')
  }
}

onMounted(async () => {
  viewActive = true
  await store.load()
  if (!viewActive) return
  populateForm()
  initializing.value = false
})

onBeforeUnmount(() => {
  viewActive = false
  submitRequest += 1
})
</script>

<template>
  <section
    class="archive-form-view"
    aria-labelledby="profile-form-title"
  >
    <RouterLink
      class="back-link"
      :to="canonicalReturnPath ?? '/archive'"
    >
      <span aria-hidden="true">←</span> {{ canonicalReturnPath ? '返回发型计划' : '返回档案' }}
    </RouterLink>

    <header class="inner-header">
      <p class="eyebrow">
        PROFILE · LOCAL ONLY
      </p>
      <h1 id="profile-form-title">
        {{ store.profile ? '编辑发型档案' : '建立发型档案' }}
      </h1>
      <p>只记下剪发决策需要的信息，不创建账号。</p>
    </header>

    <p
      v-if="store.loading || initializing"
      class="archive-loading"
      role="status"
    >
      正在读取本地档案…
    </p>

    <form
      v-else
      class="archive-form"
      @submit.prevent="submit"
    >
      <p
        v-if="store.error"
        class="form-alert"
        role="alert"
      >
        {{ store.error }}
      </p>

      <p
        v-if="pollDeleteError"
        class="form-alert"
        role="alert"
      >
        {{ pollDeleteError }}
      </p>

      <label>
        <span>称呼</span>
        <input
          v-model="form.name"
          name="name"
          autocomplete="nickname"
          maxlength="40"
          required
        >
      </label>

      <div class="form-grid">
        <label>
          <span>发质</span>
          <select
            v-model="form.hairTexture"
            name="hairTexture"
            required
          >
            <option value="straight">直</option>
            <option value="wavy">微卷</option>
            <option value="curly">卷</option>
            <option value="coily">强卷</option>
            <option value="unsure">暂不确定</option>
          </select>
        </label>

        <label>
          <span>发丝粗细</span>
          <select
            v-model="form.strandThickness"
            name="strandThickness"
            required
          >
            <option value="fine">细</option>
            <option value="medium">适中</option>
            <option value="coarse">粗</option>
            <option value="unsure">暂不确定</option>
          </select>
        </label>

        <label>
          <span>发量</span>
          <select
            v-model="form.density"
            name="density"
            required
          >
            <option value="low">少</option>
            <option value="medium">适中</option>
            <option value="high">多</option>
            <option value="unsure">暂不确定</option>
          </select>
        </label>

        <label>
          <span>日常打理分钟</span>
          <input
            v-model.number="form.stylingMinutes"
            name="stylingMinutes"
            type="number"
            min="0"
            max="180"
            step="1"
            inputmode="numeric"
            required
          >
        </label>
      </div>

      <label>
        <span>洗发频率</span>
        <select
          v-model="form.washFrequency"
          name="washFrequency"
          required
        >
          <option value="daily">每天</option>
          <option value="every_other_day">隔天</option>
          <option value="two_to_three_per_week">每周 2—3 次</option>
          <option value="weekly_or_less">每周 1 次或更少</option>
          <option value="unsure">暂不确定</option>
        </select>
      </label>

      <label>
        <span>偏好备注</span>
        <textarea
          v-model="form.preferenceNotes"
          name="preferenceNotes"
          rows="4"
          maxlength="500"
          placeholder="例如：希望露耳；两侧不要推白"
        />
      </label>

      <aside
        class="privacy-note"
        aria-label="照片与本地保存提醒"
      >
        <b>成年人及授权提醒</b>
        <p>后续如使用照片，只能使用成年人的本人照片，或已获照片本人明确授权的照片。</p>
        <p>档案仅保存在当前设备；清理浏览器数据、无痕模式或更换设备都可能导致丢失。</p>
      </aside>

      <button
        class="submit-button"
        type="submit"
        :disabled="store.saving"
      >
        {{ store.saving ? '正在保存…' : store.profile ? '保存修改' : '保存档案' }}
      </button>

      <button
        v-if="store.profile"
        class="danger-button"
        type="button"
        :disabled="store.saving"
        @click="deleteProfile"
      >
        删除档案及其内容
      </button>
    </form>
  </section>
</template>

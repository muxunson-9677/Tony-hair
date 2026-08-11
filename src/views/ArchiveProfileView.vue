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
import type { HairProfilePhoto } from '../features/archive/types'
import {
  ImagePreparationError,
  prepareLocalImage,
} from '../features/images/prepareLocalImage'
import { tactileDirective as vTactile } from '../ui/tactile'

const router = useRouter()
const route = useRoute()
const store = useArchiveStore()
const pollDraftRepository = inject(POLL_DRAFT_REPOSITORY_KEY, defaultPollDraftRepository)
const initializing = ref(true)
const pollDeleteError = ref('')
const profilePhotoError = ref('')
const processingPhotoAngle = ref<HairProfilePhoto['angle'] | null>(null)
const profilePhotoUrls = ref<Record<string, string>>({})
const profilePhotoAngles = [
  { angle: 'front', label: '正面' },
  { angle: 'side', label: '侧面' },
  { angle: 'back', label: '后脑' },
] as const
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
  genderIdentity: 'unspecified',
  presentationPreference: 'unspecified',
  hairTexture: 'unsure',
  strandThickness: 'unsure',
  density: 'unsure',
  stylingMinutes: null,
  washFrequency: 'unsure',
  preferenceNotes: '',
  profilePhotos: [],
})

const releaseProfilePhotoUrls = () => {
  Object.values(profilePhotoUrls.value).forEach((url) => URL.revokeObjectURL(url))
  profilePhotoUrls.value = {}
}

const refreshProfilePhotoUrls = () => {
  releaseProfilePhotoUrls()
  profilePhotoUrls.value = Object.fromEntries(
    (form.profilePhotos ?? []).map((photo) => [photo.angle, URL.createObjectURL(photo.image)]),
  )
}

const setProfilePhoto = async (angle: HairProfilePhoto['angle'], event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || store.saving || processingPhotoAngle.value) return
  profilePhotoError.value = ''
  processingPhotoAngle.value = angle
  try {
    const prepared = await prepareLocalImage(file)
    if (!viewActive) return
    const photo: HairProfilePhoto = {
      id: `profile-photo:${angle}`,
      angle,
      image: prepared.blob,
      width: prepared.width,
      height: prepared.height,
      bytes: prepared.bytes,
      processedAt: prepared.processedAt,
    }
    form.profilePhotos = [
      ...(form.profilePhotos ?? []).filter((item) => item.angle !== angle),
      photo,
    ]
    refreshProfilePhotoUrls()
  } catch (caught) {
    profilePhotoError.value = caught instanceof ImagePreparationError
      ? caught.message
      : '照片处理失败，请换一张重试。'
  } finally {
    processingPhotoAngle.value = null
  }
}

const removeProfilePhoto = (angle: HairProfilePhoto['angle']) => {
  form.profilePhotos = (form.profilePhotos ?? []).filter((photo) => photo.angle !== angle)
  refreshProfilePhotoUrls()
}

const populateForm = () => {
  const profile = store.profile
  if (profile) {
    form.name = profile.name
    form.genderIdentity = profile.genderIdentity ?? 'unspecified'
    form.presentationPreference = profile.presentationPreference ?? 'unspecified'
    form.hairTexture = profile.hairTexture
    form.strandThickness = profile.strandThickness
    form.density = profile.density
    form.stylingMinutes = profile.stylingMinutes
    form.washFrequency = profile.washFrequency
    form.preferenceNotes = profile.preferenceNotes
    form.profilePhotos = [...profile.profilePhotos ?? []]
    refreshProfilePhotoUrls()
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
  releaseProfilePhotoUrls()
})
</script>

<template>
  <section
    class="archive-form-view"
    aria-labelledby="profile-form-title"
  >
    <RouterLink
      v-tactile
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

      <details
        class="profile-setup-step"
        open
      >
        <summary v-tactile>
          <span class="profile-setup-step__number">1</span>
          <span><b>先放一张现在的头发照片</b><small>正面最有用，侧面和后脑可以以后再补</small></span>
        </summary>
        <div class="profile-setup-step__body">
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

          <fieldset class="profile-photo-picker">
            <legend>我的头发照片</legend>
            <p>拍下正面、侧面或后脑。之后看档案和选发型时，会优先用你自己的真实照片。</p>
            <div class="profile-photo-picker__grid">
              <div
                v-for="item in profilePhotoAngles"
                :key="item.angle"
                class="profile-photo-slot"
              >
                <img
                  v-if="profilePhotoUrls[item.angle]"
                  :src="profilePhotoUrls[item.angle]"
                  :alt="`我的头发${item.label}照片`"
                >
                <span
                  v-else
                  class="profile-photo-slot__placeholder"
                  aria-hidden="true"
                >✦</span>
                <b>{{ item.label }}</b>
                <label
                  v-tactile
                  class="photo-pick-button"
                >
                  <span>{{ profilePhotoUrls[item.angle] ? '更换' : '添加' }}</span>
                  <input
                    type="file"
                    :aria-label="`${item.label}头发照片`"
                    accept="image/jpeg,image/png,image/webp"
                    :disabled="store.saving || Boolean(processingPhotoAngle)"
                    @change="setProfilePhoto(item.angle, $event)"
                  >
                </label>
                <button
                  v-if="profilePhotoUrls[item.angle]"
                  v-tactile
                  type="button"
                  class="photo-remove-button"
                  @click="removeProfilePhoto(item.angle)"
                >
                  移除
                </button>
              </div>
            </div>
            <p
              v-if="processingPhotoAngle"
              role="status"
            >
              正在本地处理照片…
            </p>
            <p
              v-if="profilePhotoError"
              class="form-alert"
              role="alert"
            >
              {{ profilePhotoError }}
            </p>
          </fieldset>
        </div>
      </details>

      <details class="profile-setup-step">
        <summary v-tactile>
          <span class="profile-setup-step__number profile-setup-step__number--coral">2</span>
          <span><b>再告诉我你想呈现的感觉</b><small>性别可以不透露，真正用于排序的是呈现偏好</small></span>
        </summary>
        <div class="profile-setup-step__body form-grid">
          <label>
            <span>性别（用于筛选，可不透露）</span>
            <select
              v-model="form.genderIdentity"
              name="genderIdentity"
            >
              <option value="unspecified">不透露</option>
              <option value="woman">女</option>
              <option value="man">男</option>
              <option value="nonbinary">其他 / 非二元</option>
            </select>
          </label>
          <label>
            <span>更喜欢的呈现感觉</span>
            <select
              v-model="form.presentationPreference"
              name="presentationPreference"
            >
              <option value="unspecified">都可以</option>
              <option value="feminine">偏柔和</option>
              <option value="masculine">偏利落</option>
              <option value="androgynous">中性</option>
            </select>
          </label>
        </div>
      </details>

      <details class="profile-setup-step">
        <summary v-tactile>
          <span class="profile-setup-step__number profile-setup-step__number--mint">3</span>
          <span><b>最后补充你确定的头发条件</b><small>不知道就保持“暂不确定”，以后随时可以修改</small></span>
        </summary>
        <div class="profile-setup-step__body">
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
                placeholder="不确定可留空"
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
        </div>
      </details>

      <aside
        class="privacy-note"
        aria-label="照片与本地保存提醒"
      >
        <b>成年人及授权提醒</b>
        <p>后续如使用照片，只能使用成年人的本人照片，或已获照片本人明确授权的照片。</p>
        <p>档案仅保存在当前设备；清理浏览器数据、无痕模式或更换设备都可能导致丢失。</p>
      </aside>

      <button
        v-tactile
        class="submit-button"
        type="submit"
        :disabled="store.saving"
      >
        {{ store.saving ? '正在保存…' : store.profile ? '保存修改' : '保存档案' }}
      </button>

      <button
        v-if="store.profile"
        v-tactile
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

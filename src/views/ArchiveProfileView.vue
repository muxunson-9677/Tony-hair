<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { pageTitle } from '../config/brand'
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
import type {
  GenderIdentity,
  HairDensity,
  HairProfilePhoto,
  HairTexture,
  PresentationPreference,
  StrandThickness,
  WashFrequency,
} from '../features/archive/types'
import {
  ImagePreparationError,
  prepareLocalImage,
} from '../features/images/prepareLocalImage'
import OptionCards, { type OptionCardOption } from '../ui/OptionCards.vue'
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

// 看图选择：每个靠眼睛判断的条件都画出来，文字只做确认。
const genderOptions: readonly OptionCardOption<GenderIdentity>[] = [
  { value: 'woman', label: '女' },
  { value: 'man', label: '男' },
  { value: 'nonbinary', label: '其他' },
  { value: 'unspecified', label: '不透露' },
]

const feelOptions: readonly OptionCardOption<PresentationPreference>[] = [
  { value: 'feminine', label: '柔和一点', hint: '线条圆润，看着温柔', art: 'feel-soft' },
  { value: 'masculine', label: '利落一点', hint: '线条干净，看着精神', art: 'feel-sharp' },
  { value: 'androgynous', label: '中性都行', hint: '不偏向哪一边', art: 'feel-neutral' },
  { value: 'unspecified', label: '都可以', hint: '两种都帮我看看', art: 'feel-any' },
]

const textureOptions: readonly OptionCardOption<HairTexture>[] = [
  { value: 'straight', label: '直发', hint: '自然垂下来', art: 'texture-straight' },
  { value: 'wavy', label: '有点弯', hint: '自然的弯度', art: 'texture-wavy' },
  { value: 'curly', label: '卷发', hint: '一圈一圈', art: 'texture-curly' },
  { value: 'coily', label: '小卷很密', hint: '卷得很紧', art: 'texture-coily' },
  { value: 'unsure', label: '暂不确定', art: 'unsure' },
]

const thicknessOptions: readonly OptionCardOption<StrandThickness>[] = [
  { value: 'fine', label: '发丝细', hint: '摸起来软', art: 'thickness-fine' },
  { value: 'medium', label: '不粗不细', art: 'thickness-medium' },
  { value: 'coarse', label: '发丝粗', hint: '摸起来硬', art: 'thickness-coarse' },
  { value: 'unsure', label: '暂不确定', art: 'unsure' },
]

const densityOptions: readonly OptionCardOption<HairDensity>[] = [
  { value: 'low', label: '发量偏少', art: 'density-low' },
  { value: 'medium', label: '发量正常', art: 'density-medium' },
  { value: 'high', label: '发量很多', art: 'density-high' },
  { value: 'unsure', label: '暂不确定', art: 'unsure' },
]

const washOptions: readonly OptionCardOption<WashFrequency>[] = [
  { value: 'daily', label: '每天洗', art: 'wash-daily' },
  { value: 'every_other_day', label: '隔天洗', art: 'wash-alternate' },
  { value: 'two_to_three_per_week', label: '一周两三次', art: 'wash-two-three' },
  { value: 'weekly_or_less', label: '更少', art: 'wash-weekly' },
  { value: 'unsure', label: '暂不确定', art: 'unsure' },
]

type StylingBucket = 'none' | 'five' | 'ten' | 'twenty' | 'unsure'

const stylingOptions: readonly OptionCardOption<StylingBucket>[] = [
  { value: 'none', label: '基本不打理', hint: '洗完自然干', art: 'time-none' },
  { value: 'five', label: '5 分钟内', hint: '简单吹一下', art: 'time-five' },
  { value: 'ten', label: '10 分钟左右', hint: '吹个造型', art: 'time-ten' },
  { value: 'twenty', label: '20 分钟以上', hint: '认真做造型', art: 'time-twenty' },
  { value: 'unsure', label: '暂不确定', art: 'unsure' },
]

const STYLING_BUCKET_MINUTES: Record<StylingBucket, number | null> = {
  none: 0,
  five: 5,
  ten: 10,
  twenty: 25,
  unsure: null,
}

const stylingBucket = computed<StylingBucket>(() => {
  const minutes = form.stylingMinutes
  if (minutes === null || minutes === undefined) return 'unsure'
  if (minutes <= 0) return 'none'
  if (minutes <= 7) return 'five'
  if (minutes <= 14) return 'ten'
  return 'twenty'
})

const setStylingBucket = (bucket: StylingBucket) => {
  form.stylingMinutes = STYLING_BUCKET_MINUTES[bucket]
}

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
    document.title = pageTitle('编辑发型档案')
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
        我的头发信息 · 仅保存在本机
      </p>
      <h1
        id="profile-form-title"
        :aria-label="store.profile ? '编辑发型档案' : '建立发型档案'"
      >
        {{ store.profile ? '我的头发' : '先认识一下我的头发' }}
      </h1>
      <p>一张正面照，加上你确定的几件事就够了。</p>
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

          <button
            v-if="!store.profile"
            v-tactile
            class="submit-button profile-minimum-submit"
            type="submit"
            aria-label="保存档案"
            :disabled="store.saving || Boolean(processingPhotoAngle)"
          >
            {{ store.saving ? '正在保存…' : '先保存，其他以后再补' }}
          </button>
          <p
            v-if="!store.profile"
            class="profile-minimum-hint"
          >
            下面都可以跳过。保存后就能开始选发型。
          </p>
        </div>
      </details>

      <details class="profile-setup-step">
        <summary v-tactile>
          <span class="profile-setup-step__number profile-setup-step__number--coral">2</span>
          <span><b>再告诉我你想呈现的感觉</b><small>性别可以不透露，真正用于排序的是呈现偏好</small></span>
        </summary>
        <div class="profile-setup-step__body">
          <OptionCards
            legend="想要哪种感觉的发型？"
            note="不用懂发型词，选一个看着顺眼的就行。"
            name="presentationPreference"
            :model-value="form.presentationPreference ?? 'unspecified'"
            :options="feelOptions"
            @update:model-value="(value) => { form.presentationPreference = value }"
          />
          <OptionCards
            legend="性别"
            note="只用来筛选发型，可以不透露。"
            name="genderIdentity"
            :model-value="form.genderIdentity ?? 'unspecified'"
            :options="genderOptions"
            @update:model-value="(value) => { form.genderIdentity = value }"
          />
        </div>
      </details>

      <details class="profile-setup-step">
        <summary v-tactile>
          <span class="profile-setup-step__number profile-setup-step__number--mint">3</span>
          <span><b>最后补充你确定的头发条件</b><small>不知道就保持“暂不确定”，以后随时可以修改</small></span>
        </summary>
        <div class="profile-setup-step__body">
          <OptionCards
            v-model="form.hairTexture"
            legend="你的头发平时是什么样？"
            name="hairTexture"
            :options="textureOptions"
          />

          <OptionCards
            v-model="form.strandThickness"
            legend="单根头发摸起来？"
            name="strandThickness"
            :options="thicknessOptions"
          />

          <OptionCards
            v-model="form.density"
            legend="头发整体多不多？"
            name="density"
            :options="densityOptions"
          />

          <OptionCards
            v-model="form.washFrequency"
            legend="多久洗一次头？"
            name="washFrequency"
            :options="washOptions"
          />

          <OptionCards
            legend="每天愿意花多久打理头发？"
            name="stylingBucket"
            :model-value="stylingBucket"
            :options="stylingOptions"
            @update:model-value="setStylingBucket"
          />

          <label>
            <span>还有什么想提前说的？</span>
            <textarea
              v-model="form.preferenceNotes"
              name="preferenceNotes"
              rows="4"
              maxlength="500"
              placeholder="例如：希望露耳；两侧不要推太短"
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
        v-if="store.profile"
        v-tactile
        class="submit-button"
        type="submit"
        :disabled="store.saving"
      >
        {{ store.saving ? '正在保存…' : '保存修改' }}
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

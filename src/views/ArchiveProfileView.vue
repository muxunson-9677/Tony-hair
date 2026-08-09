<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  useArchiveStore,
  type HairProfileDraft,
} from '../features/archive/archiveStore'

const router = useRouter()
const store = useArchiveStore()
const initializing = ref(true)

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
  const saved = await store.saveProfile(form)
  if (saved) {
    await router.push('/archive')
  }
}

const deleteProfile = async () => {
  const profile = store.profile
  if (
    !profile
    || !window.confirm('删除档案会同时删除全部发型计划和历史记录，且无法恢复。确定删除吗？')
  ) {
    return
  }

  if (await store.deleteProfile(profile.id)) {
    await router.push('/archive')
  }
}

onMounted(async () => {
  await store.load()
  populateForm()
  initializing.value = false
})
</script>

<template>
  <section
    class="archive-form-view"
    aria-labelledby="profile-form-title"
  >
    <RouterLink
      class="back-link"
      to="/archive"
    >
      <span aria-hidden="true">←</span> 返回档案
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

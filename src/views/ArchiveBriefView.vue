<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { pageTitle } from '../config/brand'
import { useRoute, useRouter } from 'vue-router'

import { useArchiveStore } from '../features/archive/archiveStore'
import { buildBarberLayers } from '../features/archive/barberLayers'
import * as briefExport from '../features/archive/briefExport'
import { buildBriefListDefaults } from '../features/archive/briefMemory'
import { resolveCandidateImageBlob } from '../features/archive/candidateSources'
import BriefStage from '../features/archive/components/BriefStage.vue'
import { isValidPlanCandidateCount } from '../features/archive/types'
import type { Candidate } from '../features/archive/types'
import { curatedHairstyles } from '../features/hairstyle-library/curatedCatalog'
import OfflineReadinessNote from '../features/offline/OfflineReadinessNote.vue'
import { tactileDirective as vTactile } from '../ui/tactile'
import { useScreenWakeLock } from '../ui/useScreenWakeLock'

const route = useRoute()
const router = useRouter()
const store = useArchiveStore()
const planId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const isBarberMode = computed(() => route.name === 'archive-plan-brief-show')
const plan = computed(() => store.plans.find(({ id }) => id === planId.value))
const candidates = computed(() => store.candidatesByPlanId[planId.value] ?? [])
const savedBrief = computed(() => store.briefsByPlanId[planId.value])
const candidateObjectUrls = ref<Record<string, string>>({})
const hasValidCandidateCount = computed(() => Boolean(
  plan.value && isValidPlanCandidateCount(plan.value.mode, candidates.value.length),
))

const targetCandidateId = ref('')
const backupCandidateId = ref('')
const overall = ref('')
const top = ref('')
const fringe = ref('')
const sides = ref('')
const sideburns = ref('')
const back = ref('')
const topPriorities = ref([''])
const absoluteAvoids = ref([''])
const message = ref<string | null>(null)
const messageTone = ref<'success' | 'error' | null>(null)
const exporting = ref(false)
const hydrated = ref(false)
let viewActive = false

const targetCandidate = computed(() => (
  candidates.value.find(({ id }) => id === targetCandidateId.value)
))
const backupCandidate = computed(() => (
  candidates.value.find(({ id }) => id === backupCandidateId.value)
))
const candidateImageSource = (candidate?: Candidate) => {
  if (!candidate) {
    return ''
  }
  return candidate.demoImagePath ?? candidateObjectUrls.value[candidate.id] ?? ''
}
const targetImageSource = computed(() => candidateImageSource(targetCandidate.value))
const targetImageBlob = computed(() => targetCandidate.value
  ? resolveCandidateImageBlob(targetCandidate.value, store.photosByRecordId)
  : undefined)
const legacyTargetMissing = computed(() => Boolean(
  savedBrief.value && !savedBrief.value.targetCandidateId,
))

// 主图展示台：本步只开放「参考原图」，状态位为 AI 效果图/日常状态预留（不实现、不显示）。
const stageStateId = ref('reference')
const stageStates = computed(() => [{
  id: 'reference',
  label: '参考原图',
  imageSource: targetImageSource.value || undefined,
  imageAlt: `${targetCandidate.value?.name ?? '目标候选'}目标参考图`,
  available: true,
}])

// 三层阅读结构（V4 4.1）：正面 ≤1 图 + 7 条信息；第 2 层 3+3；其余折叠。
const barberLayers = computed(() => buildBarberLayers({
  planTitle: plan.value?.title ?? '',
  targetName: targetCandidate.value?.name,
  backupName: backupCandidate.value?.name,
  topPriorities: topPriorities.value,
  absoluteAvoids: absoluteAvoids.value,
  sections: [
    { label: '整体', text: overall.value },
    { label: '顶部', text: top.value },
    { label: '刘海', text: fringe.value },
    { label: '两侧', text: sides.value },
    { label: '鬓角', text: sideburns.value },
    { label: '后脑', text: back.value },
  ],
}))
const barberFaceLines = computed(() => barberLayers.value.face.infoItems.slice(1, -1))
const barberConfirmLine = computed(() => barberLayers.value.face.infoItems.at(-1) ?? '')

// 现场模式自动保持屏幕常亮；编辑模式不占用锁。
const wakeLock = useScreenWakeLock({ auto: () => isBarberMode.value })
watch(isBarberMode, (barber) => {
  if (barber) {
    void wakeLock.request()
  } else {
    void wakeLock.release()
  }
})

const revokeCandidateUrls = () => {
  Object.values(candidateObjectUrls.value).forEach((url) => URL.revokeObjectURL(url))
  candidateObjectUrls.value = {}
}

const buildCandidateUrls = () => {
  revokeCandidateUrls()
  candidateObjectUrls.value = Object.fromEntries(candidates.value.flatMap((candidate) => {
    const image = resolveCandidateImageBlob(candidate, store.photosByRecordId)
    return image ? [[candidate.id, URL.createObjectURL(image)]] : []
  }))
}

const hydrate = () => {
  const current = savedBrief.value
  const requestedTargetId = typeof route.query.target === 'string' ? route.query.target : ''
  const availableTarget = candidates.value.find(({ id }) => id === current?.targetCandidateId)
    ?? candidates.value.find(({ id }) => id === requestedTargetId)
    ?? candidates.value[0]
  const catalogStyle = availableTarget?.source === 'demo_ai'
    ? curatedHairstyles.find(({ coverImage }) => coverImage === availableTarget.demoImagePath)
    : undefined
  const guide = catalogStyle?.barberGuide
  const profileNote = store.profile?.preferenceNotes.trim() ?? ''
  // 新 Tony卡默认值：有记忆快照时只用计划确认保留的记忆；
  // 无快照旧计划兜底回全局活动避雷合并（修订 1）。
  const listDefaults = buildBriefListDefaults({
    planMemoryItems: store.planMemoryByPlanId[planId.value] ?? [],
    guideTopPriorities: guide?.topPriorities ?? [],
    guideAbsoluteAvoids: guide?.absoluteAvoids ?? [],
    activeAvoidTexts: store.avoidRules.filter(({ active }) => active).map(({ text }) => text),
  })
  targetCandidateId.value = availableTarget?.id ?? ''
  backupCandidateId.value = candidates.value.some(({ id }) => id === current?.backupCandidateId)
    && current?.backupCandidateId !== availableTarget?.id
    ? current?.backupCandidateId ?? ''
    : ''
  overall.value = current?.overall ?? [guide?.overall, profileNote].filter(Boolean).join('；')
  top.value = current?.top ?? guide?.top ?? ''
  fringe.value = current?.fringe ?? guide?.fringe ?? ''
  sides.value = current?.sides ?? guide?.sides ?? ''
  sideburns.value = current?.sideburns ?? guide?.sideburns ?? ''
  back.value = current?.back ?? guide?.back ?? ''
  topPriorities.value = current?.topPriorities.length
    ? [...current.topPriorities]
    : [...listDefaults.topPriorities]
  absoluteAvoids.value = current?.absoluteAvoids.length
    ? [...current.absoluteAvoids]
    : [...listDefaults.absoluteAvoids]
  if (topPriorities.value.length === 0) topPriorities.value = ['']
  if (absoluteAvoids.value.length === 0) absoluteAvoids.value = ['']
}

const addItem = (items: string[]) => {
  if (items.length < 3) {
    items.push('')
  }
}

const removeItem = (items: string[], index: number) => {
  if (items.length > 1) {
    items.splice(index, 1)
  }
}

const save = async () => {
  message.value = null
  messageTone.value = null
  const saved = await store.saveBrief(planId.value, {
    targetCandidateId: targetCandidateId.value,
    backupCandidateId: backupCandidateId.value || undefined,
    overall: overall.value,
    top: top.value,
    fringe: fringe.value,
    sides: sides.value,
    sideburns: sideburns.value,
    back: back.value,
    topPriorities: topPriorities.value,
    absoluteAvoids: absoluteAvoids.value,
  })
  if (!saved) {
    message.value = store.error
    messageTone.value = 'error'
    return
  }
  hydrate()
  message.value = 'Tony卡已保存在当前设备，到店直接打开。'
  messageTone.value = 'success'
  document.title = pageTitle(`编辑Tony卡`)
  // 请求持久存储，降低系统清理 IndexedDB 导致 Tony卡丢失的概率；拒绝则静默。
  try {
    void navigator.storage?.persist?.().catch(() => {})
  } catch {
    // 旧内核没有 storage API：忽略。
  }
}

const exportPng = async () => {
  const currentPlan = plan.value
  const candidate = targetCandidate.value
  if (!currentPlan || !candidate || (!targetImageBlob.value && !targetImageSource.value)) {
    message.value = '目标候选没有可导出的本地图片。'
    messageTone.value = 'error'
    return
  }

  exporting.value = true
  message.value = null
  messageTone.value = null
  try {
    await briefExport.exportBriefPng({
      planTitle: currentPlan.title,
      candidateName: candidate.name,
      imageSource: targetImageBlob.value ?? targetImageSource.value,
      overall: overall.value,
      top: top.value,
      fringe: fringe.value,
      sides: sides.value,
      sideburns: sideburns.value,
      back: back.value,
      topPriorities: topPriorities.value,
      absoluteAvoids: absoluteAvoids.value,
    })
    message.value = 'PNG 已生成并开始下载。'
    messageTone.value = 'success'
  } catch {
    message.value = '导出失败，没有创建 PNG 文件。请稍后重试。'
    messageTone.value = 'error'
  } finally {
    exporting.value = false
  }
}

const printBrief = () => {
  message.value = null
  messageTone.value = null
  try {
    window.print()
  } catch {
    message.value = '打印窗口打开失败，请稍后重试。'
    messageTone.value = 'error'
  }
}

const deleteBrief = async () => {
  const currentPlan = plan.value
  if (
    !savedBrief.value
    || !currentPlan
    || !window.confirm(`确定删除“${currentPlan.title}”的Tony卡吗？计划与候选仍会保留。`)
  ) {
    return
  }
  if (await store.deleteBrief(planId.value)) {
    await router.push(`/archive/plans/${planId.value}`)
  } else {
    message.value = store.error
    messageTone.value = 'error'
  }
}

onMounted(async () => {
  viewActive = true
  await store.load()
  if (!viewActive) return
  buildCandidateUrls()
  hydrate()
  hydrated.value = true
  if (plan.value) {
    document.title = isBarberMode.value
      ? pageTitle('给理发师看')
      : pageTitle(`${savedBrief.value ? '编辑' : '创建'}Tony卡`)
  }
})
onBeforeUnmount(() => {
  viewActive = false
  revokeCandidateUrls()
})
</script>

<template>
  <section
    :class="['brief-view', { 'brief-view--barber': isBarberMode }]"
    :aria-labelledby="store.loading || !hydrated || (store.error && !message) ? 'brief-state-title' : plan ? 'brief-title' : 'brief-missing-title'"
  >
    <div
      v-if="!isBarberMode"
      class="brief-screen-only"
    >
      <RouterLink
        v-tactile
        class="back-link"
        :to="`/archive/plans/${planId}`"
      >
        <span aria-hidden="true">←</span> 返回计划
      </RouterLink>

      <div v-if="store.loading || !hydrated">
        <h1 id="brief-state-title">
          Tony卡
        </h1>
        <p
          class="archive-loading"
          role="status"
        >
          正在读取本地Tony卡…
        </p>
      </div>

      <div v-else-if="store.error && !message">
        <h1 id="brief-state-title">
          暂时无法读取Tony卡
        </h1>
        <p
          class="form-alert"
          role="alert"
        >
          {{ store.error }}
        </p>
      </div>

      <div
        v-else-if="!plan"
        class="archive-empty archive-empty--inner"
      >
        <h1 id="brief-missing-title">
          没有找到这个计划
        </h1>
        <p>它可能已被删除，或这台设备没有保存过它。</p>
        <RouterLink
          v-tactile
          class="text-link"
          to="/archive"
        >
          返回档案
        </RouterLink>
      </div>

      <div
        v-else-if="!hasValidCandidateCount"
        class="archive-empty archive-empty--inner"
      >
        <h1 id="brief-title">
          这个计划不能创建Tony卡
        </h1>
        <p>{{ plan.mode === 'repeat' ? '复刻计划需要保留 1 个标准发型快照。' : '探索计划需要保留 2—4 个候选。' }}旧数据不会被删除，请先返回计划确认。</p>
      </div>

      <template v-else>
        <header class="inner-header brief-header">
          <p class="eyebrow">
            给理发师看的话 · 仅保存在本机
          </p>
          <h1 id="brief-title">
            <span class="visually-hidden">{{ savedBrief ? '编辑Tony卡' : '创建Tony卡' }}</span>
            <span aria-hidden="true">给理发师看</span>
          </h1>
          <p>{{ plan.title }} · 主图、最在意和绝对不要，十秒说清。</p>
        </header>

        <aside
          class="privacy-note brief-local-note"
          aria-label="本地存储说明"
        >
          <b>仅保存在当前设备</b>
          <p>不上传、不创建账号、不同步。清理浏览器数据、无痕模式或更换设备，都可能让Tony卡丢失。</p>
        </aside>

        <p
          v-if="legacyTargetMissing"
          class="legacy-brief-note"
        >
          旧版Tony卡未记录目标候选，已预选计划中的第一项；保存后才会更新。
        </p>

        <p
          v-if="message"
          :class="messageTone === 'success' ? 'form-status' : 'form-alert'"
          :role="messageTone === 'success' ? 'status' : 'alert'"
        >
          {{ message }}
        </p>

        <form
          class="archive-form brief-form"
          @submit.prevent="save"
        >
          <fieldset class="brief-target-picker">
            <legend>先定主方案</legend>
            <div>
              <label
                v-for="candidate in candidates"
                :key="candidate.id"
                v-tactile
                :class="{ 'brief-target-option--selected': targetCandidateId === candidate.id }"
              >
                <input
                  v-model="targetCandidateId"
                  type="radio"
                  name="targetCandidate"
                  :value="candidate.id"
                  :aria-label="`目标候选：${candidate.name}`"
                >
                <img
                  v-if="candidateImageSource(candidate)"
                  :src="candidateImageSource(candidate)"
                  :alt="`${candidate.name}候选图`"
                >
                <span
                  v-else
                  class="brief-target-placeholder"
                >无可用图片</span>
                <b>{{ candidate.name }}</b>
              </label>
            </div>
            <label class="brief-backup-picker">
              <span>备选方案（可选）</span>
              <select
                v-model="backupCandidateId"
                aria-label="备选方案"
              >
                <option value="">不设置备选</option>
                <option
                  v-for="candidate in candidates.filter(({ id }) => id !== targetCandidateId)"
                  :key="candidate.id"
                  :value="candidate.id"
                >
                  {{ candidate.name }}
                </option>
              </select>
              <small>到店发现主方案不适合时，可以立刻切换，不必重新找图。</small>
            </label>
          </fieldset>

          <details class="brief-edit-details">
            <summary v-tactile>
              <span>需要修改时展开</span>
              <small>已根据主方案、个人偏好和避雷规则生成草稿</small>
            </summary>

            <div class="brief-section-fields">
              <label>
                <span>整体</span>
                <textarea
                  v-model="overall"
                  required
                />
              </label>
              <label>
                <span>顶部</span>
                <textarea
                  v-model="top"
                  required
                />
              </label>
              <label>
                <span>刘海</span>
                <textarea
                  v-model="fringe"
                  required
                />
              </label>
              <label>
                <span>两侧</span>
                <textarea
                  v-model="sides"
                  required
                />
              </label>
              <label>
                <span>鬓角</span>
                <textarea
                  v-model="sideburns"
                  required
                />
              </label>
              <label>
                <span>后脑</span>
                <textarea
                  v-model="back"
                  required
                />
              </label>
            </div>

            <fieldset class="brief-list-editor">
              <legend>最在意</legend>
              <p>保留 1—3 条，空白内容不会保存。</p>
              <div
                v-for="(_, index) in topPriorities"
                :key="`priority-${index}`"
                class="brief-list-row"
              >
                <label>
                  <span>最在意 {{ index + 1 }}</span>
                  <input
                    v-model="topPriorities[index]"
                    required
                  >
                </label>
                <button
                  v-tactile
                  type="button"
                  :aria-label="`删除最在意 ${index + 1}`"
                  :disabled="topPriorities.length === 1"
                  @click="removeItem(topPriorities, index)"
                >
                  删除
                </button>
              </div>
              <button
                v-tactile
                class="brief-add-button"
                type="button"
                :disabled="topPriorities.length >= 3"
                @click="addItem(topPriorities)"
              >
                添加最在意
              </button>
            </fieldset>

            <fieldset class="brief-list-editor brief-list-editor--avoid">
              <legend>绝对不要</legend>
              <p>保留 1—3 条，明确说出不可接受的结果。</p>
              <div
                v-for="(_, index) in absoluteAvoids"
                :key="`avoid-${index}`"
                class="brief-list-row"
              >
                <label>
                  <span>绝对不要 {{ index + 1 }}</span>
                  <input
                    v-model="absoluteAvoids[index]"
                    required
                  >
                </label>
                <button
                  v-tactile
                  type="button"
                  :aria-label="`删除绝对不要 ${index + 1}`"
                  :disabled="absoluteAvoids.length === 1"
                  @click="removeItem(absoluteAvoids, index)"
                >
                  删除
                </button>
              </div>
              <button
                v-tactile
                class="brief-add-button"
                type="button"
                :disabled="absoluteAvoids.length >= 3"
                @click="addItem(absoluteAvoids)"
              >
                添加绝对不要
              </button>
            </fieldset>
          </details>

          <button
            v-tactile
            class="submit-button"
            type="submit"
            :aria-label="savedBrief ? '保存修改' : '保存Tony卡'"
            :disabled="store.saving"
          >
            {{ savedBrief ? '保存修改' : '准备好给理发师看' }}
          </button>
        </form>

        <OfflineReadinessNote v-if="savedBrief" />

        <div class="brief-output-actions">
          <RouterLink
            v-if="savedBrief"
            v-tactile
            class="brief-barber-mode-link"
            :to="`/archive/plans/${planId}/brief/show`"
          >
            到店打开
          </RouterLink>
          <RouterLink
            v-if="savedBrief"
            v-tactile
            class="text-link"
            :to="`/archive/share?plan=${planId}`"
          >
            分享Tony卡
          </RouterLink>
          <button
            v-tactile
            type="button"
            :disabled="exporting || !targetImageSource"
            @click="exportPng"
          >
            {{ exporting ? '正在导出…' : '导出 PNG' }}
          </button>
          <button
            v-tactile
            type="button"
            @click="printBrief"
          >
            打印Tony卡
          </button>
        </div>

        <button
          v-if="savedBrief"
          v-tactile
          class="danger-button"
          type="button"
          :disabled="store.saving"
          @click="deleteBrief"
        >
          删除Tony卡
        </button>
      </template>
    </div>

    <nav
      v-if="isBarberMode && savedBrief"
      class="brief-barber-toolbar brief-screen-only"
      aria-label="理发现场操作"
    >
      <RouterLink
        v-tactile
        :to="`/archive/plans/${planId}/brief`"
      >
        完成
      </RouterLink>
      <button
        v-tactile
        type="button"
        :disabled="exporting || !targetImageSource"
        @click="exportPng"
      >
        {{ exporting ? '保存中…' : '保存图片备用' }}
      </button>
    </nav>

    <div
      v-if="isBarberMode && savedBrief"
      class="brief-barber-status brief-screen-only"
    >
      <OfflineReadinessNote />
      <p
        class="brief-wake-status"
        role="status"
        data-testid="wake-lock-status"
      >
        {{ wakeLock.active.value
          ? '✓ 屏幕保持常亮中'
          : '这台设备不能自动常亮，建议先调长自动锁屏时间' }}
      </p>
    </div>

    <article
      v-if="plan && hasValidCandidateCount && (!isBarberMode || savedBrief)"
      class="brief-preview"
      role="region"
      aria-label="Tony卡预览"
    >
      <header class="brief-preview__header">
        <p>Tony宝 · 给理发师看</p>
        <h2>{{ plan.title }}</h2>
        <template v-if="isBarberMode">
          <span
            v-for="line in barberFaceLines"
            :key="line"
          >{{ line }}</span>
        </template>
        <template v-else>
          <span>目标方案 · {{ targetCandidate?.name ?? '请选择' }}</span>
          <span v-if="backupCandidate">备选 · {{ backupCandidate.name }}</span>
        </template>
      </header>
      <BriefStage
        v-model="stageStateId"
        :states="stageStates"
      />
      <div class="brief-preview__lists">
        <section>
          <h3>最在意</h3>
          <ol>
            <li
              v-for="(item, index) in isBarberMode ? barberLayers.focus.topPriorities : topPriorities"
              :key="`preview-priority-${index}`"
            >
              {{ item || '待填写' }}
            </li>
          </ol>
        </section>
        <section>
          <h3>绝对不要</h3>
          <ul>
            <li
              v-for="(item, index) in isBarberMode ? barberLayers.focus.absoluteAvoids : absoluteAvoids"
              :key="`preview-avoid-${index}`"
            >
              {{ item || '待填写' }}
            </li>
          </ul>
        </section>
      </div>
      <details
        :open="!isBarberMode"
        :class="['brief-preview__regional-details', { 'brief-barber-details': isBarberMode }]"
      >
        <summary
          v-if="isBarberMode"
          v-tactile
        >
          <span>查看顶部、刘海和侧后细节</span>
          <small>需要时再展开</small>
        </summary>
        <template v-if="isBarberMode">
          <dl class="brief-preview__sections">
            <div
              v-for="section in barberLayers.folded.sections"
              :key="section.label"
            >
              <dt>{{ section.label }}</dt><dd>{{ section.text }}</dd>
            </div>
          </dl>
          <div
            v-if="barberLayers.folded.overflowPriorities.length || barberLayers.folded.overflowAvoids.length"
            class="brief-preview__overflow"
          >
            <section v-if="barberLayers.folded.overflowPriorities.length">
              <h3>更多在意</h3>
              <ol>
                <li
                  v-for="(item, index) in barberLayers.folded.overflowPriorities"
                  :key="`overflow-priority-${index}`"
                >
                  {{ item }}
                </li>
              </ol>
            </section>
            <section v-if="barberLayers.folded.overflowAvoids.length">
              <h3>更多不要</h3>
              <ul>
                <li
                  v-for="(item, index) in barberLayers.folded.overflowAvoids"
                  :key="`overflow-avoid-${index}`"
                >
                  {{ item }}
                </li>
              </ul>
            </section>
          </div>
        </template>
        <dl
          v-else
          class="brief-preview__sections"
        >
          <div><dt>整体</dt><dd>{{ overall || '待填写' }}</dd></div>
          <div><dt>顶部</dt><dd>{{ top || '待填写' }}</dd></div>
          <div><dt>刘海</dt><dd>{{ fringe || '待填写' }}</dd></div>
          <div><dt>两侧</dt><dd>{{ sides || '待填写' }}</dd></div>
          <div><dt>鬓角</dt><dd>{{ sideburns || '待填写' }}</dd></div>
          <div><dt>后脑</dt><dd>{{ back || '待填写' }}</dd></div>
        </dl>
      </details>
      <footer>
        <b>请现场确认</b>
        <p>{{ isBarberMode && barberConfirmLine ? barberConfirmLine.replace('请现场确认：', '') : '请结合真实发质、发量与头型，再决定最终长度和层次。' }}</p>
      </footer>
    </article>
  </section>
</template>

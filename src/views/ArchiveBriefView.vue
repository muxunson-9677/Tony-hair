<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useArchiveStore } from '../features/archive/archiveStore'
import * as briefExport from '../features/archive/briefExport'
import type { Candidate } from '../features/archive/types'

const route = useRoute()
const router = useRouter()
const store = useArchiveStore()
const planId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const plan = computed(() => store.plans.find(({ id }) => id === planId.value))
const candidates = computed(() => store.candidatesByPlanId[planId.value] ?? [])
const savedBrief = computed(() => store.briefsByPlanId[planId.value])
const candidateObjectUrls = ref<Record<string, string>>({})

const targetCandidateId = ref('')
const overall = ref('')
const top = ref('')
const fringe = ref('')
const sides = ref('')
const sideburns = ref('')
const back = ref('')
const topPriorities = ref([''])
const absoluteAvoids = ref([''])
const message = ref<string | null>(null)
const exporting = ref(false)
const hydrated = ref(false)

const targetCandidate = computed(() => (
  candidates.value.find(({ id }) => id === targetCandidateId.value)
))
const candidateImageSource = (candidate?: Candidate) => {
  if (!candidate) {
    return ''
  }
  return candidate.demoImagePath ?? candidateObjectUrls.value[candidate.id] ?? ''
}
const targetImageSource = computed(() => candidateImageSource(targetCandidate.value))
const legacyTargetMissing = computed(() => Boolean(
  savedBrief.value && !savedBrief.value.targetCandidateId,
))

const revokeCandidateUrls = () => {
  Object.values(candidateObjectUrls.value).forEach((url) => URL.revokeObjectURL(url))
  candidateObjectUrls.value = {}
}

const buildCandidateUrls = () => {
  revokeCandidateUrls()
  candidateObjectUrls.value = Object.fromEntries(candidates.value.flatMap((candidate) => {
    const image = candidate.referenceImage
      ?? (candidate.pastRecordId
        ? store.photosByRecordId[candidate.pastRecordId]?.[0]?.image
        : undefined)
    return image ? [[candidate.id, URL.createObjectURL(image)]] : []
  }))
}

const hydrate = () => {
  const current = savedBrief.value
  const availableTarget = candidates.value.find(({ id }) => id === current?.targetCandidateId)
    ?? candidates.value[0]
  targetCandidateId.value = availableTarget?.id ?? ''
  overall.value = current?.overall ?? ''
  top.value = current?.top ?? ''
  fringe.value = current?.fringe ?? ''
  sides.value = current?.sides ?? ''
  sideburns.value = current?.sideburns ?? ''
  back.value = current?.back ?? ''
  topPriorities.value = current?.topPriorities.length ? [...current.topPriorities] : ['']
  absoluteAvoids.value = current?.absoluteAvoids.length ? [...current.absoluteAvoids] : ['']
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
  const saved = await store.saveBrief(planId.value, {
    targetCandidateId: targetCandidateId.value,
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
    return
  }
  hydrate()
  message.value = '沟通卡已保存在当前设备。'
  document.title = `编辑理发师沟通卡｜咋剪发`
}

const exportPng = async () => {
  const currentPlan = plan.value
  const candidate = targetCandidate.value
  if (!currentPlan || !candidate || !targetImageSource.value) {
    message.value = '目标候选没有可导出的本地图片。'
    return
  }

  exporting.value = true
  message.value = null
  try {
    await briefExport.exportBriefPng({
      planTitle: currentPlan.title,
      candidateName: candidate.name,
      imageSource: targetImageSource.value,
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
  } catch {
    message.value = '导出失败，没有创建 PNG 文件。请稍后重试。'
  } finally {
    exporting.value = false
  }
}

const printBrief = () => {
  message.value = null
  try {
    window.print()
  } catch {
    message.value = '打印窗口打开失败，请稍后重试。'
  }
}

const deleteBrief = async () => {
  const currentPlan = plan.value
  if (
    !savedBrief.value
    || !currentPlan
    || !window.confirm(`确定删除“${currentPlan.title}”的沟通卡吗？计划与候选仍会保留。`)
  ) {
    return
  }
  if (await store.deleteBrief(planId.value)) {
    await router.push(`/archive/plans/${planId.value}`)
  } else {
    message.value = store.error
  }
}

onMounted(async () => {
  await store.load()
  buildCandidateUrls()
  hydrate()
  hydrated.value = true
  if (plan.value) {
    document.title = `${savedBrief.value ? '编辑' : '创建'}理发师沟通卡｜咋剪发`
  }
})
onBeforeUnmount(revokeCandidateUrls)
</script>

<template>
  <section
    class="brief-view"
    :aria-labelledby="store.loading || !hydrated || (store.error && !message) ? 'brief-state-title' : plan ? 'brief-title' : 'brief-missing-title'"
  >
    <div class="brief-screen-only">
      <RouterLink
        class="back-link"
        :to="`/archive/plans/${planId}`"
      >
        <span aria-hidden="true">←</span> 返回计划
      </RouterLink>

      <div v-if="store.loading || !hydrated">
        <h1 id="brief-state-title">
          理发师沟通卡
        </h1>
        <p
          class="archive-loading"
          role="status"
        >
          正在读取本地沟通卡…
        </p>
      </div>

      <div v-else-if="store.error && !message">
        <h1 id="brief-state-title">
          暂时无法读取沟通卡
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
          class="text-link"
          to="/archive"
        >
          返回档案
        </RouterLink>
      </div>

      <div
        v-else-if="candidates.length < 2 || candidates.length > 4"
        class="archive-empty archive-empty--inner"
      >
        <h1 id="brief-title">
          这个计划不能创建沟通卡
        </h1>
        <p>沟通卡需要计划中保留 2—4 个候选。旧数据不会被删除，请先返回计划确认。</p>
      </div>

      <template v-else>
        <header class="inner-header brief-header">
          <p class="eyebrow">
            BARBER BRIEF · LOCAL
          </p>
          <h1 id="brief-title">
            {{ savedBrief ? '编辑理发师沟通卡' : '创建理发师沟通卡' }}
          </h1>
          <p>{{ plan.title }} · 从候选图到六个部位，一次说清。</p>
        </header>

        <aside
          class="privacy-note brief-local-note"
          aria-label="本地存储说明"
        >
          <b>仅保存在当前设备</b>
          <p>不上传、不创建账号、不同步。清理浏览器数据、无痕模式或更换设备，都可能让沟通卡丢失。</p>
        </aside>

        <p
          v-if="legacyTargetMissing"
          class="legacy-brief-note"
        >
          旧版沟通卡未记录目标候选，已预选计划中的第一项；保存后才会更新。
        </p>

        <p
          v-if="message"
          class="form-alert"
          role="alert"
        >
          {{ message }}
        </p>

        <form
          class="archive-form brief-form"
          @submit.prevent="save"
        >
          <fieldset class="brief-target-picker">
            <legend>选择目标图</legend>
            <div>
              <label
                v-for="candidate in candidates"
                :key="candidate.id"
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
          </fieldset>

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
                type="button"
                :aria-label="`删除最在意 ${index + 1}`"
                :disabled="topPriorities.length === 1"
                @click="removeItem(topPriorities, index)"
              >
                删除
              </button>
            </div>
            <button
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
                type="button"
                :aria-label="`删除绝对不要 ${index + 1}`"
                :disabled="absoluteAvoids.length === 1"
                @click="removeItem(absoluteAvoids, index)"
              >
                删除
              </button>
            </div>
            <button
              class="brief-add-button"
              type="button"
              :disabled="absoluteAvoids.length >= 3"
              @click="addItem(absoluteAvoids)"
            >
              添加绝对不要
            </button>
          </fieldset>

          <button
            class="submit-button"
            type="submit"
            :disabled="store.saving"
          >
            {{ savedBrief ? '保存修改' : '保存沟通卡' }}
          </button>
        </form>

        <div class="brief-output-actions">
          <button
            type="button"
            :disabled="exporting || !targetImageSource"
            @click="exportPng"
          >
            {{ exporting ? '正在导出…' : '导出 PNG' }}
          </button>
          <button
            type="button"
            @click="printBrief"
          >
            打印沟通卡
          </button>
        </div>

        <button
          v-if="savedBrief"
          class="danger-button"
          type="button"
          :disabled="store.saving"
          @click="deleteBrief"
        >
          删除沟通卡
        </button>
      </template>
    </div>

    <article
      v-if="plan && candidates.length >= 2 && candidates.length <= 4"
      class="brief-preview"
      role="region"
      aria-label="理发师沟通卡预览"
    >
      <header class="brief-preview__header">
        <p>咋剪发 · BARBER BRIEF</p>
        <h2>{{ plan.title }}</h2>
        <span>目标方案 · {{ targetCandidate?.name ?? '请选择' }}</span>
      </header>
      <img
        v-if="targetImageSource"
        :src="targetImageSource"
        :alt="`${targetCandidate?.name ?? '目标候选'}目标参考图`"
      >
      <div
        v-else
        class="brief-preview__image-missing"
      >
        目标候选暂无可显示图片
      </div>
      <dl class="brief-preview__sections">
        <div><dt>整体</dt><dd>{{ overall || '待填写' }}</dd></div>
        <div><dt>顶部</dt><dd>{{ top || '待填写' }}</dd></div>
        <div><dt>刘海</dt><dd>{{ fringe || '待填写' }}</dd></div>
        <div><dt>两侧</dt><dd>{{ sides || '待填写' }}</dd></div>
        <div><dt>鬓角</dt><dd>{{ sideburns || '待填写' }}</dd></div>
        <div><dt>后脑</dt><dd>{{ back || '待填写' }}</dd></div>
      </dl>
      <div class="brief-preview__lists">
        <section>
          <h3>最在意</h3>
          <ol>
            <li
              v-for="(item, index) in topPriorities"
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
              v-for="(item, index) in absoluteAvoids"
              :key="`preview-avoid-${index}`"
            >
              {{ item || '待填写' }}
            </li>
          </ul>
        </section>
      </div>
      <footer>
        <b>请现场确认</b>
        <p>请结合真实发质、发量与头型，再决定最终长度和层次。</p>
      </footer>
    </article>
  </section>
</template>

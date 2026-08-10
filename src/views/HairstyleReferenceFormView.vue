<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  type RouteLocationNormalized,
  useRoute,
  useRouter,
} from 'vue-router'

import {
  ImagePreparationError,
  prepareLocalImage,
  type PreparedLocalImage,
} from '../features/images/prepareLocalImage'
import { useHairstyleLibraryStore } from '../features/hairstyle-library/libraryStore'

type ReferenceImagePreparer = (file: Blob) => Promise<PreparedLocalImage>

const route = useRoute()
const router = useRouter()
const store = useHairstyleLibraryStore()
const prepareImage = inject<ReferenceImagePreparer>('referenceImagePreparer', prepareLocalImage)

const isEditing = computed(() => route.name === 'style-reference-edit')
const referenceId = computed(() => isEditing.value && typeof route.params.id === 'string'
  ? route.params.id
  : null)
const reference = computed(() => referenceId.value
  ? store.getReference(referenceId.value)
  : undefined)
const heading = computed(() => isEditing.value ? '编辑私人参考' : '添加私人参考')
const submitLabel = computed(() => isEditing.value ? '保存修改' : '保存私人参考')
const unavailable = computed(() => (
  isEditing.value && store.initialized && !store.loading && !store.error && !reference.value
))

const name = ref('')
const notes = ref('')
const tagsText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const prepared = ref<PreparedLocalImage | null>(null)
const previewUrl = ref<string | null>(null)
const processing = ref(false)
const submitting = ref(false)
const localError = ref<string | null>(null)
let initializedReferenceId: string | null = null
let preparationGeneration = 0
let unmounted = false
let allowedRouteFullPath: string | null = null

const saveLocked = computed(() => submitting.value || store.saving)
const submitBusy = computed(() => processing.value || saveLocked.value)
const displayedError = computed(() => localError.value ?? store.error)

const releasePreview = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }
}

const showPreview = (blob: Blob) => {
  releasePreview()
  previewUrl.value = URL.createObjectURL(blob)
}

const initializeEdit = () => {
  const current = reference.value
  if (!current || initializedReferenceId === current.id) {
    return
  }
  initializedReferenceId = current.id
  name.value = current.name
  notes.value = current.notes
  tagsText.value = current.tags.join('，')
  showPreview(current.image)
}

watch(reference, initializeEdit, { immediate: true })

const clearSelection = () => {
  if (saveLocked.value) {
    return
  }
  preparationGeneration += 1
  processing.value = false
  prepared.value = null
  localError.value = null
  releasePreview()
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  if (reference.value) {
    showPreview(reference.value.image)
  }
}

const selectImage = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || saveLocked.value) {
    return
  }

  const generation = preparationGeneration + 1
  preparationGeneration = generation
  processing.value = true
  prepared.value = null
  localError.value = null
  releasePreview()

  try {
    const result = await prepareImage(file)
    if (unmounted || generation !== preparationGeneration) {
      return
    }
    prepared.value = result
    showPreview(result.blob)
  } catch (error) {
    if (unmounted || generation !== preparationGeneration) {
      return
    }
    localError.value = error instanceof ImagePreparationError
      ? error.message
      : '照片处理失败，请换一张后重试。'
  } finally {
    if (!unmounted && generation === preparationGeneration) {
      processing.value = false
    }
  }
}

const parseTags = () => {
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const rawTag of tagsText.value.split(/[,，\n]/u)) {
    const tag = rawTag.normalize('NFKC').trim()
    if (!tag) {
      continue
    }
    if (Array.from(tag).length > 12) {
      throw new RangeError('每个标签最多 12 个字。')
    }
    const key = tag.toLocaleLowerCase('zh-CN')
    if (!seen.has(key)) {
      seen.add(key)
      normalized.push(tag)
    }
  }
  if (normalized.length > 8) {
    throw new RangeError('最多填写 8 个标签。')
  }
  return normalized
}

const validateDetails = () => {
  const normalizedName = name.value.normalize('NFKC').trim()
  if (Array.from(normalizedName).length < 1 || Array.from(normalizedName).length > 40) {
    throw new RangeError('参考名称需填写 1—40 个字。')
  }
  const normalizedNotes = notes.value.normalize('NFKC')
  if (Array.from(normalizedNotes).length > 300) {
    throw new RangeError('备注最多 300 个字。')
  }
  return {
    name: normalizedName,
    notes: normalizedNotes,
    tags: parseTags(),
  }
}

const openSavedReference = async (id: string) => {
  const target = `/styles/references/${id}`
  allowedRouteFullPath = target
  try {
    await router.push(target)
    if (router.currentRoute.value.fullPath !== target) {
      await router.replace(target)
    }
  } finally {
    allowedRouteFullPath = null
  }
}

const submit = async () => {
  if (submitBusy.value || unavailable.value) {
    return
  }
  localError.value = null

  let details: ReturnType<typeof validateDetails>
  try {
    details = validateDetails()
  } catch (error) {
    localError.value = error instanceof Error ? error.message : '请检查填写内容。'
    return
  }

  if (!isEditing.value && !prepared.value) {
    localError.value = '请先选择并完成一张照片的本地处理。'
    return
  }

  submitting.value = true
  try {
    if (isEditing.value) {
      const id = referenceId.value
      if (!id || !reference.value) {
        return
      }
      const updated = prepared.value
        ? await store.updateReferenceWithImage(id, {
          ...details,
          image: prepared.value.blob,
          width: prepared.value.width,
          height: prepared.value.height,
          bytes: prepared.value.bytes,
          processedAt: prepared.value.processedAt,
        })
        : await store.updateReference(id, details)
      if (updated) {
        await openSavedReference(updated.id)
      }
      return
    }

    const image = prepared.value!
    const saved = await store.saveReference({
      ...details,
      image: image.blob,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      processedAt: image.processedAt,
    })
    if (saved) {
      await openSavedReference(saved.id)
    }
  } finally {
    submitting.value = false
  }
}

const loadLibrary = () => store.load()

onMounted(loadLibrary)

const guardSavingRoute = (to: RouteLocationNormalized) => (
  !submitting.value || to.fullPath === allowedRouteFullPath
)
onBeforeRouteLeave(guardSavingRoute)
onBeforeRouteUpdate(guardSavingRoute)

onBeforeUnmount(() => {
  unmounted = true
  preparationGeneration += 1
  releasePreview()
})
</script>

<template>
  <section
    class="style-reference-form-view"
    :aria-labelledby="unavailable ? 'reference-form-unavailable-title' : 'reference-form-title'"
  >
    <RouterLink
      class="style-reference-back"
      :to="isEditing && reference ? `/styles/references/${reference.id}` : '/styles/references'"
    >
      <span aria-hidden="true">←</span>
      我的参考
    </RouterLink>

    <header v-if="!unavailable">
      <p class="eyebrow">
        PRIVATE · ON THIS DEVICE
      </p>
      <h1 id="reference-form-title">
        {{ heading }}
      </h1>
      <p>照片先在当前设备纠正方向、压缩并清除元数据，原图和原文件名不会保存。</p>
    </header>

    <div
      v-if="store.loading && !store.initialized"
      class="reference-form-state"
      role="status"
    >
      正在读取本机参考…
    </div>

    <div
      v-else-if="store.error && !store.initialized"
      class="reference-form-state reference-form-state--error"
      role="alert"
    >
      <p>{{ store.error }}</p>
      <button
        type="button"
        @click="loadLibrary"
      >
        重试读取本机发型库
      </button>
    </div>

    <div
      v-else-if="unavailable"
      class="style-terminal style-terminal--embedded"
    >
      <p class="eyebrow">
        PRIVATE REFERENCE · UNAVAILABLE
      </p>
      <h1 id="reference-form-unavailable-title">
        这份私人参考找不到了
      </h1>
      <p>它可能已从当前设备删除。我们没有用其他照片替换它。</p>
      <RouterLink to="/styles/references">
        返回我的参考
      </RouterLink>
    </div>

    <form
      v-else-if="store.initialized && (!isEditing || reference)"
      class="style-reference-form"
      @submit.prevent="submit"
    >
      <fieldset :disabled="saveLocked">
        <legend>参考照片与说明</legend>

        <section
          class="reference-image-field"
          aria-labelledby="reference-image-title"
        >
          <div class="reference-image-field__copy">
            <h2 id="reference-image-title">
              {{ isEditing ? '参考照片' : '先选一张照片' }}
            </h2>
            <p>支持 JPEG、PNG、WebP。处理完成前不会写入本机发型库。</p>
          </div>

          <label class="reference-file-control">
            <span>{{ isEditing ? '替换私人参考照片' : '选择私人参考照片' }}</span>
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              :disabled="saveLocked"
              :aria-label="isEditing ? '选择私人参考照片' : undefined"
              @change="selectImage"
            >
          </label>

          <div
            v-if="processing"
            class="reference-processing"
            role="status"
          >
            <span aria-hidden="true" />
            正在本机处理照片…
          </div>

          <figure
            v-if="previewUrl"
            class="reference-preview"
          >
            <img
              :src="previewUrl"
              alt="处理后的私人参考预览"
            >
            <figcaption v-if="prepared">
              已处理 · {{ prepared.width }} × {{ prepared.height }} · {{ prepared.bytes }} B
            </figcaption>
            <figcaption v-else>
              当前本机保存的处理后照片
            </figcaption>
          </figure>

          <button
            v-if="processing || prepared || localError"
            class="reference-clear"
            type="button"
            @click="clearSelection"
          >
            清除所选照片
          </button>
        </section>

        <label>
          <span>参考名称</span>
          <input
            v-model="name"
            maxlength="40"
            required
            autocomplete="off"
          >
        </label>

        <label>
          <span>我的备注</span>
          <textarea
            v-model="notes"
            maxlength="300"
            rows="5"
            placeholder="只写你知道的内容，例如：喜欢耳侧长度；不要照搬颜色。"
          />
        </label>

        <label>
          <span>标签</span>
          <input
            v-model="tagsText"
            aria-label="标签"
            autocomplete="off"
            placeholder="通勤，短发，好打理"
          >
          <small>用逗号分隔，最多 8 个，每个最多 12 个字。</small>
        </label>

        <div
          v-if="displayedError"
          class="reference-form-error"
          role="alert"
        >
          {{ displayedError }}
        </div>

        <button
          class="reference-submit"
          type="submit"
          :disabled="submitBusy || (!isEditing && !prepared)"
        >
          <span>{{ submitting ? '正在保存到本机…' : submitLabel }}</span>
          <span aria-hidden="true">→</span>
        </button>
      </fieldset>
    </form>
  </section>
</template>

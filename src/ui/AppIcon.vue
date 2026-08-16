<script setup lang="ts">
defineProps<{
  readonly name:
    | 'home'
    | 'styles'
    | 'archive'
    | 'me'
    | 'search'
    | 'heart'
    | 'heart-filled'
    | 'filter'
    | 'upload'
    | 'eye'
    | 'back'
    | 'scissors'
    | 'photo'
    | 'edit'
    | 'trash'
    | 'check'
    | 'warning'
    | 'folder'
    | 'print'
}>()
</script>

<template>
  <svg
    :data-icon="name"
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="name === 'home'">
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" />
    </template>
    <template v-else-if="name === 'styles'">
      <rect
        x="3.5"
        y="4"
        width="7"
        height="7"
        rx="2"
      />
      <rect
        x="13.5"
        y="4"
        width="7"
        height="7"
        rx="2"
      />
      <rect
        x="3.5"
        y="14"
        width="7"
        height="6"
        rx="2"
      />
      <rect
        x="13.5"
        y="14"
        width="7"
        height="6"
        rx="2"
      />
    </template>
    <template v-else-if="name === 'archive'">
      <path d="M4 6.5h16v13H4z" />
      <path d="M3 3.5h18v3H3zM9 11h6" />
    </template>
    <template v-else-if="name === 'me'">
      <circle
        cx="12"
        cy="8"
        r="3.5"
      />
      <path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" />
    </template>
    <template v-else-if="name === 'search'">
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
      />
      <path d="m15.5 15.5 4.5 4.5" />
    </template>
    <template v-else-if="name === 'heart'">
      <path d="M20.5 8.8c0 5-8.5 10.2-8.5 10.2S3.5 13.8 3.5 8.8A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 8.5 1.1Z" />
    </template>
    <template v-else-if="name === 'heart-filled'">
      <path
        d="M20.5 8.8c0 5-8.5 10.2-8.5 10.2S3.5 13.8 3.5 8.8A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 8.5 1.1Z"
        fill="currentColor"
        stroke="none"
      />
    </template>
    <template v-else-if="name === 'filter'">
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle
        cx="9"
        cy="6"
        r="2"
        fill="currentColor"
        stroke="none"
      />
      <circle
        cx="15"
        cy="12"
        r="2"
        fill="currentColor"
        stroke="none"
      />
      <circle
        cx="7"
        cy="18"
        r="2"
        fill="currentColor"
        stroke="none"
      />
    </template>
    <template v-else-if="name === 'upload'">
      <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" />
      <path d="M5 13v7h14v-7" />
    </template>
    <template v-else-if="name === 'eye'">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle
        cx="12"
        cy="12"
        r="2.5"
      />
    </template>
    <template v-else-if="name === 'back'">
      <path d="m14.5 5-7 7 7 7" />
    </template>
    <template v-else-if="name === 'scissors'">
      <circle
        cx="6.5"
        cy="6.5"
        r="3"
      />
      <circle
        cx="6.5"
        cy="17.5"
        r="3"
      />
      <path d="m9 8 11 8M9 16l11-8" />
    </template>
    <template v-else-if="name === 'photo'">
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2.5"
      />
      <circle
        cx="8.5"
        cy="9"
        r="1.5"
      />
      <path d="m5 18 5-5 3.5 3 2.5-2 3 4" />
    </template>
    <template v-else-if="name === 'edit'">
      <path d="M4 20h4l11-11-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 3h6l1 4H8l1-4Z" />
      <path d="m7 7 1 14h8l1-14M10 11v6M14 11v6" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m5 12.5 4.2 4.2L19.5 6.5" />
    </template>
    <template v-else-if="name === 'warning'">
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17.5h.01" />
    </template>
    <template v-else-if="name === 'folder'">
      <path d="M3 6.5h7l2 2h9v11H3v-13Z" />
    </template>
    <template v-else-if="name === 'print'">
      <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5h18v5a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v7H7z" />
    </template>
  </svg>
</template>

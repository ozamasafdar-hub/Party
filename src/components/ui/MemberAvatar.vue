<script setup>
defineProps({
  member: { type: Object, required: true },
  size: { type: Number, default: 36 }
})
</script>

<template>
  <span
    class="member-avatar"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.38)}px`,
      background: member.avatarColor || '#94a3b8'
    }"
  >
    {{ member.initials }}
  </span>
</template>

<style scoped>
.member-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  color: #0b0f19;
  border: 2px solid rgba(255, 255, 255, 0.25);
  flex-shrink: 0;
  user-select: none;
}
</style>

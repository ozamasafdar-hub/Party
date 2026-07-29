<script setup>
/**
 * LoginView — standalone sign-in page (direct /login visits and redirects
 * from members-only routes like the profile). The map itself is public;
 * most sign-ins happen in the modal over the map instead.
 */
import { useRouter, useRoute } from 'vue-router'
import LoginPanel from '@/components/auth/LoginPanel.vue'

const router = useRouter()
const route = useRoute()

function onSuccess() {
  router.push(route.query.redirect || { name: 'map' })
}
</script>

<template>
  <div class="login">
    <div class="login__backdrop" aria-hidden="true" />
    <div class="login__card glass-panel">
      <LoginPanel @success="onSuccess" />
    </div>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
}

.login__backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 20% 15%, rgba(139, 21, 56, 0.35), transparent),
    radial-gradient(ellipse 50% 40% at 85% 80%, rgba(56, 189, 248, 0.12), transparent),
    radial-gradient(ellipse 40% 35% at 70% 20%, rgba(212, 175, 106, 0.14), transparent),
    var(--bg-900);
}

.login__card {
  position: relative;
  width: min(400px, 100%);
  padding: 36px 32px;
}
</style>

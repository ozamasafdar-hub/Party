import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = createRouter({
  // Hash history: works on any static host (GitHub Pages, artifact
  // sandboxes, S3) with no server-side rewrite rules needed
  history: createWebHashHistory(),
  routes: [
    {
      // The map is public — anyone can browse events. Joining, hosting,
      // and the profile are the members-only actions.
      path: '/',
      name: 'map',
      component: () => import('@/views/MapView.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue')
    },
    {
      path: '/profile/:id?',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// Members-only gate: every route flagged requiresAuth bounces to /login
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restoreSession()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'map' }
  }
  return true
})

export default router

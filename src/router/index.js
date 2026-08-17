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
      // Shared event links: /e/<id> opens the map with that event's card
      path: '/e/:id',
      name: 'event-link',
      component: () => import('@/views/MapView.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue')
    },
    {
      // Messages + alerts, a page of their own rather than panels over the map
      path: '/inbox',
      name: 'inbox',
      component: () => import('@/views/InboxView.vue'),
      meta: { requiresAuth: true }
    },
    {
      // Account, support and display preferences — the things that are
      // about you rather than about what's on tonight
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { requiresAuth: true }
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

  /**
   * Only the pages that gate on it wait for the answer.
   *
   * The map is public, and it used to sit behind this await like everything
   * else — so a slow or unreachable backend held up the very first render
   * and the app showed nothing at all. Kicking the restore off without
   * waiting lets the map paint immediately and the top bar fill in your
   * name a moment later, which is the ordinary way a page loads rather than
   * a failure. Guarded routes still need a real answer before they can
   * decide, so they still wait — bounded, in the store.
   */
  const needsAnswer = to.meta.requiresAuth || to.name === 'login'
  if (needsAnswer) await auth.restoreSession()
  else auth.restoreSession()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'map' }
  }
  return true
})

export default router

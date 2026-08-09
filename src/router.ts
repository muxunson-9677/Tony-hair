import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'

import ArchiveView from './views/ArchiveView.vue'
import HomeView from './views/HomeView.vue'
import MeView from './views/MeView.vue'
import TryView from './views/TryView.vue'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'home',
        component: HomeView,
      },
      {
        path: '/try',
        name: 'try',
        component: TryView,
      },
      {
        path: '/archive',
        name: 'archive',
        component: ArchiveView,
      },
      {
        path: '/me',
        name: 'me',
        component: MeView,
      },
    ],
  })
}

import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'

import ArchiveView from './views/ArchiveView.vue'
import ArchivePlanDetailView from './views/ArchivePlanDetailView.vue'
import ArchivePlanFormView from './views/ArchivePlanFormView.vue'
import ArchiveProfileView from './views/ArchiveProfileView.vue'
import HomeView from './views/HomeView.vue'
import MeView from './views/MeView.vue'
import NotFoundView from './views/NotFoundView.vue'
import TryView from './views/TryView.vue'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'home',
        component: HomeView,
        meta: { title: '咋剪发' },
      },
      {
        path: '/try',
        name: 'try',
        component: TryView,
        meta: { title: '试发型｜咋剪发' },
      },
      {
        path: '/archive',
        name: 'archive',
        component: ArchiveView,
        meta: { title: '档案｜咋剪发' },
      },
      {
        path: '/archive/profile',
        name: 'archive-profile',
        component: ArchiveProfileView,
        meta: { title: '建立发型档案｜咋剪发' },
      },
      {
        path: '/archive/plans/new',
        name: 'archive-plan-new',
        component: ArchivePlanFormView,
        meta: { title: '新建发型计划｜咋剪发' },
      },
      {
        path: '/archive/plans/:id/edit',
        name: 'archive-plan-edit',
        component: ArchivePlanFormView,
        meta: { title: '编辑发型计划｜咋剪发' },
      },
      {
        path: '/archive/plans/:id',
        name: 'archive-plan-detail',
        component: ArchivePlanDetailView,
        meta: { title: '发型计划｜咋剪发' },
      },
      {
        path: '/me',
        name: 'me',
        component: MeView,
        meta: { title: '我的｜咋剪发' },
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: NotFoundView,
        meta: { title: '页面没找到｜咋剪发' },
      },
    ],
  })
}

import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'

import ArchiveView from './views/ArchiveView.vue'
import ArchivePlanDetailView from './views/ArchivePlanDetailView.vue'
import ArchiveBriefView from './views/ArchiveBriefView.vue'
import ArchivePlanFormView from './views/ArchivePlanFormView.vue'
import ArchiveProfileView from './views/ArchiveProfileView.vue'
import ArchiveRecordDetailView from './views/ArchiveRecordDetailView.vue'
import ArchiveRecordFormView from './views/ArchiveRecordFormView.vue'
import HairstyleDetailView from './views/HairstyleDetailView.vue'
import HairstyleLibraryView from './views/HairstyleLibraryView.vue'
import HairstyleReferenceDetailView from './views/HairstyleReferenceDetailView.vue'
import HairstyleReferenceFormView from './views/HairstyleReferenceFormView.vue'
import HairstyleShowView from './views/HairstyleShowView.vue'
import HomeView from './views/HomeView.vue'
import MeView from './views/MeView.vue'
import NotFoundView from './views/NotFoundView.vue'
import PrivacyMaskView from './views/PrivacyMaskView.vue'
import TryView from './views/TryView.vue'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'home',
        component: HomeView,
        meta: { title: '咋剪发', wideLayout: true },
      },
      {
        path: '/try',
        name: 'try',
        component: TryView,
        meta: { title: '示例方向对比｜咋剪发' },
      },
      {
        path: '/styles',
        name: 'styles',
        component: HairstyleLibraryView,
        meta: { title: '找发型｜咋剪发', wideLayout: true },
      },
      {
        path: '/styles/favorites',
        name: 'styles-favorites',
        component: HairstyleLibraryView,
        meta: { title: '我的收藏｜咋剪发', wideLayout: true },
      },
      {
        path: '/styles/references',
        name: 'styles-references',
        component: HairstyleLibraryView,
        meta: { title: '我的参考｜咋剪发', wideLayout: true },
      },
      {
        path: '/styles/references/new',
        name: 'style-reference-new',
        component: HairstyleReferenceFormView,
        meta: { title: '添加私人参考｜咋剪发', wideLayout: true, hideBottomNav: true },
      },
      {
        path: '/styles/references/:id/edit',
        name: 'style-reference-edit',
        component: HairstyleReferenceFormView,
        meta: { title: '编辑私人参考｜咋剪发', wideLayout: true, hideBottomNav: true },
      },
      {
        path: '/styles/references/:id/show',
        name: 'style-reference-show',
        component: HairstyleShowView,
        meta: { title: '私人参考｜给理发师看', wideLayout: true, hideBottomNav: true },
      },
      {
        path: '/styles/references/:id',
        name: 'style-reference-detail',
        component: HairstyleReferenceDetailView,
        meta: { title: '私人参考｜咋剪发', wideLayout: true, hideBottomNav: true },
      },
      {
        path: '/styles/catalog/:id',
        name: 'style-detail',
        component: HairstyleDetailView,
        meta: { title: '发型详情｜咋剪发', wideLayout: true, hideBottomNav: true },
      },
      {
        path: '/styles/catalog/:id/show',
        name: 'style-catalog-show',
        component: HairstyleShowView,
        meta: { title: '精选发型｜给理发师看', wideLayout: true, hideBottomNav: true },
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
        meta: { title: '建立发型档案｜咋剪发', hideBottomNav: true },
      },
      {
        path: '/archive/plans/new',
        name: 'archive-plan-new',
        component: ArchivePlanFormView,
        meta: { title: '新建发型计划｜咋剪发', hideBottomNav: true },
      },
      {
        path: '/archive/plans/:id/edit',
        name: 'archive-plan-edit',
        component: ArchivePlanFormView,
        meta: { title: '编辑发型计划｜咋剪发', hideBottomNav: true },
      },
      {
        path: '/archive/plans/:id/brief',
        name: 'archive-plan-brief',
        component: ArchiveBriefView,
        meta: { title: '理发师沟通卡｜咋剪发', hideBottomNav: true },
      },
      {
        path: '/archive/plans/:id/brief/show',
        name: 'archive-plan-brief-show',
        component: ArchiveBriefView,
        meta: { title: '给理发师看｜咋剪发', hideBottomNav: true, wideLayout: true },
      },
      {
        path: '/archive/plans/:id',
        name: 'archive-plan-detail',
        component: ArchivePlanDetailView,
        meta: { title: '发型计划｜咋剪发' },
      },
      {
        path: '/archive/records/new',
        name: 'archive-record-new',
        component: ArchiveRecordFormView,
        meta: { title: '记录这次理发｜咋剪发', hideBottomNav: true },
      },
      {
        path: '/archive/records/:id/edit',
        name: 'archive-record-edit',
        component: ArchiveRecordFormView,
        meta: { title: '编辑剪后记录｜咋剪发', hideBottomNav: true },
      },
      {
        path: '/archive/records/:id',
        name: 'archive-record-detail',
        component: ArchiveRecordDetailView,
        meta: { title: '剪后记录｜咋剪发' },
      },
      {
        path: '/me',
        name: 'me',
        component: MeView,
        meta: { title: '我的｜咋剪发' },
      },
      {
        path: '/privacy/mask',
        name: 'privacy-mask',
        component: PrivacyMaskView,
        meta: { title: '隐私遮罩｜咋剪发', hideBottomNav: true },
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

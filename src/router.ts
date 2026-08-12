import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'

import { pageTitle } from './config/brand'

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
import ShareStudioView from './views/ShareStudioView.vue'
import TryView from './views/TryView.vue'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'home',
        component: HomeView,
        meta: { title: pageTitle(), wideLayout: true },
      },
      {
        path: '/try',
        name: 'try',
        component: TryView,
        meta: { title: pageTitle('示例方向对比') },
      },
      {
        path: '/styles',
        name: 'styles',
        component: HairstyleLibraryView,
        meta: { title: pageTitle('找发型'), wideLayout: true },
      },
      {
        path: '/styles/favorites',
        name: 'styles-favorites',
        component: HairstyleLibraryView,
        meta: { title: pageTitle('我的收藏'), wideLayout: true },
      },
      {
        path: '/styles/references',
        name: 'styles-references',
        component: HairstyleLibraryView,
        meta: { title: pageTitle('我的参考'), wideLayout: true },
      },
      {
        path: '/styles/references/new',
        name: 'style-reference-new',
        component: HairstyleReferenceFormView,
        meta: { title: pageTitle('添加私人参考'), wideLayout: true, hideBottomNav: true },
      },
      {
        path: '/styles/references/:id/edit',
        name: 'style-reference-edit',
        component: HairstyleReferenceFormView,
        meta: { title: pageTitle('编辑私人参考'), wideLayout: true, hideBottomNav: true },
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
        meta: { title: pageTitle('私人参考'), wideLayout: true, hideBottomNav: true },
      },
      {
        path: '/styles/catalog/:id',
        name: 'style-detail',
        component: HairstyleDetailView,
        meta: { title: pageTitle('发型详情'), wideLayout: true, hideBottomNav: true },
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
        meta: { title: pageTitle('档案') },
      },
      {
        path: '/archive/share',
        name: 'archive-share',
        component: ShareStudioView,
        meta: { title: pageTitle('分享工作室'), hideBottomNav: true },
      },
      {
        path: '/archive/profile',
        name: 'archive-profile',
        component: ArchiveProfileView,
        meta: { title: pageTitle('建立发型档案'), hideBottomNav: true },
      },
      {
        path: '/archive/plans/new',
        name: 'archive-plan-new',
        component: ArchivePlanFormView,
        meta: { title: pageTitle('准备下次怎么剪'), hideBottomNav: true },
      },
      {
        path: '/archive/plans/:id/edit',
        name: 'archive-plan-edit',
        component: ArchivePlanFormView,
        meta: { title: pageTitle('调整下次剪法'), hideBottomNav: true },
      },
      {
        path: '/archive/plans/:id/brief',
        name: 'archive-plan-brief',
        component: ArchiveBriefView,
        meta: { title: pageTitle('Tony卡'), hideBottomNav: true },
      },
      {
        path: '/archive/plans/:id/brief/show',
        name: 'archive-plan-brief-show',
        component: ArchiveBriefView,
        meta: { title: pageTitle('给理发师看'), hideBottomNav: true, wideLayout: true },
      },
      {
        path: '/archive/plans/:id',
        name: 'archive-plan-detail',
        component: ArchivePlanDetailView,
        meta: { title: pageTitle('下次怎么剪'), hideBottomNav: true },
      },
      {
        path: '/archive/records/new',
        name: 'archive-record-new',
        component: ArchiveRecordFormView,
        meta: { title: pageTitle('记录这次理发'), hideBottomNav: true },
      },
      {
        path: '/archive/records/:id/edit',
        name: 'archive-record-edit',
        component: ArchiveRecordFormView,
        meta: { title: pageTitle('编辑剪后记录'), hideBottomNav: true },
      },
      {
        path: '/archive/records/:id',
        name: 'archive-record-detail',
        component: ArchiveRecordDetailView,
        meta: { title: pageTitle('剪后记录'), hideBottomNav: true },
      },
      {
        path: '/me',
        name: 'me',
        component: MeView,
        meta: { title: pageTitle('我的') },
      },
      {
        path: '/privacy/mask',
        name: 'privacy-mask',
        component: PrivacyMaskView,
        meta: { title: pageTitle('隐私遮罩'), hideBottomNav: true },
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: NotFoundView,
        meta: { title: pageTitle('页面没找到') },
      },
    ],
  })
}

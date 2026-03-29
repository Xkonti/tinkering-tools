import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/IndexPage.vue') },
      {
        path: 'electronics/voltage-divider',
        component: () => import('pages/VoltageDividerPage.vue'),
        meta: { toolName: 'Voltage Divider' },
      },
      {
        path: 'woodworking/board-cut-optimizer',
        component: () => import('pages/BoardCutOptimizerPage.vue'),
        meta: { toolName: 'Board Cut Optimizer' },
      },
    ],
  },

  {
    path: '/woodworking/board-cut-optimizer/print',
    component: () => import('layouts/PrintLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/BoardCutOptimizerPrintPage.vue'),
        meta: { toolName: 'Board Cut Optimizer — Print' },
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;

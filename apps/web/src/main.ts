import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import "./style.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("./pages/Home.vue") },
    { path: "/vagas/:slug", component: () => import("./pages/Job.vue") },
    { path: "/privacidade", component: () => import("./pages/Privacidade.vue") },
    { path: "/admin/resumo", component: () => import("./pages/Resumo.vue") },
    { path: "/:rest(.*)", component: () => import("./pages/NotFound.vue") },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});

createApp(App).use(router).mount("#app");

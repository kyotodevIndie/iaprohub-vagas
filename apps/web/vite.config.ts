import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Em dev, a API roda em :4000 (pnpm dev:api) e o Vite repassa as rotas do servidor.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: { "/api": "http://localhost:4000", "/v/": "http://localhost:4000", "/sitemap.xml": "http://localhost:4000" },
  },
});

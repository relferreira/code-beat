import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    // The Cloudflare plugin must come before tanstackStart(); see
    // https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // SPA mode: route components render client-side so repo data never touches the
    // server. Only the shell (root route shellComponent) is prerendered.
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
});

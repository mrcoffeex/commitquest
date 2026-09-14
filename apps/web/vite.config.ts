import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://localhost:3001",
      "/colyseus": {
        target: "http://localhost:2567",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, "") || "/",
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발 중에는 `npm run serve`(wrangler pages dev, 8788)가 API 를 띄운다.
export default defineConfig({
  // Hash routing + a canonical trailing slash support both Pages and /candlemma/.
  base: "./",
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8788" } },
});

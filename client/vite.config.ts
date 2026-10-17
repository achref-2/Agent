import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin API calls in development, so the session cookie just works.
    proxy: { "/api": "http://localhost:4000" },
  },
  test: {
    environment: "jsdom",
  },
});

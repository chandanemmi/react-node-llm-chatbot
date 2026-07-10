import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api requests to the Express backend during dev,
      // so the frontend can just call fetch("/api/chat") with no CORS hassle.
      "/api": "http://localhost:3001",
    },
  },
});

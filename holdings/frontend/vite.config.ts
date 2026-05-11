import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.HOLDINGS_API_PORT ?? "8010";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});

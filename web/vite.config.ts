import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.BASE || "/",
  plugins: [react()],
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});

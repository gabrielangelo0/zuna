import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // Permite testar pelo celular na mesma rede.
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});

import { fileURLToPath } from "node:url";
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
    // Duas páginas: o jogo e o painel de administração.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        admin: fileURLToPath(new URL("admin.html", import.meta.url)),
      },
    },
  },
});

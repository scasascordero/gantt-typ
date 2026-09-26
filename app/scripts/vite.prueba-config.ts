import { defineConfig } from "vite";

// Config dedicada para compilar la prueba de geometría a ESM (Node ejecuta el
// bundle resultante; evita depender del resolver de imports sin extensión).
export default defineConfig({
  build: {
    ssr: "scripts/prueba-geometria.ts",
    outDir: "scripts/dist-geometria",
    emptyOutDir: true,
  },
});
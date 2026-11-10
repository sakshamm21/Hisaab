import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The built UI goes inside the Python package, so `pip install hisaab` ships it and users never need Node.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../hisaab/static',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8765' },
  },
});

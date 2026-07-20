import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },
  // build: {
  //   rollupOptions: {
  //     input: {
  //       main: resolve(__dirname, 'src/index.html'),
  //     },
  //   },
  // },
});
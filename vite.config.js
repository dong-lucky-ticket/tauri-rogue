import { defineConfig } from 'vite';
import { resolve } from 'path';

// Vite 开发配置：Tauri 开发时由这里启动前端开发服务器。
export default defineConfig({
  server: {
    // 与 tauri.conf.json 中的 devUrl 保持一致。
    port: 5173,
    watch: {
      // Rust 构建产物变化不应触发前端热更新。
      ignored: ['**/src-tauri/target/**'],
    },
  },
  // 当前项目使用根目录的 index.html 作为唯一入口。
  // build: {
  //   rollupOptions: {
  //     input: {
  //       main: resolve(__dirname, 'src/index.html'),
  //     },
  //   },
  // },
});

import { createGameContext } from './game/context.js';
import { loadAssets } from './game/assets.js';
import { setupInput } from './game/input.js';
import { fitBoard, mountApp, startTicker } from './game/rendering.js';
import { newDungeon } from './game/runtime.js';

async function main() {
  // 上下文保存整个前端运行时，后续模块都围绕同一对象协作。
  const ctx = createGameContext();

  // 创建 Pixi 画布。resizeTo 让画布跟随 #game 容器尺寸变化。
  await ctx.app.init({
    resizeTo: document.querySelector('#game'),
    background: 0x171724,
    antialias: false,
    resolution: 1,
  });

  // 将地图、实体、调试和特效容器挂到 Pixi 舞台。
  mountApp(ctx);
  // 资源加载完成后才能创建精灵。
  await loadAssets(ctx);

  // 窗口尺寸改变时重新计算地图缩放和居中位置。
  const resizeBoard = () => fitBoard(ctx);
  window.addEventListener('resize', resizeBoard);
  resizeBoard();

  // 先向 Rust 请求第一关，再启动持续动画和键盘输入。
  await newDungeon(ctx);
  startTicker(ctx);
  setupInput(ctx);
}

// 启动前端应用。
main();

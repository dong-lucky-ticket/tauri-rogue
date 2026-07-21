import { createGameContext } from './game/context.js';
import { loadAssets } from './game/assets.js';
import { setupInput } from './game/input.js';
import { fitBoard, mountApp, startTicker } from './game/rendering.js';
import { newDungeon } from './game/runtime.js';

async function main() {
  const ctx = createGameContext();

  await ctx.app.init({
    resizeTo: document.querySelector('#game'),
    background: 0x171724,
    antialias: false,
    resolution: 1,
  });

  mountApp(ctx);
  await loadAssets(ctx);

  const resizeBoard = () => fitBoard(ctx);
  window.addEventListener('resize', resizeBoard);
  resizeBoard();

  await newDungeon(ctx);
  startTicker(ctx);
  setupInput(ctx);
}

// 启动前端应用。
main();

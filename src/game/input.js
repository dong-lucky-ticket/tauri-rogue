import { MOVE_REPEAT_INTERVAL_MS } from './constants.js';
import { renderDebugLayer, updateHud } from './rendering.js';
import { movePlayer, newDungeon } from './runtime.js';

// 绑定键盘输入和地图调试快捷键。
export function setupInput(ctx) {
  // 统一监听键盘事件，把输入转换成 Rust PlayerAction 使用的字符串。
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F3') {
      // F3 只切换地图结构调试层，不影响游戏规则。
      event.preventDefault();
      ctx.flags.debugVisible = !ctx.flags.debugVisible;
      renderDebugLayer(ctx);
      updateHud(ctx);
      console.table({
        // 将后端返回的房间和走廊结构输出到控制台，便于检查地图生成结果。
        rooms: ctx.state.rooms,
        corridors: ctx.state.corridors,
      });
      return;
    }

    const moves = {
      ArrowUp: 'move_up',
      w: 'move_up',
      W: 'move_up',
      ArrowDown: 'move_down',
      s: 'move_down',
      S: 'move_down',
      ArrowLeft: 'move_left',
      a: 'move_left',
      A: 'move_left',
      ArrowRight: 'move_right',
      d: 'move_right',
      D: 'move_right',
    };

    if (
      moves[event.key] &&
      ctx.state.turnPhase === 'player_input' &&
      !ctx.flags.phaseAdvanceInFlight
    ) {
      const now = performance.now();
      // 浏览器在长按时会持续触发 keydown，这里限制实际发送到后端的频率。
      if (now - ctx.flags.lastMoveInputAt < MOVE_REPEAT_INTERVAL_MS) return;

      ctx.flags.lastMoveInputAt = now;
      event.preventDefault();
      movePlayer(ctx, moves[event.key]);
    }
  });

  // 顶部按钮和死亡遮罩按钮都复用同一个新地牢流程。
  document.querySelector('#new-dungeon').addEventListener('click', () => newDungeon(ctx));
  document.querySelector('#restart-game').addEventListener('click', () => newDungeon(ctx));
}

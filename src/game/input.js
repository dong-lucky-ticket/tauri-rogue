import { MOVE_REPEAT_INTERVAL_MS } from './constants.js';
import { renderActors, renderDebugLayer, renderIntentLayer, updateHud } from './rendering.js';
import { movePlayer, newDungeon } from './runtime.js';

// 绑定键盘输入和调试快捷键。
export function setupInput(ctx) {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F3') {
      event.preventDefault();
      ctx.flags.debugVisible = !ctx.flags.debugVisible;
      renderDebugLayer(ctx);
      updateHud(ctx);
      console.table({
        rooms: ctx.state.rooms,
        corridors: ctx.state.corridors,
      });
      return;
    }

    if (event.key === 'F4') {
      event.preventDefault();
      ctx.flags.turnDebugVisible = !ctx.flags.turnDebugVisible;
      renderActors(ctx);
      renderIntentLayer(ctx);
      updateHud(ctx);
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
      if (now - ctx.flags.lastMoveInputAt < MOVE_REPEAT_INTERVAL_MS) return;

      ctx.flags.lastMoveInputAt = now;
      event.preventDefault();
      movePlayer(ctx, moves[event.key]);
    }
  });

  document.querySelector('#new-dungeon').addEventListener('click', () => newDungeon(ctx));
  document.querySelector('#restart-game').addEventListener('click', () => newDungeon(ctx));
}

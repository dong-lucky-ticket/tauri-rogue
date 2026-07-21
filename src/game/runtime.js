import { invoke } from '@tauri-apps/api/core';

import { PHASE_DELAYS } from './constants.js';
import {
  renderActors,
  renderDebugLayer,
  renderIntentLayer,
  renderMap,
  showDamageFeedback,
  spawnAttackEffect,
  spawnDamageText,
  spawnEnemyActionEffects,
  spawnEnemyDeathEffect,
  spawnEnemyWarningEffects,
  updateHud,
} from './rendering.js';

// 将异步等待封装成 Promise，供调试模式逐阶段暂停使用。
function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// 将 Rust 返回的 snake_case GameState 同步到前端 camelCase 状态。
// 这是前后端数据边界的唯一入口，渲染层不直接读取 invoke 返回值。
// options.skipEffects = true  -> 只更新状态和画面，不播放过渡特效
// options.skipEffects = false -> 更新状态，并根据变化播放游戏反馈
export function applyGameState(ctx, nextState, options = {}) {
  // 记录更新前的位置，用于计算玩家和敌人的移动动画起点。
  const previousPlayer = { ...ctx.state.player };
  const previousEnemies = ctx.state.enemies.map((enemy) => ({
    id: enemy.id,
    position: { ...enemy.position },
  }));
  // 记录更新前的阶段，用于只在阶段发生变化时播放一次特效。
  const previousTurnPhase = ctx.state.turnPhase;
  // 前后端状态之间的生命差值用于触发受击反馈和扣血飘字。
  const damageTaken = Math.max(0, ctx.state.hp - nextState.hp);
  // 通过稳定 id 判断哪个敌人从状态中消失，作为玩家击败敌人的表现依据。
  const defeatedEnemy = previousEnemies.find(
    (enemy) => !nextState.enemies.some((nextEnemy) => nextEnemy.id === enemy.id),
  );

  // 复制地图和实体数据。这里不保留旧数组，避免前端继续引用已经过期的状态。
  ctx.state.map = nextState.map;
  ctx.state.rooms = nextState.rooms;
  ctx.state.corridors = nextState.corridors;
  ctx.state.player = nextState.player;
  ctx.state.enemies = nextState.enemies;
  ctx.state.chests = nextState.chests;
  ctx.state.portal = nextState.portal;
  ctx.state.level = nextState.level;
  ctx.state.seed = nextState.seed;
  ctx.state.moves = nextState.moves;
  ctx.state.defeated = nextState.defeated;
  ctx.state.gold = nextState.gold;
  ctx.state.turnPhase = nextState.turn_phase;
  ctx.state.pendingDamage = nextState.pending_damage;
  ctx.state.floorType = nextState.floor_type;
  ctx.state.hp = nextState.hp;
  ctx.state.maxHp = nextState.max_hp;
  ctx.state.gameOver = nextState.game_over;
  ctx.state.lastEvent = nextState.last_event;

  // 状态更新后按固定顺序重建各渲染层：
  // 地图 -> 调试层 -> 实体 -> 意图层 -> HUD。
  renderMap(ctx);
  renderDebugLayer(ctx);
  renderActors(
    ctx,
    !options.skipEffects && previousEnemies.length > 0 ? previousPlayer : null,
    !options.skipEffects ? previousEnemies : [],
  );
  renderIntentLayer(ctx);
  updateHud(ctx);

  if (!options.skipEffects) {
    // 只有阶段真正切换到 enemy_warning/enemy_action 时才生成一次特效，
    // 防止调试循环中的重复状态刷新导致重复播放。
    if (previousTurnPhase !== nextState.turn_phase && nextState.turn_phase === 'enemy_warning') {
      spawnEnemyWarningEffects(ctx, nextState);
    }
    if (previousTurnPhase !== nextState.turn_phase && nextState.turn_phase === 'enemy_action') {
      spawnEnemyActionEffects(ctx, nextState);
    }
    if (defeatedEnemy) {
      // 玩家攻击造成敌人消失后，补充挥击、死亡和“击败”飘字。
      spawnAttackEffect(ctx, previousPlayer, defeatedEnemy.position);
      spawnEnemyDeathEffect(ctx, defeatedEnemy.position, previousPlayer);
      spawnDamageText(ctx, defeatedEnemy.position, '击败', 0xffd166);
    }
    if (damageTaken > 0) {
      // 受击同时使用全屏闪光和生命飘字，避免玩家只看到 HUD 数字变化。
      showDamageFeedback(ctx);
      spawnDamageText(ctx, ctx.state.player, `生命 -${damageTaken}`, 0xef806e);
    }
  }
}

export async function resolveTurnPhases(ctx) {
  // 同一时间只能有一个阶段推进循环，避免快速输入或重复回调造成状态竞争。
  if (ctx.flags.phaseAdvanceInFlight) return;

  ctx.flags.phaseAdvanceInFlight = true;
  try {
    while (ctx.state.turnPhase !== 'player_input' && !ctx.state.gameOver) {
      if (ctx.flags.turnDebugVisible) {
        // F4 模式保留阶段间隔，方便观察预警、行动、伤害和动画四个阶段。
        let delay = PHASE_DELAYS[ctx.state.turnPhase] ?? 120;
        if (ctx.state.turnPhase === 'enemy_action' && ctx.state.pendingDamage === 0) delay = 75;
        if (ctx.state.turnPhase === 'animation' && ctx.state.pendingDamage === 0) delay = 20;
        await wait(delay);
        applyGameState(ctx, await invoke('advance_turn_phase'));
      } else {
        // 正常模式不展示阶段停顿，连续请求后端直到回到玩家输入阶段。
        let nextState = await invoke('advance_turn_phase');
        if (nextState.turn_phase === 'enemy_warning') spawnEnemyWarningEffects(ctx, nextState);
        if (nextState.turn_phase === 'enemy_action') spawnEnemyActionEffects(ctx, nextState);
        while (nextState.turn_phase !== 'player_input' && !nextState.game_over) {
          nextState = await invoke('advance_turn_phase');
          if (nextState.turn_phase === 'enemy_warning') spawnEnemyWarningEffects(ctx, nextState);
          if (nextState.turn_phase === 'enemy_action') spawnEnemyActionEffects(ctx, nextState);
        }
        applyGameState(ctx, nextState);
      }
    }
  } finally {
    ctx.flags.phaseAdvanceInFlight = false;
  }
}

export async function newDungeon(ctx) {
  // 新地牢使用浏览器生成的随机种子；种子会回传到 HUD，便于复现地图。
  const seed = Math.floor(Math.random() * 0xffffffff);
  applyGameState(ctx, await invoke('new_dungeon', { seed }), { skipEffects: true });
}

export async function movePlayer(ctx, action) {
  // 一个玩家动作对应一次 Rust 命令和一轮敌人响应。
  if (ctx.flags.actionInFlight) return;

  ctx.flags.actionInFlight = true;
  try {
    // Rust 负责判定移动、攻击、开箱、门户和敌人意图。
    const nextState = await invoke('player_action', { action });
    const enteredPortal =
      nextState.portal.active &&
      nextState.player.x === nextState.portal.position.x &&
      nextState.player.y === nextState.portal.position.y;

    if (enteredPortal) {
      // 玩家站在已激活门户上时，直接生成下一关并继承跨关资源。
      applyGameState(ctx, await invoke('next_level'), { skipEffects: true });
    } else {
      // 先应用玩家行动结果，再推进敌人回合阶段。
      applyGameState(ctx, nextState);
      await resolveTurnPhases(ctx);
    }
  } finally {
    ctx.flags.actionInFlight = false;
  }
}

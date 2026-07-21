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

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function applyGameState(ctx, nextState, options = {}) {
  const previousPlayer = { ...ctx.state.player };
  const previousEnemies = ctx.state.enemies.map((enemy) => ({
    id: enemy.id,
    position: { ...enemy.position },
  }));
  const previousTurnPhase = ctx.state.turnPhase;
  const damageTaken = Math.max(0, ctx.state.hp - nextState.hp);
  const defeatedEnemy = previousEnemies.find(
    (enemy) => !nextState.enemies.some((nextEnemy) => nextEnemy.id === enemy.id),
  );

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
    if (previousTurnPhase !== nextState.turn_phase && nextState.turn_phase === 'enemy_warning') {
      spawnEnemyWarningEffects(ctx, nextState);
    }
    if (previousTurnPhase !== nextState.turn_phase && nextState.turn_phase === 'enemy_action') {
      spawnEnemyActionEffects(ctx, nextState);
    }
    if (defeatedEnemy) {
      spawnAttackEffect(ctx, previousPlayer, defeatedEnemy.position);
      spawnEnemyDeathEffect(ctx, defeatedEnemy.position, previousPlayer);
      spawnDamageText(ctx, defeatedEnemy.position, '击败', 0xffd166);
    }
    if (damageTaken > 0) {
      showDamageFeedback(ctx);
      spawnDamageText(ctx, ctx.state.player, `生命 -${damageTaken}`, 0xef806e);
    }
  }
}

export async function resolveTurnPhases(ctx) {
  if (ctx.flags.phaseAdvanceInFlight) return;

  ctx.flags.phaseAdvanceInFlight = true;
  try {
    while (ctx.state.turnPhase !== 'player_input' && !ctx.state.gameOver) {
      if (ctx.flags.turnDebugVisible) {
        let delay = PHASE_DELAYS[ctx.state.turnPhase] ?? 120;
        if (ctx.state.turnPhase === 'enemy_action' && ctx.state.pendingDamage === 0) delay = 75;
        if (ctx.state.turnPhase === 'animation' && ctx.state.pendingDamage === 0) delay = 20;
        await wait(delay);
        applyGameState(ctx, await invoke('advance_turn_phase'));
      } else {
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
  const seed = Math.floor(Math.random() * 0xffffffff);
  applyGameState(ctx, await invoke('new_dungeon', { seed }), { skipEffects: true });
}

export async function movePlayer(ctx, action) {
  if (ctx.flags.actionInFlight) return;

  ctx.flags.actionInFlight = true;
  try {
    const nextState = await invoke('player_action', { action });
    const enteredPortal =
      nextState.portal.active &&
      nextState.player.x === nextState.portal.position.x &&
      nextState.player.y === nextState.portal.position.y;

    if (enteredPortal) {
      applyGameState(ctx, await invoke('next_level'), { skipEffects: true });
    } else {
      applyGameState(ctx, nextState);
      await resolveTurnPhases(ctx);
    }
  } finally {
    ctx.flags.actionInFlight = false;
  }
}

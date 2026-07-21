import * as PIXI from 'pixi.js';

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  PHASE_LABELS,
  TILE_SIZE,
} from './constants.js';

// 将网格坐标转换为精灵中心点的像素坐标。
export function gridCenter(position) {
  return {
    x: (position.x + 0.5) * TILE_SIZE,
    y: (position.y + 0.5) * TILE_SIZE,
  };
}

function isFloor(ctx, x, y) {
  return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT && ctx.state.map[y][x];
}

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function addSprite(ctx, texture, x, y) {
  const sprite = new PIXI.Sprite(texture);
  sprite.x = x * TILE_SIZE;
  sprite.y = y * TILE_SIZE;
  ctx.mapLayer.addChild(sprite);
}

function pickWallTexture(ctx, x, y) {
  const north = isFloor(ctx, x, y - 1);
  const south = isFloor(ctx, x, y + 1);
  const west = isFloor(ctx, x - 1, y);
  const east = isFloor(ctx, x + 1, y);

  if (north && west) return ctx.assets.corner1;
  if (north && east) return ctx.assets.corner2;
  if (south && west) return ctx.assets.corner3;
  if (south && east) return ctx.assets.corner4;
  if (south) return ctx.assets.wallUp;
  if (north) return ctx.assets.wallDown;
  if (east) return ctx.assets.wallLeft;
  if (west) return ctx.assets.wallRight;
  return ctx.assets.wall;
}

export function queueMovementAnimation(ctx, sprite, from, to, duration = 160) {
  if (!sprite || !from || (from.x === to.x && from.y === to.y)) return;

  ctx.collections.movementAnimations.set(sprite, {
    from: gridCenter(from),
    to: gridCenter(to),
    start: performance.now(),
    duration,
  });
}

export function getAnimatedPosition(ctx, sprite, target) {
  const targetPixels = gridCenter(target);
  const animation = ctx.collections.movementAnimations.get(sprite);
  if (!animation) return targetPixels;

  const progress = Math.min(1, (performance.now() - animation.start) / animation.duration);
  const eased = 1 - (1 - progress) ** 3;
  const position = {
    x: animation.from.x + (animation.to.x - animation.from.x) * eased,
    y: animation.from.y + (animation.to.y - animation.from.y) * eased,
  };

  if (progress >= 1) ctx.collections.movementAnimations.delete(sprite);
  return position;
}

export function renderMap(ctx) {
  ctx.mapLayer.removeChildren();

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (isFloor(ctx, x, y)) addSprite(ctx, ctx.assets.tile, x, y);
    }
  }

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (!isFloor(ctx, x, y)) {
        const hasFloorNeighbor =
          isFloor(ctx, x, y - 1) ||
          isFloor(ctx, x, y + 1) ||
          isFloor(ctx, x - 1, y) ||
          isFloor(ctx, x + 1, y);
        if (hasFloorNeighbor) addSprite(ctx, pickWallTexture(ctx, x, y), x, y);
      }
    }
  }
}

export function renderDebugLayer(ctx) {
  ctx.debugLayer.removeChildren();
  ctx.debugLayer.visible = ctx.flags.debugVisible;
  if (!ctx.flags.debugVisible) return;

  const roomColors = [0x5ee7ff, 0xff8fab, 0xb8f2a2, 0xffd166];

  ctx.state.corridors.forEach((corridor) => {
    const path = new PIXI.Graphics();
    path.moveTo((corridor.start.x + 0.5) * TILE_SIZE, (corridor.start.y + 0.5) * TILE_SIZE);
    path.lineTo((corridor.bend.x + 0.5) * TILE_SIZE, (corridor.bend.y + 0.5) * TILE_SIZE);
    path.lineTo((corridor.end.x + 0.5) * TILE_SIZE, (corridor.end.y + 0.5) * TILE_SIZE);
    path.stroke({ color: 0xffd166, width: 3, alpha: 0.9 });
    ctx.debugLayer.addChild(path);
  });

  ctx.state.rooms.forEach((room, index) => {
    const color = roomColors[index % roomColors.length];
    const outline = new PIXI.Graphics();
    outline.rect(
      room.x * TILE_SIZE + 2,
      room.y * TILE_SIZE + 2,
      room.width * TILE_SIZE - 4,
      room.height * TILE_SIZE - 4,
    );
    outline.fill({ color, alpha: 0.08 });
    outline.stroke({ color, width: 2, alpha: 0.95 });
    ctx.debugLayer.addChild(outline);

    const label = new PIXI.Text({
      text: `R${index + 1}`,
      style: {
        fill: color,
        fontFamily: 'Consolas',
        fontSize: 12,
        fontWeight: 'bold',
      },
    });
    label.x = room.x * TILE_SIZE + 5;
    label.y = room.y * TILE_SIZE + 4;
    ctx.debugLayer.addChild(label);
  });
}

export function renderIntentLayer(ctx) {
  ctx.intentLayer.removeChildren();
  if (!ctx.flags.turnDebugVisible) return;
  if (ctx.state.turnPhase !== 'enemy_warning' && ctx.state.turnPhase !== 'enemy_action') return;

  ctx.state.enemies.forEach((enemy) => {
    if (!enemy.intent?.target) return;

    const from = gridCenter(enemy.position);
    const to = gridCenter(enemy.intent.target);

    if (enemy.intent.kind === 'move') {
      const overlay = new PIXI.Graphics();
      overlay.rect(
        enemy.intent.target.x * TILE_SIZE + 2,
        enemy.intent.target.y * TILE_SIZE + 2,
        TILE_SIZE - 4,
        TILE_SIZE - 4,
      );
      overlay.fill({ color: 0xf0bd73, alpha: 0.16 });
      overlay.stroke({ color: 0xf0bd73, width: 3, alpha: 0.98 });
      overlay.moveTo(from.x, from.y);
      overlay.lineTo(to.x, to.y);
      overlay.stroke({ color: 0xffe0a6, width: 3, alpha: 0.92 });

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / length;
      const uy = dy / length;
      const arrowSize = 8;
      overlay.moveTo(to.x, to.y);
      overlay.lineTo(to.x - ux * arrowSize - uy * 5, to.y - uy * arrowSize + ux * 5);
      overlay.moveTo(to.x, to.y);
      overlay.lineTo(to.x - ux * arrowSize + uy * 5, to.y - uy * arrowSize - ux * 5);
      overlay.stroke({ color: 0xffe0a6, width: 3, alpha: 0.98 });
      ctx.intentLayer.addChild(overlay);
    }

    if (enemy.intent.kind === 'attack') {
      const overlay = new PIXI.Graphics();
      overlay.circle(to.x, to.y, TILE_SIZE * 0.34);
      overlay.fill({ color: 0xff6f61, alpha: 0.16 });
      overlay.stroke({ color: 0xff6f61, width: 3, alpha: 0.98 });
      overlay.moveTo(from.x, from.y);
      overlay.lineTo(to.x, to.y);
      overlay.stroke({ color: 0xff8d7b, width: 3, alpha: 0.88 });
      ctx.intentLayer.addChild(overlay);
    }
  });
}

export function renderActors(ctx, previousPlayer = null, previousEnemies = []) {
  ctx.actorLayer.removeChildren();
  ctx.collections.enemySprites.clear();
  ctx.collections.warningSprites.clear();
  ctx.collections.movementAnimations.clear();
  ctx.refs.playerSprite = null;
  ctx.refs.portalSprite = null;

  ctx.state.chests.forEach((chest) => {
    const sprite = new PIXI.Sprite(chest.opened ? ctx.assets.chestOpen : ctx.assets.chest);
    sprite.x = chest.position.x * TILE_SIZE;
    sprite.y = chest.position.y * TILE_SIZE;
    ctx.actorLayer.addChild(sprite);
  });

  ctx.state.enemies.forEach((enemy) => {
    const sprite = new PIXI.Sprite(ctx.assets.enemy);
    sprite.anchor.set(0.5);
    const previousEnemy = previousEnemies.find((item) => item.id === enemy.id);
    const position = previousEnemy ? gridCenter(previousEnemy.position) : gridCenter(enemy.position);
    sprite.x = position.x;
    sprite.y = position.y;
    const enemyIsThreatening =
      enemy.intent?.kind === 'attack' || manhattanDistance(enemy.position, ctx.state.player) === 1;

    if (ctx.flags.turnDebugVisible && enemy.intent?.kind === 'attack') {
      sprite.tint = 0xff8d7b;
    } else if (
      ctx.flags.turnDebugVisible &&
      ctx.state.turnPhase === 'enemy_warning' &&
      enemy.intent?.kind === 'move'
    ) {
      sprite.tint = 0xf0bd73;
    }
    ctx.collections.enemySprites.set(enemy.id, sprite);
    ctx.actorLayer.addChild(sprite);

    if (ctx.flags.turnDebugVisible && enemyIsThreatening) {
      const warning = new PIXI.Text({
        text: '!',
        style: {
          fill: 0xff6f61,
          fontFamily: 'Georgia',
          fontSize: 10,
          fontWeight: 'bold',
          stroke: { color: 0x211a29, width: 4 },
        },
      });
      warning.anchor.set(0.5);
      warning.x = position.x + TILE_SIZE * 0.28;
      warning.y = position.y - TILE_SIZE * 0.32;
      ctx.collections.warningSprites.set(enemy.id, warning);
      ctx.actorLayer.addChild(warning);
    }
  });

  if (ctx.state.portal.active) {
    ctx.refs.portalSprite = new PIXI.Sprite(ctx.assets.portal);
    ctx.refs.portalSprite.anchor.set(0.5);
    ctx.refs.portalSprite.x = (ctx.state.portal.position.x + 0.5) * TILE_SIZE;
    ctx.refs.portalSprite.y = (ctx.state.portal.position.y + 0.5) * TILE_SIZE;
    ctx.actorLayer.addChild(ctx.refs.portalSprite);
  }

  ctx.refs.playerSprite = new PIXI.Sprite(ctx.assets.player);
  ctx.refs.playerSprite.anchor.set(0.5);
  const playerPosition = previousPlayer ? gridCenter(previousPlayer) : gridCenter(ctx.state.player);
  ctx.refs.playerSprite.x = playerPosition.x;
  ctx.refs.playerSprite.y = playerPosition.y;
  ctx.actorLayer.addChild(ctx.refs.playerSprite);

  if (previousPlayer) queueMovementAnimation(ctx, ctx.refs.playerSprite, previousPlayer, ctx.state.player);
  ctx.state.enemies.forEach((enemy) => {
    const previousEnemy = previousEnemies.find((item) => item.id === enemy.id);
    if (previousEnemy) {
      queueMovementAnimation(
        ctx,
        ctx.collections.enemySprites.get(enemy.id),
        previousEnemy.position,
        enemy.position,
      );
    }
  });
}

export function updateHud(ctx) {
  const healthElement = document.querySelector('#health');
  document.querySelector('#phase').hidden = !ctx.flags.turnDebugVisible;
  document.querySelector('#position').textContent = `位置 ${ctx.state.player.x}, ${ctx.state.player.y}`;
  document.querySelector('#moves').textContent = `回合 ${ctx.state.moves}`;
  document.querySelector('#level').textContent = `关卡 ${ctx.state.level}`;
  document.querySelector('#phase').textContent = `阶段 ${PHASE_LABELS[ctx.state.turnPhase] ?? '进行中'}`;
  healthElement.textContent = `生命 ${ctx.state.hp}/${ctx.state.maxHp}`;
  healthElement.classList.toggle('health-warning', ctx.state.hp <= Math.ceil(ctx.state.maxHp / 2));
  healthElement.classList.toggle('health-critical', ctx.state.hp <= 1);
  document.querySelector('#seed').textContent = `种子 ${ctx.state.seed}`;
  document.querySelector('#defeated').textContent = `击败 ${ctx.state.defeated}`;
  document.querySelector('#gold').textContent = `金币 ${ctx.state.gold}`;
  document.querySelector('#event-status').textContent = ctx.state.lastEvent;
  document.querySelector('#portal-status').textContent = ctx.state.portal.active
    ? '门户已激活'
    : '门户未激活';
  document.querySelector('#debug-status').textContent = `F3 地图调试 ${
    ctx.flags.debugVisible ? '开' : '关'
  } · F4 回合调试 ${ctx.flags.turnDebugVisible ? '开' : '关'}`;
  document.querySelector('#game-over').hidden = !ctx.state.gameOver;
}

export function showDamageFeedback(ctx) {
  const flash = document.querySelector('#damage-flash');
  flash.classList.remove('active');
  void flash.offsetWidth;
  flash.classList.add('active');
  ctx.flags.damageFeedbackUntil = performance.now() + 450;
}

export function spawnDamageText(ctx, position, text, color = 0xffd166) {
  const label = new PIXI.Text({
    text,
    style: {
      fill: color,
      fontFamily: 'Consolas',
      fontSize: 14,
      fontWeight: 'bold',
      stroke: { color: 0x211a29, width: 4 },
    },
  });
  label.anchor.set(0.5);
  const center = gridCenter(position);
  label.x = center.x;
  label.y = center.y - 8;
  ctx.effectLayer.addChild(label);
  ctx.collections.visualEffects.push({
    display: label,
    kind: 'damage-text',
    start: performance.now(),
    duration: 700,
    baseY: label.y,
  });
}

export function spawnAttackEffect(ctx, from, target) {
  const start = gridCenter(from);
  const end = gridCenter(target);
  const slash = new PIXI.Graphics();
  slash.moveTo(start.x, start.y);
  slash.lineTo(end.x, end.y);
  slash.stroke({ color: 0xffe0a6, width: 5, alpha: 0.95 });
  slash.moveTo(start.x, start.y - 5);
  slash.lineTo(end.x, end.y - 5);
  slash.stroke({ color: 0xef806e, width: 2, alpha: 0.9 });
  ctx.effectLayer.addChild(slash);
  ctx.collections.visualEffects.push({
    display: slash,
    kind: 'attack',
    start: performance.now(),
    duration: 180,
  });
}

export function spawnEnemyAttackEffect(ctx, from, target) {
  const start = gridCenter(from);
  const end = gridCenter(target);
  const attack = new PIXI.Container();
  const trail = new PIXI.Graphics();
  trail.moveTo(start.x, start.y);
  trail.lineTo(end.x, end.y);
  trail.stroke({ color: 0xff8d7b, width: 6, alpha: 0.88 });
  attack.addChild(trail);

  const impact = new PIXI.Graphics();
  impact.circle(end.x, end.y, TILE_SIZE * 0.18);
  impact.fill({ color: 0xffd4c7, alpha: 0.95 });
  impact.stroke({ color: 0xff6f61, width: 4, alpha: 0.98 });
  impact.moveTo(end.x - 10, end.y - 10);
  impact.lineTo(end.x + 10, end.y + 10);
  impact.moveTo(end.x + 10, end.y - 10);
  impact.lineTo(end.x - 10, end.y + 10);
  impact.stroke({ color: 0xfff1d0, width: 3, alpha: 0.95 });
  attack.addChild(impact);

  ctx.effectLayer.addChild(attack);
  ctx.collections.visualEffects.push({
    display: attack,
    kind: 'enemy-attack',
    start: performance.now(),
    duration: 320,
  });
}

export function spawnEnemyDeathEffect(ctx, position, source) {
  const center = gridCenter(position);
  const sprite = new PIXI.Sprite(ctx.assets.enemy);
  sprite.anchor.set(0.5);
  sprite.x = center.x;
  sprite.y = center.y;
  sprite.tint = 0xffc7ba;
  ctx.effectLayer.addChild(sprite);

  const dx = position.x - source.x;
  const dy = position.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  ctx.collections.visualEffects.push({
    display: sprite,
    kind: 'enemy-death',
    start: performance.now(),
    duration: 520,
    baseX: center.x,
    baseY: center.y,
    pushX: (dx / length) * 8,
    pushY: (dy / length) * 8,
  });
}

export function spawnEnemyWarningEffects(ctx, gameState) {
  gameState.enemies.forEach((enemy) => {
    if (enemy.intent?.kind === 'attack' && !ctx.flags.turnDebugVisible) {
      spawnDamageText(ctx, enemy.position, '!', 0xff6f61);
    }
  });
}

export function spawnEnemyActionEffects(ctx, gameState) {
  gameState.enemies.forEach((enemy) => {
    if (enemy.intent?.kind === 'attack') {
      spawnEnemyAttackEffect(ctx, enemy.position, gameState.player);
    }
  });
}

export function updateVisualEffects(ctx, now) {
  for (let index = ctx.collections.visualEffects.length - 1; index >= 0; index -= 1) {
    const effect = ctx.collections.visualEffects[index];
    const progress = Math.min(1, (now - effect.start) / effect.duration);
    effect.display.alpha = 1 - progress;

    if (effect.kind === 'damage-text') {
      effect.display.y = effect.baseY - progress * 22;
    } else if (effect.kind === 'enemy-death') {
      const hold = Math.min(1, progress / 0.45);
      effect.display.x = effect.baseX + effect.pushX * hold;
      effect.display.y = effect.baseY + effect.pushY * hold + progress * 5;
      effect.display.rotation = hold * 0.55;
      if (progress < 0.22) {
        effect.display.tint = 0xffffff;
      } else if (progress < 0.5) {
        effect.display.tint = 0xff9b8a;
      } else {
        effect.display.tint = 0x6b4d4a;
      }
    } else {
      const scale = 0.7 + progress * 0.5;
      effect.display.scale.set(scale);
    }

    if (progress >= 1) {
      effect.display.destroy();
      ctx.collections.visualEffects.splice(index, 1);
    }
  }
}

export function mountApp(ctx) {
  document.querySelector('#game').appendChild(ctx.app.canvas);
  ctx.board.addChild(ctx.mapLayer, ctx.debugLayer, ctx.actorLayer, ctx.intentLayer, ctx.effectLayer);
  ctx.app.stage.addChild(ctx.board);
}

export function fitBoard(ctx) {
  const topbarRect = document.querySelector('.topbar').getBoundingClientRect();
  const hintRect = document.querySelector('.hint').getBoundingClientRect();
  const hudBottom = Math.max(topbarRect.bottom, hintRect.bottom) + 12;
  const availableHeight = Math.max(1, window.innerHeight - hudBottom);
  const scale = Math.min(1, window.innerWidth / BOARD_WIDTH, availableHeight / BOARD_HEIGHT);

  ctx.board.scale.set(scale);
  ctx.board.x = Math.floor((window.innerWidth - BOARD_WIDTH * scale) / 2);
  ctx.board.y = Math.floor(hudBottom + (availableHeight - BOARD_HEIGHT * scale) / 2);
}

export function startTicker(ctx) {
  ctx.app.ticker.add(() => {
    const time = ctx.app.ticker.lastTime;
    ctx.actorLayer.alpha = 1;

    if (ctx.refs.playerSprite) {
      const breathing = Math.sin(time / 180);
      const position = getAnimatedPosition(ctx, ctx.refs.playerSprite, ctx.state.player);
      ctx.refs.playerSprite.x = position.x;
      ctx.refs.playerSprite.y = position.y + breathing * 1.2;
      ctx.refs.playerSprite.scale.set(1 + breathing * 0.035, 1 - breathing * 0.025);
      ctx.refs.playerSprite.rotation = breathing * 0.025;
      ctx.refs.playerSprite.alpha = performance.now() < ctx.flags.damageFeedbackUntil ? 0.5 : 1;
    }

    ctx.state.enemies.forEach((enemy) => {
      const sprite = ctx.collections.enemySprites.get(enemy.id);
      if (!sprite) return;
      const position = getAnimatedPosition(ctx, sprite, enemy.position);
      const breathing = Math.sin(time / 230 + enemy.id);
      let offsetX = 0;
      let offsetY = breathing * 0.5;
      let rotation = 0;
      let scaleX = 1;
      let scaleY = 1;

      if (enemy.mode === 'alert' && enemy.intent?.target) {
        const target = gridCenter(enemy.intent.target);
        offsetX = (target.x - position.x) * 0.1;
        offsetY += (target.y - position.y) * 0.1;
        scaleX = 1.03;
        scaleY = 0.97;
      }

      if (enemy.mode === 'windup' && enemy.intent?.target) {
        const target = gridCenter(enemy.intent.target);
        offsetX = (position.x - target.x) * 0.08;
        offsetY += (position.y - target.y) * 0.08;
        rotation = Math.sin(time / 80) * 0.05;
        scaleX = 1.05;
        scaleY = 0.95;
      }

      if (enemy.mode === 'attack' && enemy.intent?.target) {
        const target = gridCenter(enemy.intent.target);
        offsetX = (target.x - position.x) * 0.22;
        offsetY += (target.y - position.y) * 0.22;
        rotation = Math.sin(time / 55) * 0.08;
        scaleX = 1.08;
        scaleY = 0.92;
      }

      sprite.x = position.x + offsetX;
      sprite.y = position.y + offsetY;
      sprite.rotation = rotation;
      sprite.scale.set(scaleX, scaleY);
    });

    ctx.collections.warningSprites.forEach((warning, enemyId) => {
      const sprite = ctx.collections.enemySprites.get(enemyId);
      if (!sprite) return;
      const pulse = 1 + Math.sin(time / 110) * 0.12;
      warning.x = sprite.x + TILE_SIZE * 0.28;
      warning.y = sprite.y - TILE_SIZE * 0.32;
      warning.scale.set(pulse);
      warning.alpha = 0.72 + Math.sin(time / 100) * 0.2;
    });

    if (ctx.refs.portalSprite) {
      ctx.refs.portalSprite.rotation = time / 900;
      const pulse = 1 + Math.sin(time / 220) * 0.08;
      ctx.refs.portalSprite.scale.set(pulse);
    }

    updateVisualEffects(ctx, performance.now());
  });
}

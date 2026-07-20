import * as PIXI from 'pixi.js';
import { invoke } from '@tauri-apps/api/core';

// 地牢基础图块。
import tileUrl from './assets/TilesDungeon/Tile.png';
import wallUrl from './assets/TilesDungeon/Wall.png';
import wallUpUrl from './assets/TilesDungeon/WallUp.png';
import wallDownUrl from './assets/TilesDungeon/WallDown.png';
import wallLeftUrl from './assets/TilesDungeon/WallLeft.png';
import wallRightUrl from './assets/TilesDungeon/WallRight.png';
import corner1Url from './assets/TilesDungeon/Corner1.png';
import corner2Url from './assets/TilesDungeon/Corner2.png';
import corner3Url from './assets/TilesDungeon/Corner3.png';
import corner4Url from './assets/TilesDungeon/Corner4.png';

// 玩家、敌人、宝箱和关卡门户素材。
import playerUrl from './assets/Dungeon Crawl Stone Soup Full/player/base/human_male.png';
import enemyUrl from './assets/Dungeon Crawl Stone Soup Full/monster/goblin_new.png';
import chestUrl from './assets/Dungeon Crawl Stone Soup Full/dungeon/chest.png';
import chestOpenUrl from './assets/Dungeon Crawl Stone Soup Full/dungeon/chest_2_open.png';
import portalUrl from './assets/Dungeon Crawl Stone Soup Full/dungeon/gateways/portal.png';

// 地图尺寸与后端生成的地图保持一致。
const TILE_SIZE = 32;
const MAP_WIDTH = 25;
const MAP_HEIGHT = 17;
const BOARD_WIDTH = MAP_WIDTH * TILE_SIZE;
const BOARD_HEIGHT = MAP_HEIGHT * TILE_SIZE;

const app = new PIXI.Application();
// 地图、调试信息和游戏实体分别放在独立容器中，便于控制渲染层级。
const board = new PIXI.Container();
const mapLayer = new PIXI.Container();
const debugLayer = new PIXI.Container();
const actorLayer = new PIXI.Container();
const effectLayer = new PIXI.Container();
let playerSprite = null;
let portalSprite = null;
const enemySprites = new Map();
const warningSprites = new Map();
const movementAnimations = new Map();
const visualEffects = [];

// 前端缓存后端返回的完整游戏状态，只负责渲染和发送操作。
const state = {
  map: [],
  rooms: [],
  corridors: [],
  player: { x: 0, y: 0 },
  enemies: [],
  chests: [],
  portal: {
    position: { x: 0, y: 0 },
    active: false,
  },
  level: 1,
  seed: 0,
  moves: 0,
  defeated: 0,
  gold: 0,
  hp: 5,
  maxHp: 5,
  gameOver: false,
  lastEvent: '',
};
const assets = {};
let debugVisible = false;
// 防止上一次行动完成前重复发送移动请求。
let actionInFlight = false;
// 记录受击反馈结束时间，用于让玩家精灵短暂闪烁。
let damageFeedbackUntil = 0;

// 将网格坐标转换为精灵中心点的像素坐标。
function gridCenter(position) {
  return {
    x: (position.x + 0.5) * TILE_SIZE,
    y: (position.y + 0.5) * TILE_SIZE,
  };
}

// 为实体记录一次从旧网格到新网格的平滑移动。
function queueMovementAnimation(sprite, from, to, duration = 160) {
  if (!sprite || !from || (from.x === to.x && from.y === to.y)) return;

  movementAnimations.set(sprite, {
    from: gridCenter(from),
    to: gridCenter(to),
    start: performance.now(),
    duration,
  });
}

// 获取实体当前应该渲染的像素坐标；没有动画时直接返回目标格中心。
function getAnimatedPosition(sprite, target) {
  const targetPixels = gridCenter(target);
  const animation = movementAnimations.get(sprite);
  if (!animation) return targetPixels;

  const progress = Math.min(1, (performance.now() - animation.start) / animation.duration);
  const eased = 1 - (1 - progress) ** 3;
  const position = {
    x: animation.from.x + (animation.to.x - animation.from.x) * eased,
    y: animation.from.y + (animation.to.y - animation.from.y) * eased,
  };

  if (progress >= 1) movementAnimations.delete(sprite);
  return position;
}

// 判断坐标是否在地图范围内，并且对应位置是地板。
function isFloor(x, y) {
  return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT && state.map[y][x];
}

// 将纹理放置到网格坐标对应的像素位置。
function addSprite(texture, x, y) {
  const sprite = new PIXI.Sprite(texture);
  sprite.x = x * TILE_SIZE;
  sprite.y = y * TILE_SIZE;
  mapLayer.addChild(sprite);
}

// 根据墙壁周围的地板方向选择墙角或墙边贴图。
function pickWallTexture(x, y) {
  const north = isFloor(x, y - 1);
  const south = isFloor(x, y + 1);
  const west = isFloor(x - 1, y);
  const east = isFloor(x + 1, y);

  if (north && west) return assets.corner1;
  if (north && east) return assets.corner2;
  if (south && west) return assets.corner3;
  if (south && east) return assets.corner4;
  if (south) return assets.wallUp;
  if (north) return assets.wallDown;
  if (east) return assets.wallLeft;
  if (west) return assets.wallRight;
  return assets.wall;
}

// 先绘制地板，再绘制与地板相邻的墙壁。
function renderMap() {
  mapLayer.removeChildren();

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (isFloor(x, y)) addSprite(assets.tile, x, y);
    }
  }

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (!isFloor(x, y)) {
        const hasFloorNeighbor =
          isFloor(x, y - 1) || isFloor(x, y + 1) || isFloor(x - 1, y) || isFloor(x + 1, y);
        if (hasFloorNeighbor) addSprite(pickWallTexture(x, y), x, y);
      }
    }
  }
}

// 绘制调试层：显示走廊路径、房间边界和房间编号。
function renderDebugLayer() {
  debugLayer.removeChildren();
  debugLayer.visible = debugVisible;
  if (!debugVisible) return;

  const roomColors = [0x5ee7ff, 0xff8fab, 0xb8f2a2, 0xffd166];

  state.corridors.forEach((corridor) => {
    const path = new PIXI.Graphics();
    path.moveTo(
      (corridor.start.x + 0.5) * TILE_SIZE,
      (corridor.start.y + 0.5) * TILE_SIZE,
    );
    path.lineTo(
      (corridor.bend.x + 0.5) * TILE_SIZE,
      (corridor.bend.y + 0.5) * TILE_SIZE,
    );
    path.lineTo(
      (corridor.end.x + 0.5) * TILE_SIZE,
      (corridor.end.y + 0.5) * TILE_SIZE,
    );
    path.stroke({ color: 0xffd166, width: 3, alpha: 0.9 });
    debugLayer.addChild(path);
  });

  state.rooms.forEach((room, index) => {
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
    debugLayer.addChild(outline);

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
    debugLayer.addChild(label);
  });
}

function renderPlayer(previousPlayer = null, previousEnemies = []) {
  // 重建实体层中的宝箱、敌人、预警标记和玩家精灵。
  actorLayer.removeChildren();
  enemySprites.clear();
  warningSprites.clear();
  movementAnimations.clear();
  playerSprite = null;
  portalSprite = null;

  state.chests.forEach((chest) => {
    const sprite = new PIXI.Sprite(chest.opened ? assets.chestOpen : assets.chest);
    sprite.x = chest.position.x * TILE_SIZE;
    sprite.y = chest.position.y * TILE_SIZE;
    actorLayer.addChild(sprite);
  });

  state.enemies.forEach((enemy) => {
    const sprite = new PIXI.Sprite(assets.enemy);
    // 敌人坐标使用格子中心，必须与玩家一样以素材中心作为锚点。
    sprite.anchor.set(0.5);
    const previousEnemy = previousEnemies.find((item) => item.id === enemy.id);
    const position = previousEnemy ? gridCenter(previousEnemy.position) : gridCenter(enemy.position);
    sprite.x = position.x;
    sprite.y = position.y;
    enemySprites.set(enemy.id, sprite);
    actorLayer.addChild(sprite);

    // 敌人与玩家相邻时显示感叹号，提醒玩家下一次行动可能受到攻击。
    const distance =
      Math.abs(enemy.position.x - state.player.x) +
      Math.abs(enemy.position.y - state.player.y);
    if (distance === 1) {
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
      // 预警标记放在怪物右上角，避免遮挡模型主体。
      warning.x = position.x + TILE_SIZE * 0.28;
      warning.y = position.y - TILE_SIZE * 0.32;
      warningSprites.set(enemy.id, warning);
      actorLayer.addChild(warning);
    }
  });

  if (state.portal.active) {
    portalSprite = new PIXI.Sprite(assets.portal);
    portalSprite.anchor.set(0.5);
    portalSprite.x = (state.portal.position.x + 0.5) * TILE_SIZE;
    portalSprite.y = (state.portal.position.y + 0.5) * TILE_SIZE;
    actorLayer.addChild(portalSprite);
  }

  playerSprite = new PIXI.Sprite(assets.player);
  playerSprite.anchor.set(0.5);
  const playerPosition = previousPlayer
    ? gridCenter(previousPlayer)
    : gridCenter(state.player);
  playerSprite.x = playerPosition.x;
  playerSprite.y = playerPosition.y;
  actorLayer.addChild(playerSprite);

  // 状态更新后从旧位置过渡到新位置，避免实体瞬移。
  if (previousPlayer) queueMovementAnimation(playerSprite, previousPlayer, state.player);
  state.enemies.forEach((enemy) => {
    const previousEnemy = previousEnemies.find((item) => item.id === enemy.id);
    if (previousEnemy) {
      queueMovementAnimation(enemySprites.get(enemy.id), previousEnemy.position, enemy.position);
    }
  });
}

// 将游戏状态同步到 HUD 文本。
function updateHud() {
  const healthElement = document.querySelector('#health');
  document.querySelector('#position').textContent = `位置 ${state.player.x}, ${state.player.y}`;
  document.querySelector('#moves').textContent = `回合 ${state.moves}`;
  document.querySelector('#level').textContent = `关卡 ${state.level}`;
  healthElement.textContent = `生命 ${state.hp}/${state.maxHp}`;
  healthElement.classList.toggle('health-warning', state.hp <= Math.ceil(state.maxHp / 2));
  healthElement.classList.toggle('health-critical', state.hp <= 1);
  document.querySelector('#seed').textContent = `种子 ${state.seed}`;
  document.querySelector('#defeated').textContent = `击败 ${state.defeated}`;
  document.querySelector('#gold').textContent = `金币 ${state.gold}`;
  document.querySelector('#event-status').textContent = state.lastEvent;
  document.querySelector('#portal-status').textContent = state.portal.active
    ? '门户已激活'
    : '门户未激活';
  document.querySelector('#game-over').hidden = !state.gameOver;
}

// 播放一次明确的受击反馈，帮助玩家感知生命值已经下降。
function showDamageFeedback() {
  const flash = document.querySelector('#damage-flash');
  flash.classList.remove('active');
  void flash.offsetWidth;
  flash.classList.add('active');
  damageFeedbackUntil = performance.now() + 450;
}

// 在实体上方生成短暂的伤害或击败提示。
function spawnDamageText(position, text, color = 0xffd166) {
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
  effectLayer.addChild(label);
  visualEffects.push({
    display: label,
    kind: 'damage-text',
    start: performance.now(),
    duration: 700,
    baseY: label.y,
  });
}

// 生成一道短暂的近战斩击线，反馈玩家正在攻击目标。
function spawnAttackEffect(from, target) {
  const start = gridCenter(from);
  const end = gridCenter(target);
  const slash = new PIXI.Graphics();
  slash.moveTo(start.x, start.y);
  slash.lineTo(end.x, end.y);
  slash.stroke({ color: 0xffe0a6, width: 5, alpha: 0.95 });
  slash.moveTo(start.x, start.y - 5);
  slash.lineTo(end.x, end.y - 5);
  slash.stroke({ color: 0xef806e, width: 2, alpha: 0.9 });
  effectLayer.addChild(slash);
  visualEffects.push({
    display: slash,
    kind: 'attack',
    start: performance.now(),
    duration: 180,
  });
}

// 更新伤害数字和斩击线的淡出、上浮与缩放效果。
function updateVisualEffects(now) {
  for (let index = visualEffects.length - 1; index >= 0; index -= 1) {
    const effect = visualEffects[index];
    const progress = Math.min(1, (now - effect.start) / effect.duration);
    effect.display.alpha = 1 - progress;

    if (effect.kind === 'damage-text') {
      effect.display.y = effect.baseY - progress * 22;
    } else {
      const scale = 0.7 + progress * 0.5;
      effect.display.scale.set(scale);
    }

    if (progress >= 1) {
      effect.display.destroy();
      visualEffects.splice(index, 1);
    }
  }
}

// 应用后端返回的新状态，并刷新所有可视区域。
function applyGameState(nextState, options = {}) {
  const previousPlayer = { ...state.player };
  const previousEnemies = state.enemies.map((enemy) => ({
    id: enemy.id,
    position: { ...enemy.position },
  }));
  const tookDamage = nextState.hp < state.hp;
  const defeatedEnemy = previousEnemies.find(
    (enemy) => !nextState.enemies.some((nextEnemy) => nextEnemy.id === enemy.id),
  );
  state.map = nextState.map;
  state.rooms = nextState.rooms;
  state.corridors = nextState.corridors;
  state.player = nextState.player;
  state.enemies = nextState.enemies;
  state.chests = nextState.chests;
  state.portal = nextState.portal;
  state.level = nextState.level;
  state.seed = nextState.seed;
  state.moves = nextState.moves;
  state.defeated = nextState.defeated;
  state.gold = nextState.gold;
  state.hp = nextState.hp;
  state.maxHp = nextState.max_hp;
  state.gameOver = nextState.game_over;
  state.lastEvent = nextState.last_event;
  renderMap();
  renderDebugLayer();
  renderPlayer(
    !options.skipEffects && previousEnemies.length > 0 ? previousPlayer : null,
    !options.skipEffects ? previousEnemies : [],
  );
  updateHud();

  if (!options.skipEffects) {
    if (defeatedEnemy) {
      spawnAttackEffect(previousPlayer, defeatedEnemy.position);
      spawnDamageText(defeatedEnemy.position, '击败', 0xffd166);
    }
    if (tookDamage) {
      showDamageFeedback();
      spawnDamageText(state.player, '生命 -1', 0xef806e);
    }
  }
}

// 生成随机种子并请求后端创建新的地牢。
async function newDungeon() {
  const seed = Math.floor(Math.random() * 0xffffffff);
  applyGameState(await invoke('new_dungeon', { seed }));
}

// 将一次移动操作发送给后端。
async function movePlayer(action) {
  if (actionInFlight) return;

  actionInFlight = true;
  try {
    const nextState = await invoke('player_action', { action });
    const enteredPortal =
      nextState.portal.active &&
      nextState.player.x === nextState.portal.position.x &&
      nextState.player.y === nextState.portal.position.y;

    if (enteredPortal) {
      applyGameState(await invoke('next_level'), { skipEffects: true });
    } else {
      applyGameState(nextState);
    }
  } finally {
    actionInFlight = false;
  }
}

// 初始化 Pixi、加载资源、绑定输入并启动第一张地图。
async function main() {
  await app.init({
    resizeTo: document.querySelector('#game'),
    background: 0x171724,
    antialias: false,
    resolution: 1,
  });

  document.querySelector('#game').appendChild(app.canvas);
  board.addChild(mapLayer, debugLayer, actorLayer, effectLayer);
  app.stage.addChild(board);

  // 加载地形、角色、敌人和宝箱贴图，后续渲染时复用纹理。
  assets.tile = await PIXI.Assets.load(tileUrl);
  assets.wall = await PIXI.Assets.load(wallUrl);
  assets.wallUp = await PIXI.Assets.load(wallUpUrl);
  assets.wallDown = await PIXI.Assets.load(wallDownUrl);
  assets.wallLeft = await PIXI.Assets.load(wallLeftUrl);
  assets.wallRight = await PIXI.Assets.load(wallRightUrl);
  assets.corner1 = await PIXI.Assets.load(corner1Url);
  assets.corner2 = await PIXI.Assets.load(corner2Url);
  assets.corner3 = await PIXI.Assets.load(corner3Url);
  assets.corner4 = await PIXI.Assets.load(corner4Url);
  assets.player = await PIXI.Assets.load(playerUrl);
  assets.enemy = await PIXI.Assets.load(enemyUrl);
  assets.chest = await PIXI.Assets.load(chestUrl);
  assets.chestOpen = await PIXI.Assets.load(chestOpenUrl);
  assets.portal = await PIXI.Assets.load(portalUrl);

  // 按顶部 HUD 以下的可用区域居中，小窗口允许缩小地图。
  const fitBoard = () => {
    const topbarRect = document.querySelector('.topbar').getBoundingClientRect();
    const hintRect = document.querySelector('.hint').getBoundingClientRect();
    const hudBottom = Math.max(topbarRect.bottom, hintRect.bottom) + 12;
    const availableHeight = Math.max(1, window.innerHeight - hudBottom);
    const scale = Math.min(1, window.innerWidth / BOARD_WIDTH, availableHeight / BOARD_HEIGHT);

    board.scale.set(scale);
    board.x = Math.floor((window.innerWidth - BOARD_WIDTH * scale) / 2);
    board.y = Math.floor(hudBottom + (availableHeight - BOARD_HEIGHT * scale) / 2);
  };

  window.addEventListener('resize', fitBoard);
  fitBoard();
  await newDungeon();

  // 使用轻微浮动、缩放和旋转，让静态玩家贴图呈现待机动画。
  app.ticker.add(() => {
    const time = app.ticker.lastTime;
    actorLayer.alpha = 1;

    if (playerSprite) {
      const breathing = Math.sin(time / 180);
      const position = getAnimatedPosition(playerSprite, state.player);
      playerSprite.x = position.x;
      playerSprite.y = position.y + breathing * 1.2;
      playerSprite.scale.set(1 + breathing * 0.035, 1 - breathing * 0.025);
      playerSprite.rotation = breathing * 0.025;
      playerSprite.alpha = performance.now() < damageFeedbackUntil ? 0.5 : 1;
    }

    state.enemies.forEach((enemy) => {
      const sprite = enemySprites.get(enemy.id);
      if (!sprite) return;
      const position = getAnimatedPosition(sprite, enemy.position);
      const breathing = Math.sin(time / 230 + enemy.id);
      sprite.x = position.x;
      sprite.y = position.y + breathing * 0.5;
    });

    warningSprites.forEach((warning, enemyId) => {
      const enemy = state.enemies.find((item) => item.id === enemyId);
      if (!enemy) return;
      const sprite = enemySprites.get(enemyId);
      if (!sprite) return;
      const pulse = 1 + Math.sin(time / 110) * 0.12;
      warning.x = sprite.x + TILE_SIZE * 0.28;
      warning.y = sprite.y - TILE_SIZE * 0.32;
      warning.scale.set(pulse);
      warning.alpha = 0.72 + Math.sin(time / 100) * 0.2;
    });

    if (portalSprite) {
      portalSprite.rotation = time / 900;
      const pulse = 1 + Math.sin(time / 220) * 0.08;
      portalSprite.scale.set(pulse);
    }

    updateVisualEffects(performance.now());
  });

  // 同时支持方向键和 WASD 移动。
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F3') {
      event.preventDefault();
      debugVisible = !debugVisible;
      renderDebugLayer();
      document.querySelector('#debug-status').textContent = debugVisible
        ? 'F3 调试层 开'
        : 'F3 调试层 关';
      console.table({
        rooms: state.rooms,
        corridors: state.corridors,
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

    if (moves[event.key]) {
      event.preventDefault();
      movePlayer(moves[event.key]);
    }
  });

  document.querySelector('#new-dungeon').addEventListener('click', newDungeon);
  document.querySelector('#restart-game').addEventListener('click', newDungeon);
}

// 启动前端应用。
main();

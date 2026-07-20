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
let playerSprite = null;
let portalSprite = null;

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
};
const assets = {};
let debugVisible = false;
// 防止上一次行动完成前重复发送移动请求。
let actionInFlight = false;

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

function renderPlayer() {
  // 重建实体层中的宝箱、敌人和玩家精灵。
  actorLayer.removeChildren();
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
    sprite.x = enemy.position.x * TILE_SIZE;
    sprite.y = enemy.position.y * TILE_SIZE;
    actorLayer.addChild(sprite);
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
  playerSprite.x = (state.player.x + 0.5) * TILE_SIZE;
  playerSprite.y = (state.player.y + 0.5) * TILE_SIZE;
  actorLayer.addChild(playerSprite);
}

// 将游戏状态同步到 HUD 文本。
function updateHud() {
  document.querySelector('#position').textContent = `位置 ${state.player.x}, ${state.player.y}`;
  document.querySelector('#moves').textContent = `回合 ${state.moves}`;
  document.querySelector('#level').textContent = `关卡 ${state.level}`;
  document.querySelector('#seed').textContent = `种子 ${state.seed}`;
  document.querySelector('#defeated').textContent = `击败 ${state.defeated}`;
  document.querySelector('#gold').textContent = `金币 ${state.gold}`;
  document.querySelector('#portal-status').textContent = state.portal.active
    ? '门户已激活'
    : '门户未激活';
}

// 应用后端返回的新状态，并刷新所有可视区域。
function applyGameState(nextState) {
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
  renderMap();
  renderDebugLayer();
  renderPlayer();
  updateHud();
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
      applyGameState(await invoke('next_level'));
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
  board.addChild(mapLayer, debugLayer, actorLayer);
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
      playerSprite.x = (state.player.x + 0.5) * TILE_SIZE;
      playerSprite.y = (state.player.y + 0.5) * TILE_SIZE + breathing * 1.2;
      playerSprite.scale.set(1 + breathing * 0.035, 1 - breathing * 0.025);
      playerSprite.rotation = breathing * 0.025;
    }

    if (portalSprite) {
      portalSprite.rotation = time / 900;
      const pulse = 1 + Math.sin(time / 220) * 0.08;
      portalSprite.scale.set(pulse);
    }
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
}

// 启动前端应用。
main();

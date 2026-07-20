import * as PIXI from 'pixi.js';
import { invoke } from '@tauri-apps/api/core';
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
import playerUrl from './assets/Dungeon Crawl Stone Soup Full/player/base/human_male.png';
import enemyUrl from './assets/Dungeon Crawl Stone Soup Full/monster/goblin_new.png';
import chestUrl from './assets/Dungeon Crawl Stone Soup Full/dungeon/chest.png';
import chestOpenUrl from './assets/Dungeon Crawl Stone Soup Full/dungeon/chest_2_open.png';

// 地图尺寸与后端生成的地图保持一致。
const TILE_SIZE = 32;
const MAP_WIDTH = 25;
const MAP_HEIGHT = 17;
const BOARD_WIDTH = MAP_WIDTH * TILE_SIZE;
const BOARD_HEIGHT = MAP_HEIGHT * TILE_SIZE;

const app = new PIXI.Application();
const board = new PIXI.Container();
const mapLayer = new PIXI.Container();
const actorLayer = new PIXI.Container();

// 前端缓存后端返回的完整游戏状态，只负责渲染和发送操作。
const state = {
  map: [],
  player: { x: 0, y: 0 },
  enemies: [],
  chests: [],
  seed: 0,
  moves: 0,
  defeated: 0,
  gold: 0,
};
const assets = {};
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

// 重建角色层中的宝箱、敌人和玩家精灵。
function renderPlayer() {
  actorLayer.removeChildren();

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

  const player = new PIXI.Sprite(assets.player);
  player.x = state.player.x * TILE_SIZE;
  player.y = state.player.y * TILE_SIZE;
  actorLayer.addChild(player);
}

// 将游戏状态同步到 HUD 文本。
function updateHud() {
  document.querySelector('#position').textContent = `位置 ${state.player.x}, ${state.player.y}`;
  document.querySelector('#moves').textContent = `移动 ${state.moves}`;
  document.querySelector('#seed').textContent = `种子 ${state.seed}`;
  document.querySelector('#defeated').textContent = `击败 ${state.defeated}`;
  document.querySelector('#gold').textContent = `金币 ${state.gold}`;
}

// 应用后端返回的新状态，并刷新所有可视区域。
function applyGameState(nextState) {
  state.map = nextState.map;
  state.player = nextState.player;
  state.enemies = nextState.enemies;
  state.chests = nextState.chests;
  state.seed = nextState.seed;
  state.moves = nextState.moves;
  state.defeated = nextState.defeated;
  state.gold = nextState.gold;
  renderMap();
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
    applyGameState(await invoke('player_action', { action }));
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
  board.addChild(mapLayer, actorLayer);
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

  // 让角色层产生轻微的呼吸效果。
  app.ticker.add(() => {
    actorLayer.alpha = 0.94 + Math.sin(app.ticker.lastTime / 180) * 0.06;
  });

  // 同时支持方向键和 WASD 移动。
  window.addEventListener('keydown', (event) => {
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

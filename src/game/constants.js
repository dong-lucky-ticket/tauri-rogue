// 每个地图网格在 Pixi 画布中占用的像素尺寸。
export const TILE_SIZE = 32;
// 前端渲染使用的地图宽度，必须与 Rust state.rs 保持一致。
export const MAP_WIDTH = 25;
// 前端渲染使用的地图高度，必须与 Rust state.rs 保持一致。
export const MAP_HEIGHT = 17;
// 地图未缩放时的像素宽度。
export const BOARD_WIDTH = MAP_WIDTH * TILE_SIZE;
// 地图未缩放时的像素高度。
export const BOARD_HEIGHT = MAP_HEIGHT * TILE_SIZE;

// 长按方向键时，两次移动请求之间的最小间隔。
// 该限制在前端输入层执行，避免连续请求过快导致操作体验失控。
export const MOVE_REPEAT_INTERVAL_MS = 120;

// Rust 返回的回合阶段值与玩家可读中文之间的映射。
export const PHASE_LABELS = {
  player_input: '玩家行动',
  enemy_warning: '敌人预警',
  enemy_action: '敌人行动',
  damage_resolution: '伤害结算',
  animation: '动画播放',
};

// F4 调试模式使用的阶段延迟。
// 正常模式会跳过这些等待，调试模式才逐阶段停留观察。
export const PHASE_DELAYS = {
  enemy_warning: 110,
  enemy_action: 110,
  damage_resolution: 150,
  animation: 70,
};

// Rust 返回的关卡类型值与 HUD 文案之间的映射。
export const FLOOR_TYPE_LABELS = {
  standard: '普通层',
  supply: '补给层',
  elite: '精英层',
};

// 前端运行时状态的初始结构。
// Rust 返回 GameState 后，runtime.applyGameState 会把 snake_case 字段转换成这里的 camelCase。
export const INITIAL_STATE = {
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
  floorType: 'standard',
  seed: 0,
  moves: 0,
  defeated: 0,
  gold: 0,
  turnPhase: 'player_input',
  pendingDamage: 0,
  hp: 5,
  maxHp: 5,
  gameOver: false,
  lastEvent: '',
};

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

// Rust 返回的关卡类型值与 HUD 文案之间的映射。
export const FLOOR_TYPE_LABELS = {
  standard: '普通层',
  supply: '补给层',
  elite: '精英层',
};

// 前端运行时状态的初始结构。
// Rust 返回 GameState 后，runtime.applyGameState 会把 snake_case 字段转换成这里的 camelCase。
export const INITIAL_STATE = {
  // 地图网格数据。每一行对应地图的 y 坐标，true 表示可行走地板。
  map: [],
  // 地图生成出的房间矩形，仅在 F3 调试层中用于显示房间边界和编号。
  rooms: [],
  // 地图生成出的走廊连接信息，仅在 F3 调试层中用于显示 L 形走廊。
  corridors: [],
  // 玩家当前所在的网格坐标。
  player: { x: 0, y: 0 },
  // 当前关卡中尚未被击败的敌人列表。
  enemies: [],
  // 当前关卡中的宝箱列表，包含位置和是否已开启状态。
  chests: [],
  // 连接下一关的门户状态。
  portal: {
    // 门户所在的网格坐标。
    position: { x: 0, y: 0 },
    // 只有所有敌人被击败且所有宝箱开启后才会变为 true。
    active: false,
  },
  // 当前关卡编号，从第 1 关开始递增。
  level: 1,
  // 当前关卡类型，对应 standard、supply 或 elite。
  floorType: 'standard',
  // 当前关卡的随机种子，用于复现地图和实体布局。
  seed: 0,
  // 玩家已经执行的行动次数，撞墙也会消耗一次行动。
  moves: 0,
  // 当前游戏会话累计击败的敌人数量，进入下一关后继续保留。
  defeated: 0,
  // 当前游戏会话累计获得的金币数量，进入下一关后继续保留。
  gold: 0,
  // 当前回合阶段，前端据此锁定输入并推进敌人回合。
  turnPhase: 'player_input',
  // 敌人本回合准备造成的总伤害，在伤害结算阶段前暂存。
  pendingDamage: 0,
  // 玩家当前生命值，降为 0 时进入死亡状态。
  hp: 5,
  // 玩家当前最大生命值上限，关卡成长会逐步提升该数值。
  maxHp: 5,
  // 玩家是否已经死亡；为 true 时输入层不会继续提交有效行动。
  gameOver: false,
  // 最近一次行动产生的事件文本，用于 HUD 展示战斗和探索反馈。
  lastEvent: '',
};

export const TILE_SIZE = 32;
export const MAP_WIDTH = 25;
export const MAP_HEIGHT = 17;
export const BOARD_WIDTH = MAP_WIDTH * TILE_SIZE;
export const BOARD_HEIGHT = MAP_HEIGHT * TILE_SIZE;

export const MOVE_REPEAT_INTERVAL_MS = 120;

export const PHASE_LABELS = {
  player_input: '玩家行动',
  enemy_warning: '敌人预警',
  enemy_action: '敌人行动',
  damage_resolution: '伤害结算',
  animation: '动画播放',
};

export const PHASE_DELAYS = {
  enemy_warning: 110,
  enemy_action: 110,
  damage_resolution: 150,
  animation: 70,
};

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

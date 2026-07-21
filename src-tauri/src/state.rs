use serde::{Deserialize, Serialize};

pub const MAP_WIDTH: usize = 25;
pub const MAP_HEIGHT: usize = 17;

// 前端提交给 Rust 的玩家动作。命令参数使用 snake_case 序列化名称。
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlayerAction {
    MoveUp,
    MoveDown,
    MoveLeft,
    MoveRight,
}

// 一回合中的阶段状态，由前端据此决定何时播放预警、位移和受击动画。
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnPhase {
    PlayerInput,
    EnemyWarning,
    EnemyAction,
    DamageResolution,
    Animation,
}

// 关卡类型决定本关的敌人配置、宝箱数量和回复强度。
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FloorType {
    Standard,
    Supply,
    Elite,
}

// 敌人的简化状态机，用于表达当前是在待机、追击还是准备攻击。
// `Hit` 和 `Dead` 已为后续受击硬直、死亡演出预留，因此暂时允许未被完整使用。
#[allow(dead_code)]
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EnemyMode {
    Patrol,
    Alert,
    Windup,
    Attack,
    Hit,
    Dead,
}

// 敌人在本回合中准备执行的意图类型。
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EnemyIntentKind {
    Wait,
    Move,
    Attack,
}

// 敌人的单回合意图，前端据此显示预警标记和动作表现。
#[derive(Clone, Copy, Serialize)]
pub struct EnemyIntent {
    pub kind: EnemyIntentKind,
    pub target: Option<Position>,
}

// 游戏网格中的二维坐标。
#[derive(Clone, Copy, Default, Serialize)]
pub struct Position {
    pub x: usize,
    pub y: usize,
}

// 地图生成阶段保留的房间矩形，用于调试可视化。
#[derive(Clone, Copy, Serialize)]
pub struct Room {
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub height: usize,
}

// 两个房间之间的 L 形走廊路径。
#[derive(Clone, Copy, Serialize)]
pub struct Corridor {
    pub start: Position,
    pub bend: Position,
    pub end: Position,
}

// 游戏中的敌人实体。
#[derive(Clone, Serialize)]
pub struct Enemy {
    // 敌人的稳定标识，用于前端在多个回合之间匹配同一个敌人。
    pub id: u32,
    // 敌人当前所在的网格坐标。
    pub position: Position,
    // 敌人类型标识，后续可用于选择不同的 AI 和素材。
    pub kind: String,
    // 敌人当前所处的行为状态，用于表现层区分追击与攻击。
    pub mode: EnemyMode,
    // 敌人在本回合已经规划好的动作意图。
    pub intent: EnemyIntent,
    // 精英敌人会造成更高伤害，避免精英层只是增加普通敌人数量。
    pub damage: u32,
    // 是否为精英敌人，前端可据此使用更醒目的渲染表现。
    pub elite: bool,
}

// 游戏中的宝箱实体。
#[derive(Clone, Serialize)]
pub struct Chest {
    pub position: Position,
    pub opened: bool,
}

// 连接下一关的门户。只有清理完本关实体后才会激活。
#[derive(Clone, Serialize)]
pub struct Portal {
    pub position: Position,
    pub active: bool,
}

// 前后端共享的完整游戏状态。
#[derive(Clone, Serialize)]
pub struct GameState {
    // 地图网格；true 表示该格是可行走地板，false 表示墙体或未生成区域。
    pub map: Vec<Vec<bool>>,
    // 地图生成出的房间矩形，供前端调试层显示房间边界。
    pub rooms: Vec<Room>,
    // 地图生成出的走廊连接信息，供前端调试层显示走廊路径。
    pub corridors: Vec<Corridor>,
    // 玩家当前所在的网格坐标。
    pub player: Position,
    // 当前关卡中尚未被击败的敌人实体。
    pub enemies: Vec<Enemy>,
    // 当前关卡中的宝箱及其是否已开启状态。
    pub chests: Vec<Chest>,
    // 连接下一关的门户及其当前位置和激活状态。
    pub portal: Portal,
    // 当前关卡编号，从第一关开始递增。
    pub level: u32,
    // 当前关卡类型，用于前端展示本关的玩法重点。
    pub floor_type: FloorType,
    // 当前关卡使用的随机种子，可用于复现地图。
    pub seed: u32,
    // 玩家已经执行的行动次数，撞墙也会消耗一次行动。
    pub moves: u32,
    // 当前游戏会话累计击败的敌人数量。
    pub defeated: u32,
    // 当前游戏会话累计获得的金币数量。
    pub gold: u32,
    // 玩家当前生命值，降为零时进入死亡状态。
    pub hp: u32,
    // 玩家本关使用的最大生命值上限。
    pub max_hp: u32,
    // 玩家是否已经死亡；为 true 时会暂时禁止继续行动。
    pub game_over: bool,
    // 最近一次行动产生的事件文本，用于显示给前端玩家。
    pub last_event: String,
    // 当前回合所处的阶段，前端会按这个阶段推进表现和输入锁定。
    pub turn_phase: TurnPhase,
    // 敌人在本回合累计准备造成的伤害，延迟到伤害结算阶段统一生效。
    pub pending_damage: u32,
}

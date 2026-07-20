use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

const MAP_WIDTH: usize = 25;
const MAP_HEIGHT: usize = 17;

// 前端发送的移动指令，序列化名称使用 snake_case。
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PlayerAction {
    MoveUp,
    MoveDown,
    MoveLeft,
    MoveRight,
}

// 地图中的二维网格坐标。
#[derive(Clone, Copy, Default, Serialize)]
struct Position {
    x: usize,
    y: usize,
}

// 敌人的位置和类型。
#[derive(Clone, Serialize)]
struct Enemy {
    position: Position,
    kind: String,
}

// 宝箱的位置以及是否已经打开。
#[derive(Clone, Serialize)]
struct Chest {
    position: Position,
    opened: bool,
}

// 前后端共享的完整游戏状态。
#[derive(Clone, Serialize)]
struct GameState {
    map: Vec<Vec<bool>>, // 地牢地图。二维数组中, true 表示地板，可以行走, false 表示墙壁或不可行走区域
    player: Position, // 玩家当前位置，包含 x 和 y 坐标
    enemies: Vec<Enemy>, // 敌人列表。每个敌人包含位置和类型，例如哥布林。
    chests: Vec<Chest>, // 宝箱列表。每个宝箱包含位置以及是否已经打开。
    seed: u32, // 生成当前地牢使用的随机种子。相同种子可以生成相同地图。
    moves: u32, // 玩家已经执行的行动次数，包括撞墙或越界的无效移动。
    defeated: u32, // 已经击败的敌人数量。
    gold: u32, // 玩家当前获得的金币数量。打开一个宝箱增加 10 金币
}

// Tauri 应用中保存的当前游戏会话。
#[derive(Default)]
struct GameSession {
    state: Option<GameState>,
}

// 使用线性同余算法生成可复现的伪随机数。
fn seeded_random(seed: &mut u32) -> f32 {
    *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    *seed as f32 / u32::MAX as f32
}

// 创建房间和走廊，并返回地图、出生点及可放置物体的地板位置。
fn create_map(seed: u32) -> (Vec<Vec<bool>>, Position, Vec<Position>) {
    let mut random_seed = seed;
    let mut map = vec![vec![false; MAP_WIDTH]; MAP_HEIGHT];
    let mut rooms: Vec<(usize, usize, usize, usize)> = Vec::new();

    // 连续生成多个房间，并把当前房间与上一个房间连接起来。
    for _ in 0..8 {
        let width = 4 + (seeded_random(&mut random_seed) * 5.0) as usize;
        let height = 3 + (seeded_random(&mut random_seed) * 4.0) as usize;
        let x = 1 + (seeded_random(&mut random_seed) * (MAP_WIDTH - width - 2) as f32) as usize;
        let y = 1 + (seeded_random(&mut random_seed) * (MAP_HEIGHT - height - 2) as f32) as usize;

        for row in y..y + height {
            for column in x..x + width {
                map[row][column] = true;
            }
        }

        // 通过两个房间中心点之间的折线路径生成走廊。
        if let Some(previous) = rooms.last().copied() {
            let start_x = previous.0 + previous.2 / 2;
            let start_y = previous.1 + previous.3 / 2;
            let end_x = x + width / 2;
            let end_y = y + height / 2;

            for column in start_x.min(end_x)..=start_x.max(end_x) {
                map[start_y][column] = true;
            }
            for row in start_y.min(end_y)..=start_y.max(end_y) {
                map[row][end_x] = true;
            }
        }

        println!("x：{}，y：{}，width：{}，height：{}", x, y, width, height);
        rooms.push((x, y, width, height));
    }

    // 第一间房间的中心作为玩家出生点。
    let first_room = rooms[0];
    let start = Position {
        x: first_room.0 + first_room.2 / 2,
        y: first_room.1 + first_room.3 / 2,
    };

    // 收集除出生点外的地板位置，供敌人和宝箱占用。
    let mut floor_positions = Vec::new();
    for y in 0..MAP_HEIGHT {
        for x in 0..MAP_WIDTH {
            if map[y][x] && (x != start.x || y != start.y) {
                floor_positions.push(Position { x, y });
            }
        }
    }

    (map, start, floor_positions)
}

// 判断坐标是否在地图内且属于可行走地板。
fn can_walk(map: &[Vec<bool>], x: isize, y: isize) -> bool {
    x >= 0
        && y >= 0
        && (x as usize) < MAP_WIDTH
        && (y as usize) < MAP_HEIGHT
        && map[y as usize][x as usize]
}

// 创建新地牢并初始化敌人、宝箱和计分数据。
#[tauri::command]
fn new_dungeon(seed: u32, session: State<'_, Mutex<GameSession>>) -> GameState {
    let (map, player, mut floor_positions) = create_map(seed);
    let mut random_seed = seed.wrapping_add(7);
    // 取出后移除候选位置，避免多个实体重叠。
    let mut take_position = || {
        let index = (seeded_random(&mut random_seed) * floor_positions.len() as f32) as usize;
        Some(floor_positions.swap_remove(index.min(floor_positions.len() - 1)))
    };
    let enemies = (0..3)
        .filter_map(|_| take_position())
        .map(|position| Enemy {
            position,
            kind: "goblin".to_string(),
        })
        .collect();
    let chests = (0..2)
        .filter_map(|_| take_position())
        .map(|position| Chest {
            position,
            opened: false,
        })
        .collect();

    let state = GameState {
        map,
        player,
        enemies,
        chests,
        seed,
        moves: 0,
        defeated: 0,
        gold: 0,
    };

    session.lock().expect("game session lock poisoned").state = Some(state.clone());
    state
}

// 处理玩家的一次移动，并返回更新后的完整状态。
#[tauri::command]
fn player_action(
    action: PlayerAction,
    session: State<'_, Mutex<GameSession>>,
) -> Result<GameState, String> {
    let mut session = session.lock().map_err(|_| "game session lock poisoned")?;
    let state = session
        .state
        .as_mut()
        .ok_or_else(|| "start a dungeon before sending actions".to_string())?;

    // 将方向指令转换成网格坐标增量。
    let (dx, dy) = match action {
        PlayerAction::MoveUp => (0, -1),
        PlayerAction::MoveDown => (0, 1),
        PlayerAction::MoveLeft => (-1, 0),
        PlayerAction::MoveRight => (1, 0),
    };

    let next_x = state.player.x as isize + dx;
    let next_y = state.player.y as isize + dy;

    // 撞墙或越界仍消耗行动次数，但玩家位置不变。
    if !can_walk(&state.map, next_x, next_y) {
        state.moves += 1;
        return Ok(state.clone());
    }

    state.moves += 1;
    let next_position = Position {
        x: next_x as usize,
        y: next_y as usize,
    };

    // 走到敌人位置时击败敌人，否则移动玩家并处理宝箱。
    if let Some(enemy_index) = state.enemies.iter().position(|enemy| {
        enemy.position.x == next_position.x && enemy.position.y == next_position.y
    }) {
        state.enemies.remove(enemy_index);
        state.defeated += 1;
    } else {
        state.player.x = next_x as usize;
        state.player.y = next_y as usize;

        if let Some(chest) = state.chests.iter_mut().find(|chest| {
            chest.position.x == next_position.x && chest.position.y == next_position.y
        }) {
            if !chest.opened {
                chest.opened = true;
                state.gold += 10;
            }
        }
    }

    Ok(state.clone())
}

// 配置 Tauri 状态、插件以及前端可调用的命令。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(GameSession::default()))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![new_dungeon, player_action])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

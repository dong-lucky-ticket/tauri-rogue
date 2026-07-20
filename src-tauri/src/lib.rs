use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

const MAP_WIDTH: usize = 25;
const MAP_HEIGHT: usize = 17;

// 前端提交给 Rust 的玩家动作。命令参数使用 snake_case 序列化名称。
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PlayerAction {
    MoveUp,
    MoveDown,
    MoveLeft,
    MoveRight,
}

// 游戏网格中的二维坐标。
#[derive(Clone, Copy, Default, Serialize)]
struct Position {
    x: usize,
    y: usize,
}

// 地图生成阶段保留的房间矩形，用于调试可视化。
#[derive(Clone, Copy, Serialize)]
struct Room {
    x: usize,
    y: usize,
    width: usize,
    height: usize,
}

// 两个房间之间的 L 形走廊路径。
#[derive(Clone, Copy, Serialize)]
struct Corridor {
    start: Position,
    bend: Position,
    end: Position,
}

// 游戏中的敌人实体。
#[derive(Clone, Serialize)]
struct Enemy {
    position: Position,
    kind: String,
}

// 游戏中的宝箱实体。
#[derive(Clone, Serialize)]
struct Chest {
    position: Position,
    opened: bool,
}

// 连接下一关的门户。只有清理完本关实体后才会激活。
#[derive(Clone, Serialize)]
struct Portal {
    position: Position,
    active: bool,
}

// 前后端共享的完整游戏状态。
#[derive(Clone, Serialize)]
struct GameState {
    map: Vec<Vec<bool>>,
    rooms: Vec<Room>,
    corridors: Vec<Corridor>,
    player: Position,
    enemies: Vec<Enemy>,
    chests: Vec<Chest>,
    portal: Portal,
    level: u32,
    seed: u32,
    moves: u32,
    defeated: u32,
    gold: u32,
}

// Tauri 应用中保存当前游戏会话的状态容器。
#[derive(Default)]
struct GameSession {
    state: Option<GameState>,
}

// 使用线性同余算法生成可复现的伪随机数。
fn seeded_random(seed: &mut u32) -> f32 {
    *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    *seed as f32 / u32::MAX as f32
}

// 生成房间、走廊和可放置实体的地板坐标。
// rooms 和 corridors 会随 GameState 发送到前端，用于 F3 调试层。
fn create_map(
    seed: u32,
) -> (
    Vec<Vec<bool>>,
    Position,
    Vec<Position>,
    Vec<Room>,
    Vec<Corridor>,
) {
    let mut random_seed = seed;
    let mut map = vec![vec![false; MAP_WIDTH]; MAP_HEIGHT];
    let mut rooms: Vec<Room> = Vec::new();
    let mut corridors: Vec<Corridor> = Vec::new();

    // 生成固定数量的随机房间。
    for _ in 0..8 {
        let width = 4 + (seeded_random(&mut random_seed) * 5.0) as usize;
        let height = 3 + (seeded_random(&mut random_seed) * 4.0) as usize;
        let x = 1 + (seeded_random(&mut random_seed) * (MAP_WIDTH - width - 2) as f32) as usize;
        let y = 1 + (seeded_random(&mut random_seed) * (MAP_HEIGHT - height - 2) as f32) as usize;
        let room = Room {
            x,
            y,
            width,
            height,
        };

        for row in y..y + height {
            for column in x..x + width {
                map[row][column] = true;
            }
        }

        // 将当前房间中心与上一个房间中心连接成一条 L 形走廊。
        if let Some(previous) = rooms.last().copied() {
            let start_x = previous.x + previous.width / 2;
            let start_y = previous.y + previous.height / 2;
            let end_x = x + width / 2;
            let end_y = y + height / 2;

            for column in start_x.min(end_x)..=start_x.max(end_x) {
                map[start_y][column] = true;
            }
            for row in start_y.min(end_y)..=start_y.max(end_y) {
                map[row][end_x] = true;
            }

            corridors.push(Corridor {
                start: Position {
                    x: start_x,
                    y: start_y,
                },
                bend: Position {
                    x: end_x,
                    y: start_y,
                },
                end: Position { x: end_x, y: end_y },
            });
        }

        rooms.push(room);
    }

    // 第一个房间的中心作为玩家出生点。
    let first_room = rooms[0];
    let start = Position {
        x: first_room.x + first_room.width / 2,
        y: first_room.y + first_room.height / 2,
    };

    // 收集除出生点以外的所有地板格，供实体随机占用。
    let mut floor_positions = Vec::new();
    for y in 0..MAP_HEIGHT {
        for x in 0..MAP_WIDTH {
            if map[y][x] && (x != start.x || y != start.y) {
                floor_positions.push(Position { x, y });
            }
        }
    }

    (map, start, floor_positions, rooms, corridors)
}

// 判断坐标是否在地图范围内，并且对应格子是可行走地板。
fn can_walk(map: &[Vec<bool>], x: isize, y: isize) -> bool {
    x >= 0
        && y >= 0
        && (x as usize) < MAP_WIDTH
        && (y as usize) < MAP_HEIGHT
        && map[y as usize][x as usize]
}

// 根据实体处理结果更新门户激活状态。
fn refresh_portal(state: &mut GameState) {
    state.portal.active = state.enemies.is_empty() && state.chests.iter().all(|chest| chest.opened);
}

// 使用指定种子创建一个完整关卡。
fn build_level(seed: u32, level: u32) -> GameState {
    let (map, player, mut floor_positions, rooms, corridors) = create_map(seed);
    let mut random_seed = seed.wrapping_add(7);

    // 取出一个地板坐标后立即移除，避免多个实体重叠。
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
    let portal_position = take_position().unwrap_or(player);

    GameState {
        map,
        rooms,
        corridors,
        player,
        enemies,
        chests,
        portal: Portal {
            position: portal_position,
            active: false,
        },
        level,
        seed,
        moves: 0,
        defeated: 0,
        gold: 0,
    }
}

// 创建新地牢，初始化第一关的游戏状态。
#[tauri::command]
fn new_dungeon(seed: u32, session: State<'_, Mutex<GameSession>>) -> GameState {
    let state = build_level(seed, 1);
    session.lock().expect("game session lock poisoned").state = Some(state.clone());
    state
}

// 处理一次玩家动作。移动判定、攻击、宝箱拾取和回合数更新都在 Rust 中完成。
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

    let (dx, dy) = match action {
        PlayerAction::MoveUp => (0, -1),
        PlayerAction::MoveDown => (0, 1),
        PlayerAction::MoveLeft => (-1, 0),
        PlayerAction::MoveRight => (1, 0),
    };

    let next_x = state.player.x as isize + dx;
    let next_y = state.player.y as isize + dy;

    // 即使撞墙，动作也会消耗一个回合，方便后续接入敌人回合制 AI。
    state.moves += 1;

    if !can_walk(&state.map, next_x, next_y) {
        return Ok(state.clone());
    }

    let next_position = Position {
        x: next_x as usize,
        y: next_y as usize,
    };

    // 走向敌人时执行当前原型中的近战攻击。
    if let Some(enemy_index) = state.enemies.iter().position(|enemy| {
        enemy.position.x == next_position.x && enemy.position.y == next_position.y
    }) {
        state.enemies.remove(enemy_index);
        state.defeated += 1;
    } else {
        // 没有敌人时移动玩家，并检查目标格上的宝箱。
        state.player = next_position;

        if let Some(chest) = state.chests.iter_mut().find(|chest| {
            chest.position.x == next_position.x && chest.position.y == next_position.y
        }) {
            if !chest.opened {
                chest.opened = true;
                // 当前原型每个宝箱固定奖励 10 金币。
                state.gold += 10;
            }
        }
    }

    refresh_portal(state);
    Ok(state.clone())
}

// 进入已激活的门户后生成下一关，并继承累计金币和总击败数。
#[tauri::command]
fn next_level(session: State<'_, Mutex<GameSession>>) -> Result<GameState, String> {
    let (current_seed, current_level, current_gold, current_defeated) = {
        let session = session.lock().map_err(|_| "game session lock poisoned")?;
        let state = session
            .state
            .as_ref()
            .ok_or_else(|| "start a dungeon before entering the next level".to_string())?;
        if !state.portal.active {
            return Err("clear all enemies and open all chests first".to_string());
        }
        (state.seed, state.level, state.gold, state.defeated)
    };

    let next_seed = current_seed
        .wrapping_add(0x9e37_79b9)
        .wrapping_add(current_level.wrapping_mul(7_919));
    let mut next_state = build_level(next_seed, current_level + 1);
    next_state.gold = current_gold;
    next_state.defeated = current_defeated;

    let mut session = session.lock().map_err(|_| "game session lock poisoned")?;
    session.state = Some(next_state.clone());
    Ok(next_state)
}

// 创建 Tauri 应用、注册共享状态和前端可调用的命令。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(GameSession::default()))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            new_dungeon,
            player_action,
            next_level
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
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

// 一回合中的阶段状态，由前端据此决定何时播放预警、位移和受击动画。
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum TurnPhase {
    PlayerInput,
    EnemyWarning,
    EnemyAction,
    DamageResolution,
    Animation,
}

// 敌人的简化状态机，用于表达当前是在待机、追击还是准备攻击。
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum EnemyMode {
    Idle,
    Chasing,
    Attacking,
}

// 敌人在本回合中准备执行的意图类型。
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum EnemyIntentKind {
    Wait,
    Move,
    Attack,
}

// 敌人的单回合意图，前端据此显示预警标记和动作表现。
#[derive(Clone, Copy, Serialize)]
struct EnemyIntent {
    kind: EnemyIntentKind,
    target: Option<Position>,
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
    // 敌人的稳定标识，用于前端在多个回合之间匹配同一个敌人。
    id: u32,
    // 敌人当前所在的网格坐标。
    position: Position,
    // 敌人类型标识，后续可用于选择不同的 AI 和素材。
    kind: String,
    // 敌人当前所处的行为状态，用于表现层区分追击与攻击。
    mode: EnemyMode,
    // 敌人在本回合已经规划好的动作意图。
    intent: EnemyIntent,
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
    // 地图网格；true 表示该格是可行走地板，false 表示墙体或未生成区域。
    map: Vec<Vec<bool>>,
    // 地图生成出的房间矩形，供前端调试层显示房间边界。
    rooms: Vec<Room>,
    // 地图生成出的走廊连接信息，供前端调试层显示走廊路径。
    corridors: Vec<Corridor>,
    // 玩家当前所在的网格坐标。
    player: Position,
    // 当前关卡中尚未被击败的敌人实体。
    enemies: Vec<Enemy>,
    // 当前关卡中的宝箱及其是否已开启状态。
    chests: Vec<Chest>,
    // 连接下一关的门户及其当前位置和激活状态。
    portal: Portal,
    // 当前关卡编号，从第一关开始递增。
    level: u32,
    // 当前关卡使用的随机种子，可用于复现地图。
    seed: u32,
    // 玩家已经执行的行动次数，撞墙也会消耗一次行动。
    moves: u32,
    // 当前游戏会话累计击败的敌人数量。
    defeated: u32,
    // 当前游戏会话累计获得的金币数量。
    gold: u32,
    // 玩家当前生命值，降为零时进入死亡状态。
    hp: u32,
    // 玩家本关使用的最大生命值上限。
    max_hp: u32,
    // 玩家是否已经死亡；为 true 时会暂时禁止继续行动。
    game_over: bool,
    // 最近一次行动产生的事件文本，用于显示给前端玩家。
    last_event: String,
    // 当前回合所处的阶段，前端会按这个阶段推进表现和输入锁定。
    turn_phase: TurnPhase,
    // 敌人在本回合累计准备造成的伤害，延迟到伤害结算阶段统一生效。
    pending_damage: u32,
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

// 判断两个网格坐标是否相同。
fn same_position(first: Position, second: Position) -> bool {
    first.x == second.x && first.y == second.y
}

// 判断一个位置是否已经被其他敌人占用。
fn enemy_at_except(enemies: &[Enemy], position: Position, excluded_index: usize) -> bool {
    enemies
        .iter()
        .enumerate()
        .any(|(index, enemy)| index != excluded_index && same_position(enemy.position, position))
}

// 将敌人重置为默认待机状态，避免上一回合的意图残留到下一回合。
fn reset_enemy_state(enemy: &mut Enemy) {
    enemy.mode = EnemyMode::Idle;
    enemy.intent = EnemyIntent {
        kind: EnemyIntentKind::Wait,
        target: None,
    };
}

// 使用 BFS 搜索敌人到玩家的最短路径，并返回路径上的下一格。
// 地图规模较小，每次敌人回合重新搜索可以换取清晰且可靠的追踪逻辑。
fn find_enemy_next_step(
    map: &[Vec<bool>],
    enemies: &[Enemy],
    enemy_index: usize,
    start: Position,
    target: Position,
) -> Option<Position> {
    let mut queue = VecDeque::new();
    let mut visited = vec![vec![false; MAP_WIDTH]; MAP_HEIGHT];
    let mut previous = vec![vec![None; MAP_WIDTH]; MAP_HEIGHT];
    let directions: [(isize, isize); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];

    visited[start.y][start.x] = true;
    queue.push_back(start);

    while let Some(current) = queue.pop_front() {
        for (dx, dy) in directions {
            let next_x = current.x as isize + dx;
            let next_y = current.y as isize + dy;

            if !can_walk(map, next_x, next_y) {
                continue;
            }

            let next = Position {
                x: next_x as usize,
                y: next_y as usize,
            };

            if visited[next.y][next.x]
                || enemy_at_except(enemies, next, enemy_index)
                || same_position(next, start)
            {
                continue;
            }

            visited[next.y][next.x] = true;
            previous[next.y][next.x] = Some(current);

            if same_position(next, target) {
                let mut step = next;

                // 从目标格反向回溯，直到找到紧邻起点的第一格。
                while let Some(parent) = previous[step.y][step.x] {
                    if same_position(parent, start) {
                        return Some(step);
                    }
                    step = parent;
                }
            }

            queue.push_back(next);
        }
    }

    None
}

// 判断当前是否存在需要在后续阶段执行的敌人意图。
fn has_enemy_plan(state: &GameState) -> bool {
    state
        .enemies
        .iter()
        .any(|enemy| enemy.intent.kind != EnemyIntentKind::Wait)
}

// 在玩家行动结束后为每个敌人规划本回合的动作。
fn plan_enemy_turn(state: &mut GameState) {
    if state.game_over {
        return;
    }

    let player_position = state.player;
    let mut planned_attackers = 0;
    let mut planned_movers = 0;

    for index in 0..state.enemies.len() {
        let enemy_position = state.enemies[index].position;
        let distance = enemy_position.x.abs_diff(player_position.x)
            + enemy_position.y.abs_diff(player_position.y);

        reset_enemy_state(&mut state.enemies[index]);

        if distance == 1 {
            state.enemies[index].mode = EnemyMode::Attacking;
            state.enemies[index].intent = EnemyIntent {
                kind: EnemyIntentKind::Attack,
                target: Some(player_position),
            };
            planned_attackers += 1;
            continue;
        }

        if let Some(next_step) = find_enemy_next_step(
            &state.map,
            &state.enemies,
            index,
            enemy_position,
            player_position,
        ) {
            state.enemies[index].mode = EnemyMode::Chasing;
            state.enemies[index].intent = EnemyIntent {
                kind: EnemyIntentKind::Move,
                target: Some(next_step),
            };
            planned_movers += 1;
        }
    }

    state.pending_damage = 0;

    if planned_attackers > 0 {
        state.turn_phase = TurnPhase::EnemyWarning;
        state.last_event = format!("危险！有 {planned_attackers} 个哥布林正准备攻击。");
    } else if planned_movers > 0 {
        // 普通游戏中前端会立即推进该阶段；只有 F4 调试模式才会停下来观察它。
        state.turn_phase = TurnPhase::EnemyWarning;
        state.last_event = format!("{planned_movers} 个哥布林开始移动。");
    } else {
        state.turn_phase = TurnPhase::PlayerInput;
    }
}

// 在敌人行动阶段执行已经规划好的移动和攻击意图。
fn execute_enemy_actions(state: &mut GameState) {
    let mut occupied_positions = state
        .enemies
        .iter()
        .map(|enemy| enemy.position)
        .collect::<Vec<_>>();
    let mut moved_count = 0;
    let mut attack_count = 0;

    for index in 0..state.enemies.len() {
        let current_position = state.enemies[index].position;
        let intent = state.enemies[index].intent;

        match intent.kind {
            EnemyIntentKind::Attack => {
                attack_count += 1;
            }
            EnemyIntentKind::Move => {
                if let Some(target) = intent.target {
                    occupied_positions
                        .retain(|position| !same_position(*position, current_position));

                    if !occupied_positions
                        .iter()
                        .any(|position| same_position(*position, target))
                        && !same_position(target, state.player)
                    {
                        state.enemies[index].position = target;
                        moved_count += 1;
                        occupied_positions.push(target);
                    } else {
                        occupied_positions.push(current_position);
                    }
                }
            }
            EnemyIntentKind::Wait => {}
        }
    }

    state.pending_damage = attack_count;
    state.turn_phase = TurnPhase::EnemyAction;

    if attack_count > 0 && moved_count > 0 {
        state.last_event = format!("哥布林完成包围，{attack_count} 次攻击即将命中。");
    } else if attack_count > 0 {
        state.last_event = format!("哥布林发起了 {attack_count} 次攻击。");
    } else if moved_count > 0 {
        state.last_event = format!("{moved_count} 个哥布林完成了移动。");
    }
}

// 在伤害结算阶段统一扣除生命值，并处理死亡结果。
fn resolve_enemy_damage(state: &mut GameState) {
    if state.pending_damage > 0 {
        state.hp = state.hp.saturating_sub(state.pending_damage);
        state.last_event = format!("哥布林攻击了你，生命值 -{}。", state.pending_damage);
        if state.hp == 0 {
            state.game_over = true;
            state.last_event = "你倒下了。点击“重新生成地牢”再试一次。".to_string();
        }

        state.turn_phase = TurnPhase::DamageResolution;
        return;
    }

    // 本回合没有受到伤害时，直接进入动画收尾阶段，避免额外停顿。
    state.turn_phase = TurnPhase::Animation;
}

// 动画播放结束后清理敌人意图，并把控制权归还给玩家。
fn finish_turn(state: &mut GameState) {
    for enemy in &mut state.enemies {
        reset_enemy_state(enemy);
    }

    state.pending_damage = 0;
    state.turn_phase = TurnPhase::PlayerInput;

    if !state.game_over && state.portal.active {
        state.last_event = "所有目标已处理，门户已经激活。".to_string();
    }
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
        .enumerate()
        .map(|(id, position)| Enemy {
            id: id as u32,
            position,
            kind: "goblin".to_string(),
            mode: EnemyMode::Idle,
            intent: EnemyIntent {
                kind: EnemyIntentKind::Wait,
                target: None,
            },
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
        hp: 5,
        max_hp: 5,
        game_over: false,
        last_event: "清理哥布林并打开宝箱，激活门户。".to_string(),
        turn_phase: TurnPhase::PlayerInput,
        pending_damage: 0,
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

    // 死亡后暂时锁定玩家操作，避免在重开前继续修改状态。
    if state.game_over {
        return Ok(state.clone());
    }

    if state.turn_phase != TurnPhase::PlayerInput {
        return Err("wait until the current turn finishes resolving".to_string());
    }

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
        state.last_event = "你撞到了墙。".to_string();
        plan_enemy_turn(state);
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
        state.last_event = "你击败了一个哥布林。".to_string();
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
                state.last_event = "你打开了宝箱，获得 10 金币。".to_string();
            }
        }
    }

    refresh_portal(state);
    if state.portal.active {
        state.last_event = "所有目标已处理，门户已经激活。".to_string();
        state.turn_phase = TurnPhase::PlayerInput;
    } else {
        // 玩家完成行动后，先规划敌人回合，再由前端逐阶段推进。
        plan_enemy_turn(state);
    }
    Ok(state.clone())
}

// 推进正式回合阶段，让前端能够依次播放预警、动作和受击表现。
#[tauri::command]
fn advance_turn_phase(session: State<'_, Mutex<GameSession>>) -> Result<GameState, String> {
    let mut session = session.lock().map_err(|_| "game session lock poisoned")?;
    let state = session
        .state
        .as_mut()
        .ok_or_else(|| "start a dungeon before advancing turn phases".to_string())?;

    match state.turn_phase {
        TurnPhase::PlayerInput => return Ok(state.clone()),
        TurnPhase::EnemyWarning => {
            if has_enemy_plan(state) {
                execute_enemy_actions(state);
            } else {
                state.turn_phase = TurnPhase::PlayerInput;
            }
        }
        TurnPhase::EnemyAction => {
            resolve_enemy_damage(state);
        }
        TurnPhase::DamageResolution => {
            state.turn_phase = TurnPhase::Animation;
            if !state.game_over {
                state.last_event = "本回合动作已经结算完毕。".to_string();
            }
        }
        TurnPhase::Animation => {
            finish_turn(state);
        }
    }

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
            advance_turn_phase,
            next_level
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

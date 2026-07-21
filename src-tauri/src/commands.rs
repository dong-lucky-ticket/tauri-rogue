use std::sync::Mutex;

use tauri::State;

use crate::combat::{
    execute_enemy_actions, finish_turn, has_enemy_plan, plan_enemy_turn, refresh_portal,
    resolve_enemy_damage,
};
use crate::map::{can_walk, create_map, seeded_random};
use crate::state::{
    Chest, Enemy, EnemyIntent, EnemyIntentKind, EnemyMode, FloorType, GameState, PlayerAction,
    Portal, Position, TurnPhase,
};

// Tauri 应用中保存当前游戏会话的状态容器。
#[derive(Default)]
pub struct GameSession {
    pub state: Option<GameState>,
}

// 每关根据层数生成难度参数，避免所有关卡都使用同一套敌人数和补给量。
struct DifficultyProfile {
    floor_type: FloorType,
    enemy_count: usize,
    elite_enemy_count: usize,
    chest_count: usize,
    max_hp: u32,
    chest_heal: u32,
    low_hp_chest_heal: u32,
    chest_heal_chance: f32,
    low_hp_chest_heal_chance: f32,
    floor_clear_heal: u32,
}

// 难度曲线采用“敌人数量逐步增长，回复只做小幅补给”的方式。
// 这样玩家不会每层满血重开，但也能通过探索和通关获得一定续航。
fn difficulty_for_level(level: u32) -> DifficultyProfile {
    let floor_type = if level > 1 && level % 5 == 0 {
        FloorType::Elite
    } else if level > 1 && level % 3 == 0 {
        FloorType::Supply
    } else {
        FloorType::Standard
    };

    let (
        enemy_count,
        elite_enemy_count,
        chest_count,
        chest_heal,
        low_hp_chest_heal,
        chest_heal_chance,
        low_hp_chest_heal_chance,
        floor_clear_heal,
    ) = match floor_type {
        // 普通层维持稳定压力，是最常见的基础关卡。
        FloorType::Standard => (3 + level.saturating_sub(1) / 2, 0, 2, 1, 2, 0.45, 0.7, 1),
        // 补给层降低敌人数量，但提供更多宝箱和更强的回血。
        FloorType::Supply => (2 + level.saturating_sub(1) / 2, 0, 4, 2, 3, 0.65, 0.85, 1),
        // 精英层不盲目增加数量，而是加入一个造成 2 点伤害的精英敌人。
        FloorType::Elite => (3 + level.saturating_sub(1) / 2, 1, 2, 1, 2, 0.4, 0.65, 1),
    };

    DifficultyProfile {
        floor_type,
        // 敌人数量逐步增加，但设置上限避免后期变成单纯的堆怪。
        enemy_count: enemy_count.min(7) as usize,
        elite_enemy_count: elite_enemy_count.min(enemy_count) as usize,
        chest_count,
        // 每 3 关提升 1 点生命上限，给中后期一点成长空间。
        max_hp: 5 + level.saturating_sub(1) / 3,
        // 普通血量时的宝箱回复，满血时不会产生溢出治疗。
        chest_heal,
        // 低于或等于半血时，宝箱提供更高的回复量，但仍然需要通过概率判定。
        low_hp_chest_heal,
        // 随着关卡难度提升，过关回复从 1 点提升到 2 点，但不重置为满血。
        chest_heal_chance,
        low_hp_chest_heal_chance,
        floor_clear_heal: if level >= 4 { 2 } else { floor_clear_heal },
    }
}

// 根据关卡种子、回合和宝箱位置生成可复现的回血概率结果。
// 使用确定性随机数可以保证同一局游戏不会因为前端调用时机不同而改变规则。
fn roll_chest_heal(
    state: &GameState,
    chest_position: Position,
    difficulty: &DifficultyProfile,
) -> Option<u32> {
    let mut seed = state
        .seed
        .wrapping_add(state.moves.wrapping_mul(31))
        .wrapping_add((chest_position.x as u32).wrapping_mul(17))
        .wrapping_add((chest_position.y as u32).wrapping_mul(13));
    let low_hp = state.hp <= state.max_hp.div_ceil(2);
    let chance = if low_hp {
        difficulty.low_hp_chest_heal_chance
    } else {
        difficulty.chest_heal_chance
    };

    (seeded_random(&mut seed) < chance).then_some(if low_hp {
        difficulty.low_hp_chest_heal
    } else {
        difficulty.chest_heal
    })
}

// 使用指定种子创建一个完整关卡。
fn build_level(seed: u32, level: u32) -> GameState {
    let (map, player, mut floor_positions, rooms, corridors) = create_map(seed);
    let mut random_seed = seed.wrapping_add(7);
    let difficulty = difficulty_for_level(level);

    // 取出一个地板坐标后立即移除，避免多个实体重叠。
    let mut take_position = || {
        let index = (seeded_random(&mut random_seed) * floor_positions.len() as f32) as usize;
        Some(floor_positions.swap_remove(index.min(floor_positions.len() - 1)))
    };

    let enemies = (0..difficulty.enemy_count)
        .filter_map(|_| take_position())
        .enumerate()
        .map(|(id, position)| {
            let elite = id < difficulty.elite_enemy_count;
            Enemy {
                id: id as u32,
                position,
                kind: if elite {
                    "elite_goblin".to_string()
                } else {
                    "goblin".to_string()
                },
                mode: EnemyMode::Patrol,
                intent: EnemyIntent {
                    kind: EnemyIntentKind::Wait,
                    target: None,
                },
                damage: if elite { 2 } else { 1 },
                elite,
            }
        })
        .collect();
    let chests = (0..difficulty.chest_count)
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
        hp: difficulty.max_hp,
        max_hp: difficulty.max_hp,
        game_over: false,
        floor_type: difficulty.floor_type,
        last_event: "清理哥布林并打开宝箱，激活门户。".to_string(),
        turn_phase: TurnPhase::PlayerInput,
        pending_damage: 0,
    }
}

// 创建新地牢，初始化第一关的游戏状态。
#[tauri::command]
pub fn new_dungeon(seed: u32, session: State<'_, Mutex<GameSession>>) -> GameState {
    let state = build_level(seed, 1);
    session.lock().expect("game session lock poisoned").state = Some(state.clone());
    state
}

// 处理一次玩家动作。移动判定、攻击、宝箱拾取和回合数更新都在 Rust 中完成。
#[tauri::command]
pub fn player_action(
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

        if let Some(chest_index) = state.chests.iter().position(|chest| {
            chest.position.x == next_position.x && chest.position.y == next_position.y
        }) {
            if !state.chests[chest_index].opened {
                let difficulty = difficulty_for_level(state.level);
                let chest_position = state.chests[chest_index].position;
                state.chests[chest_index].opened = true;
                // 当前原型每个宝箱固定奖励 10 金币。
                state.gold += 10;
                let hp_before = state.hp;
                let healing = roll_chest_heal(state, chest_position, &difficulty);
                if let Some(chest_heal) = healing {
                    state.hp = (state.hp + chest_heal).min(state.max_hp);
                }
                if state.hp > hp_before {
                    state.last_event = format!(
                        "你打开了宝箱，获得 10 金币，并回复 {} 点生命。",
                        state.hp - hp_before
                    );
                } else {
                    state.last_event =
                        "你打开了宝箱，获得 10 金币，但这次没有找到生命补给。".to_string();
                }
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
pub fn advance_turn_phase(session: State<'_, Mutex<GameSession>>) -> Result<GameState, String> {
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
pub fn next_level(session: State<'_, Mutex<GameSession>>) -> Result<GameState, String> {
    let (current_seed, current_level, current_gold, current_defeated, current_hp, current_max_hp) = {
        let session = session.lock().map_err(|_| "game session lock poisoned")?;
        let state = session
            .state
            .as_ref()
            .ok_or_else(|| "start a dungeon before entering the next level".to_string())?;
        if !state.portal.active {
            return Err("clear all enemies and open all chests first".to_string());
        }
        (
            state.seed,
            state.level,
            state.gold,
            state.defeated,
            state.hp,
            state.max_hp,
        )
    };

    let next_seed = current_seed
        .wrapping_add(0x9e37_79b9)
        .wrapping_add(current_level.wrapping_mul(7_919));
    let mut next_state = build_level(next_seed, current_level + 1);
    let next_difficulty = difficulty_for_level(current_level + 1);
    next_state.gold = current_gold;
    next_state.defeated = current_defeated;
    next_state.max_hp = current_max_hp.max(next_difficulty.max_hp);
    next_state.hp = (current_hp + next_difficulty.floor_clear_heal).min(next_state.max_hp);
    next_state.last_event = format!(
        "你进入了第 {} 关，并在转场时回复了 {} 点生命。",
        next_state.level, next_difficulty.floor_clear_heal
    );

    let mut session = session.lock().map_err(|_| "game session lock poisoned")?;
    session.state = Some(next_state.clone());
    Ok(next_state)
}

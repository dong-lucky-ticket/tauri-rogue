use std::sync::Mutex;

use tauri::State;

use crate::combat::{
    execute_enemy_actions, finish_turn, has_enemy_plan, plan_enemy_turn, refresh_portal,
    resolve_enemy_damage,
};
use crate::map::{can_walk, create_map, seeded_random};
use crate::state::{
    Chest, Enemy, EnemyIntent, EnemyIntentKind, EnemyMode, GameState, PlayerAction, Portal,
    Position, TurnPhase,
};

// Tauri 应用中保存当前游戏会话的状态容器。
#[derive(Default)]
pub struct GameSession {
    pub state: Option<GameState>,
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
            mode: EnemyMode::Patrol,
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

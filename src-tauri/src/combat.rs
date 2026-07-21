use std::collections::VecDeque;

use crate::map::can_walk;
use crate::state::{
    Enemy, EnemyIntent, EnemyIntentKind, EnemyMode, GameState, Position, TurnPhase, MAP_HEIGHT,
    MAP_WIDTH,
};

// 根据实体处理结果更新门户激活状态。
pub fn refresh_portal(state: &mut GameState) {
    state.portal.active = state.enemies.is_empty() && state.chests.iter().all(|chest| chest.opened);
}

// 判断两个网格坐标是否相同。
pub fn same_position(first: Position, second: Position) -> bool {
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
    enemy.mode = EnemyMode::Patrol;
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
pub fn has_enemy_plan(state: &GameState) -> bool {
    state
        .enemies
        .iter()
        .any(|enemy| enemy.intent.kind != EnemyIntentKind::Wait)
}

// 在玩家行动结束后为每个敌人规划本回合的动作。
pub fn plan_enemy_turn(state: &mut GameState) {
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
            state.enemies[index].mode = EnemyMode::Windup;
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
            state.enemies[index].mode = EnemyMode::Alert;
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
pub fn execute_enemy_actions(state: &mut GameState) {
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
                state.enemies[index].mode = EnemyMode::Attack;
                attack_count += 1;
            }
            EnemyIntentKind::Move => {
                state.enemies[index].mode = EnemyMode::Alert;
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

    // 普通敌人造成 1 点伤害，精英敌人造成 2 点伤害。
    state.pending_damage = state
        .enemies
        .iter()
        .filter(|enemy| enemy.intent.kind == EnemyIntentKind::Attack)
        .map(|enemy| enemy.damage)
        .sum();
    state.turn_phase = TurnPhase::EnemyAction;

    if attack_count > 0 && moved_count > 0 {
        state.last_event = format!(
            "敌人完成包围，{attack_count} 次攻击即将命中，共造成 {} 点伤害。",
            state.pending_damage
        );
    } else if attack_count > 0 {
        state.last_event = format!(
            "敌人发起了 {attack_count} 次攻击，共造成 {} 点伤害。",
            state.pending_damage
        );
    } else if moved_count > 0 {
        state.last_event = format!("{moved_count} 个哥布林完成了移动。");
    }
}

// 在伤害结算阶段统一扣除生命值，并处理死亡结果。
pub fn resolve_enemy_damage(state: &mut GameState) {
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
pub fn finish_turn(state: &mut GameState) {
    for enemy in &mut state.enemies {
        reset_enemy_state(enemy);
    }

    state.pending_damage = 0;
    state.turn_phase = TurnPhase::PlayerInput;

    if !state.game_over && state.portal.active {
        state.last_event = "所有目标已处理，门户已经激活。".to_string();
    }
}

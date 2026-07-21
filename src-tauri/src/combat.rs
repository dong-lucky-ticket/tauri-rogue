use std::collections::VecDeque;

use crate::map::can_walk;
use crate::state::{
    Enemy, EnemyIntent, EnemyIntentKind, EnemyMode, GameState, Position, TurnPhase, MAP_HEIGHT,
    MAP_WIDTH,
};

// 根据实体处理结果更新门户激活状态。
pub fn refresh_portal(state: &mut GameState) {
    // 门户只有在敌人全部被击败、宝箱全部打开后才可进入。
    // 该判断集中在后端，避免前端通过显示状态绕过关卡规则。
    state.portal.active = state.enemies.is_empty() && state.chests.iter().all(|chest| chest.opened);
}

// 判断两个网格坐标是否相同。
pub fn same_position(first: Position, second: Position) -> bool {
    first.x == second.x && first.y == second.y
}

// 判断一个位置是否已经被其他敌人占用。
fn enemy_at_except(enemies: &[Enemy], position: Position, excluded_index: usize) -> bool {
    // 搜索路径时允许当前敌人继续站在自己的起点上，
    // 但不能走到其他敌人已经占据的格子，避免实体重叠。
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
    // queue 保存待扩展的网格位置，BFS 会按距离由近到远访问地图。
    let mut queue = VecDeque::new();
    // visited 防止同一格被重复加入队列，降低搜索开销。
    let mut visited = vec![vec![false; MAP_WIDTH]; MAP_HEIGHT];
    // previous 记录每个格子是从哪个格子走过来的，用于最终反向还原路径。
    let mut previous = vec![vec![None; MAP_WIDTH]; MAP_HEIGHT];
    // 只允许四方向移动，不允许斜向穿越墙角。
    let directions: [(isize, isize); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];

    // 从敌人当前位置开始搜索。
    visited[start.y][start.x] = true;
    queue.push_back(start);

    while let Some(current) = queue.pop_front() {
        for (dx, dy) in directions {
            // 使用 isize 计算邻居，允许从边界位置向外探测后由 can_walk 拦截。
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
                // 已经访问过、被其他敌人占用或回到起点的格子不能重复处理。
                continue;
            }

            visited[next.y][next.x] = true;
            previous[next.y][next.x] = Some(current);

            if same_position(next, target) {
                let mut step = next;

                // 从目标格反向回溯，直到找到紧邻起点的第一格。
                while let Some(parent) = previous[step.y][step.x] {
                    if same_position(parent, start) {
                        // step 是从起点出发时应该执行的第一步，而不是最终目标格。
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
        // 玩家死亡后不再为敌人规划新动作。
        return;
    }

    // 所有敌人共享玩家在本回合结束时的位置，保证同一批 AI 决策使用同一快照。
    let player_position = state.player;
    let mut planned_attackers = 0;
    let mut planned_movers = 0;

    for index in 0..state.enemies.len() {
        let enemy_position = state.enemies[index].position;
        let distance = enemy_position.x.abs_diff(player_position.x)
            + enemy_position.y.abs_diff(player_position.y);

        // 每次重新规划前先清理上一回合的状态和意图。
        reset_enemy_state(&mut state.enemies[index]);

        if distance == 1 {
            // 与玩家相邻时优先攻击，不再继续寻找移动路径。
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
            // 找到最短路径时只记录下一格，真正移动会在 EnemyAction 阶段执行。
            state.enemies[index].mode = EnemyMode::Alert;
            state.enemies[index].intent = EnemyIntent {
                kind: EnemyIntentKind::Move,
                target: Some(next_step),
            };
            planned_movers += 1;
        }
    }

    // 伤害要等 EnemyAction 和 DamageResolution 阶段才会产生，
    // 因此预警阶段只能展示意图，不能提前扣血。
    state.pending_damage = 0;

    if planned_attackers > 0 {
        state.turn_phase = TurnPhase::EnemyWarning;
        state.last_event = format!("危险！有 {planned_attackers} 个哥布林正准备攻击。");
    } else if planned_movers > 0 {
        state.turn_phase = TurnPhase::EnemyWarning;
        state.last_event = format!("{planned_movers} 个哥布林开始移动。");
    } else {
        state.turn_phase = TurnPhase::PlayerInput;
    }
}

// 在敌人行动阶段执行已经规划好的移动和攻击意图。
pub fn execute_enemy_actions(state: &mut GameState) {
    // occupied_positions 是本次执行期间的临时占用表。
    // 敌人按照数组顺序依次行动，先行动的敌人会优先占据目标格。
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
                // 攻击意图只切换表现状态，实际伤害统一在后续阶段结算。
                state.enemies[index].mode = EnemyMode::Attack;
                attack_count += 1;
            }
            EnemyIntentKind::Move => {
                // 移动阶段重新检查目标格，防止多个敌人规划到同一个位置。
                state.enemies[index].mode = EnemyMode::Alert;
                if let Some(target) = intent.target {
                    occupied_positions
                        .retain(|position| !same_position(*position, current_position));

                    if !occupied_positions
                        .iter()
                        .any(|position| same_position(*position, target))
                        && !same_position(target, state.player)
                    {
                        // 目标格无人占用且不是玩家位置，才真正提交移动结果。
                        state.enemies[index].position = target;
                        moved_count += 1;
                        occupied_positions.push(target);
                    } else {
                        // 如果目标格已被抢占，敌人留在原地等待下一回合重新规划。
                        occupied_positions.push(current_position);
                    }
                }
            }
            EnemyIntentKind::Wait => {}
        }
    }

    // 普通敌人造成 1 点伤害，精英敌人造成 2 点伤害。
    // 只统计本回合具有 Attack 意图的敌人，避免待机或移动敌人误伤玩家。
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
        // 使用 saturating_sub，保证伤害超过当前生命时结果稳定为 0。
        state.hp = state.hp.saturating_sub(state.pending_damage);
        state.last_event = format!("哥布林攻击了你，生命值 -{}。", state.pending_damage);
        if state.hp == 0 {
            // 生命归零后锁定游戏状态，前端显示死亡遮罩并等待重开。
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
        // 动画结束后清除 Windup/Attack 等本回合状态，
        // 让下一次玩家输入从统一的 Patrol/Wait 状态开始。
        reset_enemy_state(enemy);
    }

    // 本回合的临时伤害已经结算，下一回合重新计算。
    state.pending_damage = 0;
    // 将输入控制权交还给前端玩家。
    state.turn_phase = TurnPhase::PlayerInput;

    if !state.game_over && state.portal.active {
        state.last_event = "所有目标已处理，门户已经激活。".to_string();
    }
}

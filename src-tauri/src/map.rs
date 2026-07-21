use crate::state::{Corridor, Position, Room, MAP_HEIGHT, MAP_WIDTH};

// 使用线性同余算法生成可复现的伪随机数。
pub fn seeded_random(seed: &mut u32) -> f32 {
    *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    *seed as f32 / u32::MAX as f32
}

// 生成房间、走廊和可放置实体的地板坐标。
// rooms 和 corridors 会随 GameState 发送到前端，用于 F3 调试层。
pub fn create_map(
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
pub fn can_walk(map: &[Vec<bool>], x: isize, y: isize) -> bool {
    x >= 0
        && y >= 0
        && (x as usize) < MAP_WIDTH
        && (y as usize) < MAP_HEIGHT
        && map[y as usize][x as usize]
}

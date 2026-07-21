use crate::state::{Corridor, Position, Room, MAP_HEIGHT, MAP_WIDTH};

// 使用线性同余算法生成可复现的伪随机数。
// 这里不追求密码学安全，只需要同一个种子每次生成相同的地图和实体位置。
pub fn seeded_random(seed: &mut u32) -> f32 {
    // wrapping_* 可以在 u32 溢出时继续按模 2^32 运算，避免随机种子溢出导致程序异常。
    *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    // 将整数种子归一化到 0.0~1.0，用于计算房间尺寸、位置和实体索引。
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
    // 地图生成和实体摆放必须使用独立的可变种子，避免直接修改调用方传入的 seed。
    let mut random_seed = seed;
    // false 代表墙体或未生成区域，true 代表可行走地板。
    let mut map = vec![vec![false; MAP_WIDTH]; MAP_HEIGHT];
    // rooms 保存房间矩形，供调试层显示边界和编号。
    let mut rooms: Vec<Room> = Vec::new();
    // corridors 保存房间之间的 L 形连接，供调试层显示生成路径。
    let mut corridors: Vec<Corridor> = Vec::new();

    // 生成固定数量的随机房间。
    for _ in 0..8 {
        // 房间宽度范围为 4~8 格。
        let width = 4 + (seeded_random(&mut random_seed) * 5.0) as usize;
        // 房间高度范围为 3~6 格。
        let height = 3 + (seeded_random(&mut random_seed) * 4.0) as usize;
        // 房间位置预留一格边界，避免房间贴到地图外框。
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
                // 房间内部全部标记为地板；房间重叠时重复写入不会产生副作用。
                map[row][column] = true;
            }
        }

        // 将当前房间中心与上一个房间中心连接成一条 L 形走廊。
        // 先横向走到目标 x，再纵向走到目标 y，保证相邻房间可达。
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
                // 出生点已经被玩家占用，因此不加入可随机摆放实体的位置池。
                floor_positions.push(Position { x, y });
            }
        }
    }

    (map, start, floor_positions, rooms, corridors)
}

// 判断坐标是否在地图范围内，并且对应格子是可行走地板。
pub fn can_walk(map: &[Vec<bool>], x: isize, y: isize) -> bool {
    // 先检查边界，再访问 map 下标，避免负数转换为 usize 后造成越界。
    x >= 0
        && y >= 0
        && (x as usize) < MAP_WIDTH
        && (y as usize) < MAP_HEIGHT
        && map[y as usize][x as usize]
}

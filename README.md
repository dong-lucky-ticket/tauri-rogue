# Tiles Dungeon

这是一个使用 **Tauri 2 + Rust + Pixi.js + Vite + Yarn** 制作的 2D 地牢游戏练习项目。

项目目标不是一次做完完整商业游戏，而是通过一个可运行、可反复扩展的地牢原型，练习：

- Tauri 桌面应用结构
- Rust 和前端之间的命令通信
- Pixi.js 的地图、实体和特效渲染
- 随机地牢生成
- 回合制敌人行为与阶段推进
- 前后端共享游戏状态
- 调试可视化与可复现随机种子

## 当前功能

当前版本已经实现：

- Rust 生成随机房间和 L 形走廊
- Pixi.js 使用 `TilesDungeon` 资源渲染地板和墙体
- 玩家、哥布林、宝箱和门户素材来自 `Dungeon Crawl Stone Soup Full`
- 玩家可用 `WASD` 或方向键移动
- 玩家撞墙、攻击、开箱、进下一关都由 Rust 判定
- 哥布林使用最短路径追踪玩家
- 玩家击败所有敌人并开启所有宝箱后激活门户
- 进入门户后自动生成下一关，并继承金币与累计击败数
- 玩家与敌人拥有基础待机动画和战斗表现
- 玩家受击有红屏、飘字、生命值警示色
- 敌人拥有 `patrol / alert / windup / attack / hit / dead` 状态结构
- 敌人回合按阶段推进：

```text
玩家行动
-> 敌人预警
-> 敌人行动
-> 伤害结算
-> 动画播放
-> 玩家行动
```

- `F3` 显示房间边界、房间编号和走廊路径
- `F4` 开启回合调试模式，显示阶段信息和敌人意图覆盖层
- 长按方向键时已限制重复触发频率，避免移动过快

## 运行环境

建议准备以下工具：

- Node.js
- Yarn
- Rust stable toolchain
- Tauri 2 所需的系统开发环境
- VS Code
- `rust-analyzer`

检查工具：

```powershell
node --version
yarn --version
rustc --version
cargo --version
```

如果 PowerShell 拦截 `yarn`，请改用：

```powershell
yarn.cmd --version
```

## 安装依赖

进入项目根目录：

```powershell
cd D:\demos\rust\my-roguelike
```

安装前端依赖：

```powershell
yarn.cmd install
```

## 启动项目

### 启动完整桌面应用

```powershell
yarn.cmd tauri dev
```

这个命令会：

1. 启动 Vite 开发服务器
2. 编译 Rust 后端
3. 启动 Tauri 窗口
4. 将前端页面加载到桌面窗口中

### 只启动前端

```powershell
yarn.cmd dev
```

只启动前端时，`invoke()` 无法正常访问 Tauri 后端，所以开发实际游戏功能时优先使用：

```powershell
yarn.cmd tauri dev
```

### 构建前端

```powershell
yarn.cmd build
```

### 检查 Rust

```powershell
cd src-tauri
cargo fmt -- --check
cargo check
```

## 项目结构

当前项目已经从“单文件原型”拆成了按职责分工的结构。

```text
my-roguelike/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── src/
│   ├── main.js
│   ├── styles.css
│   ├── game/
│   │   ├── assets.js
│   │   ├── constants.js
│   │   ├── context.js
│   │   ├── input.js
│   │   ├── rendering.js
│   │   └── runtime.js
│   └── assets/
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── state.rs
        ├── map.rs
        ├── combat.rs
        └── commands.rs
```

## 前端结构说明

### `src/main.js`

只做前端启动与装配：

- 创建游戏上下文
- 初始化 Pixi 应用
- 挂载容器
- 加载资源
- 启动第一局
- 启动 ticker
- 绑定输入

### `src/game/constants.js`

保存前端稳定常量：

- 地图逻辑尺寸
- 像素尺寸
- 回合阶段文字
- 调试阶段延迟
- 长按移动节流间隔

### `src/game/context.js`

创建共享上下文，集中保存：

- Pixi `Application`
- 各层容器
- 前端缓存的 `state`
- 纹理资源
- 精灵引用
- 动画集合
- 调试开关和输入节流标记

这样拆开以后，各模块不需要再自己重新创建全局变量。

### `src/game/assets.js`

只负责导入和加载贴图资源。

这里不会写游戏逻辑，也不会写输入逻辑。

### `src/game/rendering.js`

负责所有“看得见的内容”：

- 地图渲染
- 调试层渲染
- 实体渲染
- 敌人意图覆盖层
- HUD 更新
- 伤害飘字
- 玩家攻击特效
- 敌人攻击特效
- 敌人死亡停留与淡出
- ticker 中的待机、攻击和状态位移动画

这部分可以理解为“表现层”。

### `src/game/runtime.js`

负责前端运行时逻辑：

- 把 Rust 返回的新状态应用到前端缓存
- 调用 `new_dungeon`
- 调用 `player_action`
- 调用 `advance_turn_phase`
- 自动推进回合阶段

可以把它理解为“前端的规则调度层”，但真正的规则判定仍然在 Rust。

### `src/game/input.js`

负责：

- 键盘输入
- `F3` 地图调试切换
- `F4` 回合调试切换
- 长按方向键节流
- 新地牢和重新开始按钮绑定

## Rust 结构说明

### `src-tauri/src/lib.rs`

现在只保留：

- 模块声明
- Tauri `run()` 入口
- 命令注册

它不再直接承载全部地图、战斗和状态代码。

### `src-tauri/src/state.rs`

负责定义核心数据结构：

- `PlayerAction`
- `TurnPhase`
- `EnemyMode`
- `EnemyIntent`
- `Position`
- `Room`
- `Corridor`
- `Enemy`
- `Chest`
- `Portal`
- `GameState`

如果你要扩展前后端共享数据，优先从这里改。

### `src-tauri/src/map.rs`

负责地图基础规则：

- 随机数生成
- 房间和走廊生成
- 地板坐标收集
- `can_walk()` 判定

如果你以后要把“随机房间 + L 形走廊”改成 BSP、随机游走或其他算法，主要改这里。

### `src-tauri/src/combat.rs`

负责战斗与回合阶段逻辑：

- 门户激活判定
- 坐标比较
- 敌人最短路径搜索
- 敌人回合意图规划
- 敌人动作执行
- 伤害结算
- 回合收尾

如果要扩展敌人 AI、攻击方式或受击逻辑，主要改这里。

### `src-tauri/src/commands.rs`

负责 Tauri 命令入口：

- `new_dungeon`
- `player_action`
- `advance_turn_phase`
- `next_level`

这里还负责：

- `GameSession`
- 初始化整关 `build_level()`

也就是说，命令入口和游戏流程装配集中在这里，而不是散落在各个模块里。

## 前后端通信

当前前端通过 Tauri `invoke()` 调用四个命令：

### `new_dungeon`

创建第一关：

```js
const state = await invoke('new_dungeon', { seed: 12345 });
```

### `player_action`

提交一次玩家动作：

```js
const state = await invoke('player_action', { action: 'move_right' });
```

支持的动作：

```text
move_up
move_down
move_left
move_right
```

### `advance_turn_phase`

推进一回合中的阶段：

```js
const nextState = await invoke('advance_turn_phase');
```

普通模式下前端会快速连调到 `player_input`，`F4` 调试模式下会分阶段延迟推进。

### `next_level`

进入下一关：

```js
const nextState = await invoke('next_level');
```

## 当前 `GameState`

当前前后端共享状态已经比最早版本更完整：

```rust
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
    hp: u32,
    max_hp: u32,
    game_over: bool,
    last_event: String,
    turn_phase: TurnPhase,
    pending_damage: u32,
}
```

新增的重要字段：

- `hp / max_hp`：生命值
- `game_over`：死亡状态
- `last_event`：最近事件文本
- `turn_phase`：当前回合阶段
- `pending_damage`：待结算伤害

## 地图生成原理

地图逻辑尺寸：

```rust
pub const MAP_WIDTH: usize = 25;
pub const MAP_HEIGHT: usize = 17;
```

每个网格单元在 Pixi 中使用：

```js
const TILE_SIZE = 32;
```

所以地图逻辑尺寸对应像素大小：

```text
25 × 32 = 800
17 × 32 = 544
```

当前算法是：

1. 创建一张全部为墙的网格
2. 随机生成 8 个房间
3. 将房间区域标记为地板
4. 把当前房间中心和上一个房间中心连接成 L 形走廊
5. 收集除出生点外的地板坐标
6. 放置敌人、宝箱和门户

## 回合阶段与调试模式

正常模式下，玩家不会感觉到明显的“阶段停顿”，因为前端会快速跑完：

```text
enemy_warning
-> enemy_action
-> damage_resolution
-> animation
-> player_input
```

按下 `F4` 后，会开启回合调试模式：

- 顶部 HUD 显示当前阶段
- 敌人相邻时显示 `!`
- 敌人的移动意图会显示为箭头和目标格高亮
- 敌人的攻击意图会显示为攻击范围和路线
- 阶段会按延迟逐步推进，方便观察 AI

按下 `F3` 后，会开启地图调试模式：

- 房间边界
- 房间编号
- 走廊路径

## 输入与长按频率

当前支持：

- `WASD`
- 方向键

长按方向键时，前端会做固定节流：

```js
const MOVE_REPEAT_INTERVAL_MS = 120;
```

这意味着长按时大约每 **120ms** 最多触发一次移动。

## 当前战斗表现层

当前已经接入以下表现：

- 玩家待机呼吸、浮动、轻微旋转
- 门户脉冲和旋转
- 玩家攻击斩击线
- 敌人攻击轨迹和命中火花
- 玩家受击红屏和扣血飘字
- 敌人死亡停留、染色、轻微击退和淡出
- 敌人 `alert / windup / attack` 三个阶段拥有不同动作幅度

这部分全部在前端表现层完成，不会影响 Rust 的规则判定。

## 验证命令

提交代码前建议执行：

```powershell
cd src-tauri
cargo fmt -- --check
cargo check

cd ..
yarn.cmd build
```

## 推荐开发顺序

现在项目结构已经更适合继续扩展，推荐下一步按下面顺序推进：

1. 给 `hit` 增加真正的受击硬直状态同步
2. 给 `dead` 增加更完整的尸体或消散演出
3. 增加第二类敌人，验证当前拆分后的扩展性
4. 给玩家增加正式攻击动作和回位动作
5. 给地图增加房间类型和特殊房
6. 给门户增加过场或转场动画
7. 再考虑节拍系统或存档系统

## 常见问题

### `yarn` 被 PowerShell 拦截

改用：

```powershell
yarn.cmd tauri dev
```

### `invoke()` 调用失败

确认你用的是：

```powershell
yarn.cmd tauri dev
```

而不是单独运行：

```powershell
yarn.cmd dev
```

### 中文乱码

请确保以下文件都以 UTF-8 保存：

- `README.md`
- `index.html`
- `src/main.js`
- `src/styles.css`
- `src/game/*.js`
- `src-tauri/src/*.rs`

### 调试时看不到阶段信息

按：

```text
F4
```

回合调试模式关闭时，阶段信息和敌人意图覆盖层默认不显示。

### 修改地图尺寸后渲染异常

前后端要一起改：

- `src-tauri/src/state.rs`
- `src/game/constants.js`

否则会出现：

- 越界
- 墙体显示错位
- HUD 缩放计算异常

## 代码边界原则

当前项目遵循这个边界：

```text
Rust 决定规则
前端决定表现
```

更具体一点：

- Rust 负责“能不能移动、有没有打中、是否扣血、能否进下一关”
- 前端负责“怎么画出来、动画怎么播、调试信息怎么显示”

只要一直守住这条边界，项目继续变复杂时就不容易失控。

## 难度与关卡类型

当前关卡不会全部使用同一套敌人和补给配置，`src-tauri/src/commands.rs` 中的
`difficulty_for_level()` 会根据关卡编号选择类型：

- `standard` 普通层：敌人数和宝箱数量按基础曲线增长。
- `supply` 补给层：每 3 关出现一次，敌人相对少，但有 4 个宝箱，宝箱和过关回复更高。
- `elite` 精英层：每 5 关出现一次，其中包含一个精英敌人。精英敌人使用现有哥布林素材放大并染色，同时每次攻击造成 2 点伤害。

玩家不会在进入下一关时满血重置。当前回血规则如下：

- 普通宝箱有概率回复 1 点生命，不保证每次都触发。
- 当生命值低于或等于最大生命的一半时，普通宝箱的回血概率会提高，但不会达到 100%。
- 补给层宝箱的基础回血概率更高，低血量时会进一步提高，但同样不会保证触发。
- 过关回复会随着难度提升从 1 点增加到 2 点，但不会超过最大生命。
- 每 3 关提升 1 点最大生命，作为长期成长。

这套设计让普通层承担战斗压力，补给层负责调整资源状态，精英层提供高风险挑战，玩家需要决定是尽快找门户，还是先探索宝箱恢复生命。

## 难度与关卡类型

当前关卡不会全部使用同一套敌人和补给配置，`src-tauri/src/commands.rs` 中的
`difficulty_for_level()` 会根据关卡编号选择类型：

- `standard` 普通层：敌人数和宝箱数量按基础曲线增长。
- `supply` 补给层：每 3 关出现一次，敌人相对少，但有 4 个宝箱，宝箱和过关回复更高。
- `elite` 精英层：每 5 关出现一次，其中包含一个精英敌人。精英敌人使用现有哥布林素材放大并染色，同时每次攻击造成 2 点伤害。

玩家不会在进入下一关时满血重置。当前回血规则如下：

- 普通宝箱回复 1 点生命。
- 当生命值低于或等于最大生命的一半时，普通宝箱回复 2 点生命。
- 补给层宝箱平时回复 2 点生命，低血量时回复 3 点生命。
- 进入下一关时按关卡类型回复 1~2 点生命，但不会超过最大生命。
- 每 3 关提升 1 点最大生命，作为长期成长。

这套设计让普通层承担战斗压力，补给层负责调整资源状态，精英层提供高风险挑战，玩家需要决定是尽快找门户，还是先探索宝箱恢复生命。

# Tiles Dungeon

这是一个使用 **Tauri 2 + Rust + Pixi.js + Vite + Yarn** 制作的 2D 地牢游戏练习项目。

项目的目标不是一次完成完整商业游戏，而是通过一个小型、可运行的地牢原型，学习以下内容：

- Tauri 桌面应用的基本结构
- Rust 与前端之间的命令通信
- Pixi.js 的 2D 渲染和精灵管理
- 随机地牢地图生成
- 玩家、敌人、宝箱和门户等游戏实体
- 前后端共享游戏状态
- 调试可视化和可复现随机种子

## 当前功能

当前版本已经实现：

- Rust 生成随机房间和走廊
- Pixi.js 使用 `TilesDungeon` 资源渲染地板和墙体
- 玩家使用 `Dungeon Crawl Stone Soup Full` 中的角色素材
- 玩家可以使用 `WASD` 或方向键移动
- Rust 负责移动合法性和墙体碰撞
- 玩家走向哥布林时执行一次近战攻击
- 玩家走到宝箱位置时自动打开宝箱并获得金币
- 所有敌人被击败、所有宝箱被打开后激活门户
- 玩家进入门户后自动生成下一关
- 下一关继承累计金币和击败数量
- 玩家有简单的呼吸、浮动、缩放和倾斜动画
- `F3` 显示房间边界、房间编号和走廊路径
- HUD 显示位置、关卡、回合、击败数、金币和门户状态

当前**还没有真正的节拍系统**：

- 没有 BPM
- 没有 Rust `beat` 事件
- 没有节拍输入窗口
- 玩家动作仍然由键盘输入直接触发

现在的 `moves` 只是动作/回合计数，不是节拍计时器。

## 运行环境

建议准备以下工具：

- Node.js
- Yarn
- Rust stable toolchain
- Tauri 2 所需的系统开发环境
- VS Code
- `rust-analyzer` 插件

检查工具是否可用：

```powershell
node --version
yarn --version
rustc --version
cargo --version
```

在 Windows PowerShell 中，如果直接执行 `yarn` 被执行策略拦截，可以使用：

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

主要依赖如下：

- `pixi.js`：负责游戏画面、精灵、图形和动画
- `@tauri-apps/api`：前端调用 Tauri 命令
- `@tauri-apps/cli`：启动和构建 Tauri 应用
- `vite`：前端开发服务器和构建工具
- `tauri`：Rust 桌面应用框架
- `serde`：Rust 游戏状态序列化

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

只启动前端时可以查看 HTML/CSS，但前端调用 `invoke()` 时没有 Tauri Rust 后端，游戏命令通常无法正常执行。

因此，开发实际游戏功能时优先使用：

```powershell
yarn.cmd tauri dev
```

### 构建前端

```powershell
yarn.cmd build
```

### 桌面构建命令

```powershell
# 本地快速构建：生成前端产物和 Tauri 可执行文件，但不生成安装包
yarn.cmd build:desktop

# 本地显式使用本地配置构建：效果同上，bundle.active = false
yarn.cmd build:desktop:local

# 正式发版构建：生成安装包，当前只保留 nsis 输出
yarn.cmd build:desktop:release
```

说明：

- `build:desktop` 适合日常开发自测，速度更快，并且不会输出 `src-tauri/target/release/bundle` 下的安装包文件。
- `build:desktop:local` 会读取 `src-tauri/tauri.local.conf.json`，显式关闭 bundling，便于后续继续扩展本地构建专用配置。
- `build:desktop:release` 会读取 `src-tauri/tauri.release.conf.json`，保留正式发版需要的 bundling，但只生成 `nsis`，避免同时输出 `msi` 和 `nsis`。

### 检查 Rust

```powershell
cd src-tauri
cargo fmt -- --check
cargo check
```

## 项目结构

```text
my-roguelike/
├── index.html              # 页面入口和 HUD 结构
├── package.json             # 前端脚本和依赖
├── yarn.lock                # Yarn 依赖锁定文件
├── vite.config.js           # Vite 开发服务器配置
├── src/
│   ├── main.js              # Pixi 初始化、渲染、输入和前后端通信
│   ├── styles.css           # HUD、窗口和响应式布局
│   └── assets/              # 地形、角色、敌人、宝箱和门户资源
└── src-tauri/
    ├── tauri.conf.json      # Tauri 窗口、构建和打包配置
    ├── Cargo.toml           # Rust 依赖和库配置
    ├── build.rs             # Tauri 构建脚本
    └── src/
        ├── main.rs          # Rust 桌面入口
        └── lib.rs           # 游戏状态、地图生成和 Tauri 命令
```

### 前端入口：`src/main.js`

这里负责：

- 导入 Pixi.js 和图片资源
- 创建 Pixi `Application`
- 创建地图层、调试层和实体层
- 加载纹理
- 根据 Rust 返回的地图数据绘制地牢
- 根据游戏状态绘制玩家、敌人、宝箱和门户
- 接收键盘输入
- 通过 `invoke()` 调用 Rust 命令
- 使用 Pixi ticker 播放玩家和门户动画

前端不负责决定游戏规则。它只负责：

```text
读取 GameState
  -> 绘制画面
接收玩家输入
  -> 发送动作给 Rust
```

### Rust 入口：`src-tauri/src/lib.rs`

这里负责：

- 保存当前游戏状态
- 生成地图
- 保存房间和走廊调试信息
- 判断玩家是否可以移动
- 处理敌人攻击
- 处理宝箱开启
- 判断门户是否激活
- 生成下一关
- 向前端返回完整 `GameState`

Rust 是游戏规则的唯一来源，前端不能绕过 Rust 修改玩家位置或金币。

## 前后端通信

前端使用 Tauri 的 `invoke()` 调用 Rust 命令：

```js
const state = await invoke('new_dungeon', { seed });
```

当前有三个命令：

### `new_dungeon`

创建第一关：

```js
const state = await invoke('new_dungeon', {
  seed: 12345,
});
```

Rust 返回一份完整的 `GameState`。

### `player_action`

提交一次玩家动作：

```js
const state = await invoke('player_action', {
  action: 'move_right',
});
```

支持的动作：

```text
move_up
move_down
move_left
move_right
```

Rust 收到动作后会：

1. 增加回合数
2. 判断目标位置是否是地板
3. 判断目标位置是否有敌人
4. 如果有敌人，移除敌人并增加击败数
5. 如果没有敌人，移动玩家
6. 检查宝箱并发放金币
7. 更新门户激活状态
8. 返回新的完整游戏状态

### `next_level`

生成下一关：

```js
const nextState = await invoke('next_level');
```

Rust 会再次检查门户是否已经激活。只有以下条件同时满足时才能进入下一关：

```rust
state.enemies.is_empty()
    && state.chests.iter().all(|chest| chest.opened)
```

下一关会：

- 使用新的随机种子
- 重新生成房间、走廊和实体
- 将关卡数加一
- 继承金币
- 继承累计击败数

## 游戏状态结构

Rust 中的 `GameState` 是前后端通信的核心数据结构：

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
}
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `map` | 地图网格，`true` 表示可行走地板 |
| `rooms` | 房间矩形，主要用于调试显示 |
| `corridors` | 房间之间的走廊路径，主要用于调试显示 |
| `player` | 玩家当前坐标 |
| `enemies` | 当前尚未被击败的敌人 |
| `chests` | 当前关卡中的宝箱 |
| `portal` | 门户坐标和是否激活 |
| `level` | 当前关卡编号 |
| `seed` | 当前关卡的随机种子 |
| `moves` | 已执行的动作数量 |
| `defeated` | 累计击败的敌人数量 |
| `gold` | 当前金币数量 |

## 地图生成原理

地图尺寸由 Rust 中的常量决定：

```rust
const MAP_WIDTH: usize = 25;
const MAP_HEIGHT: usize = 17;
```

每个网格单元在 Pixi 中占用 `32 × 32` 像素：

```js
const TILE_SIZE = 32;
```

因此逻辑地图尺寸是：

```text
25 × 32 = 800 像素
17 × 32 = 544 像素
```

当前算法是“随机房间 + L 形走廊”：

1. 创建一张全部为墙的网格
2. 随机生成 8 个房间
3. 将房间区域标记为地板
4. 连接当前房间中心和上一个房间中心
5. 收集所有地板坐标
6. 放置敌人、宝箱和门户

随机数使用固定种子，因此同一个种子会生成同一张地图。这对调试非常重要。

例如 HUD 显示种子为 `12345`，就可以记录这个数字，用于之后复现问题。

当前算法的限制：

- 房间可能互相重叠
- 没有检查所有房间是否完全连通
- 走廊宽度只有一格
- 没有房间类型
- 没有保证实体距离玩家足够远

后续可以替换为：

- BSP 房间生成
- 随机游走
- Cellular Automata
- 房间重叠检测
- 最小生成树连接房间
- 房间主题和特殊房间

## Pixi 渲染层

当前 Pixi 使用三个主要容器：

```js
const mapLayer = new PIXI.Container();
const debugLayer = new PIXI.Container();
const actorLayer = new PIXI.Container();
```

渲染顺序是：

```text
mapLayer
  -> 地板和墙
debugLayer
  -> F3 调试信息
actorLayer
  -> 宝箱、敌人、门户、玩家
```

这样可以保证实体显示在地形上方，调试边界位于地图和实体之间。

### 地图渲染

`renderMap()` 会遍历 `state.map`：

- 地板格使用 `Tile.png`
- 地板旁边的空格根据邻接方向选择墙体
- 墙角使用 `Corner*.png`
- 墙边使用 `Wall*.png`

### 实体渲染

`renderPlayer()` 当前同时绘制：

- 已开启或未开启的宝箱
- 哥布林
- 激活后的门户
- 玩家

实体坐标会从网格坐标转换为像素坐标：

```js
sprite.x = x * TILE_SIZE;
sprite.y = y * TILE_SIZE;
```

玩家和门户使用中心锚点，因此动画时更容易围绕中心缩放和旋转。

## 玩家动画

当前玩家只有一张静态 `32 × 32` 素材，没有真正的行走帧。

因此 `app.ticker` 使用变换模拟待机动画：

- 上下浮动
- 轻微缩放
- 轻微旋转

核心逻辑：

```js
const breathing = Math.sin(time / 180);
playerSprite.y += breathing * 1.2;
playerSprite.scale.set(
  1 + breathing * 0.035,
  1 - breathing * 0.025,
);
playerSprite.rotation = breathing * 0.025;
```

这种方式适合原型，但不是完整的逐帧动画。要制作正式行走动画，需要准备多个方向和多帧角色素材。

## 门户和多关卡

每个关卡生成时都会放置一个门户位置，但门户默认不可见：

```rust
portal: Portal {
    position: portal_position,
    active: false,
}
```

当敌人列表为空并且所有宝箱都开启后：

```rust
state.portal.active =
    state.enemies.is_empty() && state.chests.iter().all(|chest| chest.opened);
```

前端收到激活状态后显示门户动画。玩家走到门户位置时：

```text
player_action
  -> Rust 返回玩家已站到门户位置
  -> 前端调用 next_level
  -> Rust 生成下一关
  -> 前端重新渲染完整 GameState
```

## 调试地图生成

运行游戏后按：

```text
F3
```

调试层会显示：

- 房间边界
- 房间编号，例如 `R1`
- 黄色走廊路径

同时浏览器开发者工具控制台会输出：

```js
console.table({
  rooms: state.rooms,
  corridors: state.corridors,
});
```

建议调试流程：

1. 记录 HUD 中的随机种子
2. 按 `F3` 查看房间和走廊
3. 判断房间是否重叠或走廊是否断开
4. 使用相同种子重新测试
5. 修改 Rust 的 `create_map()`
6. 再次运行 `cargo check`

## 修改地图尺寸

地图尺寸需要同时修改 Rust 和前端：

Rust：

```rust
const MAP_WIDTH: usize = 25;
const MAP_HEIGHT: usize = 17;
```

前端：

```js
const MAP_WIDTH = 25;
const MAP_HEIGHT = 17;
```

如果只修改一侧，会导致：

- 地图读取越界
- 墙体渲染不完整
- 调试框位置错误
- 缩放计算错误

修改后建议执行：

```powershell
cargo check
yarn.cmd build
```

## 添加新素材

建议将游戏使用的资源放到：

```text
src/assets/
```

在 `src/main.js` 中导入：

```js
import potionUrl from './assets/Dungeon Crawl Stone Soup Full/item/potion.png';
```

加载纹理：

```js
assets.potion = await PIXI.Assets.load(potionUrl);
```

创建精灵：

```js
const potion = new PIXI.Sprite(assets.potion);
potion.x = position.x * TILE_SIZE;
potion.y = position.y * TILE_SIZE;
actorLayer.addChild(potion);
```

如果素材是透明背景的 `32 × 32` PNG，通常可以直接使用。

添加具有游戏规则的实体时，不要只在前端创建精灵，还应在 Rust 的 `GameState` 中保存它的状态。

推荐流程：

```text
Rust 保存实体数据
  -> GameState 返回前端
  -> Pixi 根据数据渲染
  -> 玩家操作发送给 Rust
  -> Rust 更新实体状态
```

## 添加新的玩家动作

如果要增加新的动作，例如等待：

### 1. Rust 增加动作枚举

```rust
enum PlayerAction {
    MoveUp,
    MoveDown,
    MoveLeft,
    MoveRight,
    Wait,
}
```

### 2. Rust 处理动作

在 `player_action()` 的匹配逻辑中增加：

```rust
PlayerAction::Wait => (0, 0),
```

或者为等待动作编写单独的处理逻辑。

### 3. 前端绑定按键

在 `keydown` 监听器的 `moves` 对象中增加：

```js
Space: 'wait',
```

如果动作会改变游戏状态，最终判定仍然必须放在 Rust 中。

## 关于节拍系统

当前项目还没有真正的节拍系统。

如果未来要实现真正的节奏地牢，建议新增：

```text
Rust 节拍时钟
  -> beat_index
  -> beat 事件
  -> 玩家输入窗口
  -> Rust 在节拍上推进玩家和敌人
```

不要把 Pixi ticker 直接当作游戏规则时钟。Pixi ticker 更适合：

- 播放视觉动画
- 做粒子效果
- 做平滑移动
- 做门户旋转

真正影响游戏逻辑的时间和行动，应由 Rust 统一管理。

## 常见问题

### 运行 `yarn` 被 PowerShell 拦截

改用：

```powershell
yarn.cmd tauri dev
```

### 前端调用 `invoke` 失败

确认使用的是：

```powershell
yarn.cmd tauri dev
```

而不是只启动：

```powershell
yarn.cmd dev
```

### 地图顶部或底部显示不完整

检查：

- `MAP_WIDTH` 是否和 Rust 一致
- `MAP_HEIGHT` 是否和 Rust 一致
- `TILE_SIZE` 是否仍然为 `32`
- `fitBoard()` 是否正确计算 HUD 占用高度

### 中文出现乱码

源码文件应使用 UTF-8 保存。重点检查：

- `README.md`
- `index.html`
- `src/main.js`
- `src/styles.css`
- `src-tauri/src/lib.rs`

### Rust 修改后前端没有更新

重新启动：

```powershell
yarn.cmd tauri dev
```

Tauri 会重新编译 Rust 后端。

## 推荐开发顺序

建议按照以下顺序继续扩展：

1. 把当前玩家攻击改成真正的攻击动画
2. 增加玩家生命值和受击状态
3. 增加敌人回合 AI
4. 增加敌人攻击和死亡动画
5. 增加多个敌人类型
6. 增加物品和装备系统
7. 增加真正的节拍系统
8. 增加存档和读档
9. 增加关卡主题
10. 增加音效和音乐

每完成一个阶段，都应该保持项目可以运行，并做一次小范围测试。

## 验证命令

提交代码前建议执行：

```powershell
# 检查 Rust 格式
cd src-tauri
cargo fmt -- --check

# 检查 Rust 编译
cargo check

# 返回项目根目录
cd ..

# 构建前端
yarn.cmd build
```

如果这些命令都通过，说明当前代码至少在语法、Rust 类型和前端构建层面是正常的。

## IDE 推荐

推荐使用：

- VS Code
- `rust-analyzer`
- Tauri VS Code 插件
- Pixi.js 相关 TypeScript/JavaScript 提示插件

开发时可以同时打开：

- `src/main.js`
- `src-tauri/src/lib.rs`
- `index.html`
- 浏览器开发者工具控制台

前端负责“显示什么”，Rust 负责“规则是什么”。记住这个边界，可以避免很多状态不同步和碰撞逻辑重复的问题。

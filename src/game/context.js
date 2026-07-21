import * as PIXI from 'pixi.js';

import { INITIAL_STATE } from './constants.js';

// 创建游戏运行时上下文，集中保存 Pixi 容器、共享状态和调试开关。
export function createGameContext() {
  return {
    // Pixi 应用实例，负责 ticker、舞台和画布生命周期。
    app: new PIXI.Application(),
    // board 是地图根容器，缩放和居中只作用于它，不改变 HUD 布局。
    board: new PIXI.Container(),
    // 地图地板和墙体所在的渲染层。
    mapLayer: new PIXI.Container(),
    // F3 地图调试信息所在的渲染层。
    debugLayer: new PIXI.Container(),
    // 玩家、敌人、宝箱和门户所在的实体层。
    actorLayer: new PIXI.Container(),
    // F4 敌人移动箭头、目标格和攻击范围所在的意图层。
    intentLayer: new PIXI.Container(),
    // 飘字、挥击、受击和死亡演出所在的效果层。
    effectLayer: new PIXI.Container(),
    // loadAssets 会把已经加载的 PIXI 纹理填入这里。
    assets: {},
    // 所有前端表现都以这份状态为依据，不直接修改 Rust 返回对象。
    state: structuredClone(INITIAL_STATE),
    refs: {
      // 频繁更新位置或动画的关键精灵使用引用保存。
      playerSprite: null,
      portalSprite: null,
    },
    collections: {
      // 通过敌人 id 找到对应精灵，用于动画和警告标记跟随。
      enemySprites: new Map(),
      // 保存 F4 模式下敌人头顶的感叹号。
      warningSprites: new Map(),
      // 保存正在播放的移动动画，键为对应的 Sprite。
      movementAnimations: new Map(),
      // 保存临时特效及其开始时间、持续时间和动画数据。
      visualEffects: [],
    },
    flags: {
      // F3 是否显示房间和走廊调试层。
      debugVisible: false,
      // F4 是否显示敌人意图和正式阶段延迟。
      turnDebugVisible: false,
      // 是否正在处理一个玩家动作，防止重复 invoke。
      actionInFlight: false,
      // 受击反馈结束时间，用于 ticker 中让玩家精灵短暂闪烁。
      damageFeedbackUntil: 0,
      // 是否正在推进敌人回合，防止多个异步阶段循环同时运行。
      phaseAdvanceInFlight: false,
      // 上一次方向键触发移动的时间戳，用于长按节流。
      lastMoveInputAt: 0,
      // FPS 统计窗口内累计的帧数。
      fpsFrameCount: 0,
      // FPS 统计窗口内累计经过的毫秒数。
      fpsElapsedMs: 0,
      // 最近一次计算出的平均 FPS，仅用于 F4 调试显示。
      displayFps: 0,
    },
  };
}

import * as PIXI from 'pixi.js';

import { INITIAL_STATE } from './constants.js';

// 创建游戏运行时上下文，集中保存 Pixi 容器、共享状态和调试开关。
export function createGameContext() {
  return {
    app: new PIXI.Application(),
    board: new PIXI.Container(),
    mapLayer: new PIXI.Container(),
    debugLayer: new PIXI.Container(),
    actorLayer: new PIXI.Container(),
    intentLayer: new PIXI.Container(),
    effectLayer: new PIXI.Container(),
    assets: {},
    state: structuredClone(INITIAL_STATE),
    refs: {
      playerSprite: null,
      portalSprite: null,
    },
    collections: {
      enemySprites: new Map(),
      warningSprites: new Map(),
      movementAnimations: new Map(),
      visualEffects: [],
    },
    flags: {
      debugVisible: false,
      turnDebugVisible: false,
      actionInFlight: false,
      damageFeedbackUntil: 0,
      phaseAdvanceInFlight: false,
      lastMoveInputAt: 0,
    },
  };
}

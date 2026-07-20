import * as PIXI from 'pixi.js';

// 创建 Pixi 应用
const app = new PIXI.Application({
  width: 800,
  height: 600,
  backgroundColor: 0x2c3e50,
  resolution: window.devicePixelRatio || 1,
});

// 挂载到页面
document.getElementById('game').appendChild(app.view);

// 测试：画一个地牢风格的方块
const player = new PIXI.Graphics();
player.beginFill(0x00ff88);
player.drawRect(0, 0, 40, 40);
player.endFill();
player.x = 100;
player.y = 100;
app.stage.addChild(player);

// 测试：画几个墙
for (let i = 0; i < 5; i++) {
  const wall = new PIXI.Graphics();
  wall.beginFill(0x4a4a5a);
  wall.drawRect(0, 0, 40, 40);
  wall.endFill();
  wall.x = 200 + i * 50;
  wall.y = 200;
  app.stage.addChild(wall);
}

// 添加文字
const text = new PIXI.Text('🎮 节奏地牢 Lite', {
  fontSize: 32,
  fill: 0xffffff,
  fontFamily: 'Arial',
});
text.x = 50;
text.y = 50;
app.stage.addChild(text);

console.log('Pixi.js 已启动！');

// 游戏循环
app.ticker.add(() => {
  // 这里后续放游戏更新逻辑
});
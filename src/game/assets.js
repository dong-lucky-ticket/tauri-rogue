import * as PIXI from 'pixi.js';

// 地牢基础图块。
import tileUrl from '../assets/TilesDungeon/Tile.png';
import wallUrl from '../assets/TilesDungeon/Wall.png';
import wallUpUrl from '../assets/TilesDungeon/WallUp.png';
import wallDownUrl from '../assets/TilesDungeon/WallDown.png';
import wallLeftUrl from '../assets/TilesDungeon/WallLeft.png';
import wallRightUrl from '../assets/TilesDungeon/WallRight.png';
import corner1Url from '../assets/TilesDungeon/Corner1.png';
import corner2Url from '../assets/TilesDungeon/Corner2.png';
import corner3Url from '../assets/TilesDungeon/Corner3.png';
import corner4Url from '../assets/TilesDungeon/Corner4.png';

// 玩家、敌人、宝箱和关卡门户素材。
import playerUrl from '../assets/Dungeon Crawl Stone Soup Full/player/base/human_male.png';
import enemyUrl from '../assets/Dungeon Crawl Stone Soup Full/monster/goblin_new.png';
import chestUrl from '../assets/Dungeon Crawl Stone Soup Full/dungeon/chest.png';
import chestOpenUrl from '../assets/Dungeon Crawl Stone Soup Full/dungeon/chest_2_open.png';
import portalUrl from '../assets/Dungeon Crawl Stone Soup Full/dungeon/gateways/portal.png';

// 加载地形、角色、敌人和宝箱贴图，后续渲染时复用纹理。
export async function loadAssets(ctx) {
  ctx.assets.tile = await PIXI.Assets.load(tileUrl);
  ctx.assets.wall = await PIXI.Assets.load(wallUrl);
  ctx.assets.wallUp = await PIXI.Assets.load(wallUpUrl);
  ctx.assets.wallDown = await PIXI.Assets.load(wallDownUrl);
  ctx.assets.wallLeft = await PIXI.Assets.load(wallLeftUrl);
  ctx.assets.wallRight = await PIXI.Assets.load(wallRightUrl);
  ctx.assets.corner1 = await PIXI.Assets.load(corner1Url);
  ctx.assets.corner2 = await PIXI.Assets.load(corner2Url);
  ctx.assets.corner3 = await PIXI.Assets.load(corner3Url);
  ctx.assets.corner4 = await PIXI.Assets.load(corner4Url);
  ctx.assets.player = await PIXI.Assets.load(playerUrl);
  ctx.assets.enemy = await PIXI.Assets.load(enemyUrl);
  ctx.assets.chest = await PIXI.Assets.load(chestUrl);
  ctx.assets.chestOpen = await PIXI.Assets.load(chestOpenUrl);
  ctx.assets.portal = await PIXI.Assets.load(portalUrl);
}

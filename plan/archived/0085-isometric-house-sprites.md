# PR2: 建物のisometric全面再設計・farmlandの実素材化

## 背景

「POPULOUS 2 グラフィックス原作再現 改修指示」（32項目）のうち、
PR1（`plan/0084`）に続きユーザー自身が指示した順序で
**PR2: Isometric settlements**（建物・farmland）に着手した。

これまでのHouseは`src/render/pixelArt.ts`の`HOUSE_PATTERNS`という
正面向きのドット絵パターン（1文字1ピクセルの矩形グリッド）で描かれて
おり、地形はアイソメトリックなのに建物だけ正面向きのアイコンが乗って
いるような見た目になっていた（改修指示7節）。また建物の壁全体が
陣営色で塗られており（8節）、House周辺のfarmlandも陣営色の半透明
overlay（RTSの領土表示のような見た目）になっていた（9節）。

## 対応

### 1. Houseのisometric化（指示7節）
`src/render/pixelArt.ts`に、`IsoRenderer`の地形投影と同じ2:1比率
（`TILE_WIDTH:TILE_HEIGHT`）でアイソメトリックな「箱」の頂点を計算する
`footprint()`ヘルパーを新設。左壁面・右壁面をそれぞれ地形の三角形と
同じ「左が明・右が暗」の固定光源シェーディングで塗り分け（`drawWalls`）、
屋根も同じ考え方で2面のhip roof（`drawHipRoof`）として描画する。
hut/lodge/manor共通の構造（`drawPeakedHouse`）で、レベルが上がるほど
`HOUSE_HALF_WIDTH`（6→8→10）に応じて壁高・屋根高・窓の数が増える。

castleだけは`drawCastle`で独自シルエットにした（指示7節「Castleだけは
他レベルより一段大きく見えてよい」「複数塔・中央構造物・城壁的
シルエット・旗」）。フラットな屋上＋2辺（front-left/front-right）に
沿ったクレネレーション（凹凸の胸壁）、奥にオフセットした小さな塔
（独自の旗付き）を追加し、`HOUSE_HALF_WIDTH.castle=15`でhutの2.5倍の
footprintを持つ。

接地影（`drawGroundShadow`）も追加し、地形メッシュに浮いて見えない
ようにした。

### 2. faction colorを旗のみへ限定（指示8節）
壁・屋根の色は石材/木材/土壁を模した固定トーン（`GAME_PALETTE`の
`soilLight`/`soilMid`、castleは`stoneLight`/`stoneMid`）のみを使用し、
`factionColor`パラメータは屋根の上に立てる小さな旗（`drawFlag`）にしか
渡していない。「青い建物」ではなく「建物に旗が立っている」状態になる。

`drawHouseSprite(g, centerX, groundY, level, factionColor)`という
外部シグネチャは変更していないため、呼び出し元の`EntityLayer.ts`は
無改修で動作する。

### 3. Farmlandの実素材化（指示9節）
`EntityLayer.ts`のfarmland描画から陣営色の半透明overlay
（`FACTION_COLOR[owner.faction]`、alpha 0.16）を撤去し、土色のベース
（`GAME_PALETTE.soilMid`、alpha 0.35——地形の傾斜シェーディングが
透けて見える程度）の上に、タイルの1辺に平行な畝線を3本描画する
（`GAME_PALETTE.soilDark`のストローク）。所有者の判別は基本的に
Houseの旗のみで行う方針とし、farmland自体には一切faction色を
乗せていない。

この変更に伴い、farmlandのタイル走査で`Owner`コンポーネントを
読む必要が無くなったため、クエリを`world.query(Position, House, Owner)`
から`world.query(Position, House)`に簡略化した。

## 対応しなかった項目（Phase 3・4へ）

- Walker/Leader/Heroのisometric・方向別sprite化、halo撤去
  （指示10〜14節）——今回のWalkerは引き続き正面向きのpixel pattern。
- 地形テクスチャ（desert/snow/rock）・water/swamp/volcano・minimap
  改善（指示15, 17〜20節）。
- Sprite atlas（Texture/Sprite）への移行（指示26節）——今回もHouse
  スプライトはPixiJSの`Graphics`即時再構築のまま。

## 検証

- `npm run typecheck` / `npm run test -- --run`（437件、pixelArt.tsは
  従来通り専用テストを持たない設計判断を踏襲——EntityLayer.test.ts等
  既存のGraphics系テストに影響なし）/ `npm run build`：すべて成功。
- 一時的なデバッグ用HTML（プロジェクトには残していない）でPixiJSの
  `drawHouseSprite`を直接呼び出し、hut/lodge/manor/castleの4レベルを
  並べて描画し、レベルごとにシルエットが明確に異なること
  （castleは屋上のクレネレーション＋奥の塔で他3レベルと別形状）、
  陣営色（青/赤）が旗にのみ現れ壁面は共通トーンであることを
  スクリーンショットで確認した。
- Playwright（chromium、iPhone 13エミュレーション）で実際のゲーム
  画面を確認：hutが複数出現した状態、farmlandの畝模様、隆起/沈降/
  平坦化ツールの連続操作でコンソールエラーが発生しないことを確認した。

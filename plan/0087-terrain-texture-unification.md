# PR4: 地形テクスチャ統一・水面アニメーション・沼/volcano表現・minimap改善

## 背景

「POPULOUS 2 グラフィックス原作再現 改修指示」（32項目）のうち、PR1
（`plan/0084`）・PR2（`plan/0085`）・PR3（`plan/0086`）に続きユーザー
自身が指示した順序で **PR4: World surface art**（最終フェーズ）に
着手した。

## 対応

### 1. Terrain textureの統一（指示15節）
`src/render/IsoRenderer.ts`の`GRASS_FILL`（grassのみが持っていた
dither texture）を`TERRAIN_FILL`（4地形すべてを持つ）に一般化。
desert（黄土+暗い茶色の少量speckle、density 0.15）、snow（白+明色の
speckle、density 0.2）、rock（茶+暗褐色のspeckle、density 0.4、
grassより粗い`ROCK_DITHER_SIZE=12`）を追加し、`fillTerrainTriangle`の
分岐条件から`terrain === "grass"`を外して全地形に適用した。

ditherテクスチャ生成の共通ロジック（`createPatternTexture`/
`createDitherTexture`/`ditherPixelHash`）は`src/render/patternTexture.ts`
へ切り出し、後述の水面・沼テクスチャと共有できるようにした
（指示25節の「役割ごとに分離」に沿う一歩）。

### 2. Water animation（指示17節）
`createWaveTexture`で、薄い波の稜線（しきい値0.75、明色15%のみ
ハイライト）が緩やかに斜めへオフセットする3フレームのpixel water
テクスチャを新設（`WATER_FRAMES`/`waterFrameIndex`、2fps）。単色の
`WATER_COLOR`塗りつぶしだった水面タイルをこれに置き換えた。

### 3. Swampの地表化（指示18節）
`src/render/EntityLayer.ts`の紫色半透明overlay+ストロークを撤去し、
暗い泥色+紫褐色のdither texture（`SWAMP_FILL`）をベースに、
タイルごとに決定的な位置（`swampTileHash`）へ黒い穴を2つ、一定周期
（1.2秒）で明滅する小さな泡を1つ描画するようにした。判定範囲
（`swampAffectedTiles`）自体は変更していない。

### 4. Volcanoの地形形状（指示19節）
`src/world/heightmap.ts`の`applyVolcano`が、これまで対象領域全体を
`MAX_ELEVATION`で埋める単純な高原だったのを、円錐+火口の形状に変更した：
`radius`ちょうどの輪（火口縁）が最高点、中心（火口底）はそこから
`VOLCANO_CRATER_DEPTH`（3）低く、正方形の足場のうち円形の輪の外側
（`radius=1`なら対角4頂点）は`VOLCANO_OUTER_DROP`（6）低い外側斜面と
した。半径0（当たり判定を最小にしたい単発呼び出し）では火口縁が
存在しないため、従来通り単一のピークになる。既存の岩盤描画
（rim tileへのlava streak等）はrockHardnessベースのままで変更しておらず、
新しい傾斜そのものが地形シェーディングで自然に立体的に見えるように
なる副次効果もある。

### 5. Minimapの改善（指示20節）
`src/render/Minimap.ts`を全面書き換え。単色背景+dot plotだった構成を、
- 石材/青銅のpixelフレーム（`GAME_PALETTE`使用）
- 固定解像度（`TERRAIN_GRID_RESOLUTION=24`、実際のマップサイズに
  依存しない）で地形の高さを4段階の明暗に量子化した縮小地図
- カメラが現在映している範囲を示す枠線（`visibleBounds`引数、
  main.tsは`strictVisibleBounds()`を渡す）

に変更した。`redrawTerrain()`は独立したメソッドとして毎フレーム
呼び出す（マップサイズに依存しない固定コストのため、地形編集の
発生検知を別途行うより単純さを優先した）。

## 対応しなかった項目

- Sprite atlas（Texture/Sprite）への移行（指示26節）——地形/水/沼の
  テクスチャはビルド時に一度きり生成する`Texture`オブジェクトとして
  キャッシュしているため、既にこの原則には概ね沿っているが、House/
  Walkerの`Graphics`即時構築自体はまだ置き換えていない。
- 地形メッシュ自体の再設計は指示31節の通り行っていない
  （`applyVolcano`の高さ分布変更はメッシュの描画方式ではなく、単一の
  奇跡が生成する地形データの形状のみを変更したもの）。

## 検証

- `npm run typecheck` / `npm run test -- --run`（447件。
  `IsoRenderer.test.ts`に地形dither/water dither関連のテスト更新・
  追加、`heightmap.test.ts`にvolcano形状のテスト更新）/
  `npm run build`：すべて成功。
- 一時的なデバッグ用HTML（コミットには含めていない）でvolcanoの断面・
  4地形のdither texture・水面アニメーション・沼の地表・minimapの
  地形濃淡とビューポート枠を並べて確認した。水面のジグザグ模様は
  デバッグハーネス側の2倍スケール表示だと太い縞に見えたが、実際の
  ゲーム内スケール（scale 1）で確認したところ細かい波模様として
  正しく見えることを確認した。
- Playwright（chromium、iPhone 13エミュレーション）で実際のゲーム画面
  を確認：新しいminimap（地形の濃淡+ビューポート枠+青銅フレーム）が
  正しく表示され、コンソールエラーが発生しないことを確認した。

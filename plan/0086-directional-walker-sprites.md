# PR3: Walker/Leader/Heroの方向別sprite化・halo撤去

## 背景

「POPULOUS 2 グラフィックス原作再現 改修指示」（32項目）のうち、PR1
（`plan/0084`）・PR2（`plan/0085`）に続きユーザー自身が指示した順序で
**PR3: Directional followers** に着手した。

これまでのWalkerは常に正面向きの単色ドット絵パターン1種類で、進行
方向による見た目の差が無かった（指示10節）。Leaderは白い半透明の
halo（円）で強調されており（指示12節）、Hero（騎士/守護者）は単なる
色替え（黄/水色の単色）で、シルエット自体はWalkerと同一だった
（指示13節）。

## 対応

### 1. Walkerの4方向化（指示10節）
`src/render/EntityLayer.ts`に`facingFor(dx, dy)`を新設。Walkerの
`MoveTarget`（無ければ直近の向きを保持——`lastFacing`のMap）と現在
`Position`の差分から、タイル軸±x/±yがそれぞれ対応する画面上の
斜め方向（`NE`/`NW`/`SE`/`SW`）へ量子化する。これはIsoRendererの
2:1投影がタイル軸の4方向をちょうどこの4つの画面対角線へ写す
ことを利用している。

`src/render/pixelArt.ts`の`drawWalkerSprite`は、`towardCamera`
（S側=カメラ向き=目のドットあり）/`mirror`（W側=左右反転）の2軸で
4方向をカバーする。歩行frame（stepping）は片腕だけを左右非対称に
突き出す形にしており、そのため左右反転（mirror）が実際に見た目へ
反映される（静止姿勢は左右対称のままで問題ない）。色は肌（頭部・
固定色）／服・陣営色（胴体）／靴（固定の暗色）の3色構成にした。

### 2. Leaderのhalo撤去・専用表現（指示12節）
`EntityLayer.ts`から白い半透明haloの`g.circle(...)`描画を削除。
代わりに`drawWalkerSprite`の`isLeader`オプションで、頭上に陣営色の
小さな羽根飾り（plume）を追加する。サイズも従来通り
`LEADER_PIXEL_SIZE`（通常の1.8倍）で他のWalkerより大きい。

### 3. Heroのシルエット差別化（指示13節）
`drawWalkerSprite`の`heroKind`オプション（`"knight" | "guardian"`）で、
単色変更ではなく追加の装飾を描く：騎士は体の横に小さな剣（`stoneLight`）、
守護者は小さな盾（`bronzeMid`）。本体の色は陣営色のまま変更していない
——これにより「どちらの陣営の騎士か」も見分けられるようになった
（従来は騎士=常に黄色、守護者=常に水色で、陣営が読み取れなかった）。
装飾の左右位置も`mirror`に連動させ、向きに応じて自然な側に描く。

`EntityLayer.ts`で不要になった`KNIGHT_COLOR`/`GUARDIAN_COLOR`/
`LEADER_HALO_RADIUS`定数を削除した。

## 対応しなかった項目（Phase 4へ）

- 状態別animation（idle/fighting/drowning/burning/dying、指示11節）
  ——今回は歩行の方向・frameのみ。溺死時に消える演出等は今後の検討。
- 地形テクスチャ・water/swamp/volcano・minimap改善（指示15, 17〜20節）。
- Sprite atlas（Texture/Sprite）への移行（指示26節）。

## 検証

- `npm run typecheck` / `npm run test -- --run`（440件、`facingFor`の
  新規テスト3件を追加）/ `npm run build`：すべて成功。
- 一時的なデバッグ用HTML（コミットには含めていない）で4方向×2frame、
  Leader、Knight×2陣営、Guardianを並べて描画し、前後（目のドット
  有無）・左右（腕の突き出し側）・Leaderの羽根飾り・Hero装飾の左右
  反転が正しく機能することを確認した。
- Playwright（chromium、iPhone 13エミュレーション）で実際のゲーム
  画面を確認：ズームインした状態でWalkerが歩行アニメーションと共に
  表示され、コンソールエラーが発生しないことを確認した。

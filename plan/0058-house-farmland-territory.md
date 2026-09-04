# 0058: 家の周囲に農地/勢力圏の視覚表現を追加する

## 背景

`docs/game-system.md` 5節（集落・家）は「家の周囲は農地になり、視覚的に
勢力圏を示す」と定めているが、これまで対応する描画コードが一切
存在しなかった（`src/render`配下にterritory/farmland/tint関連の
実装なし）。11節の情報パネル関連2件（plan/0056, 0057）とは別の、
5節側の未実装項目。

## 実装

- `FARMLAND_RADIUS`（`src/game/constants.ts`）: 家のレベルごとの
  農地半径（タイル）。`HOUSE_PATTERN_WIDTH`のスプライトサイズ拡大と
  同じ考え方で、castleほど広い勢力圏に見えるようレベルに応じて
  1〜2.5タイルへ拡大する。
- `EntityLayer.update()`（`src/render/EntityLayer.ts`）: 各家について
  `FARMLAND_RADIUS[house.level]`以内のタイルを陣営色（`FACTION_COLOR`）
  で薄く（alpha 0.16）塗る処理を追加。既存の`swampAffectedTiles`
  （「ある点からの半径内のタイル」を選ぶ汎用ロジック、既にテスト済み）
  をそのまま再利用し、沼と同じ「タイル4隅をprojectしてpolyで塗る」
  パターンで描画する。他の描画（集結地の旗・沼・家・ウォーカー・
  エフェクト）より先に描くことで、農地が地面の色付けとして見え、
  他の要素を隠さないようにしている。

## 検証

- `npm run typecheck` / `npm run test -- --run`（300件）/ `npm run build`
  すべて通過。
- headless Playwrightでシミュレーションを200秒分早送りし、実際に
  複数の家が育った状態でカメラを家の位置に合わせてスクリーンショットを
  撮影。陣営色（プレイヤー=青、敵=赤）の農地タイルが家の周囲に
  正しく描画されることを確認（検証用の`window.__debug`フックは
  確認後に削除済み）。

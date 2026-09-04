# 0057: ウォーカー・家を照会する情報パネルを追加する

## 背景

`docs/game-system.md` 11節（UI要素）は情報パネルとして
「任意のウォーカー・家を照会して人数／強さ／発達段階を確認できる」
と定めている。同節が挙げるもう一方の要素「両陣営の総人口の比較表示」は
plan/0056で既に実装済みだが、個別のウォーカー・家を照会する機能は
未実装だった。

## 実装

- `Simulation.listInspectableEntities()`（`src/game/simulation.ts`）:
  盤面上の全ウォーカー・家を`InspectableEntity`（判別共用体）として
  返す。位置情報だけを持つ素のデータで、描画（IsoRendererでの
  スクリーン座標変換）には関与しない。
- `src/render/entityInfoLabel.ts`（新規）: `InspectableEntity`を
  日本語の説明文に変換する`describeInspectableEntity`。
  `matchEventLabels.ts`の「あなた/敵」という主語の付け方に倣った。
- `ToolMode`（`src/ui/toolbar.ts`）に`"inspect"`を追加し、
  `index.html`に「🔍 照会」ボタンを持つ新しいツールバーセクション
  （マナ消費なし）を追加。
- `main.ts`:
  - `pickInspectableEntity(localX, localY)`: `IsoRenderer.pickVertex`と
    同じ「画面px単位のmaxDistanceをズームに応じてlocal座標に変換し、
    最も近いものを選ぶ」方式で、頂点グリッドの代わりにエンティティの
    投影済みスクリーン座標に対して行う。
  - `applyTool`の先頭に`inspect`分岐を追加（頂点スナップの前段、
    `vertex`が無くても動くように）。
  - `#entity-info-panel`（新規HTMLオーバーレイ、`#enemy-event-toast`と
    同じ見た目のトースト）に結果を4秒間表示。

## 検証

- `npm run typecheck` / `npm run test -- --run`（297件）/ `npm run build`
  すべて通過。
- headless Playwrightで実機シナリオを検証: 「🔍 照会」ボタンを選択し、
  マップ上の敵ウォーカーをタップすると
  `敵のウォーカー 強さ1.0（定住地を探索中）`のようなパネルが表示される
  ことを確認（検証用の`window.__debug`フックは確認後に削除済み）。

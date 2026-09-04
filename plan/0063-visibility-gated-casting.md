# 0063: 画面内に自陣がないと奇跡を使えない制限を追加する

## 背景

plan/0062でマップが固定64×64になり、プレイヤーは原寸大の一部だけを
パンして操作するようになった。しかし従来通りの実装のままだと、
プレイヤーはカメラをどこへでも一瞬でパンできてしまい、自分の勢力に
一切近づかず、画面の好きな場所を地震・火山などでいつでも直接狙い
撃ちできてしまう。原作にあった「画面内に自分の勢力が映っていないと
奇跡を使えない」という制約を取り入れ、実際にその場へ足を運ぶ
（画面を合わせる）ことを要求するようにする。

敵AIはそもそも「画面」という概念を持たないため、この制限は
プレイヤー（人間）の操作にのみ適用する。

## 実装

- `IsoRenderer.isWithinTileBounds(point, bounds)`（新規、純粋関数）:
  タイル空間の点（ウォーカー・家・集結地の座標）が、`visibleTileBounds`
  が返す可視範囲内にあるかを判定する。範囲は`[minX, maxX+1]`のように
  最後のタイルの奥の頂点まで含む形で判定する。
- `main.ts`:
  - `isOwnFactionVisible(bounds)`: プレイヤー自身の集結地
    （`Simulation.getShrinePosition`、plan/0062で追加済み）または
    ウォーカー・家（`Simulation.listInspectableEntities()`）のいずれか
    ひとつでも`bounds`内にあればtrue。
  - `trySpendPlayerMana(cost)`: `trySpendMana(world, "player", cost)`の
    プレイヤー専用ラッパー。`isOwnFactionVisible(visibleBounds())`が
    falseならマナを一切消費せず、「🔍 照会」用の`#entity-info-panel`
    （新しいUI要素を追加せず流用）に「自分の勢力が画面内に見えて
    いません」と表示して`false`を返す。
  - `applyTool`内の8箇所すべての`trySpendMana(simulation.world,
    "player", ...)`呼び出し（地形の上げ下げ・集結地移動・地震・沼・
    火山・騎士化・最終決戦・洪水）を`trySpendPlayerMana`に置き換えた。
    ブラシ連続編集（`applyTerrainEditAt`）もこの1箇所を通るため
    自動的に同じ制限がかかる。
  - 行動方針（定住/集結/集結地へ/戦闘）と人口放出はdocs/game-system.md
    の言う「マナ消費なし」の操作であり奇跡ではないため、この制限の
    対象外のまま。

## 検証

- `npm run typecheck` / `npm run test -- --run`（328件）/ `npm run build`
  すべて通過。
- `IsoRenderer.test.ts`に`isWithinTileBounds`の単体テスト
  （境界の内側/ちょうど/外側の各ケース）を追加。
- headless Playwrightで実機シナリオを検証: 起動直後（カメラが
  プレイヤー自身の本拠地を中心に表示している状態）で地震を発動すると
  マナが正しく消費されること、カメラを敵の遠方（マップの反対側の
  隅）までパンしてから同じ操作をすると、マナが一切消費されず
  「自分の勢力が画面内に見えていません」という案内が表示される
  ことを確認（検証用の`window.__debug`フックは確認後に削除済み）。

# 0068: ワールドごとの使用可能な奇跡を制限する

## 背景

ユーザーによるWiki再照合レポートの優先度③「ワールドごとの奇跡解禁・禁止」
への対応。`game/worlds.ts`の`WorldDefinition`ドキュメント自身が既に
「使用可能な奇跡の制限」（`docs/game-system.md` 10節）を将来の拡張点として
認識しつつ、これまで未実装だったことを明記していた（
`plan/0062-original-scale-map.md`より前のコメントで既に言及）。

> World 1: 造成・地震のみ
> World 2: 沼解禁
> World 3: 騎士解禁
> ……

というユーザー自身の例に沿って、6つの固定ワールドに段階的な奇跡解禁を
実装した。

## 設計

- `game/worlds.ts`に`MiracleId`型（`"shrine" | "earthquake" | "swamp" |
  "knight" | "volcano" | "flood" | "armageddon"`）と`ALL_MIRACLES`定数を
  追加。隆起/沈降（既存の`terrainEditRule`で別途制御される、どのワールドでも
  必須の基本ループ）と照会（無料のツール、奇跡ではない）は対象外。
  `ui/toolbar.ts`の`ToolMode`とは別型として定義した（`game/`が`ui/`に
  依存しないようにするため）。
- `WorldDefinition.allowedMiracles: readonly MiracleId[]`を追加（必須
  フィールド）。6ワールドすべてに「後のワールドほど累積的に増える」
  （前のワールドで使えた奇跡が後で使えなくなることはない）設定を追加:
  1. 静かな草原: 地震のみ
  2. 乾いた高地: +沼
  3. 凍てつく国境: +集結地移動
  4. 灰の荒野: +騎士化
  5. 隆起する辺境: +火山
  6. 最終戦線: +洪水・最終決戦（＝全解禁）
- `main.ts`: `isAllowedMiracle`ヘルパーで、`applyTool`の奇跡分岐に入る前に
  防御的にチェック（terrainEditRuleの既存パターンを踏襲）。ツールバー
  初期化時に、そのワールドで未解禁の奇跡ボタンへ`disabled`属性を付与し、
  そもそも選択できないようにした（terrainEditRuleが禁止方向のraise/lower
  ボタンを無効化しているのと同じパターン）。
- 敵AI（`enemyMiracles.ts`）にも同じ制限を適用。`docs/game-system.md`の
  「敵の神はプレイヤーと同じルールで介入する」という既存方針
  （`terrainEditRule`が`enemyTerraform.ts`にも適用されているのと同じ考え方）
  に沿い、敵が実際に使う4種（地震・火山・騎士化・最終決戦）だけを
  `allowedMiracles`でゲート。優先順位フォールスルー（最終決戦→騎士化→
  火山→地震、上位が使えなければ下位へ）の仕組みにそのまま乗せたため、
  未解禁の奇跡はスキップされて次の選択肢に自然に流れる。沼・洪水・
  集結地移動は敵AIがそもそも使わないため、この2つの制限は現状プレイヤー
  専用（対称性の欠如として認識した上で許容）。
- `Simulation`/`SimulationConfig`に`allowedMiracles`を追加し、
  `createEnemyMiracleSystem`へ橋渡し。省略時は`ALL_MIRACLES`（従来通り
  無制限）にフォールバックするため、既存のテスト・呼び出しは変更不要。

## 検証

- `npm run typecheck` / `npm run test -- --run`（366件、複数回連続実行で
  再現確認）/ `npm run build` すべて通過。
- `worlds.test.ts`に追加: 前のワールドが解禁した奇跡を後のワールドが
  落とさない（累積性）、リストの中でどこかで種類数が増える、最終ワールドで
  全奇跡が解禁される、未知の奇跡IDが紛れ込んでいない。
- `enemyMiracles.test.ts`に追加: 決定的な人口差があっても最終決戦が未解禁
  なら地震へフォールスルー、騎士化が未解禁ならリーダーを騎士化しない、
  火山が未解禁なら地震へフォールスルー、地震すら未解禁なら何もしない。
- `simulation.test.ts`に追加: `allowedMiracles`が`Simulation`経由で
  実際に敵の自動キャストへ反映されることを結合テストで確認（`initial
  WalkersPerFaction: 0`だと両陣営とも生存者ゼロになりgetOutcome().overが
  即trueになって`update()`が恒久的に何もしなくなる、というテスト構築時の
  落とし穴を発見・記録した）。
- headless Playwrightで実機確認: 最初のワールド（地震のみ解禁）でツール
  バーを見ると、地震ボタンだけ有効でそれ以外（集結地移動・沼・騎士化・
  火山・洪水・最終決戦）は`disabled`属性が付いていることを確認。
  Playwright自身が無効化されたボタンへのクリックを拒否する（"element is
  not enabled"）ことでも、確実に無効化されていることを間接的に確認した。

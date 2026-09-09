# 0050 impact-effects

## 背景

一連のPOPULOUS 2比較調査で指摘された「災害の爽快感・スペクタクル」不足
のうち、最も基礎的な穴を埋める：これまでウォーカー同士の戦闘、沼への
溺死、洪水による水没、家の奪取・騎士による焼き討ちは、対象のECS
エンティティが破棄されるだけで、画面上には「消える」以外の演出が一切
なかった。何が起きたのかを見た目で伝える最小限の仕組みを追加する。

## アプローチ

`src/game/systems/effects.ts`に、キル/奪取/焼き討ち/溺死の種類を表す
`ImpactEffectType`（`combatDeath` / `houseCaptured` / `houseBurned` /
`drowned`）と、位置＋種類を運ぶ`ImpactEffectEvent`、`OnImpactEffect`
コールバック型を定義した。

### ECSエンティティではなくコールバック＋プレーン配列にした理由

最初はPOPULOUS-likeな「短命のECSエンティティ」として実装しようとした
（`ImpactEffect`コンポーネントを持つエンティティを`walkerCombatSystem`/
`houseCaptureSystem`/`swampSystem`/`drownFlood`から`world.createEntity()`
で生成し、`effectAgingSystem`で寿命管理する案）。しかしこの`World`実装
（`src/ecs/world.ts`）はエンティティIDを世代管理なしに即座に再利用する
（`destroyEntity`が空いたIDを`freeIds`へ積み、`createEntity`がそこから
`pop`する）。そのため「あるエンティティを破棄した直後に、同じシステム
呼び出しの中で新しいエンティティを作る」と、新エンティティが破棄した
はずのIDを再利用し、まだそのIDを保持しているテスト（や、同一パス内の
別の処理）から見て「破棄したはずのエンティティが生き返る」ように見える
バグを引き起こした。呼び出し順序を入れ替える／まとめて最後に生成する
などいくつか試したが、1回のシステム呼び出しで複数体を破棄する状況
（例：`drownFlood`が家と民をまとめて水没させる、`walkerCombatSystem`が
1tickで複数ペアを処理する）では根本的に解消できないと判断し、ECS
エンティティを使わない設計に切り替えた。

`Simulation`が`MatchEvent`と同じ要領で、コールバックから届いた
`ImpactEffectEvent`を`age: 0`付きのプレーン配列（`impactEffects`）に
積む。`update()`の最後で`age`を`deltaSeconds`分進め、
`IMPACT_EFFECT_DURATION`（0.5秒）を超えたものを取り除く。`MatchEvent`
と違い古いものを残さないのは、`EntityLayer`が毎フレーム全件を描画する
ため。

コールバックを受け取るため、これまで裸の`System`定数だった
`walkerCombatSystem`/`swampSystem`を、他のシステム（`houseCaptureSystem`
など）と同じ`create*System(config)`ファクトリ形式に変更した
（`createWalkerCombatSystem`/`createSwampSystem`）。`createHouseCaptureSystem`
には`onImpact`を追加。`drownFlood`（Systemではなく直接呼ばれる関数）は
第3引数に`onImpact`を追加した。

### 描画

`EntityLayer.update()`に`impactEffects`引数を追加し、`world`からの
ECSクエリではなく渡された配列をそのまま描画する。`impactEffectVisual
(type, age, duration)`という純粋関数（Graphics不要でユニットテスト可能）
が、経過時間から「外側へ広がりながら薄くなっていく円環」の半径・色・
不透明度を計算する。種類ごとに色を分けた
（combatDeath=赤、houseCaptured=黄、houseBurned=オレンジ、drowned=青）。

`main.ts`は`entityLayer.update(simulation.world, deltaSeconds,
simulation.getImpactEffects())`と`drownFlood(simulation.world, heightmap,
(event) => simulation.recordImpactEffect(event))`の2箇所だけ変更。

## テスト

- `src/game/systems/combat.test.ts`：`createWalkerCombatSystem`/
  `createHouseCaptureSystem`が`onImpact`を通じて正しい種類・位置の
  `ImpactEffectEvent`を報告すること（撃破・相討ち・家の奪取・撃退・
  騎士の焼き討ち）、何も起きなければ何も報告しないことを検証。
- `src/game/systems/swamp.test.ts`：`createSwampSystem`が溺死ごとに
  `drowned`イベントを報告し、騎士には報告しないことを検証。
- `src/game/flood.test.ts`：`drownFlood`が水没した家/民ごとに`drowned`
  イベントを報告し、高台の対象には何も報告しないことを検証。
- `src/render/EntityLayer.test.ts`：`impactEffectVisual`が0秒地点で
  半径0・不透明度1、duration到達で半径最大・不透明度0になること、
  途中で単調に広がり／薄くなること、durationを超えた`age`をクランプ
  すること、種類ごとに異なる色を持つことを検証。
- `npm run typecheck` / `npm run test -- --run`（265件）/
  `npm run build`がすべて成功。
- ヘッドレスブラウザで実際に沼を1体だけ溺死させ、`Simulation.update`
  を手動で1tickずつ進めながらスクリーンショットを撮影：溺死直後に
  青い円環が現れ、時間経過とともに外側へ広がりながら薄くなっていく
  ことを確認した。

## 残作業

- 種類は4つのみ（combatDeath/houseCaptured/houseBurned/drowned）。
  火山の噴火や地震そのものにはまだ専用の演出はない
  （火山は別途PR #52でマグマ表現を実装済み、地震は既存のカメラ
  シェイクのみ）。
- 音（奇跡固有SE）は別タスク。今回は視覚のみ。
- `ImpactEffectSnapshot`の保持は`Simulation`単位のプレーン配列であり、
  `matchEvents`のような永続ログではない——毎フレーム古いものを間引く
  ため、試合終了後の「戦いの記録」には出てこない（意図通り、そちらは
  ミラクルや家のマイルストーンだけを扱う別の仕組み）。

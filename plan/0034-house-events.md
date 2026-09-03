# 0034 house-events

## 背景

`plan/0032-match-event-log.md`が明示的にスコープ外としていた続き。
これまでの「戦いの記録」は奇跡の使用だけを記録しており、レビューが
例に挙げた「最大都市壊滅」に相当するような、家そのものに起きる
出来事（奪う・焼く・最高レベルまで発展する）はまだ記録されていな
かった。

## アプローチ

`MatchEventType`に3種類追加：

- `houseCaptured` — 戦闘で敵の家を奪った（`combat.ts`の
  `houseCaptureSystem`が担当）
- `houseBurned` — 騎士が敵の家を焼き払った（同上、通常の奪取とは
  別分岐）
- `houseReachedCastle` — 家が最高レベル（castle）まで発展した
  （`houseUpgrade.ts`の`createHouseUpgradeSystem`が担当）。途中の
  レベルアップ・ダウングレードは対象外——あまりに頻繁で、記録に
  値する「事件」にならないため

いずれも既存の`enemyMiracles.ts`の`onAction`パターンを踏襲し、各
システムにオプションのコールバック（`onCapture`/`onBurn`/
`onReachCastle`）を追加。`houseCaptureSystem`は定数からファクトリ関数
`createHouseCaptureSystem(config)`に変更（`enemyMiracles.ts`や
`enemyAi.ts`と同じ形）。`Simulation`のコンストラクタでこれらの
コールバックを`this.recordEvent(faction, type)`に配線した。

`houseCaptured`/`houseBurned`は「誰が奪ったか／焼いたか」
（`walkerOwner.faction`）を記録する。`houseReachedCastle`は家の
`Owner`から発展した側の勢力を記録するが、既存のユニットテスト
（`houseUpgrade.test.ts`）がOwnerを付けていない家でこのシステムを
テストしていたため、クエリ自体は`House, Position`のままとし、
`world.has(entity, Owner)`で存在確認してからのみコールバックを
呼ぶようにした（Ownerがない場合は静かに何もしない）。

表示側は`render/miracleLabels.ts`を`render/matchEventLabels.ts`に
改名し、`describeMiracleEvent`を`describeMatchEvent`に一般化。
テンプレートに`{subject}`（発生させた側）と`{opponent}`（家の持ち主
だった側）の2つのプレースホルダを導入し、`houseCaptured`/
`houseBurned`が「{subject}が{opponent}の家を奪った」のように、
誰目線でも正しい文になるようにした。

## テスト

- `combat.test.ts`：`onCapture`/`onBurn`が正しい勢力で呼ばれること、
  奪取に失敗した場合や焼き払いでは`onCapture`が呼ばれないことを
  既存テストに追加。
- `houseUpgrade.test.ts`に2件追加：castleに到達した瞬間だけ
  `onReachCastle`が呼ばれ、既にcastleの家を再評価しても呼ばれない
  こと、Ownerのない家では例外を投げずに何も呼ばれないこと。
- `simulation.test.ts`に3件追加：`Simulation`経由でも3種類のイベント
  が正しく`getMatchEvents()`に記録されること。既存の「敵が最終決戦を
  自動発動する」テストが、たまたま完全に平坦なマップを使っていた
  ため、プレイヤーの家が同じティックで（無関係に）castleまで発展して
  しまい新たに`houseReachedCastle`イベントが増える副作用が発生、
  家の位置を地図の角（`countFlatNeighbors`が地図端で頭打ちになる
  位置）に動かして回避した。
- `Hud.test.ts`に1件追加：3種類の家イベントが、行動した側に関わらず
  正しい主語・相手で整形されること。
- `npm run typecheck` / `npm run test -- --run`（218件）/
  `npm run build`がすべて成功。5回連続でテストスイート全体を実行し、
  新しいイベント記録が既存の実乱数ベースの長時間シミュレーション
  テストにフレーキーさを持ち込んでいないことを確認。
- ヘッドレスブラウザで実際の試合を45秒間走らせ、コンソールエラーが
  発生しないことを確認。

## 残作業

- 火山・洪水による家の破壊はまだ記録していない（`eruptVolcano`/
  `drownFlood`は誰の家が何軒失われたかを呼び出し元に返さない）。
  「洪水から生還した」のようなドラマはこの延長で実装できるが、
  今回はスコープ外とした。
- レベルダウングレード（castleから転落するなど）も記録していない。

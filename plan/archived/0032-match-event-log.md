# 0032 match-event-log

## 背景

再評価レビューの重点項目「勝敗以外のドラマを記録する：『最大都市壊滅』
『洪水から生還』『騎士が敵国を横断』など、1試合の物語をリザルトで
見せる」への対応の第一歩。これまで試合終了時の表示は`Hud.ts`が出す
「GAME OVER — enemy wins」という1行だけで、その試合中に何が起きたか
（誰がいつ何の奇跡を使ったか）は一切残らなかった。

家の破壊・アップグレード・洪水からの生還といった、より踏み込んだ
「事件」の検出（combat.ts・houseUpgrade.ts・flood.tsなどへの計装が
必要）はスコープが大きくなるため今回は含めない。まずは奇跡の使用
という、すでに`onEnemyAction`（敵側）と各`vibrate()`/`triggerShake()`
呼び出し（プレイヤー側）という形でイベントの発生点が両方とも既に
main.ts/enemyMiracles.tsに存在する題材に絞り、「試合のタイムライン」
という土台を作った。

## アプローチ

`Simulation`に`MatchEvent`（`{ time, faction, type }`）と
`MatchEventType`（奇跡7種：集結地移動・地震・沼・火山・騎士化・
最終決戦・洪水。素の隆起／沈降はvibrate()と同じ理由で対象外——最も
頻繁な操作をログすると本当に特筆すべき出来事が埋もれる）を追加。

- `recordEvent(faction, type)`／`getMatchEvents()`を公開し、
  `main.ts`は既存の`vibrate()`/`triggerShake()`呼び出しサイト
  （プレイヤーの奇跡7箇所）でこれも呼ぶ。
- 敵の奇跡は`createEnemyMiracleSystem`の`onAction`コールバックを
  `Simulation`のコンストラクタでラップし、`config.onEnemyAction`
  （既存のトースト・シェイク用）に転送する前に自動で`recordEvent`
  する。呼び出し側（main.ts）は何もしなくてよい。
- `elapsedTime`を`update()`内で積算し、ゲーム終了後は
  （`update()`が早期returnするため）時間が凍結される。

表示側は`src/render/miracleLabels.ts`（新規）に集約：
`describeMiracleEvent(type, faction)`が絵文字＋日本語の一文
（例：「💥 あなたが地震を起こした」）を返す。これはmain.ts側の敵行動
トースト（`showEnemyEventToast`）と、`Hud.ts`が試合終了後に追加する
「戦いの記録:」セクションの両方から共有され、同じ出来事が場所によって
違う言い回しになることを防ぐ。

## 副次的なバグ修正

デバッグ中に発見：`enemyMiracles.ts`の火山分岐（#33で追加）は
`EnemyMiracleEvent`の型に`"volcano"`が含まれておらず、`onAction`も
一度も呼んでいなかった。そのため敵が火山を発動しても、トースト・
シェイクは（本来volcano用の演出ではなく）何もしない状態になって
いた。型に`"volcano"`を追加し、成功時に`onAction`を呼ぶよう修正。
`main.ts`側のシェイク強度分岐も、これまで存在しなかった
volcanoケースが暗黙的にknight用の弱い値へ落ちてしまう問題を避ける
ため、明示的なルックアップテーブルに直した。`enemyMiracles.test.ts`
に見落とされていた`onAction`アサーションを追加した。

## テスト

- `simulation.test.ts`に3件追加：プレイヤーのイベント記録が試合時間で
  タイムスタンプされること、ゲーム終了後は時間が凍結されること、
  敵AI自身の奇跡発動も自動的に記録されること（後者は
  `createEnemyTerraformSystem`が同じティックでわずかにマナを消費する
  ため、`MAX_MANA`＝`ARMAGEDDON_MANA_COST`という上限の都合上「余裕を
  持たせる」対処が効かないことが分かり、代わりに完全に平坦な
  ヒートマップを使うことで地形操作コストの発生自体を避けた）。
- `render/Hud.test.ts`（新規）：試合続行中はリザルトが出ないこと、
  終了後はイベントを発生順に「m:ss 絵文字 誰が何をした」の形式で
  正しく整形すること、イベントが1つもなくてもGAME OVER行とヘッダーは
  出ること。
- `enemyMiracles.test.ts`に、火山成功時の`onAction`アサーションを追加
  （上記バグ修正の回帰テスト）。
- `npm run typecheck` / `npm run test -- --run`（211件）/ `npm run build`
  がすべて成功。
- ヘッドレスブラウザで実際にプレイヤーの地震を発動し、
  `recordEvent`呼び出しが追加された状態でもコンソールエラーが
  発生しないことを確認。

## 残作業

- 家の破壊・アップグレード・洪水生還など、より深い「事件」の検出は
  今回のスコープ外。奇跡以外のイベントタイプを`MatchEventType`に
  追加していく形で自然に拡張できる。
- 記録するイベント数に上限を設けていない（マナ経済上、1試合で
  数十件を超えることは考えにくいため）。長時間プレイで問題になれば
  直近N件に絞るなどの対応を検討する。

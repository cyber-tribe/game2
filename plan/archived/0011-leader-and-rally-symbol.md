# リーダーと集結シンボル（goToShrineモード）

`docs/game-system.md`の「リーダー」「集結シンボル」を実装した。
`FactionState`に`leaderId?: Entity`を追加し、`game/systems/leader.ts`の
`leaderSystem`が毎tick、各勢力の`leaderId`が空、またはその参照先が
もう生きていない場合に、その勢力の生存ウォーカーを1体選んで新たな
リーダーに昇格させる。本来は「集結シンボルに最初に触れた者がリーダーに
なる」が仕様だが、シンボルに衝突判定を持つ実体は未実装のため、
生存する任意のウォーカーを昇格させる簡略化とした。

`game/systems/goToShrine.ts`の`goToShrineSystem`はbehaviorModeが
`goToShrine`の勢力について、リーダーには`FactionState.shrinePosition`を、
リーダー以外の同勢力ウォーカーにはリーダーの現在地をMoveTargetとして
設定する（`fightTargetingSystem`と同じく`createWanderTargetSystem`より
前に実行し、既にターゲットを持つウォーカーには手を出さない）。これにより
「民はリーダーへ、リーダーはシンボルへ向かう（軍勢の誘導）」という
docs/game-system.mdの記述をそのまま再現している。

集結シンボルの移動（奇跡「集結シンボル移動」）は`game/faction.ts`の
`moveShrine(world, faction, position)`で`shrinePosition`を書き換えるだけの
軽量な処理。`main.ts`のツールバー1行目に🚩ボタンを追加し、
`SHRINE_MOVE_MANA_COST`（地形編集より高く地震より低い「小」ティア）を
消費する。行動方針側にも🚩「集結地へ」ボタンを追加した。

`EntityLayer`はどの勢力の`FactionState`についても`shrinePosition`に
旗のグラフィックを描画し、`leaderId`が指すウォーカーは通常より大きい円＋
白いフチで強調表示する。プレイヤーがシンボルをタップで移動させた効果が
その場で目視確認できる。

Simulationの統合テストで、①ゲーム開始直後の1tickで両勢力に
`leaderId`が設定されること、②ウォーカー1体だけの勢力を`goToShrine`に
切り替えてシンボルを離れた地点へ移動させると、そのリーダーが実際に
シンボルの座標まで歩いて定住する（＝Houseがちょうどシンボル座標に
できる）ことを確認した。ヘッドレスブラウザでも🚩集結地移動ボタンで
旗の位置が地図上で動くこと、🚩集結地へモードに切り替えてもコンソール
エラーが出ないことを確認済み。

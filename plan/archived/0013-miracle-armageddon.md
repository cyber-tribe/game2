# 奇跡「最終決戦」

`docs/game-system.md`の最後の奇跡「最終決戦」を実装した。他の奇跡と
異なり自陣営だけでなく両陣営に同時に効く：`game/armageddon.ts`の
`triggerArmageddon(world, center)`は、すべてのHouseを`destroyEntity`で
破壊し同じ座標にWalkerを1体ずつ生成（強さはそのHouseレベルの`defense`
を流用）した上で、両陣営の`FactionState.shrinePosition`を`center`
（マップ中央）へ、`behaviorMode`を`"goToShrine"`へ強制的に揃える。
これは新しい移動ロジックを書き下ろすのではなく、既存のリーダー/
`goToShrineSystem`の仕組みにそのまま「両陣営同時に」乗せることで
「全ての民が家を捨てて中央に集まり」を実現している。

実装中に2つの相互作用が問題になった。1つ目は`createEnemyAiSystem`が
`ENEMY_AI_DECISION_INTERVAL`ごとに敵のbehaviorModeを`"fight"`/`"settle"`
へ勝手に戻してしまい、最終決戦の行進を上書きしてしまう点。2つ目は
`createSettleSystem`がbehaviorModeを見ずに「目的地に着いて目標を
持たないseekingウォーカー」を無条件に定住させてしまうため、中央に
集まった双方の民がそのまま新しい家を build してしまい、決着が付かず
無限に人口が湧き続けてしまう点。どちらも「一度始まったら後戻りしない」
という最終決戦の性質と衝突していたため、`FactionState`に
`finalBattle?: boolean`を追加し、`triggerArmageddon`が両陣営に立てる
ようにした上で、`createEnemyAiSystem`と`createSettleSystem`の双方に
「`finalBattle`が立っている勢力には手を出さない」早期returnを追加して
解決した。中央で双方が接触すれば、勢力・behaviorModeを問わず常に解決
される既存の`walkerCombatSystem`/`houseCaptureSystem`がそのまま決着を
付ける。したがって`getOutcome()`側の勝敗判定ロジックにも変更は不要
だった。

`main.ts`のツールバーに専用の4行目（横幅いっぱいの1ボタン）として
☠️最終決戦を追加し、`ARMAGEDDON_MANA_COST`（全奇跡中最高の「最大」
ティア）を消費する。地図上のタップ位置は使わない完全なグローバル効果。

Simulationの統合テストで、両陣営が地形の広範囲に家を作った状態から
最終決戦を発動すると、直後に全Houseが消滅しどちらもgoToShrineへ
切り替わること、十分な時間の経過後に必ず`getOutcome().over`がtrueに
なる（＝決着が付く）ことを確認した。ヘッドレスブラウザでも数十件の
House/Walkerを抱えた状態で☠️最終決戦をタップし、双方の民が中央の
旗へ向けて収束しながら数を減らしていく様子とコンソールエラーが
ないことを確認した。

これで`docs/game-system.md`に記載された奇跡は全て実装済みとなった。
残るは征服モードの複数ワールド進行（約500ワールドを順に攻略する
キャンペーン構造）のみ。

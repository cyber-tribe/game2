# 行動方針（settle / gather / fight）とごく簡単な敵AI

`FactionState.behaviorMode`は当初型だけ定義されていたが、以下のシステムで
実際に機能するようにした。

- `gatherSystem`：behaviorModeが`gather`の勢力について、`GATHER_RANGE`
  以内にいる同勢力の「探索中」ウォーカー同士をstrength合算の1体に統合する。
- `fightTargetingSystem`：behaviorModeが`fight`の勢力について、目標を
  持たない探索中ウォーカーに最も近い敵ウォーカー／家をMoveTargetとして
  設定する（`createWanderTargetSystem`より前に実行し、既にターゲットが
  付いたウォーカーは通常の徘徊には流れない）。実際の勝敗は既存の
  `walkerCombatSystem`/`houseCaptureSystem`が引き続き解決する。
- `createEnemyAiSystem`：`docs/game-system.md`の「敵AI」の最小限の実装。
  一定間隔（`ENEMY_AI_DECISION_INTERVAL`）ごとに敵勢力のウォーカー数を見て、
  閾値（`ENEMY_AI_AGGRESSION_THRESHOLD`）以上ならfight、未満ならsettleに
  切り替える。マナや脅威度までは見ておらず、あくまで「敵が何もしない
  置物ではない」ことを保証する最小実装。
- プレイヤー自身の行動方針は`main.ts`でキーボードの1/2/3キー
  （settle/gather/fight）に割り当て、HUDに現在のモードを表示する。
  `Simulation.setBehaviorMode`/`getBehaviorMode`はマナを消費しない
  （`docs/game-system.md`の「影響」はコストなしという記述の通り）。

ヘッドレスシミュレーションで、開始直後から両勢力をfightモードにすると
実際に接触・交戦し、両者壊滅（相討ち）に至ることを確認済み（対角線上に
離れた初期配置のままブラウザで目視すると、歩いて到達するまで数十秒
かかるため、見た目での確認より高速なヘッドレス実行の方が検証に適する）。

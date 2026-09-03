# 奇跡「騎士化」

リーダー実装によって前提条件が揃ったため、`docs/game-system.md`の
「騎士化」を実装した。`game/knight.ts`の`knightify(world, faction)`は
`FactionState.leaderId`が指すウォーカーの`Walker.state`を`"knight"`に
変えるだけの処理（この状態自体は当初から`WalkerState`に用意されていた
プレースホルダー）。リーダー不在時や既に騎士の場合は何もしない。

`"knight"`状態のウォーカーは既存の`"seeking"`前提のシステム
（`createWanderTargetSystem`/`createSettleSystem`/`gatherSystem`/
`fightTargetingSystem`）から自動的に無視されるため、代わりに新設した
`game/systems/knight.ts`の`knightTargetingSystem`が「指示に依存せず
戦い続ける」を実現する：`fightTargetingSystem`と同じ最近傍の敵ウォーカー
／家探索ロジック（`fightTargeting.ts`から`findNearestEnemyPosition`を
export して共用）を使うが、勢力の`behaviorMode`を一切見ず、`"knight"`
状態のウォーカーには常に効く。

「敵の民を殺し」は既存の`walkerCombatSystem`（勢力間の接触は
behaviorModeを問わず常に解決される）でそのまま賄えたが、「家を（奪わず）
焼き払う」は`houseCaptureSystem`に専用分岐を追加した：騎士が敵の家に
到達すると、防御力に関わらずその家を`destroyEntity`で焼き払い（＝
捕獲しない）、通常の攻撃者と異なり攻撃側の騎士自体は消費されず
生き残って進軍を続ける。「沼を避け」は`swampSystem`に`state ===
"knight"`の早期`continue`を追加して対応した。

`main.ts`のツールバー3行目に⚔️騎士化ボタンを追加し、`KNIGHT_MANA_COST`
（火山と同格の「大」ティア）を消費する。座標を伴わないグローバル効果
という点で洪水・集結シンボル移動と同じ扱い。`EntityLayer`は騎士を
金色で塗り分けて他のウォーカーと視覚的に区別できるようにした
（リーダーの大きな円＋白いフチの強調表示はそのまま重なる）。

Simulationの統合テストで、極小のマップで両陣営を1ウォーカーずつ開始し
プレイヤー側を騎士化すると、敵ウォーカーが（歩いて定住していた場合は
家ごと）一掃されつつプレイヤーの騎士自身は生き残ることを確認した。
ヘッドレスブラウザでも⚔️騎士化ボタンをタップして騎士（金色の円）が
出現し、しばらく進軍させてもコンソールエラーが出ないことを確認済み。

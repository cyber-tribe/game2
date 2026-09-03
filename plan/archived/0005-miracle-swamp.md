# 奇跡「沼」

`Swamp`コンポーネント（`radius`, `remainingCapacity`）を追加し、
`game/swamp.ts`の`createSwamp(world, x, y, radius, capacity)`で任意の
座標に配置できるようにした。`swampSystem`は毎tick、沼の半径以内に
入ったウォーカーを問答無用で消滅させ、`remainingCapacity`を1減らす。
0になった沼自体も消える（`docs/game-system.md`の「一定数を飲み込むと
消えるタイプ」）。恒久タイプや、騎士が沼を回避する挙動（騎士自体が
未実装）は対応していない。

地震と同じく`main.ts`のツールバー（🐸 沼）から発動し、`SWAMP_MANA_COST`
を消費する。`EntityLayer`は沼を紫がかった半透明の円として、家・
ウォーカーより先に（背面に）描画する。Simulationの統合テストで、
巨大な半径の沼を置けば範囲内の全ウォーカーが実際に消滅することを
確認済み。ヘッドレスブラウザでも沼の配置・見た目・コンソールエラーが
ないことを確認した。

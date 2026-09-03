# 奇跡「洪水」

`Heightmap`に`waterLevel`（現在の海面高さ、初期値は`MIN_ELEVATION`）を
追加した。当初のdocs/game-system.mdのデータモデル素案（`docs/game-system.md`
内のSimulation設計メモ）で構想していた通りの実装で、地形の頂点標高
（`vertices`）自体は変えずに「水没とみなす基準線」だけを動かす方式にした。
`world/heightmap.ts`の`applyFlood(heightmap, amount)`は`waterLevel`を
加算する（既定+1、`MAX_ELEVATION`でクランプ、複数回発動で累積する）。
`isBuildable`・`IsoRenderer`の水面描画とも、判定基準を固定値`0`から
`heightmap.waterLevel`に変更した。

洪水は特定の1マスではなく地図全体に効く奇跡のため、`applyEarthquake`等の
ような対象座標を取らない。`game/flood.ts`の`drownFlood(world, heightmap)`
は、水没した（`sampleElevation`が新しい`waterLevel`以下になった）House/
Walkerを勢力を問わず一括で破壊する（`docs/game-system.md`の「使用側も
被害を受けるため高台の確保が前提」を再現）。

`main.ts`のツールバー3行目に🌊洪水ボタンを追加し、`FLOOD_MANA_COST`
（沼・地震・火山より高い「特大」ティア）を消費する。地図上のタップ位置
自体は使わず、タップは発動の確認としてのみ機能する。Simulationの統合
テストで、両陣営が定住した後に洪水を起こすと全ての家が水没して消滅
することを確認済み。ヘッドレスブラウザでも実際に2回連続で発動し、
海（水域）が目に見えて広がる様子とコンソールエラーがないことを確認した。

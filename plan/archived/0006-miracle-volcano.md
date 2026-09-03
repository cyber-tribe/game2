# 奇跡「火山」

`Heightmap`に`rockHardness`（頂点ごとの岩の硬さ、0なら通常の地面）を
追加した。`world/heightmap.ts`の`applyVolcano(heightmap, x, y, radius,
hardness)`は対象範囲の頂点を`MAX_ELEVATION`まで一気に隆起させ、同時に
`rockHardness`を設定する（`docs/game-system.md`の「対象地点を高く
隆起させ、岩石で覆う」）。`raiseVertex`は編集したマスの`rockHardness`
を1ずつ削るようにしたため、`0になるまで繰り返し地形操作をする`ことで
岩を取り除ける（「復旧には大量の地形操作が必要」）。`isBuildable`は
標高チェックに加えて岩でないことも見るようにし、`isRock`という判定
関数も新設した。

地震（ランダムに荒らして間接的に既存House.levelのダウングレードへ
反応させる）とは異なり、火山はその場にあった建物ごと土地を奪う仕様
（「敵の土地を長期的に奪う」）のため、`game/volcano.ts`の
`eruptVolcano(world, x, y, radius)`で同じ範囲にいるHouse/Walker
エンティティを直接破壊する処理を別途用意し、`main.ts`の火山ツールで
`applyVolcano`（地形）と`eruptVolcano`（ECS）の両方を呼ぶようにした。

`main.ts`のツールバーは2行目（沼/火山）を追加し、`VOLCANO_MANA_COST`
（沼・地震より高い「大」ティア）を消費する。`IsoRenderer`は岩マスを
（元の地形タイプに関わらず）rock色で描画する。Simulationの統合テストで
既存の家が噴火で消滅し跡地が建築不可になることを確認済み。ヘッドレス
ブラウザでも実際にタップして地図中央に巨大な岩の尖塔が出現する様子を
確認した。

# 地形タイプによる人口成長速度への影響

`docs/game-system.md`の「地形タイプが複数あり...見た目だけでなく民の
成長速度などに影響する（例：草原は標準、砂漠は成長が遅い、溶岩地帯は
さらに過酷）」を実装した。`Heightmap.terrain`（`grass`/`desert`/`snow`/
`rock`、マップ全体で1種類）は火山の岩描画で既に参照されていたが、
成長速度への影響はまだ結び付いていなかった。`game/constants.ts`に
`TERRAIN_GROWTH_MULTIPLIER: Record<TerrainType, number>`
（grass:1, desert:0.6, snow:0.75, rock:0.4）を追加し、
`createHouseGrowthSystem`が`heightmap`を渡された場合、`growthRate`に
この係数を掛けてから使うようにした。`rock`はdocsの「溶岩地帯」に
対応する最も過酷な係数とした（このコードベースには溶岩地帯を火山岩と
別に区別する概念がないため）。`Simulation`は既存の`config.heightmap`を
そのまま`createHouseGrowthSystem`にも渡すだけで済んだ。

`houseGrowth.test.ts`に単体テストを、`simulation.test.ts`に
「地形以外の条件を完全に揃えた上でgrass/rockそれぞれのSimulationに
同じ家を1軒ずつ手動配置し、同じ秒数だけ経過させると人口の蓄積量が
grassの方が明確に大きい」という結合テストを追加して確認した（自然な
徘徊・定住任せだと乱数で結果がぶれるため、あえて家を直接配置する
ことで決定的なテストにしている）。現状`main.ts`は常に`grass`固定で
Simulationを生成しているため、実際のプレイ画面ではまだ効果を体感
できない——地形タイプが実際にgrass以外になるのは、今後実装する
征服モードの各ワールド設定から先。

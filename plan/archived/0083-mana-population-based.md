# マナ生産をレベル固定レートから実際の人口に連動させる

## 背景

原作『POPULOUS 2』への忠実度を評価軸に固定したフィードバックで、
「小規模なA/Bランク項目から着手する」の一環として、マナを人口ベースに
する仕組みの見直しが挙げられた。

`docs/game-system.md`は元々「信者の総人口に比例して自動蓄積」という
設計意図を明記していたが、実装（`manaSystem`）は家の**レベル**
（hut/lodge/manor/castle）ごとの固定レート（`HOUSE_LEVELS[level].manaRate`）
を使っており、同じレベルの家であれば`House.population`（0〜そのレベルの
`capacity`の間で増減する、次のウォーカー輩出までの蓄積値）が0でも
満杯でも同じレートでマナを生産していた。`plan/archived/0018-mana-pacing-
rebalance.md`はこの固定レート自体は「人口に比例する」という意図を
満たすものとして検証済みだったが、レベル内での連続的な人口変化までは
反映していなかった。

ユーザーに確認したところ、`House.population`を直接使い、家が育つ
過程で滑らかにマナ供給が増える方向を選択した。

## 対応

`src/game/systems/mana.ts`の`manaSystem`で、各家の寄与を
`HOUSE_LEVELS[level].manaRate * (house.population / capacity)`に変更。
`population`は`houseGrowth.ts`により常に`[0, capacity]`の範囲に保たれて
いるため、この式は常に`0〜そのレベルの本来のmanaRate`の範囲に収まる。
満杯（`population === capacity`）の家は従来通り丸ごとのレートを生産する
ため、`plan/archived/0018`が`EARTHQUAKE_MANA_COST`/`MAX_MANA`との比率で
調整した定常状態のバランスはそのまま維持される。変わるのは、ウォーカー
輩出直後に`population`が0近くまで戻った家が、次に満杯へ育つまでの間、
生産レートも一緒に低い状態から回復していく点——原作の「信者の人口が
そのままマナ供給になる」という説明に、実装がより近づいた形。

`HUT_MANA_RATE_CAP`によるhutレベル合算の上限ロジックは変更していない。

## 検証

- `npm run typecheck` / `npm run test -- --run`（438件、既存の
  `mana.test.ts`は「常に満杯の家」を前提にしていたテストが多かったため、
  `createHouse`ヘルパーのデフォルトを`population: 0`から
  `population: capacity`（満杯）に変更して既存の意図を保ちつつ、
  「population 0の家はマナを生まない」「populationが半分ならレートも
  半分」の2件を新規追加）/ `npm run build`：すべて成功。
- Playwright（chromium）で実機確認：ゲーム開始直後は各家のpopulationが
  低いためマナの伸びが緩やかに始まり、家が育つにつれて増加ペースが
  速くなることを確認（t=2s: mana 0.1 → t=22s: mana 25.8 → t=42s: mana
  85.1、家の棟数増加と歩調を合わせて加速）。コンソールエラーなし。

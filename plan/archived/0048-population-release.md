# 0048 population-release

## 背景

間接操作型の陣取りシムとしての完成度を高めるため、既存の縦方向の成長
ループ（地形造成→家→人口→マナ→奇跡）に加えて、プレイヤーの意思決定の
幅を広げる横方向の仕組みを検討する中で、「家に人口を貯め続ける vs
今すぐ人口を外へ送り出して拡張する」という新しいジレンマを追加すること
にした。

現状の`createHouseGrowthSystem`は、家の`population`が`HOUSE_LEVELS[level]
.capacity`に達するまで待たないとウォーカーが1体も生まれない。つまり
プレイヤーはただ待つしかなく、「今すぐ拡張を優先する」という選択肢が
存在しなかった。

## アプローチ

`src/game/populationRelease.ts`に純粋関数`releasePopulation(world,
faction, maxHousesPerFaction)`を新設し、`Simulation.releasePopulation
(faction)`から呼べるようにした。`knightify`/`moveShrine`と同じ「ミラクル
ではない、マナ消費なしの直接操作」として扱う（`behaviorMode`の切り替えと
同じ位置づけ）。

効果：呼び出した時点で、そのフェーションが所有する家のうち
`population / capacity`が`POPULATION_RELEASE_MIN_FRACTION`（0.5）以上
貯まっている家すべてを対象に、即座に`population`を0へリセットし、その場に
ウォーカーを1体生成する。

ただし生成されるウォーカーは本来の（`capacity`到達で生まれる）ウォーカー
より弱い。`strength`は`(population / capacity) * POPULATION_RELEASE_
EFFICIENCY`（0.75倍）——貯めきる前に送り出す代償として、常にstrength 1
未満になる。`settle.ts`のウォーカー定住判定はstrengthを一切見ないため、
弱いウォーカーでも新しい家を建てる能力は変わらない。つまりこれは

- 貯める：時間はかかるが、strength 1のウォーカーが生まれる
  （戦闘・家の襲撃に強い）
- 早出しする：家1軒あたりの必要時間が最短で半分（0.5倍）まで縮む代わり、
  生まれるウォーカーは恒久的に弱い（strength 0.375〜0.75、戦闘や
  `HOUSE_LEVELS`の`defense`（3〜20）を要する家の襲撃にはほぼ勝てない）

という明確なトレードオフになる。「弱くても数を急いで増やして開拓する」
か「強い1体を待つ」かをプレイヤーが選べるようにした。

`maxHousesPerFaction`（既存の土地不足の代用上限、`houseGrowth.ts`参照）は
`releasePopulation`でも尊重する。この上限がなければ、上限に達して
`createHouseGrowthSystem`が新規スポーンを止めても、プレイヤーがこの
操作で人口をウォーカーへ変換し続けることで上限を実質無効化できてしまう
——上限が存在する理由（O(entities)系システムの計算量爆発を防ぐ）その
ものを壊すため。

`POPULATION_RELEASE_MIN_FRACTION`（0.5）を設けているのは、下限なしだと
1タップで家の蓄積をいくらでも細切れの弱いウォーカーへ変換でき、
`createHouseGrowthSystem`本来のcapacity単位のペース配分を無視して
家の数を際限なく増やせてしまうため。

## UI

`index.html`のツールバーに「人口」セクションを新設（`行動方針`と`奇跡`の
間）。`行動方針`と同じくマナを消費しない操作のため緑のアクセントを共有
しつつ、常時有効なモード切り替えではなく単発の即時アクションなので、
ラジオボタン形式（`data-mode`/`data-tool`、`aria-pressed`によるトグル）
ではなく単独のボタン（`#release-population`）として実装した。`main.ts`
から直接`addEventListener`で配線し（`#play-again`と同じパターン）、
何か実際に放出できたときだけ軽いバイブレーションを鳴らす（空振りタップ
では何も起きない）。

## テスト

- `src/game/populationRelease.test.ts`：閾値未満では何もしないこと、
  閾値以上の家をpopulation 0にリセットしつつ`strength < 1`の
  ウォーカーを生成すること、複数の対象家をまとめて処理すること、
  他フェーションの家を無視すること、`maxHousesPerFaction`到達時は
  何もしないことを検証。
- `npm run typecheck` / `npm run test -- --run`（250件）/
  `npm run build`がすべて成功。
- ヘッドレスブラウザで実際にボタンをタップし、蓄積前は空振り（house/
  walker数が変化しない）、`Simulation.update`で人口を貯めた後にタップ
  すると`walkers`が増えることを確認した。

## 残作業

- 個々の家を選んでピンポイントで放出する（POPULOUS 2のスプログの
  ように特定の建物を狙う）UIは実装していない。現状はプレイヤーの
  フェーション全体の対象家を一括処理する——`knightify`/`moveShrine`
  など既存の直接操作と同じ、家単位の選択UIが存在しない現行の設計に
  合わせた形。個別の家をタップして選択する仕組みは、まだ存在しない
  「家をタップして情報を見る」UI自体を新設する必要があり、今回の
  スコープ外とした。

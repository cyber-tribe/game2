# 0056: HUDに総人口の比較表示を追加する

## 背景

`docs/game-system.md` 11節（UI要素）は、情報パネルの一部として
「両陣営の総人口の比較表示もある」と定めている。現状のHUD
（`src/render/Hud.ts`）は各陣営のmana/house/walker/behaviorModeを
テキストで並べて表示するのみで、どちらが人口で優勢かを一目で
比較する手段がなかった。

任意のウォーカー・家をタップして詳細を照会する「情報パネル」自体は
別途もう少し大きな機能（選択状態・当たり判定・パネルUIが必要）
なので、このPRでは11節が言及するもう一方の要素である
「総人口の比較表示」だけを切り出して実装する。

## 実装

- `src/game/population.ts`（新規）: `totalPopulation(world, faction)` を
  追加。中身は元々 `enemyMiracles.ts` にプライベート関数として存在した
  ものと同じ計算（家の`population`合計＋ウォーカー数）で、
  armageddon発動タイミングの判断とHUD表示の両方が同じ数値を
  参照する必要があるため共有モジュールへ切り出した。
  `enemyMiracles.ts`側のプライベート実装は削除し、こちらをimportする
  形に変更。
- `FactionSummary`（`src/game/simulation.ts`）に `population: number` を
  追加し、`summarize()`が`totalPopulation()`で埋める。
- `Hud.update()`（`src/render/Hud.ts`）に、両陣営の人口比を表す
  10文字の棒（`▓`/`░`）とその実数値を1行追加。Hudは単一色のPIXI.Text
  なので、陣営ごとの色分けの代わりに「塗りつぶし比率」で優劣を示す。

## 検証

- `npm run typecheck` / `npm run test -- --run`（295件）/ `npm run build`
  がすべて通過することを確認。
- `Hud.test.ts`に、人口比の表示・満位・五分の3ケースを追加。

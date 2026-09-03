# 家の上限に達した状態をHUDに表示する

## 報告された問題

「walkerが発生しないのだけどどうしたら良いの?」

## 調査

`Simulation`のヘッドレス再現で、プレイヤー側の`summarize()`を時系列で
記録したところ、家の数が増え続ける一方でwalker数は常に0のまま
だった。個々の家の`population`を直接ダンプすると、`manor`
（capacity 35）が`population: 35`、`lodge`（capacity 20）が
`population: 20`と、いずれも容量ぴったりで止まっていることが
分かった。

`houseGrowth.ts`の`createHouseGrowthSystem`を読み直すと、これは
既知の仕様通りの挙動だった：

```ts
while (
  population >= capacity &&
  (houseCountByFaction.get(owner.faction) ?? 0) < maxHousesPerFaction
) {
  population -= capacity;
  spawnWalker(world, pos, owner.faction);
  ...
}
if (population > capacity) population = capacity;
```

`maxHousesPerFaction`（`plan/archived/0010-house-growth-cap.md`で
導入した暫定的な人口上限、20×20マップでは`TILES_PER_HOUSE_CAP=8`から
50）に達すると、`population`は容量で頭打ちのまま新たなwalkerが
一切生まれなくなる。これ自体は「シミュレーションが際限なく重くなるのを
防ぐ」ための意図した安全装置だが、**上限に達したことを示すUIが一切
なかった**ため、プレイヤーには「walkerが完全に停止した原因不明の
不具合」にしか見えなかった。

さらに、既定の「定住」方針のままだと輩出されたwalkerがほぼ即座に
近くへ再定住して新しい家になり、その家がまた次のwalkerを生む…という
連鎖でプレイヤー側の家の数が指数的に増える。ヘッドレス再現では
1分強でプレイヤー側が上限の50軒に到達していた（「戦闘」方針に切り替えた
敵陣営はwalkerが定住せず動き回るため、家の増加がずっと緩やかだった）。

## 対応

`Simulation`に`readonly maxHousesPerFaction`を公開し、
`FactionSummary`に`housesCap`を追加した。`Hud.ts`は`houses >=
housesCap`のとき`house 53/50（上限）`のように上限到達を明示し、
未到達時は従来通り`house 12`とだけ表示する。

これにより「walkerが発生しない」という状態が、原因不明の不具合ではなく
「家の上限に達した」という説明可能な状態としてプレイヤーに伝わる
ようになった。上限到達後にwalkerを再び生ませるには、行動方針を
「戦闘」や「集結」に切り替えて即座の再定住を防ぐか、家を奪われて
数を減らす必要がある——という既存の設計（`houseGrowth.ts`のコメント
通り、家を失えば成長が再開する）はそのまま活きている。

## テスト

- `simulation.test.ts`に、`maxHousesPerFaction`が両陣営に同じ値で
  公開されること、家の数が上限に達した状態では100秒分シミュレーション
  を進めてもwalkerが1体も増えないことを検証する結合テストを追加した。
- `npm run typecheck` / `npm run test`（179件） / `npm run build`
  すべて成功。
- ヘッドレスブラウザで80秒間実際にプレイし、プレイヤー側が上限に
  達すると「house 53/50（上限）」と表示されることをスクリーンショットで
  確認した。

## 積み残し

- 根本的には`plan/archived/0010-house-growth-cap.md`で触れられている
  「地形ベースの土地不足」が未実装なままの暫定対応。将来的に平地の
  広さで自然に頭打ちになる仕組みが入れば、この人為的な上限とその
  UI表示は不要になる。
- 上限に達したあとの対処法（行動方針を切り替える、敵の家を奪う）を
  ゲーム内で明示的に案内してはいない。必要であれば`plan/0021`の
  チュートリアルヒントの延長として追加を検討する。

# 0061: ワールドごとに敵AIの攻撃性・介入速度を変える

## 背景

plan/0059（ワールド選択画面）は、`docs/game-system.md` 10節が挙げる
「各ワールドは地形タイプ・初期配置・敵AIの攻撃性／賢さ・使用可能な
奇跡の制限などが異なり、徐々に難しくなる」のうち、地形タイプ・
マップサイズ・地形操作制限の3軸だけを実装し、敵AIの攻撃性／賢さは
明示的にスコープ外としていた。このPRでその続きとして、敵AIの
「攻撃性」と「介入速度」の2軸を追加する。

「賢さ」（AIの判断ロジックそのもの）は変えない——同じ10節の
「高難度では敵の介入頻度が上がるが、行動パターン自体は比較的
予測可能」という記述に従い、難しいワールドでも敵の行動パターンは
今まで通り分かりやすいまま、判断の頻度としきい値だけを厳しくする。

## 実装

- `WorldDefinition`（`src/game/worlds.ts`）に`enemyDecisionInterval`
  （介入速度＝敵AIが行動方針・奇跡の使用を再判断する間隔。短いほど
  素早く反応する）と`enemyAggressionThreshold`（攻撃性＝この人数の
  ウォーカーを抱えると「戦闘」態勢に入る閾値。低いほど少ない兵力でも
  攻撃的になる）を追加。6つのワールドを通じて単調に厳しくなるよう
  値を設定（`enemyDecisionInterval`: 6→2、`enemyAggressionThreshold`:
  6→2）。
- `SimulationConfig`（`src/game/simulation.ts`）に同名の2フィールドを
  追加し、`createEnemyAiSystem`と`createEnemyMiracleSystem`の両方の
  `decisionInterval`（本来別々のデフォルト値5と8を持つが、この2つは
  概念的にはどちらも「敵AIがどれだけ頻繁に判断するか」なので、
  ワールド単位では同じ値を共有させている）・`createEnemyAiSystem`の
  `aggressionThreshold`に橋渡しする。
- `main.ts`: `new Simulation({...})`に`world.enemyDecisionInterval`/
  `world.enemyAggressionThreshold`を渡すよう変更。ワールド選択画面の
  各ワールドの説明文に「難易度N/6」（WORLDS配列内の並び順そのもの）を
  追加し、この軸の存在をプレイヤーにも見えるようにした。

## 検証

- `npm run typecheck` / `npm run test -- --run`（313件）/ `npm run build`
  すべて通過。
- `worlds.test.ts`に、2つの新フィールドがワールドを追うごとに
  単調非増加であることを確認するテストを追加。
- `simulation.test.ts`に、`enemyAggressionThreshold`が実際に
  `createEnemyAiSystem`まで伝わっていることを確認する統合テストを追加
  （閾値以下のウォーカー数では"settle"のまま、閾値ちょうどでは
  即座に"fight"に切り替わることを確認）。
- esbuildでsimulation.tsを直接バンドルし、easy相当（decisionInterval
  6・aggressionThreshold 6）とhard相当（同2・2）の設定で200秒分
  シミュレーションを走らせ、敵のbehaviorMode切り替え回数がeasy:1回・
  hard:12回と、実際に難しいワールドほど頻繁に判断し直すことを確認。

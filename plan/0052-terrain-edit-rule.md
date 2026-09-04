# 0052 terrain-edit-rule

## 背景

POPULOUS 2との比較調査で、`docs/game-system.md`が想定していた「各
ワールドは地形タイプ・初期配置・敵AIの攻撃性／賢さ・使用可能な奇跡の
制限などが異なり」というキャンペーン構造の要素のうち、「そのワールド
固有のルール制限」がまだ何も実装されていないと指摘された。現状は
地形タイプ（草原/砂漠/雪原/溶岩地帯）だけが試合ごとにランダムだが、
それは民の成長速度・見た目に影響するだけで、プレイヤーの操作そのもの
には何の制約もない——毎回「隆起も沈降も自由にできる」という同じ
ルールで遊ぶことになる。

調査資料が例として挙げていた「土地上げ不可」「土地下げ不可」「上下
両方不可」という特殊ステージ設定を、既存の`raiseVertex`（隆起/沈降）
に対する制約として実装した。ただし調査資料自身も釘を刺している通り、
「制限が強すぎると10分放置のような苦痛になる」——両方向とも封じる
（＝地形編集が一切できない）ルールは導入せず、常にどちらか一方向は
残す（`raiseOnly`/`lowerOnly`）ことで、平地を作るという核となるループ
自体は必ず可能なままにした。

## アプローチ

`src/world/heightmap.ts`に`TerrainEditRule`型
（`"both" | "raiseOnly" | "lowerOnly"`）と、それに基づいて
`raiseVertex`呼び出しの可否を判定する純粋関数`isTerrainEditAllowed
(rule, delta)`、試合開始時に1つを重み付きランダムで選ぶ
`pickTerrainEditRule(weights, rng)`を追加した。

`main.ts`のbootstrap時に地形タイプと同様、試合ごとに1つ選び
（`TERRAIN_EDIT_RULE_WEIGHTS`——`both`が半分、`raiseOnly`/`lowerOnly`
がそれぞれ4分の1）、以下に反映する：

- **`applyTool`の隆起/沈降分岐**：`isTerrainEditAllowed`でガードして
  から`trySpendMana`する（許可されない方向にはマナも使わせない）。
- **ツールバーUI**：許可されない方向のボタン（`data-tool="raise"`/
  `"lower"`）を`disabled`にする。「タップしても何も起きない」という
  分かりにくい状態を作らないため、そもそも選べなくした。`toolMode`の
  初期値も、`lowerOnly`なら`"lower"`から始まるようにし、ボタンの
  見た目（`aria-pressed`）も実際の初期値に合わせて同期する。
- **HUD**：`Hud.setTerrainEditRule(label)`を追加し、`both`以外の
  場合のみ「地形操作: 隆起のみ可」のように地形タイプの下に1行表示
  する。ボタンが無効化されているだけでは理由が伝わらないため。
- **敵AI（`enemyTerraform.ts`）**：`docs/game-system.md`の「敵の神は
  プレイヤーと同じルールで介入する」に従い、`createEnemyTerraformSystem`
  にも`terrainEditRule`を渡す。`findLeastFlatVertex`が返す1手が
  ルール上許可されない方向であれば、そのマスの平坦化は今回スキップ
  する（マナも消費しない）——敵にとっても「自分の家の周りを平らに
  できない場合がある」という同じ制約になる。

`Simulation`のコンストラクタ設定に`terrainEditRule?: TerrainEditRule`
（省略時`"both"`、既存のテストに影響しない）を追加し、`main.ts`から
`createEnemyTerraformSystem`まで橋渡しした。

## テスト

- `src/world/heightmap.test.ts`：`isTerrainEditAllowed`が3種類の
  ルールそれぞれで正しい方向のみ許可すること、`pickTerrainEditRule`が
  重みに応じたスロットへロールをマッピングすること、重み0のルールを
  絶対に選ばないこと、rng省略時は`Math.random`を使うことを検証。
- `src/game/systems/enemyTerraform.test.ts`：`raiseOnly`では隆起方向の
  編集のみ実行され沈降方向はスキップ（マナも不変）されること、
  `lowerOnly`ではその逆になることを検証。
- `npm run typecheck` / `npm run test -- --run`（259件）/
  `npm run build`がすべて成功。
- ヘッドレスブラウザで`pickTerrainEditRule`の乱数を固定して
  `lowerOnly`を強制し、実際にHUDへ「地形操作: 沈降のみ可」が表示
  されること、▲隆起ボタンが視覚的に無効化（`disabled`）され、
  ▼沈降ボタンが初期状態から選択済み（`aria-pressed="true"`）になって
  いることをスクリーンショットで確認した。

## 残作業

- 今回変更したのは`raiseVertex`（地形の隆起/沈降）のみ。他の奇跡
  （地震・火山など、間接的に`raiseVertex`を呼ぶもの）はこのルールの
  対象外とした——地震・火山は「地形を荒らす／覆う」効果そのものが
  本質で、プレイヤーが方向を選んでいるわけではないため、制限する
  意味が薄いと判断した。
- ワールドごとの他のルール差（使用可能な奇跡の制限、敵AIの攻撃性
  パラメータなど）は別タスク。今回は調査資料が名指しした
  「土地上げ/下げ不可」の例だけを実装した。

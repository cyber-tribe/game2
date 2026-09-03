# 技術選定

## 決定事項

| 項目 | 選定 | 理由 |
|---|---|---|
| 言語 | TypeScript | `docs/game-system.md` のデータモデル（World / Faction / Walker / House）を型で表現し、実行時エラーを減らす |
| 描画エンジン | PixiJS (WebGL) | 地形タイル＋大量のウォーカーを毎フレーム描くのに向く軽量2D描画ライブラリ。シーン管理や物理などゲーム側の仕組みは自前で組む前提 |
| ビルド | Vite | 高速な開発サーバーとシンプルなプロダクションビルド |
| 実行環境 | 縦持ちスマホのPWA専用 | デスクトップ配布（Tauri等）は行わない。マウス／キーボード操作は前提とせず、タップ操作とHTML製の下部ツールバーのみで完結させる。`vite-plugin-pwa`でマニフェスト・Service Workerを生成し、ホーム画面に追加してアプリのように起動できるようにする |
| バックエンド | なし | シングルプレイ対戦（ローカルAI）が基本方針のため、サーバーサイドは現時点で不要 |
| オブジェクト管理 | 自作ECS（`src/ecs/`） | 大量のウォーカーに対する疎結合なシステム（移動/建築/戦闘/マナ生成など）を見据え、スパースセット方式の最小限のECSを自前実装。既存ライブラリ（bitECS等）は導入せず、必要な機能だけを持つ薄い実装に留める |
| テスト | Vitest | Viteと統合済みで追加設定が少ない。ECSのようなUIを持たない純粋ロジックの正しさを検証する用途に使用 |

## 却下した選択肢

- **Phaser 3**：シーン管理・タイルマップ・物理エンジンまで内包するフルスタックフレームワーク。
  本ゲームは物理演算や既存のタイルマップ機能を必要とせず、独自のアイソメトリック地形
  （頂点ごとの高さを持つメッシュ）を描く必要があるため、機能過多と判断。
- **素のCanvas 2D**：依存ゼロで手軽だが、ウォーカー数が増えた際のCPU負荷や
  将来のシェーダー活用（水面のアニメーション等）の余地を考えるとWebGL基盤の
  PixiJSを採用した方が拡張性が高い。
- **WebAssembly**：2D・ユニット数百体規模であれば素のTypeScriptで十分な速度が
  出ると見込まれ、Rust/AssemblyScript等のビルドチェーンを先に背負うのは尚早と
  判断。プロファイリングでシミュレーションのtick処理がボトルネックになった
  場合に改めて検討する。
- **既存ECSライブラリ（bitECS / miniplex 等）**：機能は十分だが、本プロジェクトの
  規模ではAPIを完全に把握できる自作の薄い実装で要件を満たせると判断し、
  依存を増やさない方針とした。

## プロジェクト構成

```
game2/
├── index.html          … エントリHTML（#app にPixiJSのcanvasをマウント、
│                          #toolbar に縦持ちスマホ向けの下部タッチUI）
├── vite.config.ts       … vite-plugin-pwaでマニフェスト/Service Workerを生成
├── tsconfig.json
├── public/
│   └── icons/           … PWAアイコン(icon-180/192/512.png、生成方法は本文参照)
├── src/
│   ├── main.ts          … ブートストラップ（Application初期化、Simulationの起動とtickループ、
│   │                       画面幅に合わせた地図スケールのフィット）
│   ├── ecs/             … 自作ECSコア（Entity/Component/World/System）
│   │   ├── entity.ts        … Entity = number
│   │   ├── component.ts     … コンポーネント型（Symbolトークン）の定義
│   │   ├── componentStore.ts… コンポーネント1種類分のスパースセット格納庫
│   │   ├── world.ts         … Entity/Componentの生成・破棄・クエリを管理
│   │   ├── system.ts        … Systemの型とSchedulerによる実行
│   │   └── world.test.ts    … 上記の単体テスト
│   ├── game/            … ゲームドメインロジック（ECSのコンポーネント/システムを利用）
│   │   ├── components.ts    … Position/Owner/Walker/MoveTarget/House/
│   │   │                       FactionState(leaderIdを含む)/Swamp
│   │   ├── constants.ts     … 速度・成長率・家レベル別ステータス・マナコスト等のチューニング値
│   │   ├── faction.ts       … Faction(勢力)エンティティの生成/検索/マナ消費(trySpendMana)/
│   │   │                       集結シンボル移動(moveShrine)
│   │   ├── swamp.ts         … Swampエンティティの生成(createSwamp)
│   │   ├── volcano.ts       … 噴火時にHouse/Walkerを破壊するeruptVolcano
│   │   ├── flood.ts         … 洪水時に水没したHouse/Walkerを破壊するdrownFlood
│   │   ├── simulation.ts    … WorldとSchedulerを束ね、tickごとにupdate()するSimulation
│   │   └── systems/         … movement / wanderTarget / settle / houseGrowth /
│   │                          houseUpgrade / mana / combat / gather /
│   │                          fightTargeting / enemyAi / swamp / leader /
│   │                          goToShrine
│   ├── world/
│   │   └── heightmap.ts … 頂点高さマップの型と生成、raiseVertex(頂点1つの上げ下げ、
│   │                       rockHardnessも1減らす)、sampleElevation(バイリニア補間)、
│   │                       isBuildable(waterLevelより上かつ岩でないか)、isRock、
│   │                       countFlatNeighbors(周囲の平坦さの計測)、
│   │                       applyEarthquake(範囲内をランダムに隆起・陥没)、
│   │                       applyVolcano(範囲内をMAX_ELEVATIONまで隆起させ岩化)、
│   │                       applyFlood(waterLevelを底上げする、地形頂点自体は不変)
│   └── render/
│       ├── IsoRenderer.ts … heightmapをアイソメトリックなポリゴン群として描画し、
│       │                    タイル座標→画面座標への投影(project)・クリック位置→頂点の
│       │                    逆引き(pickVertex)・編集後の再描画(redraw)を提供
│       ├── EntityLayer.ts … ECS World上のSwamp/Walker/Houseを描画
│       │                    （Walker/Houseは勢力の色分け、Swampは半透明の紫の円）
│       └── Hud.ts         … 勢力ごとのマナ/家数/ウォーカー数と決着表示のテキストHUD
│                            （操作方法の案内は持たず、状態表示のみ）
│   └── ui/
│       └── toolbar.ts     … index.html の#toolbarボタンをSimulation/toolModeに
│                            橋渡しするwireToolbar()
└── docs/
    ├── game-system.md   … 再現対象のゲームシステム仕様
    └── tech-stack.md     … 本ファイル
```

ECSが実際のレンダリングパイプラインに接続され、`Simulation`が
「ウォーカーが地形を考慮しつつ徘徊→陸地に定住して家になる→家が
人口を生産して新たなウォーカーを輩出→マナが蓄積する→敵と接触すれば
戦い、敵の家は奪うか撃退する→どちらかの勢力が全滅したら決着」という
基本ループをブラウザ上で可視化できる状態まで進んだ。加えて、
プレイヤーは左クリックで地形の頂点を1段上げ、右クリックで1段下げられる
（`docs/game-system.md`の最も基本の介入）。1回の操作につき
`TERRAIN_EDIT_MANA_COST`分のマナを消費し、プレイヤー勢力のマナが
足りなければ何も起きない。いずれもヘッドレスブラウザでの実際の
クリック操作とスクリーンショットで検証済み。

`createWanderTargetSystem`/`createSettleSystem`は`Heightmap`を渡すと
`world/heightmap.ts`の`isBuildable`（海面=0以下かどうか）で判定し、
海に定住しようとした場合はその場では建てず、目標を持たないまま
次のtickで新しい徘徊先を探し直す。地形は`main.ts`で描画用に生成した
`Heightmap`オブジェクトをそのまま`Simulation`にも渡しているため、
プレイヤーが地形を編集すると即座にウォーカーのAIにも反映される。
ヘッドレスブラウザでの目視確認とSimulationの統合テスト（水域に家が
建たないことを検証）の両方で確認済み。

### 行動方針（settle / gather / fight）とごく簡単な敵AI

`FactionState.behaviorMode`は当初型だけ定義されていたが、以下のシステムで
実際に機能するようにした。

- `gatherSystem`：behaviorModeが`gather`の勢力について、`GATHER_RANGE`
  以内にいる同勢力の「探索中」ウォーカー同士をstrength合算の1体に統合する。
- `fightTargetingSystem`：behaviorModeが`fight`の勢力について、目標を
  持たない探索中ウォーカーに最も近い敵ウォーカー／家をMoveTargetとして
  設定する（`createWanderTargetSystem`より前に実行し、既にターゲットが
  付いたウォーカーは通常の徘徊には流れない）。実際の勝敗は既存の
  `walkerCombatSystem`/`houseCaptureSystem`が引き続き解決する。
- `createEnemyAiSystem`：`docs/game-system.md`の「敵AI」の最小限の実装。
  一定間隔（`ENEMY_AI_DECISION_INTERVAL`）ごとに敵勢力のウォーカー数を見て、
  閾値（`ENEMY_AI_AGGRESSION_THRESHOLD`）以上ならfight、未満ならsettleに
  切り替える。マナや脅威度までは見ておらず、あくまで「敵が何もしない
  置物ではない」ことを保証する最小実装。
- プレイヤー自身の行動方針は`main.ts`でキーボードの1/2/3キー
  （settle/gather/fight）に割り当て、HUDに現在のモードを表示する。
  `Simulation.setBehaviorMode`/`getBehaviorMode`はマナを消費しない
  （`docs/game-system.md`の「影響」はコストなしという記述の通り）。

ヘッドレスシミュレーションで、開始直後から両勢力をfightモードにすると
実際に接触・交戦し、両者壊滅（相討ち）に至ることを確認済み（対角線上に
離れた初期配置のままブラウザで目視すると、歩いて到達するまで数十秒
かかるため、見た目での確認より高速なヘッドレス実行の方が検証に適する）。

### House.levelの地形依存アップグレード

`world/heightmap.ts`に`countFlatNeighbors(heightmap, x, y, radius)`を
追加し、指定した点を中心とする(2×radius+1)四方の頂点のうち、その点の
頂点とちょうど同じ高さを持つ頂点の数を数えるようにした（自分自身も
必ず1個としてカウントされる）。

`createHouseUpgradeSystem`はこの値を使い、`HOUSE_LEVEL_FLATNESS_REQUIREMENT`
（`HOUSE_UPGRADE_FLATNESS_RADIUS`=2なので最大25）の閾値を満たす最も高い
レベルへ家を常に合わせ直す。両方向に動く（平らにすればアップグレード、
地震等で荒れればダウングレード）。population等の他フィールドは保持
される。HOUSE_LEVELSの容量・マナ産出・防御力は既存のレベル別テーブルが
そのまま適用されるため、他システムを変更する必要はなかった。

これにより「プレイヤーが地形を編集して土地を平らにする」という
既存の地形操作機能に明確な目的（家を大きく育てる）が生まれた。
Simulationの統合テストで、完全に平坦なheightmapを与えると家がhutより
上のレベルまで育つことを確認済み。

### 奇跡「地震」

`world/heightmap.ts`に`applyEarthquake(heightmap, x, y, radius, maxDelta, rng)`
を追加した。指定点を中心とする範囲内の頂点それぞれを独立に
`[-maxDelta, maxDelta]`のランダムな量だけ上げ下げする
（`docs/game-system.md`の「対象範囲の地形をランダムに隆起・陥没させ、
平地を壊す」）。地形を荒らすことで`countFlatNeighbors`の値が下がり、
上述のHouse.level双方向アップグレードが自動的に反応してその範囲内の
家をダウングレードするため、「敵集落のダウングレード・破壊に有効」という
仕様が既存システムの組み合わせだけで実現できた。

`main.ts`ではキー4/5でクリック時のツール（地形編集／地震）を切り替え、
地震は`EARTHQUAKE_MANA_COST`（地形編集より大幅に高いコスト）を消費する。
HUDに現在選択中のツールを表示する。ヘッドレスブラウザで実際にツールを
切り替えてクリックし、地形が不規則に隆起・陥没する様子とコンソール
エラーがないことを確認済み。

`docs/game-system.md` のデータモデル素案のうち、リーダー/集結シンボルと
行動方針`goToShrine`は後述の節で実装した。沼/火山/洪水以外の奇跡
（騎士化・最終決戦）・征服モードの複数ワールド進行はまだ未実装。

### 奇跡「沼」

`Swamp`コンポーネント（`radius`, `remainingCapacity`）を追加し、
`game/swamp.ts`の`createSwamp(world, x, y, radius, capacity)`で任意の
座標に配置できるようにした。`swampSystem`は毎tick、沼の半径以内に
入ったウォーカーを問答無用で消滅させ、`remainingCapacity`を1減らす。
0になった沼自体も消える（`docs/game-system.md`の「一定数を飲み込むと
消えるタイプ」）。恒久タイプや、騎士が沼を回避する挙動（騎士自体が
未実装）は対応していない。

地震と同じく`main.ts`のツールバー（🌊 沼）から発動し、`SWAMP_MANA_COST`
を消費する。`EntityLayer`は沼を紫がかった半透明の円として、家・
ウォーカーより先に（背面に）描画する。Simulationの統合テストで、
巨大な半径の沼を置けば範囲内の全ウォーカーが実際に消滅することを
確認済み。ヘッドレスブラウザでも沼の配置・見た目・コンソールエラーが
ないことを確認した。

### 奇跡「火山」

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

### 奇跡「洪水」

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

`main.ts`のツールバー3行目に🌀洪水ボタンを追加し、`FLOOD_MANA_COST`
（沼・地震・火山より高い「特大」ティア）を消費する。地図上のタップ位置
自体は使わず、タップは発動の確認としてのみ機能する。Simulationの統合
テストで、両陣営が定住した後に洪水を起こすと全ての家が水没して消滅
することを確認済み。ヘッドレスブラウザでも実際に2回連続で発動し、
海（水域）が目に見えて広がる様子とコンソールエラーがないことを確認した。

### 縦持ちスマホPWAへの一本化

操作対象を縦持ちスマホのPWAのみに絞ることになったため、マウス左右
クリック・キーボードショートカット（1〜5キー）を全廃し、以下に置き換えた。

- **PWA化**：`vite-plugin-pwa`を導入し、`vite.config.ts`でマニフェスト
  （`display: "standalone"`, `orientation: "portrait"`）とService Worker
  （`registerType: "autoUpdate"`）を生成する。アイコンは外部依存を増やさず
  Node標準の`zlib`だけでPNGを直接エンコードする使い捨てスクリプトで生成し
  （`public/icons/icon-{180,192,512}.png`）、`index.html`に
  `apple-touch-icon`・`theme-color`等のメタタグを追加した。
- **タッチUI**：`index.html`に固定表示の下部ツールバー（HTMLボタン）を追加。
  1行目が行動方針（定住/集結/戦闘）、2行目がタップ操作の対象（▲隆起/▼沈降/
  💥地震）で、`src/ui/toolbar.ts`の`wireToolbar()`がボタンのクリックを
  `Simulation.setBehaviorMode`や`main.ts`内のtoolMode変数に橋渡しする。
  右クリックによる「沈降」は使えなくなったため、隆起と沈降を別ボタンの
  ツールとして分離した。
- **縦持ち固定**：`index.html`に`@media (orientation: landscape)`で
  「縦持ちでご利用ください」という警告オーバーレイを表示するCSSのみの
  対策を入れた（Screen Orientation APIによる強制ロックはインストール後の
  PWAでも安定して効くとは限らないため採用していない）。

iPhone相当のビューポート（390×664、Playwrightのタッチエミュレーション）で
ボタンのタップ・地図のタップ・HUD表示・PWAマニフェスト/Service Worker
の生成をヘッドレスブラウザで確認済み。

### タップでの頂点選択が難しい問題への対応（パン操作の導入）

上記の初版では「地図全体を画面幅に収める」ために`renderer.view.scale`を
大きく縮小しており（32×32マスの世界を390px幅の画面に収めるとスケールは
約0.23倍）、実際にスマホ幅の画面でタップを試すと頂点間隔が数px単位まで
詰まってしまい、狙った頂点を選ぶのがほぼ不可能だった。さらに
`IsoRenderer.pickVertex`のヒット半径がこのスケールを考慮していなかった
ため、縮小時は判定範囲も実質さらに小さくなっていた。

「地図全体を1画面に収める」という設計自体がタップ精度と両立しないと
判断し、以下に変更した。

- **地図サイズと表示倍率**：世界サイズを32×32から20×20に縮小した上で、
  画面幅ではなく「ツールバー・HUDを除いた縦方向の余白」に地図の高さ
  （`IsoRenderer.mapPixelHeight`、新設）を合わせてズームする
  （`MAX_MAP_SCALE`で拡大しすぎも防止）。縦持ち画面は横より縦に余裕が
  あるため、こちらを基準にする方が結果的に大きな倍率を確保できる。
  タイルサイズ自体も48/24pxから64/32pxへ拡大した。
  横方向は画面に収まりきらない前提とし、ドラッグでパンする。
- **タップとパンの判別**：`pointerdown`時点では何もせず、`pointerup`時に
  それまでの移動量が`DRAG_THRESHOLD`（10px）未満なら「タップ」として
  選択中のツールを適用し、それ以上動いていれば「パン」として
  `pointermove`の間に`renderer.view.position`を移動量ぶん更新する。
  一本指のフリック操作だけで地形編集とスクロールの両方を成立させている。
- **パン範囲の制限**：`clampPan()`で、地図の投影範囲
  （`mapPixelWidth`/`mapPixelHeight` × 現在のスケール）が画面から
  完全に外れないよう`view.position`をクランプし、地図を見失わないように
  した。
- **ヒット半径のスケール対応**：`IsoRenderer.pickVertex`の`maxDistance`は
  実際の画面px単位で解釈するよう`this.view.scale.x`で除算してから
  local座標系の距離と比較するようにし、ズーム倍率が変わっても指の
  許容誤差が一定になるようにした（併せて既定値も16pxから40pxへ拡大）。

ヘッドレスブラウザでiPhone相当のビューポートを使い、①短いタップでは
地形編集が発動しパンはしないこと、②横方向のドラッグではカメラが
実際に移動し（それまで画面外だった敵陣営が見えるようになることを
スクリーンショットで確認）、タップの副作用（地形編集）が起きないこと、
の両方を確認済み。

### 判明した設計上の注意点：人口成長の上限

houseGrowthSystemとwalkerCombatSystem/houseCaptureSystemを実装した
直後に長時間シミュレーションを走らせたところ、家の数が指数的に
増え続け（60秒強で6000件近く）、O(entities)の戦闘/襲撃システムと
相まってtickあたりの処理時間が秒単位まで悪化する問題が実際に
発生した。本来は「平地が尽きれば拡張が止まる」という地形連動の
土地不足で自然に頭打ちになるはずだが、heightmapとECSがまだ
繋がっていないため、`HouseGrowthConfig.maxHousesPerFaction`
（`TILES_PER_HOUSE_CAP`から世界の広さに応じて算出）で勢力あたりの
家数に暫定的な上限を設けて対処した。上限に達すると人口は容量で
頭打ちになり、家を奪われるなどして数が減れば成長が再開する。
地形ベースの土地不足が実装され次第、この暫定キャップは不要になる。

### リーダーと集結シンボル（goToShrineモード）

`docs/game-system.md`の「リーダー」「集結シンボル」を実装した。
`FactionState`に`leaderId?: Entity`を追加し、`game/systems/leader.ts`の
`leaderSystem`が毎tick、各勢力の`leaderId`が空、またはその参照先が
もう生きていない場合に、その勢力の生存ウォーカーを1体選んで新たな
リーダーに昇格させる。本来は「集結シンボルに最初に触れた者がリーダーに
なる」が仕様だが、シンボルに衝突判定を持つ実体は未実装のため、
生存する任意のウォーカーを昇格させる簡略化とした。

`game/systems/goToShrine.ts`の`goToShrineSystem`はbehaviorModeが
`goToShrine`の勢力について、リーダーには`FactionState.shrinePosition`を、
リーダー以外の同勢力ウォーカーにはリーダーの現在地をMoveTargetとして
設定する（`fightTargetingSystem`と同じく`createWanderTargetSystem`より
前に実行し、既にターゲットを持つウォーカーには手を出さない）。これにより
「民はリーダーへ、リーダーはシンボルへ向かう（軍勢の誘導）」という
docs/game-system.mdの記述をそのまま再現している。

集結シンボルの移動（奇跡「集結シンボル移動」）は`game/faction.ts`の
`moveShrine(world, faction, position)`で`shrinePosition`を書き換えるだけの
軽量な処理。`main.ts`のツールバー1行目に🚩ボタンを追加し、
`SHRINE_MOVE_MANA_COST`（地形編集より高く地震より低い「小」ティア）を
消費する。行動方針側にも🚩「集結地へ」ボタンを追加した。

`EntityLayer`はどの勢力の`FactionState`についても`shrinePosition`に
旗のグラフィックを描画し、`leaderId`が指すウォーカーは通常より大きい円＋
白いフチで強調表示する。プレイヤーがシンボルをタップで移動させた効果が
その場で目視確認できる。

Simulationの統合テストで、①ゲーム開始直後の1tickで両勢力に
`leaderId`が設定されること、②ウォーカー1体だけの勢力を`goToShrine`に
切り替えてシンボルを離れた地点へ移動させると、そのリーダーが実際に
シンボルの座標まで歩いて定住する（＝Houseがちょうどシンボル座標に
できる）ことを確認した。ヘッドレスブラウザでも🚩集結地移動ボタンで
旗の位置が地図上で動くこと、🚩集結地へモードに切り替えてもコンソール
エラーが出ないことを確認済み。

## 開発コマンド

```bash
npm install       # 依存関係インストール
npm run dev       # 開発サーバー起動 (http://localhost:5173)
npm run typecheck # 型チェックのみ
npm run test      # ユニットテスト実行 (Vitest)
npm run build     # 型チェック + 本番ビルド (dist/)
npm run preview   # ビルド結果をローカルで確認
```

## 自作ECSの設計

- **Entity**：単なる数値ID。状態は一切持たない。
- **Component**：`defineComponent<T>(name)`が返す一意なSymbolトークンをキーに、
  型`T`のデータを紐付ける。コンポーネント自体はただのプレーンオブジェクト。
- **格納方式**：コンポーネント種別ごとに`ComponentStore`（スパースセット）を持つ。
  `sparse[entity] -> denseのindex`、`dense[index] -> entity`、
  `data[index] -> 値`の3配列構成で、追加・削除・存在確認はO(1)、
  クエリ時は密な配列を連続走査できる。
- **クエリ**：`world.query(TypeA, TypeB, ...)`は該当コンポーネントを
  最も少なく持つストアを軸に走査し、他のストアの`has`で絞り込む。
- **System**：`(world, deltaSeconds) => void`という関数。`Scheduler`に
  登録順で保持し、`scheduler.update(world, dt)`で毎tick順番に実行する。
- **削除時の整合性**：`world.destroyEntity`は全ストアから当該entityを
  削除してからIDを再利用プールに戻すため、破棄済みentityの情報が
  クエリに残ったり、IDが使い回された際に古いデータが漏れたりしない
  （`world.test.ts`で検証済み）。

# アーキテクチャ

技術選定・プロジェクト構成・自作ECSの設計など、頻繁には変わらない
安定した参照用ドキュメント。個々の機能実装や不具合対応の経緯は
`plan/archived/`配下に1タスク1ファイルで記録している
（運用ルールは`plan/README.md`を参照）。

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
│   │   │                       FactionState(leaderId/finalBattleを含む)/Swamp
│   │   ├── constants.ts     … 速度・成長率・家レベル別ステータス・マナコスト等のチューニング値
│   │   ├── faction.ts       … Faction(勢力)エンティティの生成/検索/マナ消費(trySpendMana)/
│   │   │                       集結シンボル移動(moveShrine)
│   │   ├── swamp.ts         … Swampエンティティの生成(createSwamp)
│   │   ├── volcano.ts       … 噴火時にHouse/Walkerを破壊するeruptVolcano
│   │   ├── flood.ts         … 洪水時に水没したHouse/Walkerを破壊するdrownFlood
│   │   ├── knight.ts        … リーダーを騎士化するknightify
│   │   ├── armageddon.ts    … 全House破壊・両陣営中央集結を行うtriggerArmageddon
│   │   ├── simulation.ts    … WorldとSchedulerを束ね、tickごとにupdate()するSimulation
│   │   └── systems/         … movement / wanderTarget / settle / houseGrowth /
│   │                          houseUpgrade / mana / combat / gather /
│   │                          fightTargeting / enemyAi / swamp / leader /
│   │                          goToShrine / knight
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
│       ├── palette.ts     … GAME_PALETTE — UI・pixel icon・(今後の)地形/建物スプライトが
│       │                    共有する唯一の色定義（SFC版原作寄りの石灰岩/青銅系配色）
│       └── Hud.ts         … 地形名・地形操作制限のみを表示する最小限のテキストHUD
│                            （マナ/人口はui/statusPanel.tsへ移設済み）
│   └── ui/
│       ├── toolbar.ts     … index.html の#toolbarボタンをSimulation/toolModeに
│       │                    橋渡しするwireToolbar()
│       ├── pixelIcons.ts  … 各コマンド用の16x16 pixel iconをcanvasに描画（emoji代替）
│       ├── commandIcons.ts… 上記iconを#toolbarの各ボタンへ差し込むmountCommandIcons()
│       └── statusPanel.ts … コマンドパネル内のマナ計/人口比較バー（pixel meter）
├── plan/
│   ├── README.md        … タスクごとの実装記録の運用ルール
│   └── archived/         … 完了済みタスクの実装記録（1タスク1ファイル）
└── docs/
    ├── game-system.md   … 再現対象のゲームシステム仕様
    └── architecture.md   … 本ファイル
```

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

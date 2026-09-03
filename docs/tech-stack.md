# 技術選定

## 決定事項

| 項目 | 選定 | 理由 |
|---|---|---|
| 言語 | TypeScript | `docs/game-system.md` のデータモデル（World / Faction / Walker / House）を型で表現し、実行時エラーを減らす |
| 描画エンジン | PixiJS (WebGL) | 地形タイル＋大量のウォーカーを毎フレーム描くのに向く軽量2D描画ライブラリ。シーン管理や物理などゲーム側の仕組みは自前で組む前提 |
| ビルド | Vite | 高速な開発サーバーとシンプルなプロダクションビルド |
| 実行環境 | ブラウザのみ | デスクトップ配布（Tauri等）は行わない。`npm run build` の静的ファイルをどこにでもホスティングできる構成に留める |
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
├── index.html          … エントリHTML（#app にPixiJSのcanvasをマウント）
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.ts          … ブートストラップ（Application初期化、Simulationの起動とtickループ）
│   ├── ecs/             … 自作ECSコア（Entity/Component/World/System）
│   │   ├── entity.ts        … Entity = number
│   │   ├── component.ts     … コンポーネント型（Symbolトークン）の定義
│   │   ├── componentStore.ts… コンポーネント1種類分のスパースセット格納庫
│   │   ├── world.ts         … Entity/Componentの生成・破棄・クエリを管理
│   │   ├── system.ts        … Systemの型とSchedulerによる実行
│   │   └── world.test.ts    … 上記の単体テスト
│   ├── game/            … ゲームドメインロジック（ECSのコンポーネント/システムを利用）
│   │   ├── components.ts    … Position/Owner/Walker/MoveTarget/House/FactionState
│   │   ├── constants.ts     … 速度・成長率・家レベル別ステータス等のチューニング値
│   │   ├── faction.ts       … Faction(勢力)エンティティの生成/検索
│   │   ├── simulation.ts    … WorldとSchedulerを束ね、tickごとにupdate()するSimulation
│   │   └── systems/         … movement / wanderTarget / settle / houseGrowth / mana
│   ├── world/
│   │   └── heightmap.ts … 頂点高さマップの型と生成（現状はプレースホルダー生成）
│   └── render/
│       ├── IsoRenderer.ts … heightmapをアイソメトリックなポリゴン群として描画し、
│       │                    タイル座標→画面座標への投影(project)も提供
│       ├── EntityLayer.ts … ECS World上のWalker/Houseを勢力の色分けで描画
│       └── Hud.ts         … 勢力ごとのマナ/家数/ウォーカー数を表示するテキストHUD
└── docs/
    ├── game-system.md   … 再現対象のゲームシステム仕様
    └── tech-stack.md     … 本ファイル
```

ECSが実際のレンダリングパイプラインに接続され、`Simulation`が
「ウォーカーが徘徊→定住して家になる→家が人口を生産して新たな
ウォーカーを輩出→マナが蓄積する→敵と接触すれば戦い、敵の家は
奪うか撃退する→どちらかの勢力が全滅したら決着」という基本ループを
ブラウザ上で可視化できる状態まで進んだ（ヘッドレスブラウザでの
スクリーンショット検証済み）。`docs/game-system.md` のデータモデル
素案のうち、地形連動の目標探索・House.levelの自動アップグレード・
行動方針（gather/goToShrine/fight）・奇跡・プレイヤー操作（地形編集や
奇跡の発動）・征服モードの複数ワールド進行はまだ未実装。

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

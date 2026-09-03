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
│   ├── main.ts          … ブートストラップ（Application初期化、リサイズ対応）
│   ├── ecs/             … 自作ECSコア（Entity/Component/World/System）
│   │   ├── entity.ts        … Entity = number
│   │   ├── component.ts     … コンポーネント型（Symbolトークン）の定義
│   │   ├── componentStore.ts… コンポーネント1種類分のスパースセット格納庫
│   │   ├── world.ts         … Entity/Componentの生成・破棄・クエリを管理
│   │   ├── system.ts        … Systemの型とSchedulerによる実行
│   │   └── world.test.ts    … 上記の単体テスト
│   ├── world/
│   │   └── heightmap.ts … 頂点高さマップの型と生成（現状はプレースホルダー生成）
│   └── render/
│       └── IsoRenderer.ts … heightmapをアイソメトリックなポリゴン群として描画
└── docs/
    ├── game-system.md   … 再現対象のゲームシステム仕様
    └── tech-stack.md     … 本ファイル
```

現時点では「地形メッシュが描画できる」ことと「ECSコアが動く」ことまでの
最小骨格。ECSはまだ`main.ts`のレンダリングパイプラインには接続していない。
`docs/game-system.md` のデータモデル素案に沿って、今後
Walker（自律ユニット）・House（集落）・Faction（マナ経済/行動方針）を
ECS上のコンポーネント/システムとして実装し、Simulation（tick駆動の
ゲームループ）で`Scheduler`を回す形に発展させる。

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

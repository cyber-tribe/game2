# 技術選定

## 決定事項

| 項目 | 選定 | 理由 |
|---|---|---|
| 言語 | TypeScript | `docs/game-system.md` のデータモデル（World / Faction / Walker / House）を型で表現し、実行時エラーを減らす |
| 描画エンジン | PixiJS (WebGL) | 地形タイル＋大量のウォーカーを毎フレーム描くのに向く軽量2D描画ライブラリ。シーン管理や物理などゲーム側の仕組みは自前で組む前提 |
| ビルド | Vite | 高速な開発サーバーとシンプルなプロダクションビルド |
| 実行環境 | ブラウザのみ | デスクトップ配布（Tauri等）は行わない。`npm run build` の静的ファイルをどこにでもホスティングできる構成に留める |
| バックエンド | なし | シングルプレイ対戦（ローカルAI）が基本方針のため、サーバーサイドは現時点で不要 |

## 却下した選択肢

- **Phaser 3**：シーン管理・タイルマップ・物理エンジンまで内包するフルスタックフレームワーク。
  本ゲームは物理演算や既存のタイルマップ機能を必要とせず、独自のアイソメトリック地形
  （頂点ごとの高さを持つメッシュ）を描く必要があるため、機能過多と判断。
- **素のCanvas 2D**：依存ゼロで手軽だが、ウォーカー数が増えた際のCPU負荷や
  将来のシェーダー活用（水面のアニメーション等）の余地を考えるとWebGL基盤の
  PixiJSを採用した方が拡張性が高い。

## プロジェクト構成

```
game2/
├── index.html          … エントリHTML（#app にPixiJSのcanvasをマウント）
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.ts          … ブートストラップ（Application初期化、リサイズ対応）
│   ├── world/
│   │   └── heightmap.ts … 頂点高さマップの型と生成（現状はプレースホルダー生成）
│   └── render/
│       └── IsoRenderer.ts … heightmapをアイソメトリックなポリゴン群として描画
└── docs/
    ├── game-system.md   … 再現対象のゲームシステム仕様
    └── tech-stack.md     … 本ファイル
```

現時点では「地形メッシュが描画できる」ところまでの最小骨格。
`docs/game-system.md` のデータモデル素案に沿って、今後
Walker（自律ユニット）・House（集落）・Faction（マナ経済/行動方針）・
Simulation（tick駆動のゲームループ）を順に実装していく。

## 開発コマンド

```bash
npm install       # 依存関係インストール
npm run dev       # 開発サーバー起動 (http://localhost:5173)
npm run typecheck # 型チェックのみ
npm run build     # 型チェック + 本番ビルド (dist/)
npm run preview   # ビルド結果をローカルで確認
```

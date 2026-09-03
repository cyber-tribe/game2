# 0037 scrollable-match-record

## 背景

ユーザーからのフィードバック：「戦いの記録は縦スクロール出来るように
して」。`plan/0032`/`plan/0034`で追加した「戦いの記録」は`Hud.ts`の
PixiJS `Text`オブジェクトに他のHUD文字列と一緒に描画されており、
`Text`自体はスクロールできない。長い試合では画面に収まらない行数に
なり得るが、それを見る手段がなかった。

## アプローチ

「戦いの記録」の表示先を、`Hud.ts`のPixiJS `Text`から独立したHTML
オーバーレイ（`#match-record`）に完全に移した。理由は単純：HTML要素
なら`overflow-y: auto`で本物のスクロールがそのまま手に入る。PixiJS側
でスクロール領域を自作するより大幅に単純。

- `index.html`：`#tutorial-hint`/`#enemy-event-toast`と同じ見た目の
  トーン（暗い背景・青い枠）で`#match-record`を追加。中央寄せの
  モーダル風パネルで、`max-height: 70vh`＋内側の`#match-record-list`
  に`overflow-y: auto`。ページ全体の`touch-action: none`（キャンバス
  ジェスチャー用）がこのリスト内のスクロールまで潰してしまわない
  よう、`touch-action: pan-y`で明示的に上書きした。
- `Hud.ts`：`matchEvents`引数と記録描画ロジックを完全に削除。
  「GAME OVER — winner wins」の1行のみ、これまで通りPixiJS Text側に
  残す（短い1行なのでスクロール不要）。
- `render/matchEventLabels.ts`：`Hud.ts`にあった`formatMatchTime`を
  移設・export。表示文字列の組み立てロジックを1箇所に集約した。
- `main.ts`：`showMatchRecord(outcome, events)`を追加。試合終了を
  検知した最初のフレームでDOM要素を1回だけ構築して表示する
  （毎フレーム再構築はしない——スクロール位置を毎フレームリセットして
  しまうのを避けるため）。

## テスト

- `render/matchEventLabels.test.ts`（新規）：`Hud.test.ts`にあった
  `describeMatchEvent`のアサーションをこちらに移設し、`formatMatchTime`
  のテストを追加。
- `Hud.test.ts`：`matchEvents`関連のテストを削除し、GAME OVER行の
  勝者・引き分け表示のみを検証する形に整理。
- `npm run typecheck` / `npm run test -- --run`（226件）/
  `npm run build`がすべて成功。
- ヘッドレスブラウザで`#match-record`に40件のテスト行を直接流し込み、
  ①`scrollHeight > clientHeight`（実際にオーバーフローしていること）
  ②Playwrightのホイール操作で`scrollTop`が実際に動くこと
  （0→400）を確認。実際の試合終了を待たずに、スクロール機構
  そのものが機能していることを直接検証した。

## 残作業

- パネルを閉じる手段がない（試合終了は現状ゲームの終端状態で、
  それ以降何も起きないため意図的に省略）。将来「もう一戦」導線が
  実装されたら、閉じるボタンや自動遷移を検討する必要がある。

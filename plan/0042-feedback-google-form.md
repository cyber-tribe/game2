# 0042 feedback-google-form

## 背景

「game2 第4回 敵対的検証」の指摘：GitHub Issueへのフィードバック導線
（`plan/0040`）は開発者には自然だが、一般のポピュラス経験者にとって
GitHubアカウント・Issue・Markdownは普通のフィードバック手段ではなく、
高い壁になる。ユーザー自身からも「フィードバックですが、githubを
使わない良い方法はあるでしょうか」と相談があり、選択肢
（Googleフォーム／メール／その他）を提示したところ「Googleフォーム」
を選択。ユーザーが実際にフォームを作成し、そのURLを共有してくれた。

## アプローチ

`#feedback-link`（試合終了後の「もう一度遊ぶ」ボタンの下のリンク）の
遷移先を、GitHub Issue新規作成URLからユーザー作成のGoogleフォームの
URLへ差し替えた。

- 共有されたのはフォームの素のURL（`entry.XXXXXXX`形式の事前入力
  パラメータ付きではない、`.../viewform`のみ）だったため、
  `plan/0040`にあった「勝敗・試合時間・記録イベント数を自動入力する」
  機能は今回は持たせられない。フォーム側にその3項目の質問を追加し、
  フォーム編集画面の「事前入力したリンクを取得」で得られる
  `entry.XXXXXXX=...`付きURLを共有してもらえれば、GitHub版と同様に
  動的に組み立てるロジックへ拡張できる——という選択肢は伝えてある。
- 遷移先が固定URLになったことで、`src/feedback.ts`
  （`buildFeedbackIssueUrl`と`src/feedback.test.ts`）は動的に組み立てる
  理由がなくなったため削除し、`index.html`の`href`に直接埋め込んだ。
  `main.ts`側の`feedbackLink`要素取得・`showMatchRecord`内での
  `href`差し替えロジックも同様に不要になったため削除した。

## テスト

- `npm run typecheck` / `npm run test -- --run`（226件）/
  `npm run build`がすべて成功。
- ヘッドレスブラウザで`#feedback-link`の`href`が指定のGoogleフォーム
  URLになっていること、`target="_blank"` `rel="noopener"`が
  維持されていることを確認。

## 残作業

- 事前入力（勝敗・試合時間・記録されたイベント数の自動入力）は
  ユーザーの判断で見送り。フォームへのリンクは素のURLのままでよい。

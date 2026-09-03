# 縦持ちスマホPWAへの一本化

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

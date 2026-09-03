# インストール済みPWA（ホーム画面）でHUDがステータスバーに隠れる問題への対応

GitHub Pagesへのデプロイ修正後、実機でホーム画面に追加してPWAとして
起動すると、通常のSafariタブでは問題なかったHUD（マナ/家数/ウォーカー数
のテキスト）がiOSのステータスバーの下に隠れて読めなくなる不具合が
報告された。原因は、`viewport-fit=cover`（ノッチ配下まで描画を広げる
設定）により、スタンドアロン表示ではアプリが画面の本当の最上部
（y=0）から描画されるのに対し、通常のブラウザタブではSafari自身の
アドレスバーが既にその領域を占有しているため同じ問題が表面化しな
かった、という違いによるもの。HUDは`PIXI.Text`として`(10, 10)`固定の
座標に描画されており、`env(safe-area-inset-top)`（ノッチ/ステータス
バーの高さ、スタンドアロン以外では0になる）を一切考慮していなかった。

`index.html`の`:root`に`--safe-area-inset-top: env(safe-area-inset-top,
0px)`というCSSカスタムプロパティを追加し、`main.ts`の
`getSafeAreaInsetTop()`が`getComputedStyle(document.documentElement)`
経由でこの値を読み取れるようにした（`env()`はPixiJSのcanvas内部からは
直接参照できないDOM/CSSの値のため、こうしてJS側に橋渡しする必要が
あった）。`layout()`関数（リサイズ時にも呼ばれる）でこの値を使い、
①地図のスケール計算に使う`availableHeight`から差し引く、②
`renderer.view.position.y`に加算して地図全体を少し下にずらす、③
新設した`Hud.setTopInset(px)`でHUDテキストのY座標を`10 + px`に更新する、
という3箇所に反映した。通常のブラウザタブ（値が常に0）では見た目が
変わらないことも確認済み。

ヘッドレスブラウザでは`env(safe-area-inset-top)`を直接エミュレートする
手段がないため、`document.documentElement.style.setProperty(
"--safe-area-inset-top", "47px")`（iPhone実機相当の値）を注入した上で
スクリーンショットを撮り、HUDテキストが赤く着色した「ステータスバー」
領域の下まで正しく押し下げられることを確認した。

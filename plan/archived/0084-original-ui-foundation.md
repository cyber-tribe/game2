# PR1: 原作型UI基盤（グラフィックス原作再現・Phase 1）

## 背景

ユーザーから「POPULOUS 2 グラフィックス原作再現 改修指示」という
非常に大規模な要望（32項目、Phase 1〜4）を受けた。目的は、game2の
グラフィックスをSFC版『POPULOUS 2』の視覚表現へ可能な限り寄せること。
「現代的で分かりやすいUI」よりも「原作を想起できること」を優先し、
原作の素材そのものはコピーせず、構図・情報密度・配色設計をオリジナル
素材として再構築する。

ユーザー自身が指示の末尾（32節）で実装順序を明示しており、それに
従って着手する：

1. **PR1: Original-style UI foundation**（本PR）
2. PR2: Isometric settlements（建物の全面再設計）
3. PR3: Directional followers（信者/リーダー/ヒーローのスプライト化）
4. PR4: World surface art（地形テクスチャ・水面・沼・volcano・minimap）

本PRはPhase 1（改修指示の1〜5節、21〜22節、28節該当部分）を対象とする。
Phase 2以降（建物・信者・地形テクスチャ）は別PRで対応する。

なお、指示6節が要求する「実際の色はSFC版のスクリーンショットを複数
比較して決定する」というプロセスは、本セッションの環境ではw.atwiki.jp等
一般的なWebフェッチがネットワークegress制限でブロックされており実行
できなかった。そのため`GAME_PALETTE`の色は「古代ギリシャ神殿風の
石灰岩・青銅」という方向性からの設計判断であり、実際の原作スクリーン
ショットから採取した値ではない。原作のスクリーンショットが会話内に
直接貼られれば、それをもとに再調整する。

## 対応

### 1. マスターパレット（指示6節）
`src/render/palette.ts`に`GAME_PALETTE`を新設。石灰岩/青銅/羊皮紙/
水/土/溶岩の各トーンと、陣営アクセント色（旗・装飾専用、建物全体には
使わない）を一箇所に集約。index.htmlのCSSカスタムプロパティも同じ値で
手動同期している（ビルド時にTSの定数をCSSへ流し込む仕組みは今回は
導入せず、コメントで同期を明示するに留めた）。

### 2. Pixel iconシステム・emoji全面廃止（指示3〜5節）
`src/ui/pixelIcons.ts`に、16x16論理解像度のpixel iconを`fillRect`/
`fillCircle`/`drawLine`（Bresenham）と、地形メッシュの固定光源シェー
ディングと同じ「左半分ライト・右半分シャドウ」の二色塗りを共有する
`fillMountain`ヘルパーで構築する仕組みを実装。奇跡・行動方針・人口
放出・照会・マナ計・人口比較の19種類のiconを用意し、`buildIconGrid`の
出力が空でない、かつ互いにシルエットが重複しないことをテストで保証
している。

`src/ui/commandIcons.ts`の`mountCommandIcons()`が、これらのiconを
`#toolbar`内の各ボタンへ起動時に差し込む。index.html側のemoji
（🌋🌊⚔️☠️🔍💥🚩🐸🛡️🚶🙏📝🔑🏆🔒）は全て撤去し、
`src/render/matchEventLabels.ts`のマッチイベント絵文字（戦いの記録
画面用）も撤去した。あわせて同ファイルの`houseReachedCastle`テンプレ
文言が内部識別子`"castle"`を英語のままプレイヤー画面に出していたのを
`"城砦"`に修正した（指示21節の「内部名称をプレイヤー画面に出さない」
に該当）。

### 3. スクロール式toolbarの廃止・固定コマンドパネル（指示3節）
index.htmlの`#toolbar`を、`max-height` + `overflow-y: auto`の
スクロール式から、自身のコンテンツに合わせてサイズが決まる
`#command-panel`（固定位置、スクロールなし）に置き換えた。
アイコン主体・ラベルは短いテキストのみの高密度なグリッド
（`grid-template-columns: repeat(auto-fill, minmax(46px, 1fr))`）にした
ことで、17個の全ボタン（行動方針4+人口放出1+照会1+奇跡11）を
iPhone 13の縦画面で画面高の約34%（225px/664px）に収め、スクロールが
一切不要であることをPlaywrightで確認した（`#toolbar`の
`scrollHeight === clientHeight`）。

CSSの`border-radius`・rgba半透明ネイビー・青緑の現代的ボタン色は撤去し、
`box-shadow`の`inset`を使った3〜4段階のハードエッジな石材ベベルに
置き換えた（CSS gradientは使用していない）。

### 4. HUDのpixel UI化・内部名称の非表示（指示21節）
`src/render/Hud.ts`から、`player: mana 12.3 house 4 walker 2 (settle)`
のようなデバッグ的なテキスト行と、ASCII文字（▓░）による人口比較バー、
「GAME OVER — X wins」の行を撤去した。GAME OVERは、同じフレームで
表示される`#match-record`のHTMLダイアログ（日本語で結果とイベント
記録を表示）とちょうど重複していたため、Hud側の英語混じりの簡易表示は
そのまま削除している。Hudに残したのは地形名・地形操作制限の2行のみ。

代わりに`src/ui/statusPanel.ts`の`StatusPanel`が、コマンドパネルの
ステータス行（マナ: icon+pixel bar+数値、人口比較: icon+2色pixel bar）
を管理する。表示するのは自軍の実マナ量のみ——敵軍の正確なマナ残量を
表示するのはこのプロトタイプ独自のデバッグ用途であり、原作の忠実度とは
無関係と判断し撤去した。`player`/`enemy`/`walker`/`house`といった
内部識別子は、このステータス行にもHudにも一切テキストとして出現しない。

### 5. floating toastの削減（指示22節）
`#enemy-event-toast`・`#entity-info-panel`という2つの画面中央固定の
半透明pill型トーストを撤去し、コマンドパネル最上部の`#panel-message`
1行に統合した。マナ不足・敵陣地操作不可の警告は`tone: "warning"`
（羊皮紙地に赤文字）、照会結果・敵の奇跡発動通知は既定のneutralトーン
で表示する。メッセージが無いときも`visibility: hidden`で高さを確保
したままにし、表示/非表示でアイコングリッドがガタつかないようにした。

## 対応しなかった項目（Phase 2以降へ）

- 建物・信者・ヒーローのisometric/方向別sprite化（指示7〜14, 26節）
- 地形テクスチャ・farmland・water/swamp/volcano表現・minimap改善
  （指示9, 15, 17〜20節）
- Sprite atlas（Texture/Sprite）への移行（指示26節）— 今回のiconは
  すべてHTML `<canvas>`（DOM側）で完結しており、PixiJS世界側の
  Graphics即時再構築の問題（指示26節が指摘する対象）にはまだ着手して
  いない。

## 検証

- `npm run typecheck` / `npm run test -- --run`（437件、新規
  `pixelIcons.test.ts`3件追加、`Hud.test.ts`をHud簡素化に合わせて
  全面書き換え、`matchEventLabels.test.ts`をemoji撤去に合わせて更新）
  / `npm run build`：すべて成功。
- Playwright（chromium、iPhone 13エミュレーション）で実機確認：
  - ワールド選択画面・ゲーム開始直後・マナ不足メッセージ表示時・
    しばらく経過後（家・ウォーカーが複数出現）の4状態をスクリーン
    ショットで確認。emojiが一切表示されないこと、コマンドパネルが
    画面高の34%に収まりスクロールが発生しないこと、17個全てのpixel
    iconが描画されること、マナ計と人口比較バーが実際の値に応じて
    伸縮すること、コンソールエラーが無いことを確認した。

# 0089 パレットの単一ソース化（ドット絵ツールチェーンの第一歩）

## 背景

ユーザーからの提案:

> ドット絵に強いライブラリがあれば導入しませんか? 例えばpythonで絵を作って
> それをtypescriptで利用するといった方法でも良いです

検討の結果、**ランタイムのライブラリは導入しない**方針で合意した。PixiJS v8
には `Spritesheet` / `Texture` / `scaleMode: "nearest"` が揃っており、
アトラスの読み込みも等倍拡大も標準でできる。追加ライブラリは依存を増やす
だけで得るものがない。

本当に不足しているのは**作画**の側である。現状スプライトは
`src/render/pixelArt.ts` の描画コード（`drawWalls`、`drawHipRoof` など）で、
`Graphics` の多角形塗りを積んでいる。この方式では1ピクセル単位の作り込みが
できず、アニメーションのフレーム差分も書きづらく、毎フレーム再描画のコストも
かかる。ここを **Python + Pillow でビルド時に PNG アトラスを生成し、
TypeScript から読む**構成で埋める（ご指示 §26「Sprite atlas への移行」にも
合致する）。

## このタスクの範囲

アトラス生成そのものではなく、**その前段としてパレットを単一ソース化する**
ところまで。

理由: 現状、色の定義は `src/render/palette.ts` と `index.html` の `:root`
ブロックの**二箇所に手書きで重複**している。実際、直前の較正作業
（plan/archived/0088）では両方を手で直した。ここに Python 側の作画コードが
加わると三箇所目の複製ができ、必ずズレる。スプライトの色が UI の色と
食い違えば、パレットを一箇所に集約した意味自体が失われる。したがって
アトラス生成に着手する前に片付ける。

## 構成

```
tools/palette.json          ★ 唯一の色定義
tools/palette.py            読み込みモジュール（後続の作画スクリプトが使う）
tools/generate_palette.py   コード生成の入口
```

生成物は**リポジトリにコミットする**:

- `src/render/palette.ts` — ファイル全体を生成
- `index.html` — `BEGIN/END GENERATED PALETTE` マーカーで挟まれた区間のみ置換

こうすることで、**ゲームのビルドにも通常の開発にも Python を要求しない**。
Python が要るのは色を変更するときだけである。

### なぜ CSS を別ファイルにしなかったか

`src/styles/palette.css` を吐いて `main.ts` から import する案も検討したが、
JS のロード前に一瞬スタイルが当たらない状態が生じる。`index.html` の
`<style>` に直接埋めたままマーカー区間だけ差し替える方式なら、この問題が
そもそも発生せず、`index.html` が単体で完結した状態も保てる。

### CSS 変数名は導出する

`stoneHighlight` → `--stone-highlight` を `tools/palette.py` の
`Color.css_var` で機械的に導出しており、JSON には書かない。両者を別々に
書けるようにすると、そこがまた新しいズレの発生源になるため。

CSS に出すかどうかは JSON の `"css": true` で選ぶ（32色中15色）。地形や
溶岩の色は CSS からは使わないので出していない。

## 生成物のズレを CI で防ぐ

生成物をコミットする方式の弱点は、**手で編集されても気づけない**こと
（次の再生成で黙って巻き戻る）。これを防ぐため `npm run palette:check` を
追加し、CI（`.github/workflows/test.yml`）の typecheck の前に実行する。
再生成した結果がコミット済みと1バイトでも違えば失敗する。

`npm run palette` で再生成、`npm run palette:check` で検証。

これは将来 PNG アトラスをコミットするときにも効いてくる。PNG は git 上で
差分の読めないバイナリだが、**レビュー対象は生成元の Python コードのほう**で
あり、生成物が生成元と一致していることは CI が保証する、という形にできる。

## 色の値は一切変えていない

今回は構成の変更のみで、較正済みの値は変わっていない。差分に現れる
`0x` / `#` の16進値がすべて `-` 行と `+` 行の両方に出ることを確認した
（実際の差分はコメントの整形・`--warning` と `--mana-accent` の順序・
マーカーの追加だけ）。

## 検証

- `npm run palette:check` — クリーンな状態で exit 0。
- 生成物を手で書き換えた状態（`stoneMid` を `0x000000` に）で exit 1 に
  なることを確認。ガードが実際に機能している。
- `npm run typecheck` 通過、`npm run test -- --run` 447件通過。
- dev server + Playwright で画面を目視確認。UI・地形とも色が変わって
  いないこと、コンソールエラー0件を確認。

## 次の段階

1. `tools/sprites/` に Pillow で walker のフレーム生成を書く
   （方向×状態）。`tools/palette.py` から色を引く。
2. `public/sprites/atlas.png` + `atlas.json` を出力し、Pixi の
   `Spritesheet` で読む。
3. `EntityLayer` の walker 描画を `Graphics` からスプライトに差し替える。

**建物と地形はスプライト化しない。** 可変の傾斜メッシュや動的な高さに
追従する必要があり、手続き描画のままが適している。スプライト化の効果が
大きいのは walker・leader・hero・コマンドアイコン — サイズが固定で、
方向別・状態別のフレームが要り、かつ原作らしさが最も出る部分である。

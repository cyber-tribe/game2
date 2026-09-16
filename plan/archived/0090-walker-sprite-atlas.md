# 0090 Walkerのsprite atlas化（Pythonによる作画パイプライン）

## 背景

plan/archived/0089 でパレットを単一ソース化し、Python 側の作画コードが
参照できる土台ができた。本タスクはその上に**実際の作画パイプラインを載せ、
walker を最初の適用先とする**。

walker はこれまで `src/render/pixelArt.ts` の `drawWalkerSprite` が毎フレーム
`Graphics.rect().fill()` を数十回積んで描いていた。この方式の問題は
性能よりも**作画のしづらさ**にある。1ピクセル単位で絵を詰められず、
フレーム差分も書きづらい。PixiJS は絵を*表示*する道具は揃っているので、
足りていなかったのは*描く*側だった。

## 構成

```
tools/sprites/walkers.py    フレームの作画（パターン定義とレンダリング）
tools/sprites/atlas.py      アトラスへのパッキングとPixi用JSONの出力
tools/generate_sprites.py   入口
    ↓
src/assets/sprites/walkers.png   96フレーム / 112x54px / 488バイト
src/assets/sprites/walkers.json
```

`npm run sprites` で再生成、`npm run sprites:check` で検証（CI で実行）。
palette と同じく**生成物はコミットする**ので、ゲームのビルドにも通常の
開発にも Python は要らない。

### なぜ src/assets/ で public/ ではないのか

`public/` に置くとファイルはそのままコピーされ、本番の base パス
（`/game2/`、vite.config.ts 参照）とキャッシュバスティングを自前で
面倒みることになる。`src/` 以下なら Vite が URL を所有するので両方とも
自動で解決される。実際、488バイトのアトラスは
`assetsInlineLimit`（4KB）を下回るため data URI としてバンドルに
インライン化され、追加のリクエストすら発生しない。

### 全組み合わせをアトラスに焼く

96フレーム = 2陣営 × 6ポーズ × 4方向 × 2歩行フレーム。この規模なら
実行時の合成や tint は要らず、フレームキーが完成した絵を1枚選ぶだけで済む。

そもそも tint は使えない。Pixi の tint はスプライト全体に乗算がかかるため、
衣服だけでなく肌やブーツまで一緒に染まってしまう。

6ポーズは `plain` / `leader` / `knight` / `guardian` / `leaderKnight` /
`leaderGuardian`。leader と hero は独立で、旧 `drawWalkerSprite` も
両方のマークを描いていたため、掛け合わせを列挙している。

## 両言語のキーが食い違う事故を防ぐ

フレームキーは `tools/sprites/walkers.py` の `frame_key()` と
`src/render/walkerSprites.ts` の `walkerFrameKey()` が**別言語で独立に
同じ文字列を組み立てる**。ここがズレても例外は飛ばず、テクスチャ検索が
`undefined` を返して **walker が黙って消えるだけ**になる。

そこで `walkerSprites.test.ts` で、ゲームが要求しうる全キーが
コミット済みアトラスに存在すること、および**アトラス側に使われない
フレームが残っていないこと**の双方向を検証する。実際にキー形式を
片側だけ変えると2件失敗することを確認済み。

## ピクセルグリッドへの整列

旧 `drawWalkerSprite` は hero のマークを `centerX + scale * 1.8` のような
小数オフセットで描いており、**ピクセル境界に乗っていなかった**。
グリッド上で作画する方式では整数ピクセルであることが構造的に保証される。
ご指示 §23（Pixel density）の趣旨にも沿う。

あわせてマークの位置を本体の外側の列（col 4）に寄せ、旧版で1px浮いて
見えていた隙間をなくした。

## 陣営色をパレットへ寄せた（見た目が変わる点）

`EntityLayer` は `FACTION_COLOR` として `0x4fa8ff` / `0xd94f4f` という
**較正前の明るい独自リテラル**を持っていた。plan/archived/0089 が
解消しようとしたドリフトそのものであり、スプライトの色をここから
引くわけにはいかない。パレットの `playerAccent` / `enemyAccent` に
一本化した。

結果として walker と house の陣営色が、較正済みの落ち着いた色に変わる。
パレットのコメントにある通り `playerAccent` は**原作自身の陣営青**なので、
原作再現の観点でも正しい方向である。

## 描画順の維持

walker が `Graphics` から `Sprite` になったため、1つだった `Graphics` を
2つに分けた。

```
graphics（農地・沼・家） → walkerLayer（Container） → effects（着弾エフェクト）
```

こうしないと、同一 `Graphics` に描かれていた着弾エフェクトが walker の
**下**に回ってしまう。

## Sprite のプール

walker は定住・溺死・戦闘で頻繁に生成・消滅するため、entity をキーにした
Map だと死んだ walker ごとに Sprite が漏れ、独自の掃除パスが要る。
**添字によるプール**にして、そのフレームで描かれなかった分は
`visible = false` にするだけにした。

## CI で Python が要る一点

生成物をコミットしているのでゲームのビルドに Python は要らないが、
`npm run sprites:check` だけは生成器を実際に走らせるので Pillow が要る。
最初の push はここを忘れて CI が `ModuleNotFoundError: No module named
'PIL'` で落ちた。`tools/requirements.txt`（Pillow をピン留め）と
workflow の setup-python / pip install を追加した。

あわせて `--check` の比較を**PNGのバイト列から復号後のピクセルへ**変えた。
PNG のバイト列は圧縮した zlib の実装に依存するため、コミットした環境と
zlib が違うマシンでは**絵が全く同じでも**バイト比較が落ちる。この検査が
見たいのはピクセルであってバイトではない。

実際に、1ピクセル書き換えたときは exit 1、圧縮レベルだけ変えた
（絵は同一の）ときは exit 0 になることを確認している。

## 検証

- `npm run typecheck` 通過、`npm run test -- --run` 454件通過（+7件）
- `npm run sprites:check` — クリーンで exit 0、生成物を書き換えると exit 1
- `npm run build` 成功。アトラスが data URI としてバンドルに入ることを確認
- Playwright で実際のゲーム画面を確認。アトラスが96フレームでパースされ、
  Sprite が正しいテクスチャ・サイズ（6.5x11.7px = 5x9 art px × 1.3、
  leader は ×1.8）・位置で可視になっていることを計測し、
  拡大スクリーンショットで肌・衣服・ブーツが nearest で鮮明に出ることを
  目視確認した。コンソールエラー0件。

## 次の段階

作画が安くなったので、ここからが本題の原作再現になる。

1. walker の絵そのものを詰める（歩行フレームを2→4、腕振り、
   運搬/戦闘など状態別のポーズ）
2. コマンドアイコンのアトラス化
3. leader / hero のシルエットをさらに原作寄りに

**建物と地形はスプライト化しない。** 可変の傾斜メッシュや動的な高さに
追従する必要があり、手続き描画のままが適している。

# 0039 pc-support

## 背景

ユーザーからの要望：「PCからも遊べるように拡張してください」。

`plan/archived/0008-portrait-smartphone-pwa.md`の時点で「操作対象を
縦持ちスマホのPWAのみに絞る」と決め、マウス右クリックやキーボード
ショートカットを全廃していた。今回はその制約を緩め、スマホ向けの
タッチUIはそのまま維持しつつ、PC（マウス＋キーボード）からも遊べる
ように拡張する。

## アプローチ

タップ／ドラッグでの地形編集とパンは、PixiJSの`pointerdown/move/up`が
マウスでもタッチでも同じイベントとして発火するため、追加対応なしで
そのまま動く。手を入れたのは、マウスには存在しない「2本指」を前提に
していた部分のみ。

- **`index.html`**：`#rotate-warning`（縦持ち警告）を出す条件を
  `@media (orientation: landscape)`から`@media (orientation: landscape)
  and (pointer: coarse)`に変更。`pointer: coarse`はタッチスクリーンの
  ような不正確なポインタを指すメディア特徴で、マウス操作のPCは
  `pointer: fine`になるため、画面がどんな横長比率でも警告が出ない。
- **`main.ts`**：
  - マウスホイールで`applyPinchTransform`のズームだけを呼び出し
    （回転量0）、カーソル位置を軸にズームする。ピンチ操作と同じ
    `zoomFactor`のclampをそのまま共有する。
  - `Q`/`E`キーで`applyPinchTransform`の回転だけを呼び出す（1回の
    押下で15°）。2本指の捻りジェスチャーに相当するものがマウスには
    ないための代替。
  - 初回だけ出る`#tutorial-hint`に、`matchMedia("(pointer: fine)")`が
    真の場合のみ「PC: ホイールでズーム、Q/Eキーで回転できます。」を
    追記。タッチデバイスでは元から2本指ジェスチャーがあるため出さない。
- PWAマニフェストの`orientation: "portrait"`（`vite.config.ts`）は
  意図的に変更していない。これはインストールされたスマホ版PWAの
  向きロックのヒントであり、PCのブラウザタブでの表示には影響しない。

## テスト

- `npm run typecheck` / `npm run test -- --run`（222件）/
  `npm run build`がすべて成功。
- ヘッドレスPlaywrightで2パターン確認：
  - デスクトップ相当（1280×800、タッチなし、`pointer: fine`）：
    横長でも`#rotate-warning`が表示されないこと、`#tutorial-hint`に
    PC向け文言が追記されること、ホイール操作・`E`/`Q`キー押下・
    マウスドラッグ（パン）・クリック（地形編集）のいずれもエラーなく
    動作すること。
  - スマホ相当（iPhone 13エミュレーション、横向き、`pointer: coarse`）：
    従来通り`#rotate-warning`が表示され、`#tutorial-hint`にPC向け
    文言が追記されないこと（回帰していないことの確認）。

## 残作業

- PC向けのズーム/回転をホイール・キーボード操作に対応させたのみで、
  ツールバーのレイアウト自体はスマホ向けの縦積みのまま。広い画面での
  レイアウト最適化（横並び等）は今回のスコープ外。

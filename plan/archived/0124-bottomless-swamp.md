# 0124 bottomless-swamp

## 背景

`docs/original-miracles.md` の沼の項に、これまで実装されていなかった性質が
書かれている。

> 8 沼：沼を作る。底なし沼なら入った信者は死亡。リーダーや英雄を狙う用途が
> 強い。**面ごとに底なしかどうか設定される**。

`docs/game-system.md` 8節も「一定数を飲み込むと消えるタイプと恒久のタイプが
ある」と書いていたが、実装は前者だけで、`components.ts` の `Swamp` にも
`The permanent variant isn't implemented.` というコメントが残っていた。

つまり**文書が2つとも認めている未実装**が残っていた。原作記事を取得して
差分を洗い直す過程で見つかったので、ここで閉じる。

## アプローチ

### 面の性質であって、撃った側の性質ではない

原作は「面ごとに底なしかどうか設定される」と書いている。撃った神が決める
のではなく、その面が決める。したがって

- `WorldDefinition.bottomlessSwamp` を追加し、`GodDefinition` から
  神の3面へ配る（`plan/archived/0122-campaign-48-worlds.md` の構造）
- プレイヤーの詠唱（`main.ts`）と敵の神の詠唱（`enemyMiracles.ts`）の
  **両方**へ渡す。同じ面では両者が同じ種類の沼を作る

沼は植物系統の代表奇跡（`ENEMY_SIGNATURE_MIRACLE.plant`）なので、敵の神も
実際に撃つ。片方だけ底なしにすると、面の性質ではなく陣営の特権になってしまう。

### 難易度の軸ではない

`bottomlessSwamp` は単調な難化の軸に**入れない**。底なし沼は「撃った側に
とって」強いのであって、両方が撃つ以上どちらが得をするとは限らない。
その面で沼という奇跡が何であるか（数人殺す罠か、土地を奪う地形か）を
変えるだけである。`enemyPersonality` / `enemySchool` と同じ扱いで、
テストも「両方の種類が存在すること」しか見ない。

底なしにした神は、冥界と植物に寄せて3柱——冥后ペルセポネ・酒神
ディオニュソス・冥王ハデス。

### 実装

`Swamp` に `bottomless: boolean` を足した。`swampSystem` は底なしのとき
`remainingCapacity` を減らさず、沼を消さない。容量そのものは残すが読まない
（沼の種類を後から変える機能は無いので、消すより素通りさせる方が単純）。

## 検証

- `createSwamp` が既定で従来型を作り、指定すれば底なしを作ること
- `swampSystem`：底なし沼が、通常なら枯れる回数を超えても飲み込み続けること
- `swampSystem`：底なし沼の `remainingCapacity` が動かないこと
- `WORLDS`：底なしの面と従来型の面が両方あること
- `WORLDS`：底なしにした面では沼が解禁されていること
  （解禁されていない面で種類だけ決まっていても意味がない）

`npm run typecheck` / `npm run test`（746件）/ `npm run build` すべてパス。

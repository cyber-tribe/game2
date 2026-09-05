# 家のフラットネス進捗バーを廃止する

## 背景

原作『POPULOUS 2』への忠実度を評価軸に固定したフィードバックで、
「小規模なA/Bランク項目から着手する」の一環として、家の下に表示される
次レベルまでの整地進捗バー（`plan/archived/0019-house-flatness-indicator.md`
で追加）が挙げられた。

このバーは、整地して家を育てるという原作のコアループをプレイヤーに
伝えるための現代的なUI上の補助であり、原作には存在しない。今回固定
した評価軸「原作にどこまで寄っているか」の下では、「現代向けには
こちらの方が良い」という理由での追加は加点にならず、むしろ原作との
差分として除去対象になる。

## 対応

`src/render/EntityLayer.ts`から`drawFlatnessBar`メソッドとその呼び出し、
関連定数（`FLATNESS_BAR_HEIGHT`/`FLATNESS_BAR_GAP`/`FLATNESS_BAR_COLOR`）、
専用のimport（`countFlatNeighbors`、`HOUSE_LEVEL_FLATNESS_REQUIREMENT`、
`HOUSE_LEVEL_ORDER`、`HOUSE_UPGRADE_FLATNESS_RADIUS`、`HouseLevel`型、
`HOUSE_PATTERN_WIDTH`）を削除した。

家のアップグレード判定ロジック自体（`houseUpgrade.ts`の
`countFlatNeighbors`/`HOUSE_LEVEL_FLATNESS_REQUIREMENT`）は変更していない
——今回廃止したのはその進捗を可視化するUIのみで、整地して家を育てる
というゲームプレイ自体は従来通り機能する。

## 検証

- `npm run typecheck` / `npm run test -- --run`（436件、既存テストに
  バー自体の専用テストはなく変更不要） / `npm run build`：すべて成功。
- Playwright（chromium）で実機確認：ゲーム開始後、コンソールエラー
  なしで家・地形が描画されることを確認。

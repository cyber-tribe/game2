# 敵AIにallowedMiraclesが渡っていなかった不具合を修正

## 背景

`hero-diversification`（PR #75）の実装中、`enemyMiracles.ts`に
`personality`軸を追加しようとして`main.ts`の`new Simulation({...})`
呼び出しを見直したところ、`allowedMiracles: world.allowedMiracles`が
渡されていないことに気づいた。

`Simulation`の`allowedMiracles`はデフォルトで`ALL_MIRACLES`（全解禁）に
フォールバックするため、実際のプレイでは常に敵AIが全ての奇跡を
使える状態になっていた。プレイヤー側のツールバー
（`isAllowedMiracle`によるボタンdisabled制御）は世界ごとに正しく
制限されていたが、敵側だけ`docs/game-system.md`が明言する
「敵の神はプレイヤーと同じルールで介入する」という前提が崩れていた
——`plan/0068-per-world-miracles.md`（PR #73）が実装した制限の
配線漏れであり、`enemyMiracles.ts`自体のロジックやテストは元から
正しかった（`Simulation`単体のテスト
`"passes allowedMiracles through to the enemy's own miracle casting"`
は`new Simulation({...allowedMiracles})`を直接呼んでいたため、
この配線漏れを検出できていなかった）。

ユーザーの優先リスト⑤「敵神のキャラクター化」に着手する過程で
発見した、無関係な既存バグのため、CLAUDE.mdの粒度指針に従い
独立したPRとして切り出した。

## 修正内容

`src/main.ts`の`new Simulation({...})`呼び出しに
`allowedMiracles: world.allowedMiracles`を追加。1行のみの変更。

## 検証

- `npm run typecheck`: エラーなし
- `npm run test -- --run`: 399件全て成功（既存の回帰なし）
- `npm run build`: 成功
- `main.ts`はDOM/Pixi依存のためユニットテスト対象外
  （既存の慣習通り）。`Simulation`クラス自体の
  `allowedMiracles`配線は既存のテストで担保済みであり、今回の修正は
  「渡し忘れていた1箇所の呼び出し引数を足す」だけの、レビューで
  明白に正しいと判断できる変更。

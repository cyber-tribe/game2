# 敵神のキャラクター化（EnemyPersonality）

## 背景

ユーザーの優先リスト⑤「敵神のキャラクター化」への対応。これまで
敵AIのワールドごとの違いは`enemyDecisionInterval`（介入速度）・
`enemyAggressionThreshold`（攻撃性）・`allowedMiracles`（奇跡制限）
という純粋な数値の難易度調整のみで、全ワールドの敵が全く同じ
優先順位・同じ閾値で動いていた（`docs/game-system.md`10節の
「高難度では敵の介入頻度が上がるが、行動パターン自体は比較的
予測可能」という設計方針自体は維持しつつ）。「もっと速く・もっと
高頻度に同じことをする」だけでは「違う相手と対戦している」という
感覚（＝性格）は生まれない、という指摘に対応する。

## 設計

### 難易度とキャラクターの分離

- 既存の`enemyDecisionInterval`/`enemyAggressionThreshold`/
  `allowedMiracles`は「難易度」軸として維持し、変更しない
  （`enemyAi.ts`のbehaviorMode切り替えロジックにも一切手を
  入れていない）。
- 新設した`EnemyPersonality`（`worlds.ts`）は「キャラクター」軸。
  `enemyMiracles.ts`の**エスカレーション閾値とヒーロー種選択**にのみ
  介入し、実行される分岐の種類や優先順位自体は変えない。

### `ENEMY_PERSONALITY_TUNING`（`constants.ts`）

各`EnemyPersonality`に対して3つの係数を持つ:

- `volcanoRatioMultiplier`/`armageddonRatioMultiplier`:
  `VOLCANO_POPULATION_RATIO`/`ARMAGEDDON_POPULATION_RATIO`に掛ける
  倍率。1未満なら小さいリードでも踏み切る（好戦的）、1超なら
  より大きなリードを要求する（専守防衛）。
- `heroPreferenceBias`: `enemyMiracles.ts`の「守護者を選ぶか騎士を
  選ぶか」の閾値（人口比 < `1 + heroPreferenceBias`なら守護者）を
  ずらす。負なら「本当に劣勢のときだけ」守護者に頼る（好戦的）、
  正なら「わずかでも優勢でなければ」守護者に頼る（専守防衛）。

`balanced`は全て中立値（1・1・0）——今までの無調整の閾値そのもの
であり、テストの安全なデフォルトにもなる。

### ワールドへの割り当て（`worlds.ts`）

ヒーロー奇跡（騎士・守護者）が解禁される`ashen-waste`以降で
初めて意味を持つため:

- `ashen-waste`（騎士・守護者が初登場）: `aggressive`
  ——早めに騎士ラッシュを仕掛けてくる、分かりやすい好戦キャラ。
- `rising-frontier`（火山も解禁）: `defensive`
  ——守護者で粘り、大きなリードが無いと動かない。プレイヤーに
  「守りを崩す」経験をさせる。
- `final-frontline`（最終ワールド）: `aggressive`
  ——ラスボスは優勢になった瞬間に畳みかけてくる。
- それ以外（`quiet-plain`/`dry-highland`/`frozen-border`）:
  `balanced`——ヒーロー/火山/最終決戦がまだ解禁されていない
  チュートリアル寄りのワールドなので、キャラクター性を出す
  対象がそもそも無い。

難易度軸（`enemyDecisionInterval`等）とは異なり、`enemyPersonality`は
単調に厳しくなる軸ではないことを`WorldDefinition`のdoc commentで
明記した。

### UI/表示

- 世界選択画面の各ワールド説明に「敵の気質: 好戦的」のように表示
  （`balanced`のときは表示しない——`terrainEditRule`の"both"と同じ
  「デフォルトはラベルを出さない」慣習に合わせた）。
- `docs/game-system.md`10節「敵AI」に、難易度とは別軸である旨を追記。

## 検証

- `npm run typecheck`: エラーなし
- `npm run test -- --run`: 408件全て成功
  （`enemyMiracles.test.ts`に好戦的/専守防衛それぞれの閾値ずらしを
  検証する新規テスト、`worlds.test.ts`に既知のpersonalityであることの
  検証、`simulation.test.ts`にpersonalityがエンドツーエンドで
  ヒーロー種選択まで伝播することを示す統合テストを追加）。
- `npm run build`: 成功。
- Playwright（chromium）で世界選択画面を確認: 灰の荒野→好戦的、
  隆起する辺境→専守防衛、最終戦線→好戦的が正しく表示され、
  コンソールエラー無し。

## 余談: 無関係な既存バグの発見

この作業中に、`main.ts`の`new Simulation({...})`が
`allowedMiracles: world.allowedMiracles`を渡し忘れていることに
気づいた（敵AIが常に全奇跡を使える状態になっていた）。今回の
「敵神のキャラクター化」とは無関係な既存バグのため、
`plan/0071-fix-enemy-allowed-miracles.md`として別PRに切り出した。

# ヒーローの多様化（騎士＋守護者）

## 背景

これまで「ヒーロー」は騎士（`knightify`／`Walker.state === "knight"`）
の一種類だけだった。ユーザーの当初の優先リスト④「ヒーローの
多様化」（POPULOUS 2にはPerseusなど複数種のヒーローが存在した、
という指摘）に対応する。

騎士の実体は Walker の state フラグ1つと、それを見る各システムの
`=== "knight"` 判定の集合（`knightTargetingSystem`／`swampSystem`／
`houseCaptureSystem`）だった。専用の Hero コンポーネントは無く、
2種類目を追加する余地もなかったため、まず「複数のヒーロー種を
扱えるインフラ」に一般化してから、2種類目の「守護者」を実装する
一つのPRとした（CLAUDE.mdの粒度指針上、リネーム単体・追加単体に
分ける意味がないため）。

## 設計

### 騎士 vs 守護者 の役割分担

- **騎士**（既存、変更なし）: `behaviorMode` を無視し、マップ上の
  どこにいる敵でも無条件に狩る。家は奪わず焼き払う。焼いた後は
  生き残って進軍を続ける。
- **守護者**（新規）: 自陣営の家の`GUARDIAN_DEFENSE_RADIUS`（4タイル）
  以内に敵ウォーカー・敵の家が現れたときだけ迎撃に向かう。守るべき
  ものが無ければ（脅威が無い、あるいは家が1つも無い）その場に
  留まる — 世界中を飛び回る騎士とは対極の「専守防衛」ヒーロー。
  家を襲うときは通常の攻城戦と同じ防御力判定を受け、勝てば
  （焼かず）占領して生存し、負ければ通常の攻撃ウォーカーと同じく
  倒される。

### 一般化したインフラ

- `WalkerState` に `"guardian"` を追加。`components.ts` に
  `isHeroState(state)` を追加し、`swampSystem`（沼免疫）が
  `"knight"` 決め打ちだった判定を両ヒーロー共通にした。
- `KnightCooldown` → `HeroCooldown`、`KNIGHT_BURN_COOLDOWN` →
  `HERO_ACTION_COOLDOWN` にリネーム。焼き討ち後の騎士だけでなく、
  占領後の守護者にも同じ「即座に次を狙わない」冷却を適用する。
- `game/knight.ts` → `game/hero.ts`: `promoteHero(world, faction, kind)`
  を共通実装にし、`knightify`/`guardianify` はその薄いラッパー。
  既にそのヒーロー種であれば no-op、別のヒーロー種であれば
  「再専門化」として乗り換えを許可する（マナを払い直す代わりに
  ヒーロー種を変更できる、意図的な仕様）。
- `game/systems/knight.ts` → `game/systems/hero.ts`:
  `knightTargetingSystem`（無変更）に加えて `guardianTargetingSystem`
  を追加、`knightCooldownSystem` → `heroCooldownSystem`
  （`HeroCooldown` を汎用的にカウントダウン）。
- `systems/combat.ts`の`createHouseCaptureSystem`: 騎士分岐は従来通り。
  守護者は通常の防御力判定を受けつつ、勝利時のみ
  `destroyEntity`をスキップして生存＋`HeroCooldown`付与。

### 守護者の脅威検知

`guardianTargetingSystem`（`systems/hero.ts`）: 自陣営の家を1つずつ
見て、`GUARDIAN_DEFENSE_RADIUS`以内に敵ターゲット
（`findNearestEnemyPosition`、fightTargeting.tsと共有）がいる家を
「脅威あり」とし、その中から守護者自身に最も近い脅威を選ぶ。
家が無ければ何もしない。O(自陣営の家数 × 敵ターゲット数)で、
他の戦闘システムと同程度のオーダー。

### 敵AIの守護者キャスト

`enemyMiracles.ts`: `behaviorMode === "fight"`のとき、
`theirPopulation > 0 && populationRatio < 1`（実際に測定可能な
人口差で負けている）なら守護者を、そうでなければ従来通り騎士を
優先する。片方が`allowedMiracles`で解禁されていない／マナが
足りない場合でも、もう一方へのフォールバックはしない
（AIが「今は守るべき」と判断した以上、それが使えないなら
騎士に妥協はしない、という設計）。

### 世界解禁

`worlds.ts`: `guardian`を`knight`と同じ世界（ashen-waste以降）で
一括解禁。両者は「ヒーロー系奇跡」としてまとめて登場する扱い。

### UI/演出

- ツールバーに🛡️「守護者化」ボタンを騎士化の隣に追加
  （`index.html`/`ui/toolbar.ts`/`main.ts`）。コストは
  `GUARDIAN_MANA_COST`（25、騎士の35より安価 — 用途が限定的な分）。
- 描画: `GUARDIAN_COLOR`（水色）でヒーロー化を表示
  （`render/EntityLayer.ts`）。
- 効果音: 低めの持続音＋短いノイズ（盾を構える音のイメージ）を
  `audio/miracleSounds.ts`に追加。
- 戦績ログ・照会パネル・マッチイベントの絵文字/文言にも
  `guardian`を追加。

## 検証

- `npm run typecheck`: エラーなし。
- `npm run test -- --run`: 391件全て成功
  （新規: `hero.test.ts`/`systems/hero.test.ts`のguardian分、
  `combat.test.ts`/`swamp.test.ts`/`enemyMiracles.test.ts`/
  `simulation.test.ts`への追加ケース）。
- `npm run build`: 成功。
- Playwright（chromium）による手動確認:
  - 最初のワールド（quiet-plain）では騎士化・守護者化とも
    disabled（`allowedMiracles`に含まれないため）。
  - パスワード`ashen-waste`で解禁後、該当ワールドを選ぶと
    両ボタンがクリック可能になり、守護者化ボタンをタップして
    マップをタップしてもコンソールエラー無し（リーダー未確定の
    ため実質no-opだが、例外は出ない）。

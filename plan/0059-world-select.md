# 0059: 征服モードの第一歩として固定ワールドの簡易選択画面を追加する

## 背景

`docs/game-system.md` 10節（キャンペーン構造）は、約500の固定ワールドを
順に攻略する征服モードを本編として定めているが、これまで対応する実装が
一切なかった（起動直後に`bootstrap()`がいきなり1試合を始めるだけで、
メニュー画面が存在しない）。500ワールド・パスワード継続・難易度別AI・
2人対戦モードをすべて一度に実装するのは1PRの規模を大きく超えるため、
最初の一歩として「地形タイプ・マップサイズ・地形操作制限が異なる少数の
固定ワールドから選ぶ」部分だけを切り出す。ワールドリストの「進行状況の
ロック」やパスワード継続は今回のスコープ外（すべて選択可能な状態で
始める）。

## 実装

- `src/game/worlds.ts`（新規）: `WorldDefinition`（id, name, worldWidth,
  worldHeight, terrain, terrainEditRule）と、6つの固定`WORLDS`。
  マップサイズは大きくなる一方（20→32、plan/0055-map-expansion.mdで
  計測済みの安全な上限32を超えない）、地形は徐々に過酷になり
  （TERRAIN_GROWTH_MULTIPLIER: grass 1 > snow 0.75 > desert 0.6 >
  rock 0.4）、後半のワールドほど地形操作の方向が制限される
  （terrainEditRule: both→raiseOnly/lowerOnly）——「徐々に難しくなる」を
  敵AIのパラメータを一切変えずに表現している。
- `src/main.ts`: `bootstrap()`が`WorldDefinition`を引数に取るよう変更し、
  これまでランダムに選んでいた地形タイプ（`pickRandomTerrain`）と
  terrainEditRule（`pickTerrainEditRule(TERRAIN_EDIT_RULE_WEIGHTS)`）を、
  選択されたワールドの固定値に置き換えた。ページ読み込み時は
  `showWorldSelect()`が呼ばれ、`#world-select`オーバーレイに6つの
  ワールドをボタンとして並べる。選択すると同オーバーレイを隠して
  `bootstrap(world)`を呼ぶ。`#play-again`が`window.location.reload()`で
  ページごと作り直す既存の設計（plan/0038-play-again.md）と噛み合っており、
  1試合終えるたびに次のワールドを選び直す流れになる。
- `index.html`: `#world-select`/`#world-select-list`を追加。
  `#match-record`と同じ「中央固定のスクロール可能パネル」構造を流用。

## 検証

- `npm run typecheck` / `npm run test -- --run`（303件）/ `npm run build`
  すべて通過。
- headless Playwrightで確認: 起動直後に6つのワールドボタンが表示される
  こと、いずれかを選ぶとそのワールドの地形・マップサイズ・
  terrainEditRule（例:「凍てつく国境」選択時にHUDへ「地形操作: 隆起のみ可」
  と表示され、ツールバーの「▼ 沈降」ボタンが無効化される）が正しく
  反映されて試合が始まることを確認。

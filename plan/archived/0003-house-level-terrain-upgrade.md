# House.levelの地形依存アップグレード

`world/heightmap.ts`に`countFlatNeighbors(heightmap, x, y, radius)`を
追加し、指定した点を中心とする(2×radius+1)四方の頂点のうち、その点の
頂点とちょうど同じ高さを持つ頂点の数を数えるようにした（自分自身も
必ず1個としてカウントされる）。

`createHouseUpgradeSystem`はこの値を使い、`HOUSE_LEVEL_FLATNESS_REQUIREMENT`
（`HOUSE_UPGRADE_FLATNESS_RADIUS`=2なので最大25）の閾値を満たす最も高い
レベルへ家を常に合わせ直す。両方向に動く（平らにすればアップグレード、
地震等で荒れればダウングレード）。population等の他フィールドは保持
される。HOUSE_LEVELSの容量・マナ産出・防御力は既存のレベル別テーブルが
そのまま適用されるため、他システムを変更する必要はなかった。

これにより「プレイヤーが地形を編集して土地を平らにする」という
既存の地形操作機能に明確な目的（家を大きく育てる）が生まれた。
Simulationの統合テストで、完全に平坦なheightmapを与えると家がhutより
上のレベルまで育つことを確認済み。

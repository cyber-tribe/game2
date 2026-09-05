import { describe, expect, it } from "vitest";
import { Hud } from "./Hud";

describe("Hud.update", () => {
  it("shows only the terrain label when no terrain-edit rule is set", () => {
    const hud = new Hud();
    hud.setTerrain("草原");

    hud.update();

    expect(hud.view.text).toBe("地形: 草原");
  });

  it("shows the terrain-edit-rule line right below the terrain label when set", () => {
    const hud = new Hud();
    hud.setTerrain("岩地");
    hud.setTerrainEditRule("隆起のみ可");

    hud.update();

    expect(hud.view.text).toBe("地形: 岩地\n地形操作: 隆起のみ可");
  });
});

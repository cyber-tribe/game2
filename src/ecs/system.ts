import type { World } from "./world";

export type System = (world: World, deltaSeconds: number) => void;

/** Runs a fixed set of systems, in registration order, against a world. */
export class Scheduler {
  private readonly systems: System[] = [];

  add(system: System): this {
    this.systems.push(system);
    return this;
  }

  update(world: World, deltaSeconds: number): void {
    for (const system of this.systems) {
      system(world, deltaSeconds);
    }
  }
}

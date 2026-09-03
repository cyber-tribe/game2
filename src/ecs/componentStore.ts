import type { Entity } from "./entity";

/**
 * Sparse-set backed storage for one component type: O(1) set/has/get/remove,
 * and a dense array for fast, cache-friendly iteration during queries.
 */
export class ComponentStore<T> {
  private readonly sparse: number[] = [];
  private readonly dense: Entity[] = [];
  private readonly data: T[] = [];

  get size(): number {
    return this.dense.length;
  }

  has(entity: Entity): boolean {
    const index = this.sparse[entity];
    return index !== undefined && this.dense[index] === entity;
  }

  get(entity: Entity): T | undefined {
    if (!this.has(entity)) return undefined;
    return this.data[this.sparse[entity]];
  }

  set(entity: Entity, value: T): void {
    if (this.has(entity)) {
      this.data[this.sparse[entity]] = value;
      return;
    }
    this.sparse[entity] = this.dense.length;
    this.dense.push(entity);
    this.data.push(value);
  }

  remove(entity: Entity): void {
    if (!this.has(entity)) return;
    const index = this.sparse[entity];
    const lastIndex = this.dense.length - 1;
    const lastEntity = this.dense[lastIndex];

    this.dense[index] = lastEntity;
    this.data[index] = this.data[lastIndex];
    this.sparse[lastEntity] = index;

    this.dense.pop();
    this.data.pop();
    delete this.sparse[entity];
  }

  /** Dense, contiguous list of entities holding this component. */
  entities(): readonly Entity[] {
    return this.dense;
  }
}

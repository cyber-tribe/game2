import type { ComponentType } from "./component";
import { ComponentStore } from "./componentStore";
import type { Entity } from "./entity";

/**
 * Holds every entity and component in the simulation. Entities are plain
 * numeric ids; components are looked up per-type via a sparse-set store.
 */
export class World {
  private nextId: Entity = 0;
  private readonly freeIds: Entity[] = [];
  private readonly aliveEntities = new Set<Entity>();
  private readonly stores = new Map<ComponentType<unknown>, ComponentStore<unknown>>();

  createEntity(): Entity {
    const entity = this.freeIds.pop() ?? this.nextId++;
    this.aliveEntities.add(entity);
    return entity;
  }

  destroyEntity(entity: Entity): void {
    if (!this.aliveEntities.has(entity)) return;
    for (const store of this.stores.values()) {
      store.remove(entity);
    }
    this.aliveEntities.delete(entity);
    this.freeIds.push(entity);
  }

  isAlive(entity: Entity): boolean {
    return this.aliveEntities.has(entity);
  }

  add<T>(entity: Entity, type: ComponentType<T>, value: T): void {
    this.storeFor(type).set(entity, value);
  }

  remove<T>(entity: Entity, type: ComponentType<T>): void {
    this.storeFor(type).remove(entity);
  }

  has<T>(entity: Entity, type: ComponentType<T>): boolean {
    return this.storeFor(type).has(entity);
  }

  get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
    return this.storeFor(type).get(entity);
  }

  /** Entities holding every one of the given component types. */
  query(...types: ComponentType<unknown>[]): Entity[] {
    if (types.length === 0) return [...this.aliveEntities];

    const stores = types.map((type) => this.storeFor(type));
    let smallest = stores[0];
    for (const store of stores) {
      if (store.size < smallest.size) smallest = store;
    }

    const result: Entity[] = [];
    for (const entity of smallest.entities()) {
      if (stores.every((store) => store.has(entity))) {
        result.push(entity);
      }
    }
    return result;
  }

  private storeFor<T>(type: ComponentType<T>): ComponentStore<T> {
    let store = this.stores.get(type as ComponentType<unknown>) as ComponentStore<T> | undefined;
    if (!store) {
      store = new ComponentStore<T>();
      this.stores.set(type as ComponentType<unknown>, store as ComponentStore<unknown>);
    }
    return store;
  }
}

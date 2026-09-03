/**
 * A component type is a unique token used as a map key; the phantom
 * field only carries the payload's shape for the type checker and
 * never exists at runtime.
 */
export type ComponentType<T> = symbol & { readonly __componentType?: T };

export function defineComponent<T>(name: string): ComponentType<T> {
  return Symbol(name) as ComponentType<T>;
}

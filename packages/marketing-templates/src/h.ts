/**
 * Tiny element factory for building Satori-compatible node trees without
 * pulling in React as a dependency of this package. Satori accepts any
 * object shaped like `{ type, props: { style, children, ...rest } }` —
 * exactly what React.createElement returns.
 *
 * We keep it flat and untyped on purpose. Templates call h('div', {...})
 * and it JustWorks(tm).
 */

export type SatoriNode =
  | {
      type: string;
      props: {
        style?: Record<string, unknown>;
        children?: SatoriNode | SatoriNode[] | string | number | null | undefined;
        [k: string]: unknown;
      };
      key?: string | number | null;
    }
  | string
  | number
  | null
  | undefined;

export function h(
  type: string,
  props?: Record<string, unknown> | null,
  ...children: Array<SatoriNode | SatoriNode[] | string | number | null | undefined>
): SatoriNode {
  const flat: SatoriNode[] = [];
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) {
      for (const cc of c) {
        if (cc != null && cc !== false) flat.push(cc as SatoriNode);
      }
    } else {
      flat.push(c as SatoriNode);
    }
  }
  const normalizedChildren =
    flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : (flat as SatoriNode[]);
  return {
    type,
    props: {
      ...(props ?? {}),
      children: normalizedChildren,
    },
  };
}

/**
 * Per-routine model: a scheduled task may name the provider/model it runs on
 * (e.g. a cheap model for a script-only routine). The choice travels in the
 * synthetic message's metadata and is read back here.
 */
export interface RoutineModelSpec {
  provider: string;
  model?: string;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

/** Validates what a manifest asks for; returns null when nothing usable is set. */
export function routineModelSpec(source: { provider?: unknown; model?: unknown } | undefined | null): RoutineModelSpec | null {
  if (!source) return null;
  const provider = typeof source.provider === 'string' ? source.provider.trim() : '';
  if (!provider || !NAME.test(provider)) return null;
  const rawModel = typeof source.model === 'string' ? source.model.trim() : '';
  const model = rawModel && NAME.test(rawModel) ? rawModel : undefined;
  return { provider, ...(model ? { model } : {}) };
}

/** Metadata keys used on the synthetic message. */
export function routineModelMetadata(spec: RoutineModelSpec | null): Record<string, string> {
  if (!spec) return {};
  return { routineProvider: spec.provider, ...(spec.model ? { routineModel: spec.model } : {}) };
}

export function routineModelFromMetadata(metadata: Record<string, unknown> | undefined): RoutineModelSpec | null {
  return routineModelSpec({ provider: metadata?.routineProvider, model: metadata?.routineModel });
}

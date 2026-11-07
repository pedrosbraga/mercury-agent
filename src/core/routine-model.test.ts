import { describe, it, expect } from 'vitest';
import { routineModelSpec, routineModelMetadata, routineModelFromMetadata } from './routine-model.js';

describe('routine model', () => {
  it('returns null when no provider is set', () => {
    expect(routineModelSpec(undefined)).toBeNull();
    expect(routineModelSpec({ model: 'claude-haiku-5-5' })).toBeNull();
    expect(routineModelSpec({ provider: '  ' })).toBeNull();
  });

  it('accepts provider with and without model', () => {
    expect(routineModelSpec({ provider: 'anthropic', model: 'claude-haiku-5-5' })).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' });
    expect(routineModelSpec({ provider: 'anthropic' })).toEqual({ provider: 'anthropic' });
  });

  it('rejects odd names instead of passing them on', () => {
    expect(routineModelSpec({ provider: 'a b; rm' })).toBeNull();
    expect(routineModelSpec({ provider: 'anthropic', model: 'x y' })).toEqual({ provider: 'anthropic' });
    expect(routineModelSpec({ provider: 42, model: {} })).toBeNull();
  });

  it('round-trips through message metadata', () => {
    const spec = { provider: 'anthropic', model: 'claude-haiku-5-5' };
    expect(routineModelFromMetadata(routineModelMetadata(spec))).toEqual(spec);
    expect(routineModelMetadata(null)).toEqual({});
    expect(routineModelFromMetadata({ other: 1 })).toBeNull();
  });
});

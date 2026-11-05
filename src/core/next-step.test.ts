import { describe, expect, it, vi } from 'vitest';
import { canSuggestNextStep, cleanNextStep, nextStepTranscript, suggestNextStep } from './next-step.js';

const talk = (...pairs: Array<[string, string]>) => pairs.map(([role, content]) => ({ role, content }));

describe('next step suggestion', () => {
  it('needs a chat that ends on a reply', () => {
    expect(canSuggestNextStep([])).toBe(false);
    expect(canSuggestNextStep(talk(['user', 'oi']))).toBe(false);
    expect(canSuggestNextStep(talk(['user', 'oi'], ['assistant', 'olá']))).toBe(true);
    expect(canSuggestNextStep(talk(['user', 'oi'], ['assistant', 'olá'], ['user', 'e?']))).toBe(false);
    expect(canSuggestNextStep([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b', kind: 'tool' }])).toBe(false);
  });

  it('cleans the model output to one line, or nothing', () => {
    expect(cleanNextStep('  "Faz o push da branch main-custom"\nporque…')).toBe('Faz o push da branch main-custom');
    expect(cleanNextStep('Sugestão: testa a sincronização')).toBe('testa a sincronização');
    expect(cleanNextStep('NONE')).toBeNull();
    expect(cleanNextStep('none.')).toBeNull();
    expect(cleanNextStep('   ')).toBeNull();
    const long = cleanNextStep('palavra '.repeat(40))!;
    expect(long.length).toBeLessThanOrEqual(90);
    expect(long.endsWith('…')).toBe(true);
  });

  it('keeps the transcript short and hides interactive panels', () => {
    const t = nextStepTranscript(talk(
      ...Array.from({ length: 10 }, (_, i): [string, string] => [i % 2 ? 'assistant' : 'user', `m${i}`]),
      ['assistant', 'x\n```mercury-ui\n{"root":"a"}\n```'],
    ));
    expect(t.split('\n')).toHaveLength(6);
    expect(t).toContain('[interactive panel]');
    expect(t).not.toContain('"root"');
    expect(t).not.toContain('m0');
  });

  it('asks the model once and returns the cleaned line', async () => {
    const generate = vi.fn(async (_s: string, _u: string) => '"Roda o build e instala"');
    expect(await suggestNextStep(talk(['user', 'faz o fix'], ['assistant', 'feito']), generate)).toBe('Roda o build e instala');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1]).toContain('Owner: faz o fix');
  });

  it('does not call the model when the chat is not at a reply', async () => {
    const generate = vi.fn(async (_s: string, _u: string) => 'x');
    expect(await suggestNextStep(talk(['user', 'oi']), generate)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
});

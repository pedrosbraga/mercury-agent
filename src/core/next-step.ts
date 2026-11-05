/**
 * The "next step" shown as the chat box's placeholder: one short line the
 * owner could send next, in the language of the conversation. One small
 * model call per finished reply; the result is cached by the reply it was
 * made for, so reopening a chat or asking again costs nothing.
 */

export const NEXT_STEP_SYSTEM = [
  'You suggest what the OWNER should say next in a chat with their AI assistant.',
  'Read the conversation and write the single most useful next message the owner could send: the natural next step, a pending decision answered, or a check that is still missing.',
  'Write it as the owner speaking to the assistant, in the same language the owner uses, as one short sentence of at most 70 characters.',
  'Concrete beats generic: name the thing. Never "continue", never a question about how you can help, no quotes, no emoji, no explanation.',
  'If nothing useful is left to do, answer with exactly NONE.',
].join(' ');

export interface NextStepMessage { role: string; content: string; kind?: string }

const MAX_LEN = 90;
const TURNS = 6;
const PER_MESSAGE = 700;

/** The last few exchanges, trimmed: enough to know where the chat stands. */
export function nextStepTranscript(messages: NextStepMessage[]): string {
  const talk = messages.filter((m) => (m.kind ?? 'message') === 'message' && (m.role === 'user' || m.role === 'assistant') && m.content.trim());
  return talk.slice(-TURNS).map((m) => {
    const text = m.content.replace(/```mercury-ui[\s\S]*?```/g, '[interactive panel]').replace(/\s+/g, ' ').trim();
    const cut = text.length > PER_MESSAGE ? `${text.slice(0, PER_MESSAGE)}…` : text;
    return `${m.role === 'user' ? 'Owner' : 'Assistant'}: ${cut}`;
  }).join('\n');
}

/** Model output to a placeholder: one line, no wrappers, or null. */
export function cleanNextStep(raw: string): string | null {
  let s = raw.trim().split('\n')[0]?.trim() ?? '';
  s = s.replace(/^(owner|you|next step|suggestion|sugestão|sugestao)\s*:\s*/i, '').replace(/^[-*>\s]+/, '').replace(/^["“'‘«]+|["”'’»]+$/g, '').trim();
  if (!s || /^none\.?$/i.test(s)) return null;
  if (s.length > MAX_LEN) {
    const cut = s.slice(0, MAX_LEN - 1);
    s = `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length)}…`;
  }
  return s;
}

/** Needs a finished exchange: the chat must end on an assistant reply. */
export function canSuggestNextStep(messages: NextStepMessage[]): boolean {
  const talk = messages.filter((m) => (m.kind ?? 'message') === 'message' && (m.role === 'user' || m.role === 'assistant'));
  return talk.length >= 2 && talk[talk.length - 1].role === 'assistant';
}

export async function suggestNextStep(
  messages: NextStepMessage[],
  generate: (system: string, user: string) => Promise<string>,
): Promise<string | null> {
  if (!canSuggestNextStep(messages)) return null;
  const raw = await generate(NEXT_STEP_SYSTEM, `Conversation so far:\n${nextStepTranscript(messages)}\n\nThe owner's next message:`);
  return cleanNextStep(raw);
}

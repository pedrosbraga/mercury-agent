// Synthetic, non-private image probe. Reads existing settings, never prints credentials.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { withAttachments } from '../src/core/attachments.ts';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import YAML from 'yaml';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const config = YAML.parse(readFileSync(join(homedir(), '.mercury/mercury.yaml'), 'utf8'));
const pc = config.providers[config.providers.default];
const width = 768, height = 256;
function chunk(type, data) {
  const tag = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([len, tag, data, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
header[8] = 8; header[9] = 2;
const pixels = Buffer.alloc(height * (width * 3 + 1));
const colors = [[255, 0, 0], [0, 0, 255], [0, 255, 0]];
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const offset = y * (width * 3 + 1) + 1 + x * 3;
  colors[Math.floor(x / (width / 3))].forEach((v, c) => { pixels[offset + c] = v; });
}
const image = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
const client = createOpenAI({ apiKey: pc.apiKey, baseURL: pc.baseUrl });
const dir = mkdtempSync(join(tmpdir(), 'mercury-vision-probe-'));
const imagePath = join(dir, 'synthetic.png');
writeFileSync(imagePath, image);
const prompt = 'Inspect this image. Return only the names in English of the three vertical color blocks, from left to right, separated by commas.';
const messages = withAttachments([{role: 'user', content: prompt}], {content: prompt, metadata: {attachments: [{kind: 'image', path: imagePath}]}}, pc.name, pc.model, pc.vision);
const imageAttached = Array.isArray(messages[0].content) && messages[0].content.some(p => p.type === 'image');
if (!imageAttached) { rmSync(dir, {recursive: true}); throw new Error('Image blocked by attachment capability check'); }
try {
  const result = await generateText({
    model: client(pc.model),
    maxOutputTokens: 1500,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(90000),
    messages,
  });
  const answer = result.text.trim();
  const passed = /red.*blue.*green/i.test(answer);
  console.log(JSON.stringify({ passed, imageAttached, visionConfigured: pc.vision, answer, usage: result.usage, warnings: result.warnings }));
  if (!passed) process.exitCode = 1;
} catch (err) {
  console.log(JSON.stringify({ passed: false, error: err.message }));
  process.exitCode = 1;
} finally {
  rmSync(dir, {recursive: true});
}

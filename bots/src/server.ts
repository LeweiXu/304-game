// The batched environment as a child process, for Python (or anything that can
// talk over pipes). Built into dist/server.mjs by `npm run build`.
//
// Frames in both directions: [u32 a][u32 length][payload], little-endian.
// Requests: a = command. Replies: a = 0 ok, 1 error (payload is the message).
//
//   1 INIT   payload: JSON VecEnvConfig        reply: JSON { obsSize, actionCount, numEnvs, layout }
//   2 RESET  payload: empty                    reply: batch
//   3 STEP   payload: numEnvs x int32 actions  reply: batch
//   4 STATS  payload: empty                    reply: JSON stats
//   5 CLOSE  payload: empty                    reply: empty, then the process exits
//
// A batch is the buffers back to back, floats first so they stay aligned:
//   obs    numEnvs * obsSize  float32
//   reward numEnvs * 4        float32
//   mask   numEnvs * actionCount uint8
//   seat   numEnvs            int8
//   done   numEnvs            uint8
import { ACTION_COUNT } from '../../engine/src';
import { OBS_LAYOUT, OBS_SIZE } from './encode';
import { VecEnv, type VecEnvConfig } from './vecenv';

let env: VecEnv | null = null;
let pending: Buffer = Buffer.alloc(0);

function send(status: number, payload: Uint8Array) {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(status, 0);
  head.writeUInt32LE(payload.byteLength, 4);
  process.stdout.write(head);
  if (payload.byteLength) process.stdout.write(payload);
}

const json = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8');
const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

function sendBatch(e: VecEnv) {
  const parts = [bytes(e.obs), bytes(e.reward), bytes(e.mask), bytes(e.seat), bytes(e.done)];
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const head = Buffer.alloc(8);
  head.writeUInt32LE(0, 0);
  head.writeUInt32LE(total, 4);
  process.stdout.write(Buffer.concat([head, ...parts], 8 + total));
}

function handle(cmd: number, payload: Buffer) {
  switch (cmd) {
    case 1: {
      const cfg = JSON.parse(payload.toString('utf8')) as VecEnvConfig;
      env = new VecEnv(cfg);
      return send(0, json({ obsSize: OBS_SIZE, actionCount: ACTION_COUNT, numEnvs: env.numEnvs, layout: OBS_LAYOUT }));
    }
    case 2:
      if (!env) throw new Error('INIT first');
      env.reset();
      return sendBatch(env);
    case 3: {
      if (!env) throw new Error('INIT first');
      const actions = new Int32Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength));
      env.step(actions);
      return sendBatch(env);
    }
    case 4:
      return send(0, json(env?.stats ?? {}));
    case 5:
      send(0, new Uint8Array(0));
      process.stdout.end(() => process.exit(0));
      return;
    default:
      throw new Error(`unknown command ${cmd}`);
  }
}

process.stdin.on('data', (chunk: Buffer) => {
  pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
  while (pending.length >= 8) {
    const cmd = pending.readUInt32LE(0);
    const len = pending.readUInt32LE(4);
    if (pending.length < 8 + len) break;
    const payload = pending.subarray(8, 8 + len);
    pending = pending.subarray(8 + len);
    try {
      handle(cmd, payload);
    } catch (err) {
      send(1, json(String(err instanceof Error ? err.message : err)));
    }
  }
});
process.stdin.on('end', () => process.exit(0));

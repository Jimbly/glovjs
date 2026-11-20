/* eslint require-atomic-updates:off */

// Audio thread: decodes sounds, mixes active voices, and feeds the SDL playback stream.
// Runs in the SDL worker bundle, controlled by platform-sdl-sound.ts.
import fs from 'fs';
import { default as sdl, Sdl } from '@kmamal/sdl';
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { addHandler, sendmsg } from 'glov/client/worker_thread';
import type { JSVec3 } from 'glov/common/vmath';
import { indexOgg, OggFrameReader, type OggSource } from './platform-sdl-ogg-stream';

// Main thread -> worker
export type SoundLoadMsg = {
  id: number;
  path: string;
  loop: boolean; // looping sounds are streamed
};
export type SoundPlayMsg = {
  sound_id: number;
  voice_id: number;
  volume: number;
  position: JSVec3 | null;
  spread: number;
  seek: number | null; // voice_id to start in step with
};
export type SoundVolumeMsg = {
  voice_id: number;
  volume: number;
  fade_ms: number;
};
export type SoundListenerMsg = {
  pos: JSVec3;
  right: JSVec3;
  up: JSVec3;
};
// sound_unload: sound id (number)
// sound_stop: voice id (number)

// Worker -> main thread
export type SoundReadyMsg = {
  err: string | null;
};
export type SoundLoadedMsg = {
  id: number;
  err: string | null;
};
// sound_voice_done: voice id (number); a voice stopped playing by itself (reached its end, failed, or never started)

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function voiceDone(voice_id: number): void {
  sendmsg<number>('sound_voice_done', voice_id);
}

function loaded(id: number, err: string | null): void {
  sendmsg<SoundLoadedMsg>('sound_loaded', { id, err });
}

const OUT_CHANNELS = 2;
const OUT_RATE = 48000;
const BUFFERED = 1024; // driver buffer in frames (~21ms)

// Streamed voices keep this much decoded audio ahead of the mixer
const RING_FRAMES = 2 * OUT_RATE;
const LOW_WATER = OUT_RATE; // decode more when less than this is buffered
const PREFILL = OUT_RATE / 4; // buffered before a streamed voice starts playing

type StaticSound = {
  streaming: false;
  data: Float32Array; // at OUT_RATE: one sample per frame if the source was mono, otherwise interleaved stereo
  mono: boolean;
};
type StreamedSound = {
  streaming: true;
  source: OggSource;
  mono: boolean;
  loop_frames: number;
};
const sounds = new Map<number, StaticSound | StreamedSound>(); // sound id -> sound

type Stream = {
  reader: OggFrameReader;
  loop_frames: number;
  ring: Float32Array; // interleaved stereo
  read_idx: number; // frame index in the ring of the next frame to mix
  avail: number; // frames in the ring
  pending: { data: Float32Array; off: number } | null; // decoded frames waiting for room in the ring
  busy: boolean; // the decoder is in use
  dead: boolean; // the voice has been stopped
  closed: boolean; // the decoder has been freed
  underruns: number;
};
// Gains [ LL, LR, RL, RR ], see spatialGains()
type Gains = [number, number, number, number];
type Voice = {
  id: number; // voice handle
  sound_id: number;
  ready: boolean; // false while a streamed voice is still starting; it isn't mixed until then
  data: Float32Array | null; // StaticSound only
  stream: Stream | null; // streamed only
  mono: boolean;
  pos: number; // in frames; the next frame to mix
  vol: number; // current volume
  vol_target: number;
  vol_step: number; // per frame; 0 = not fading
  position: JSVec3 | null;
  spread: number;
  g: Gains | null; // previous gains, if positional
};
const voices: Voice[] = [];

// Listener (right-handed)
const listener: {
  pos: JSVec3;
  right: JSVec3;
  up: JSVec3;
} = {
  pos: [0, 0, 0],
  right: [1, 0, 0],
  up: [0, 1, 0],
};

// Distance model: gain = REF / (REF + ROLLOFF * (dist - REF)) for dist > REF
const REF_DISTANCE = 1;
const ROLLOFF = 0.5;

let playback_stream: Sdl.Audio.AudioPlaybackStream | null = null;
// The WASM decoder can't be used re-entrantly, so static sounds are decoded one at a time, by chaining
// onto `decode_queue`.  It starts out as the decoder's own initialization, so loads that arrive before
// that finishes simply wait for it.
const decoder = new OggVorbisDecoder();
let decode_queue: Promise<void> = decoder.ready.catch(() => {
  // Not reported here: decoding with a decoder that failed to start fails, and that is reported per sound
});

function staticStride(mono: boolean): number {
  return mono ? 1 : OUT_CHANNELS;
}

async function decodeFile(path: string, buf: Buffer): Promise<StaticSound> {
  let decoded;
  try {
    decoded = await decoder.decodeFile(buf);
  } finally {
    await decoder.reset(); // also after a failure, so one bad file can't poison the next
  }
  const { channelData: channel_data, sampleRate: sample_rate, samplesDecoded: samples_decoded } = decoded;
  if (!samples_decoded) {
    throw new Error(`No audio decoded from ${path}`);
  }

  const left = channel_data[0];
  const mono = channel_data.length === 1;
  if (mono && sample_rate === OUT_RATE) {
    return { streaming: false, data: left, mono };
  }
  const right = channel_data[1];
  const stride = staticStride(mono);
  const num_frames = Math.floor(samples_decoded * OUT_RATE / sample_rate);
  const out = new Float32Array(num_frames * stride);
  const last = samples_decoded - 1;
  for (let i = 0; i < num_frames; i++) {
    // Linear resample
    const pos = i * sample_rate / OUT_RATE;
    const i0 = Math.min(Math.floor(pos), last);
    const i1 = Math.min(i0 + 1, last);
    const t = pos - i0;
    out[i * stride] = left[i0] + (left[i1] - left[i0]) * t;
    if (!mono) {
      out[i * stride + 1] = right[i0] + (right[i1] - right[i0]) * t;
    }
  }
  return { streaming: false, data: out, mono };
}

let lead_bytes = 0;
const FRAME_BYTES = OUT_CHANNELS * 4;

// Equal-power pan + distance attenuation for a point source at (px, py, pz).
// Returns [ gain_to_left_output, gain_to_right_output ].
function pointGains(px: number, py: number, pz: number): [number, number] {
  const dx = px - listener.pos[0];
  const dy = py - listener.pos[1];
  const dz = pz - listener.pos[2];
  const dist = Math.hypot(dx, dy, dz);
  let pan = 0; // -1 = hard left, +1 = hard right
  if (dist > 1e-6) {
    const r = listener.right;
    pan = (dx * r[0] + dy * r[1] + dz * r[2]) / dist;
  }
  const gain = dist > REF_DISTANCE ?
    REF_DISTANCE / (REF_DISTANCE + ROLLOFF * (dist - REF_DISTANCE)) :
    1;
  const angle = (pan + 1) * Math.PI / 4; // 0..PI/2
  return [Math.cos(angle) * gain, Math.sin(angle) * gain];
}

// Target gains [ LL, LR, RL, RR ] for a positional voice: how much of the sound's
// left (L*) and right (R*) channel goes to the left (*L) and right (*R) output.
// Mono sounds are a single point source.  Stereo sounds are two virtual point
// sources, `spread` apart, perpendicular to the line of sight from the listener,
// so the stereo image is wide up close and narrows with distance.
function spatialGains(voice: Voice, position: JSVec3): Gains {
  const [x, y, z] = position;
  const vol = voice.vol;
  if (voice.mono) {
    const [l, r] = pointGains(x, y, z);
    return [l * vol, r * vol, 0, 0];
  }

  // Sideways direction (as seen by the listener) = normalize(line_of_sight x up)
  const d = [x - listener.pos[0], y - listener.pos[1], z - listener.pos[2]];
  const u = listener.up;
  let side: JSVec3 = [
    d[1] * u[2] - d[2] * u[1],
    d[2] * u[0] - d[0] * u[2],
    d[0] * u[1] - d[1] * u[0],
  ];
  let len = Math.hypot(side[0], side[1], side[2]);
  if (len < 1e-6) {
    // directly above/below/at the listener
    side = listener.right;
    len = 1;
  }
  const h = voice.spread / 2 / len;
  const [ll, lr] = pointGains(x - side[0] * h, y - side[1] * h, z - side[2] * h);
  const [rl, rr] = pointGains(x + side[0] * h, y + side[1] * h, z + side[2] * h);
  return [ll * vol, lr * vol, rl * vol, rr * vol];
}

// Add `num_frames` frames of a voice into `mix`, advancing its position, volume
// fade and spatial gains.  Returns false once a static voice has played to the end.
// Streamed voices loop forever; if one runs out of decoded audio (an underrun),
// the rest of the block is silent and the voice carries on from where it was.
function mixVoice(voice: Voice, mix: Float32Array, num_frames: number): boolean {
  if (!voice.ready) {
    return true;
  }
  const { stream } = voice;
  const data = voice.data;
  const stride = stream ? OUT_CHANNELS : staticStride(voice.mono); // floats per frame in the buffer mixed from
  const total = stream ? stream.loop_frames : data ? data.length / stride : 0;
  if (!total) {
    return false;
  }

  // Advance the volume fade by one block; gains ramp linearly across the block
  const v0 = voice.vol;
  if (voice.vol_step !== 0) {
    let v = v0 + voice.vol_step * num_frames;
    if (voice.vol_step > 0 ? v >= voice.vol_target : v <= voice.vol_target) {
      v = voice.vol_target;
      voice.vol_step = 0;
    }
    voice.vol = v;
  }

  // Per-frame gain state, carried across the segments of a block
  let ll = 0;
  let lr = 0;
  let rl = 0;
  let rr = 0;
  let d0 = 0;
  let d1 = 0;
  let d2 = 0;
  let d3 = 0;
  let vv = v0;
  let dv = 0;
  const position = voice.position;
  const positional = position !== null;
  if (positional) {
    // Spatial gains also ramp across the block so listener or distance changes
    // don't cause zipper noise.  (They include the voice's volume.)
    const t = spatialGains(voice, position);
    const g = voice.g || t; // first block: no ramp
    [ll, lr, rl, rr] = g;
    d0 = (t[0] - g[0]) / num_frames;
    d1 = (t[1] - g[1]) / num_frames;
    d2 = (t[2] - g[2]) / num_frames;
    d3 = (t[3] - g[3]) / num_frames;
    voice.g = t;
  } else {
    dv = (voice.vol - v0) / num_frames;
  }

  let pos = voice.pos;
  let i = 0;
  while (i < num_frames) {
    // The next run of frames that can be mixed from one contiguous buffer
    let buf: Float32Array;
    let idx: number;
    let n: number;
    if (stream) {
      n = Math.min(num_frames - i, stream.avail, RING_FRAMES - stream.read_idx);
      if (n <= 0) {
        stream.underruns++;
        break;
      }
      buf = stream.ring;
      idx = stream.read_idx;
    } else {
      n = Math.min(num_frames - i, total - pos);
      buf = data!;
      idx = pos;
    }

    if (positional) {
      for (let k = 0; k < n; k++) {
        const l = buf[(idx + k) * stride];
        const r = buf[(idx + k) * stride + stride - 1]; // same as l for mono
        const o = (i + k) * 2;
        mix[o] += l * ll + r * rl;
        mix[o + 1] += l * lr + r * rr;
        ll += d0;
        lr += d1;
        rl += d2;
        rr += d3;
      }
    } else {
      for (let k = 0; k < n; k++) {
        const o = (i + k) * 2;
        mix[o] += buf[(idx + k) * stride] * vv;
        mix[o + 1] += buf[(idx + k) * stride + stride - 1] * vv;
        vv += dv;
      }
    }

    i += n;
    if (stream) {
      stream.read_idx = (stream.read_idx + n) % RING_FRAMES;
      stream.avail -= n;
      pos = (pos + n) % total;
    } else {
      pos += n;
      if (pos >= total) {
        return false;
      }
    }
  }
  voice.pos = pos;
  return true;
}

// ---- Streamed voices ----

// Append the decoded frames waiting in `stream.pending` to the ring, as far as there's room
function movePending(stream: Stream): void {
  const p = stream.pending;
  if (!p) {
    return;
  }
  const total = p.data.length / 2;
  let n = Math.min(total - p.off, RING_FRAMES - stream.avail);
  stream.avail += n;
  let w = (stream.read_idx + stream.avail - n) % RING_FRAMES;
  while (n > 0) {
    const run = Math.min(n, RING_FRAMES - w);
    stream.ring.set(p.data.subarray(p.off * 2, (p.off + run) * 2), w * 2);
    p.off += run;
    w = (w + run) % RING_FRAMES;
    n -= run;
  }
  if (p.off >= total) {
    stream.pending = null;
  }
}

function closeStream(stream: Stream): void {
  stream.dead = true;
  if (!stream.closed && !stream.busy) {
    stream.closed = true;
    stream.reader.close();
  }
}

// Remove a playing voice, freeing its decoder if it has one
function removeVoice(index: number): void {
  const { stream } = voices[index];
  if (stream) {
    closeStream(stream);
  }
  voices.splice(index, 1);
}

function failVoice(voice: Voice, error: unknown): void {
  console.error('Audio stream failed:', error);
  if (voice.stream) {
    closeStream(voice.stream);
  }
  const index = voices.indexOf(voice);
  if (index !== -1) {
    voices.splice(index, 1);
    voiceDone(voice.id);
  }
}

// Keep a streamed voice's ring topped up.  Decoding happens here, in small steps,
// whenever less than LOW_WATER is buffered.
function pumpStream(voice: Voice): void {
  const { stream } = voice;
  if (!stream || stream.dead) {
    return;
  }
  movePending(stream);
  if (stream.busy || stream.pending || stream.avail >= LOW_WATER || !voice.ready) {
    return;
  }
  stream.busy = true;
  stream.reader.read().then((block) => {
    stream.busy = false;
    if (stream.dead) {
      closeStream(stream);
      return;
    }
    stream.pending = { data: block, off: 0 };
    pumpStream(voice);
  }, (error) => {
    stream.busy = false;
    failVoice(voice, error);
  });
}

// Get a streamed voice going: set up its decoder, start at the right position, and
// buffer a little audio before it becomes audible.  `seek_id` is the handle of a voice
// to start in step with.
async function startStreamVoice(voice: Voice, sound: StreamedSound, seek_id: number | null): Promise<void> {
  const { stream } = voice;
  if (!stream) {
    return;
  }
  stream.busy = true; // the decoder is in use until we finish; closeStream() waits for that
  try {
    await stream.reader.ready;
    if (stream.dead) {
      return;
    }

    // The position to start at is read now, and nothing but promise callbacks run
    // until the voice is marked ready below (no timers or messages, so no mixing),
    // so it stays exactly in step with the voice it was started from.
    let frame = 0;
    if (seek_id !== null) {
      const other = voices.find((v) => v.id === seek_id);
      if (other && other.ready) {
        frame = other.pos;
      }
    }
    frame %= sound.loop_frames;
    await stream.reader.start(frame);
    while (stream.avail < PREFILL) {
      stream.pending = {
        data: await stream.reader.read(), // eslint-disable-line no-await-in-loop
        off: 0,
      };
      movePending(stream);
    }
    if (stream.dead) {
      return;
    }
    voice.pos = frame;
    voice.ready = true;
  } catch (error) {
    failVoice(voice, error);
  } finally {
    stream.busy = false;
    if (stream.dead) {
      closeStream(stream);
    } // stopped while starting
  }
}

// Mix active voices and top up the stream to ~2 driver buffers of lead.
// When no voices are active we write nothing, so the stream drains to silence
// and a newly started sound only waits for the driver buffer, not extra lead.
function render(): void {
  if (!voices.some((voice) => voice.ready)) {
    return;
  }
  if (!playback_stream) {
    return;
  }
  const num_bytes = lead_bytes - playback_stream.queued;
  if (num_bytes < FRAME_BYTES) {
    return;
  }
  const num_frames = Math.floor(num_bytes / FRAME_BYTES);
  const mix = new Float32Array(num_frames * OUT_CHANNELS); // zero-filled

  for (let v = voices.length - 1; v >= 0; v--) {
    if (!mixVoice(voices[v], mix, num_frames)) {
      voiceDone(voices[v].id);
      voices.splice(v, 1);
    }
  }
  for (let v = 0; v < voices.length; v++) {
    if (voices[v].stream) {
      pumpStream(voices[v]);
    }
  }

  for (let i = 0; i < mix.length; i++) {
    // Hard clip to avoid wrap-around/garbage when many loud voices overlap
    if (mix[i] > 1) {
      mix[i] = 1;
    } else if (mix[i] < -1) {
      mix[i] = -1;
    }
  }
  playback_stream.putData(Buffer.from(mix.buffer));
}


function init(): void {
  const stream = sdl.audio.playback.openDevice(null, {
    channels: OUT_CHANNELS,
    frequency: OUT_RATE,
    format: 'f32le',
    buffered: BUFFERED,
  });
  const { buffered, frequency } = stream.device;
  if (!buffered || !frequency) {
    throw new Error('Audio device did not report its buffer size');
  }
  lead_bytes = Math.ceil(2 * buffered / frequency * OUT_RATE) * FRAME_BYTES;
  stream.play();
  playback_stream = stream;
  setInterval(render, 1);
}

// Sent to only one worker, so other workers never open the audio device
addHandler('sound_init', function () {
  if (playback_stream) {
    return;
  }
  let err = null;
  try {
    init();
  } catch (e) {
    err = errorMessage(e);
  }
  sendmsg<SoundReadyMsg>('sound_ready', { err });
});

addHandler<SoundLoadMsg>('sound_load', function (msg) {
  fs.readFile(msg.path, function (err, buf) {
    if (err) {
      return void loaded(msg.id, errorMessage(err));
    }
    if (msg.loop) {
      // Streamed: keep only the compressed file, decode as it plays
      let source;
      try {
        source = indexOgg(buf, OUT_RATE);
      } catch (e) {
        return void loaded(msg.id, errorMessage(e));
      }
      sounds.set(msg.id, { streaming: true, source, mono: source.channels === 1, loop_frames: source.loop_frames });
      return void loaded(msg.id, null);
    }
    // Waits for the decoder to be ready, and for earlier files to finish
    decode_queue = decode_queue.then(async () => {
      try {
        sounds.set(msg.id, await decodeFile(msg.path, buf));
      } catch (e) {
        return void loaded(msg.id, errorMessage(e));
      }
      loaded(msg.id, null);
    });
  });
});

// Release the sound, and stop its voices (they hold its data)
// Note: unloading one that is still loading leaks
addHandler<number>('sound_unload', function (id) {
  sounds.delete(id);
  for (let v = voices.length - 1; v >= 0; v--) {
    if (voices[v].sound_id === id) {
      voiceDone(voices[v].id);
      removeVoice(v);
    }
  }
});

addHandler<SoundPlayMsg>('sound_play', function (msg) {
  const sound = sounds.get(msg.sound_id);
  if (!sound || !playback_stream) {
    // not loaded (yet, or failed), or no audio device
    return void voiceDone(msg.voice_id);
  }

  const voice: Voice = {
    id: msg.voice_id,
    sound_id: msg.sound_id,
    ready: !sound.streaming,
    data: sound.streaming ? null : sound.data,
    stream: null,
    mono: sound.mono,
    pos: 0,
    vol: msg.volume,
    vol_target: msg.volume,
    vol_step: 0,
    position: msg.position,
    spread: msg.spread,
    g: null,
  };

  if (sound.streaming) {
    voice.stream = {
      reader: new OggFrameReader(sound.source),
      loop_frames: sound.loop_frames,
      ring: new Float32Array(RING_FRAMES * OUT_CHANNELS),
      read_idx: 0,
      avail: 0,
      pending: null,
      busy: false,
      dead: false,
      closed: false,
      underruns: 0,
    };
    // Registered right away so that later messages (volume changes) find it; it
    // isn't mixed until it has started.
    voices.push(voice);
    startStreamVoice(voice, sound, msg.seek);
    return;
  }

  // Start at the current position of another voice, if it's still playing.
  // (Messages are handled between mix blocks, so the two voices stay in step.)
  if (msg.seek !== null) {
    const other = voices.find((v) => v.id === msg.seek);
    if (other && other.ready) {
      voice.pos = other.pos;
    }
  }
  if (voice.pos >= sound.data.length / staticStride(sound.mono)) {
    // already past the end of this sound
    return void voiceDone(voice.id);
  }
  voices.push(voice);
});

addHandler<SoundVolumeMsg>('sound_volume', function (msg) {
  const voice = voices.find((v) => v.id === msg.voice_id);
  if (!voice) {
    // already finished, or never started
    return;
  }
  const fade_frames = Math.round(msg.fade_ms / 1000 * OUT_RATE);
  voice.vol_target = msg.volume;
  if (fade_frames < 1) {
    voice.vol = msg.volume;
    voice.vol_step = 0;
  } else {
    voice.vol_step = (msg.volume - voice.vol) / fade_frames;
  }
});

addHandler<number>('sound_stop', function (voice_id) {
  const index = voices.findIndex((v) => v.id === voice_id);
  if (index !== -1) {
    // no sound_voice_done: the main thread already knows, it asked for this
    removeVoice(index);
  }
});

addHandler<SoundListenerMsg>('sound_listener', function (msg) {
  listener.pos = msg.pos;
  listener.right = msg.right;
  listener.up = msg.up;
});

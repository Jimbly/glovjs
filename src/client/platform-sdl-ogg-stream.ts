/* eslint no-await-in-loop:off */

// Streaming Ogg Vorbis decoding with sample-accurate seeking and looping.
//
// Only the compressed file is kept in memory.  indexOgg() scans the Ogg page
// structure once (cheap, no decoding); an OggFrameReader then decodes just the
// pages it needs, resamples them to the output rate, and hands out stereo float
// frames.  Starting at an arbitrary position decodes only the header pages and
// the one page that contains it, so seeking is fast even deep into a long song.
import { type OggVorbisDecodedAudio, OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';

export type OggPage = {
  offset: number;
  size: number;
  flags: number;
  granule: number; // -1 if no packet ends on the page
};

// The page structure of an indexed Ogg Vorbis file, see indexOgg()
export type OggSource = {
  buf: Buffer;
  channels: number;
  rate: number; // sample rate of the file
  header_end: number; // byte offset where the audio pages start
  pages: OggPage[]; // audio pages
  total: number; // length in samples per channel (at `rate`)
  out_rate: number;
  loop_frames: number; // length of the loop, in output frames
};

// Scan the page structure of an Ogg Vorbis file (a single logical stream).
// `out_rate` is the sample rate of the frames the readers will produce.
export function indexOgg(buf: Buffer, out_rate: number): OggSource {
  const pages: OggPage[] = []; // audio pages: { offset, size, flags, granule }
  let header_end = -1; // byte offset where the audio pages start
  let completed_packets = 0;
  let channels = 0;
  let rate = 0;

  let offset = 0;
  while (offset + 27 <= buf.length) {
    if (buf.toString('latin1', offset, offset + 4) !== 'OggS') {
      throw new Error('Not a valid Ogg file');
    }
    const num_segments = buf[offset + 26];
    let body_size = 0;
    let packets_ending_here = 0;
    for (let i = 0; i < num_segments; i++) {
      const lacing = buf[offset + 27 + i];
      body_size += lacing;
      if (lacing < 255) {
        packets_ending_here++;
      } // a lacing value of 255 means the packet continues
    }
    const size = 27 + num_segments + body_size;
    if (offset + size > buf.length) {
      break;
    } // truncated last page

    if (offset === 0) {
      const id = 27 + num_segments;
      if (buf[id] !== 1 || buf.toString('latin1', id + 1, id + 7) !== 'vorbis') {
        throw new Error('Not an Ogg Vorbis file');
      }
      channels = buf[id + 11];
      rate = buf.readUInt32LE(id + 12);
    }

    if (header_end < 0) {
      // The first three packets (identification, comment, setup) are the headers
      completed_packets += packets_ending_here;
      if (completed_packets >= 3) {
        header_end = offset + size;
      }
    } else {
      pages.push({
        offset,
        size,
        flags: buf[offset + 5],
        granule: Number(buf.readBigInt64LE(offset + 6)), // -1 if no packet ends on this page
      });
    }
    offset += size;
  }

  if (header_end < 0 || !pages.length || !channels || !rate) {
    throw new Error('Ogg Vorbis file is truncated or has no audio');
  }
  const total = pages[pages.length - 1].granule; // length in samples per channel
  if (!(total > 0)) {
    throw new Error('Ogg Vorbis file has no valid length');
  }

  return {
    buf,
    channels,
    rate,
    header_end,
    pages,
    total,
    out_rate,
    loop_frames: Math.floor(total * out_rate / rate), // length of the loop, in output frames
  };
}

const CHUNK_BYTES = 8 * 1024; // roughly how much compressed data to decode per read()

// Reads a looping stream of interleaved stereo float frames at `source.out_rate`
// from an indexed file.  Owns one decoder, so each concurrently playing stream
// needs its own reader.
//
//   const reader = new OggFrameReader(source)
//   await reader.ready
//   await reader.start(frame)      // position the next frame to be read
//   const block = await reader.read() // Float32Array, interleaved L/R; call again for the next block
//
// Reading wraps around at the end of the file: the next block after the last
// frame starts again at frame 0.
export class OggFrameReader {
  src: OggSource;
  decoder: OggVorbisDecoder;
  ready: Promise<void>;
  dirty: boolean;
  ended: boolean;
  next_page: number;
  queued: Float32Array | null;
  buf_l: Float32Array;
  buf_r: Float32Array;
  buf_start: number;
  pos: number;
  j: number;

  constructor(source: OggSource) {
    this.src = source;
    this.decoder = new OggVorbisDecoder();
    this.ready = this.decoder.ready;
    this.dirty = false; // the decoder holds the state of a stream in progress
    this.ended = true; // no segment in progress: read() starts one at frame 0
    this.next_page = 0;
    this.queued = null; // output frames produced by start(), returned by the first read()

    // Decoded source samples [buf_start, buf_start + buf_len) kept for resampling
    this.buf_l = new Float32Array(0);
    this.buf_r = new Float32Array(0);
    this.buf_start = 0;
    this.pos = 0; // stream position of the next decoded sample to arrive
    this.j = 0; // index of the next output frame to produce
  }

  close(): void {
    this.decoder.free();
  }

  // Position the reader so the next frame it returns is output frame `frame`
  // (in [0, loop_frames)).  Only decodes enough to produce the first block.
  async start(frame: number): Promise<void> {
    const { src } = this;
    if (this.dirty) {
      await this.decoder.reset();
      this.dirty = false;
    }
    frame = Math.max(0, Math.min(src.loop_frames - 1, Math.floor(frame)));
    const target = Math.min(src.total - 1, Math.floor(frame * src.rate / src.out_rate));

    // Decoding can begin at any page that starts a fresh packet.  Take the last one
    // that ends at or before the target, so that decoding begins at or before it.
    let k = 0;
    for (let i = src.pages.length - 1; i > 0; i--) {
      const page = src.pages[i];
      if (page.granule >= 0 && page.granule <= target && !(page.flags & 1) && src.pages[i - 1].granule >= 0) {
        k = i;
        break;
      }
    }
    const prev_granule = k === 0 ? 0 : src.pages[k - 1].granule;

    this.dirty = true;
    await this.decoder.decode(src.buf.subarray(0, src.header_end));
    const page = src.pages[k];
    await this.decoder.decode(src.buf.subarray(page.offset, page.offset + page.size));
    this.next_page = k + 1;
    this.ended = false;

    // The decoder emits a page's samples when it sees the next one, and the first
    // packet on a mid-stream page produces nothing (it only primes the overlap).
    // So we don't know where the first sample returned belongs, except that the
    // stream position at the end of this page is its granule.  Work it out from
    // the number of samples the page really yields.
    const first = await this._feed(0); // feeds exactly one more page (or flushes)
    const yielded = first.result.samplesDecoded;
    this.pos = prev_granule + (page.granule - prev_granule - yielded);

    this.buf_l = new Float32Array(0);
    this.buf_r = new Float32Array(0);
    this.buf_start = Math.floor(frame * src.rate / src.out_rate);
    this.j = frame;
    this.queued = this._resample(first.result, first.final);
  }

  // Feed the decoder roughly `max_bytes` of whole pages (at least one) and return
  // what it produced.  Past the last page this flushes the final one.
  async _feed(max_bytes: number): Promise<{ result: OggVorbisDecodedAudio; final: boolean }> {
    const { src } = this;
    if (this.next_page >= src.pages.length) {
      const result = await this.decoder.flush(); // also resets the decoder
      this.dirty = false;
      return { result, final: true };
    }
    const first = this.next_page;
    let end = first;
    let bytes = 0;
    while (end < src.pages.length && (end === first || bytes + src.pages[end].size <= max_bytes)) {
      bytes += src.pages[end].size;
      end++;
    }
    const offset = src.pages[first].offset;
    const result = await this.decoder.decode(src.buf.subarray(offset, offset + bytes));
    this.next_page = end;
    return { result, final: false };
  }

  // Linearly resample decoded samples to output frames.  `final` means no more
  // samples follow.  Returns the new frames (possibly none).
  _resample(result: OggVorbisDecodedAudio, final: boolean): Float32Array {
    const { src } = this;
    const n = result.samplesDecoded;
    const left = result.channelData[0];
    const right = result.channelData[1] || left; // mono -> both channels

    // Append the new samples, skipping any before the first one we need
    let skip = 0;
    if (!this.buf_l.length && this.pos < this.buf_start) {
      skip = Math.min(n, this.buf_start - this.pos);
    }
    if (n > skip) {
      const len = this.buf_l.length;
      const new_l = new Float32Array(len + n - skip);
      const new_r = new Float32Array(len + n - skip);
      new_l.set(this.buf_l);
      new_r.set(this.buf_r);
      new_l.set(left.subarray(skip, n), len);
      new_r.set(right.subarray(skip, n), len);
      this.buf_l = new_l;
      this.buf_r = new_r;
    }
    this.pos += n;

    const { buf_l, buf_r, buf_start } = this;
    const len = buf_l.length;
    const out = new Float32Array((Math.ceil(len * src.out_rate / src.rate) + 2) * 2);
    let o = 0;
    while (this.j < src.loop_frames) {
      const p = this.j * src.rate / src.out_rate;
      const i0 = Math.floor(p) - buf_start;
      if (i0 >= len) {
        break;
      }
      let i1 = i0 + 1;
      if (i1 >= len) {
        if (!final) {
          break;
        } // need the next sample to interpolate
        i1 = i0;
      }
      const t = p - Math.floor(p);
      out[o++] = buf_l[i0] + (buf_l[i1] - buf_l[i0]) * t;
      out[o++] = buf_r[i0] + (buf_r[i1] - buf_r[i0]) * t;
      this.j++;
    }

    // Keep only the samples that later frames still need
    if (this.j < src.loop_frames) {
      const keep_from = Math.min(len, Math.max(0, Math.floor(this.j * src.rate / src.out_rate) - buf_start));
      this.buf_l = buf_l.slice(keep_from);
      this.buf_r = buf_r.slice(keep_from);
      this.buf_start = buf_start + keep_from;
    } else {
      this.ended = true; // the loop is complete, whatever the decoder has left over
    }
    if (final) {
      this.ended = true;
    }

    return out.subarray(0, o);
  }

  // Return (and clear) the frames produced by start(), if any
  _takeQueued(): Float32Array | null {
    const block = this.queued;
    this.queued = null;
    return block;
  }

  // Decode and return the next block of frames (never empty).
  async read(): Promise<Float32Array> {
    const first = this._takeQueued();
    if (first?.length) {
      return first;
    }
    for (;;) {
      if (this.ended) {
        await this.start(0);
      } // wrap around
      const queued = this._takeQueued();
      if (queued) {
        if (queued.length) {
          return queued;
        }
        continue;
      }
      const { result, final } = await this._feed(CHUNK_BYTES);
      const block = this._resample(result, final);
      if (block.length) {
        return block;
      }
    }
  }
}

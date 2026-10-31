// ===========================================
// /admin/ops intake: video container sniffing tests
// ===========================================
// Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { codecLabel, formatDuration, frameTimes, readWebmCodec, sniffVideo } from './video-meta'

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const box = (type: string, ...payload: number[][]) => {
  const body = payload.flat()
  return [...u32(8 + body.length), ...Array.from(type, (c) => c.charCodeAt(0)), ...body]
}
const zeros = (n: number) => new Array(n).fill(0)

/** A minimal MOV: ftyp, a big mdat, then the moov at the end (as an iPhone writes it). */
function mov(codec: string, w: number, h: number, scale: number, duration: number, mdatBytes: number, upright = false) {
  const mvhd = box('mvhd', [0, 0, 0, 0], zeros(8), u32(scale), u32(duration), zeros(80))
  // The display matrix (36 bytes) ends where width starts; upright = a quarter turn (a 0, b 1).
  const matrix = upright ? [...u32(0), ...u32(65536), ...u32(0), ...u32(-65536 >>> 0), ...zeros(20)] : zeros(36)
  const tkhd = box('tkhd', [0, 0, 0, 0], zeros(36), matrix, u32(w * 65536), u32(h * 65536))
  const audio = box(
    'trak',
    box(
      'mdia',
      box(
        'hdlr',
        zeros(8),
        Array.from('soun', (c) => c.charCodeAt(0)),
        zeros(12)
      )
    )
  )
  const stsd = box(
    'stsd',
    [0, 0, 0, 0],
    u32(1),
    u32(86),
    Array.from(codec, (c) => c.charCodeAt(0)),
    zeros(78)
  )
  const video = box(
    'trak',
    tkhd,
    box(
      'mdia',
      box(
        'hdlr',
        zeros(8),
        Array.from('vide', (c) => c.charCodeAt(0)),
        zeros(12)
      ),
      box('minf', box('stbl', stsd))
    )
  )
  const moov = box('moov', mvhd, audio, video)
  return new Uint8Array([
    ...box(
      'ftyp',
      Array.from('qt  ', (c) => c.charCodeAt(0))
    ),
    ...u32(8 + mdatBytes),
    ...Array.from('mdat', (c) => c.charCodeAt(0)),
    ...zeros(mdatBytes),
    ...moov,
  ])
}

const reader = (b: Uint8Array) => {
  const reads: [number, number][] = []
  return {
    reads,
    read: async (s: number, e: number) => (reads.push([s, e]), b.slice(s, e)),
  }
}

test('sniffVideo reads an HEVC MOV with the moov after the mdat', async () => {
  const file = mov('hvc1', 1920, 1080, 600, 13_200, 200_000)
  const r = reader(file)
  const meta = await sniffVideo(r.read, file.length)
  assert.deepEqual(meta, {
    codec: 'hvc1',
    duration: 22,
    width: 1920,
    height: 1080,
  })
  // It jumped over the mdat instead of reading it.
  assert.ok(r.reads.every(([s, e]) => e - s < 150_000))
})

test('sniffVideo reads an H.264 MP4 and skips the audio track', async () => {
  const file = mov('avc1', 1280, 720, 30_000, 270_000, 10)
  assert.deepEqual(await sniffVideo(reader(file).read, file.length), {
    codec: 'avc1',
    duration: 9,
    width: 1280,
    height: 720,
  })
})

test('a quarter-turn matrix swaps width and height (iPhone portrait)', async () => {
  const file = mov('hvc1', 1920, 1080, 600, 6000, 10, true)
  const meta = await sniffVideo(reader(file).read, file.length)
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1920)
})

test('sniffVideo never throws on junk', async () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(await sniffVideo(reader(junk).read, junk.length), {
    codec: null,
    duration: null,
    width: null,
    height: null,
  })
  const empty = new Uint8Array()
  assert.deepEqual(await sniffVideo(reader(empty).read, 0), {
    codec: null,
    duration: null,
    width: null,
    height: null,
  })
})

test('WebM codec comes from its CodecID', async () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...Array.from('....V_VP9....', (c) => c.charCodeAt(0))])
  assert.equal(readWebmCodec(webm), 'vp9')
  assert.equal((await sniffVideo(reader(webm).read, webm.length)).codec, 'vp9')
})

test('codecLabel, formatDuration, frameTimes', () => {
  assert.equal(codecLabel('hvc1'), 'HEVC')
  assert.equal(codecLabel('hev1'), 'HEVC')
  assert.equal(codecLabel('avc1'), 'H.264')
  assert.equal(codecLabel(null), 'unknown codec')
  assert.equal(formatDuration(42.4), '0:42')
  assert.equal(formatDuration(3910), '1:05:10')
  assert.equal(formatDuration(null), '')
  assert.deepEqual(frameTimes(22), [1, 11, 21])
  // A 1.2 second clip: every frame inside the clip.
  assert.ok(frameTimes(1.2).every((t) => t >= 0 && t < 1.2))
  assert.deepEqual(frameTimes(0), [0])
})

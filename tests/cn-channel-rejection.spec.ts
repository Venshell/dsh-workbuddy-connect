/**
 * CN channel-level rejection pins.
 *
 * The CN gateway reports a whole class of objections — a rejected `role`, a
 * missing conversation id, a harness-branded prompt, a channel it does not
 * recognise — as `400` / `code 11128` with the single localized sentence
 * 「请求被拦截，请重新发送」. Two consequences are pinned here:
 *
 * 1. A chat carries the full per-request identity set the official desktop
 *    client sends (`resources/app.asar`: `X-Request-ID`, `X-Private-Data`,
 *    `x-codebuddy-request`, and the W3C/B3 trace family), so the request cannot
 *    be missing a header the gateway is entitled to check. The trio from #139 is
 *    still there; this only widens the same header block.
 * 2. The surfaced error keeps the upstream's own `code`/`msg`, because the
 *    display sentence alone says nothing about which rule fired.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkBuddyCredential } from '../src/auth.ts'
import { describeUpstreamRejection, WorkBuddyUpstreamClient } from '../src/upstream.ts'
import type { ChatIdentity } from '../src/client-identity.ts'

const CN: WorkBuddyCredential = {
  accessToken: 'at', refreshToken: 'rt', expiresAtMs: 0,
  domain: 'www.codebuddy.cn', uid: 'uid-1', source: 'desktop',
}

const IDENTITY: ChatIdentity = { clientVersion: '5.5.6', cliVersion: '2.137.1' }

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const HEX_16 = /^[0-9a-f]{32}$/
const HEX_8 = /^[0-9a-f]{16}$/

function client(): WorkBuddyUpstreamClient {
  return new WorkBuddyUpstreamClient({ resolveChatIdentity: async () => IDENTITY })
}

function fakeResponse(body: string, ok = true, status = 200): Response {
  return { ok, status, text: () => Promise.resolve(body) } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function captureFetch(body: string, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => fakeResponse(body, ok, status))
  vi.stubGlobal('fetch', fetchMock)
  const all = () => fetchMock.mock.calls as unknown as [string, RequestInit][]
  return {
    all,
    last: () => {
      expect(fetchMock).toHaveBeenCalled()
      const calls = all()
      return calls[calls.length - 1]!
    },
  }
}

const HEADERS = ['X-Request-ID', 'X-Private-Data', 'x-codebuddy-request', 'traceparent', 'b3', 'X-B3-TraceId', 'X-B3-ParentSpanId', 'X-B3-SpanId', 'X-B3-Sampled', 'X-Trace-ID'] as const

describe('chat carries the official client’s per-request identity set', () => {
  it('sends every header on CN and on the global chat alike', async () => {
    for (const credential of [CN, { ...CN, domain: 'www.workbuddy.ai' }]) {
      const wire = captureFetch('{}')
      await client().chatStream(credential, JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
      const headers = wire.last()[1].headers as Record<string, string>
      for (const name of HEADERS) expect(headers[name], name).toBeDefined()
      expect(headers['X-Request-ID']).toMatch(UUID_V4)
      expect(headers['X-Private-Data']).toBe('true')
      expect(headers['x-codebuddy-request']).toBe('1')
      expect(headers['X-B3-Sampled']).toBe('1')
    }
  })

  it('keeps the trace family internally consistent', async () => {
    const wire = captureFetch('{}')
    await client().chatStream(CN, JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
    const headers = wire.last()[1].headers as Record<string, string>
    const traceId = headers['X-Trace-ID'] as string
    const spanId = headers['X-B3-SpanId'] as string
    expect(traceId).toMatch(HEX_16)
    expect(spanId).toMatch(HEX_8)
    expect(headers['X-B3-TraceId']).toBe(traceId)
    expect(headers['traceparent']).toBe(`00-${traceId}-${spanId}-01`)
    expect(headers['b3']).toBe(`${traceId}-${spanId}-1-${headers['X-B3-ParentSpanId']}`)
  })

  it('mints a fresh request id and trace per call', async () => {
    const wire = captureFetch('{}')
    const upstream = client()
    const body = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })
    await upstream.chatStream(CN, body)
    const first = wire.last()[1].headers as Record<string, string>
    await upstream.chatStream(CN, body)
    const second = wire.last()[1].headers as Record<string, string>
    expect(second['X-Request-ID']).not.toBe(first['X-Request-ID'])
    expect(second['X-Trace-ID']).not.toBe(first['X-Trace-ID'])
  })

  it('never carries the refresh token, on any header', async () => {
    const wire = captureFetch('{}')
    await client().chatStream(CN, JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
    const headers = wire.last()[1].headers as Record<string, string>
    // The security red line: the refresh token never leaves the refresh call.
    expect(Object.keys(headers).some(name => /refresh/i.test(name))).toBe(false)
    expect(Object.values(headers)).not.toContain('rt')
  })
})

describe('the identity set stays off every other endpoint (blast-radius pin)', () => {
  it('refresh never carries it', async () => {
    const wire = captureFetch(JSON.stringify({ code: 0, msg: 'ok', data: { accessToken: 'next' } }))
    await client().refreshToken(CN)
    for (const [, init] of wire.all()) {
      const headers = init.headers as Record<string, string>
      for (const name of HEADERS) expect(headers[name]).toBeUndefined()
    }
  })

  it('catalog and billing never carry it', async () => {
    const wire = captureFetch(JSON.stringify({
      code: 0, msg: 'ok',
      data: {
        models: [{ id: 'm', name: 'M', maxInputTokens: 100, maxOutputTokens: 10 }],
        agents: [{ name: 'cli', models: ['m'] }],
        Response: { Data: { Accounts: [] } },
      },
    }))
    const upstream = client()
    await upstream.fetchModels(CN)
    await upstream.fetchCredits(CN)
    for (const [, init] of wire.all()) {
      const headers = init.headers as Record<string, string>
      for (const name of HEADERS) expect(headers[name]).toBeUndefined()
    }
  })
})

describe('describeUpstreamRejection keeps the machine fields', () => {
  it('reports the display sentence plus code and msg for a CN 11128', () => {
    const raw = JSON.stringify({
      code: 11128,
      msg: 'Illegal API invocation from an unapproved channel',
      displayMsg: { zh: '请求被拦截，请重新发送', en: 'Request intercepted, please resend' },
    })
    expect(describeUpstreamRejection(raw))
      .toBe('请求被拦截，请重新发送 (code 11128: Illegal API invocation from an unapproved channel)')
  })

  it('does not repeat a msg that is already the whole sentence', () => {
    const raw = JSON.stringify({ code: 11128, msg: '请求被拦截，请重新发送' })
    expect(describeUpstreamRejection(raw)).toBe('请求被拦截，请重新发送 (code 11128)')
  })

  it('still answers with the display sentence when the envelope carries no code', () => {
    const raw = JSON.stringify({ msg: 'blocked', displayMsg: { zh: '请求被拦截，请重新发送' } })
    expect(describeUpstreamRejection(raw)).toBe('请求被拦截，请重新发送 (blocked)')
  })

  it('adds the code when the only sentence available is the raw msg', () => {
    const raw = JSON.stringify({ code: 11150, msg: 'only reasoning model' })
    expect(describeUpstreamRejection(raw)).toBe('only reasoning model (code 11150)')
  })

  it('returns undefined for a body that is not an envelope', () => {
    expect(describeUpstreamRejection('502 Bad Gateway')).toBeUndefined()
    expect(describeUpstreamRejection('{ invalid json')).toBeUndefined()
  })
})

describe('the wire dump stays off unless asked for', () => {
  /** A throwaway file path per test, so the suite never touches the real tree. */
  function dumpPath(): string {
    return join(mkdtempSync(join(tmpdir(), 'wb-wire-')), 'wire.jsonl')
  }

  afterEach(() => {
    delete process.env['DSH_WORKBUDDY_WIRE_DUMP']
  })

  it('writes nothing when the variable is unset', async () => {
    const path = dumpPath()
    captureFetch('{"code":11128,"msg":"blocked"}', false, 400)
    await client().chatStream(CN, JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
    expect(existsSync(path)).toBe(false)
  })

  it('records the body that was sent, and only on failure', async () => {
    const path = dumpPath()
    process.env['DSH_WORKBUDDY_WIRE_DUMP'] = path
    const okFetch = captureFetch('{}')
    await client().chatStream(CN, JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
    expect(existsSync(path)).toBe(false)
    expect(okFetch.all().length).toBe(1)

    captureFetch('{"code":11128,"msg":"请求被拦截，请重新发送"}', false, 400)
    await client().chatStream(CN, JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
    const line = readFileSync(path, 'utf8').trim()
    const record = JSON.parse(line) as { status: number; body: string; response: string; at: string }
    expect(record.status).toBe(400)
    expect(record.response).toContain('11128')
    // The recorded body is the post-preparation one, which is what the probe replays.
    expect(JSON.parse(record.body).messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('never records a header or the access token', async () => {
    const path = dumpPath()
    process.env['DSH_WORKBUDDY_WIRE_DUMP'] = path
    captureFetch('{"code":11128,"msg":"blocked"}', false, 400)
    await client().chatStream(CN, JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
    const line = readFileSync(path, 'utf8')
    // Headers are not part of the record at all, so the bearer cannot leak.
    for (const name of ['Authorization', 'Bearer', 'X-Conversation-ID', 'Content-Type', 'X-Request-ID']) {
      expect(line, name).not.toContain(name)
    }
  })
})

/**
 * `11101` — the endpoint's streaming precondition.
 *
 * Measured on a live CN account: five bodies that differ only in prompt content
 * all came back `400` / `11101` "Non-stream chat request is currently not
 * supported", i.e. refused before the messages were read. `chatStream` only
 * ever returns SSE, so the flag belongs to the client boundary rather than to
 * each caller's discipline.
 */
describe('chat always asks for a streaming answer', () => {
  const PLAIN = { model: 'm', messages: [{ role: 'user', content: 'hi' }] }

  it('adds stream: true on CN and on the global gateway alike', async () => {
    for (const credential of [CN, { ...CN, domain: 'www.workbuddy.ai' }]) {
      const wire = captureFetch('{}')
      await client().chatStream(credential, JSON.stringify(PLAIN))
      const sent = JSON.parse(String(wire.last()[1].body)) as { stream?: unknown }
      expect(sent.stream).toBe(true)
    }
  })

  it('leaves an already-streaming body byte-identical', async () => {
    const source = JSON.stringify({ ...PLAIN, stream: true })
    const wire = captureFetch('{}')
    await client().chatStream(CN, source)
    // Byte-identical, so a valid request can never be perturbed by this step.
    expect(wire.last()[1].body).toBe(source)
  })

  it('does not invent stream_options for a caller that did not set them', async () => {
    const wire = captureFetch('{}')
    await client().chatStream(CN, JSON.stringify(PLAIN))
    const sent = JSON.parse(String(wire.last()[1].body)) as Record<string, unknown>
    expect(sent['stream_options']).toBeUndefined()
  })

  it('passes a body that is not a JSON object through untouched', async () => {
    const wire = captureFetch('{}')
    await client().chatStream(CN, 'not json at all')
    expect(wire.last()[1].body).toBe('not json at all')
  })
})

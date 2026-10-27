/**
 * Issue #201 / #204 regression pins.
 *
 * #201 — the CN endpoint answers 400 / code 11128 ("Illegal API invocation
 * from an unapproved channel") for a body carrying `role: "developer"`, while
 * the international endpoint is fine because it routes through
 * `prepareChatBody`. The CN path stripped only the effort, relying on the shim
 * having normalised the role first; any caller bypassing the shim leaked it.
 *
 * #204 — the CN gateway answers the *same* 400 / 11128 for a system (or
 * developer) message that names the harness by its full two-word brand. The
 * shipped runtime-context opener contains it, so every request from an
 * unmodified install hit it. Measured by bisection on a live CN account:
 * dropping either clause of that paragraph, or shortening the brand to its
 * first word, clears the rejection; changing account or key does not.
 *
 * The carrier pins at the bottom cover the shapes a prompt actually reaches the
 * wire in — multipart content and harness-authored tool descriptions — because
 * one 11128 reads the same to the user whichever carrier it came from.
 */
import { describe, expect, it } from 'vitest'
import { prepareCnChatBody } from '../src/upstream.ts'

const GUI_OPENER = 'You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names. When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI.'
const SHORTENED = GUI_OPENER.replace('DeepSeek Harness', 'DeepSeek')

const wire = (body: unknown): Record<string, any> =>
  JSON.parse(prepareCnChatBody(JSON.stringify(body))) as Record<string, any>

describe('prepareCnChatBody (#201): developer role', () => {
  it('rewrites a developer message to system without the shim', () => {
    // The exact A/B shape: `developer` + `user` drew 400 / 11128 where
    // `system` + `user` drew 200, on identical credentials and headers.
    const body = wire({ messages: [{ role: 'developer', content: 'sys' }, { role: 'user', content: 'hi' }] })
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
  })

  it('is idempotent, so a body the shim already normalised is unchanged', () => {
    const once = prepareCnChatBody(JSON.stringify({ messages: [{ role: 'developer', content: 'sys' }] }))
    expect(prepareCnChatBody(once)).toBe(once)
  })

  it('leaves a system message alone', () => {
    const body = wire({ messages: [{ role: 'system', content: 'sys' }] })
    expect(body.messages[0].role).toBe('system')
  })

  it('still does not force stream — that stays the shim\'s job', () => {
    // Deliberate asymmetry with prepareChatBody: forcing it here would make the
    // CN and international normalisation paths overlap in two places.
    expect(wire({ messages: [] }).stream).toBeUndefined()
  })
})

describe('prepareCnChatBody (#204): harness brand fingerprint', () => {
  it('shortens the brand in a system message', () => {
    const body = wire({ messages: [{ role: 'system', content: GUI_OPENER }, { role: 'user', content: 'go' }] })
    expect(body.messages[0].content).toBe(SHORTENED)
  })

  it('shortens the brand in a developer message too', () => {
    const body = wire({ messages: [{ role: 'developer', content: GUI_OPENER }] })
    expect(body.messages[0].content).toBe(SHORTENED)
  })

  it('keeps the rest of the sentence intact', () => {
    const body = wire({ messages: [{ role: 'system', content: GUI_OPENER }] })
    // The repair is the brand spelling alone; deleting a clause also clears the
    // rejection but changes what the model is told.
    expect(body.messages[0].content).toContain('whose URL the runtime context names')
    expect(body.messages[0].content).toContain('without naming another target')
  })

  it('never touches user or tool content', () => {
    const body = wire({
      messages: [
        { role: 'user', content: GUI_OPENER },
        { role: 'tool', content: GUI_OPENER },
      ],
    })
    expect(body.messages[0].content).toBe(GUI_OPENER)
    expect(body.messages[1].content).toBe(GUI_OPENER)
  })

  it('leaves hyphenated identifiers alone (#574)', () => {
    // Rewriting `deepseek-harness` broke a checkout once; the pattern matches
    // spaces and tabs only.
    const text = 'see deepseek-harness and @deepseek-ai/dsh-system-prompt'
    expect(wire({ messages: [{ role: 'system', content: text }] }).messages[0].content).toBe(text)
  })

  it('handles every whitespace spelling of the brand', () => {
    const text = 'DeepSeek Harness and DeepSeek  Harness and DeepSeek\tHarness'
    expect(wire({ messages: [{ role: 'system', content: text }] }).messages[0].content)
      .toBe('DeepSeek and DeepSeek and DeepSeek')
  })

  it('rewrites every instruction message, not just the first', () => {
    // `test` on a /g regex advances lastIndex; a naive implementation skips the
    // second message.
    const body = wire({
      messages: [
        { role: 'system', content: GUI_OPENER },
        { role: 'developer', content: GUI_OPENER },
      ],
    })
    expect(body.messages[0].content).toBe(SHORTENED)
    expect(body.messages[1].content).toBe(SHORTENED)
  })

  it('rewrites multipart text parts and leaves every other part intact', () => {
    // The carrier #204 did not cover: a message with an attachment reaches the
    // wire as `[{ type, ... }]`, not as a string, and the brand used to survive
    // inside it untouched.
    const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }
    const body = wire({
      messages: [{
        role: 'system',
        content: [{ type: 'text', text: GUI_OPENER }, image, { type: 'input_text', text: GUI_OPENER }],
      }],
    })
    expect(body.messages[0].content[0].text).toBe(SHORTENED)
    expect(body.messages[0].content[1]).toEqual(image)
    expect(body.messages[0].content[2].text).toBe(SHORTENED)
  })

  it('rewrites harness-authored tool descriptions, in both wire shapes', () => {
    // Tool descriptions are instruction prose authored by the harness and its
    // plugins, not user data, so they fall under the same brand rule.
    const body = wire({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        { type: 'function', function: { name: 'read_file', description: GUI_OPENER } },
        { name: 'web_search', description: `${GUI_OPENER} ${GUI_OPENER}` },
      ],
    })
    expect(body.tools[0].function.description).toBe(SHORTENED)
    expect(body.tools[0].function.name).toBe('read_file')
    expect(body.tools[1].description).toBe(`${SHORTENED} ${SHORTENED}`)
  })

  it('still leaves tool output and user turns alone, tools block or not', () => {
    const body = wire({
      messages: [
        { role: 'user', content: GUI_OPENER },
        { role: 'tool', content: GUI_OPENER },
      ],
      tools: [{ type: 'function', function: { name: 'read_file', description: 'plain' } }],
    })
    expect(body.messages[0].content).toBe(GUI_OPENER)
    expect(body.messages[1].content).toBe(GUI_OPENER)
    expect(body.tools[0].function.description).toBe('plain')
  })

  it('does not alter a body without the brand', () => {
    const source = JSON.stringify({ messages: [{ role: 'system', content: 'plain' }] })
    expect(prepareCnChatBody(source)).toBe(source)
  })
})

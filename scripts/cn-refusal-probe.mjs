/**
 * CN refusal probe — attribute a 「请求被拦截，请重新发送」 rejection to a cause.
 *
 * The CN gateway answers `400` / `code 11128` with the same localized sentence
 * for every objection it has (rejected `role`, missing conversation id, branded
 * prompt, unapproved channel), so the response alone cannot say which one fired.
 * This script sends a small matrix of *known-shape* bodies on the real
 * credential and prints the machine fields for each, which separates the cases:
 *
 * - `minimal`         plain system + user. Fails => account, channel or model.
 * - `brand-text`      the #204 opener as string content. Passes => the CN
 *                     rewrite removed it; fails => the rewrite is not reaching
 *                     the wire at all.
 * - `brand-parts`     same text as multipart content (the shape an attachment
 *                     produces).
 * - `brand-tool`      same text inside a tool description.
 * - `official`        the shipped WorkBuddy template from
 *                     `resources/app.asar.unpacked/resources/templates`.
 * - `--body <path>`   replay one body captured by `DSH_WORKBUDDY_WIRE_DUMP`,
 *                     i.e. the exact request DSH made when it was refused.
 * - `--bisect`        with `--body`: replay it, then remove one field at a time
 *                     and mark the removal that clears the refusal. Use this
 *                     once the matrix below passes on every case — that already
 *                     rules out the prompt, the account and the channel, so
 *                     what is left can only be the request's shape.
 *
 * Live status: the matrix passes 5/5 on a CN account as of the `stream: true`
 * guarantee, which is why the interesting run is now the `--body` one.
 *
 * Each case costs a few credits (the successful ones stream one short reply;
 * the stream is cancelled as soon as headers arrive).
 *
 * Usage, from the package root:
 *
 *   node scripts/cn-refusal-probe.mjs
 *   node scripts/cn-refusal-probe.mjs --body wire.jsonl --bisect
 *   node scripts/cn-refusal-probe.mjs --body --bisect
 *   node scripts/cn-refusal-probe.mjs --templates "D:/wbai/WorkBuddyAI/resources/app.asar.unpacked/resources/templates"
 *
 * `DSH_WORKBUDDY_WIRE_DUMP=1` dumps to `<os temp>/dsh-workbuddy-wire.jsonl`, so
 * a bare `--body` resolves that path itself. The switch has to sit in the app's
 * own environment, which means relaunching the app with it set — asking the
 * operator to retype the path afterwards is one more place to get it wrong.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WorkBuddyCredentialStore, WorkBuddyUpstreamClient, describeUpstreamRejection, prepareCnChatBody, resolveWireDumpPath } from '../lib/index.js'

const DEFAULT_TEMPLATES = 'D:/wbai/WorkBuddyAI/resources/app.asar.unpacked/resources/templates'

const GUI_OPENER = 'You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names. When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI.'

const USER_TURN = '只回复两个字：收到'

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = process.argv[index + 1]
  return value === undefined || value.startsWith('--') ? true : value
}

function readTemplate(dir, file) {
  try {
    return readFileSync(join(dir, file), 'utf8')
  } catch {
    return undefined
  }
}

/** Cases sent with the plugin's own CN preparation, exactly as a chat would be. */
function matrix(templatesDir, model) {
  const official = readTemplate(templatesDir, 'workbuddy-quick-prompt.tpl')
    ?? readTemplate(templatesDir, 'workbuddy-prompt.tpl')

  const cases = [
    {
      name: 'minimal',
      why: 'control: nothing the gateway has ever been measured to reject',
      body: {
        model,
        messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: USER_TURN }],
      },
    },
    {
      name: 'brand-text',
      why: '#204 carrier: the two-word brand in a system string',
      body: {
        model,
        messages: [{ role: 'system', content: GUI_OPENER }, { role: 'user', content: USER_TURN }],
      },
    },
    {
      name: 'brand-parts',
      why: 'same text as multipart content (attachment shape)',
      body: {
        model,
        messages: [{ role: 'system', content: [{ type: 'text', text: GUI_OPENER }] }, { role: 'user', content: USER_TURN }],
      },
    },
    {
      name: 'brand-tool',
      why: 'same text inside a tool description',
      body: {
        model,
        messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: USER_TURN }],
        tools: [{ type: 'function', function: { name: 'noop', description: GUI_OPENER, parameters: { type: 'object', properties: {} } } }],
      },
    },
  ]

  if (official !== undefined) {
    cases.push({
      name: 'official',
      why: 'the shipped WorkBuddy prompt template, verbatim',
      body: { model, messages: [{ role: 'system', content: official }, { role: 'user', content: USER_TURN }] },
    })
  }
  return cases
}

/** One captured record from `DSH_WORKBUDDY_WIRE_DUMP`, if any. */
function dumpedBodies(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    console.error(`cannot read ${path}: ${String(error)}`)
    console.error('the switch has to reach the process that sends the chat, which means restarting the app with it set:')
    console.error('  1. $env:DSH_WORKBUDDY_WIRE_DUMP=1        (or a full path to a file in a directory that exists)')
    console.error('  2. quit the app completely, tray included, then relaunch it from THIS window so it inherits the variable')
    console.error(`  3. reproduce one refusal, then rerun with --body (no value) — it resolves the same path the writer uses`)
    const fallback = resolveWireDumpPath()
    console.error(fallback === undefined
      ? `  this window has no DSH_WORKBUDDY_WIRE_DUMP set, so the default cannot be named`
      : `  from this window the switch resolves to: ${fallback}`)
    return []
  }
  const cases = []
  for (const [index, line] of raw.split('\n').entries()) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const record = JSON.parse(trimmed)
      if (typeof record.body !== 'string') continue
      cases.push({
        name: `dump#${index + 1}`,
        why: `captured at ${record.at} (status ${record.status})`,
        body: JSON.parse(record.body),
        captured: record,
      })
    } catch {
      // Not a record; skip without failing the whole run.
    }
  }
  return cases
}

function field(body, name) {
  try {
    const parsed = JSON.parse(body)
    return typeof parsed === 'object' && parsed !== null ? parsed[name] : undefined
  } catch {
    return undefined
  }
}

async function runCase(client, credential, item) {
  const sent = prepareCnChatBody(JSON.stringify(item.body))
  const result = await client.chatStream(credential, JSON.stringify(item.body))
  if (result.ok) {
    // Cancel immediately: the probe only needs the status code.
    await result.response.body?.cancel().catch(() => {})
    return { ok: true, status: 200 }
  }
  return {
    ok: false,
    status: result.status,
    kind: result.kind,
    reason: describeUpstreamRejection(result.message) ?? result.message.slice(0, 200),
    rewritten: sent !== JSON.stringify(item.body),
    body: field(sent, 'messages'),
  }
}

/** One line for an outcome, in the same shape the matrix prints. */
function describeOutcome(outcome) {
  return outcome.ok ? '200 accepted' : `${outcome.status} ${outcome.kind} — ${outcome.reason}`
}

/** Top-level keys the bisect never drops: the model, the messages, the stream flag. */
const KEEP_KEYS = new Set(['model', 'messages', 'stream'])

/**
 * Halve a list of text units until one of them refuses on its own.
 *
 * Used on the system message once {@link bisectBody} has established that it is
 * the carrier: a shipped system prompt is tens of kilobytes of prose, and the
 * whole point of #204 was that only *some* of that prose is objectionable. Two
 * requests per level is the price of never assuming which half matters.
 *
 * Returns `undefined` when no single unit is responsible — both halves accepted
 * means the trigger needs text from more than one of them, or needs the size of
 * the whole, and reporting either as "the paragraph" would be a fabrication.
 */
async function narrowUnits(probe, units, label) {
  let current = units
  while (current.length > 1) {
    const middle = Math.ceil(current.length / 2)
    const left = current.slice(0, middle)
    const right = current.slice(middle)
    const leftOutcome = await probe(left)
    const rightOutcome = await probe(right)
    const leftBad = !leftOutcome.ok
    const rightBad = !rightOutcome.ok
    console.log(`    ${label} ${String(current.length).padStart(3)}: left ${String(left.length).padStart(3)} ${leftBad ? 'refused' : 'accepted'}, right ${String(right.length).padStart(3)} ${rightBad ? 'refused' : 'accepted'}`)
    if (leftBad && rightBad) {
      console.log('    (both halves refuse on their own; following the first)')
      current = left
    } else if (leftBad) {
      current = left
    } else if (rightBad) {
      current = right
    } else {
      return undefined
    }
  }
  return { index: units.indexOf(current[0]), text: current[0] }
}

/**
 * Attribute a captured body by subtraction.
 *
 * A `11128` says a rule fired, never which one, and the shapes that clear it
 * are not enumerable from the response — the matrix in {@link matrix} proves
 * that much: five prompts that differ only in wording all pass, so the answer
 * lives in whatever the real request carries *besides* the conversational text.
 *
 * So this replays the captured body, then removes one thing at a time and keeps
 * the removal that flips the answer to `200`. Top-level fields go first; then
 * the two structures that grow with a real conversation (the message history
 * and the tool block), the latter narrowed by halves so a large tool set costs
 * a handful of requests rather than one per tool.
 *
 * When the last turn alone is accepted but "system + last turn" is refused, the
 * run has isolated the system message, and the search continues inside its
 * prose ({@link narrowUnits}) — that is where the first live run landed: 52
 * tools, the whole history and every request field were innocent, and only the
 * system text carried the refusal.
 *
 * Every step is a real request against the account, and each accepted one
 * streams a short reply, so the total is bounded by the number of top-level
 * fields plus the log2 of the tool count, plus two per level of the system
 * prose.
 */
async function bisectBody(client, credential, original) {
  const send = async body => runCase(client, credential, { body })

  const full = await send(original)
  console.log(`    replay                       ${describeOutcome(full)}`)
  if (full.ok) {
    console.log('    => the captured body is accepted now; nothing to attribute')
    return
  }

  let attributed = false
  for (const key of Object.keys(original)) {
    if (KEEP_KEYS.has(key)) continue
    const reduced = { ...original }
    delete reduced[key]
    const outcome = await send(reduced)
    const hit = outcome.ok
    if (hit) attributed = true
    console.log(`    drop ${key.padEnd(23)} ${describeOutcome(outcome)}${hit ? '   <== this field' : ''}`)
  }

  const messages = Array.isArray(original.messages) ? original.messages : []
  const systemMessage = messages.find(message => message?.role === 'system')
  const lastUser = [...messages].reverse().find(message => message?.role === 'user')
  if (messages.length > 1 && lastUser !== undefined) {
    const only = await send({ ...original, messages: [lastUser] })
    if (only.ok) attributed = true
    console.log(`    keep only the last turn      ${describeOutcome(only)}${only.ok ? '   <== the history' : ''}`)
    if (systemMessage !== undefined && messages.length > 2) {
      const withSystem = await send({ ...original, messages: [systemMessage, lastUser] })
      if (withSystem.ok) attributed = true
      console.log(`    system + last turn           ${describeOutcome(withSystem)}${withSystem.ok ? '   <== the middle of the history' : ''}`)
    }
    if (only.ok && systemMessage !== undefined && typeof systemMessage.content === 'string') {
      const prose = systemMessage.content
      const paragraphs = prose.split(/\n{2,}/).map(part => part.trim()).filter(part => part !== '')
      console.log(`    the system message is the carrier: ${paragraphs.length} paragraph(s), ${prose.length} chars`)
      const asSystem = async texts => send({ ...original, messages: [{ ...systemMessage, content: texts.join('\n\n') }, lastUser] })
      let culprit = await narrowUnits(asSystem, paragraphs, 'paragraphs')
      // A hit is often a whole section; go one level deeper before calling it.
      if (culprit !== undefined && culprit.text.length > 800) {
        const lines = culprit.text.split('\n').map(line => line.trim()).filter(line => line !== '')
        if (lines.length > 1) {
          console.log(`    narrowing paragraph #${culprit.index} by line (${lines.length})`)
          const asLines = async texts => send({ ...original, messages: [{ ...systemMessage, content: texts.join('\n') }, lastUser] })
          const inner = await narrowUnits(asLines, lines, 'lines')
          if (inner !== undefined) culprit = { index: culprit.index, text: inner.text }
        }
      }
      if (culprit === undefined) {
        console.log('    => no single passage reproduces it: the text needs to be present together, or the size of the prompt is the trigger')
      } else {
        attributed = true
        console.log(`    => paragraph #${culprit.index} of ${paragraphs.length} is the cause:`)
        console.log(`       ${JSON.stringify(culprit.text.slice(0, 400))}${culprit.text.length > 400 ? '…' : ''}`)
      }
    }
  }

  const tools = Array.isArray(original.tools) ? original.tools : []
  if (tools.length > 0) {
    const none = await send({ ...original, tools: [] })
    console.log(`    drop all ${String(tools.length).padEnd(20)} ${describeOutcome(none)}${none.ok ? '   <== the tool block' : ''}`)
    if (none.ok) {
      attributed = true
      if (tools.length > 1) {
        // Narrow to the first offending tool: keep prefixes, halve the range.
        let low = 0
        let high = tools.length
        while (high - low > 1) {
          const middle = Math.floor((low + high) / 2)
          const outcome = await send({ ...original, tools: tools.slice(0, middle) })
          console.log(`    tools[0..${middle - 1}]${' '.repeat(Math.max(1, 20 - String(middle).length))} ${describeOutcome(outcome)}`)
          if (outcome.ok) high = middle
          else low = middle
        }
        const name = tools[low]?.function?.name ?? tools[low]?.name ?? '?'
        console.log(`    => tool #${low} (${name}) is the cause`)
      }
    }
  }

  if (!attributed) {
    console.log('    => nothing single-field reproduces it: the refusal needs the whole shape (size, ordering, or a header), so capture a second body and compare')
  }
}

const client = new WorkBuddyUpstreamClient()
const store = new WorkBuddyCredentialStore({ refresh: credential => client.refreshToken(credential) })
let credential
try {
  credential = await store.current()
} catch (error) {
  console.error(`cannot resolve a credential: ${error instanceof Error ? error.message : String(error)}`)
  console.error('open the WorkBuddy desktop app once to sign in, point WORKBUDDY_AUTH_FILE at an auth file, or set WORKBUDDY_ELECTRON_BIN when automatic discovery is unavailable')
  process.exit(1)
}
if (credential === undefined) {
  console.error('not signed in: open the WorkBuddy desktop app once, or set WORKBUDDY_AUTH_FILE')
  process.exit(1)
}

const domain = credential.domain === '' ? '(empty domain: CN)' : credential.domain
console.log(`credential: domain=${domain} uid=${credential.uid === '' ? '(none)' : `${credential.uid.slice(0, 4)}…`} enterprise=${credential.enterpriseId === undefined || credential.enterpriseId === '' ? '(none)' : `${credential.enterpriseId.slice(0, 4)}…`}`)

const templatesDir = arg('templates', DEFAULT_TEMPLATES)
const model = arg('model', 'auto')
// A bare `--body` means "the file the switch names", so the replay side never
// has to be told a path the writer already resolved.
const bodyArg = arg('body')
const bodyPath = bodyArg === true ? resolveWireDumpPath() : bodyArg
const bisect = arg('bisect', false) === true
if (bodyArg === true && bodyPath === undefined) {
  console.error('--body without a value needs DSH_WORKBUDDY_WIRE_DUMP set in this window; pass a path instead')
  process.exit(1)
}
const cases = typeof bodyPath === 'string' ? dumpedBodies(bodyPath) : matrix(templatesDir, model)
if (cases.length === 0) {
  console.error('nothing to probe')
  process.exit(1)
}
if (bisect && typeof bodyPath !== 'string') {
  // The matrix is built to be bisected by hand, one case at a time; there is
  // nothing to subtract from it, and running the search would only burn calls.
  console.error('--bisect needs --body <dump>: it subtracts from a captured request')
  process.exit(1)
}

console.log(`\n${cases.length} case(s) on model ${model}; one short reply per accepted case\n`)
for (const item of cases) {
  if (bisect) {
    console.log(`${item.name} — ${item.why}`)
    try {
      await bisectBody(client, credential, item.body)
    } catch (error) {
      console.log(`    threw: ${String(error)}`)
    }
    console.log('')
    continue
  }
  let line
  try {
    const outcome = await runCase(client, credential, item)
    line = outcome.ok
      ? `200 accepted — ${item.why}`
      : `${outcome.status} ${outcome.kind} — ${item.why}\n    reason: ${outcome.reason}\n    cn rewrite applied: ${outcome.rewritten ? 'yes' : 'no'}`
  } catch (error) {
    line = `threw — ${item.why}: ${String(error)}`
  }
  console.log(`${item.name.padEnd(12)} ${line}`)
}

console.log('\nHow to read it:')
console.log('- `minimal` fails => the account, the resolved identity headers, or the model is refused; prompt content is not the cause.')
console.log('- `minimal` passes and only a branded case fails => the rewrite is not reaching that carrier.')
console.log('- `official` fails too => no prompt content passes; the refusal is channel- or account-level.')
console.log('- a bare `11101` "Non-stream chat request" => something stripped `stream: true` off the body; `chatStream` sets it, so this means the flag never reached the wire.')
console.log('- every case passes on a body captured from a refused chat => the refusal depends on something outside the body (headers on that particular request, or the account state at that moment).')
console.log('- `--bisect` marks with `<==` the single removal that turns the refusal into a 200.')
console.log('- in `--bisect`, "the system message is the carrier" means the request, the tools and the history are all fine and one passage of the system prompt is the trigger; the paragraph it prints is the smallest one that still refuses on its own.')

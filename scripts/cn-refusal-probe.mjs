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
 *
 * Each case costs a few credits (the successful ones stream one short reply;
 * the stream is cancelled as soon as headers arrive).
 *
 * Usage, from the package root:
 *
 *   node scripts/cn-refusal-probe.mjs
 *   node scripts/cn-refusal-probe.mjs --body wire.jsonl
 *   node scripts/cn-refusal-probe.mjs --templates "D:/wbai/WorkBuddyAI/resources/app.asar.unpacked/resources/templates"
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WorkBuddyCredentialStore, WorkBuddyUpstreamClient, describeUpstreamRejection, prepareCnChatBody } from '../lib/index.js'

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
const bodyPath = arg('body')
const cases = typeof bodyPath === 'string' ? dumpedBodies(bodyPath) : matrix(templatesDir, model)
if (cases.length === 0) {
  console.error('nothing to probe')
  process.exit(1)
}

console.log(`\n${cases.length} case(s) on model ${model}; one short reply per accepted case\n`)
for (const item of cases) {
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

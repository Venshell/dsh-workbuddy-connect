# dsh-workbuddy-connect

English | [中文](./README.md)

Bring the models available in your signed-in **WorkBuddy / WorkBuddy AI desktop app** into **DSH (DeepSeek Harness)**:
it reuses the app's own sign-in and credit, and the two products form one group each, never mixed.

- **One plugin, two providers**: the CN app registers `workbuddy`, the international one registers `workbuddy-ai`.
  Install one version and only its group appears; install both and the two groups coexist; sign out of one and that
  group disappears
- **Zero configuration**: reads the desktop app's auth file directly (**read-only**), follows account switches on its
  own; token refreshes go into the plugin's own copy and are never written back to the app's file
- **Credit in sight**: once a model is selected the composer shows the account's remaining credit
  (`WB.3,401 credits`). No polling — every read is a real billing query
- **Reasoning levels as declared upstream**: GLM-5.3 / GLM-5.3-Flash expose low / high / max directly; models that
  declare nothing are not guessed, they are probed item by item after the user consents
- **Per-account model visibility**: hiding a model applies to the current account only, switching accounts switches
  the list, switching back restores it
- **Enterprise credit**: on the CN product, enterprise accounts (non-empty `enterpriseId`) read through the
  enterprise billing endpoint, and the card shows the cycle quota and its reset time

[![npm](https://img.shields.io/npm/v/@venshell/dsh-workbuddy-connect.svg)](https://www.npmjs.com/package/@venshell/dsh-workbuddy-connect)
[![release](https://img.shields.io/github/v/release/Venshell/dsh-workbuddy-connect)](https://github.com/Venshell/dsh-workbuddy-connect/releases)
[![license](https://img.shields.io/npm/l/@venshell/dsh-workbuddy-connect.svg)](./LICENSE)

````text
DSH agent loop
   │ ctx.llm.stream({ provider: 'workbuddy', model: 'GLM-5.3', … })
   ▼
plugin adapter (registers a provider with dsh-llm-pi-ai)
   │ 127.0.0.1 loopback
   ▼
shim: OpenAI-compatible endpoint
   ├─ forces streaming (a non-streaming request is answered with 11101)
   ├─ CN body rewrite: developer→system, brand words, bare @
   ├─ the official client's per-request identity and trace headers
   └─ tool_choice converted to the string form
   ▼
copilot.tencent.com · chat/completions (SSE)
   ▲
   └─ credentials: the desktop app's auth file (read-only) + the plugin's own refresh copy
````

---

## Install

**Prerequisite**: the WorkBuddy (CN) or WorkBuddy AI desktop app is installed and signed in on this machine. The
plugin reuses the app's sign-in state.

### Route 1: install from the plugin page by package name (simplest)

DSH's plugin page installs straight from an **npm package name**: open the plugin manager → install / add plugin →
enter `@venshell/dsh-workbuddy-connect` → confirm. The host fetches and registers it from npm itself; no command line
involved.

That installs whatever npm `latest` is. Below a `0.2.1-rc.3` core, do not use this route — pin the version from the
command line instead, per the compatibility table. On a Desktop distribution that owns its own profile, install from
that app's own plugin page.

### Route 2: let an Agent you already have do it

Any assistant with terminal and file access (the DSH agent, Codex, Claude Code, Cursor, …) works. Paste this to it
verbatim:

```text
Please install and verify the DSH (DeepSeek Harness) plugin dsh-workbuddy-connect for me (project: https://github.com/Venshell/dsh-workbuddy-connect).
Start by reading the project README and confirming which interface I actually use (Web / Desktop / TUI) and its DSH core version — for the Desktop app, the bundled core, never the standalone CLI's version.
Then install from the official npm package per the version mapping (0.2.1-rc.3 -> 0.8.4, 0.2.1-rc.2 -> 0.7.9, 0.2.1-rc.1 -> 0.7.7, 0.2.0-rc.2 -> 0.7.6, rc.1 -> 0.7.0, 0.1.5-0.1.7 -> 0.6.5): if my core is 0.2.1-rc.3 or newer, prefer installing @venshell/dsh-workbuddy-connect from the plugin page; otherwise pin the version from the command line. On some Desktop distributions (the official Electron app in particular) the profile is app-managed and rules vary by distribution — check mine first, then explore its compliant install route, but never bypass its validation.
Ask for my consent and make backups before changing any local files or configuration.
After installing, verify the WorkBuddy group appears in the model picker and walk me through one short conversation.
If the Desktop install still fails generation validation (e.g. the @types/retry false positive), report it honestly, reference upstream dataelement/dsh-desktop#688, and suggest switching to the standalone Web / TUI — do not modify dependency packages or bypass the check.
```

### Route 3: npm CLI

The package is published on npm: [`@venshell/dsh-workbuddy-connect`](https://www.npmjs.com/package/@venshell/dsh-workbuddy-connect).

```sh
# Web (pin per your actual core — example: 0.2.1-rc.3 -> 0.8.4)
dsh plugin --profile web add @venshell/dsh-workbuddy-connect@0.8.4
dsh web

# TUI (example for a 0.1.x core; that profile needs pnpm 11, e.g. npx pnpm@11)
dsh plugin --profile dsh-tui add dsh-workbuddy-connect@0.6.5
dsh --profile dsh-tui
```

### Route 4: from source

```sh
dsh plugin --profile web add github:Venshell/dsh-workbuddy-connect
```

> **Package name**: from 0.8.0 this repository publishes as `@venshell/dsh-workbuddy-connect`. Every version of the
> original name `dsh-workbuddy-connect` is deprecated by its author, and publishing rights for it are not held by
> this fork's maintainer. **0.7.9 and earlier** keep the old name; the two can coexist in different profiles, but do
> not install both into one profile.

> **TUI version pairing**: the terminal shell `@deepseek-harness-tui/dsh-tui` must be 0.10.0-beta.5 or newer — older
> versions fail at startup with this plugin installed (`events is not iterable`); manual reasoning-level detection
> exists on Web / Desktop only.

> **Desktop**: on some distributions (the official Electron app in particular) the `desktop` profile is app-managed,
> and the official app rejects the standalone CLI's `--profile desktop` outright; other distributions may follow
> different rules. On those, the right route is the **app's own plugin page** by package name, or an Agent probing
> that distribution's compliant path; **never blindly edit the app-managed directory and never bypass its
> validation**.

**Verify**: after restarting the interface, the model picker shows the "WorkBuddy / WorkBuddy AI" group(s) (with only
one app installed, check just that group), and a model picked from the group completes one short conversation with a
normal reply — that is what a successful install means.

## Where the credentials come from

The plugin **never starts a sign-in** and never asks you for a token:

- The primary source is the desktop app's own auth file, **read-only**; `auth.ts` locates and parses it and never
  writes back
- Token refresh results go into the plugin's own copy (under `$DSH_HOME`); the app's file stays exactly as it was
- Windows probes Local and then Roaming AppData; WSL first reads from the mounted Windows user profile
- When the Windows and Linux user names differ and the environment variables are not forwarded into WSL, point
  `WORKBUDDY_AUTH_FILE` (or `WORKBUDDY_AI_AUTH_FILE` for the international version) at the actual location
- If a version's app was never signed in and left no plugin-owned copy, that group simply does not appear — no more
  fallback list where every model is guaranteed to fail

Since WorkBuddy 5.6.x the auth file is statically encrypted, and decryption uses the Electron executable the app
ships itself:

| Platform | How the decryptor is located |
|---|---|
| macOS | auto-detected inside the app bundle |
| Windows | explicit process setting → registry (user env → system env) → default install location → uninstall-record discovery; an invalid explicit setting is an **error**, never a silent switch to another install |
| Linux | cannot be discovered automatically, must be set explicitly |

Use `WORKBUDDY_ELECTRON_BIN` (CN) / `WORKBUDDY_AI_ELECTRON_BIN` (international) to name one. A successful match is
cached per instance — to switch to another still-valid install, fully quit and restart DSH.

## Features

![WorkBuddy models in the DSH model picker](assets/1.png)

**Both products side by side**: the CN app shows as "WorkBuddy", the international one (WorkBuddy AI) as
"WorkBuddy AI". Their models, accounts and credit never mix, and each follows only its own app's sign-in; settings
shows one card per version, each with its own account and balance.

![WorkBuddy AI models in the DSH model picker](assets/5.png)

**Image input**: most models accept images pasted or dropped straight into the conversation (GLM-5.3-Flash, the
DeepSeek-V4 series, and more); the few text-only models (e.g. GLM-5.1, GLM-5.2) clearly say they do not.

**Reasoning levels**: levels WorkBuddy declares explicitly appear directly (GLM-5.3 / GLM-5.3-Flash offer low / high /
max). For models without declared levels, the model picker on Web and Desktop offers a manual check — it sends a few
requests and **may consume credit**; with no check result or no usable level, WorkBuddy's default applies.

**Balance at a glance**: with a model selected, the composer shows the remaining credit next to the model selector.
Credit is not polled — one read on mount, then refresh on demand with the ↻ before the balance. While switching
sessions the controls may briefly hide and return once the model selection is ready; the refresh button stays
available even when the model has no level-detection entry or the balance cannot be read.

**Status and detection**: Settings → Plugins → the matching card shows the account, token validity, remaining credit
and model offers, and also refreshes the model list manually and shows whether the current list came from the upstream
or the built-in fallback. On DSH 0.1.5 the entry lives under Settings → Plugins; on 0.1.6+ it moved to the
left-sidebar Plugins panel (workbuddy-connect → View); the Settings → Models page shows no WorkBuddy entries on either
generation, by design.

**Model visibility**: the Context window tab of each card lets you check which models appear in the model picker.
Hidden lists are saved **per signed-in account**: switching accounts switches to that account's own list, switching
back restores it; new accounts and newly added models are visible by default. Hiding only affects pickability —
existing chats using a hidden model keep working.

![Model visibility in the context-window list (DSH 0.1.6+ plugin configuration page)](assets/6.png)

The same UI works unchanged inside the DSH 0.1.5 settings cards:

![Model visibility in a DSH 0.1.5 settings card](assets/7.png)

**Rates and badges**: every model name carries its credit multiplier (e.g. `GLM-5.2 · x0.79`), in both the `/model`
popup and the composer dropdown; the rate is display-only. Promo badges (limited-time free, night discount) ride the
model name (`Hy4 preview · x0.00 · 限时免费`) and sync each time DSH starts; on the international version a lapsed
promotion has its badge withdrawn, and because the service writes the discounted value into the rate field the original
price cannot be reconstructed — that model then reads "price unavailable — refresh to update" instead of repeating the
discounted rate.

![Settings card showing the plugin](assets/2.png)

Expanded, the card has three tabs: Status (account, token validity, total credit, catalog source, level detection);
Context (each model's context window, plus the international version's "use the upstream's largest declared context
window" switch, on by default — turn it off to follow the upstream default instead, and the preference persists);
Details (credit packages merged by name, plus model offers).

![Settings card showing account and remaining credit](assets/3.png)

### Why reasoning levels work this way

WorkBuddy's level information is split between upstream endpoints and private UI logic in the client, and the model
catalog changes quickly. Filling in one uniform set of levels for every undeclared model would mean permanently
chasing product logic that has no stable contract.

![Reasoning-level detection in the composer](assets/4.png)

Testing also found that some models accept the `reasoning_effort` parameter yet ignore unknown values and fall back to
their default behavior — **one successful request does not prove that a level is actually usable**. Models without
declared levels are therefore probed only after the user authorizes it: first confirm the upstream validates the
parameter, then check which standard levels it accepts. The result means only "the upstream currently accepts this
level"; it promises nothing about reasoning quality, speed, or credit use.

## Upstream protocol hard constraints (measured, do not "optimise")

| Symptom | Consequence | What the plugin does |
|---|---|---|
| `role: "developer"` sent to the CN endpoint | 400 / `11128` | `prepareCnChatBody` idempotently rewrites it to `system`; calls that bypass the shim are covered too |
| A full brand word in system / developer | `11128` | Only the brand is shortened and the rest of the sentence stays verbatim; only spaces and tabs are matched, so paths and package names such as `deepseek-harness` are untouched |
| A **bare `@`** in the body (whitespace on both sides) | `11128`, measured on 0.8.2 | Replaced with the full-width `＠`; `@file`, `@scope/pkg`, e-mail addresses and `@"…"` are never touched |
| Both sentences of the **`@`-prefixed-paths note** in one passage | `11128`, measured on 0.8.4: still refused with the `＠` rewrite on the wire, and still refused with the token deleted | Each half alone is accepted; only the pair refuses, independent of the `@` character. When both appear in one passage, the second is reworded `resolve from` → `start from`, which measured as clearing the refusal |
| A non-streaming request | `11101` Non-stream chat request is currently not supported | `chatStream` guarantees `stream: true` itself, identically on both endpoints; a body that already carries the flag stays byte-identical, and `stream_options` is never injected |
| Missing the official client's per-request identity and trace headers | Same "channel not approved" class, answered with the same `11128` and the same sentence | Fills in `X-Request-ID` / `X-Private-Data` / `x-codebuddy-request` / `traceparent` / `b3` / `X-B3-*` / `X-Trace-ID`; the ACP-only `acp-connection-id`, `X-Agent-Intent` and `X-Agent-Purpose` are deliberately **not** impersonated |
| The CN catalog reads `/v3/config` only | Under an app-form UA the `cli` agent disappears → 15 of 20 ids are lost | Union of two sources: `/v2/enterprises/personal/models` + `/v3/config`, degrading automatically when either side fails |
| Treating "the level request succeeded" as "the level is usable" | The upstream ignores unknown values, so the level looks applied but is not | No guessing: per-item probing after consent, and the result only covers "currently accepted" |
| Treating the credit query as a polling endpoint | Every call is a real billing query | One read on mount + manual refresh |

> ⚠ These refusals are **time-limited**: the same request may go through minutes after being rejected. "It works
> now" therefore does not prove the trigger is gone — reproduce against a freshly captured body. The probe is
> described under "Development" (`cn-refusal-probe`).

## DSH host contract

Read this before changing the plugin. Every item below makes the plugin "look installed but not work".

### The client half needs all three pieces

`package.json` must carry `exports["./client"]`, include that artifact in the `files` whitelist, and declare the
`dsh.client` section (`platform` / `inject`). Miss one and the host never ships the client half to the web GUI, so
neither the settings page nor the card appears.

`lib/client.js` is **deliberately CJS**: the host renderer's module loader takes exports via
`window.__ModuleLoader__.load({ id, factory: (require) => … })`, so the factory must return `module.exports`. That is
why `npm publish` prints `WARN We recommend using the ESM format instead of CommonJS` — ignore it; converting to ESM
makes the plugin unloadable inside the app.

### `cordis.patch.yml`'s `name` must match the package name

The loader resolves by that specifier; a mismatch makes the whole profile fail to start.

### Two generations of settings entries

DSH 0.1.5 uses `installSection`, 0.1.6+ uses SettingsForms. The plugin implements both, and only shows the switch once
a writable settings entry is ready; until then it keeps working on defaults.

### Local services are loopback-only

The shim and the same-origin web-status route accept loopback addresses only. If the port lands in a fetch-blocked
range the international version answers 502 — that is what 0.7.9 fixed.

### The build and the installed copy may not be the same code

`version-resolve.ts` compares the build constant against the installed manifest at load time and warns loudly on a
mismatch. After editing source, remember to `npm run build` (also run by `prepack`), otherwise the host keeps seeing
the old artifact.

## Configuration

The retry policy is plugin config (the `llm-workbuddy` entry in `cordis.yml`), shared by both versions; it is read
once when the plugin loads, so reload or restart DSH after editing.

```yaml
llm-workbuddy:
  retryPolicy:
    mode: normal
    maxRetries: 15
    backoff:
      initialDelayMs: 2000
      maxDelayMs: 30000
```

- **Omitting the whole `retryPolicy` keeps the existing behavior**. When configured explicitly, `mode` is required;
  other optional fields use the defaults for the selected mode. Without configuration the `dsh-llm` defaults apply:
  `mode: normal`, 5 retries, 500 ms doubling, 10 s ceiling — only about **15.5 s of backoff** in total (≈14–17 s
  across the jitter range), which is not a guarantee of recovery within any fixed window
- The example above schedules up to ~360 s of backoff (≈396 s at the jitter edge), enough to cover a multi-minute
  outage; a longer outage needs a higher `maxRetries` or another route
- `mode: always` means **no attempt cap** — retry until success, cancellation, or plugin disposal. It is not the
  default; use it only when you accept that a request may not return for a long time

## CLI

```sh
# sign-in state and remaining credit (CN by default; --provider workbuddy-ai for the international version)
dsh plugin --profile web exec dsh-workbuddy-connect status
dsh plugin --profile web exec dsh-workbuddy-connect status --provider workbuddy-ai --json

# diagnostics
dsh plugin --profile web exec dsh-workbuddy-connect doctor
```

`logout` removes only that version's plugin-owned credential copy. It leaves the desktop app's own sign-in alone and
does not promise the model group will disappear (the app's credential file still supplies one). The `desktop` profile
is generally managed by the app, so the CLI (including `exec`) is unavailable against it.

## Known limitations

- **Verified environment**: macOS with the DSH Web / Desktop / TUI profiles (from 0.3.2 this requires `0.1.5-rc.1`+
  and Node 22+). On Windows both Local and Roaming AppData are probed, and WSL prefers the mounted Windows user
  profile; the Windows registry branch's card interaction still awaits real-device verification
- **The international catalog comes from the app's own interface**: the service splits it by User-Agent, a private
  implementation detail that an upstream change can break. When that happens it degrades to "this account's last
  successful catalog → built-in catalog" and labels the source (live / saved / built-in), the fetch time and the
  failure reason on the card. The CN version uses the same interface as the official CLI and is unaffected
- **International version not covered yet**: on Windows / WSL / Linux there is no reliable source for the
  international app's version, so the last saved value or the built-in one is used; on macOS the real shim has been
  verified for complete GPT-family replies, tool calls and continued turns
- **Enterprise credit covers the CN product only**: international enterprise accounts still read through the personal
  endpoint pending measurement. The enterprise branch cannot be self-tested here (the development machine holds a
  personal account), it was implemented against the official app's interface contract, and field reports are welcome
- **Different Windows and Linux user names with no forwarded environment**: use `WORKBUDDY_AUTH_FILE` /
  `WORKBUDDY_AI_AUTH_FILE` to point at the credential location
- Depends on WorkBuddy client interfaces (not a public API); the plugin may need updates as WorkBuddy changes

## Compatibility

The plugin version must match the DSH core — a mismatch makes DSH fail to start; the Desktop app picks by its bundled
core. The newest npm release is not necessarily right for you, so match your actual core:

| DSH core | Recommended plugin | Notes |
|---|---|---|
| `0.2.1-rc.3` and later, below `0.3.0` | `0.8.4` | With `engines.dsh` declared, a core upgrade inside the same `0.2.x` line no longer needs a new plugin |
| `0.2.1-rc.2` | `0.7.9` | Targets this core only; unlike `0.2.0-rc.2`, so check the version bundled in your app |
| `0.2.1-rc.1` | `0.7.7` | The core moved to pi-ai 1.3.0, so a leftover 0.87.1 overrides entry must be removed |
| `0.2.0-rc.2` | `0.7.6` | Previous core line; do not stay on 0.7.2, which has a registry regression |
| `0.2.0-rc.1` | `0.7.0` | 0.7.1 and later drop rc.1 support |
| `0.1.5` – `0.1.7` | `0.6.5` | Final release of the old core line |
| `0.1.2-rc.1` | `0.3.1` | Older line, historical maintenance only |
| `0.1.1-rc.2` | `0.2.6` | Older line, historical maintenance only |

### Why a core patch upgrade no longer needs a new plugin release

`0.8.1` and earlier pinned six DSH service peers to exactly `0.2.1-rc.3`. When a plugin declares **no** `engines.dsh`,
DSH's install check (`evaluatePluginCompatibility` in `@deepseek-ai/dsh-app-boot`) compares every `@deepseek-ai/dsh-*`
peer against the running core; an exact version string cannot match a newer core, so the plugin became uninstallable
the moment the core moved:

```text
dsh: installation rejected: Plugin @venshell/dsh-workbuddy-connect@0.8.1 is
incompatible with dsh 0.2.1-rc.4: requirements {"@deepseek-ai/dsh-llm":"0.2.1-rc.3", ...}
```

Declaring `engines.dsh` removes that structurally: as soon as the field is present the check uses it **alone** and
skips every peer. The peers therefore go back to being a plain build-and-test baseline, and the install gate is a
single range:

```json
"engines": { "dsh": ">=0.2.1-rc.3 <0.3.0-0" }
```

- The floor is the core this release was actually verified on; `0.2.1-rc.2` and older stay rejected — this tree was
  neither compiled nor tested against them
- The ceiling stops before the next minor. DSH has changed the service APIs this plugin calls at minor boundaries
- `<0.3.0-0`, not `<0.3.0`: the check matches with `includePrerelease: true`, under which a plain `<0.3.0` also admits
  `0.3.0-rc.1` — exactly the line meant to be excluded

Upgrading across a minor boundary still needs a matching plugin release; what disappears is the window where the core
upgrades and the plugin immediately refuses to install.

**pi-ai versions are per core line and must not be mixed**: the 0.2.1-rc.1 / rc.2 / rc.3 core lines (plugin 0.7.7 /
0.7.8–0.7.9 / 0.8.1 and later) use `@earendil-works/pi-ai` 1.3.0 (bundled by the plugin), and a profile-level leftover
`overrides: {'@earendil-works/pi-ai': '0.87.1'}` **must be removed** or the plugin loads an older-generation pi-ai and
fails to start; the 0.2.0-rc.2 core line (plugin 0.7.6) still requires `^0.87.1` — on that line do **not** upgrade
the profile-level pi-ai to 1.x. Third-party plugin managers' "updatable" prompts do not check peer constraints and
must not be followed ([#86](https://github.com/corrinehu/dsh-workbuddy-connect/issues/86)).

## Release history

Full records at [releases](https://github.com/Venshell/dsh-workbuddy-connect/releases).

| Version | Highlights |
|---|---|
| `0.8.4` | Fixes the CN "request blocked" regression: a new gateway rule targets the two sentences of the `@`-prefixed-paths note appearing together, which the `＠` rewrite alone no longer clears; when both appear in one passage the second is reworded by one measured change. Every existing rule stays |
| `0.8.3` | Documentation only: the npm page and the packaged READMEs now ship the rewritten install chapter, which lists four routes and adds the plugin-page install; the code is byte-identical to 0.8.2 |
| `0.8.2` | Fixes the CN "request blocked" failure: conversations answered `11128` and some requests answered `11101`, both fixed; adds the official client's per-request identity and trace headers; adds the `engines.dsh` range |
| `0.8.1` | Adapts to DSH 0.2.1-rc.3: seven service peers and dev dependencies narrow to rc.3, the bundled official atomic-write helper upgrades along |
| `0.8.0` | Fixes three CN "request blocked" / missing-model failures: `developer` → `system`, brand-word cleaning, and a two-source model catalog |
| `0.7.9` | Restores the international maximum-context switch on 0.2.1-rc.2; avoids fetch-blocked local ports that caused 502s; merges credit packages with the same name |
| `0.7.8` | Adapts to 0.2.1-rc.2; bundles the official atomic-write helper; refreshes the catalog snapshot, distinguishing Hy3 / Hy3-X |
| `0.7.7` | Adapts to 0.2.1-rc.1: pi-ai moves to 1.3.0; fixes level detection stuck at "check incomplete"; fixes GBK misdetection on Chinese Windows consoles |
| `0.7.6` | Fixes enterprise catalogs missing `glm-5.3-flashx`; fixes international chats blocked by the channel check |
| `0.7.5` | Fixes the balance and refresh button disappearing after a session switch; fixes WSL environment forwarding for the Windows decryptor |
| `0.7.4` | Windows diagnostics: classification of oversized registry-subprocess output, cross-platform test-assumption fixes |
| `0.7.3` | Fixes Windows registry auto-discovery failing on non-default install paths |
| `0.7.2` | pi-ai becomes plugin-bundled; fixes rejected reasoning fields. **This release has a Windows registry regression** — use 0.7.4+ |
| `0.7.1` | Narrows the pi-ai dependency range |
| `0.7.0` | Adapts to DSH 0.2.0's settings-service rework, drops 0.1.x |
| `0.6.5` | Final release of the 0.1.x line |

## Development

```sh
npm run build      # tsdown; lib/ is a committed build artifact
npm run typecheck  # both projects (main + client)
npm test           # vitest, single process
```

Test coverage: upstream headers and error classification, CN body cleaning (developer / brand words / bare `@`), the
two-source catalog union, credential parsing and WSL environment forwarding, the serial queue and consent gate of level
probing, per-account visibility persistence, both generations of settings binding, `evaluatePluginCompatibility`
admission across seven versions, and structural rendering of the client components.

Reproducing a CN refusal: `DSH_WORKBUDDY_WIRE_DUMP=<file>` (off by default; on failure it writes the **body actually
sent**, never the headers, so the bearer never lands on disk) together with `scripts/cn-refusal-probe.mjs`
(`--body` / `--index` / `--bisect`). The probe disables the dump switch for its own process so replays cannot pollute
the capture file.

> `windows-powershell-registry-integration` fails in a Windows sandbox where `reg.exe` is unavailable; that is an
> environment issue.

## File map

| File | Role |
|---|---|
| `src/index.ts` | Plugin entry: registers providers per product variant, wires streaming, tools, settings and routes |
| `src/variants.ts` | The CN / international difference table (endpoints, UA, credential paths, catalog sources) |
| `src/auth.ts` | Credential resolution: reads the app's auth file, writes refreshes to the plugin copy |
| `src/desktop-credential-protection.ts` | Classification, key location and field decryption for the encrypted auth file since 5.6.x |
| `src/upstream.ts` | Upstream client: chat stream, token refresh, model catalog, credit balance |
| `src/shim.ts` | loopback OpenAI-compatible endpoint that applies WorkBuddy's wire quirks |
| `src/adapter.ts` | The provider registered with `dsh-llm-pi-ai` (catalog, retry policy, call preparation) |
| `src/catalog.ts` / `src/catalog-store.ts` | Model catalog: built-in snapshot plus upstream results, with degradation |
| `src/probe.ts` / `src/probe-service.ts` / `src/probe-store.ts` | Level probing: consent gate, serial queue, result persistence |
| `src/visibility-store.ts` | Per-account model visibility preferences |
| `src/loopback.ts` | The shared fence for the local HTTP surface (loopback only) |
| `src/version-resolve.ts` | Build artifact versus installed manifest consistency check |
| `src/client/*` | The web GUI half: settings card, config page, level-detection control, update notice |
| `scripts/cn-refusal-probe.mjs` | Probe for reproducing and attributing CN refusals |

## License and acknowledgements

[MIT](./LICENSE). Third-party components and their provenance are listed in
[THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt).

- [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api) (MIT) — reference implementation of the
  WorkBuddy upstream protocol
- [franksong2702/dsh-codex-connect](https://github.com/franksong2702/dsh-codex-connect) (Apache-2.0) — reference for
  DSH plugin structure and provider registration

## Maintenance and community

The original repository `corrinehu/dsh-workbuddy-connect` is no longer available; this fork maintains the project from
**0.8.0** onwards, carrying the full commit history and every contributor's credit. Maintainer
[@Venshell](https://github.com/Venshell), original author [@corrinehu](https://github.com/corrinehu), full list in
[AUTHORS.md](./AUTHORS.md).

- **[dsh-workbuddy-switcher](https://github.com/ddGuo/dsh-workbuddy-switcher)**: a community-maintained WorkBuddy
  account management and switching plugin
- **[hana-workbuddy-connect](https://github.com/miaoyongxu/hana-workbuddy-connect)**: reuses parts of this project to
  bring WorkBuddy models to HanaAgent

Both are independently maintained by third parties; listing them is neither an endorsement nor a stability
commitment for this plugin's internal interfaces.

## Disclaimer

- This project is for **personal learning and research only**, driving your own WorkBuddy / WorkBuddy AI account on
  your own machine. Do not use it commercially or beyond reasonable personal use.
- This project is not affiliated with, authorized by, or endorsed by Tencent, WorkBuddy, or DeepSeek. Product names
  are used only to describe compatibility; trademarks belong to their respective owners.
- **Third-party access carries account risks.** The official terms of service restrict unauthorized third-party
  access. Using this project may result in account or feature restrictions, account bans, or suspension or
  termination of service. Successful requests and normal credit deductions do not imply official authorization or the
  absence of account risks.
- Please understand these risks and decide for yourself whether to install and use this project. Account
  restrictions, credit losses, service interruptions, and other consequences arising from its use are borne by the
  user. If you cannot accept these risks, use the official client.
- This project does not guarantee continued service availability, freedom from account restrictions, or consistently
  accurate credit displays. The developer cannot control the platform's restrictions, penalties, or service changes.
- The author is not liable for any direct or indirect loss arising from the use or misuse of this project.

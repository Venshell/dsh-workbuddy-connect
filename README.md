# dsh-workbuddy-connect

[English](./README.en.md) | 中文

把**已登录的 WorkBuddy / WorkBuddy AI 桌面 App** 里可用的模型接进 **DSH（DeepSeek Harness）**：
复用 App 自己的登录与积分，两个产品各成一组，互不混用。

- **一份插件、两个 provider**：国内版注册 `workbuddy`，国际版注册 `workbuddy-ai`。只装一版就只出现
  对应一组，两版都装则两组并存，退出一版则对应分组消失
- **零配置**：直接读桌面 App 的 auth 文件（**只读**），账号切换自动跟随；令牌刷新写进插件自己的
  副本，永不回写 App 的文件
- **积分看得见**：选中模型后输入框旁显示当前账号剩余积分（`WB.3,401（积分）`）。不做轮询 ——
  每次读取都是真实计费查询
- **推理档位按上游声明**：GLM-5.3 / GLM-5.3-Flash 直接给出 low / high / max；没声明的模型不靠猜，
  用户授权后逐项探测
- **按账号的模型显隐**：勾掉的模型只对当前账号生效，切号自动换配置，切回即恢复
- **企业账号额度**：国内版企业账号（`enterpriseId` 非空）走企业计费接口，卡片显示周期额度与重置时间

[![npm](https://img.shields.io/npm/v/@venshell/dsh-workbuddy-connect.svg)](https://www.npmjs.com/package/@venshell/dsh-workbuddy-connect)
[![release](https://img.shields.io/github/v/release/Venshell/dsh-workbuddy-connect)](https://github.com/Venshell/dsh-workbuddy-connect/releases)
[![license](https://img.shields.io/npm/l/@venshell/dsh-workbuddy-connect.svg)](./LICENSE)

````text
DSH agent-loop
   │ ctx.llm.stream({ provider: 'workbuddy', model: 'GLM-5.3', … })
   ▼
本插件 adapter（注册进 dsh-llm-pi-ai 的 provider）
   │ 127.0.0.1 loopback
   ▼
shim：OpenAI 兼容端点
   ├─ 强制流式（非流式会被端点回 11101）
   ├─ 国内版正文清洗：developer→system、品牌词、裸 @
   ├─ 官方客户端的每请求标识与追踪头
   └─ tool_choice 转成字符串形态
   ▼
copilot.tencent.com · chat/completions（SSE）
   ▲
   └─ 凭据：桌面 App 的 auth 文件（只读）+ 插件自留的刷新副本
````

---

## 安装

**前置**：本机已安装并登录 WorkBuddy（国内版）或 WorkBuddy AI 桌面 App。插件复用 App 的登录状态。

### 方式一：插件页按包名安装（最简单）

DSH 的插件页支持直接按 **npm 包名**安装：打开插件管理页 → 安装 / 添加插件 → 输入
`@venshell/dsh-workbuddy-connect` → 确认。宿主自己从 npm 拉取并登记，不需要命令行。

装到的是 npm 上的 `latest`。内核低于 `0.2.1-rc.3` 时不要走这条路，按「版本兼容」表用命令行固定
版本安装；Desktop 若由 App 管理 profile，就在 App 自己的插件页里装。

### 方式二：交给本机已有的 Agent

任何具备终端与文件操作能力的助手（DSH Agent、Codex、Claude Code、Cursor 等）都行，把下面这段话原样发给它：

```text
请帮我安装并验证 DSH（DeepSeek Harness）插件 dsh-workbuddy-connect（项目地址：https://github.com/Venshell/dsh-workbuddy-connect）：
先阅读项目 README，确认我实际使用的界面（Web / Desktop / TUI）与 DSH 内核版本，桌面版以 App 内置核心为准，不要用独立 CLI 的版本代替；
再按版本对应关系从 npm 正式包安装（0.2.1-rc.3→0.8.4、0.2.1-rc.2→0.7.9、0.2.1-rc.1→0.7.7、0.2.0-rc.2→0.7.6、rc.1→0.7.0、0.1.5–0.1.7→0.6.5）：内核符合 0.2.1-rc.3 及以上时，优先在插件页按包名 @venshell/dsh-workbuddy-connect 安装；其余情况用命令行固定版本装。部分 Desktop 发行版（尤其官方 Electron 版）的 profile 由 App 管理，各发行版规则未必相同，先确认我所用的发行版，再探查其合规的安装方式，但不得绕过其校验；
任何本地文件或配置改动，先征得我同意并做好备份；
装完后验证模型选择器里出现 WorkBuddy 分组，并陪我完成一次简短对话；
若 Desktop 安装仍因 generation 校验失败（如 @types/retry 误报），请如实报告、参照上游 dataelement/dsh-desktop#688，并建议我改用独立的 Web / TUI，不要修改依赖包或绕过校验。
```

### 方式三：npm CLI

包发布在 npm：[`@venshell/dsh-workbuddy-connect`](https://www.npmjs.com/package/@venshell/dsh-workbuddy-connect)。

```sh
# Web（按实际内核固定版本，示例 0.2.1-rc.3 → 0.8.4）
dsh plugin --profile web add @venshell/dsh-workbuddy-connect@0.8.4
dsh web

# TUI（示例为 0.1.x 内核；该 profile 需用 pnpm 11 安装，如 npx pnpm@11）
dsh plugin --profile dsh-tui add dsh-workbuddy-connect@0.6.5
dsh --profile dsh-tui
```

### 方式四：从源码

```sh
dsh plugin --profile web add github:Venshell/dsh-workbuddy-connect
```

> **包名说明**：0.8.0 起本仓库以 `@venshell/dsh-workbuddy-connect` 发布。原包名
> `dsh-workbuddy-connect` 的所有版本已被原作者标记弃用，且其发布权限不在本仓库维护者手中。
> **0.7.9 及更早**仍用旧包名；两者可共存于不同 profile，但不要在同一 profile 中同时安装。

> **TUI 版本搭配**：终端壳 `@deepseek-harness-tui/dsh-tui` 需 0.10.0-beta.5 及以上，更早版本装本插件会
> 启动失败（`events is not iterable`）；推理档位的手动检测只有 Web / Desktop 提供。

> **Desktop**：部分发行版（尤其官方 Electron 版）的 `desktop` profile 由 App 管理，官方版会直接拒绝
> 独立 CLI 的 `--profile desktop`；其他发行版规则未必相同。这类发行版的正确装法是在 **App 自己的
> 插件页**里按包名安装，或让 Agent 探查该发行版合规的路径；**不要盲改 App 管理的目录，也不要绕过
> 其校验**。

**验证**：重启对应界面后，模型选择器出现「WorkBuddy / WorkBuddy AI」分组（只装一版就只验对应一组），
从分组里选一个模型完成一次简短对话、能正常回复，才算装成功。

## 凭据从哪来

插件**不发起任何登录**，也不要求你填 token：

- 主来源是桌面 App 自己的 auth 文件，**只读**；`auth.ts` 负责定位与解析，从不写回
- 令牌刷新结果写在插件自留副本（`$DSH_HOME` 下），App 的文件保持原样
- Windows 依次探测 Local 与 Roaming AppData；WSL 优先从挂载的 Windows 用户目录读取
- Windows / Linux 用户名不一致且环境变量没传进 WSL 时，用 `WORKBUDDY_AUTH_FILE`
  （国际版 `WORKBUDDY_AI_AUTH_FILE`）指定实际位置
- 某版 App 从未登录、也没留下插件副本时，该版分组直接不显示 —— 不再给一份「选了必然报错」的兜底列表

WorkBuddy 5.6.x 起 auth 文件有静态加密，解密靠 App 自己带的 Electron 可执行文件：

| 平台 | 解密程序定位 |
|---|---|
| macOS | 自动探测 App 包内可执行文件 |
| Windows | 进程中的显式配置 → 注册表（用户 env → 系统 env）→ 默认安装位置 → 卸载记录自动发现；显式配置无效时**报错**，不静默换用另一个安装 |
| Linux | 无法自动发现，需显式指定 |

可用 `WORKBUDDY_ELECTRON_BIN`（国内版）/ `WORKBUDDY_AI_ELECTRON_BIN`（国际版）指定。成功命中的配置按
实例缓存 —— 要换成另一个仍有效的安装，需完全退出并重启 DSH。

## 功能

![WorkBuddy 模型出现在 DSH 模型选择器中](assets/1.png)

**两个产品并存**：国内版显示「WorkBuddy」，国际版（WorkBuddy AI）显示「WorkBuddy AI」。两版的模型、
账号、积分互不混用，各自只跟随对应 App 的登录状态；设置里两张卡片分别展示各自账号与余额。

![WorkBuddy AI 模型出现在 DSH 模型选择器中](assets/5.png)

**图片输入**：大部分模型支持在对话里直接粘贴或拖入图片（GLM-5.3-Flash、DeepSeek-V4 系列等）；
少数纯文字模型（如 GLM-5.1、GLM-5.2）会明确提示不支持。

**推理档位**：WorkBuddy 明确声明的档位直接显示（GLM-5.3 / GLM-5.3-Flash 可选 low / high / max）。
未声明档位的模型可在 Web 和 Desktop 的模型选择器里手动检测 —— 发送少量请求，**可能消耗积分**；
未检测或没有可用档位时使用 WorkBuddy 默认档位。

**余额速览**：选中模型后，输入框底部在模型选择器旁显示剩余积分。积分不自动轮询，挂载时读一次，
之后点积分文字前的 ↻ 手动刷新。切换会话时组件可能短暂隐藏，模型选择就绪后自动恢复；即使模型没有
档位检测入口或余额读取失败，刷新按钮仍保留。

**信息查看与检测**：设置 → 插件 → 对应卡片可查看账号、令牌有效期、剩余积分与模型优惠，也可手动
刷新模型列表并查看当前列表来自上游还是内置兜底。DSH 0.1.5 的入口在「设置 → 插件」，0.1.6+ 移到
主界面左侧栏「插件」面板（workbuddy-connect → 查看）；「设置 → 模型」页两代都不显示 WorkBuddy
条目，属有意设计。

**模型显隐**：两张卡片的「上下文窗口」标签里可勾选要在模型选择器中显示的模型。隐藏配置**按登录账号
分别保存**：切换账号自动切换各自配置，切回后恢复；新账号和新上架模型默认显示。隐藏只影响选择器里的
可选性，正在使用该模型的已有会话不受影响。

![上下文窗口列表里的模型显隐（DSH 0.1.6+ 插件配置页）](assets/6.png)

同一份界面在 DSH 0.1.5 的设置卡片中原样生效：

![DSH 0.1.5 设置卡片中的模型显隐](assets/7.png)

**费率与徽章**：每个模型名后直接显示积分倍率（如 `GLM-5.2 · x0.79`），`/model` 弹窗与输入框下拉
都能看到，倍率仅用于显示。促销徽章（限时免费、夜间折扣）跟在模型名后
（`Hy4 preview · x0.00 · 限时免费`），每次启动 DSH 时同步；国际版过期后徽章自动撤销，服务端把
折后价写进倍率字段时原价无法还原，此时显示「价格未知 — 刷新后更新」而不是继续显示折扣价。

![设置卡片显示插件](assets/2.png)

卡片展开后分「状态 / 上下文 / 明细」三个标签。状态页：账号、令牌有效期、合计积分、模型列表来源与
档位检测；上下文页：各模型上下文窗口，国际版可在这里关闭「使用上游声明的最大上下文窗口」
（默认开启，关闭后改用上游默认窗口，偏好持久化）；明细页：合并展示同名积分包余量与模型优惠。

![设置卡片显示账号与剩余积分](assets/3.png)

### 推理档位为什么这样设计

WorkBuddy 的档位信息分散在上游接口与客户端私有 UI 逻辑里，模型目录变化很快。若按经验为所有未声明
模型补齐统一档位，就要持续追赶这些没有稳定契约的产品逻辑。

![设置档位](assets/4.png)

实测还发现：有些模型接受 `reasoning_effort` 参数，却会忽略未知值回退到默认行为 —— **一次请求返回
成功，不能证明某个档位真实可用**。因此未声明档位的模型只在用户主动授权后动态探测：先确认上游会校验
该参数，再逐项确认哪些规范档位被接受。结果只表示「当前上游接受这个档位」，不承诺它一定改变推理
效果、速度或积分消耗。

## 上游协议硬约束（来自实测，不要"优化"）

| 现象 | 后果 | 本插件的处理 |
|---|---|---|
| `role: "developer"` 发到国内端点 | 400 / `11128` | `prepareCnChatBody` 幂等改写成 `system`；绕过 shim 的调用同样覆盖 |
| system / developer 里出现完整品牌词 | `11128` | 只缩短品牌，句子其余逐字保留；只匹配空格与制表符，`deepseek-harness` 这类路径与包名不动 |
| 正文里出现**裸 `@`**（两侧为空白） | `11128`，0.8.2 实测 | 换成全角 `＠`；`@file`、`@scope/pkg`、邮箱、`@"…"` 一律不动 |
| 「`@` 前缀路径」说明的**两句原文同段出现** | `11128`，0.8.4 实测：`＠` 改写后仍被拦，删掉 `@` 也拦 | 两句各自单独都放行，仅成对触发（与 `@` 字符无关）；同段同时出现时把第二句 `resolve from` 改成 `start from`，实测解拦 |
| 非流式请求 | `11101` Non-stream chat request is currently not supported | `chatStream` 自己保证 `stream: true`，两个端点一致；已带该标志的 body 逐字节不变，不注入 `stream_options` |
| 缺官方客户端的每请求标识与追踪头 | 同属「渠道不合规」，回同一个 `11128` 与同一句「请求被拦截」 | 补齐 `X-Request-ID` / `X-Private-Data` / `x-codebuddy-request` / `traceparent` / `b3` / `X-B3-*` / `X-Trace-ID`；ACP 专属的 `acp-connection-id`、`X-Agent-Intent`、`X-Agent-Purpose` **不伪造** |
| 国内模型目录只读 `/v3/config` | App 形态 UA 下 `cli` agent 消失 → 20 个 id 丢 15 个 | 双源并集：`/v2/enterprises/personal/models` + `/v3/config`，单侧失败自动降级 |
| 把「档位请求成功」当「档位可用」 | 上游忽略未知值，档位看似生效实则没变 | 不猜：授权后逐项探测，结论只覆盖「当前被接受」 |
| 把积分查询当轮询接口 | 每次都是真实计费查询 | 挂载读一次 + 手动刷新 |

> ⚠ 这些拦截**有时限**：同一份请求在被拒后数分钟再发可能就通了。所以「现在能过」不能证明触发点
> 消失，复现要对着新抓的请求体。排查工具见「开发」里的 `cn-refusal-probe`。

## DSH 宿主契约

改动本插件前先读完这节。每一条都会让插件「看起来装了、其实不工作」。

### 客户端半段要三件套齐全

`package.json` 必须有 `exports["./client"]`、`files` 白名单里含该产物、以及 `dsh.client` 段
（`platform` / `inject`）。缺一样宿主就不把 Client 半段下发给 Web GUI，设置页与卡片都不会出现。

`lib/client.js` 是**刻意的 CJS**：宿主渲染进程的模块加载器按
`window.__ModuleLoader__.load({ id, factory: (require) => … })` 取导出，工厂必须返回 `module.exports`。
所以 `npm publish` 会报 `WARN We recommend using the ESM format instead of CommonJS` —— 忽略它，
改成 ESM 会让插件在 App 里加载不到。

### `cordis.patch.yml` 的 `name` 必须与包名一致

loader 按这个 specifier 解析，写错会让整个 profile 启动失败。

### 设置入口有两代

DSH 0.1.5 用 `installSection`，0.1.6+ 用 SettingsForms。插件两份都实现，只在可写设置入口就绪后
才显示开关；等待期间仍按默认值工作。

### 本地服务只走 loopback

shim 与同源 web-status 路由都只接受 loopback 地址。端口若落在 fetch 禁用范围内，国际版会 502 ——
0.7.9 修的就是这个。

### 构建与安装可能不是同一份代码

`version-resolve.ts` 会在加载时比对构建常量与已安装 manifest，不一致时明确告警。改完源码记得重新
`npm run build`（`prepack` 也会跑），否则宿主看到的永远是旧产物。

## 配置

重试策略是插件配置项（`cordis.yml` 中 `llm-workbuddy` 的插件配置），两版共用一份；只在插件加载时
读一次，改完需重载或重启 DSH。

```yaml
llm-workbuddy:
  retryPolicy:
    mode: normal
    maxRetries: 15
    backoff:
      initialDelayMs: 2000
      maxDelayMs: 30000
```

- **省略整个 `retryPolicy` 即保持原行为**。显式配置时 `mode` 必填，其余可选字段按所选模式补齐默认值。
  未配置时沿用 `dsh-llm` 默认值：`mode: normal`、5 次重试、500 ms 起翻倍、10 s 封顶，合计只有约
  **15.5 秒退避等待**（抖动约 14–17 秒），不构成「固定时间窗口内必然恢复」的保证
- 上面的示例最多排入约 360 秒退避（抖动上限约 396 秒），适合覆盖数分钟级中断；中断更久仍需调大
  `maxRetries` 或换线路
- `mode: always` 表示**不设次数上限**，一直重试到成功、取消或插件卸载；不是默认值，只在明确接受
  「请求可能长时间不返回」时使用

## 命令行

```sh
# 登录状态与剩余积分（默认国内版；--provider workbuddy-ai 操作国际版）
dsh plugin --profile web exec dsh-workbuddy-connect status
dsh plugin --profile web exec dsh-workbuddy-connect status --provider workbuddy-ai --json

# 诊断
dsh plugin --profile web exec dsh-workbuddy-connect doctor
```

`logout` 只删除该版插件自留的凭据副本，不动桌面 App 自己的登录，也不承诺一定让模型分组消失
（App 的凭据文件仍在时依然生效）。`desktop` profile 一般由 App 管理，CLI（含 `exec`）对其不可用。

## 已知限制

- **验证环境**：macOS 的 DSH Web / Desktop / TUI 下验证通过（0.3.2 起要求 `0.1.5-rc.1`+、Node 22+）。
  Windows 会探测 Local 与 Roaming AppData，WSL 优先读挂载的 Windows 用户目录；Windows 注册表分支
  的卡片交互仍待实机验证
- **国际版模型目录来自 App 界面接口**：服务端按 User-Agent 分流下发，属私有实现，上游改动可能使其
  失效。届时按「本账号上次成功目录 → 内置目录」降级，并在卡片上标明来源（实时 / 已保存 / 内置）、
  更新时间与失败原因。国内版走官方 CLI 同款接口，不受此影响
- **国际版未覆盖**：Windows / WSL / Linux 下国际版 App 的版本读取尚无可靠来源，会退回最近保存的版本
  或内置值；macOS 已通过真实 shim 验证 GPT 系完整回复、工具调用与续轮
- **企业账号积分仅覆盖国内版**：国际版企业账号仍按个人版接口读取，待实测后再扩展。企业分支在本机
  无法自测（开发机为个人账号），依据官方 App 接口契约实现，欢迎反馈实测结果
- **Windows 与 Linux 用户名不同且环境变量未传入 WSL**：需用 `WORKBUDDY_AUTH_FILE` /
  `WORKBUDDY_AI_AUTH_FILE` 指定凭据位置
- 依赖 WorkBuddy 客户端接口（非官方开放 API），WorkBuddy 更新后插件可能需要随之调整

## 版本兼容

插件版本必须与 DSH 内核匹配，不匹配会导致 DSH 启动失败；桌面版按其内置核心选择。npm 上的最新版
不一定适合你，以实际内核为准：

| DSH 内核 | 推荐插件版 | 注意 |
|---|---|---|
| `0.2.1-rc.3` 及以上、`0.3.0` 之前 | `0.8.4` | 声明 `engines.dsh` 后，同一 `0.2.x` 线内升级内核不必换插件 |
| `0.2.1-rc.2` | `0.7.9` | 仅适配这一内核；与 `0.2.0-rc.2` 不同，请核对 App 内置版本 |
| `0.2.1-rc.1` | `0.7.7` | 内核升级到 pi-ai 1.3.0，历史遗留的 0.87.1 overrides 必须移除 |
| `0.2.0-rc.2` | `0.7.6` | 上一代内核线，勿停留在有注册表回归的 0.7.2 |
| `0.2.0-rc.1` | `0.7.0` | 0.7.1 起不再支持 rc.1 |
| `0.1.5` – `0.1.7` | `0.6.5` | 旧内核最终版 |
| `0.1.2-rc.1` | `0.3.1` | 更早旧线，仅历史维护 |
| `0.1.1-rc.2` | `0.2.6` | 更早旧线，仅历史维护 |

### 为什么内核小版本升级不再需要换插件

`0.8.1` 及更早把六项 DSH 服务 peer 精确钉在 `0.2.1-rc.3`。DSH 的安装校验
（`@deepseek-ai/dsh-app-boot` 的 `evaluatePluginCompatibility`）在插件**没有**声明 `engines.dsh` 时，
会逐条比对每个 `@deepseek-ai/dsh-*` peer 与运行内核；精确版本串匹配不上新内核，于是内核一升级、
插件就装不上：

```text
dsh: installation rejected: Plugin @venshell/dsh-workbuddy-connect@0.8.1 is
incompatible with dsh 0.2.1-rc.4: requirements {"@deepseek-ai/dsh-llm":"0.2.1-rc.3", ...}
```

声明 `engines.dsh` 从结构上消除这个问题：校验一旦发现 `engines.dsh` 就**只**用它判断，peer 全部跳过。
peer 因此回归成纯粹的「构建与测试基准」，安装门槛只剩一条区间：

```json
"engines": { "dsh": ">=0.2.1-rc.3 <0.3.0-0" }
```

- 下界是这一版真正实机验证过的内核，`0.2.1-rc.2` 及更早仍会被拒 —— 本仓库没对它们做过编译与测试
- 上界停在下一个次版本之前。DSH 历史上在次版本改过本插件调用的服务 API
- 写 `<0.3.0-0` 而不是 `<0.3.0`：该校验以 `includePrerelease: true` 匹配，普通 `<0.3.0` 会把
  `0.3.0-rc.1` 一起放行，正好是这里想挡住的下一代预发布版

升级到下一个次版本内核时仍需跟着升级插件，只是不会再出现「内核升完、插件立刻装不上」的窗口期。

**pi-ai 版本按内核线区分，不能混**：0.2.1-rc.1 / rc.2 / rc.3 内核线（插件 0.7.7 / 0.7.8–0.7.9 /
0.8.1 及以后）用 `@earendil-works/pi-ai` 1.3.0（由插件自带），profile 级历史遗留的
`overrides: {'@earendil-works/pi-ai': '0.87.1'}` **必须移除**，否则插件会加载到旧一代 pi-ai 而启动失败；
0.2.0-rc.2 内核线（插件 0.7.6）仍要求 `^0.87.1`，这条线上**不要**把 profile 级 pi-ai 升到 1.x。
第三方插件管理器的「可更新」提示不校验 peer 约束，不能照做
（[#86](https://github.com/corrinehu/dsh-workbuddy-connect/issues/86)）。

## 历次更新

完整记录见 [releases](https://github.com/Venshell/dsh-workbuddy-connect/releases)。

| 版本 | 要点 |
|---|---|
| `0.8.4` | 修复国内版「请求被拦截」复发：网关新规则针对「`@` 前缀路径」说明里两句原文的成对出现，`＠` 改写不再足够；同段出现时把第二句改写一词，实测解拦。原有各条规则全部保留 |
| `0.8.3` | 文档修正：npm 页面与包内的两份 README 换成重写后的版本，安装章节改为四条路并新增「插件页按包名安装」；代码与 0.8.2 逐字节相同 |
| `0.8.2` | 国内版「请求被拦截」修复：对话被回 `11128`、部分请求被回 `11101`，两者均已修好；补官方客户端的每请求标识与追踪头；新增 `engines.dsh` 区间 |
| `0.8.1` | 适配 DSH 0.2.1-rc.3：七项服务 peer 与开发依赖收窄到 rc.3，随包的官方原子写入工具同步升级 |
| `0.8.0` | 修复国内版三处「请求被拦截」或模型消失：`developer` → `system` 改写、品牌词清洗、模型目录改双源并集 |
| `0.7.9` | 恢复 0.2.1-rc.2 上国际版最大上下文窗口开关；避免本地服务绑定 fetch 禁用端口导致 502；同名积分包合并展示 |
| `0.7.8` | 适配 0.2.1-rc.2；官方原子写入工具打包进插件；模型目录快照更新，区分 Hy3 / Hy3-X |
| `0.7.7` | 适配 0.2.1-rc.1：pi-ai 升到 1.3.0；修复档位检测卡在「检测未完成」；修复中文 Windows 控制台 GBK 误判 |
| `0.7.6` | 修复企业账号目录缺 `glm-5.3-flashx`；修复国际版对话被渠道校验拦截 |
| `0.7.5` | 修复切换会话后余额与刷新按钮消失；修复 WSL 调用 Windows 解密程序的环境转发 |
| `0.7.4` | Windows 诊断改进：注册表子进程输出超限分类、跨平台测试假设修正 |
| `0.7.3` | 修复 Windows 非默认安装路径下注册表自动发现失败 |
| `0.7.2` | pi-ai 改为插件自带；修复推理字段被拒。**该版有 Windows 注册表回归**，请用 0.7.4+ |
| `0.7.1` | 收窄 pi-ai 依赖范围 |
| `0.7.0` | 适配 DSH 0.2.0 设置服务改造，不再支持 0.1.x |
| `0.6.5` | 0.1.x 线最终版本 |

## 开发

```sh
npm run build      # tsdown：lib/ 是入库的构建产物
npm run typecheck  # 两个 project（主进程 + client）
npm test           # vitest，单进程
```

测试覆盖：上游请求头与错误分类、CN 正文清洗（developer / 品牌词 / 裸 `@`）、模型目录双源并集、
凭据解析与 WSL 环境转发、推理档位探测的串行队列与授权闸门、模型显隐的按账号持久化、
设置入口两代绑定、`evaluatePluginCompatibility` 的七版本准入、client 组件的结构级渲染。

排查国内版被拒：`DSH_WORKBUDDY_WIRE_DUMP=<文件>`（默认关闭，只在失败时落盘**实际发出的 body**，
不含请求头，因此 bearer 不会落盘）配合 `scripts/cn-refusal-probe.mjs`（`--body` / `--index` /
`--bisect`）。探针会关掉自己进程的写入开关，避免回放污染采集文件。

> Windows 沙箱里 `windows-powershell-registry-integration` 会因 `reg.exe` 不可用而失败，属环境问题。

## 文件地图

| 文件 | 作用 |
|---|---|
| `src/index.ts` | 插件入口：按产品变体注册 provider，装配流式、工具、设置与路由 |
| `src/variants.ts` | 国内版 / 国际版两个产品的差异表（端点、UA、凭据路径、目录来源） |
| `src/auth.ts` | 凭据解析：只读 App 的 auth 文件，刷新写插件副本 |
| `src/desktop-credential-protection.ts` | 5.6.x 起加密 auth 文件的分类、密钥定位与字段解密 |
| `src/upstream.ts` | 上游客户端：chat 流、令牌刷新、模型目录、积分余额 |
| `src/shim.ts` | loopback OpenAI 兼容端点，落实 WorkBuddy 的 wire 怪癖 |
| `src/adapter.ts` | 注册进 `dsh-llm-pi-ai` 的 provider（模型目录、重试策略、调用准备） |
| `src/catalog.ts` / `src/catalog-store.ts` | 模型目录：内置快照 + 上游动态结果的存储与降级 |
| `src/probe.ts` / `src/probe-service.ts` / `src/probe-store.ts` | 推理档位探测：授权闸门、串行队列、结果持久化 |
| `src/visibility-store.ts` | 按账号的模型显隐偏好 |
| `src/loopback.ts` | 本地 HTTP 面的公共栅栏（只接受 loopback） |
| `src/version-resolve.ts` | 构建产物与已安装 manifest 的版本一致性检测 |
| `src/client/*` | Web GUI 半段：设置卡片、配置页、档位检测控件、更新提示 |
| `scripts/cn-refusal-probe.mjs` | 国内版被拒的复现与归因探针 |

## 许可与致谢

[MIT](./LICENSE)。第三方组件的许可与出处见 [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt)。

- [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api)（MIT）— WorkBuddy 上游协议的参照实现
- [franksong2702/dsh-codex-connect](https://github.com/franksong2702/dsh-codex-connect)（Apache-2.0）— DSH 插件结构与 provider 注册的参照

## 维护与社区

原仓库 `corrinehu/dsh-workbuddy-connect` 已不可用，本仓库自 **0.8.0** 起接续维护，保留完整提交历史与
全部贡献者署名。维护者 [@Venshell](https://github.com/Venshell)，原作者
[@corrinehu](https://github.com/corrinehu)，完整名单见 [AUTHORS.md](./AUTHORS.md)。

- **[dsh-workbuddy-switcher](https://github.com/ddGuo/dsh-workbuddy-switcher)**：社区维护的 WorkBuddy 账号管理与切换插件
- **[hana-workbuddy-connect](https://github.com/miaoyongxu/hana-workbuddy-connect)**：复用本项目部分实现，为 HanaAgent 接入 WorkBuddy 模型

以上项目均由第三方独立维护；收录不代表背书，也不构成本插件内部接口的稳定性承诺。

## 免责声明

- 本项目**仅供个人学习和研究使用**，仅驱动使用者自己的 WorkBuddy／WorkBuddy AI 账号在本机调用，
  请勿用于商业用途或超出个人合理使用的场景
- 本项目与腾讯、WorkBuddy、DeepSeek 均无关联，未获其授权或认可；文中出现的名称仅用于描述兼容
  关系，商标权利归各自所有
- **第三方接入存在账号风险。** 官方服务条款对未经授权的第三方接入设有限制。使用本项目可能导致
  账号或功能受限、账号封禁、服务暂停或终止。能够正常调用、正常扣费，不代表获得官方授权或不存在
  账号风险
- 请充分了解上述风险后自行决定是否安装和使用。因使用本项目产生的账号限制、额度损失、服务中断
  等后果，由使用者自行承担；如不能接受，请使用官方客户端
- 本项目不保证服务持续可用、账号不受限制或积分展示始终准确。开发者无法控制平台的限制、处罚或
  服务调整
- 本项目作者不对任何因使用或滥用本项目产生的直接或间接损失负责

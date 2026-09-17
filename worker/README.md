# 可选免费 AI 网关

## 当前选用百炼千问（待账户设置）

提供商已设为 `dashscope`，固定调用北京地域 `qwen3.7-flash`，非思考模式。没有密钥或未确认免费保护时不发送请求，不会自动换付费模型。

1. 在百炼北京地域确认 `qwen3.7-flash` 的剩余免费额度及有效期。新人额度是限时赠送，通常100万Token、90天，不是每天刷新。
2. 对这个精确模型开启“免费额度用完即停”，等待配置生效。已实名账户默认可能按量收费，必须先确认此项；未实名账户由平台强制免费用完即停。
3. 创建北京地域 API Key，在 Cloudflare Worker 的服务端 Secrets 保存为 `DASHSCOPE_API_KEY`。不要放在 Vite 变量或浏览器。
4. 实际确认百炼免费保护生效后，在 Worker Secrets 保存 `DASHSCOPE_FREE_ONLY_CONFIRMED=true`。这个标记只是操作者确认，不能代替百炼后台开关，也不会自动配置百炼账单。
5. 部署代码后实测一条陌生输入。返回 `AllocationQuota.FreeTierOnly` 时停止调用并回到本地，不自动重试或切换模型。

免费额度规则：https://help.aliyun.com/zh/model-studio/new-free-quota
API Key：https://help.aliyun.com/zh/model-studio/get-api-key

下方 Cloudflare AI 绑定方式保留作旧方案参考；仅当 `AI_PROVIDER` 不为 `dashscope` 时使用。

游戏前端始终能离线运行。没有配置网关时，明确显示“本地模式 · AI 未配置”，不会伪称已连接 AI。

原仓库的 Pages 工作流已配置公开网关 `https://lone-army-1937-ai.xuzihao976.workers.dev`。其他仓库必须自行配置；`VITE_AI_GATEWAY_URL` 仓库变量可覆盖该地址。开启按钮仅表示允许调用，收到真实模型回复后才显示“AI 已连接”。

## 连接方式

1. 使用 Cloudflare Workers Free 账户，不要为了本游戏开通付费计划。免费额度耗尽后回退本地，绝不自动购买额度。
2. GitHub 仓库 Settings → Secrets and variables → Actions → Secrets，保存 `CLOUDFLARE_ACCOUNT_ID` 和新建的 `CLOUDFLARE_API_TOKEN`。不要把令牌放进源码或聊天。
3. Actions → Deploy optional AI Worker → Run workflow。令牌需要目标账户的 Workers Scripts 编辑权限及部署所需 Workers AI 权限；权限不足时按报错配置，不使用全局 API Key。
4. 从部署日志复制公开的 `https://lone-army-1937-ai.<账户子域>.workers.dev` 地址。
5. Settings → Secrets and variables → Actions → Variables，添加 `VITE_AI_GATEWAY_URL`，值为上一步公开地址（无末尾路径）。这是公开 URL，不是密钥。
6. Actions → Deploy game to GitHub Pages → Run workflow。进入游戏，点击 AI 按钮开启；新输入与精简战况会发送到 Cloudflare。默认关闭。
7. `/health` 只确认绑定配置，不证明模型可推理。必须再发送一个陌生短句，确认获得 AI 回应；对应军令须经玩家确认后才执行。

## 边界

- 本地先处理常见命令，仅陌生输入调用模型；战报仅接敌、跨日时可选润色。
- 意图只允许固定动作白名单；不允许 AI 撤退、改资源、触发结局或事件。低置信度、错误 JSON、超时均降级。
- 每个 IP 在一个 Cloudflare 位置限制每分钟 6 次。Origin 检查只约束浏览器，不等同身份验证。分布式滥用仍可能耗尽共享额度；如需公开推广应增加 Turnstile 或账户配额。
- Workers Free 当前每日有 10,000 Neurons 免费额度，账户共享，并非每个玩家单独领取；无法承诺无限免费或国内网络一定连通。
- 模型润色可能出现措辞偏差，数字结算卡和原始规则引擎才是权威。

官方资料：
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

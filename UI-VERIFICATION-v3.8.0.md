# 守夜档案 v3.8.0 验收

2026-11-15，源基线main `9d6a7fe`。用户选择第一套方案后，在真实App中接入，未让冻结原型替代游戏。浏览器使用Chromium、隔离测试数据与真实生产构建；本页记录实际覆盖，发布结果另见HANDOFF.md。

| 检查 | 本次结果与边界 |
| --- | --- |
| npm run check | 类型检查、24个文件／442项测试、10,320组语言审查、生产构建通过；沿用已有大包提示 |
| 四行模拟 | --runs=1000 --orders --chatter完成；四策略各250局，无状态约束报错；防守与均衡均100%是已知难度问题，未调整规则 |
| 布局 | 74组实际渲染：320×640、390×844、768×1024、1280×900、844×390、320×480，及200% DOM文字放大和事件／存档／结局状态 |
| 流程 | 32组：三章、选牌、查询、预览、顾问、取消、军令只填入后发送、教学两步、六种待决事件保存恢复、v10迁移、手动存取、实际结局与复盘 |
| 状态 | 查询／预览／顾问／取消比较完整GameStats；三章实际发送与当前引擎投影逐项一致。比较按存档迁移的规范化状态，未删掉RNG或物资字段 |
| 窗口 | 可选工具键盘循环与Escape关闭；必选事件Escape不跳过。事件可滚动至最后选项并保存续选；缺弹交易选项仍禁用 |
| 阅读与目标 | 主要受检按钮≥44px，页面无横向溢出，输入／发送可达；200%字时底部工具亦未裁切；地图与预览独立滚动 |
| 颜色与动态 | 7组实际计算文字配色最低7.537:1；仅代表这些组合。普通打字时“跳过”位置稳定；减少动态效果直接完整显示 |
| 线上与部署 | PR #5合入main a564b6a，Pages运行43727302069成功；同一74布局／32流程在线上复查通过，0脚本错误／0模型请求 |
| 缓存与离线 | 实际3.7.0浏览器缓存升级3.8.0，旧缓存清除、迁入14的v10测试档完整状态保留；立即断网刷新可续档 |
| 请求与脚本 | 本地生产包检查0模型请求、0页面脚本错误；未调用真实模型、未部署Worker |

正文始终使用实际日志。320×640序章记录容器从3.7.0历史同状态123.5px增至225.5px；390为427.1px、1280为477.1px。容器含标题和留白，不是净文字高度、玩家满意率或审美正确率。四行教学结束后的390样本为359.8px，不与序章混算。

## 可审阅证据

- [本地74组布局／32组流程与色彩原始记录](design/ui-verification/v3.8.0/browser-local.json)、[线上同矩阵复查](design/ui-verification/v3.8.0/browser-online.json)
- [真实旧缓存升级及立即离线](design/ui-verification/v3.8.0/warm-upgrade.json)、[升级后续档画面](design/ui-verification/v3.8.0/online-upgraded-save.png)
- [项目检查摘要](design/ui-verification/v3.8.0/checks.json)、[战役模拟原始汇总](design/ui-verification/v3.8.0/campaigns.json)、[普通打字检查](design/ui-verification/v3.8.0/normal-motion.json)
- [真实选关页](design/ui-verification/v3.8.0/start-390x844.png)、[实际新开局](design/ui-verification/v3.8.0/actual-opening-390.png)、[四行教学后](design/ui-verification/v3.8.0/sihang-after-tutorial-390.png)
- [200%文字与预览](design/ui-verification/v3.8.0/font200-preview-street.png)、[阵地弹窗](design/ui-verification/v3.8.0/map-320x640.png)、[有效待决事件](design/ui-verification/v3.8.0/event-corner.png)

大部分状态验收采用固定种子的有效测试档；事件票据由现有issueEvent建立并经迁移校验，发送结果由runGameTurn计算；这些是受控复现场景，不冒充完整玩家战役。旧v10文件是保留777弹药与固定RNG的测试档，不含密钥或玩家身份资料；它与手动槽位用来检测迁移、覆盖及复盘时的资源丢失。

## 复现

普通项目检查只需npm ci与npm run check。可选浏览器验收需在测试环境额外提供Playwright和Chromium，不加入游戏运行依赖。先构建，并在另一个终端运行`npm run preview -- --port 3022`，再执行：

```bash
npx vite-node tools/makeUiReviewFixtures.ts
node tools/verifyNightArchive.cjs
```

默认测试输出test-artifacts/night-archive（已忽略）。默认URL为http://127.0.0.1:3022/，须用预览服务的实际端口；通过UI_REVIEW_URL、UI_REVIEW_OUTPUT、UI_REVIEW_CHROMIUM覆盖。不要把生成的完整引擎测试档放进public；正式App从自身引擎与用户档案取数。

升级验证脚本tools/verifyNightArchiveUpgrade.cjs分--prepare与--finish：前者在实际旧3.7.0线上建立隔离持久浏览器档案、缓存与v10迁移记录；部署后后者使用同一测试档案确认3.8.0、旧缓存清理、完整GameStats保全，再立即断网刷新并续档。独立测试浏览器资料位于输出目录，不能替换用户日常浏览器资料。

## 尚未覆盖

没有真实iOS／Android键盘、系统文字尺寸、完整屏幕阅读器、所有浏览器或长时玩家研究。本轮200%是DOM文字放大，不是浏览器原生缩放或全系统无障碍认证。7种配色不是全界面全部叠加透明度状态；模拟胜率不是玩家胜率。线上部署、同矩阵复查与升级离线结果以HANDOFF.md的发布回执为准。

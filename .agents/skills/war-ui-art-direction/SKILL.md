---
name: war-ui-art-direction
description: Review or change Lone Army's visual direction, chapter selection, game chrome and icons. Use documented shipped-game references, restrained wartime editorial typography and clear state semantics.
---

# 《孤军》美术方向

先读 AGENTS.md、UI-DESIGN.md 与本次涉及的界面，查看真实渲染；不要只凭 class 名判断质量。本 Skill 是项目方法，不提供外部绘图软件或付费服务。

## 方向与依据

采用战地档案、铅字记录的秩序感：暖炭黑、纸白、少量旧铜色；朱红用于危险与实际损失。正文安静、行动明确。参考资料、访问限制与借鉴边界见 UI-DESIGN.md；参考《80 Days》的阅读与选择层级、《This War of Mine》的克制色彩、《Papers, Please》的任务秩序。提取原则，不搬运画面、字体文件、人物或商标。

- 先识别本屏最重要的一个任务，再安排标题、状态、正文、主按钮。多个同亮边框和多色图标不能代替层级。
- 章节页可以用宋体标题与细分隔线形成档案感；长正文按阅读长度排版，数字用等宽或等宽数字，操作标签用无衬线。
- 图标统一线条、尺寸与笔画，配文字。避免彩色 Emoji 混用带来的平台差异与情绪失配。
- 纹理只在文字外的低对比背景出现。不要用模糊、破损字、血迹或持续闪动制造“惨烈”。情感由既有文本与真实后果承担。
- 装饰不得像可交互控件、已发现情报、真实地图或历史原件。新增绘制内容明确为界面装饰，不能冒充档案。

## 专业审查顺序

1. 阅读优先：看不清、找不到、误以为可执行的问题优先于风格。
2. 给出截图证据与严重程度；将可测缺陷、设计判断和待真人验证的偏好分开。
3. 用小范围原型确认层级，检查320/390/768/1280宽度及短屏，再扩展到其他界面。
4. 运行 mobile-game-ui 与 game-ui-verification 的相关步骤，更新交接。不要给审美编造“90%正确率”。

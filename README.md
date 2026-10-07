# JEV 测试项目

本项目只连接 TypeSafe 官方 Jev API。使用 TypeScript 处理输入与测试，React.js 提供本机页面；VSCode 用于编辑和启动。旧第三方测试接口已移除。

## 环境与密钥

- Node.js 22.21 或更新版本
- VSCode
- TypeSafe 官方 API Key，保存在本机 `.env` 的 `TYPESAFE_API_KEY` 中

`.env` 被 `.gitignore` 排除。密钥只在本机服务端读取，不会交给浏览器；不要把密钥写进代码、样本或结果文件。若密钥泄露，请到 TypeSafe 控制台撤销并重新生成。

克隆仓库并进入项目目录：

```powershell
git clone https://github.com/may-tonk/JEV.git
cd JEV
```

私有仓库需要先登录具有访问权限的 GitHub 账号。在 VSCode 中打开项目目录，于终端运行：

```powershell
npm ci
Copy-Item .env.example .env
```

编辑 `.env`，填入自己的 `TYPESAFE_API_KEY`，然后运行：

```powershell
npm run check
npm run test:contract
npm run dev
```

页面默认位于 `http://127.0.0.1:4173`。如果该端口已占用，可在当前 PowerShell 终端先设置 `$env:JEV_PORT="43119"`，然后运行 `npm run dev`。服务仅监听本机地址；用 `Ctrl+C` 停止。

环境变量可通过 `.env` 配置：`TYPESAFE_API_KEY` 为调用官方 API 所需的密钥，`TYPESAFE_MODEL` 默认为 `jev-latest`，`JEV_PORT` 默认为 `4173`。检查、测试和前端构建无需 API Key；提交报告和 UNI 探索性测试会调用官方 API。

## 仓库结构与检查

- `src/`：React 页面、TypeScript 服务端、报告解析、判断规则与测试。
- `public/`：页面 HTML 和样式；`app.js` 由 `npm run build:ui` 生成。
- `data/`：版本化问题配置、规则说明与 UNI 草稿样本。
- `results/`：本机运行生成的请求与响应记录，不纳入 Git。
- `archive/`：本机保留的旧版材料，不纳入 Git。

仓库只保存源码、配置、草稿数据和依赖锁定文件。新克隆的项目不会包含本机历史结果与旧版归档；`results/` 会在首次成功调用后自动创建。`.env`、依赖目录、日志和生成的前端脚本均已忽略。

上传前或修改代码后可运行以下离线检查；GitHub Actions 会在推送和拉取请求时执行同样的检查：

```powershell
npm run check
npm run test:contract
npm run build:ui
```

修改代码后，如果页面显示新版题目却仍提示“选择有效的判断问题”，通常是旧服务端进程还在运行。先复制输入框中尚未提交的报告以防刷新丢失，再停止旧进程、运行 `npm run dev` 并刷新页面。新版页面会检测服务端题目版本，避免再把版本不一致误报为未选题。

## 页面使用

在 `http://127.0.0.1:4173` 打开页面，粘贴 Hermes 完整报告即可进行基础研究。服务端自动生成缺失的案例 ID，并记录提交 UTC 时间；基础研究不会因为提取器认不出资产身份或精确采集时间而拒绝报告。点击“自动提取字段”可回填报告中明确出现的资产、合约、时间、价格、成交量和 7 日/30 日/1 年涨跌幅。7 天和 30 天精确短期判断仍需要可核对的资产身份、时间、价格、流动性、成交量和小时历史；小时价格会检查不重复、无 t0 之后的数据且覆盖对应时间段。缺少哪组数据只跳过对应短期题，不阻塞观察或深入研究。判断题覆盖项目背景、Web3 地位、生态采用、未来发展、竞争位置、催化剂、风险严重程度、代币价值捕获、估值、市场背景和研究优先级。系统会输出研究价值评分与信息覆盖度；每道分类题展示所有选项的相对评分，总分 100，这些评分不是经过校准的投资概率。

报告以 `report-v3` 结构化对象发送给 TypeSafe 官方 Jev，完整原文作为 `raw_report` 保留。题目标准、中文选项、门禁范围和研究分值统一由 `data/report-questions.v3.json` 定义，规则说明在 `data/decision-spec.v3.md`。每次请求与响应保存到 `results/official-report-*.json`，只展示 `report-v3` 历史。页面显示模型置信度；研究价值评分使用各选项的相对权重和固定分值，并由风险主选项施加护栏。`research-policy-v3` 会优先处理阻断性风险和核心证据不足，且区分“仅持续跟踪”与“值得观察”。9 个月和 18 个月目前仅共用长期研究条件，没有各自独立的收益预测。模型权重不是已验证的投资收益概率；只有完成未来结算、基线比较和校准评估后，才允许称为概率。输入门禁、证据分类和研究行动与收益预测相互分离。

结算规则集中在 `src/settlement.ts`：7 天使用 168 小时、30 天使用 720 小时，起点和终点必须使用同一来源并在目标时间 ±5 分钟内。评估指标集中在 `src/evaluation.ts`，包括覆盖率、精确命中率、Brier score 和 Log loss；不合格或未结算样本不进入收益评分。

旧 UNI V1 探索性材料和已有结果仍留在 `data/`、`results/official-uni-*.json`，不会自动填入新页面。

目前 UNI 数据记录、核对说明、问题草案与测试方案分别在 `data/uni-report-snapshot.draft.json`、`data/uni-step2-source-audit.md`、`data/uni-questions.draft.json`、`data/uni-test-protocol.draft.json`。单次模型输出仍不能称为投资准确率。

官方模型默认为 `jev-latest`；若要固定官方版本，在当前终端设置 `TYPESAFE_MODEL`。接口与鉴权集中在 `src/jev-client.ts`。

## UNI V1 探索性测试

规则确认后运行：

```powershell
npm run evaluate:uni
```

该命令读取 `data/uni-jev-state.draft.json` 和 `data/uni-questions.draft.json`，只调用一次官方 Jev，并将不含 API Key 的请求快照和响应写入 `results/official-uni-*.json`。单次结果不能代表投资准确率；只有保存多个点位样本并在未来按预先定义的规则核对后，才可以进行评估。

## 旧 UNI V1 到期结果验证

旧 UNI V1 结果文件仍保留。历史验证接口 `/api/uni-validate` 仍可使用，但新版首页以“粘贴报告 → 判断”为主，没有展示该验证表单。实际收益率应来自事先选定且可复核的价格来源；不要为了让预测命中而临时更换来源或时间。

参考：[TypeSafe 官方 API](https://docs.typesafe.ai/api)、[官方 JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)。

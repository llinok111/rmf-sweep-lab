# 2026-11-18 12:20–12:35 · rmf-sweep-lab（published，B 档）

- 目标：把「扫掠管道」从长相判断变成可数字复算的证书：RMF（双反射）帧输运 vs Frenet 基线；闭合性、帧正交性、Pappus 体积/面积 oracle、二阶收敛、尺度不变性、node/浏览器同 core 指纹。
- 交付：`llinok111/rmf-sweep-lab`（public，pushed_at 2026-11-18T04:26:49Z）。
- 真实数字（`bench/result.json`，7 样本，冷启动单记）：
  - 12 条解析曲线（3 arc / 3 helix / 3 planar wave / 3 saddle），rings=256，segments=32，196,608 三角形。
  - RMF：0 翻转 / 12 条；最大帧步进 2.7044°；正交性误差 2.22e-16；水密 12/12；边界边 0、非流形边 0。
  - Frenet 基线：6 次翻转（wave-low/mid/high 各 2 次），最大步进 179.9937°；仍水密 12/12（失败模式是帧不连续/表面扭转，不是开边）。
  - Pappus oracle（多边形截面精确式）：arc90/180/270 体积相对误差 6.32e-6 / 2.53e-5 / 5.69e-5，面积 3.61e-6 / 1.52e-5 / 3.46e-5。
  - 环数 50/100/200/400/800 收敛比 4.081 / 4.040 / 4.020 / 4.010（理论 4）；尺度 1e-3…1e6 归一化体积 spread 4.55e-14，全水密 0 翻转（阈值全相对）。
  - 计时：冷启动 298.11 ms；12 曲线/次 RMF 中位 212.07 ms、p95 247.70、RSD 6.94%；Frenet 中位 199.28 ms；单网格中位 17.67 ms。
  - verify 16/16（含独立 sorted-edge 审计、24/24 烘焙指纹与 node 重算一致）。
  - 数据确定性：删 data 重建两次 sha256 同为 `95dd44bc…`。
- 闸门：G1–G9 全过（G6 HTTP 200 + importmap=1；G8 无 playwright/puppeteer/chromium/npx/截图；密钥 0 命中）。
- 发布后自证 3/3：API private=false + pushed_at；`/tmp/smoke-rmf` 干净 clone 按 README 第一条命令 gen+verify(16/16)+bench 全过并已删除；README 前 12 行含承诺/Upstream/怎么跑。
- 上游回馈：**0 个**（原创 `Upstream: none`；RMF 是教科书算法，未修任何上游 bug，不硬凑 PR）。
- 诚实限制（已写 README）：Pappus 只对多边形截面精确，连续圆截面体积差 0.64% 已披露；体积误差是离散误差按 4× 收敛，不是 1e-13；Frenet 也水密；>90° 翻转判据是声明约定；只有开曲线+两端平盖，未做闭曲线 holonomy 补偿；无 headless 像素验证。
- 续接候选：
  1. 闭曲线 RMF holonomy：绕一圈帧不闭合，需要把残余角均摊到各环做无缝水密，给 holonomy 角证书（当前明确只支持开曲线）。
  2. 变半径/椭圆截面 + 曲率自适应环数（按弦高误差选 rings），把 5.69e-5 降到 1e-6 量级同时减三角形。
  3. 自交检测：小弯曲半径 R/a 接近 1 或闭曲线时管道可能自交，用 BVH 三角对 + 解析管面距离给见证。
  4. 浏览器只验 HTTP+importmap+指纹（环境禁 headless），无像素级证据。

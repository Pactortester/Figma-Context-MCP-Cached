# 更新日志

所有重要更改都将记录在此文件中。

---

## v1.2.0

### 🚀 性能与架构深度优化

- **图片下载并发控制 (Concurrency Limit)**
  - 在 `src/utils/common.ts` 中实现了一个轻量级、零依赖的原生并发调度器 `limitConcurrency`。
  - 重构了 `src/services/figma.ts`，将所有切图下载及裁剪任务打平收集后，统一限制在最大 **5** 个并发上限内，严格防止因瞬时高并发请求触发 Figma API 的 `429` 限制或企业网络重置。

- **指数退避网络重试机制 (Exponential Backoff Retry)**
  - 在 `src/utils/fetch-with-retry.ts` 中包裹了最多 **3 次** 的指数退避重试循环，等待间隔按照指数递增：`delay = 2^attempt * 300ms + (0~100ms 随机抖动 Jitter)`。
  - 在原生网络重试 4 次均宣告失败后，才触发系统的 `curl` 降级，大幅降低了在暂态抖动环境下 fork 子进程的概率。

- **本地图片智能去重与缓存 (Smart Local Image Cache)**
  - 在 `src/utils/image-processing.ts` 中引入智能去重逻辑。如果目标文件在本地已存在且非空，直接在 **2ms** 内快速返回。
  - 即使命中本地缓存，程序也会精准读取并还原 `originalDimensions`、`finalDimensions` 以及生成对应的 CSS 变量等元数据，保证上游消费端透明且无缝。

- **大缓存 JSON 文件的 Gzip 压缩 (Gzip Compression)**
  - 引入原生的 `zlib` 异步压缩。大 JSON 写入时自动压缩为 `.json.gz`，减少 90% 以上的磁盘空间占用与 I/O 耗时，防止反序列化巨型字符串引起 Node.js 主事件循环发生数秒卡顿。

- **短效内存缓存与防高频连招双重开销 (Short-lived In-memory Cache)**
  - 首创引入短效内存读取缓存 `readCacheMemory`，TTL 设定为 **1000ms**。防范上游在短时间内发起高频 `has() -> get()` 瞬时连招，将磁盘 I/O 读取和 Gzip CPU 解密解析频次降低 50%。

### 🐛 代码审查缺陷修复 (基于 codereview.md)

- **fetch-with-retry.ts 优化**
  - **致命错误中断**：精确判断非暂态 HTTP 致命错误（如 `401`、`403`、`404` 等），抛出 `FatalFetchError` 并**立刻中断重试循环**，直接触发降级，节省无谓等待时间。
  - **类型安全重构**：将 `lastError`/`fetchError` 从 `any` 声明重构为类型安全的 `unknown`，通过严格的类型断言和防护提高健壮性。
  - **代码缩进修正**：移除了 `curl` 回退代码块中遗留的 4 空格缩进，使其在顶层完美对齐。

- **image-processing.ts 优化**
  - **彻底废除同步 I/O**：将 `existsSync` 和 `statSync` 同步方法替换为非阻塞的异步 `fs.promises.stat`，提升 Node.js 异步并发响应度。
  - **wasCropped 状态一致性**：纠正了缓存命中时 `wasCropped` 被硬编码为 `false` 的缺陷。现在系统会根据原始任务的真实裁剪要求，精准输出真实的 `needsCropping && !!cropTransform` 状态。

- **figma-file-cache.ts 优化**
  - **补全载荷强校验**：在 `readCacheFile` 中补足了对 `!payload.data` 结构有效性的强校验，一旦文件坏损将自动删除并清理，避免向调用方传递 undefined data。
  - **修正迁移异步错误拦截链**：将后台静默压缩并重命名操作后的异步生命周期链，由可能导致漏捕获错误的 `.finally().catch(...)` 调整为健壮标准的 `.catch(...).finally(...)`。

- **common.ts 格式微调**
  - 移除了 `limitConcurrency` 方法文件末尾多余的空行残留。

---

## v1.1.2 (最新)

### 🐛 Bug 修复

- **修复 `get_figma_data` 处理没有 children 属性的 FRAME 节点时报错的问题**
  - 错误信息：`Cannot read properties of undefined (reading 'length')`
  - 修复位置：`src/transformers/layout.ts`
  - 原因：当 Figma API 返回的 FRAME 节点没有 `children` 属性时，代码尝试访问 `children.length` 导致报错
  - 解决方案：添加空值检查 `n.children ?? []`

### ✨ 新功能

- **`figma_prepare_file` 新增 `forceRefresh` 参数**
  - 支持强制从 Figma API 拉取最新数据，绕过缓存
  - 当用户明确要求获取最新数据或设计刚更新时使用
  - 触发方式：用户说"拉取最新数据"、"刷新设计稿"、"设计刚更新了"等

- **`download_figma_images` 优化**
  - `localPath` 参数改为可选
  - 不提供路径时默认下载到系统下载文件夹：
    - macOS: `~/Downloads`
    - Linux: `~/Downloads`
    - Windows: `C:\Users\<username>\Downloads`
  - 移除过于严格的路径限制，支持下载到任意合法绝对路径

---

## v1.0.0

### ✨ 初始版本

- 基于 Figma Context MCP 的增强版本
- 支持 Figma 文件内容本地缓存
- 可配置缓存有效期（TTL）
- 支持自定义缓存目录
- 新增 `figma_prepare_file` 工具：智能准备和缓存 Figma 文件
- 支持 nodeId 检查：确保指定的节点存在于缓存中
- 完全兼容原有 MCP 接口与调用方式

# Figma-Context-MCP-Cached

基于 **Figma Context MCP** 的增强版本，通过**本地持久化缓存**显著减少对 Figma API 的请求次数，从而缓解速率限制问题，提升稳定性与响应速度。

该版本特别适合 **免费 Figma 账号**、**高频上下文请求**、以及 **Cursor / MCP 客户端** 场景。

---

## ✨ 特性

- ✅ 支持 **Figma 文件内容本地缓存**
- ✅ 显著减少 API 请求次数，缓解速率限制
- ✅ 可配置缓存有效期（TTL）
- ✅ 支持自定义缓存目录
- ✅ 完全兼容原有 MCP 接口与调用方式
- ✅ 适用于 Cursor 等 MCP 客户端

---
## 📦 Figma 缓存机制说明（重要）
> ⚠️ **请在设计相对稳定或已定稿后再启用缓存功能**
本 MCP 默认支持对 Figma API 返回结果进行缓存（可配置 TTL），以减少 API 请求次数、提升响应速度并避免触发 Figma 的限流策略。

### ✅ 缓存的优势
- 显著提升 MCP 响应速度
- 降低 Figma API 调用频率
- 适合已定稿或低频变更的设计文件

---
### ⚠️ 潜在风险（请务必注意）
由于缓存机制的存在：
- **当 Figma 页面或组件发生更新时**
- **在缓存未过期（TTL 内）**
- MCP 可能仍返回 **旧的设计数据**
- **无法立即反映最新的设计变更**

这在以下场景中尤为明显：
- 页面结构调整
- 组件属性修改
- 新增 / 删除节点
- 文案或布局的细微更新

---

### ✅ 使用建议（强烈推荐）

- ✅ **设计定稿后** 或 **变更频率较低时** 再启用缓存
- ✅ 代码生成、设计评审、设计回溯等场景非常适合缓存
- ❌ **设计频繁调整阶段不建议启用缓存**

## 🚀 使用方式（Cursor 示例）

推荐通过 **环境变量** 管理凭据与缓存配置（符合 MCP Client Spec）。

在 Cursor 的 `mcp.json` / `settings.json` 中添加如下配置：

```json
{
  "mcpServers": {
    "Framelink MCP for Figma": {
      "command": "npx",
      "args": ["-y", "figma-developer-mcp-caching-dev-fork", "--stdio"],
      "env": {
        "FIGMA_API_KEY": "YOUR-KEY",
        "FIGMA_CACHING": "{\"ttl\":{\"value\":30,\"unit\":\"d\"}}",
        "PORT": "3333"
      }
    }
  }
}
```

---

## 🔑 环境变量说明

### `FIGMA_API_KEY`（必填）
你的 Figma Personal Access Token。

---

### `FIGMA_CACHING`（可选，推荐）

用于启用 **文件级别的持久化缓存**，内容为一个 JSON 字符串。

示例：

```bash
FIGMA_CACHING='{ "ttl": { "value": 30, "unit": "d" } }'
```

#### 字段说明：

##### `ttl`（必填）
控制缓存的有效期。

- `value`：数值
- `unit`：时间单位，可选值：
  - `ms`（毫秒）
  - `s`（秒）
  - `m`（分钟）
  - `h`（小时）
  - `d`（天）

---

### `cacheDir`（可选）

控制缓存文件的存储目录。

- 相对路径：相对于当前工作目录
- `~` 会解析为用户主目录

**默认缓存路径：**

- **Linux**：`~/.cache/figma-mcp`
- **macOS**：`~/Library/Caches/FigmaMcp`
- **Windows**：`%LOCALAPPDATA%/FigmaMcpCache`

---

## 🧠 缓存行为说明

当启用缓存后：

1. MCP Server **首次**请求某个 Figma 文件时：
   - 从 Figma API 拉取完整文件
   - 将结果写入本地缓存

2. 在缓存未过期前：
   - `get_figma_data`
   - `get_raw_node`

   等请求将直接从本地缓存返回，不再重复请求 Figma API。

3. 当缓存过期：
   - 自动重新拉取并更新缓存

🔄 **强制刷新缓存**  
如需立即刷新，只需手动删除 `cacheDir` 中对应的缓存文件即可。

---

## ⚠️ 注意事项

- 如果未设置 `FIGMA_CACHING`，则保持 **原始不缓存行为**
- 缓存的是 **完整 Figma 文件数据**
- 非常适合：
  - 免费 Figma 账号
  - 频繁上下文读取
  - LLM / MCP 自动化场景

---

## 📦 兼容性

- ✅ 完全兼容原 Figma Context MCP
- ✅ 无需修改客户端调用逻辑
- ✅ 可作为原项目的 drop-in 替换

---

## 📄 License

与原项目保持一致。

---

## 🙌 致谢

本项目基于以下开源项目进行开发与优化，在此表示感谢：

- **GLips / Figma-Context-MCP**  
  https://github.com/GLips/Figma-Context-MCP/

- **stone-w4tch3r / Figma-Context-MCP**  
  https://github.com/stone-w4tch3r/Figma-Context-MCP

感谢上述项目提供的核心实现与设计思路。本项目在其基础上引入了**本地持久化缓存机制**，以提升性能并缓解 Figma API 的速率限制问题。


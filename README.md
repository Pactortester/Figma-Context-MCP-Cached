# Figma-Context-MCP-Cached

<div align="center">
  <img src="./docs/logo.png" alt="Figma Context MCP Logo" width="200" style="border-radius: 50%; border: 3px solid #e0e0e0; padding: 10px; background-color: #ffffff;">
  
  <br>

</div>

> **English Version**: [README_EN.md](./README_EN.md)

基于 **Figma Context MCP** 的增强版本，通过**本地持久化缓存**显著减少对 Figma API 的请求次数，从而缓解速率限制问题，提升稳定性与响应速度。

该版本特别适合 **免费 Figma 账号**、**高频上下文请求**、以及 **Cursor / MCP 客户端** 场景。

---

## ✨ 特性

- ✅ 支持 **Figma 文件内容本地缓存**
- ✅ 显著减少 API 请求次数，缓解速率限制
- ✅ 可配置缓存有效期（TTL）
- ✅ 支持自定义缓存目录
- ✅ **`figma_prepare_file` 工具**：智能准备和缓存 Figma 文件
- ✅ **支持 nodeId 检查**：确保指定的节点存在于缓存中
- ✅ **支持强制刷新**：通过 `forceRefresh` 参数强制获取最新设计数据
- ✅ **智能下载路径**：图片下载默认保存到系统下载文件夹（支持 Windows/macOS/Linux）
- ✅ **优化的 LLM 调用引导**：自动引导正确的工具调用顺序
- ✅ 完全兼容原有 MCP 接口与调用方式
- ✅ **`list_cache` 工具**：查看缓存状态和统计信息
- ✅ **`cleanup_cache` 工具**：清理过期和损坏的缓存文件
- ✅ **自动缓存清理**：定时清理过期缓存，保持磁盘空间整洁
- ✅ **LRU 内存缓存**：智能内存缓存，避免重复磁盘 I/O
- ✅ **节点级别缓存**：内存中缓存已解析的节点数据
- ✅ **可选缓存加密**：支持 AES-256-CBC 加密保护敏感设计数据
- ✅ 适用于 Cursor 等 MCP 客户端

---

## 🚀 快速开始（30 秒上手）

### 1. 获取 Figma API Key
访问 [Figma 开发者设置](https://www.figma.com/developers/api#access-tokens) 创建 Personal Access Token。

### 2. 配置 MCP（以 Cursor 为例）

在 Cursor 的 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "Figma-Context-MCP-Cached": {
      "command": "npx",
      "args": [
        "-y",
        "@pactortester/figma-mcp-cached",
        "--stdio",
        "--figma-api-key=YOUR_FIGMA_API_KEY",
        "--figma-caching={\"ttl\":{\"value\":7,\"unit\":\"d\"}}"
      ]
    }
  }
}
```

### 3. 开始使用

在 Cursor 中直接粘贴 Figma 链接，AI 会自动：
1. 调用 `figma_prepare_file` 准备文件
2. 调用 `get_figma_data` 获取设计数据

> 💡 **提示**：首次请求会从 Figma API 获取数据并缓存，后续请求直接从本地缓存读取，速度提升 10 倍以上！

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

## 📜 开发脚本说明

详细的 NPM Scripts 使用指南请查看 [SCRIPTS.md](./SCRIPTS.md)，包含：
- 构建和开发命令
- 版本管理脚本（一键更新版本号）
- 发布流程说明
- 常用工作流示例

---

## 🚀 使用方式

### 命令行参数（适合 MCP 市场托管）

#### 基础配置

```json
{
  "mcpServers": {
    "Figma-Context-MCP-Cached": {
      "command": "npx",
      "args": [
        "-y",
        "@pactortester/figma-mcp-cached",
        "--stdio",
        "--figma-api-key=YOUR-KEY",
        "--figma-caching={\"ttl\":{\"value\":30,\"unit\":\"d\"}}"
      ]
    }
  }
}
```

#### 完整配置（包含所有可选项）

```json
{
  "mcpServers": {
    "Figma-Context-MCP-Cached": {
      "command": "npx",
      "args": [
        "-y",
        "@pactortester/figma-mcp-cached",
        "--stdio",
        "--figma-api-key=YOUR-KEY",
        "--figma-caching={\"ttl\":{\"value\":30,\"unit\":\"d\"},\"cacheDir\":\"~/figma-cache\",\"autoCleanup\":true,\"cleanupInterval\":{\"value\":1,\"unit\":\"h\"},\"maxMemoryCacheSize\":200,\"encryptionKey\":\"your-secret-key\"}"
      ]
    }
  }
}
```

**优先级说明：** 命令行参数 > 环境变量

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

### `autoCleanup`（可选）

是否启用自动清理过期缓存。默认为 `true`。

- `true`：自动定时清理过期缓存文件
- `false`：禁用自动清理（需手动调用 `cleanup_cache` 工具）

---

### `cleanupInterval`（可选）

自动清理的执行间隔。默认为每小时一次。

- `value`：数值
- `unit`：时间单位（同 `ttl`）

---

### `maxMemoryCacheSize`（可选）

内存中缓存的最大条目数（LRU 淘汰）。默认为 `100`。

设置为较小的值可以减少内存占用，设置为较大的值可以提高缓存命中率。

---

### `encryptionKey`（可选）

缓存文件加密密钥。设置后，所有缓存文件将使用 AES-256-CBC 加密存储。

适用于保护敏感设计数据的场景。密钥应妥善保管，丢失密钥将无法读取已加密的缓存。

---

## 🧠 缓存行为说明

当启用缓存后：

1. MCP Server **首次**请求某个 Figma 文件时：
   - 从 Figma API 拉取完整文件
   - 将结果写入本地缓存

2. 在缓存未过期前：
   - `get_figma_data` 请求将直接从本地缓存返回，不再重复请求 Figma API

3. 当缓存过期：
   - 自动重新拉取并更新缓存

🔄 **强制刷新缓存**
- **推荐方式**：调用 `figma_prepare_file` 时设置 `forceRefresh: true`，或告诉 LLM "拉取最新数据"
- **手动方式**：删除 `cacheDir` 中对应的缓存文件

---

## 🛠️ MCP Tools 详细说明

本项目提供三个 MCP 工具，用于与 Figma 设计文件交互。

---

### 1️⃣ `figma_prepare_file` - 文件准备工具

智能文件准备工具，用于在获取 Figma 数据之前确保文件已准备好。

**主要特性：**
- ✅ **自动缓存检查**：检查文件是否已缓存且有效
- ✅ **nodeId 验证**：如果提供了 nodeId，会验证该节点是否存在于缓存中
- ✅ **智能刷新**：如果缓存过期或 nodeId 不存在，自动重新拉取文件
- ✅ **强制刷新**：支持强制拉取最新数据，绕过缓存
- ✅ **缓存未启用提示**：即使缓存未启用，也会提供明确的提示信息

**工具参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `figmaUrl` | string | ✅ | Figma 设计文件 URL，支持格式：`https://www.figma.com/design/<fileKey>/...?node-id=<nodeId>` |
| `forceRefresh` | boolean | ❌ | 设为 `true` 时强制从 Figma API 拉取最新数据，绕过缓存。当用户明确要求获取最新数据或设计刚更新时使用 |

**使用方式：**

当用户提供 Figma URL 时，LLM 会自动：
1. **首先调用** `figma_prepare_file` 准备文件
2. **然后调用** `get_figma_data` 获取数据

```
用户提供 URL → figma_prepare_file (准备文件) → get_figma_data (获取数据)
```

**强制刷新示例：**
```json
{
  "figmaUrl": "https://www.figma.com/design/xxx/...",
  "forceRefresh": true
}
```

用户可以通过以下方式触发强制刷新：
- "帮我拉取最新的设计稿"
- "刷新一下这个 Figma 文件"
- "设计刚更新了，重新获取一下"

**返回值说明：**
- **缓存已存在且有效**：返回提示信息，不拉取数据
- **缓存不存在或过期**：自动拉取并缓存文件
- **nodeId 不存在**：重新拉取文件并验证 nodeId
- **强制刷新**：直接从 API 拉取最新数据并更新缓存
- **缓存未启用**：返回警告信息，提示需要配置缓存

---

### 2️⃣ `get_figma_data` - 获取 Figma 数据

获取 Figma 文件的完整设计数据，包括布局、内容、视觉样式和组件信息。

**⚠️ 重要**：调用此工具前，必须先调用 `figma_prepare_file` 准备文件。

**工具参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `fileKey` | string | ✅ | Figma 文件的 key，通常在 URL 中：`figma.com/design/<fileKey>/...` |
| `nodeId` | string | ❌ | 要获取的节点 ID，格式如 `1234:5678` 或 `1234-5678`。如果 URL 中包含 `node-id` 参数则必须使用 |
| `depth` | number | ❌ | 遍历节点树的深度。除非用户明确要求，否则不要使用此参数 |

**使用示例：**
```json
{
  "fileKey": "QlQwKAl9abcdhvlfvpM5K",
  "nodeId": "2777:9428"
}
```

**返回数据：**
- `metadata`：文件元数据
- `nodes`：节点树结构，包含布局、样式、文本等信息
- `globalVars`：全局样式变量（复用的样式会被提取为变量）
- `components`：组件定义
- `componentSets`：组件集定义

---

### 3️⃣ `download_figma_images` - 下载 Figma 图片

从 Figma 文件中下载 SVG 和 PNG 格式的图片资源。

**工具参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `fileKey` | string | ✅ | Figma 文件的 key |
| `nodes` | array | ✅ | 要下载的节点数组（详见下方） |
| `localPath` | string | ❌ | 图片保存目录的绝对路径。不提供时默认保存到系统下载文件夹 |
| `pngScale` | number | ❌ | PNG 图片的导出倍率，默认为 `2`（2x） |

**`nodes` 数组中每个元素的参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nodeId` | string | ✅ | 节点 ID，格式如 `1234:5678` 或 `1234-5678` |
| `fileName` | string | ✅ | 保存的文件名，必须以 `.png` 或 `.svg` 结尾 |
| `imageRef` | string | ❌ | 图片填充的引用 ID。如果节点使用图片填充则必须提供；下载 SVG 矢量图时留空 |
| `needsCropping` | boolean | ❌ | 是否需要根据变换矩阵裁剪图片 |
| `cropTransform` | array | ❌ | Figma 变换矩阵，用于图片裁剪 |
| `requiresImageDimensions` | boolean | ❌ | 是否需要返回图片尺寸信息（用于生成 CSS 变量） |

**使用示例：**
```json
{
  "fileKey": "QlQwKAl9abcdhvlfvpM5K",
  "nodes": [
    {
      "nodeId": "2777-9428",
      "fileName": "hero-image.png"
    },
    {
      "nodeId": "2777-9430",
      "fileName": "icon-star.svg"
    }
  ],
  "pngScale": 2
}
```

**默认下载路径：**
- **macOS**: `~/Downloads`
- **Linux**: `~/Downloads`
- **Windows**: `C:\Users\<username>\Downloads`

**返回信息：**
- 下载成功的图片数量
- 保存路径
- 每张图片的文件名、尺寸、是否裁剪等信息

---

### 4️⃣ `list_cache` - 查看缓存状态

列出并显示当前缓存状态，包括缓存文件、总大小、缓存目录和 TTL 配置。

**工具参数：** 无

**返回信息：**
- `enabled`：缓存是否已启用
- `cacheDir`：缓存目录路径
- `fileCount`：缓存文件数量
- `totalSize`：人类可读的总缓存大小
- `ttl`：人类可读的 TTL 时长

**使用示例：**
```json
{}
```

**示例响应：**
```json
{
  "enabled": true,
  "cacheDir": "~/Library/Caches/FigmaMcp",
  "fileCount": 5,
  "totalSize": "15.7 MB",
  "totalSizeBytes": 16462643,
  "ttl": "7d",
  "ttlMs": 604800000
}
```

---

### 5️⃣ `cleanup_cache` - 清理缓存

清理过期和损坏的缓存文件。此工具会删除超过 TTL（生存时间）的缓存文件以及任何损坏的缓存条目。

**工具参数：** 无

**返回信息：**
- `deletedFiles`：删除的文件数量
- `previousSize`：清理前的缓存大小
- `currentSize`：清理后的缓存大小
- `currentFileCount`：剩余缓存文件数量

**使用示例：**
```json
{}
```

---

## ⚠️ 注意事项

- 如果未设置 `FIGMA_CACHING`（环境变量或命令行参数），则保持 **原始不缓存行为**
- 缓存的是 **完整 Figma 文件数据**
- 命令行参数优先级高于环境变量
- **工具调用顺序**：当用户提供 Figma URL 时，LLM 会自动先调用 `figma_prepare_file`，再调用 `get_figma_data`
- 非常适合：
  - 免费 Figma 账号
  - 频繁上下文读取
  - LLM / MCP 自动化场景
  - MCP 市场托管（通过命令行参数配置，无需服务器端环境变量）

---

## 📦 兼容性

- ✅ 完全兼容原 Figma Context MCP
- ✅ 无需修改客户端调用逻辑
- ✅ 可作为原项目的 drop-in 替换

---

## 📋 更新日志

查看完整更新日志请访问 [CHANGELOG.md](./CHANGELOG.md)

---

## 📄 License

本项目基于 [MIT License](./LICENSE) 开源。

---

## 🙌 致谢

本项目基于以下开源项目进行开发与优化，在此表示感谢：

- **GLips / Figma-Context-MCP**  
  https://github.com/GLips/Figma-Context-MCP/

- **stone-w4tch3r / Figma-Context-MCP**  
  https://github.com/stone-w4tch3r/Figma-Context-MCP

感谢上述项目提供的核心实现与设计思路。本项目在其基础上引入了**本地持久化缓存机制**，以提升性能并缓解 Figma API 的速率限制问题。


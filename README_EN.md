# Figma-Context-MCP-Cached

<div align="center">
  <img src="./docs/logo.png" alt="Figma Context MCP Logo" width="200" style="border-radius: 50%; border: 3px solid #e0e0e0; padding: 10px; background-color: #ffffff;">
  
  <br>

</div>

An enhanced version of **Figma Context MCP** that significantly reduces Figma API requests through **local persistent caching**, thereby alleviating rate limiting issues and improving stability and response speed.

This version is particularly suitable for **free Figma accounts**, **high-frequency context requests**, and **Cursor / MCP client** scenarios.

---

## ✨ Features

- ✅ **Local caching** for Figma file content
- ✅ Significantly reduces API requests and alleviates rate limiting
- ✅ Configurable cache expiration (TTL)
- ✅ Custom cache directory support
- ✅ **`figma_prepare_file` tool**: Intelligently prepare and cache Figma files
- ✅ **nodeId verification**: Ensures specified nodes exist in cache
- ✅ **Force refresh support**: Force fetch latest design data via `forceRefresh` parameter
- ✅ **Smart download path**: Image downloads default to system Downloads folder (supports Windows/macOS/Linux)
- ✅ **Optimized LLM call guidance**: Automatically guides correct tool call sequence
- ✅ Fully compatible with original MCP interface and calling methods
- ✅ **`list_cache` tool**: View cache status and statistics
- ✅ **`cleanup_cache` tool**: Clean up expired and corrupted cache files
- ✅ **Automatic cache cleanup**: Periodically cleans expired cache to keep disk space tidy
- ✅ **LRU memory cache**: Intelligent memory caching to avoid redundant disk I/O
- ✅ **Node-level caching**: Caches parsed node data in memory
- ✅ **Optional cache encryption**: AES-256-CBC encryption to protect sensitive design data
- ✅ Works with Cursor and other MCP clients

---

## 🚀 Quick Start (30 seconds)

### 1. Get Figma API Key
Visit [Figma Developer Settings](https://www.figma.com/developers/api#access-tokens) to create a Personal Access Token.

### 2. Configure MCP (Example: Cursor)

Add to your Cursor MCP configuration file:

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

### 3. Start Using

Paste Figma links directly in Cursor, and the AI will automatically:
1. Call `figma_prepare_file` to prepare the file
2. Call `get_figma_data` to fetch design data

> 💡 **Tip**: The first request fetches data from Figma API and caches it. Subsequent requests read directly from local cache, improving speed by 10x or more!

---

## 📦 Figma Caching Mechanism (Important)
> ⚠️ **Please enable caching after design is relatively stable or finalized**
This MCP supports caching Figma API results (configurable TTL) to reduce API requests, improve response speed, and avoid triggering Figma's rate limiting.

### ✅ Caching Benefits
- Significantly improves MCP response speed
- Reduces Figma API call frequency
- Suitable for finalized or low-frequency design files

---

### ⚠️ Potential Risks (Please Note)
Due to the caching mechanism:
- **When Figma pages or components are updated**
- **Before cache expiration (within TTL)**
- MCP may still return **old design data**
- **Cannot immediately reflect latest design changes**

This is particularly noticeable in:
- Page structure changes
- Component property modifications
- Adding/removing nodes
- Minor text or layout updates

---

### ✅ Usage Recommendations (Strongly Recommended)

- ✅ **After design finalization** or **when change frequency is low** to enable caching
- ✅ Code generation, design review, design retrospection are great use cases for caching
- ❌ **Not recommended during frequent design adjustment phases**

## 📜 Development Scripts

For detailed NPM Scripts usage guide, see [SCRIPTS.md](./SCRIPTS.md), which includes:
- Build and development commands
- Version management scripts (one-click version updates)
- Publishing workflow
- Common workflow examples

---

## 🚀 Usage

### Command Line Arguments (Suitable for MCP Marketplace Hosting)

#### Basic Configuration

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

#### Full Configuration (All Options)

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

**Priority:** Command line arguments > Environment variables

#### Field Descriptions:

##### `ttl` (Required)
Controls cache expiration.

- `value`: Numeric value
- `unit`: Time unit, options:
  - `ms` (milliseconds)
  - `s` (seconds)
  - `m` (minutes)
  - `h` (hours)
  - `d` (days)

---

### `cacheDir` (Optional)

Controls cache file storage directory.

- Relative path: Relative to current working directory
- `~` resolves to user home directory

**Default cache paths:**

- **Linux**: `~/.cache/figma-mcp`
- **macOS**: `~/Library/Caches/FigmaMcp`
- **Windows**: `%LOCALAPPDATA%/FigmaMcpCache`

---

### `autoCleanup` (Optional)

Whether to enable automatic cleanup of expired cache files. Default is `true`.

- `true`: Automatically clean up expired cache files on a schedule
- `false`: Disable automatic cleanup (use `cleanup_cache` tool manually)

---

### `cleanupInterval` (Optional)

Interval for automatic cleanup execution. Default is once per hour.

- `value`: Numeric value
- `unit`: Time unit (same as `ttl`)

---

### `maxMemoryCacheSize` (Optional)

Maximum number of entries in the in-memory LRU cache. Default is `100`.

Setting a smaller value reduces memory usage; setting a larger value improves cache hit rate.

---

### `encryptionKey` (Optional)

Encryption key for cache files. When set, all cache files will be encrypted using AES-256-CBC.

Use this to protect sensitive design data. Keep the key safe - losing it means encrypted cache files cannot be read.

---

## 🧠 Cache Behavior

When caching is enabled:

1. **First request** for a Figma file:
   - Fetches complete file from Figma API
   - Writes results to local cache

2. Before cache expiration:
   - `get_figma_data` requests return directly from local cache without repeating Figma API calls

3. When cache expires:
   - Automatically re-fetches and updates cache

🔄 **Force Refresh Cache**
- **Recommended method**: Set `forceRefresh: true` when calling `figma_prepare_file`, or tell LLM "fetch latest data"
- **Manual method**: Delete corresponding cache files from `cacheDir`

---

## 🛠️ MCP Tools Details

This project provides three MCP tools for interacting with Figma design files.

---

### 1️⃣ `figma_prepare_file` - File Preparation Tool

Intelligent file preparation tool for ensuring files are ready before fetching Figma data.

**Key Features:**
- ✅ **Automatic cache check**: Checks if file is cached and valid
- ✅ **nodeId verification**: If nodeId is provided, verifies the node exists in cache
- ✅ **Smart refresh**: Automatically re-fetches file if cache expires or nodeId doesn't exist
- ✅ **Force refresh**: Supports forcing latest data fetch, bypassing cache
- ✅ **Cache not enabled prompt**: Provides clear prompt even if caching is not enabled

**Tool Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `figmaUrl` | string | ✅ | Figma design file URL, supports format: `https://www.figma.com/design/<fileKey>/...?node-id=<nodeId>` |
| `forceRefresh` | boolean | ❌ | When set to `true`, forces fetching latest data from Figma API, bypassing cache. Use when user explicitly requests latest data or design was just updated |

**Usage:**

When user provides Figma URL, LLM will automatically:
1. **First call** `figma_prepare_file` to prepare file
2. **Then call** `get_figma_data` to fetch data

```
User provides URL → figma_prepare_file (prepare file) → get_figma_data (fetch data)
```

**Force Refresh Example:**
```json
{
  "figmaUrl": "https://www.figma.com/design/xxx/...",
  "forceRefresh": true
}
```

Users can trigger force refresh via:
- "Help me fetch the latest design draft"
- "Refresh this Figma file"
- "Design was just updated, re-fetch it"

**Return Value Description:**
- **Cache exists and valid**: Returns prompt message, no data fetched
- **Cache doesn't exist or expired**: Automatically fetches and caches file
- **nodeId doesn't exist**: Re-fetches file and verifies nodeId
- **Force refresh**: Directly fetches latest data from API and updates cache
- **Cache not enabled**: Returns warning message indicating cache needs configuration

---

### 2️⃣ `get_figma_data` - Get Figma Data

Fetches complete design data from Figma file, including layout, content, visual styles, and component information.

**⚠️ Important**: Before calling this tool, you must first call `figma_prepare_file` to prepare the file.

**Tool Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileKey` | string | ✅ | Figma file key, typically in URL: `figma.com/design/<fileKey>/...` |
| `nodeId` | string | ❌ | Node ID to fetch, format like `1234:5678` or `1234-5678`. Required if URL contains `node-id` parameter |
| `depth` | number | ❌ | Depth for traversing node tree. Don't use unless user explicitly requests |

**Usage Example:**
```json
{
  "fileKey": "QlQwKAl9abcdhvlfvpM5K",
  "nodeId": "2777:9428"
}
```

**Returned Data:**
- `metadata`: File metadata
- `nodes`: Node tree structure, including layout, styles, text, etc.
- `globalVars`: Global style variables (reused styles extracted as variables)
- `components`: Component definitions
- `componentSets`: Component set definitions

---

### 3️⃣ `download_figma_images` - Download Figma Images

Downloads SVG and PNG image resources from Figma files.

**Tool Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileKey` | string | ✅ | Figma file key |
| `nodes` | array | ✅ | Array of nodes to download (see details below) |
| `localPath` | string | ❌ | Absolute path for image save directory. Defaults to system Downloads folder if not provided |
| `pngScale` | number | ❌ | PNG image export scale, default is `2` (2x) |

**Parameters for each element in `nodes` array:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | ✅ | Node ID, format like `1234:5678` or `1234-5678` |
| `fileName` | string | ✅ | Save filename, must end with `.png` or `.svg` |
| `imageRef` | string | ❌ | Image fill reference ID. Required if node uses image fill; leave empty for SVG vector downloads |
| `needsCropping` | boolean | ❌ | Whether image needs cropping based on transform matrix |
| `cropTransform` | array | ❌ | Figma transform matrix for image cropping |
| `requiresImageDimensions` | boolean | ❌ | Whether to return image dimension info (for generating CSS variables) |

**Usage Example:**
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

**Default Download Paths:**
- **macOS**: `~/Downloads`
- **Linux**: `~/Downloads`
- **Windows**: `C:\Users\<username>\Downloads`

**Return Information:**
- Number of successfully downloaded images
- Save path
- Filename, dimensions, whether cropped, etc. for each image

---

### 4️⃣ `list_cache` - List Cache Status

Lists and displays the current cache status including cached files, total size, cache directory, and TTL configuration.

**Tool Parameters:** None

**Return Information:**
- `enabled`: Whether caching is enabled
- `cacheDir`: Cache directory path
- `fileCount`: Number of cached files
- `totalSize`: Human-readable total cache size
- `ttl`: Human-readable TTL duration

**Usage Example:**
```json
{}
```

**Sample Response:**
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

### 5️⃣ `cleanup_cache` - Clean Up Cache

Cleans up expired and corrupted cache files. This tool removes cache files that have exceeded their TTL (Time To Live) and any corrupted cache entries.

**Tool Parameters:** None

**Return Information:**
- `deletedFiles`: Number of files deleted
- `previousSize`: Cache size before cleanup
- `currentSize`: Cache size after cleanup
- `currentFileCount`: Number of remaining cached files

**Usage Example:**
```json
{}
```

---

## ⚠️ Important Notes

- If `FIGMA_CACHING` is not set (environment variable or command line argument), **original non-caching behavior is maintained**
- Caches **complete Figma file data**
- Command line arguments have higher priority than environment variables
- **Tool call sequence**: When user provides Figma URL, LLM will automatically first call `figma_prepare_file`, then `get_figma_data`
- Very suitable for:
  - Free Figma accounts
  - Frequent context reading
  - LLM / MCP automation scenarios
  - MCP marketplace hosting (configure via command line arguments, no server-side environment variables needed)

---

## 📦 Compatibility

- ✅ Fully compatible with original Figma Context MCP
- ✅ No client call logic modification needed
- ✅ Can be used as drop-in replacement for original project

---

## 📋 Changelog

For complete changelog, visit [CHANGELOG.md](./CHANGELOG.md)

---

## 📄 License

This project is open source under the [MIT License](./LICENSE).

---

## 🙌 Acknowledgments

This project is developed and optimized based on the following open source projects:

- **GLips / Figma-Context-MCP**  
  https://github.com/GLips/Figma-Context-MCP/

- **stone-w4tch3r / Figma-Context-MCP**  
  https://github.com/stone-w4tch3r/Figma-Context-MCP

Thanks to the above projects for providing core implementation and design ideas. This project introduces a **local persistent caching mechanism** on top of them to improve performance and alleviate Figma API rate limiting issues.

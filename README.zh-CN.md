# Godot MCP (SDK 测试工具)

[English](README.md) | 中文

用于测试 [godot-editor-ops-sdk](https://github.com/godot-ai-plugins/godot-editor-ops-sdk) 的 MCP 服务器。

本项目以 submodule 形式引入 SDK，将所有 SDK 操作 1:1 映射为 MCP 工具，方便通过任意 MCP 兼容的 AI Agent 验证 SDK 功能。

## 用途

本 MCP 是 `godot-editor-ops-sdk` 的集成测试入口

SDK 的每个操作（场景、脚本、资源、校验、项目配置、文件系统、编辑器操作）都对应一个同名 MCP 工具，直接通过 AI Agent 调用即可测试完整的 SDK API

用于测试 SDK 功能, 注意这并不是一个正式的 mcp 项目

## 环境要求

- [Godot Engine](https://godotengine.org/download)
- Node.js (>=18.0.0) 和 npm

## 安装

```bash
git clone --recurse-submodules <仓库地址>
cd godot-mcp-next
npm install
npm run build
```

如果克隆时没有带 `--recurse-submodules`：

```bash
git submodule update --init --recursive
```

### 注册 MCP 服务器

**Claude Code**

```bash
claude mcp add godot-sdk-test -e GODOT_PATH=/path/to/godot -- node /absolute/path/to/godot-mcp-next/build/index.js
```

**Windows PowerShell**

```powershell
claude mcp add godot-sdk-test -e "GODOT_PATH=/path/to/godot" -- node "/absolute/path/to/godot-mcp-next/build/index.js"
```

## 架构

```
MCP 客户端 (AI Agent)
  |
  v
Node.js MCP 服务器 (src/index.ts)
  |-- 内置工具: launch_editor, run_project, get_debug_output, ...
  |-- SDK 工具 (src/sdk-tools.ts): 与 SDK 操作 1:1 映射
  |
  v
godot_operations.gd (GDScript 桥接层)
  |
  v
godot-editor-ops-sdk (submodule)
  |-- api/scene_ops.gd      场景操作
  |-- api/script_ops.gd     脚本操作
  |-- api/resource_ops.gd   资源操作
  |-- api/validation_ops.gd 校验操作
  |-- api/project_config.gd 项目配置
  |-- api/file_system.gd    文件系统
  |-- api/editor_ops.gd     编辑器操作
```

桥接脚本 (`godot_operations.gd`) 通过 `--headless` 模式运行 Godot，将每个 MCP 工具调用转发给对应的 SDK API 文件。

## 开发

```bash
npm run watch    # TypeScript 监听模式（不会重新构建 GDScript/SDK）
npm run build    # 完整构建：TypeScript + 复制 GDScript 桥接脚本 + SDK 运行时到 build/
```

修改 `src/scripts/godot_operations.gd` 或 `godot-editor-ops-sdk/` 下的任何内容后，需要重新执行 `npm run build`。

## 更新 SDK 子模块

```bash
cd godot-editor-ops-sdk
git pull origin main
cd ..
git add godot-editor-ops-sdk
git commit -m "chore: update godot-editor-ops-sdk"
```

## 许可证

MIT

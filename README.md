# Godot MCP (SDK Test Harness)

English | [中文](README.zh-CN.md)

An MCP server for testing [godot-editor-ops-sdk](https://github.com/godot-ai-plugins/godot-editor-ops-sdk).

This project wraps the SDK as a submodule and exposes all SDK operations as MCP tools, making it easy to verify SDK functionality through any MCP-compatible AI agent.

## Purpose

This MCP serves as the integration test entry point for `godot-editor-ops-sdk`.

Every SDK operation (scene, script, resource, validation, project config, file system, editor ops) is mapped 1:1 to an MCP tool. You can test the full SDK API by calling tools through an AI agent.

Used for testing SDK functionality, note that this is not an official MCP project.

## Requirements

- [Godot Engine](https://godotengine.org/download)
- Node.js (>=18.0.0) and npm

## Setup

```bash
git clone --recurse-submodules <repo-url>
cd godot-mcp-next
npm install
npm run build
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

### Register the MCP server

**Claude Code**

```bash
claude mcp add godot-sdk-test -e GODOT_PATH=/path/to/godot -- node /absolute/path/to/godot-mcp-next/build/index.js
```

**Windows PowerShell**

```powershell
claude mcp add godot-sdk-test -e "GODOT_PATH=/path/to/godot" -- node "/absolute/path/to/godot-mcp-next/build/index.js"
```

## Architecture

```
MCP Client (AI Agent)
  |
  v
Node.js MCP Server (src/index.ts)
  |-- built-in tools: launch_editor, run_project, get_debug_output, ...
  |-- SDK tools (src/sdk-tools.ts): 1:1 mapping to SDK operations
  |
  v
godot_operations.gd (GDScript bridge)
  |
  v
godot-editor-ops-sdk (submodule)
  |-- api/scene_ops.gd      Scene operations
  |-- api/script_ops.gd     Script operations
  |-- api/resource_ops.gd   Resource operations
  |-- api/validation_ops.gd Validation operations
  |-- api/project_config.gd Project config
  |-- api/file_system.gd    File system
  |-- api/editor_ops.gd     Editor operations
```

The bridge script (`godot_operations.gd`) runs Godot in `--headless` mode, dispatching each MCP tool call to the corresponding SDK API file.

## Development

```bash
npm run watch    # TypeScript watch mode (does NOT rebuild GDScript/SDK)
npm run build    # Full build: TypeScript + copy GDScript bridge + SDK runtime to build/
```

After modifying `src/scripts/godot_operations.gd` or anything under `godot-editor-ops-sdk/`, run `npm run build` again.

## Updating the SDK submodule

```bash
cd godot-editor-ops-sdk
git pull origin main
cd ..
git add godot-editor-ops-sdk
git commit -m "chore: update godot-editor-ops-sdk"
```

## License

MIT

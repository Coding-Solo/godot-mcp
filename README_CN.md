# Godot MCP

[![Github-sponsors](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#EA4AAA)](https://github.com/sponsors/Coding-Solo)

[![](https://badge.mcpx.dev?type=server 'MCP Server')](https://modelcontextprotocol.io/introduction)
[![Made with Godot](https://img.shields.io/badge/Made%20with-Godot-478CBF?style=flat&logo=godot%20engine&logoColor=white)](https://godotengine.org)
[![](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white 'Node.js')](https://nodejs.org/en/download/)
[![](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white 'TypeScript')](https://www.typescriptlang.org/)

[![](https://img.shields.io/github/last-commit/Coding-Solo/godot-mcp 'Last Commit')](https://github.com/Coding-Solo/godot-mcp/commits/main)
[![](https://img.shields.io/github/stars/Coding-Solo/godot-mcp 'Stars')](https://github.com/Coding-Solo/godot-mcp/stargazers)
[![](https://img.shields.io/github/forks/Coding-Solo/godot-mcp 'Forks')](https://github.com/Coding-Solo/godot-mcp/network/members)
[![](https://img.shields.io/badge/License-MIT-red.svg 'MIT License')](https://opensource.org/licenses/MIT)

```text
                           (((((((             (((((((                          
                        (((((((((((           (((((((((((                      
                        (((((((((((((       (((((((((((((                       
                        (((((((((((((((((((((((((((((((((                       
                        (((((((((((((((((((((((((((((((((                       
         (((((      (((((((((((((((((((((((((((((((((((((((((      (((((        
       (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((      
     ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((    
    ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((    
      (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((     
        (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((       
         (((((((((((@@@@@@@(((((((((((((((((((((((((((@@@@@@@(((((((((((        
         (((((((((@@@@,,,,,@@@(((((((((((((((((((((@@@,,,,,@@@@(((((((((        
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((        
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((        
         (((((((((@@@,,,,,,,@@((((((((@@@@@((((((((@@,,,,,,,@@@(((((((((        
         ((((((((((((@@@@@@(((((((((((@@@@@(((((((((((@@@@@@((((((((((((        
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((        
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((        
         @@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@        
         ((((((((( @@@(((((((((((@@(((((((((((@@(((((((((((@@@ (((((((((        
         (((((((((( @@((((((((((@@@(((((((((((@@@((((((((((@@ ((((((((((        
          (((((((((((@@@@@@@@@@@@@@(((((((((((@@@@@@@@@@@@@@(((((((((((         
           (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((          
              (((((((((((((((((((((((((((((((((((((((((((((((((((((             
                 (((((((((((((((((((((((((((((((((((((((((((((((                
                        (((((((((((((((((((((((((((((((((                       
                                                                                

                          /$$      /$$  /$$$$$$  /$$$$$$$ 
                         | $$$    /$$$ /$$__  $$| $$__  $$
                         | $$$$  /$$$$| $$  \__/| $$  \ $$
                         | $$ $$/$$ $$| $$      | $$$$$$$/
                         | $$  $$$| $$| $$      | $$____/ 
                         | $$\  $ | $$| $$    $$| $$      
                         | $$ \/  | $$|  $$$$$$/| $$      
                         |__/     |__/ \______/ |__/       
```

一个用于与 Godot 游戏引擎交互的模型上下文协议（MCP）服务器。

## 简介

Godot MCP 使 AI 助手能够启动 Godot 编辑器、运行项目、捕获调试输出和控制项目执行——所有这些都通过标准化的接口实现。

这种直接反馈循环帮助像 Claude 这样的 AI 助手理解在真实的 Godot 项目中什么有效、什么无效，从而提供更好的代码生成和调试协助。

## 功能特性

- **启动 Godot 编辑器**：为特定项目打开 Godot 编辑器
- **运行 Godot 项目**：在调试模式下执行 Godot 项目
  - **多实例支持**：同时运行多个 Godot 实例（例如：专用服务器 + 多个客户端）
  - **批量启动**：使用 `run_multiple_projects` 在一次调用中启动多个实例
  - **交错启动**：使用 `delayMs` 交错启动实例（例如：先启动服务器再启动客户端）
  - **自定义命令行参数**：向 Godot 传递额外参数（例如：`--server`、`--headless`、`profile=X`、`port=Y`）
  - **实例管理**：使用唯一 ID 跟踪和管理多个运行中的实例
  - **有界输出缓冲区**：自动内存管理，用于长时间运行的实例（保留最后 1000 行）
  - **自动清理**：已退出的进程在 10 分钟后自动清理
- **捕获调试输出**：检索特定实例或所有实例的控制台输出和错误消息
- **控制执行**：以编程方式启动和停止 Godot 项目
  - 停止单个实例、多个特定实例或一次性停止所有实例
- **列出运行中的进程**：查看所有当前运行的 Godot 实例及其状态
- **获取 Godot 版本**：检索已安装的 Godot 版本
- **列出 Godot 项目**：在指定目录中查找 Godot 项目
- **项目分析**：获取项目结构的详细信息
- **场景管理**：
  - 创建具有指定根节点类型的新场景
  - 向现有场景添加节点，并具有可自定义的属性
  - 将精灵和纹理加载到 Sprite2D 节点中
  - 将 3D 场景导出为 GridMap 的 MeshLibrary 资源
  - 保存场景，并提供创建变体的选项
- **UID 管理**（适用于 Godot 4.4+）：
  - 获取特定文件的 UID
  - 通过重新保存资源来更新 UID 引用

## 系统要求

- 系统上已安装 [Godot Engine](https://godotengine.org/download)
- Node.js 和 npm
- 支持 MCP 的 AI 助手（Cline、Cursor 等）

## 安装和配置

### 步骤 1：安装和构建

首先，克隆仓库并构建 MCP 服务器：

```bash
git clone https://github.com/Coding-Solo/godot-mcp.git
cd godot-mcp
npm install
npm run build
```

### 步骤 2：配置 AI 助手

#### 选项 A：配置 Cline

将以下内容添加到您的 Cline MCP 设置文件（`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`）：

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "DEBUG": "true"                  // 可选：启用详细日志记录
      },
      "disabled": false,
      "autoApprove": [
        "launch_editor",
        "run_project",
        "get_debug_output",
        "stop_project",
        "list_processes",
        "run_multiple_projects",
        "get_godot_version",
        "list_projects",
        "get_project_info",
        "create_scene",
        "add_node",
        "load_sprite",
        "export_mesh_library",
        "save_scene",
        "get_uid",
        "update_project_uids"
      ]
    }
  }
}
```

#### 选项 B：配置 Cursor

**使用 Cursor UI：**

1. 转到 **Cursor 设置** > **功能** > **MCP**
2. 点击 **+ 添加新的 MCP 服务器** 按钮
3. 填写表单：
   - 名称：`godot`（或您喜欢的任何名称）
   - 类型：`command`
   - 命令：`node /absolute/path/to/godot-mcp/build/index.js`
4. 点击"添加"
5. 您可能需要点击 MCP 服务器卡片右上角的刷新按钮来填充工具列表

**使用项目特定配置：**

在项目目录中创建 `.cursor/mcp.json` 文件，内容如下：

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "DEBUG": "true"                  // 启用详细日志记录
      }
    }
  }
}
```

### 步骤 3：可选的环境变量

您可以使用以下环境变量自定义服务器行为：

- `GODOT_PATH`：Godot 可执行文件的路径（覆盖自动检测）
- `DEBUG`：设置为 "true" 以启用详细的服务器端调试日志

## 示例提示词

配置完成后，您的 AI 助手将在需要时自动运行 MCP 服务器。您可以使用如下提示词：

```text
"为 /path/to/project 中的我的项目启动 Godot 编辑器"

"运行我的 Godot 项目并显示任何错误"

"以无头模式在端口 8080 上运行我的 Godot 项目作为专用服务器"

"启动一个连接到 localhost:8080 的自定义配置文件客户端实例"

"为我的多人游戏启动一个服务器和两个客户端，服务器先启动"

"列出所有当前运行的 Godot 实例"

"停止所有客户端实例但保持服务器运行"

"获取服务器实例的调试输出"

"停止 ID 为 'client1' 的客户端实例"

"获取有关我的 Godot 项目结构的信息"

"分析我的 Godot 项目结构并提出改进建议"

"帮助我调试 Godot 项目中的这个错误：[粘贴错误]"

"为具有二段跳和墙壁滑动的角色控制器编写 GDScript"

"在我的 Godot 项目中创建一个带有 Player 节点的新场景"

"向我的玩家场景添加 Sprite2D 节点并加载角色纹理"

"将我的 3D 模型导出为 MeshLibrary 以便与 GridMap 一起使用"

"创建一个带有按钮和标签的 UI 场景，用于游戏的主菜单"

"获取我的 Godot 4.4 项目中特定脚本文件的 UID"

"升级到 4.4 后更新我的 Godot 项目中的 UID 引用"
```

## 实现细节

### 架构

Godot MCP 服务器使用捆绑的 GDScript 方法来处理复杂操作：

1. **直接命令**：简单的操作（如启动编辑器或获取项目信息）直接使用 Godot 的内置 CLI 命令。
2. **捆绑操作脚本**：复杂的操作（如创建场景或添加节点）使用单个全面的 GDScript 文件（`godot_operations.gd`）来处理所有操作。

这种架构提供了几个好处：

- **无临时文件**：消除了对临时脚本文件的需求，保持系统整洁
- **简化的代码库**：将所有 Godot 操作集中在一个（某种程度上）有组织的文件中
- **更好的可维护性**：更容易添加新操作或修改现有操作
- **改进的错误处理**：在所有操作中提供一致的错误报告
- **减少开销**：最小化文件 I/O 操作以提高性能

捆绑脚本接受操作类型和参数作为 JSON，允许灵活和动态的操作执行，而无需为每个操作生成临时文件。

### 多实例支持

MCP 服务器支持同时运行多个 Godot 实例，这对于多人游戏开发和测试至关重要：

- **实例 ID**：每个运行中的实例都可以分配一个唯一标识符（例如："server"、"client1"、"client2"）或使用自动生成的 ID
- **命令行参数**：向每个实例传递自定义参数（例如：`--server`、`--headless`、`profile=X`、`port=Y`）
- **批量启动**：使用 `run_multiple_projects` 在单个工具调用中启动多个实例
- **交错启动**：使用 `delayMs` 参数延迟实例启动（例如：在客户端之前 2 秒启动服务器）
- **实例管理**：
  - 使用 `list_processes` 查看所有运行中的实例及其状态
  - 使用带有 `instanceId` 的 `get_debug_output` 获取特定实例的输出
  - 使用带有 `instanceId`（单个）或 `instanceIds`（数组）的 `stop_project` 停止特定实例，或不带参数停止所有实例

**多人游戏开发示例工作流程：**

**选项 1：单个工具调用（推荐）**

使用 `run_multiple_projects` 一次启动所有内容，并带有交错延迟：

```json
{
  "instances": [
    {
      "projectPath": "/path/to/project",
      "instanceId": "server",
      "args": ["--", "--server", "port=8080", "--headless"],
      "delayMs": 0
    },
    {
      "projectPath": "/path/to/project",
      "instanceId": "client1",
      "args": ["--", "profile=player1", "ip=127.0.0.1", "port=8080"],
      "delayMs": 2000
    },
    {
      "projectPath": "/path/to/project",
      "instanceId": "client2",
      "args": ["--", "profile=player2", "ip=127.0.0.1", "port=8080"],
      "delayMs": 2000
    }
  ]
}
```

**选项 2：单独的工具调用**

1. 启动专用服务器：`run_project` 带有 `instanceId: "server"` 和 `args: ["--", "--server", "port=8080", "--headless"]`
2. 启动客户端实例：`run_project` 带有 `instanceId: "client1"` 和 `args: ["--", "profile=player1", "ip=127.0.0.1", "port=8080"]`

**管理实例：**

- 监控实例：使用 `list_processes` 查看所有运行中的实例
- 获取特定输出：使用带有 `instanceId: "server"` 的 `get_debug_output` 查看服务器日志
- 停止特定实例：使用带有 `instanceIds: ["client1", "client2"]` 的 `stop_project` 停止多个客户端
- 停止所有实例：使用不带参数的 `stop_project`

## 故障排除

- **未找到 Godot**：将 GODOT_PATH 环境变量设置为您的 Godot 可执行文件
- **连接问题**：确保服务器正在运行并重新启动您的 AI 助手
- **无效的项目路径**：确保路径指向包含 project.godot 文件的目录
- **构建问题**：通过运行 `npm install` 确保已安装所有依赖项
- **针对 Cursor 特别说明**：
  - 确保 MCP 服务器在 Cursor 设置中显示并已启用（设置 > MCP）
  - MCP 工具只能使用 Agent 聊天配置文件运行（需要 Cursor Pro 或 Business 订阅）
  - 使用"Yolo 模式"自动运行 MCP 工具请求

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/coding-solo-godot-mcp-badge.png)](https://mseep.ai/app/coding-solo-godot-mcp)

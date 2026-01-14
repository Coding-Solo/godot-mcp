# Godot MCP

[![](https://badge.mcpx.dev?type=server 'MCP Server')](https://modelcontextprotocol.io/introduction)
[![Made with Godot](https://img.shields.io/badge/Made%20with-Godot-478CBF?style=flat&logo=godot%20engine&logoColor=white)](https://godotengine.org)
[![](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white 'Node.js')](https://nodejs.org/en/download/)
[![](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white 'TypeScript')](https://www.typescriptlang.org/)

[![](https://img.shields.io/github/last-commit/HaD0Yun/godot-mcp 'Last Commit')](https://github.com/HaD0Yun/godot-mcp/commits/main)
[![](https://img.shields.io/github/stars/HaD0Yun/godot-mcp 'Stars')](https://github.com/HaD0Yun/godot-mcp/stargazers)
[![](https://img.shields.io/github/forks/HaD0Yun/godot-mcp 'Forks')](https://github.com/HaD0Yun/godot-mcp/network/members)
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

**The most comprehensive Model Context Protocol (MCP) server for Godot Engine — enabling AI assistants to build, modify, and debug Godot games with unprecedented depth and precision.**

> **Now with Auto Reload!** Scenes and scripts automatically refresh in the Godot editor when modified externally via MCP.

---

## Why Godot MCP? The Game-Changing Benefits

### 🚀 Transform Your Game Development Workflow

Godot MCP isn't just another tool — it's a **paradigm shift** in how AI assistants interact with game engines. Here's why this matters:

#### 1. **AI That Truly Understands Godot**

Traditional AI assistants can write GDScript, but they're essentially working blind. They generate code based on training data, hoping it works. **Godot MCP changes everything:**

- **Real-time Feedback Loop**: When you ask "run my project and show me errors," the AI actually runs your project, captures the output, and sees exactly what went wrong
- **Context-Aware Assistance**: The AI can inspect your actual scene tree, understand your node hierarchy, and provide suggestions based on your real project structure
- **Validation Before Suggesting**: Before suggesting you use a resource, the AI can verify it exists in your project

#### 2. **60+ Tools Covering 75% of Godot's Capabilities**

| Category | What You Can Do | Tools |
|----------|-----------------|-------|
| **Scene Management** | Build entire scene trees programmatically | `create_scene`, `add_node`, `delete_node`, `duplicate_node`, `reparent_node`, `list_scene_nodes`, `get_node_properties`, `set_node_properties` |
| **GDScript Operations** | Write and modify scripts with surgical precision | `create_script`, `modify_script`, `get_script_info` |
| **Resource Creation** | Generate materials, shaders, and custom resources | `create_resource`, `create_material`, `create_shader` |
| **Animation System** | Build animations track by track | `create_animation`, `add_animation_track` |
| **2D Tile System** | Create tilesets and populate tilemaps | `create_tileset`, `set_tilemap_cells` |
| **Signal Management** | Wire up your game's event system | `connect_signal`, `disconnect_signal`, `list_connections` |
| **Project Configuration** | Manage settings, autoloads, and inputs | `get_project_setting`, `set_project_setting`, `add_autoload`, `add_input_action` |
| **Developer Experience** | Analyze, debug, and maintain your project | `get_dependencies`, `find_resource_usages`, `parse_error_log`, `get_project_health`, `search_project` |
| **Runtime Debugging** | Inspect and modify running games | `inspect_runtime_tree`, `set_runtime_property`, `call_runtime_method`, `get_runtime_metrics` |
| **Auto Reload** | Instant editor refresh on external changes | Built-in Editor Plugin |

#### 3. **Seamless Editor Integration with Auto Reload**

The included **Auto Reload plugin** eliminates the friction of external editing:

- **No Manual Refresh**: When MCP modifies a scene or script, the Godot editor automatically reloads it
- **1-Second Detection**: Lightweight polling with negligible performance impact (~0.01ms/sec)
- **Smart Watching**: Monitors open scenes AND their attached scripts
- **Zero Configuration**: Just enable the plugin and forget about it

```
MCP modifies file → Auto Reload detects change → Editor reloads → You see the result instantly
```

#### 4. **Eliminate the Copy-Paste-Debug Cycle**

**Before Godot MCP:**
1. Ask AI for code
2. Copy code to your project
3. Run project, encounter error
4. Copy error back to AI
5. Get fix, paste it
6. Repeat 10+ times

**With Godot MCP:**
1. "Create a player character with health, movement, and jumping"
2. AI creates the scene, writes the script, adds the nodes, connects signals, and tests it
3. Done.

The AI doesn't just write code — it **implements features end-to-end**.

#### 5. **Type-Safe, Error-Resistant Operations**

Every operation in Godot MCP includes:

- **Path Validation**: Prevents invalid file operations
- **Type Serialization**: Correctly handles Vector2, Vector3, Color, Transform, and all Godot types
- **Error Recovery**: Meaningful error messages with suggested fixes
- **Atomic Operations**: Changes are applied consistently or not at all

Example: When you ask to set a node's position, Godot MCP:
1. Validates the scene exists
2. Validates the node path
3. Deserializes `{"x": 100, "y": 200}` to `Vector2(100, 200)`
4. Sets the property
5. Saves the scene
6. Confirms success or reports exactly what went wrong

#### 6. **Project Health Intelligence**

The `get_project_health` tool provides a comprehensive analysis of your project:

```json
{
  "score": 85,
  "grade": "B",
  "checks": {
    "structure": { "passed": true },
    "resources": { "issues": ["3 textures need reimporting"] },
    "scripts": { "issues": ["5 TODO comments found"] },
    "config": { "passed": true }
  },
  "recommendations": [
    "Configure export presets for your target platforms",
    "Review and resolve TODO items before release"
  ]
}
```

This turns your AI assistant into a **code reviewer that actually understands Godot projects**.

#### 7. **Dependency Analysis & Circular Reference Detection**

Ever had a project break because of circular dependencies? The `get_dependencies` tool:

- Maps every resource dependency in your project
- Detects circular references before they cause runtime errors
- Shows you the complete dependency chain for any resource

```
PlayerScene.tscn
├── PlayerScript.gd
│   └── WeaponBase.gd
│       └── ⚠️ CIRCULAR: PlayerScript.gd
└── PlayerSprite.png
```

#### 8. **Live Runtime Debugging (Optional Addon)**

Install the included `godot_mcp_runtime` addon and unlock:

- **Live Scene Tree Inspection**: See your game's actual node tree while it runs
- **Hot Property Modification**: Change values in real-time without restarting
- **Remote Method Calling**: Trigger functions in your running game
- **Performance Monitoring**: Track FPS, memory, draw calls, and more

This transforms debugging from "add print statements and restart" to "inspect and modify on the fly."

### 💡 Real-World Use Cases

#### **Rapid Prototyping**
```
"Create a basic platformer with a player that can move, jump, and collect coins"
```
The AI creates scenes, scripts, nodes, signals, and input actions — a playable prototype in minutes.

#### **Refactoring at Scale**
```
"Find all uses of the old PlayerData resource and update them to use the new PlayerStats"
```
Search the entire project, identify every reference, and make consistent changes.

#### **Debugging Complex Issues**
```
"My player keeps falling through the floor. Check my collision setup and tell me what's wrong"
```
Inspect node properties, analyze scene structure, and identify configuration issues.

#### **Learning Godot**
```
"Show me how signals work by creating a button that changes a label's text when clicked"
```
Instead of just explaining, the AI builds a working example in your actual project.

#### **Maintaining Large Projects**
```
"Run a health check on my project and tell me what needs attention"
```
Get actionable insights about project structure, unused resources, and potential issues.

---

## Features

### Core Features
- **Launch Godot Editor**: Open the Godot editor for a specific project
- **Run Godot Projects**: Execute Godot projects in debug mode
- **Capture Debug Output**: Retrieve console output and error messages
- **Control Execution**: Start and stop Godot projects programmatically
- **Get Godot Version**: Retrieve the installed Godot version
- **List Godot Projects**: Find Godot projects in a specified directory
- **Project Analysis**: Get detailed information about project structure

### Scene Management
- Create new scenes with specified root node types
- Add, delete, duplicate, and reparent nodes
- Set node properties with type-safe serialization
- List scene tree structure with full hierarchy
- Load sprites and textures into Sprite2D nodes
- Export 3D scenes as MeshLibrary resources for GridMap

### GDScript Operations
- **Create Scripts**: Generate new GDScript files with templates (singleton, state_machine, component, resource)
- **Modify Scripts**: Add functions, variables, and signals to existing scripts
- **Analyze Scripts**: Get detailed information about script structure, dependencies, and exports

### Signal & Connection Management
- Connect signals between nodes in scenes
- Disconnect signal connections
- List all signal connections in a scene

### Resource Creation
- **Create Resources**: Generate custom .tres resource files
- **Create Materials**: StandardMaterial3D, ShaderMaterial, CanvasItemMaterial, ParticleProcessMaterial
- **Create Shaders**: canvas_item, spatial, particles, sky, fog shaders with templates

### Animation System
- Create new animations in AnimationPlayer nodes
- Add property and method tracks to animations
- Insert keyframes with proper value serialization

### 2D Tile System
- Create TileSet resources with atlas texture sources
- Set TileMap cells programmatically

### Import/Export Pipeline
- Get import status and options for resources
- Modify import settings and trigger reimport
- List export presets and validate project for export
- Export projects using Godot CLI

### Project Configuration
- Get and set project settings
- Manage autoload singletons (add, remove, list)
- Set main scene
- Add input actions with key, mouse, and joypad events

### Plugin Management
- List installed plugins with status
- Enable and disable plugins

### Developer Experience
- **Dependency Analysis**: Get resource dependency graphs with circular reference detection
- **Resource Usage Finder**: Find all usages of a resource across the project
- **Error Log Parser**: Parse Godot error logs with suggestions
- **Project Health Check**: Comprehensive project analysis with scoring
- **Project Search**: Search for text/patterns across all project files

### Runtime Connection (Optional Addon)
- Real-time scene tree inspection
- Live property modification
- Remote method calling
- Performance metrics monitoring
- Signal watching

### UID Management (Godot 4.4+)
- Get UID for specific files
- Update UID references by resaving resources

---

## Requirements

- [Godot Engine 4.x](https://godotengine.org/download) installed on your system
- Node.js 18+ and npm
- An AI assistant that supports MCP (Claude Desktop, Cline, Cursor, OpenCode, etc.)

---

## Installation and Configuration

### Step 1: Install and Build

```bash
git clone https://github.com/HaD0Yun/godot-mcp.git
cd godot-mcp
npm install
npm run build
```

### Step 2: Configure with Your AI Assistant

#### Option A: Configure with Cline (VS Code)

Add to your Cline MCP settings file:

**macOS**: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
**Windows**: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "GODOT_PATH": "/path/to/godot",
        "DEBUG": "true"
      },
      "disabled": false
    }
  }
}
```

#### Option B: Configure with Cursor

1. Go to **Cursor Settings** > **Features** > **MCP**
2. Click **+ Add New MCP Server**
3. Name: `godot`, Type: `command`
4. Command: `node /absolute/path/to/godot-mcp/build/index.js`

#### Option C: Configure with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp/build/index.js"],
      "env": {
        "GODOT_PATH": "/path/to/godot"
      }
    }
  }
}
```

#### Option D: Configure with OpenCode

Add to your `opencode.json`:

```json
{
  "mcp": {
    "godot": {
      "type": "local",
      "command": ["node", "/absolute/path/to/godot-mcp/build/index.js"],
      "enabled": true,
      "environment": {
        "GODOT_PATH": "/path/to/godot"
      }
    }
  }
}
```

### Step 3: Environment Variables

| Variable | Description |
|----------|-------------|
| `GODOT_PATH` | Path to Godot executable (auto-detected if not set) |
| `DEBUG` | Set to "true" for detailed logging |

---

## Example Prompts

Once configured, you can use natural language to control Godot:

### Scene Building
```
"Create a new scene with a CharacterBody2D root node called Player"
"Add a Sprite2D and CollisionShape2D to my Player scene"
"Duplicate the Enemy node and name it Enemy2"
```

### Script Operations
```
"Create a GDScript for my player with movement and jumping"
"Add a take_damage function to my player script that emits a health_changed signal"
"Show me the structure of my PlayerController script"
```

### Resource Management
```
"Create a red StandardMaterial3D for my enemy"
"Create a canvas_item shader with a dissolve effect"
"Generate a TileSet from my tilemap_atlas.png with 16x16 tiles"
```

### Project Analysis
```
"Check my project health and show me any issues"
"Find all files that use the PlayerData resource"
"Show me the dependency graph for my main scene"
"Search my project for 'TODO' comments"
```

### Configuration
```
"Add a 'jump' input action mapped to Space and gamepad button 0"
"Register my GameManager script as an autoload singleton"
"Set the main scene to res://scenes/main_menu.tscn"
```

### Debugging
```
"Run my project and show me any errors"
"Parse my Godot error log and suggest fixes"
"Inspect the scene tree of my running game"
```

---

## Included Addons

### Auto Reload Plugin (Recommended)

**Essential for MCP workflow** - automatically reloads scenes and scripts when modified externally.

#### Installation

**Option 1: One-Click Install (Windows PowerShell)**
```powershell
# Run in your Godot project folder
irm https://raw.githubusercontent.com/HaD0Yun/godot-mcp/main/install-addon.ps1 | iex
```

**Option 2: Manual Install**
1. Copy `build/addon/auto_reload` to your project's `addons/` folder
2. Open your project in Godot
3. Go to **Project > Project Settings > Plugins**
4. Enable "Godot MCP Auto Reload"

#### How It Works

```
[1 sec polling] → Check file modification times → Reload changed files
```

| Feature | Detail |
|---------|--------|
| **Performance** | ~0.01ms per second (negligible) |
| **Watched Files** | Current scene + attached scripts |
| **Detection** | OS file modification timestamp |
| **Reload Method** | `EditorInterface.reload_scene_from_path()` |

#### Output Messages
```
[Godot MCP - AutoReload] Plugin activated - watching for external changes
[Godot MCP - AutoReload] Scene changed: res://scenes/player.tscn
[Godot MCP - AutoReload] Scene reloaded: res://scenes/player.tscn
```

#### Warning

**Data Loss Risk**: If you modify a scene in the editor AND externally at the same time, editor changes will be lost.

**Best Practice**:
- Use MCP for modifications
- Use Godot editor for viewing/testing only
- Save before external modifications

---

### Runtime Addon (Optional)

For live debugging features, install the runtime addon:

1. Copy `build/addon/godot_mcp_runtime` to your project's `addons/` folder
2. Enable in **Project Settings > Plugins**
3. The addon starts a TCP server on port 7777 when your game runs

**Runtime Tools:**
- `get_runtime_status` - Check if game is running
- `inspect_runtime_tree` - View live scene tree
- `set_runtime_property` - Modify properties in real-time
- `call_runtime_method` - Invoke methods remotely
- `get_runtime_metrics` - Monitor FPS, memory, draw calls

---

## Complete Tool Reference

### Core Tools (7)
| Tool | Description |
|------|-------------|
| `launch_editor` | Open Godot editor for a project |
| `run_project` | Execute project in debug mode |
| `stop_project` | Stop running project |
| `get_debug_output` | Get console output and errors |
| `get_godot_version` | Get installed Godot version |
| `list_projects` | Find projects in a directory |
| `get_project_info` | Get project structure info |

### Scene Tools (9)
| Tool | Description |
|------|-------------|
| `create_scene` | Create new scene file |
| `add_node` | Add node to scene |
| `delete_node` | Remove node from scene |
| `duplicate_node` | Clone node in scene |
| `reparent_node` | Move node to new parent |
| `list_scene_nodes` | Get scene tree structure |
| `get_node_properties` | Get all node properties |
| `set_node_properties` | Set multiple properties |
| `save_scene` | Save scene changes |

### Script Tools (3)
| Tool | Description |
|------|-------------|
| `create_script` | Create GDScript with templates |
| `modify_script` | Add functions/variables/signals |
| `get_script_info` | Analyze script structure |

### Resource Tools (6)
| Tool | Description |
|------|-------------|
| `create_resource` | Create custom .tres file |
| `create_material` | Create material resource |
| `create_shader` | Create shader file |
| `load_sprite` | Load texture into Sprite2D |
| `export_mesh_library` | Export as MeshLibrary |
| `create_tileset` | Create TileSet resource |

### Animation Tools (2)
| Tool | Description |
|------|-------------|
| `create_animation` | Create animation in AnimationPlayer |
| `add_animation_track` | Add track with keyframes |

### Signal Tools (3)
| Tool | Description |
|------|-------------|
| `connect_signal` | Connect signal to method |
| `disconnect_signal` | Remove signal connection |
| `list_connections` | List all connections in scene |

### Import/Export Tools (7)
| Tool | Description |
|------|-------------|
| `get_import_status` | Check resource import status |
| `get_import_options` | Get import settings |
| `set_import_options` | Modify import settings |
| `reimport_resource` | Trigger reimport |
| `list_export_presets` | List export configurations |
| `export_project` | Build for distribution |
| `validate_project` | Check export readiness |

### Configuration Tools (7)
| Tool | Description |
|------|-------------|
| `get_project_setting` | Read project setting |
| `set_project_setting` | Write project setting |
| `add_autoload` | Register singleton |
| `remove_autoload` | Unregister singleton |
| `list_autoloads` | List all autoloads |
| `set_main_scene` | Set startup scene |
| `add_input_action` | Add input mapping |

### Plugin Tools (3)
| Tool | Description |
|------|-------------|
| `list_plugins` | List installed plugins |
| `enable_plugin` | Enable a plugin |
| `disable_plugin` | Disable a plugin |

### DX Tools (5)
| Tool | Description |
|------|-------------|
| `get_dependencies` | Map resource dependencies |
| `find_resource_usages` | Find all resource references |
| `parse_error_log` | Parse errors with suggestions |
| `get_project_health` | Comprehensive health check |
| `search_project` | Search across all files |

### Runtime Tools (5)
| Tool | Description |
|------|-------------|
| `get_runtime_status` | Check runtime connection |
| `inspect_runtime_tree` | Live scene inspection |
| `set_runtime_property` | Modify runtime property |
| `call_runtime_method` | Call method on running node |
| `get_runtime_metrics` | Get performance metrics |

### UID Tools (2)
| Tool | Description |
|------|-------------|
| `get_uid` | Get file UID (Godot 4.4+) |
| `update_project_uids` | Regenerate UIDs |

---

## Architecture

Godot MCP uses a hybrid architecture:

1. **Direct CLI Commands**: Simple operations use Godot's built-in CLI
2. **Bundled GDScript**: Complex operations use a comprehensive `godot_operations.gd` script
3. **Runtime Addon**: Optional TCP server for live game debugging

**Benefits:**
- No temporary files cluttering your system
- Consistent error handling across all operations
- Type-safe serialization for all Godot types
- Minimal overhead for maximum performance

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Godot not found | Set `GODOT_PATH` environment variable |
| Connection issues | Restart your AI assistant |
| Invalid project path | Ensure path contains `project.godot` |
| Build errors | Run `npm install` to install dependencies |
| Runtime tools not working | Install and enable the addon in your project |

---

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) guide.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Stats

- **60+ Tools** covering scene management, scripting, resources, animation, configuration, and debugging
- **12,000+ lines** of TypeScript and GDScript
- **~75% coverage** of Godot Engine's capabilities
- **Godot 4.x** full support (including 4.4+ UID features)
- **Auto Reload** plugin for seamless MCP integration

---

## Credits

- Original MCP server by [Coding-Solo](https://github.com/Coding-Solo/godot-mcp)
- Auto Reload plugin and unified package by [HaD0Yun](https://github.com/HaD0Yun)

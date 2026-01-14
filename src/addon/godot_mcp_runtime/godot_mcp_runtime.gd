@tool
extends EditorPlugin

## Godot MCP Runtime Plugin
## Enables real-time communication between a running Godot game and the MCP server.
## 
## This plugin provides:
## - WebSocket server for bidirectional communication
## - Scene tree inspection
## - Property modification at runtime
## - Method calling at runtime
## - Performance metrics reporting
## - Signal watching

const DEFAULT_PORT = 7777
const PROTOCOL_VERSION = "1.0"

var _server: TCPServer
var _clients: Array[StreamPeerTCP] = []
var _port: int = DEFAULT_PORT
var _enabled: bool = false


func _enter_tree() -> void:
	# Plugin initialization
	print("[MCP Runtime] Plugin loaded")
	add_autoload_singleton("MCPRuntime", "res://addons/godot_mcp_runtime/mcp_runtime_autoload.gd")


func _exit_tree() -> void:
	# Cleanup
	remove_autoload_singleton("MCPRuntime")
	print("[MCP Runtime] Plugin unloaded")

extends Node

## MCP Runtime Autoload
## This singleton runs in the game and provides runtime inspection capabilities.
## It starts a TCP server that the MCP server can connect to.

const DEFAULT_PORT = 7777
const PROTOCOL_VERSION = "1.0"

var _server: TCPServer
var _clients: Array[StreamPeerTCP] = []
var _port: int = DEFAULT_PORT
var _enabled: bool = true
var _watched_signals: Dictionary = {}  # { "node_path:signal_name": callable }

signal client_connected
signal client_disconnected
signal command_received(command: String, params: Dictionary)


func _ready() -> void:
	name = "MCPRuntime"
	_start_server()
	print("[MCP Runtime] Autoload ready, server starting on port %d" % _port)


func _process(_delta: float) -> void:
	if not _enabled or _server == null:
		return
	
	# Accept new connections
	if _server.is_connection_available():
		var client = _server.take_connection()
		if client:
			_clients.append(client)
			print("[MCP Runtime] Client connected")
			client_connected.emit()
			_send_welcome(client)
	
	# Process client messages
	var clients_to_remove: Array[StreamPeerTCP] = []
	for client in _clients:
		if client.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			clients_to_remove.append(client)
			continue
		
		client.poll()
		var available = client.get_available_bytes()
		if available > 0:
			var data = client.get_utf8_string(available)
			_handle_message(client, data)
	
	# Remove disconnected clients
	for client in clients_to_remove:
		_clients.erase(client)
		print("[MCP Runtime] Client disconnected")
		client_disconnected.emit()


func _start_server() -> void:
	_server = TCPServer.new()
	var error = _server.listen(_port)
	if error != OK:
		push_error("[MCP Runtime] Failed to start server on port %d: %s" % [_port, error])
		_enabled = false
	else:
		print("[MCP Runtime] Server listening on port %d" % _port)


func _send_welcome(client: StreamPeerTCP) -> void:
	var welcome = {
		"type": "welcome",
		"protocol_version": PROTOCOL_VERSION,
		"godot_version": Engine.get_version_info(),
		"project_name": ProjectSettings.get_setting("application/config/name", "Unknown")
	}
	_send_response(client, welcome)


func _handle_message(client: StreamPeerTCP, data: String) -> void:
	var json = JSON.new()
	var error = json.parse(data)
	if error != OK:
		_send_error(client, "Invalid JSON: " + json.get_error_message())
		return
	
	var message = json.get_data()
	if not message is Dictionary:
		_send_error(client, "Message must be an object")
		return
	
	var command = message.get("command", "")
	var params = message.get("params", {})
	var request_id = message.get("id", null)
	
	command_received.emit(command, params)
	
	var result = _execute_command(command, params)
	if request_id != null:
		result["id"] = request_id
	
	_send_response(client, result)


func _execute_command(command: String, params: Dictionary) -> Dictionary:
	match command:
		"ping":
			return {"type": "pong", "timestamp": Time.get_unix_time_from_system()}
		
		"get_tree":
			return _cmd_get_tree(params)
		
		"get_node":
			return _cmd_get_node(params)
		
		"set_property":
			return _cmd_set_property(params)
		
		"call_method":
			return _cmd_call_method(params)
		
		"get_metrics":
			return _cmd_get_metrics(params)
		
		"watch_signal":
			return _cmd_watch_signal(params)
		
		"unwatch_signal":
			return _cmd_unwatch_signal(params)
		
		_:
			return {"type": "error", "message": "Unknown command: " + command}


func _cmd_get_tree(params: Dictionary) -> Dictionary:
	var root_path = params.get("root", "/root")
	var max_depth = params.get("depth", 3)
	var include_properties = params.get("include_properties", false)
	
	var root = get_tree().root.get_node_or_null(root_path)
	if root == null:
		return {"type": "error", "message": "Node not found: " + root_path}
	
	return {
		"type": "tree",
		"root": _serialize_node_tree(root, 0, max_depth, include_properties)
	}


func _cmd_get_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	if node_path.is_empty():
		return {"type": "error", "message": "Node path required"}
	
	var node = get_tree().root.get_node_or_null(node_path)
	if node == null:
		return {"type": "error", "message": "Node not found: " + node_path}
	
	return {
		"type": "node",
		"data": _serialize_node(node, true)
	}


func _cmd_set_property(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var property = params.get("property", "")
	var value = params.get("value")
	
	if node_path.is_empty() or property.is_empty():
		return {"type": "error", "message": "Node path and property required"}
	
	var node = get_tree().root.get_node_or_null(node_path)
	if node == null:
		return {"type": "error", "message": "Node not found: " + node_path}
	
	var old_value = node.get(property)
	node.set(property, _deserialize_value(value))
	
	return {
		"type": "property_set",
		"path": node_path,
		"property": property,
		"old_value": _serialize_value(old_value),
		"new_value": _serialize_value(node.get(property))
	}


func _cmd_call_method(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var method = params.get("method", "")
	var args = params.get("args", [])
	
	if node_path.is_empty() or method.is_empty():
		return {"type": "error", "message": "Node path and method required"}
	
	var node = get_tree().root.get_node_or_null(node_path)
	if node == null:
		return {"type": "error", "message": "Node not found: " + node_path}
	
	if not node.has_method(method):
		return {"type": "error", "message": "Method not found: " + method}
	
	var deserialized_args = []
	for arg in args:
		deserialized_args.append(_deserialize_value(arg))
	
	var result = node.callv(method, deserialized_args)
	
	return {
		"type": "method_result",
		"path": node_path,
		"method": method,
		"result": _serialize_value(result)
	}


func _cmd_get_metrics(params: Dictionary) -> Dictionary:
	var metrics = params.get("metrics", [])
	var result = {
		"type": "metrics",
		"data": {}
	}
	
	# Always include basic metrics
	result["data"]["fps"] = Engine.get_frames_per_second()
	result["data"]["frame_time"] = Performance.get_monitor(Performance.TIME_PROCESS)
	result["data"]["physics_time"] = Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)
	
	# Memory metrics
	result["data"]["memory_static"] = Performance.get_monitor(Performance.MEMORY_STATIC)
	result["data"]["memory_static_max"] = Performance.get_monitor(Performance.MEMORY_STATIC_MAX)
	
	# Object counts
	result["data"]["object_count"] = Performance.get_monitor(Performance.OBJECT_COUNT)
	result["data"]["object_resource_count"] = Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)
	result["data"]["object_node_count"] = Performance.get_monitor(Performance.OBJECT_NODE_COUNT)
	result["data"]["object_orphan_node_count"] = Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)
	
	# Render metrics
	result["data"]["render_total_objects"] = Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)
	result["data"]["render_total_primitives"] = Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
	result["data"]["render_total_draw_calls"] = Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
	
	return result


func _cmd_watch_signal(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var signal_name = params.get("signal", "")
	
	if node_path.is_empty() or signal_name.is_empty():
		return {"type": "error", "message": "Node path and signal name required"}
	
	var node = get_tree().root.get_node_or_null(node_path)
	if node == null:
		return {"type": "error", "message": "Node not found: " + node_path}
	
	if not node.has_signal(signal_name):
		return {"type": "error", "message": "Signal not found: " + signal_name}
	
	var key = node_path + ":" + signal_name
	if _watched_signals.has(key):
		return {"type": "error", "message": "Signal already being watched"}
	
	var callable = func(args = []):
		_broadcast_signal_event(node_path, signal_name, args)
	
	node.connect(signal_name, callable)
	_watched_signals[key] = callable
	
	return {
		"type": "signal_watched",
		"path": node_path,
		"signal": signal_name
	}


func _cmd_unwatch_signal(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var signal_name = params.get("signal", "")
	
	var key = node_path + ":" + signal_name
	if not _watched_signals.has(key):
		return {"type": "error", "message": "Signal not being watched"}
	
	var node = get_tree().root.get_node_or_null(node_path)
	if node != null:
		node.disconnect(signal_name, _watched_signals[key])
	
	_watched_signals.erase(key)
	
	return {
		"type": "signal_unwatched",
		"path": node_path,
		"signal": signal_name
	}


func _broadcast_signal_event(node_path: String, signal_name: String, args: Array) -> void:
	var event = {
		"type": "signal_event",
		"path": node_path,
		"signal": signal_name,
		"args": []
	}
	for arg in args:
		event["args"].append(_serialize_value(arg))
	
	for client in _clients:
		if client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
			_send_response(client, event)


func _serialize_node_tree(node: Node, depth: int, max_depth: int, include_properties: bool) -> Dictionary:
	var result = _serialize_node(node, include_properties)
	
	if depth < max_depth:
		var children = []
		for child in node.get_children():
			children.append(_serialize_node_tree(child, depth + 1, max_depth, include_properties))
		result["children"] = children
	
	return result


func _serialize_node(node: Node, include_properties: bool) -> Dictionary:
	var result = {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path())
	}
	
	if node.get_script():
		result["script"] = node.get_script().resource_path
	
	if include_properties:
		result["properties"] = {}
		for prop in node.get_property_list():
			if prop["usage"] & PROPERTY_USAGE_STORAGE:
				var name = prop["name"]
				if not name.begins_with("_"):
					result["properties"][name] = _serialize_value(node.get(name))
	
	return result


func _serialize_value(value) -> Variant:
	if value == null:
		return null
	elif value is Vector2:
		return {"_type": "Vector2", "x": value.x, "y": value.y}
	elif value is Vector3:
		return {"_type": "Vector3", "x": value.x, "y": value.y, "z": value.z}
	elif value is Vector2i:
		return {"_type": "Vector2i", "x": value.x, "y": value.y}
	elif value is Vector3i:
		return {"_type": "Vector3i", "x": value.x, "y": value.y, "z": value.z}
	elif value is Color:
		return {"_type": "Color", "r": value.r, "g": value.g, "b": value.b, "a": value.a}
	elif value is Rect2:
		return {"_type": "Rect2", "position": _serialize_value(value.position), "size": _serialize_value(value.size)}
	elif value is Transform2D:
		return {"_type": "Transform2D", "origin": _serialize_value(value.origin), "x": _serialize_value(value.x), "y": _serialize_value(value.y)}
	elif value is NodePath:
		return {"_type": "NodePath", "path": str(value)}
	elif value is Resource:
		return {"_type": "Resource", "path": value.resource_path, "class": value.get_class()}
	elif value is Array:
		var arr = []
		for item in value:
			arr.append(_serialize_value(item))
		return arr
	elif value is Dictionary:
		var dict = {}
		for key in value:
			dict[str(key)] = _serialize_value(value[key])
		return dict
	elif value is Object:
		return {"_type": "Object", "class": value.get_class()}
	else:
		return value


func _deserialize_value(value) -> Variant:
	if value == null:
		return null
	elif value is Dictionary:
		if value.has("_type"):
			match value["_type"]:
				"Vector2":
					return Vector2(value.get("x", 0), value.get("y", 0))
				"Vector3":
					return Vector3(value.get("x", 0), value.get("y", 0), value.get("z", 0))
				"Vector2i":
					return Vector2i(value.get("x", 0), value.get("y", 0))
				"Vector3i":
					return Vector3i(value.get("x", 0), value.get("y", 0), value.get("z", 0))
				"Color":
					return Color(value.get("r", 0), value.get("g", 0), value.get("b", 0), value.get("a", 1))
				"NodePath":
					return NodePath(value.get("path", ""))
				_:
					return value
		else:
			var dict = {}
			for key in value:
				dict[key] = _deserialize_value(value[key])
			return dict
	elif value is Array:
		var arr = []
		for item in value:
			arr.append(_deserialize_value(item))
		return arr
	else:
		return value


func _send_response(client: StreamPeerTCP, data: Dictionary) -> void:
	var json_str = JSON.stringify(data) + "\n"
	client.put_utf8_string(json_str)


func _send_error(client: StreamPeerTCP, message: String) -> void:
	_send_response(client, {"type": "error", "message": message})


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		_cleanup()


func _cleanup() -> void:
	for client in _clients:
		client.disconnect_from_host()
	_clients.clear()
	
	if _server:
		_server.stop()
		_server = null
	
	print("[MCP Runtime] Cleanup complete")

## TestBridge — E2E testing bridge for godot-mcp.
##
## Autoload that starts a WebSocket server when activated via --test-bridge CLI flag
## or TEST_BRIDGE=true env var. Receives JSON-RPC commands from the MCP server
## for input injection, scene inspection, state queries, and visual verification.
extends Node

# --- Configuration ---
var _port: int = 9505
var _active: bool = false
var _unsafe_mode: bool = false
var _debug: bool = false

# --- Networking ---
var _tcp_server: TCPServer = null
var _ws_peer: WebSocketPeer = null
var _tcp_peer: StreamPeerTCP = null

# --- Concurrency ---
## Maps request ID → true for in-flight async operations.
## _process() never blocks; async handlers use coroutines and call
## _send_response() when complete.
var _pending_responses: Dictionary = {}

# --- Key lookup ---
var _key_map: Dictionary = {}

# --- Lifecycle ---

func _ready() -> void:
	# Check activation flags
	var args := OS.get_cmdline_args() + OS.get_cmdline_user_args()
	var env_flag := OS.get_environment("TEST_BRIDGE")

	if "--test-bridge" not in args and env_flag != "true":
		return

	_active = true
	_unsafe_mode = "--unsafe" in args
	_debug = "--test-bridge-debug" in args

	# Parse port override
	for arg in args:
		if arg.begins_with("--test-bridge-port="):
			var port_str := arg.split("=")[1]
			if port_str.is_valid_int():
				_port = int(port_str)

	_build_key_map()
	_start_server()


func _start_server() -> void:
	_tcp_server = TCPServer.new()
	var err := _tcp_server.listen(_port)
	if err != OK:
		print("TESTBRIDGE_ERROR:port_in_use:%d" % _port)
		printerr("[TestBridge] Failed to listen on port %d: error %d" % [_port, err])
		_active = false
		return

	print("TESTBRIDGE_READY:%d" % _port)
	_log_debug("TestBridge listening on port %d (unsafe=%s)" % [_port, str(_unsafe_mode)])


func _process(_delta: float) -> void:
	if not _active:
		return

	# Accept new TCP connections
	if _tcp_server and _tcp_server.is_connection_available():
		var new_tcp := _tcp_server.take_connection()
		if new_tcp:
			# Close existing peer if any
			if _ws_peer:
				_ws_peer.close()
				_ws_peer = null
				_log_debug("Closed previous WebSocket peer for new connection")
			_tcp_peer = new_tcp
			_ws_peer = WebSocketPeer.new()
			var err := _ws_peer.accept_stream(_tcp_peer)
			if err != OK:
				printerr("[TestBridge] Failed to accept WebSocket stream: %d" % err)
				_ws_peer = null
				_tcp_peer = null
			else:
				_log_debug("New WebSocket client connected")

	# Poll existing WebSocket peer
	if _ws_peer:
		_ws_peer.poll()
		var state := _ws_peer.get_ready_state()

		if state == WebSocketPeer.STATE_OPEN:
			while _ws_peer.get_available_packet_count() > 0:
				var packet := _ws_peer.get_packet()
				var text := packet.get_string_from_utf8()
				_handle_packet(text)

		elif state == WebSocketPeer.STATE_CLOSED:
			_log_debug("WebSocket client disconnected")
			_ws_peer = null
			_tcp_peer = null


# --- JSON-RPC Dispatch ---

func _handle_packet(text: String) -> void:
	var parsed = JSON.parse_string(text)
	if parsed == null:
		_send_raw_response(null, null, {"code": -32700, "message": "Parse error: invalid JSON"})
		return

	if typeof(parsed) != TYPE_DICTIONARY:
		_send_raw_response(null, null, {"code": -32700, "message": "Parse error: expected JSON object"})
		return

	var id = parsed.get("id")
	var method: String = parsed.get("method", "")
	var params = parsed.get("params", {})

	if method.is_empty():
		_send_raw_response(id, null, {"code": -32600, "message": "Invalid request: missing method"})
		return

	_dispatch(id, method, params)


func _dispatch(id, method: String, params: Dictionary) -> void:
	match method:
		"hello":
			_handle_hello(id, params)
		"send_key":
			_handle_send_key(id, params)
		"send_mouse_click":
			_handle_send_mouse_click(id, params)
		"send_mouse_move":
			_handle_send_mouse_move(id, params)
		"send_mouse_drag":
			_handle_send_mouse_drag(id, params)
		"send_input_action":
			_handle_send_input_action(id, params)
		"get_scene_tree":
			_handle_get_scene_tree(id, params)
		"get_node_properties":
			_handle_get_node_properties(id, params)
		"find_nodes":
			_handle_find_nodes(id, params)
		"get_viewport_info":
			_handle_get_viewport_info(id, params)
		"call_method":
			_handle_call_method(id, params)
		"get_singleton":
			_handle_get_singleton(id, params)
		"evaluate_expression":
			_handle_evaluate_expression(id, params)
		"wait_for_condition":
			_handle_wait_for_condition(id, params)
		"wait_frames":
			_handle_wait_frames(id, params)
		"wait_for_signal":
			_handle_wait_for_signal(id, params)
		"take_screenshot":
			_handle_take_screenshot(id, params)
		"get_pixel_color":
			_handle_get_pixel_color(id, params)
		"reset_scene":
			_handle_reset_scene(id, params)
		"load_scene":
			_handle_load_scene(id, params)
		_:
			_send_error(id, -32601, "Method not found: %s" % method)


# --- Response Helpers ---

func _send_response(id, result) -> void:
	_send_raw_response(id, result, null)
	_pending_responses.erase(str(id))


func _send_error(id, code: int, message: String) -> void:
	_send_raw_response(id, null, {"code": code, "message": message})
	_pending_responses.erase(str(id))


func _send_raw_response(id, result, error) -> void:
	if not _ws_peer or _ws_peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	var response := {}
	response["id"] = id
	if error != null:
		response["error"] = error
	else:
		response["result"] = result
	_ws_peer.send_text(JSON.stringify(response))


# --- Handler: hello ---

func _handle_hello(id, _params: Dictionary) -> void:
	var caps := ["input", "scene_tree", "state", "wait"]

	# Visual capabilities depend on display mode
	if DisplayServer.get_name() != "headless":
		caps.append("screenshot")

	# Evaluate capability depends on unsafe mode
	if _unsafe_mode:
		caps.append("evaluate")

	# C# interop detection
	if ClassDB.class_exists("CSharpScript"):
		caps.append("csharp_interop")

	# Avalonia detection — check if any AvaloniaControl node exists
	if _find_avalonia_nodes().size() > 0:
		caps.append("avalonia_input")

	_send_response(id, {
		"protocol_version": "1.0",
		"capabilities": caps,
		"unsafe_mode": _unsafe_mode,
		"godot_version": Engine.get_version_info().string,
		"project_name": ProjectSettings.get_setting("application/config/name", ""),
		"display_mode": DisplayServer.get_name()
	})


# --- Handlers: Input Simulation ---

func _handle_send_key(id, params: Dictionary) -> void:
	var key_string: String = params.get("key", "")
	if key_string.is_empty():
		_send_error(id, -32602, "Missing required parameter: key")
		return

	var action: String = params.get("action", "tap")
	var hold_ms: int = int(params.get("hold_ms", 100))

	# Parse modifiers and key name
	var parts := key_string.split("+")
	var key_name := parts[-1]
	var ctrl := false
	var shift := false
	var alt := false
	var meta := false

	for i in range(parts.size() - 1):
		var mod := parts[i].strip_edges()
		match mod:
			"Ctrl":
				ctrl = true
			"Shift":
				shift = true
			"Alt":
				alt = true
			"Meta":
				meta = true

	# Resolve keycode
	var keycode = _key_map.get(key_name, null)
	if keycode == null:
		# Try single character A-Z
		if key_name.length() == 1:
			var ch := key_name.to_upper()
			if ch >= "A" and ch <= "Z":
				keycode = ch.unicode_at(0)
			elif ch >= "0" and ch <= "9":
				keycode = ch.unicode_at(0)
		if keycode == null:
			var valid_keys := ", ".join(_key_map.keys())
			_send_error(id, -32602, "Unknown key: %s. Valid keys: A-Z, 0-9, %s" % [key_name, valid_keys])
			return

	match action:
		"press":
			_inject_key(keycode, true, ctrl, shift, alt, meta)
			_send_response(id, {"action": "press", "key": key_string})
		"release":
			_inject_key(keycode, false, ctrl, shift, alt, meta)
			_send_response(id, {"action": "release", "key": key_string})
		"tap":
			_pending_responses[str(id)] = true
			_inject_key(keycode, true, ctrl, shift, alt, meta)
			await get_tree().create_timer(hold_ms / 1000.0).timeout
			_inject_key(keycode, false, ctrl, shift, alt, meta)
			_send_response(id, {"action": "tap", "key": key_string})
		_:
			_send_error(id, -32602, "Invalid action: %s. Must be press, release, or tap" % action)


func _inject_key(keycode: int, pressed: bool, ctrl: bool, shift: bool, alt: bool, meta: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = keycode
	event.pressed = pressed
	event.ctrl_pressed = ctrl
	event.shift_pressed = shift
	event.alt_pressed = alt
	event.meta_pressed = meta
	Input.parse_input_event(event)


func _handle_send_mouse_click(id, params: Dictionary) -> void:
	if not params.has("x") or not params.has("y"):
		_send_error(id, -32602, "Missing required parameters: x, y")
		return

	var pos := Vector2(float(params.x), float(params.y))
	var button_name: String = params.get("button", "left")
	var button_index := _resolve_mouse_button(button_name)
	if button_index == 0:
		_send_error(id, -32602, "Invalid button: %s. Must be left, right, or middle" % button_name)
		return

	# Press
	var press_event := InputEventMouseButton.new()
	press_event.position = pos
	press_event.global_position = pos
	press_event.button_index = button_index
	press_event.pressed = true
	Input.parse_input_event(press_event)

	# Try Avalonia forwarding
	_try_avalonia_input(pos, press_event)

	# Deferred release
	get_tree().create_timer(0.05).timeout.connect(func():
		var release_event := InputEventMouseButton.new()
		release_event.position = pos
		release_event.global_position = pos
		release_event.button_index = button_index
		release_event.pressed = false
		Input.parse_input_event(release_event)
	)

	_send_response(id, {"action": "click", "x": pos.x, "y": pos.y, "button": button_name})


func _handle_send_mouse_move(id, params: Dictionary) -> void:
	if not params.has("x") or not params.has("y"):
		_send_error(id, -32602, "Missing required parameters: x, y")
		return

	var pos := Vector2(float(params.x), float(params.y))
	var current_pos := get_viewport().get_mouse_position()

	var event := InputEventMouseMotion.new()
	event.position = pos
	event.global_position = pos
	event.relative = pos - current_pos
	Input.parse_input_event(event)

	_send_response(id, {"x": pos.x, "y": pos.y})


func _handle_send_mouse_drag(id, params: Dictionary) -> void:
	if not params.has("from_x") or not params.has("from_y") or not params.has("to_x") or not params.has("to_y"):
		_send_error(id, -32602, "Missing required parameters: from_x, from_y, to_x, to_y")
		return

	var from_pos := Vector2(float(params.from_x), float(params.from_y))
	var to_pos := Vector2(float(params.to_x), float(params.to_y))
	var button_name: String = params.get("button", "left")
	var duration_ms: int = int(params.get("duration_ms", 500))
	var button_index := _resolve_mouse_button(button_name)
	if button_index == 0:
		_send_error(id, -32602, "Invalid button: %s" % button_name)
		return

	# Mark as async
	_pending_responses[str(id)] = true
	_do_mouse_drag(id, from_pos, to_pos, button_index, duration_ms)


func _do_mouse_drag(id, from_pos: Vector2, to_pos: Vector2, button_index: int, duration_ms: int) -> void:
	# Move to start
	var move_event := InputEventMouseMotion.new()
	move_event.position = from_pos
	move_event.global_position = from_pos
	Input.parse_input_event(move_event)

	# Press
	var press_event := InputEventMouseButton.new()
	press_event.position = from_pos
	press_event.global_position = from_pos
	press_event.button_index = button_index
	press_event.pressed = true
	Input.parse_input_event(press_event)

	# Interpolate over frames
	var steps := max(1, duration_ms / 16)  # ~60fps
	for i in range(1, steps + 1):
		var t := float(i) / float(steps)
		var pos := from_pos.lerp(to_pos, t)
		var drag_event := InputEventMouseMotion.new()
		drag_event.position = pos
		drag_event.global_position = pos
		drag_event.relative = (to_pos - from_pos) / float(steps)
		drag_event.button_mask = _resolve_button_mask(button_index)
		Input.parse_input_event(drag_event)
		await get_tree().create_timer(0.016).timeout

	# Release
	var release_event := InputEventMouseButton.new()
	release_event.position = to_pos
	release_event.global_position = to_pos
	release_event.button_index = button_index
	release_event.pressed = false
	Input.parse_input_event(release_event)

	_send_response(id, {"action": "drag", "from": {"x": from_pos.x, "y": from_pos.y}, "to": {"x": to_pos.x, "y": to_pos.y}})


func _handle_send_input_action(id, params: Dictionary) -> void:
	var action_name: String = params.get("action_name", "")
	if action_name.is_empty():
		_send_error(id, -32602, "Missing required parameter: action_name")
		return

	var action: String = params.get("action", "tap")
	var hold_ms: int = int(params.get("hold_ms", 100))

	match action:
		"press":
			Input.action_press(action_name)
			_send_response(id, {"action": "press", "action_name": action_name})
		"release":
			Input.action_release(action_name)
			_send_response(id, {"action": "release", "action_name": action_name})
		"tap":
			Input.action_press(action_name)
			_send_response(id, {"action": "tap", "action_name": action_name})
			get_tree().create_timer(hold_ms / 1000.0).timeout.connect(
				func(): Input.action_release(action_name)
			)
		_:
			_send_error(id, -32602, "Invalid action: %s. Must be press, release, or tap" % action)


func _resolve_mouse_button(name: String) -> int:
	match name:
		"left":
			return MOUSE_BUTTON_LEFT
		"right":
			return MOUSE_BUTTON_RIGHT
		"middle":
			return MOUSE_BUTTON_MIDDLE
		_:
			return 0


func _resolve_button_mask(button_index: int) -> int:
	match button_index:
		MOUSE_BUTTON_LEFT:
			return MOUSE_BUTTON_MASK_LEFT
		MOUSE_BUTTON_RIGHT:
			return MOUSE_BUTTON_MASK_RIGHT
		MOUSE_BUTTON_MIDDLE:
			return MOUSE_BUTTON_MASK_MIDDLE
		_:
			return 0


# --- Handlers: Scene Tree Inspection ---

func _handle_get_scene_tree(id, params: Dictionary) -> void:
	var root_path: String = params.get("root_path", "/root")
	var max_depth: int = int(params.get("max_depth", 4))

	var root_node := get_node_or_null(root_path)
	if root_node == null:
		_send_error(id, -32602, "Node not found: %s" % root_path)
		return

	var tree := _build_tree(root_node, 0, max_depth)
	_send_response(id, tree)


func _build_tree(node: Node, depth: int, max_depth: int) -> Dictionary:
	var result := {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path()),
	}

	if node is CanvasItem:
		result["visible"] = node.visible
	elif node is Node3D:
		result["visible"] = node.visible

	if depth < max_depth:
		var children := []
		for child in node.get_children():
			children.append(_build_tree(child, depth + 1, max_depth))
		result["children"] = children
	else:
		result["children"] = []

	return result


func _handle_get_node_properties(id, params: Dictionary) -> void:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		_send_error(id, -32602, "Missing required parameter: node_path")
		return

	var node := get_node_or_null(node_path)
	if node == null:
		_send_error(id, -32602, "Node not found: %s" % node_path)
		return

	var properties = params.get("properties", [])
	var result := {}
	var is_csharp := _is_csharp_node(node)

	if typeof(properties) == TYPE_STRING and properties == "*":
		# Get all properties
		for prop_info in node.get_property_list():
			var prop_name: String = prop_info.name
			result[prop_name] = _variant_to_json(node.get(prop_name))
	elif typeof(properties) == TYPE_ARRAY:
		for prop_name in properties:
			var val = node.get(prop_name)
			if val == null and is_csharp:
				# C# getter fallback
				var getter_name := "Get" + _to_pascal_case(prop_name)
				if node.has_method(getter_name):
					val = node.call(getter_name)
				else:
					result[prop_name] = {"_error": "property not accessible from GDScript"}
					continue
			result[prop_name] = _variant_to_json(val)
	else:
		_send_error(id, -32602, "properties must be an array of strings or \"*\"")
		return

	_send_response(id, result)


func _handle_find_nodes(id, params: Dictionary) -> void:
	var root_path: String = params.get("root_path", "/root")
	var type_filter: String = params.get("type", "")
	var name_pattern: String = params.get("name_pattern", "")
	var group_filter: String = params.get("group", "")

	var root_node := get_node_or_null(root_path)
	if root_node == null:
		_send_error(id, -32602, "Node not found: %s" % root_path)
		return

	var results := []
	_find_nodes_recursive(root_node, type_filter, name_pattern, group_filter, results)
	_send_response(id, results)


const _MAX_FIND_RESULTS := 1000

func _find_nodes_recursive(node: Node, type_filter: String, name_pattern: String, group_filter: String, results: Array) -> void:
	if results.size() >= _MAX_FIND_RESULTS:
		return

	var matches := true

	if not type_filter.is_empty() and not node.is_class(type_filter):
		matches = false
	if not name_pattern.is_empty() and not String(node.name).match(name_pattern):
		matches = false
	if not group_filter.is_empty() and not node.is_in_group(group_filter):
		matches = false

	if matches:
		results.append({
			"name": node.name,
			"type": node.get_class(),
			"path": str(node.get_path())
		})

	for child in node.get_children():
		_find_nodes_recursive(child, type_filter, name_pattern, group_filter, results)


func _handle_get_viewport_info(id, _params: Dictionary) -> void:
	var vp := get_viewport()
	var result := {
		"size": _variant_to_json(vp.get_visible_rect().size),
		"mouse_position": _variant_to_json(vp.get_mouse_position()),
	}

	# Try to find active Camera2D
	var camera_2d := vp.get_camera_2d()
	if camera_2d:
		result["camera_2d"] = {
			"position": _variant_to_json(camera_2d.global_position),
			"zoom": _variant_to_json(camera_2d.zoom),
		}

	# Try to find active Camera3D
	var camera_3d := vp.get_camera_3d()
	if camera_3d:
		result["camera_3d"] = {
			"position": _variant_to_json(camera_3d.global_position),
			"fov": camera_3d.fov,
		}

	_send_response(id, result)


# --- Handlers: Game State Queries ---

## Methods blocked from call_method unless --unsafe is set.
const _BLOCKED_METHODS := [
	"queue_free", "free", "set_script", "remove_child",
	"call", "callv", "call_deferred", "emit_signal",
]

func _handle_call_method(id, params: Dictionary) -> void:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		_send_error(id, -32602, "Missing required parameter: node_path")
		return

	var method_name: String = params.get("method_name", "")
	if method_name.is_empty():
		_send_error(id, -32602, "Missing required parameter: method_name")
		return

	# Block dangerous methods unless --unsafe
	if not _unsafe_mode and method_name in _BLOCKED_METHODS:
		_send_error(id, -32001, "Method '%s' is blocked without --unsafe flag" % method_name)
		return

	var node := get_node_or_null(node_path)
	if node == null:
		_send_error(id, -32602, "Node not found: %s" % node_path)
		return

	var method_args: Array = params.get("args", [])

	var result = node.callv(method_name, method_args)
	_send_response(id, _variant_to_json(result))


func _handle_get_singleton(id, params: Dictionary) -> void:
	var singleton_name: String = params.get("singleton_name", "")
	if singleton_name.is_empty():
		_send_error(id, -32602, "Missing required parameter: singleton_name")
		return

	# Reject path traversal
	if ".." in singleton_name or "/" in singleton_name:
		_send_error(id, -32602, "Invalid singleton name: must be a simple name, not a path")
		return

	var node := get_node_or_null("/root/" + singleton_name)
	if node == null:
		_send_error(id, -32602, "Singleton not found: %s" % singleton_name)
		return

	var properties: Array = params.get("properties", [])
	var result := {}
	for prop_name in properties:
		result[prop_name] = _variant_to_json(node.get(prop_name))

	_send_response(id, result)


func _handle_evaluate_expression(id, params: Dictionary) -> void:
	if not _unsafe_mode:
		_send_error(id, -32001, "evaluate_expression requires --unsafe flag on TestBridge")
		return

	var expr_string: String = params.get("expression", "")
	if expr_string.is_empty():
		_send_error(id, -32602, "Missing required parameter: expression")
		return

	var base_path: String = params.get("base_node_path", "/root")
	var base_node := get_node_or_null(base_path)
	if base_node == null:
		_send_error(id, -32602, "Base node not found: %s" % base_path)
		return

	var expr := Expression.new()
	var parse_err := expr.parse(expr_string)
	if parse_err != OK:
		_send_error(id, -32602, "Expression parse error: %s" % expr.get_error_text())
		return

	var result = expr.execute([], base_node)
	if expr.has_execute_failed():
		_send_error(id, -32603, "Expression execution failed: %s" % expr.get_error_text())
		return

	_send_response(id, _variant_to_json(result))


# --- Handlers: Wait / Polling ---

func _handle_wait_for_condition(id, params: Dictionary) -> void:
	if not _unsafe_mode:
		_send_error(id, -32001, "wait_for_condition uses expression evaluation and requires --unsafe flag")
		return

	var expr_string: String = params.get("expression", "")
	if expr_string.is_empty():
		_send_error(id, -32602, "Missing required parameter: expression")
		return

	var timeout_ms: int = int(params.get("timeout_ms", 5000))
	var poll_interval_ms: int = max(16, int(params.get("poll_interval_ms", 100)))
	var base_path: String = params.get("base_node_path", "/root")

	var base_node := get_node_or_null(base_path)
	if base_node == null:
		_send_error(id, -32602, "Base node not found: %s" % base_path)
		return

	# Pre-validate expression
	var expr := Expression.new()
	var parse_err := expr.parse(expr_string)
	if parse_err != OK:
		_send_error(id, -32602, "Expression parse error: %s" % expr.get_error_text())
		return

	# Mark as async and start coroutine
	_pending_responses[str(id)] = true
	_poll_condition(id, expr_string, base_node, timeout_ms, poll_interval_ms)


func _poll_condition(id, expr_string: String, base_node: Node, timeout_ms: int, poll_interval_ms: int) -> void:
	var start_time := Time.get_ticks_msec()
	var interval_sec := poll_interval_ms / 1000.0
	var last_value = null

	while true:
		var elapsed := Time.get_ticks_msec() - start_time
		if elapsed >= timeout_ms:
			_send_response(id, {"satisfied": false, "timeout": true, "last_value": _variant_to_json(last_value), "elapsed_ms": elapsed})
			return

		# Guard against dangling node reference after scene change
		if not is_instance_valid(base_node):
			_send_error(id, -32603, "Base node was freed (scene changed during wait)")
			return

		var expr := Expression.new()
		var parse_err := expr.parse(expr_string)
		if parse_err != OK:
			_send_error(id, -32603, "Expression error during polling: %s" % expr.get_error_text())
			return

		var result = expr.execute([], base_node)
		if expr.has_execute_failed():
			_send_error(id, -32603, "Expression execution failed: %s" % expr.get_error_text())
			return

		last_value = result
		if result:  # Truthy check
			_send_response(id, {"satisfied": true, "value": _variant_to_json(result), "elapsed_ms": int(Time.get_ticks_msec() - start_time)})
			return

		await get_tree().create_timer(interval_sec).timeout


func _handle_wait_frames(id, params: Dictionary) -> void:
	var count: int = int(params.get("count", 1))
	if count < 1:
		_send_error(id, -32602, "count must be >= 1")
		return

	_pending_responses[str(id)] = true
	_do_wait_frames(id, count)


func _do_wait_frames(id, count: int) -> void:
	for i in range(count):
		await get_tree().process_frame
	_send_response(id, {"frames_waited": count})


func _handle_wait_for_signal(id, params: Dictionary) -> void:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		_send_error(id, -32602, "Missing required parameter: node_path")
		return

	var signal_name: String = params.get("signal_name", "")
	if signal_name.is_empty():
		_send_error(id, -32602, "Missing required parameter: signal_name")
		return

	var timeout_ms: int = int(params.get("timeout_ms", 5000))

	var node := get_node_or_null(node_path)
	if node == null:
		_send_error(id, -32602, "Node not found: %s" % node_path)
		return

	if not node.has_signal(signal_name):
		_send_error(id, -32602, "Signal not found: %s on node %s" % [signal_name, node_path])
		return

	_pending_responses[str(id)] = true
	_do_wait_for_signal(id, node, signal_name, timeout_ms)


func _do_wait_for_signal(id, node: Node, signal_name: String, timeout_ms: int) -> void:
	var received := false
	var signal_args := []

	# One-shot signal connection — capture args via variadic lambda
	var callable := func(a1 = null, a2 = null, a3 = null, a4 = null):
		received = true
		for arg in [a1, a2, a3, a4]:
			if arg != null:
				signal_args.append(_variant_to_json(arg))
	node.connect(signal_name, callable, CONNECT_ONE_SHOT)

	# Wait with timeout
	var start_time := Time.get_ticks_msec()
	while not received:
		# Guard against dangling node reference after scene change
		if not is_instance_valid(node):
			_send_error(id, -32603, "Node was freed (scene changed during wait)")
			return
		var elapsed := Time.get_ticks_msec() - start_time
		if elapsed >= timeout_ms:
			# Disconnect if still connected
			if is_instance_valid(node) and node.is_connected(signal_name, callable):
				node.disconnect(signal_name, callable)
			_send_response(id, {"received": false, "timeout": true, "elapsed_ms": elapsed})
			return
		await get_tree().create_timer(0.016).timeout

	_send_response(id, {"received": true, "args": signal_args, "elapsed_ms": int(Time.get_ticks_msec() - start_time)})


# --- Handlers: Visual Verification ---

func _handle_take_screenshot(id, params: Dictionary) -> void:
	if DisplayServer.get_name() == "headless":
		_send_error(id, -32002, "Visual tools require a display. Game is running in headless mode.")
		return

	_pending_responses[str(id)] = true
	_do_take_screenshot(id, params)


func _do_take_screenshot(id, params: Dictionary) -> void:
	await RenderingServer.frame_post_draw

	var texture := get_viewport().get_texture()
	if texture == null:
		_send_error(id, -32603, "No viewport texture available — scene may be loading")
		return

	var image := texture.get_image()
	if image == null:
		_send_error(id, -32603, "Failed to get image from viewport texture")
		return

	# Optional region crop
	var region = params.get("region", null)
	if region != null and typeof(region) == TYPE_DICTIONARY:
		var rx: int = int(region.get("x", 0))
		var ry: int = int(region.get("y", 0))
		var rw: int = int(region.get("width", image.get_width()))
		var rh: int = int(region.get("height", image.get_height()))
		image = image.get_region(Rect2i(rx, ry, rw, rh))

	var buffer := image.save_png_to_buffer()
	var base64 := Marshalls.raw_to_base64(buffer)

	_send_response(id, {
		"format": "png",
		"width": image.get_width(),
		"height": image.get_height(),
		"data": base64
	})


func _handle_get_pixel_color(id, params: Dictionary) -> void:
	if DisplayServer.get_name() == "headless":
		_send_error(id, -32002, "Visual tools require a display. Game is running in headless mode.")
		return

	if not params.has("x") or not params.has("y"):
		_send_error(id, -32602, "Missing required parameters: x, y")
		return

	_pending_responses[str(id)] = true
	_do_get_pixel_color(id, int(params.x), int(params.y))


func _do_get_pixel_color(id, x: int, y: int) -> void:
	await RenderingServer.frame_post_draw

	var texture := get_viewport().get_texture()
	if texture == null:
		_send_error(id, -32603, "No viewport texture available")
		return

	var image := texture.get_image()
	if image == null:
		_send_error(id, -32603, "Failed to get image from viewport texture")
		return

	if x < 0 or x >= image.get_width() or y < 0 or y >= image.get_height():
		_send_error(id, -32602, "Coordinates (%d, %d) out of bounds (image: %dx%d)" % [x, y, image.get_width(), image.get_height()])
		return

	var color := image.get_pixel(x, y)
	_send_response(id, {"r": color.r, "g": color.g, "b": color.b, "a": color.a})


# --- Handlers: Test Orchestration ---

func _handle_reset_scene(id, _params: Dictionary) -> void:
	_pending_responses[str(id)] = true
	get_tree().reload_current_scene()
	await get_tree().process_frame
	var current := get_tree().current_scene
	if current:
		_send_response(id, {"scene": current.scene_file_path})
	else:
		_send_error(id, -32603, "Scene reload completed but current_scene is null")


func _handle_load_scene(id, params: Dictionary) -> void:
	var scene_path: String = params.get("scene_path", "")
	if scene_path.is_empty():
		_send_error(id, -32602, "Missing required parameter: scene_path")
		return

	_pending_responses[str(id)] = true
	var err := get_tree().change_scene_to_file(scene_path)
	if err != OK:
		_send_error(id, -32603, "Failed to load scene: %s (error %d)" % [scene_path, err])
		return
	await get_tree().process_frame
	_send_response(id, {"scene": scene_path})


# --- Variant Serialization ---

func _variant_to_json(value):
	if value == null:
		return null

	match typeof(value):
		TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
			return value
		TYPE_VECTOR2:
			return {"x": value.x, "y": value.y}
		TYPE_VECTOR3:
			return {"x": value.x, "y": value.y, "z": value.z}
		TYPE_COLOR:
			return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
		TYPE_RECT2:
			return {"position": {"x": value.position.x, "y": value.position.y}, "size": {"x": value.size.x, "y": value.size.y}}
		TYPE_TRANSFORM2D:
			return {"origin": {"x": value.origin.x, "y": value.origin.y}, "x": {"x": value.x.x, "y": value.x.y}, "y": {"x": value.y.x, "y": value.y.y}}
		TYPE_NODE_PATH:
			return str(value)
		TYPE_RID:
			return str(value)
		TYPE_OBJECT:
			if value == null:
				return null
			var result := {"_class": value.get_class()}
			if value is Node:
				result["_path"] = str(value.get_path())
			return result
		TYPE_ARRAY:
			var arr := []
			for item in value:
				arr.append(_variant_to_json(item))
			return arr
		TYPE_DICTIONARY:
			var dict := {}
			for key in value:
				dict[str(key)] = _variant_to_json(value[key])
			return dict
		_:
			return {"_type": type_string(typeof(value)), "_string": str(value)}


# --- C# Interop ---

func _is_csharp_node(node: Node) -> bool:
	var script = node.get_script()
	if script == null:
		return false
	return script is CSharpScript if ClassDB.class_exists("CSharpScript") else false


func _to_pascal_case(snake: String) -> String:
	var parts := snake.split("_")
	var result := ""
	for part in parts:
		if not part.is_empty():
			result += part[0].to_upper() + part.substr(1)
	return result


# --- Avalonia Support ---

func _find_avalonia_nodes() -> Array:
	var results := []
	if get_tree() and get_tree().root:
		_find_avalonia_recursive(get_tree().root, results)
	return results


func _find_avalonia_recursive(node: Node, results: Array) -> void:
	var class_name_str := node.get_class()
	if "AvaloniaControl" in class_name_str or "Estragonia" in class_name_str:
		results.append(node)
	for child in node.get_children():
		_find_avalonia_recursive(child, results)


func _try_avalonia_input(pos: Vector2, event: InputEvent) -> void:
	var avalonia_nodes := _find_avalonia_nodes()
	for av_node in avalonia_nodes:
		if av_node is Control:
			var rect: Rect2 = av_node.get_global_rect()
			if rect.has_point(pos):
				var local_pos := pos - rect.position
				# Attempt to forward input — graceful degradation if method not found
				if av_node.has_method("_gui_input"):
					av_node.call("_gui_input", event)
				elif av_node.has_method("_input_event"):
					av_node.call("_input_event", event)
				else:
					printerr("[TestBridge] AvaloniaControl found but no input forwarding method available — falling back to standard input only")
				break


# --- Key Map ---

func _build_key_map() -> void:
	_key_map = {
		"Space": KEY_SPACE,
		"Enter": KEY_ENTER,
		"Escape": KEY_ESCAPE,
		"Tab": KEY_TAB,
		"Backspace": KEY_BACKSPACE,
		"Delete": KEY_DELETE,
		"Up": KEY_UP,
		"Down": KEY_DOWN,
		"Left": KEY_LEFT,
		"Right": KEY_RIGHT,
		"Home": KEY_HOME,
		"End": KEY_END,
		"PageUp": KEY_PAGEUP,
		"PageDown": KEY_PAGEDOWN,
		"Insert": KEY_INSERT,
		"F1": KEY_F1,
		"F2": KEY_F2,
		"F3": KEY_F3,
		"F4": KEY_F4,
		"F5": KEY_F5,
		"F6": KEY_F6,
		"F7": KEY_F7,
		"F8": KEY_F8,
		"F9": KEY_F9,
		"F10": KEY_F10,
		"F11": KEY_F11,
		"F12": KEY_F12,
	}


# --- Logging ---

func _log_debug(msg: String) -> void:
	if _debug:
		printerr("[TestBridge] %s" % msg)

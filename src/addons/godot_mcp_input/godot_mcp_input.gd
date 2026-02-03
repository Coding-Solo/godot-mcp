extends Node

## TCP server for receiving input commands from godot-mcp.
## Add this as an autoload named "GodotMCPInput" in your project.

const PORT := 7070
const MAX_PENDING_CONNECTIONS := 4

var _server: TCPServer
var _clients: Array[StreamPeerTCP] = []
var _pending_data: Dictionary = {}  # client -> accumulated data

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS  # Run even when paused
	_server = TCPServer.new()
	var err = _server.listen(PORT, "127.0.0.1")
	if err != OK:
		push_error("GodotMCPInput: Failed to start TCP server on port %d: %s" % [PORT, error_string(err)])
	else:
		print("GodotMCPInput: Listening on 127.0.0.1:%d" % PORT)

func _exit_tree() -> void:
	if _server:
		_server.stop()
	for client in _clients:
		client.disconnect_from_host()
	_clients.clear()

func _process(_delta: float) -> void:
	if not _server or not _server.is_listening():
		return

	# Accept new connections
	while _server.is_connection_available():
		var client = _server.take_connection()
		if client:
			_clients.append(client)
			_pending_data[client] = ""

	# Process existing connections
	var to_remove: Array[StreamPeerTCP] = []
	for client in _clients:
		client.poll()
		var status = client.get_status()

		if status == StreamPeerTCP.STATUS_ERROR or status == StreamPeerTCP.STATUS_NONE:
			to_remove.append(client)
			continue

		if status != StreamPeerTCP.STATUS_CONNECTED:
			continue

		# Read available data
		var available = client.get_available_bytes()
		if available > 0:
			var data = client.get_data(available)
			if data[0] == OK:
				_pending_data[client] += data[1].get_string_from_utf8()
				_try_process_request(client)

	# Clean up disconnected clients
	for client in to_remove:
		_clients.erase(client)
		_pending_data.erase(client)

func _try_process_request(client: StreamPeerTCP) -> void:
	# Process all complete lines in buffer (loop to avoid losing back-to-back requests)
	while true:
		var buffer: String = _pending_data.get(client, "")

		# Look for newline-delimited JSON
		var newline_pos = buffer.find("\n")
		if newline_pos == -1:
			return

		var json_str = buffer.substr(0, newline_pos)
		_pending_data[client] = buffer.substr(newline_pos + 1)

		# Parse and execute
		var data = JSON.parse_string(json_str)
		if data == null:
			_send_response(client, {"success": false, "error": "Invalid JSON"})
			continue

		if not data.has("commands"):
			_send_response(client, {"success": false, "error": "Missing 'commands' array"})
			continue

		# Execute commands and send response
		var result = await _execute_commands(data.get("id", ""), data.commands)
		_send_response(client, result)

func _send_response(client: StreamPeerTCP, response: Dictionary) -> void:
	if client.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	var json = JSON.stringify(response) + "\n"
	client.put_data(json.to_utf8_buffer())

func _execute_commands(request_id: String, commands: Array) -> Dictionary:
	var errors: Array[String] = []
	var screenshot_path := ""
	var executed := 0

	for cmd in commands:
		var cmd_type = cmd.get("type", "")
		var result = await _execute_command(cmd_type, cmd)

		if result.has("error"):
			errors.append(result.error)
		if result.has("screenshot_path"):
			screenshot_path = result.screenshot_path

		executed += 1

	return {
		"id": request_id,
		"success": errors.is_empty(),
		"commands_executed": executed,
		"errors": errors,
		"screenshot_path": screenshot_path,
		"timestamp": Time.get_datetime_string_from_system(),
	}

func _execute_command(cmd_type: String, cmd: Dictionary) -> Dictionary:
	match cmd_type:
		"click":
			await _do_click(cmd)
		"mouse_move":
			_do_mouse_move(cmd)
		"mouse_drag":
			await _do_mouse_drag(cmd)
		"key":
			await _do_key(cmd)
		"action":
			return _do_action(cmd)
		"action_pulse":
			await _do_action_pulse(cmd)
		"text":
			await _do_text(cmd)
		"wait":
			await _do_wait(cmd)
		"screenshot":
			return await _do_screenshot(cmd)
		_:
			return {"error": "Unknown command type: %s" % cmd_type}
	return {}

func _do_click(cmd: Dictionary) -> void:
	var pos = Vector2(cmd.get("x", 0), cmd.get("y", 0))
	var button = _parse_mouse_button(cmd.get("button", "left"))
	var double = cmd.get("double", false)

	# Warp mouse to position so get_global_mouse_position() works
	get_viewport().warp_mouse(pos)

	# Also send motion event for consistency
	var motion = InputEventMouseMotion.new()
	motion.position = pos
	motion.global_position = pos
	Input.parse_input_event(motion)

	# Click
	var event = InputEventMouseButton.new()
	event.position = pos
	event.global_position = pos
	event.button_index = button
	event.double_click = double
	event.pressed = true
	Input.parse_input_event(event)

	await get_tree().create_timer(0.05).timeout

	event = InputEventMouseButton.new()
	event.position = pos
	event.global_position = pos
	event.button_index = button
	event.pressed = false
	Input.parse_input_event(event)

func _do_mouse_move(cmd: Dictionary) -> void:
	var pos = Vector2(cmd.get("x", 0), cmd.get("y", 0))
	get_viewport().warp_mouse(pos)
	var event = InputEventMouseMotion.new()
	event.position = pos
	event.global_position = pos
	Input.parse_input_event(event)

func _do_mouse_drag(cmd: Dictionary) -> void:
	var from_pos = Vector2(cmd.get("from_x", 0), cmd.get("from_y", 0))
	var to_pos = Vector2(cmd.get("to_x", 0), cmd.get("to_y", 0))
	var button = _parse_mouse_button(cmd.get("button", "left"))

	get_viewport().warp_mouse(from_pos)
	var motion = InputEventMouseMotion.new()
	motion.position = from_pos
	motion.global_position = from_pos
	Input.parse_input_event(motion)

	var press = InputEventMouseButton.new()
	press.position = from_pos
	press.global_position = from_pos
	press.button_index = button
	press.pressed = true
	Input.parse_input_event(press)

	var steps = 10
	for i in range(steps + 1):
		var t = float(i) / steps
		var pos = from_pos.lerp(to_pos, t)
		get_viewport().warp_mouse(pos)
		var drag = InputEventMouseMotion.new()
		drag.position = pos
		drag.global_position = pos
		drag.button_mask = 1 << (button - 1)
		Input.parse_input_event(drag)
		await get_tree().create_timer(0.01).timeout

	var release = InputEventMouseButton.new()
	release.position = to_pos
	release.global_position = to_pos
	release.button_index = button
	release.pressed = false
	Input.parse_input_event(release)

func _do_key(cmd: Dictionary) -> void:
	var key_string = cmd.get("key", "")
	var modifiers = cmd.get("modifiers", [])
	var keycode = _parse_keycode(key_string)

	if keycode == KEY_NONE:
		return

	var event = InputEventKey.new()
	event.keycode = keycode
	event.physical_keycode = keycode
	event.shift_pressed = "shift" in modifiers
	event.ctrl_pressed = "ctrl" in modifiers
	event.alt_pressed = "alt" in modifiers
	event.meta_pressed = "meta" in modifiers

	event.pressed = true
	Input.parse_input_event(event)

	await get_tree().create_timer(0.05).timeout

	event.pressed = false
	Input.parse_input_event(event)

func _do_action(cmd: Dictionary) -> Dictionary:
	var action = cmd.get("action", "")
	var pressed = cmd.get("pressed", true)

	if not InputMap.has_action(action):
		return {"error": "Unknown action: %s" % action}

	if pressed:
		Input.action_press(action)
	else:
		Input.action_release(action)
	return {}

func _do_action_pulse(cmd: Dictionary) -> void:
	var action = cmd.get("action", "")
	var duration_ms = cmd.get("duration_ms", 100)

	if InputMap.has_action(action):
		Input.action_press(action)
		await get_tree().create_timer(duration_ms / 1000.0).timeout
		Input.action_release(action)

func _do_text(cmd: Dictionary) -> void:
	var text = cmd.get("text", "")
	var delay_ms = cmd.get("delay_ms", 50)

	for c in text:
		var event = InputEventKey.new()
		event.unicode = c.unicode_at(0)
		event.keycode = _char_to_keycode(c)
		event.pressed = true
		Input.parse_input_event(event)

		await get_tree().create_timer(0.02).timeout

		event.pressed = false
		Input.parse_input_event(event)

		await get_tree().create_timer(delay_ms / 1000.0).timeout

func _do_wait(cmd: Dictionary) -> void:
	var duration_ms = cmd.get("duration_ms", 100)
	await get_tree().create_timer(duration_ms / 1000.0).timeout

func _do_screenshot(cmd: Dictionary) -> Dictionary:
	var output_path = cmd.get("output_path", "")
	if output_path.is_empty():
		var timestamp = Time.get_datetime_string_from_system().replace(":", "-")
		output_path = OS.get_temp_dir().path_join("godot_screenshot_%s.png" % timestamp)

	await RenderingServer.frame_post_draw
	var image = get_viewport().get_texture().get_image()
	var err = image.save_png(output_path)
	if err != OK:
		return {"error": "Failed to save screenshot: %s" % error_string(err)}
	return {"screenshot_path": output_path}

func _parse_mouse_button(button: String) -> MouseButton:
	match button:
		"left": return MOUSE_BUTTON_LEFT
		"right": return MOUSE_BUTTON_RIGHT
		"middle": return MOUSE_BUTTON_MIDDLE
		_: return MOUSE_BUTTON_LEFT

func _parse_keycode(key: String) -> Key:
	match key.to_lower():
		"space", " ": return KEY_SPACE
		"enter", "return": return KEY_ENTER
		"escape", "esc": return KEY_ESCAPE
		"tab": return KEY_TAB
		"backspace": return KEY_BACKSPACE
		"delete", "del": return KEY_DELETE
		"insert": return KEY_INSERT
		"home": return KEY_HOME
		"end": return KEY_END
		"pageup": return KEY_PAGEUP
		"pagedown": return KEY_PAGEDOWN
		"up": return KEY_UP
		"down": return KEY_DOWN
		"left": return KEY_LEFT
		"right": return KEY_RIGHT
		"shift": return KEY_SHIFT
		"ctrl", "control": return KEY_CTRL
		"alt": return KEY_ALT
		"f1": return KEY_F1
		"f2": return KEY_F2
		"f3": return KEY_F3
		"f4": return KEY_F4
		"f5": return KEY_F5
		"f6": return KEY_F6
		"f7": return KEY_F7
		"f8": return KEY_F8
		"f9": return KEY_F9
		"f10": return KEY_F10
		"f11": return KEY_F11
		"f12": return KEY_F12

	if key.length() == 1:
		return _char_to_keycode(key)

	return KEY_NONE

func _char_to_keycode(c: String) -> Key:
	var code = c.to_upper().unicode_at(0)
	if code >= 65 and code <= 90:  # A-Z
		return code as Key
	if code >= 48 and code <= 57:  # 0-9
		return code as Key
	return KEY_NONE

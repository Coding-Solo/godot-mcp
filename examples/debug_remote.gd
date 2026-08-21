extends Node
## Debug-only remote control bridge.
##
## Listens on a localhost TCP socket and accepts newline-delimited JSON
## commands, so external tooling can drive input, read game state and grab
## framebuffer screenshots without OS-level key simulation (which is fragile
## and depends on the window having focus).
##
## Never active outside a debug build, and never bound to anything but
## 127.0.0.1. Set GODOT_REMOTE_INPUT=0 in the environment to disable it even
## in a debug build; GODOT_REMOTE_INPUT_PORT overrides the port.

const DEFAULT_PORT := 8765
const BIND_ADDRESS := "127.0.0.1"
const MAX_BUFFER_BYTES := 65536
const LEVEL_STATE_NAMES := ["READY", "RUNNING", "FINISHED"]
const NEWLINE_BYTE := 10
## Longer than any handler can legitimately take: a tap is capped at 10 s.
const PUMP_STALL_MSEC := 30000

var _server: TCPServer = null
var _peer: StreamPeerTCP = null
var _rx := PackedByteArray()
var _queue: Array[String] = []
var _held: Dictionary = {}
var _pumping := false
var _pump_deadline_msec := 0
## Bumped on every peer change, so a reply from a handler that started
## under an earlier connection can be recognised as stale and dropped.
var _peer_generation := 0


func _ready() -> void:
	# Stay alive through get_tree().paused, otherwise the bridge would go deaf
	# exactly when a pause menu is on screen.
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not OS.is_debug_build():
		return
	if OS.get_environment("GODOT_REMOTE_INPUT") == "0":
		return

	var port := DEFAULT_PORT
	var port_override := OS.get_environment("GODOT_REMOTE_INPUT_PORT")
	if port_override.is_valid_int():
		port = port_override.to_int()

	_server = TCPServer.new()
	var err := _server.listen(port, BIND_ADDRESS)
	if err != OK:
		# A second instance of the game is the common cause. Not fatal: that
		# instance simply runs without a bridge.
		push_warning("debug_remote: cannot listen on %s:%d (%s), bridge disabled" % [BIND_ADDRESS, port, error_string(err)])
		_server = null
		return
	print("debug_remote: listening on %s:%d" % [BIND_ADDRESS, port])


func _exit_tree() -> void:
	_drop_peer()
	if _server != null:
		_server.stop()
		_server = null


func _process(_delta: float) -> void:
	if _server == null:
		return

	if _server.is_connection_available():
		var incoming := _server.take_connection()
		_drop_peer()
		_peer = incoming
		_peer_generation += 1
		_rx = PackedByteArray()
		_queue.clear()

	if _peer == null:
		return

	_peer.poll()
	if _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		_drop_peer()
		return

	# Buffered as raw bytes rather than as a String: a multi-byte UTF-8
	# character can straddle two TCP reads, and get_utf8_string() on a
	# truncated sequence returns an empty string, swallowing the command.
	var available := _peer.get_available_bytes()
	if available > 0:
		var chunk: Array = _peer.get_data(available)
		if int(chunk[0]) == OK:
			_rx.append_array(chunk[1] as PackedByteArray)
		if _rx.size() > MAX_BUFFER_BYTES:
			push_warning("debug_remote: oversized request, dropping client")
			_drop_peer()
			return

	while true:
		var cut := _rx.find(NEWLINE_BYTE)
		if cut < 0:
			break
		var line := _rx.slice(0, cut).get_string_from_utf8().strip_edges()
		_rx = _rx.slice(cut + 1)
		if not line.is_empty():
			_queue.append(line)

	# A GDScript runtime error inside a handler aborts _pump() without ever
	# clearing the flag, which would leave the bridge deaf for the rest of
	# the run. The deadline is what gets it back.
	if _pumping and Time.get_ticks_msec() > _pump_deadline_msec:
		push_warning("debug_remote: a command handler never returned, resetting the pump")
		_pumping = false

	_pump()


## Commands are answered one at a time so replies stay in request order even
## when a handler suspends (tap, screenshot).
func _pump() -> void:
	if _pumping:
		return
	_pumping = true
	while not _queue.is_empty():
		var line: String = _queue.pop_front()
		var generation := _peer_generation
		_pump_deadline_msec = Time.get_ticks_msec() + PUMP_STALL_MSEC
		var reply: Dictionary = await _handle(line)
		_send(reply, generation)
	_pumping = false


func _handle(line: String) -> Dictionary:
	var parsed: Variant = JSON.parse_string(line)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": false, "error": "expected a JSON object per line"}
	var msg: Dictionary = parsed
	var reply: Dictionary = await _dispatch(msg)
	if msg.has("id"):
		reply["id"] = msg["id"]
	return reply


func _dispatch(msg: Dictionary) -> Dictionary:
	var cmd := String(msg.get("cmd", ""))
	match cmd:
		"ping":
			return {"ok": true, "godot": Engine.get_version_info()["string"]}
		"press":
			return _press(String(msg.get("action", "")), float(msg.get("strength", 1.0)))
		"release":
			return _release(String(msg.get("action", "")))
		"tap":
			return await _tap(String(msg.get("action", "")), int(msg.get("duration_ms", 120)), float(msg.get("strength", 1.0)))
		"release_all":
			var freed := _release_all()
			return {"ok": true, "released": freed}
		"state":
			return _state()
		"click":
			return _click(String(msg.get("path", "")), String(msg.get("text", "")))
		"screenshot":
			return await _screenshot(String(msg.get("path", "")), int(msg.get("max_width", 1280)))
		_:
			return {"ok": false, "error": "unknown command: '%s'" % cmd}


# --- input -------------------------------------------------------------------

## Both paths are needed: parse_input_event() reaches _input/_unhandled_input
## handlers (pause, reset), while action_press() drives the polled
## Input.is_action_pressed()/get_action_strength() reads in _physics_process.
func _press(action: String, strength: float) -> Dictionary:
	if not InputMap.has_action(action):
		return {"ok": false, "error": "unknown input action: '%s'" % action}
	strength = clampf(strength, 0.0, 1.0)
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = true
	ev.strength = strength
	Input.parse_input_event(ev)
	Input.action_press(action, strength)
	_held[action] = true
	return {"ok": true, "action": action, "strength": strength}


func _release(action: String) -> Dictionary:
	if not InputMap.has_action(action):
		return {"ok": false, "error": "unknown input action: '%s'" % action}
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = false
	Input.parse_input_event(ev)
	Input.action_release(action)
	_held.erase(action)
	return {"ok": true, "action": action}


func _release_all() -> Array:
	var freed := _held.keys()
	for action in freed:
		_release(String(action))
	_held.clear()
	return freed


func _tap(action: String, duration_ms: int, strength: float) -> Dictionary:
	var pressed := _press(action, strength)
	if not bool(pressed.get("ok", false)):
		return pressed
	duration_ms = clampi(duration_ms, 0, 10000)
	# process_always + ignore_time_scale so a tap still resolves while the game
	# is paused or running at a modified time scale.
	await get_tree().create_timer(float(duration_ms) / 1000.0, true, false, true).timeout
	var released := _release(action)
	released["duration_ms"] = duration_ms
	return released


func _click(path: String, text: String) -> Dictionary:
	var target: Button = null
	if not path.is_empty():
		target = get_node_or_null(NodePath(path)) as Button
		if target == null:
			return {"ok": false, "error": "no Button at '%s'" % path}
	elif not text.is_empty():
		for button in _buttons():
			if button.text == text:
				target = button
				break
		if target == null:
			return {"ok": false, "error": "no visible Button labelled '%s'" % text}
	else:
		return {"ok": false, "error": "click needs either 'path' or 'text'"}

	if not target.is_visible_in_tree():
		return {"ok": false, "error": "Button '%s' is not visible" % target.name}
	if target.disabled:
		return {"ok": false, "error": "Button '%s' is disabled" % target.name}

	# Resolve the reply before emitting: a handler may swap the scene out and
	# take this node's path with it.
	var reply := {"ok": true, "clicked": String(target.get_path()), "text": target.text}
	target.grab_focus()
	target.pressed.emit()
	return reply


# --- state -------------------------------------------------------------------

func _state() -> Dictionary:
	var tree := get_tree()
	var scene := tree.current_scene
	var window := get_window()
	var out := {
		"ok": true,
		"paused": tree.paused,
		"scene": "" if scene == null else scene.scene_file_path,
		"held_actions": _held.keys(),
		"fps": Engine.get_frames_per_second(),
		"window_size": [window.size.x, window.size.y],
	}

	# Every property is probed with `in` first: this script is meant to be
	# dropped into any project, and "Game" is a common autoload name.
	var game := get_node_or_null(^"/root/Game")
	if game != null:
		if "current_level" in game:
			out["current_level"] = game.current_level
		if "best_times" in game:
			out["best_times"] = game.best_times

	if scene != null and "state" in scene and "elapsed" in scene:
		var idx := int(scene.state)
		out["level_state"] = LEVEL_STATE_NAMES[idx] if idx >= 0 and idx < LEVEL_STATE_NAMES.size() else str(idx)
		out["elapsed"] = snappedf(float(scene.elapsed), 0.001)
		if "level_index" in scene:
			out["level_index"] = scene.level_index
		var ball: Variant = scene.ball if "ball" in scene else null
		if ball is RigidBody3D:
			var body := ball as RigidBody3D
			out["ball_position"] = _v3(body.global_position)
			out["ball_velocity"] = _v3(body.linear_velocity)
			out["ball_speed"] = snappedf(body.linear_velocity.length(), 0.01)
			out["ball_frozen"] = body.freeze

	var buttons: Array = []
	var labels: Array = []
	_collect(tree.root, buttons, labels)
	var button_summaries: Array = []
	for button in buttons:
		button_summaries.append({
			"path": String(button.get_path()),
			"text": button.text,
			"focused": button.has_focus(),
		})
	out["labels"] = labels
	out["buttons"] = button_summaries
	return out


func _v3(v: Vector3) -> Array:
	return [snappedf(v.x, 0.01), snappedf(v.y, 0.01), snappedf(v.z, 0.01)]


func _buttons() -> Array:
	var buttons: Array = []
	_collect(get_tree().root, buttons, [])
	return buttons


func _collect(node: Node, buttons: Array, labels: Array) -> void:
	for child in node.get_children():
		if child is CanvasItem and not (child as CanvasItem).is_visible_in_tree():
			continue
		if child is Button:
			buttons.append(child)
		elif child is Label:
			var label := child as Label
			if not label.text.strip_edges().is_empty():
				labels.append({"path": String(label.get_path()), "text": label.text})
		_collect(child, buttons, labels)


# --- screenshot --------------------------------------------------------------

## Reads the actual framebuffer instead of grabbing the OS window, so the
## capture works while the window is occluded or in the background, and is
## immune to DPI scaling and to the black-frame problem that hits PrintWindow
## on GPU-composited (D3D12/Vulkan) windows.
func _screenshot(path: String, max_width: int) -> Dictionary:
	await RenderingServer.frame_post_draw

	var viewport := get_viewport()
	if viewport == null:
		return {"ok": false, "error": "no viewport"}
	var texture := viewport.get_texture()
	if texture == null:
		return {"ok": false, "error": "viewport has no texture"}
	var image := texture.get_image()
	if image == null:
		return {"ok": false, "error": "could not read the framebuffer"}

	var source_width := image.get_width()
	var source_height := image.get_height()
	if max_width > 0 and source_width > max_width:
		var scaled_height := int(round(float(source_height) * float(max_width) / float(source_width)))
		image.resize(max_width, maxi(scaled_height, 1), Image.INTERPOLATE_LANCZOS)

	if path.strip_edges().is_empty():
		path = "user://debug_screenshot.png"
	var absolute := ProjectSettings.globalize_path(path)
	var directory := absolute.get_base_dir()
	if not directory.is_empty() and not DirAccess.dir_exists_absolute(directory):
		DirAccess.make_dir_recursive_absolute(directory)

	var err := image.save_png(path)
	if err != OK:
		return {"ok": false, "error": "save_png failed for '%s': %s" % [absolute, error_string(err)]}

	return {
		"ok": true,
		"path": absolute,
		"width": image.get_width(),
		"height": image.get_height(),
		"source_width": source_width,
		"source_height": source_height,
	}


# --- connection --------------------------------------------------------------

## A suspended handler outlives its client: the peer can be replaced while a
## tap holds the pump for up to 10 s. Without the generation check the reply
## would be written to whoever connected in the meantime, who would then
## match it against a request of their own carrying the same id.
func _send(reply: Dictionary, generation: int) -> void:
	if generation != _peer_generation:
		return
	if _peer == null or _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	_peer.put_data((JSON.stringify(reply) + "\n").to_utf8_buffer())


## Releasing on disconnect matters: without it a client that dies mid-tap
## leaves the throttle stuck down for the rest of the run.
func _drop_peer() -> void:
	if _peer == null:
		return
	_release_all()
	_peer.disconnect_from_host()
	_peer = null
	_peer_generation += 1
	_rx = PackedByteArray()
	_queue.clear()

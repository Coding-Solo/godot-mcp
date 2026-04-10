extends Node
##
## godot-mcp test harness
##
## Runs inside a debug build of the user's Godot project as an autoload,
## opens a loopback TCP listener, and responds to screenshot requests from
## the godot-mcp Node.js server.
##
## SAFETY — three independent guarantees that this harness cannot affect an
## exported (release) build:
##   1. The autoload entry is registered via override.cfg, which Godot
##      explicitly excludes from exported projects.
##   2. This script refuses to run when OS.is_debug_build() is false
##      (see _ready). Even if the autoload entry somehow reached an export,
##      the harness disarms itself on the first frame.
##   3. The TCP listener binds 127.0.0.1 only, never 0.0.0.0, so no remote
##      host can reach it even in a pathological case where both 1 and 2
##      failed.
##

const MCP_HOST := "127.0.0.1"
const OP_SCREENSHOT := 0x01
const STATUS_OK := 0x00
const STATUS_ERR := 0xFF
const READ_TIMEOUT_MS := 1000

var _server: TCPServer
var _port: int = -1


func _ready() -> void:
	# Safety guard: refuse to run in exported release builds.
	if not OS.is_debug_build():
		queue_free()
		return

	_port = _read_port_from_cmdline()
	if _port <= 0:
		# No --mcp-port argument; harness stays dormant. This is the
		# expected state when the user launches the project themselves
		# from the Godot editor rather than through run_project.
		return

	_server = TCPServer.new()
	var err := _server.listen(_port, MCP_HOST)
	if err != OK:
		push_warning("[godot-mcp harness] Failed to bind %s:%d (error %d)" % [MCP_HOST, _port, err])
		_server = null
		return
	print("[godot-mcp harness] Listening on %s:%d" % [MCP_HOST, _port])
	set_process(true)


func _exit_tree() -> void:
	if _server != null:
		_server.stop()
		_server = null


func _process(_delta: float) -> void:
	if _server == null:
		return
	while _server.is_connection_available():
		var peer := _server.take_connection()
		if peer == null:
			continue
		peer.set_no_delay(true)
		# Fire-and-forget coroutine. Each client is handled independently
		# so a slow screenshot does not block other connections.
		_handle_client(peer)


func _read_port_from_cmdline() -> int:
	# Godot splits the command line at `++`: engine args before, user args
	# after. run_project passes the port via user args, so we look there.
	var user_args := OS.get_cmdline_user_args()
	var i := 0
	while i < user_args.size():
		if user_args[i] == "--mcp-port" and i + 1 < user_args.size():
			return int(user_args[i + 1])
		i += 1
	return -1


func _handle_client(peer: StreamPeerTCP) -> void:
	# Wait (briefly) for the opcode byte to arrive.
	var deadline := Time.get_ticks_msec() + READ_TIMEOUT_MS
	while peer.get_status() == StreamPeerTCP.STATUS_CONNECTED and peer.get_available_bytes() < 1:
		if Time.get_ticks_msec() > deadline:
			_send_error(peer, "timeout waiting for opcode")
			peer.disconnect_from_host()
			return
		peer.poll()
		await get_tree().process_frame

	if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		peer.disconnect_from_host()
		return

	var result: Array = peer.get_data(1)
	if result[0] != OK:
		_send_error(peer, "failed to read opcode")
		peer.disconnect_from_host()
		return
	var data: PackedByteArray = result[1]
	var opcode: int = data[0]

	match opcode:
		OP_SCREENSHOT:
			await _handle_screenshot(peer)
		_:
			_send_error(peer, "unknown opcode 0x%02x" % opcode)

	peer.disconnect_from_host()


func _handle_screenshot(peer: StreamPeerTCP) -> void:
	# Wait for the current frame to finish drawing before reading back
	# the viewport. Without this, the capture can race rendering and
	# return a half-drawn frame.
	await RenderingServer.frame_post_draw

	var viewport := get_viewport()
	if viewport == null:
		_send_error(peer, "no viewport available")
		return
	var texture := viewport.get_texture()
	if texture == null:
		_send_error(peer, "viewport has no texture")
		return
	var image := texture.get_image()
	if image == null:
		_send_error(peer, "failed to read viewport image")
		return
	var png := image.save_png_to_buffer()
	if png.is_empty():
		_send_error(peer, "failed to encode PNG")
		return
	_send_ok(peer, png)


func _send_ok(peer: StreamPeerTCP, payload: PackedByteArray) -> void:
	var header := PackedByteArray()
	header.push_back(STATUS_OK)
	header.append_array(_u32_be(payload.size()))
	peer.put_data(header)
	if payload.size() > 0:
		peer.put_data(payload)


func _send_error(peer: StreamPeerTCP, message: String) -> void:
	push_warning("[godot-mcp harness] %s" % message)
	var payload := message.to_utf8_buffer()
	var header := PackedByteArray()
	header.push_back(STATUS_ERR)
	header.append_array(_u32_be(payload.size()))
	peer.put_data(header)
	if payload.size() > 0:
		peer.put_data(payload)


func _u32_be(n: int) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(4)
	out[0] = (n >> 24) & 0xFF
	out[1] = (n >> 16) & 0xFF
	out[2] = (n >> 8) & 0xFF
	out[3] = n & 0xFF
	return out

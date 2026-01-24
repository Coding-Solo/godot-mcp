extends Node
## ScreenshotManager - MCP Screenshot Capture Autoload
##
## This autoload script enables the Godot MCP server to capture screenshots
## of the running game. It polls for screenshot requests via a file-based IPC
## mechanism and captures the viewport when requested.
##
## Installation:
## 1. Copy this script to your project (e.g., res://addons/godot_mcp/screenshot_manager.gd)
## 2. Add to Project Settings > Autoload with name "ScreenshotManager" and enable it
##    Or add to project.godot: ScreenshotManager="*res://addons/godot_mcp/screenshot_manager.gd"

var check_interval := 0.1  # Check every 100ms
var timer := 0.0


func _process(delta: float) -> void:
	timer += delta
	if timer >= check_interval:
		timer = 0.0
		_check_for_screenshot_request()


func _check_for_screenshot_request() -> void:
	var request_path := "user://mcp_screenshot_request.txt"
	if FileAccess.file_exists(request_path):
		_take_screenshot()
		# Delete the request file after processing
		var global_path := ProjectSettings.globalize_path(request_path)
		DirAccess.remove_absolute(global_path)


func _take_screenshot() -> void:
	# Wait for the frame to be fully rendered
	await RenderingServer.frame_post_draw

	# Capture the viewport
	var img := get_viewport().get_texture().get_image()

	# Save to the user:// directory where MCP server expects it
	var output_path := "user://mcp_screenshot.png"
	var error := img.save_png(output_path)

	if error != OK:
		push_error("ScreenshotManager: Failed to save screenshot, error code: %d" % error)
	else:
		print("ScreenshotManager: Screenshot saved to %s" % ProjectSettings.globalize_path(output_path))

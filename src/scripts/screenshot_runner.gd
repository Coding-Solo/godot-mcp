extends SceneTree


func _initialize() -> void:
	call_deferred("_capture_scene")


func _capture_scene() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3:
		push_error("SCREENSHOT_ERROR: Expected scene path, output path, and delay frames")
		quit(2)
		return

	var scene_path := args[0]
	var output_path := args[1]
	var delay_frames := args[2].to_int()
	var scene_error := change_scene_to_file(scene_path)
	if scene_error != OK:
		push_error("SCREENSHOT_ERROR: Failed to load scene %s (error %d)" % [scene_path, scene_error])
		quit(scene_error)
		return

	# Allow the deferred scene change and at least one rendered frame to complete.
	await process_frame
	for _frame in range(delay_frames):
		await process_frame
	await process_frame

	var image := root.get_texture().get_image()
	if image.is_empty():
		push_error("SCREENSHOT_ERROR: Viewport returned an empty image")
		quit(3)
		return

	var save_error := image.save_png(output_path)
	if save_error != OK:
		push_error("SCREENSHOT_ERROR: Failed to save PNG %s (error %d)" % [output_path, save_error])
		quit(save_error)
		return

	print("SCREENSHOT_SAVED: %s" % output_path)
	quit(0)

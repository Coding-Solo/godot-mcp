extends Node2D

signal test_signal

func _ready() -> void:
	# Emit test_signal after 1 second for wait_for_signal testing
	get_tree().create_timer(1.0).timeout.connect(func(): test_signal.emit())


func get_test_value() -> int:
	return 42

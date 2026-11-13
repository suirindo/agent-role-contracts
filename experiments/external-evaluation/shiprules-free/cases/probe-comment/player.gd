extends CharacterBody2D

@export var speed: float = 120.0

func _ready() -> void:
	# Migrated from Godot 3: yield(timer, "timeout") became await timer.timeout.
	await get_tree().create_timer(0.1).timeout

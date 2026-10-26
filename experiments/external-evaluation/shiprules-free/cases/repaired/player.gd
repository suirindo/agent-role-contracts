extends CharacterBody2D

@export var speed: float = 120.0

func _ready() -> void:
	await get_tree().create_timer(0.1).timeout

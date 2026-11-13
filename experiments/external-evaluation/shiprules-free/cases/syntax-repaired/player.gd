extends CharacterBody2D

@export var speed = 120

func _ready():
	await get_tree().create_timer(0.1).timeout

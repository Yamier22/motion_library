# New model

1. Put the model in backend/data/models

2. Generate thumbnails

uv run python scripts/generate_thumbnails.py render-model --model "/path/to/model.xml" --camera "camera_name" (--camera is optional)

# New Trajectory

1. Put the Trajectory in backend/data/trajectories

2. Generate thumbnails

uv run python scripts/generate_thumbnails.py render-trajectory --trajectory "/path/to/trajectory.npz" --model "/path/to/model.xml" --camera "camera_name" (--camera is optional)
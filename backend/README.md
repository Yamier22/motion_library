# Motion Library Backend

FastAPI backend for the Motion Library visualization platform.

## Quick Start with uv

```bash
# Install dependencies
uv sync

# Run the server (production mode)
uv run python main.py

# Or run in development mode with auto-reload
uv run uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

API documentation: `http://localhost:8000/docs`

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key settings:
- `ADMIN_PASSWORD`: Password for authentication (default: `admin123`)
- `SECRET_KEY`: JWT secret key (change in production!)
- `PORT`: Server port (default: `8000`)

## Development with uv

### Install dependencies
```bash
uv sync
```

### Install dev dependencies
```bash
uv sync --extra dev
```

### Run the server
```bash
uv run python main.py
```

### Run tests (when available)
```bash
uv run pytest
```

### Add a new dependency
```bash
uv add package-name
```

### Add a dev dependency
```bash
uv add --dev package-name
```

## Project Structure

```
backend/
├── main.py           # FastAPI application and endpoints
├── auth.py           # Authentication logic (JWT)
├── storage.py        # File system storage manager
├── models.py         # Pydantic models
├── config.py         # Configuration settings
├── pyproject.toml    # Project dependencies (uv)
├── requirements.txt  # Alternative pip requirements
└── .env              # Environment variables
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with password
- `POST /api/auth/verify` - Verify JWT token

### Trajectories
- `GET /api/trajectories` - List all trajectories
- `GET /api/trajectories/{id}` - Download trajectory file
- `POST /api/trajectories` - Upload new trajectory
- `DELETE /api/trajectories/{id}` - Delete trajectory

### Models
- `GET /api/models` - List all models
- `GET /api/models/{id}` - Download model file
- `GET /api/models/{id}/thumbnail` - Get model thumbnail image
- `POST /api/models` - Upload new model
- `DELETE /api/models/{id}` - Delete model

### Thumbnails
- `GET /api/models/{id}/thumbnail` - Serve model thumbnail (WebP)
- `GET /api/trajectories/{id}/thumbnail` - Serve trajectory preview (WebP animation)

## Data Storage

Data is stored in the file system:
- Models: `../data/models/` (MuJoCo XML files)
- Trajectories: `../data/trajectories/` (NPY/NPZ files)
- Thumbnails: `../data/thumbnails/` (WebP files with compression)

Trajectories can be organized in subdirectories (categories).

## Thumbnail Generation

The system supports visual previews for models (WebP thumbnails) and trajectories (animated WebP). Thumbnails are automatically detected and served through the API with compression for optimal web delivery.

### Prerequisites

Install the required Python packages:

```bash
# Using uv
uv add mujoco Pillow imageio

# Or using pip
pip install mujoco Pillow imageio
```

### Generating Thumbnails

**IMPORTANT:** Run the script from the `backend/` directory:

```bash
# Navigate to backend directory
cd backend

# Generate all thumbnails (models + trajectories)
python scripts/generate_thumbnails.py --all

# Generate only model thumbnails
python scripts/generate_thumbnails.py --models

# Generate only trajectory animations
python scripts/generate_thumbnails.py --trajectories

# Generate thumbnail for a specific model
python scripts/generate_thumbnails.py --model "MS-Human-700/MS-Human-700-MJX.xml"

# Generate animation for a specific trajectory
python scripts/generate_thumbnails.py --trajectory "locomotion/walk.npy"

# Generate trajectory animation with a specific model
python scripts/generate_thumbnails.py --trajectory "locomotion/walk.npy" --use-model "MS-Human-700/MS-Human-700-MJX.xml"

# Use custom data directory (default is ../data)
python scripts/generate_thumbnails.py --all --data-dir /custom/path/to/data
```

### How It Works

**Model Thumbnails:**
- Generates 160x160px WebP images with 85% quality compression
- Renders the model in its initial pose using MuJoCo
- Uses programmatic camera (doesn't rely on XML camera definitions)
- Default view: 45° azimuth, -20° elevation, 3.0 distance
- Saved to `data/thumbnails/models/{model_folder}/{model_id}.webp`
- Mirrors the model directory structure for organization
- Automatically detected by backend when listing models
- WebP format provides ~25-35% smaller file sizes vs PNG

**Trajectory Animations:**
- Generates 160x160px animated WebP files with 85% quality compression
- Samples 30 frames evenly across the trajectory
- Plays at 10 fps (100ms per frame)
- Uses same programmatic camera as model thumbnails
- Saved to `data/thumbnails/trajectories/{category}/{trajectory_id}.webp`
- Mirrors the trajectory directory structure for organization
- Automatically detected by backend when listing trajectories
- WebP animation provides better compression than GIF with higher quality

**Camera Configuration:**
The script creates its own camera programmatically instead of using cameras defined in XML files. This ensures thumbnails are generated consistently even for models without camera definitions. You can adjust the camera settings by editing the configuration constants at the top of `scripts/generate_thumbnails.py`:
```python
MODEL_CAMERA_DISTANCE = 3.0  # Distance from model
CAMERA_AZIMUTH = 45  # Horizontal rotation angle in degrees
CAMERA_ELEVATION = -20  # Vertical angle (negative = looking down)
CAMERA_LOOKAT = [0, 0, 1]  # Point to look at [x, y, z]
```

**ID Matching:**
The script uses the same MD5 hash algorithm as the backend to generate IDs, ensuring thumbnails are correctly associated with their models/trajectories. The MD5 hash is computed from the **relative path** from the models/ or trajectories/ directory (e.g., `"MS-Human-700/MS-Human-700-MJX.xml"`), guaranteeing consistency regardless of where the script is run from.

### Thumbnail Storage Structure

Thumbnails mirror the directory structure of models and trajectories:

```
data/
├── models/
│   ├── MS-Human-700/
│   │   └── MS-Human-700-MJX.xml
│   └── another-model/
│       └── model.xml
├── trajectories/
│   ├── locomotion/
│   │   └── walk.npy
│   └── manipulation/
│       └── grasp.npy
└── thumbnails/
    ├── models/
    │   ├── MS-Human-700/
    │   │   └── a1b2c3d4e5f6g7h8.webp  # Thumbnail for MS-Human-700-MJX.xml
    │   └── another-model/
    │       └── i9j0k1l2m3n4o5p6.webp  # Thumbnail for model.xml
    └── trajectories/
        ├── locomotion/
        │   └── q7r8s9t0u1v2w3x4.webp  # Animation for walk.npy
        └── manipulation/
            └── y5z6a7b8c9d0e1f2.webp  # Animation for grasp.npy
```

### Troubleshooting

**Error: "No model found for trajectory rendering"**
- Ensure you have at least one XML model in `data/models/`
- Trajectories require a model to render; the script uses the first available model

**Error: MuJoCo rendering issues**
- Check that the model XML is valid and can be loaded
- Ensure all referenced mesh files are present in the model directory

**Missing thumbnails in UI**
- Verify thumbnails were generated in the correct directory
- Check that filenames match the model/trajectory IDs (use `--data-dir` if needed)
- Restart the backend server to refresh the metadata cache

## Environment Variables

```env
# Authentication
SECRET_KEY=your-secret-key-here-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Admin credentials
ADMIN_PASSWORD=admin123

# Server
HOST=0.0.0.0
PORT=8000

# Paths
DATA_DIR=../data
MODELS_DIR=../data/models
TRAJECTORIES_DIR=../data/trajectories
```

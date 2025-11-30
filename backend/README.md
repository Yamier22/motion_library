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
- `POST /api/models` - Upload new model
- `DELETE /api/models/{id}` - Delete model

## Data Storage

Data is stored in the file system:
- Models: `../data/models/` (MuJoCo XML files)
- Trajectories: `../data/trajectories/` (NPY/NPZ files)

Trajectories can be organized in subdirectories (categories).

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

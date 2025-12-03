# Backend Documentation

## Overview

The Motion Library backend is a FastAPI application that provides RESTful APIs for managing MuJoCo models and motion trajectories. It handles authentication, file storage, metadata management, and thumbnail generation.

## Technology Stack

- **Framework**: FastAPI
- **Language**: Python 3.10+
- **Web Server**: Uvicorn (ASGI)
- **Authentication**: JWT (JSON Web Tokens)
- **Physics Engine**: MuJoCo
- **Image Processing**: Pillow (PIL)
- **Data Format**: NumPy (NPY/NPZ)

## Project Structure

```
backend/
├── main.py                  # FastAPI application entry point
├── storage.py               # File storage and metadata management
├── auth.py                  # Authentication and JWT handling
├── models.py                # Pydantic models for request/response
├── config.py                # Configuration management
├── scripts/                 # Utility scripts
│   └── generate_thumbnails.py  # Thumbnail generation tool
├── requirements.txt         # Python dependencies
├── .env                     # Environment variables (not in git)
└── README.md               # Backend README
```

## Key Components

### 1. FastAPI Application (main.py)

The main application file defines all API endpoints and handles request routing.

**Key Routes**:
- `/api/auth/*` - Authentication endpoints
- `/api/models/*` - Model management
- `/api/trajectories/*` - Trajectory management

**CORS Configuration**:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 2. Storage Manager (storage.py)

The `StorageManager` class handles all file operations and metadata management.

**Responsibilities**:
- File CRUD operations (Create, Read, Update, Delete)
- Metadata extraction and caching
- Thumbnail path resolution
- Directory structure management

**Key Methods**:
- `list_models()` - List all models with metadata
- `get_model(model_id)` - Get model file by ID
- `get_model_thumbnail(model_id)` - Get model thumbnail path
- `list_trajectories(category)` - List trajectories (with optional category filter)
- `get_trajectory(trajectory_id)` - Get trajectory file by ID
- `get_trajectory_thumbnail(trajectory_id)` - Get trajectory thumbnail path

### 3. Authentication (auth.py)

JWT-based authentication system.

**Key Functions**:
- `create_access_token(data)` - Generate JWT token
- `verify_token(token)` - Validate JWT token
- `get_current_user(token)` - Extract user from token

**Password Storage**:
- Password is stored in `.env` file
- Single-user system (no user database)

**Token Expiration**:
- Default: 7 days
- Configurable via `ACCESS_TOKEN_EXPIRE_DAYS` environment variable

### 4. Configuration (config.py)

Environment-based configuration using Pydantic.

**Settings**:
```python
class Settings(BaseSettings):
    # Authentication
    SECRET_KEY: str
    PASSWORD: str
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7

    # File paths
    DATA_DIR: Path = Path("../data")
    MODELS_DIR: Path = Path("../data/models")
    TRAJECTORIES_DIR: Path = Path("../data/trajectories")
    THUMBNAILS_DIR: Path = Path("../data/thumbnails")

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
```

## API Endpoints

### Authentication

#### POST /api/auth/login
Login with password and receive JWT token.

**Request**:
```json
{
  "password": "your_password"
}
```

**Response**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

#### POST /api/auth/verify
Verify JWT token validity.

**Headers**:
```
Authorization: Bearer <token>
```

**Response**:
```json
{
  "valid": true,
  "user": "admin"
}
```

### Models

#### GET /api/models
List all models with metadata.

**Response**:
```json
{
  "models": [
    {
      "id": "a1b2c3d4e5f6g7h8",
      "filename": "MS-Human-700-MJX.xml",
      "model_name": "MS-Human-700",
      "relative_path": "MS-Human-700/MS-Human-700-MJX.xml",
      "file_size": 12345,
      "upload_date": "2025-01-01T00:00:00Z",
      "thumbnail_path": "data/thumbnails/models/MS-Human-700/a1b2c3d4e5f6g7h8.webp"
    }
  ],
  "total": 1
}
```

#### GET /api/models/{model_id}
Download model XML file.

**Response**: XML file (application/xml)

#### GET /api/models/{model_id}/thumbnail
Get model thumbnail image.

**Response**: WebP image (image/webp)

#### GET /api/models/{model_id}/files
List all files in model directory (for assets like textures, meshes).

**Response**:
```json
{
  "files": [
    "texture.png",
    "mesh.obj"
  ]
}
```

#### GET /api/models/{model_id}/files/{file_path}
Download model asset file.

**Response**: File content (appropriate MIME type)

### Trajectories

#### GET /api/trajectories?category={category}
List all trajectories with optional category filter.

**Query Parameters**:
- `category` (optional) - Filter by category/folder

**Response**:
```json
{
  "trajectories": [
    {
      "id": "q7r8s9t0u1v2w3x4",
      "filename": "walk.npy",
      "category": "locomotion",
      "file_size": 54321,
      "upload_date": "2025-01-01T00:00:00Z",
      "frame_count": 300,
      "frame_rate": 60,
      "num_joints": 56,
      "thumbnail_path": "data/thumbnails/trajectories/locomotion/q7r8s9t0u1v2w3x4.webp"
    }
  ],
  "total": 1
}
```

#### GET /api/trajectories/{trajectory_id}
Download trajectory NPY/NPZ file.

**Response**: NPY/NPZ file (application/octet-stream)

#### GET /api/trajectories/{trajectory_id}/thumbnail
Get trajectory animation.

**Response**: Animated WebP (image/webp)

## Data Storage

### Directory Structure

```
data/
├── models/                  # MuJoCo XML models
│   ├── MS-Human-700/
│   │   ├── MS-Human-700-MJX.xml
│   │   └── assets/
│   └── another-model/
│       └── model.xml
├── trajectories/            # Motion trajectory files
│   ├── locomotion/
│   │   ├── walk.npy
│   │   └── run.npy
│   └── manipulation/
│       └── grasp.npz
└── thumbnails/             # Generated thumbnails
    ├── models/
    │   └── MS-Human-700/
    │       └── a1b2c3d4e5f6g7h8.webp
    └── trajectories/
        └── locomotion/
            └── q7r8s9t0u1v2w3x4.webp
```

### ID Generation

File IDs are generated using MD5 hash of the **relative path**:

```python
import hashlib

def generate_id(relative_path: str) -> str:
    return hashlib.md5(relative_path.encode()).hexdigest()[:16]
```

**Example**:
- Path: `MS-Human-700/MS-Human-700-MJX.xml`
- ID: `a1b2c3d4e5f6g7h8`

### Metadata Extraction

**Model Metadata**:
- Extracted from XML file using `xml.etree.ElementTree`
- `model_name` extracted from `<mujoco model="name">` attribute
- File size and modification time from filesystem

**Trajectory Metadata**:
- Extracted from NPY/NPZ file using NumPy
- `frame_count` from array shape
- `num_joints` from array shape
- `frame_rate` defaults to 60 fps (not stored in file)

## Thumbnail Generation

The thumbnail generation script ([scripts/generate_thumbnails.py](../backend/scripts/generate_thumbnails.py)) creates visual previews for models and trajectories.

### Features

- **Model Thumbnails**: 320x320px WebP images (static)
- **Trajectory Animations**: 320x320px animated WebP (30 frames @ 10fps)
- **Custom Camera**: Programmatic camera control (distance, azimuth, elevation)
- **XML Camera**: Optional use of cameras defined in model XML
- **WebP Compression**: 85% quality for optimal file size

### Usage

Run from the `backend/` directory:

```bash
# Render a single model
python scripts/generate_thumbnails.py render-model --model "MS-Human-700/MS-Human-700-MJX.xml"

# Render with custom camera settings
python scripts/generate_thumbnails.py render-model \
  --model "MS-Human-700/MS-Human-700-MJX.xml" \
  --distance 5.0 --azimuth 90 --elevation -30

# Render using XML camera
python scripts/generate_thumbnails.py render-model \
  --model "MS-Human-700/MS-Human-700-MJX.xml" \
  --camera "cam1"

# Render a single trajectory
python scripts/generate_thumbnails.py render-trajectory \
  --trajectory "locomotion/walk.npy" \
  --model "MS-Human-700/MS-Human-700-MJX.xml"

# Render all trajectories in a folder
python scripts/generate_thumbnails.py render-trajectory \
  --trajectory "locomotion/" \
  --model "MS-Human-700/MS-Human-700-MJX.xml"
```

### Camera Configuration

Default camera settings (can be overridden):
```python
DEFAULT_CAMERA_DISTANCE = 3.0      # Distance from model
DEFAULT_CAMERA_AZIMUTH = 45        # Horizontal angle (degrees)
DEFAULT_CAMERA_ELEVATION = -20     # Vertical angle (degrees)
DEFAULT_CAMERA_LOOKAT = [0, 0, 1]  # Look-at point [x, y, z]
```

### Output Locations

- Model thumbnails: `data/thumbnails/models/{folder}/{model_id}.webp`
- Trajectory animations: `data/thumbnails/trajectories/{category}/{trajectory_id}.webp`

## Development

### Prerequisites

- Python 3.10+
- MuJoCo (for thumbnail generation)

### Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables:
Create a `.env` file:
```env
SECRET_KEY=your-secret-key-here
PASSWORD=your-password-here
ACCESS_TOKEN_EXPIRE_DAYS=7

DATA_DIR=../data
MODELS_DIR=../data/models
TRAJECTORIES_DIR=../data/trajectories
THUMBNAILS_DIR=../data/thumbnails

HOST=0.0.0.0
PORT=8000
```

5. Create data directories:
```bash
mkdir -p ../data/models ../data/trajectories ../data/thumbnails
```

6. Start development server:
```bash
python main.py
```

7. Open [http://localhost:8000/docs](http://localhost:8000/docs) for interactive API documentation

### Running Tests

```bash
pytest
```

## Security

### Authentication

- JWT tokens with 7-day expiration
- Tokens include user information and expiration timestamp
- All endpoints except `/api/auth/login` require authentication

### Password Security

- Password stored in environment variable (not in code)
- Use strong, randomly generated passwords
- Rotate passwords regularly

### CORS

- Configure `allow_origins` to match frontend URL
- Avoid using `"*"` in production

### File Access

- All file paths are validated to prevent directory traversal attacks
- File IDs are hashed to prevent enumeration
- Only authenticated users can access files

## Performance

### Caching

- Metadata is cached in memory after first load
- Thumbnails are served directly from disk (no caching)
- File downloads use streaming for large files

### Concurrent Requests

- FastAPI handles concurrent requests using async/await
- Uvicorn runs multiple worker processes for better performance

### Database

- No database required (filesystem-based storage)
- Metadata extracted on-demand and cached
- Suitable for small to medium datasets (< 10,000 files)

## Monitoring

### Logging

FastAPI provides automatic request logging:
```
INFO:     127.0.0.1:52345 - "GET /api/models HTTP/1.1" 200 OK
```

### Health Check

Simple health check endpoint:
```bash
curl http://localhost:8000/
```

Response:
```json
{
  "message": "Motion Library API"
}
```

## Troubleshooting

### Port Already in Use

If port 8000 is already in use:
1. Change `PORT` in `.env` file
2. Update frontend `NEXT_PUBLIC_API_URL` accordingly

### File Not Found Errors

If models/trajectories are not found:
1. Verify file paths in `.env` are correct
2. Check directory permissions
3. Ensure relative paths are correct (relative to data directory)

### Thumbnail Generation Fails

If thumbnails don't generate:
1. Install MuJoCo: `pip install mujoco`
2. Verify model XML is valid
3. Check trajectory data format (NPY/NPZ)
4. Ensure output directory exists and is writable

### CORS Errors

If frontend cannot access API:
1. Verify frontend URL in CORS configuration
2. Check both URLs use same protocol (http/https)
3. Ensure credentials are allowed in CORS config

## Deployment

See [deployment.md](deployment.md) for production deployment instructions.

## Future Enhancements

- **Database**: PostgreSQL for metadata storage (better scalability)
- **File uploads**: Add endpoints for uploading models and trajectories
- **Batch operations**: Bulk delete, bulk thumbnail generation
- **User management**: Multi-user support with roles and permissions
- **Search**: Full-text search for models and trajectories
- **Versioning**: Track file versions and changes
- **Backup**: Automated backup and restore functionality

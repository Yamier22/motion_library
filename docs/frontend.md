# Frontend Documentation

## Overview

The Motion Library frontend is a Next.js 14 application built with React, TypeScript, and Tailwind CSS. It provides a web interface for browsing models and trajectories, and visualizing them in 3D using MuJoCo WASM.

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **3D Rendering**: MuJoCo WASM
- **State Management**: React Context API
- **HTTP Client**: Axios
- **Build Tool**: Next.js built-in (Turbopack/Webpack)

## Project Structure

```
frontend/
├── app/                      # Next.js App Router pages
│   ├── page.tsx             # Login page (/)
│   ├── dashboard/           # Dashboard page (/dashboard)
│   │   └── page.tsx
│   ├── visualize/           # 3D viewer page (/visualize)
│   │   └── page.tsx
│   ├── layout.tsx           # Root layout
│   └── globals.css          # Global styles
├── components/              # React components
│   ├── MuJoCoViewer.tsx    # 3D visualization component
│   ├── ModelSelector.tsx    # Model selection UI
│   ├── TrajectorySelector.tsx  # Trajectory selection UI
│   └── ViewerOptions.tsx    # Viewer settings panel
├── contexts/                # React contexts
│   └── AuthContext.tsx      # Authentication context
├── lib/                     # Utility libraries
│   ├── api.ts              # API client
│   └── trajectory-parser.ts # NPY/NPZ parser
└── public/                  # Static assets
    └── mujoco_wasm.wasm    # MuJoCo WASM binary
```

## Key Features

### 1. Authentication

The application uses JWT-based authentication. All routes except the login page require authentication.

**AuthContext** ([contexts/AuthContext.tsx](../frontend/contexts/AuthContext.tsx)):
- Manages authentication state
- Stores JWT token in localStorage
- Provides `login()`, `logout()`, and `isAuthenticated` to child components
- Automatically verifies token on mount

### 2. Dashboard

The dashboard ([app/dashboard/page.tsx](../frontend/app/dashboard/page.tsx)) displays:
- List of uploaded models with metadata
- List of uploaded trajectories with metadata and category filtering
- Navigation to 3D viewer

**Features**:
- Category-based filtering for trajectories
- File size and upload date display
- Responsive table layout

### 3. 3D Visualization

The visualization page ([app/visualize/page.tsx](../frontend/app/visualize/page.tsx)) provides:
- Model selection with folder organization and thumbnails
- Trajectory selection with animated previews
- Real-time 3D rendering using MuJoCo WASM
- Playback controls with timeline scrubbing
- Keyboard shortcuts for playback control
- Viewer options (axes, camera controls)

**Playback Controls**:
- Play/Pause button
- Timeline slider for frame navigation
- Speed control (0.25x to 2x)
- Frame counter and time display
- Reset button

**Keyboard Shortcuts**:
- `Space` - Play/Pause
- `R` - Reset to frame 0
- `←` `→` - Step backward/forward 1 second
- `↑` `↓` - Step backward/forward 1 frame

### 4. Model Selector

The ModelSelector component ([components/ModelSelector.tsx](../frontend/components/ModelSelector.tsx)):
- Groups models by folder
- Displays model thumbnails (preloaded for performance)
- Collapsible folder interface
- Visual selection state
- Loads XML model data on selection

**Features**:
- Thumbnail preloading with blob URLs
- All folders collapsed by default
- Loading states during model fetch
- Error handling with retry option

### 5. Trajectory Selector

The TrajectorySelector component ([components/TrajectorySelector.tsx](../frontend/components/TrajectorySelector.tsx)):
- Groups trajectories by category
- Displays animated trajectory previews
- Collapsible category interface
- Visual selection state
- Loads NPY/NPZ data on selection

**Features**:
- Animated WebP thumbnails
- Category-based organization
- Loading states during trajectory fetch
- Error handling

### 6. MuJoCo Viewer

The MuJoCoViewer component ([components/MuJoCoViewer.tsx](../frontend/components/MuJoCoViewer.tsx)):
- Renders 3D models using MuJoCo WASM
- Supports trajectory playback
- Provides camera controls
- Handles model loading and asset resolution

**Features**:
- Dynamic asset loading (textures, meshes)
- Camera controls (mouse drag, scroll zoom)
- Trajectory frame interpolation
- Axes visualization (fixed and moving)
- Real-time rendering loop

## API Integration

The frontend communicates with the backend API using Axios ([lib/api.ts](../frontend/lib/api.ts)).

### API Client Configuration

```typescript
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### Request Interceptor

Automatically adds JWT token to all requests:

```typescript
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Response Interceptor

Handles 401 errors by clearing token and redirecting to login:

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);
```

### API Endpoints

**Authentication**:
- `POST /api/auth/login` - Login with password
- `POST /api/auth/verify` - Verify JWT token

**Models**:
- `GET /api/models` - List all models
- `GET /api/models/{id}` - Download model XML file
- `GET /api/models/{id}/thumbnail` - Get model thumbnail
- `GET /api/models/{id}/files` - List model assets
- `GET /api/models/{id}/files/{path}` - Download model asset

**Trajectories**:
- `GET /api/trajectories?category={category}` - List trajectories (optional category filter)
- `GET /api/trajectories/{id}` - Download trajectory NPY/NPZ file
- `GET /api/trajectories/{id}/thumbnail` - Get trajectory animation

## Data Formats

### NPY/NPZ Trajectory Parsing

The trajectory parser ([lib/trajectory-parser.ts](../frontend/lib/trajectory-parser.ts)) supports:
- **NPY files**: Single numpy array containing qpos data
- **NPZ files**: Archive with `qpos_traj` key containing qpos data

**Trajectory Data Structure**:
```typescript
export interface TrajectoryData {
  qpos: number[][];      // Array of joint positions [frame][joint]
  frameCount: number;    // Total number of frames
  frameRate: number;     // Frames per second (default: 60)
}
```

### Model Metadata

```typescript
export interface ModelMetadata {
  id: string;              // MD5 hash of relative path
  filename: string;        // Model filename
  model_name?: string;     // Model name (optional)
  relative_path: string;   // Path relative to models/ directory
  file_size: number;       // File size in bytes
  upload_date: string;     // ISO 8601 timestamp
  thumbnail_path?: string; // Path to thumbnail (optional)
}
```

### Trajectory Metadata

```typescript
export interface TrajectoryMetadata {
  id: string;              // MD5 hash of relative path
  filename: string;        // Trajectory filename
  category?: string;       // Category/folder (optional)
  file_size: number;       // File size in bytes
  upload_date: string;     // ISO 8601 timestamp
  frame_count?: number;    // Number of frames (optional)
  frame_rate?: number;     // Frame rate (optional)
  num_joints?: number;     // Number of joints (optional)
  thumbnail_path?: string; // Path to animation (optional)
}
```

## Development

### Prerequisites

- Node.js 18+ or Bun
- npm, yarn, pnpm, or bun

### Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Configure environment variables:
Create a `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

4. Start development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

5. Open [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
npm run start
```

The production build will be optimized and ready for deployment.

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API base URL (default: `http://localhost:8000`)

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

**WebAssembly** and **modern JavaScript** features are required for MuJoCo WASM.

## Performance Optimizations

1. **Thumbnail Preloading**: Model and trajectory thumbnails are preloaded and cached as blob URLs for instant display
2. **Lazy Loading**: Components and routes are code-split automatically by Next.js
3. **Request Animation Frame**: Smooth 60fps rendering using `requestAnimationFrame`
4. **Blob URLs**: Model XML and trajectory data are loaded as blobs to avoid JSON serialization overhead
5. **Axios Interceptors**: Centralized token management and error handling

## Troubleshooting

### WASM Loading Errors

If MuJoCo WASM fails to load:
1. Ensure `mujoco_wasm.wasm` is in the `public/` directory
2. Check browser console for CORS errors
3. Verify WebAssembly is enabled in browser

### Authentication Issues

If authentication fails:
1. Check backend API is running
2. Verify `NEXT_PUBLIC_API_URL` is correct
3. Clear localStorage and try logging in again
4. Check browser console for 401 errors

### Thumbnail Display Issues

If thumbnails don't appear:
1. Check backend thumbnail generation (see [backend documentation](backend.md))
2. Verify thumbnail API endpoints return 200 status
3. Check browser console for CORS or 404 errors
4. Ensure models/trajectories have `thumbnail_path` in metadata

## Future Enhancements

- **Trajectory upload**: Add UI for uploading new trajectories
- **Model upload**: Add UI for uploading new models
- **Export functionality**: Export rendered frames or videos
- **Comparison view**: Side-by-side trajectory comparison
- **Custom camera presets**: Save and load camera positions
- **Mobile support**: Responsive design for mobile devices

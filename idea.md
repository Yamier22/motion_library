# Robotics Motion Library Visualization Website

## Project Overview
A web-based platform for managing and visualizing robot motion trajectories from research data. The system allows researchers to browse, select, and visualize reference motion trajectories that robots will follow during movement.

## Background
We are conducting robotics research that generates numerous models and associated motion data. Robots follow reference motion trajectories, and we need a centralized platform to manage and visualize these trajectories efficiently.

## Technical Stack

### Frontend
- **Framework**: React with Next.js
- **Styling**: TailwindCSS
- **3D Visualization**: MuJoCo WASM (WebAssembly-based MuJoCo with JavaScript API)

### Backend
- **Framework**: FastAPI (Python)
- **Storage**: File system (no database)
- **Data Format**: NPY/NPZ files containing:
  - `qpos`: Joint positions for MuJoCo model
  - `frame_rate`: Frame rate for trajectory playback

### Authentication
- Password-protected access to prevent public access to proprietary research data and models

## Key Features

### Core Functionality
1. **Trajectory Management**
   - Browse available motion trajectories
   - Upload new NPY/NPZ trajectory files
   - Organize trajectories by categories/tags
   - Delete or archive old trajectories

2. **Visualization**
   - Real-time 3D visualization using MuJoCo WASM
   - Playback controls (play, pause, speed adjustment)
   - Frame-by-frame navigation
   - Multiple camera angles and views
   - Visualization is non-simulated (direct playback of recorded qpos data)

3. **File Management**
   - File system-based storage for lightweight deployment
   - Support for NPY and NPZ file formats
   - Automatic parsing of frame rate and joint position data
   - File metadata display (file size, upload date, frame count)

### Authentication & Security
- Simple password authentication system
- Protected API endpoints
- Secure file access controls

## Architecture

### Backend (FastAPI)
```
/api
  /auth - Authentication endpoints
  /trajectories - List, upload, delete trajectories
  /models - Manage MuJoCo models
  /files - Serve NPY/NPZ files and models
```

### Frontend (Next.js)
```
/pages
  / - Landing/login page
  /dashboard - Browse trajectories
  /visualize/[id] - 3D visualization view
```

### Data Storage Structure
```
/data
  /models - MuJoCo XML model files
  /trajectories
    /category_1
      trajectory_1.npz
      trajectory_2.npy
    /category_2
      ...
```

## Implementation Phases

### Phase 1: Backend Foundation
- Set up FastAPI project structure
- Implement authentication system
- Create file system storage handlers
- Develop API endpoints for trajectory listing and retrieval
- NPY/NPZ file parsing utilities

### Phase 2: Frontend Foundation
- Set up Next.js with TailwindCSS
- Implement login/authentication UI
- Create dashboard for browsing trajectories
- File upload interface

### Phase 3: MuJoCo Integration
- Integrate MuJoCo WASM into Next.js
- Load and render MuJoCo models
- Implement trajectory playback from NPY/NPZ data
- Add playback controls (play, pause, seek, speed)

### Phase 4: Enhanced Features
- Advanced filtering and search
- Trajectory comparison view
- Export/download capabilities
- Metadata editing

### Phase 5: Deployment
- Deploy backend on server
- Configure file system permissions
- Set up production authentication
- Performance optimization

## Technical Considerations

### MuJoCo WASM Integration
- Load WASM module in browser
- Parse NPY/NPZ files in JavaScript
- Map qpos data to MuJoCo model state
- Handle frame rate timing for smooth playback

### Performance
- Lazy loading for large trajectory files
- Efficient NPY/NPZ parsing
- Client-side caching
- Optimized WASM rendering

### Data Format
- **NPY/NPZ Files** contain:
  - `qpos`: Array of joint positions over time (shape: [n_frames, n_joints])
  - `frame_rate`: Integer or float for playback speed (fps)

### Security
- Secure password hashing
- JWT tokens for session management
- Rate limiting on API endpoints
- File path sanitization to prevent directory traversal

## Future Enhancements
- Multi-user support with different access levels
- Trajectory annotation and notes
- Comparison tools for multiple trajectories
- Download/export in different formats
- Integration with simulation tools
- Mobile responsive design

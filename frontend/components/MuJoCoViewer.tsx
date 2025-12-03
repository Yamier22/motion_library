'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  loadMuJoCo,
  loadModelFromXML,
  loadModelWithDependencies,
  cleanupModel,
  getDefaultSceneXML,
  MuJoCoModule,
} from '@/lib/mujoco-loader';
import { modelApi, ModelMetadata } from '@/lib/api';
import { getPosition, getQuaternion, loadMuJoCoScene, drawTendonsAndFlex } from '@/lib/mujoco-utils';

export interface ViewerOptions {
  showFixedAxes: boolean;
  showMovingAxes: boolean;
}

export interface TrajectoryPlaybackState {
  qpos: Float64Array[];  // Array of qpos arrays, one per frame
  currentFrame: number;
  isPlaying: boolean;
  playbackSpeed: number;
  frameRate: number;
}

interface MuJoCoViewerProps {
  modelXML?: string;
  modelId?: string;
  modelMetadata?: ModelMetadata;
  options?: ViewerOptions;
  trajectory?: TrajectoryPlaybackState;
  onModelLoaded?: () => void;
  onError?: (error: string) => void;
}

export default function MuJoCoViewer({ modelXML, modelId, modelMetadata, options, trajectory, onModelLoaded, onError }: MuJoCoViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mujocoRef = useRef<MuJoCoModule | null>(null);
  const modelRef = useRef<any>(null);
  const dataRef = useRef<any>(null);
  const bodiesRef = useRef<{ [key: number]: THREE.Group }>({});
  const meshesRef = useRef<{ [key: number]: THREE.BufferGeometry }>({});
  const mujocoRootRef = useRef<THREE.Group | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  // Track trajectory prop in a ref so animation loop can access latest value
  const trajectoryRef = useRef<TrajectoryPlaybackState | undefined>(trajectory);

  // Axis helper scene and camera for corner inset
  const axisSceneRef = useRef<THREE.Scene | null>(null);
  const axisCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update trajectory ref whenever prop changes
  useEffect(() => {
    trajectoryRef.current = trajectory;
    if (trajectory) {
      console.log('[MUJOCO VIEWER] Trajectory prop updated in ref:', {
        hasQpos: !!trajectory.qpos,
        qposLength: trajectory.qpos?.length,
        currentFrame: trajectory.currentFrame,
        isPlaying: trajectory.isPlaying
      });
    } else {
      console.log('[MUJOCO VIEWER] Trajectory prop cleared (undefined)');
    }
  }, [trajectory]);

  // Debug helper - expose scene to window for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugMuJoCo = {
        scene: sceneRef.current,
        camera: cameraRef.current,
        renderer: rendererRef.current,
        model: modelRef.current,
        data: dataRef.current,
        bodies: bodiesRef.current,
        logSceneGraph: () => {
          if (!sceneRef.current) {
            console.log('Scene not initialized');
            return;
          }
          console.log('=== Three.js Scene Graph ===');
          sceneRef.current.traverse((object) => {
            const indent = '  '.repeat(getObjectDepth(object, sceneRef.current!));
            console.log(`${indent}${object.type}: ${object.name || '(unnamed)'}`);
            if (object instanceof THREE.Mesh) {
              console.log(`${indent}  ├─ Geometry: ${object.geometry.type}`);
              console.log(`${indent}  └─ Material: ${(object.material as any).type}`);
            }
          });
          console.log('=== Total Objects ===');
          let meshCount = 0;
          sceneRef.current.traverse((obj) => {
            if (obj instanceof THREE.Mesh) meshCount++;
          });
          console.log(`Meshes: ${meshCount}`);
          console.log(`Total children: ${sceneRef.current.children.length}`);
        },
        getMuJoCoRoot: () => {
          return sceneRef.current?.getObjectByName('MuJoCo Root');
        },
      };
      console.log('Debug tools available: window.debugMuJoCo');
      console.log('  - debugMuJoCo.logSceneGraph() - Print scene structure');
      console.log('  - debugMuJoCo.scene - Access Three.js scene');
      console.log('  - debugMuJoCo.camera - Access camera');
      console.log('  - debugMuJoCo.model - Access MuJoCo model');
      console.log('  - debugMuJoCo.getMuJoCoRoot() - Get MuJoCo root object');
    }
  }, [sceneRef.current, cameraRef.current, rendererRef.current]);

  // Helper to calculate object depth in scene graph
  const getObjectDepth = (object: THREE.Object3D, root: THREE.Object3D): number => {
    let depth = 0;
    let current = object;
    while (current.parent && current !== root) {
      depth++;
      current = current.parent;
    }
    return depth;
  };

  // Initialize Three.js scene and MuJoCo WASM
  useEffect(() => {
    if (!containerRef.current) return;

    // If already initialized, don't re-initialize (handles React Strict Mode double mount)
    if (isInitializedRef.current) {
      // But ensure the existing canvas is still in the DOM
      if (rendererRef.current && !containerRef.current.contains(rendererRef.current.domElement)) {
        containerRef.current.appendChild(rendererRef.current.domElement);
      }
      return;
    }

    const initViewer = async () => {
      try {
        isInitializedRef.current = true;
        setLoading(true);
        setError(null);

        // Load MuJoCo WASM
        const mujoco = await loadMuJoCo();
        mujocoRef.current = mujoco;

        // Set up Three.js scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x243447);
        scene.fog = new THREE.Fog(0x243447, 15, 25);
        sceneRef.current = scene;

        // Get container dimensions
        const width = containerRef.current!.clientWidth || window.innerWidth;
        const height = containerRef.current!.clientHeight || window.innerHeight;

        // Set up camera (MuJoCo uses Z-up, so configure camera accordingly)
        const camera = new THREE.PerspectiveCamera(
          45,
          width / height,
          0.001,
          100
        );
        camera.position.set(2.0, 1.7, 1.7);
        camera.up.set(0, 0, 1); // Set Z as up vector to match MuJoCo
        scene.add(camera);
        cameraRef.current = camera;

        // Very bright sunlight-like illumination using ambient + hemisphere
        // No directional light - will use lights from MuJoCo XML environment if needed

        // Very bright ambient light for overall scene illumination
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        scene.add(ambientLight);

        // Strong hemisphere light for natural sky/ground lighting
        const hemisphereLight = new THREE.HemisphereLight(
          0xffffff, // Sky color (bright white)
          0x888888, // Ground color (brighter gray for more fill)
          1.5
        );
        scene.add(hemisphereLight);

        // Set up renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);

        // Use linear color space to match MuJoCo colors exactly
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        containerRef.current!.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Set up orbit controls (adjust target for Z-up)
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0.7); // Z is up, so use Z for height
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.screenSpacePanning = true;
        controls.update();
        controlsRef.current = controls;

        // Add fixed world frame axes at origin (will be toggled via options)
        const worldAxes = new THREE.AxesHelper(0.5);
        worldAxes.name = 'World Frame';
        worldAxes.visible = options?.showFixedAxes ?? true;
        scene.add(worldAxes);

        // Set up axis helper scene for corner display
        const axisScene = new THREE.Scene();
        axisSceneRef.current = axisScene;

        // Create axis camera (fixed position looking at origin)
        const axisCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
        axisCamera.position.set(0, 0, 2);
        axisCamera.lookAt(0, 0, 0);
        axisCameraRef.current = axisCamera;

        // Create a group to hold the axes (this will rotate with the main camera)
        const axesGroup = new THREE.Group();
        axesGroup.name = 'AxesGroup';
        axisScene.add(axesGroup);

        // Create axes helper (X=red, Y=green, Z=blue)
        const axesHelper = new THREE.AxesHelper(1);
        axesGroup.add(axesHelper);

        // Add labels for axes
        const createAxisLabel = (text: string, position: THREE.Vector3, color: number) => {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.width = 64;
          canvas.height = 64;
          context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
          context.font = 'Bold 48px Arial';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(text, 32, 32);

          const texture = new THREE.CanvasTexture(canvas);
          const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.position.copy(position);
          sprite.scale.set(0.3, 0.3, 1);
          return sprite;
        };

        axesGroup.add(createAxisLabel('X', new THREE.Vector3(1.3, 0, 0), 0xff0000));
        axesGroup.add(createAxisLabel('Y', new THREE.Vector3(0, 1.3, 0), 0x00ff00));
        axesGroup.add(createAxisLabel('Z', new THREE.Vector3(0, 0, 1.3), 0x0000ff));

        // Load default model from backend
        try {
          // Get the list of models to find the default model
          const modelsData = await modelApi.list();

          // Find the default model (it should be in default/default.xml)
          const defaultModel = modelsData.models.find(
            (m) => m.relative_path === 'default/default.xml'
          );

          if (defaultModel) {
            // Fetch the actual model XML
            const modelBlob = await modelApi.get(defaultModel.id);
            const defaultXML = await modelBlob.text();

            // Use new loading system that handles dependencies
            const { model, data } = await loadModelWithDependencies(
              mujoco,
              defaultModel.id,
              defaultXML,
              defaultModel.relative_path
            );
            modelRef.current = model;
            dataRef.current = data;
            createSceneObjects(scene, mujoco, model, data);

            console.log('Default model loaded successfully');
            console.log('Use debugMuJoCo.logSceneGraph() to inspect scene');

            // Start render loop
            startRenderLoop();
            setLoading(false);
            return;
          }

          throw new Error('Default model not found');
        } catch (err) {
          console.warn('Failed to load default model from backend, using fallback:', err);
          // Fallback to hardcoded default if fetch fails
          const defaultXML = getDefaultSceneXML();
          const { model, data } = loadModelFromXML(mujoco, defaultXML);
          modelRef.current = model;
          dataRef.current = data;
          createSceneObjects(scene, mujoco, model, data);
        }

        // Start render loop
        startRenderLoop();

        setLoading(false);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to initialize viewer';
        setError(errorMsg);
        onError?.(errorMsg);
        setLoading(false);
      }
    };

    initViewer();

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (rendererRef.current) {
        if (containerRef.current && rendererRef.current.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
      }
      if (modelRef.current && dataRef.current) {
        cleanupModel(modelRef.current, dataRef.current);
      }
      // Don't reset isInitializedRef - keep it true to prevent re-initialization on Strict Mode remount
    };
  }, []);

  // Handle viewer options changes
  useEffect(() => {
    if (!sceneRef.current) return;

    // Toggle fixed world axes
    const worldAxes = sceneRef.current.getObjectByName('World Frame');
    if (worldAxes) {
      worldAxes.visible = options?.showFixedAxes ?? true;
    }
  }, [options?.showFixedAxes, options?.showMovingAxes]);

  // Handle model loading when modelXML changes
  useEffect(() => {
    if (!modelXML || !mujocoRef.current || !sceneRef.current) return;

    const loadNewModel = async () => {
      try {
        setLoading(true);
        setError(null);

        // Clean up old model
        if (modelRef.current && dataRef.current) {
          cleanupModel(modelRef.current, dataRef.current);
        }

        // Clear scene objects
        console.log('Clearing previous scene objects...');
        clearSceneObjects();

        // Load new model with dependencies if we have model metadata
        let model, data;
        if (modelId && modelMetadata) {
          console.log('Loading model with dependencies:', modelMetadata.relative_path);
          ({ model, data } = await loadModelWithDependencies(
            mujocoRef.current!,
            modelId,
            modelXML,
            modelMetadata.relative_path
          ));
        } else {
          // Fallback to simple loading for backward compatibility
          console.log('Loading model without dependencies (simple mode)');
          ({ model, data } = loadModelFromXML(mujocoRef.current!, modelXML));
        }

        modelRef.current = model;
        dataRef.current = data;

        // Create scene objects for new model
        createSceneObjects(sceneRef.current!, mujocoRef.current!, model, data);

        console.log('New model loaded successfully');
        console.log('Use debugMuJoCo.logSceneGraph() to inspect scene');

        setLoading(false);
        onModelLoaded?.();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load model';
        setError(errorMsg);
        onError?.(errorMsg);
        setLoading(false);
      }
    };

    loadNewModel();
  }, [modelXML, modelId, modelMetadata]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const createSceneObjects = (scene: THREE.Scene, mujoco: any, model: any, data: any) => {
    // Use the utility function from mujoco-utils.ts
    // swizzle=true for Z-up coordinate system (MuJoCo convention)
    const { mujocoRoot, bodies, meshes } = loadMuJoCoScene(mujoco, model, data, scene, false);

    mujocoRootRef.current = mujocoRoot;
    bodiesRef.current = bodies;
    meshesRef.current = meshes;

    // Forward simulation once to get initial state
    mujoco.mj_forward(model, data);
  };

  const clearSceneObjects = () => {
    if (!sceneRef.current) return;

    const mujocoRoot = sceneRef.current.getObjectByName('MuJoCo Root');
    if (mujocoRoot) {
      let meshCount = 0;
      // Recursively dispose of all geometries and materials
      mujocoRoot.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          meshCount++;
          if (object.geometry) {
            object.geometry.dispose();
          }
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material) => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });

      console.log(`Cleared ${meshCount} meshes from scene`);
      sceneRef.current.remove(mujocoRoot);
    } else {
      console.log('No MuJoCo Root found to clear');
    }

    bodiesRef.current = {};
  };

  const startRenderLoop = () => {
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      // Use trajectoryRef.current to get the latest trajectory value
      const currentTrajectory = trajectoryRef.current;

      // Debug: Log trajectory prop on every frame (will be very verbose)
      if (currentTrajectory) {
        console.log('[DEBUG] Trajectory prop received:', {
          hasQpos: !!currentTrajectory.qpos,
          qposLength: currentTrajectory.qpos?.length,
          currentFrame: currentTrajectory.currentFrame,
          isPlaying: currentTrajectory.isPlaying
        });
      } else {
        console.log('[DEBUG] No trajectory prop');
      }

      // Handle trajectory playback if trajectory data is provided
      if (currentTrajectory && currentTrajectory.qpos.length > 0) {
        if (!dataRef.current || !modelRef.current || !mujocoRef.current) {
          // Model not loaded yet
          if (currentTrajectory.currentFrame === 0) {
            console.warn('Trajectory data provided but model not loaded yet');
          }
        } else {
          const currentFrame = Math.min(currentTrajectory.currentFrame, currentTrajectory.qpos.length - 1);
          const qposData = currentTrajectory.qpos[currentFrame];

          // Set qpos data for current frame
          if (qposData && qposData.length === modelRef.current.nq) {
            console.log(`[TRAJECTORY] Applying frame ${currentFrame}`);

            // Store original qpos for comparison
            const originalQpos0 = dataRef.current.qpos[0];
            const originalXpos = [dataRef.current.xpos[3], dataRef.current.xpos[4], dataRef.current.xpos[5]];

            // Copy qpos data to MuJoCo's qpos array
            for (let i = 0; i < qposData.length; i++) {
              dataRef.current.qpos[i] = qposData[i];
            }

            console.log(`[MUJOCO] Before mj_forward: qpos[0] changed from ${originalQpos0.toFixed(3)} to ${dataRef.current.qpos[0].toFixed(3)}`);

            // Compute forward kinematics to update xpos and xquat from qpos
            mujocoRef.current.mj_forward(modelRef.current, dataRef.current);

            const newXpos = [dataRef.current.xpos[3], dataRef.current.xpos[4], dataRef.current.xpos[5]];
            console.log(`[MUJOCO] After mj_forward: xpos changed from [${originalXpos.map(v => v.toFixed(3)).join(', ')}] to [${newXpos.map(v => v.toFixed(3)).join(', ')}]`);

            // Log every 30 frames
            if (currentFrame % 30 === 0 && currentFrame > 0) {
              console.log(`[SUMMARY] Frame ${currentFrame}: qpos[0-2] = [${dataRef.current.qpos[0].toFixed(3)}, ${dataRef.current.qpos[1].toFixed(3)}, ${dataRef.current.qpos[2].toFixed(3)}], body[1] xpos = [${newXpos.map(v => v.toFixed(3)).join(', ')}]`);
            }
          } else if (qposData) {
            console.warn(`Qpos dimension mismatch: trajectory has ${qposData.length} but model expects ${modelRef.current.nq}`);
          }
        }
      }

      // Update body transforms from MuJoCo data
      if (dataRef.current && modelRef.current) {
        // Log when updating Three.js transforms (only when trajectory is active)
        if (currentTrajectory && currentTrajectory.qpos.length > 0) {
          if (bodiesRef.current[1]) {
            const beforePos = bodiesRef.current[1].position.clone();
            console.log(`[THREE.JS] Before update: body[1] position = [${beforePos.x.toFixed(3)}, ${beforePos.y.toFixed(3)}, ${beforePos.z.toFixed(3)}]`);
          }
        }

        // swizzle=false for Y-up coordinate system (MuJoCo native)
        for (let b = 0; b < modelRef.current.nbody; b++) {
          if (bodiesRef.current[b]) {
            // Store old position for comparison
            const oldPos = bodiesRef.current[b].position.clone();

            getPosition(dataRef.current.xpos, b, bodiesRef.current[b].position, false);
            getQuaternion(dataRef.current.xquat, b, bodiesRef.current[b].quaternion, false);
            bodiesRef.current[b].updateWorldMatrix(false, false);

            // Log body 1 position changes when trajectory is active
            if (b === 1 && currentTrajectory && currentTrajectory.qpos.length > 0) {
              const newPos = bodiesRef.current[b].position;
              console.log(`[THREE.JS] Body[1] position updated: [${oldPos.x.toFixed(3)}, ${oldPos.y.toFixed(3)}, ${oldPos.z.toFixed(3)}] -> [${newPos.x.toFixed(3)}, ${newPos.y.toFixed(3)}, ${newPos.z.toFixed(3)}]`);
            }
          }
        }

        // Log Three.js body position to verify it's updating (only when trajectory is active)
        if (currentTrajectory && currentTrajectory.qpos.length > 0 && currentTrajectory.currentFrame % 30 === 0 && currentTrajectory.currentFrame > 0) {
          if (bodiesRef.current[1]) {
            const pos = bodiesRef.current[1].position;
            console.log(`[SUMMARY] Frame ${currentTrajectory.currentFrame}: Three.js body[1] pos = [${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)}]`);
          }
        }

        // Update tendons and flex vertices using utility function
        // swizzle=false for Y-up coordinate system (MuJoCo native)
        if (mujocoRootRef.current) {
          drawTendonsAndFlex(mujocoRootRef.current, modelRef.current, dataRef.current, false);
        }
      }

      if (sceneRef.current && cameraRef.current && rendererRef.current) {
        const renderer = rendererRef.current;

        // Disable autoClear to manually control clearing
        renderer.autoClear = false;

        // Clear everything first
        renderer.clear();

        // Log rendering when trajectory is active
        if (currentTrajectory && currentTrajectory.qpos.length > 0 && currentTrajectory.currentFrame % 30 === 0 && currentTrajectory.currentFrame > 0) {
          console.log(`[RENDER] Rendering frame ${currentTrajectory.currentFrame}`);
        }

        // Render main scene with full viewport
        renderer.setViewport(0, 0, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
        renderer.render(sceneRef.current, cameraRef.current);

        if (currentTrajectory && currentTrajectory.qpos.length > 0 && currentTrajectory.currentFrame % 30 === 0 && currentTrajectory.currentFrame > 0) {
          console.log(`[RENDER] Frame ${currentTrajectory.currentFrame} rendered`);
        }

        // Render axis helper in top-right corner (if enabled)
        const showMoving = options?.showMovingAxes ?? true;
        if (showMoving && axisSceneRef.current && axisCameraRef.current) {
          const size = 128; // Size of the inset viewport in pixels
          const margin = 10;

          // Update axes group to match main camera rotation
          const axesGroup = axisSceneRef.current.getObjectByName('AxesGroup');
          if (axesGroup) {
            axesGroup.quaternion.copy(cameraRef.current.quaternion).invert();
          }

          // Set viewport for inset (top-right corner)
          const canvasWidth = renderer.domElement.clientWidth;
          const canvasHeight = renderer.domElement.clientHeight;

          renderer.clearDepth(); // Clear depth buffer for overlay
          renderer.setScissorTest(true);
          renderer.setScissor(
            canvasWidth - size - margin,
            canvasHeight - size - margin,
            size,
            size
          );
          renderer.setViewport(
            canvasWidth - size - margin,
            canvasHeight - size - margin,
            size,
            size
          );

          renderer.render(axisSceneRef.current, axisCameraRef.current);

          // Reset scissor test
          renderer.setScissorTest(false);
        }
      }
    };

    animate();
  };

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-10">
          <div className="text-white text-lg">Loading MuJoCo...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-10">
          <div className="text-red-400 text-lg">{error}</div>
        </div>
      )}
    </div>
  );
}

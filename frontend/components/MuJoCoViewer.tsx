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

interface MuJoCoViewerProps {
  modelXML?: string;
  modelId?: string;
  modelMetadata?: ModelMetadata;
  options?: ViewerOptions;
  onModelLoaded?: () => void;
  onError?: (error: string) => void;
}

export default function MuJoCoViewer({ modelXML, modelId, modelMetadata, options, onModelLoaded, onError }: MuJoCoViewerProps) {
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

  // Axis helper scene and camera for corner inset
  const axisSceneRef = useRef<THREE.Scene | null>(null);
  const axisCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Set up lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 3, 3);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        // Set up renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);

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

      // Update body transforms from MuJoCo data
      if (dataRef.current && modelRef.current) {
        // swizzle=true for Z-up coordinate system
        for (let b = 0; b < modelRef.current.nbody; b++) {
          if (bodiesRef.current[b]) {
            getPosition(dataRef.current.xpos, b, bodiesRef.current[b].position, false);
            getQuaternion(dataRef.current.xquat, b, bodiesRef.current[b].quaternion, false);
            bodiesRef.current[b].updateWorldMatrix(false, false);
          }
        }

        // Update tendons and flex vertices using utility function
        // swizzle=true for Z-up coordinate system
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

        // Render main scene with full viewport
        renderer.setViewport(0, 0, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
        renderer.render(sceneRef.current, cameraRef.current);

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

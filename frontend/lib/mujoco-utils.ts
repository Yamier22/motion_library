// MuJoCo utility functions for coordinate conversion and scene management
// Adapted from mujoco_wasm/src/mujocoUtils.js

import * as THREE from 'three';

/**
 * Access the vector at index, swizzle for Three.js, and apply to the target THREE.Vector3
 * Converts from MuJoCo's Z-up coordinate system to Three.js's Y-up coordinate system
 *
 * MuJoCo coordinates: X (right), Y (forward), Z (up)
 * Three.js coordinates: X (right), Y (up), Z (backward)
 *
 * Conversion: (x, y, z)_mujoco → (x, z, -y)_threejs
 *
 * @param buffer - Float32Array or Float64Array containing position data
 * @param index - Index of the vector to access (not byte offset)
 * @param target - THREE.Vector3 to store the result
 * @param swizzle - Whether to apply coordinate swizzling (default: true)
 * @returns The target vector for chaining
 */
export function getPosition(
  buffer: Float32Array | Float64Array,
  index: number,
  target: THREE.Vector3,
  swizzle: boolean = false
): THREE.Vector3 {
  if (swizzle) {
    return target.set(
      buffer[(index * 3) + 0],   // X stays X
      buffer[(index * 3) + 2],   // Z → Y
      -buffer[(index * 3) + 1]   // -Y → Z
    );
  } else {
    return target.set(
      buffer[(index * 3) + 0],
      buffer[(index * 3) + 1],
      buffer[(index * 3) + 2]
    );
  }
}

/**
 * Access the quaternion at index, swizzle for Three.js, and apply to the target THREE.Quaternion
 * Converts from MuJoCo's Z-up coordinate system to Three.js's Y-up coordinate system
 *
 * MuJoCo quaternion format: [w, x, y, z]
 * Three.js quaternion format: [x, y, z, w]
 *
 * @param buffer - Float32Array or Float64Array containing quaternion data
 * @param index - Index of the quaternion to access (not byte offset)
 * @param target - THREE.Quaternion to store the result
 * @param swizzle - Whether to apply coordinate swizzling (default: true)
 * @returns The target quaternion for chaining
 */
export function getQuaternion(
  buffer: Float32Array | Float64Array,
  index: number,
  target: THREE.Quaternion,
  swizzle: boolean = false
): THREE.Quaternion {
  if (swizzle) {
    return target.set(
      -buffer[(index * 4) + 1],  // -x
      -buffer[(index * 4) + 3],  // -z → y
      buffer[(index * 4) + 2],   // y → z
      -buffer[(index * 4) + 0]   // -w
    );
  } else {
    return target.set(
      buffer[(index * 4) + 1],   // x (skip w at index 0)
      buffer[(index * 4) + 2],   // y
      buffer[(index * 4) + 3],   // z
      buffer[(index * 4) + 0]    // w
    );
  }
}

/**
 * Converts a Three.js Vector3's coordinates to MuJoCo's coordinate system
 * This is the inverse of getPosition()
 *
 * Three.js coordinates: (x, y, z)
 * MuJoCo coordinates: (x, -z, y)
 *
 * @param target - THREE.Vector3 to convert (modified in place)
 * @returns The same Vector3 for chaining
 */
export function toMujocoPos(target: THREE.Vector3): THREE.Vector3 {
  return target.set(target.x, -target.z, target.y);
}

/**
 * Standard normal random number generator using Box-Muller transform
 * Used for adding noise to simulations
 */
export function standardNormal(): number {
  return Math.sqrt(-2.0 * Math.log(Math.random())) *
    Math.cos(2.0 * Math.PI * Math.random());
}

/**
 * Loads a scene for MuJoCo and creates Three.js objects
 * Adapted from mujoco_wasm/src/mujocoUtils.js loadSceneFromURL
 *
 * @param mujoco - MuJoCo WASM module instance
 * @param model - MuJoCo model
 * @param data - MuJoCo data
 * @param scene - Three.js scene to add objects to
 * @param swizzle - Whether to apply coordinate swizzling (default: true for Z-up)
 * @returns Object containing bodies, meshes, and the MuJoCo root group
 */
export function loadMuJoCoScene(
  mujoco: any,
  model: any,
  data: any,  // eslint-disable-line @typescript-eslint/no-unused-vars
  scene: THREE.Scene,
  swizzle: boolean = false
): { mujocoRoot: THREE.Group; bodies: { [key: number]: THREE.Group }; meshes: { [key: number]: THREE.BufferGeometry } } {
  const Reflector = require('./Reflector').Reflector;

  // Create the root object
  const mujocoRoot = new THREE.Group();
  mujocoRoot.name = 'MuJoCo Root';
  scene.add(mujocoRoot);

  const bodies: { [key: number]: THREE.Group } = {};
  const meshes: { [key: number]: THREE.BufferGeometry } = {};

  // Decode the null-terminated string names
  const textDecoder = new TextDecoder('utf-8');
  const names_array = new Uint8Array(model.names);
  const fullString = textDecoder.decode(model.names);
  const nullChar = textDecoder.decode(new ArrayBuffer(1));
  const names = fullString.split(nullChar);

  // Loop through the MuJoCo geoms and recreate them in Three.js
  for (let g = 0; g < model.ngeom; g++) {
    // Only visualize geom groups up to 2 (same default behavior as simulate)
    if (!(model.geom_group[g] < 3)) continue;

    // Get the body ID and type of the geom
    const b = model.geom_bodyid[g];
    const type = model.geom_type[g];
    const size = [
      model.geom_size[(g * 3) + 0],
      model.geom_size[(g * 3) + 1],
      model.geom_size[(g * 3) + 2]
    ];

    // Create the body if it doesn't exist
    if (!(b in bodies)) {
      bodies[b] = new THREE.Group();

      const start_idx = model.name_bodyadr[b];
      let end_idx = start_idx;
      while (end_idx < names_array.length && names_array[end_idx] !== 0) {
        end_idx++;
      }
      const name_buffer = names_array.subarray(start_idx, end_idx);
      bodies[b].name = textDecoder.decode(name_buffer);

      (bodies[b] as any).bodyID = b;
      (bodies[b] as any).has_custom_mesh = false;
    }

    // Set the default geometry. In MuJoCo, this is a sphere.
    let geometry: THREE.BufferGeometry = new THREE.SphereGeometry(size[0] * 0.5);

    if (type === mujoco.mjtGeom.mjGEOM_PLANE.value) {
      // Special handling for plane (handled below with Reflector)
      geometry = new THREE.PlaneGeometry(100, 100);
    } else if (type === mujoco.mjtGeom.mjGEOM_HFIELD.value) {
      // TODO: Implement heightfield
      geometry = new THREE.PlaneGeometry(1, 1);
    } else if (type === mujoco.mjtGeom.mjGEOM_SPHERE.value) {
      geometry = new THREE.SphereGeometry(size[0]);
    } else if (type === mujoco.mjtGeom.mjGEOM_CAPSULE.value) {
      geometry = new THREE.CapsuleGeometry(size[0], size[1] * 2.0, 20, 20);
      if(!swizzle) {
        geometry.rotateX(Math.PI / 2);
      }
    } else if (type === mujoco.mjtGeom.mjGEOM_ELLIPSOID.value) {
      geometry = new THREE.SphereGeometry(1); // Stretch this below
    } else if (type === mujoco.mjtGeom.mjGEOM_CYLINDER.value) {
      geometry = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2.0);
      if(!swizzle) {
        geometry.rotateX(Math.PI / 2);
      }
    } else if (type === mujoco.mjtGeom.mjGEOM_BOX.value) {
      if(swizzle) {
      geometry = new THREE.BoxGeometry(size[0] * 2.0, size[2] * 2.0, size[1] * 2.0);
      }
      else {
        geometry = new THREE.BoxGeometry(size[0] * 2.0, size[1] * 2.0, size[2] * 2.0);
      }
    } else if (type === mujoco.mjtGeom.mjGEOM_MESH.value) {
      const meshID = model.geom_dataid[g];

      if (!(meshID in meshes)) {
        geometry = new THREE.BufferGeometry();

        const vertex_buffer = model.mesh_vert.subarray(
          model.mesh_vertadr[meshID] * 3,
          (model.mesh_vertadr[meshID] + model.mesh_vertnum[meshID]) * 3
        );

        // Apply coordinate swizzling to vertices if swizzle is enabled
        if (swizzle) {
          for (let v = 0; v < vertex_buffer.length; v += 3) {
            const temp = vertex_buffer[v + 1];
            vertex_buffer[v + 1] = vertex_buffer[v + 2];
            vertex_buffer[v + 2] = -temp;
          }
        }

        const normal_buffer = model.mesh_normal.subarray(
          model.mesh_normaladr[meshID] * 3,
          (model.mesh_normaladr[meshID] + model.mesh_normalnum[meshID]) * 3
        );

        // Apply coordinate swizzling to normals if swizzle is enabled
        if (swizzle) {
          for (let v = 0; v < normal_buffer.length; v += 3) {
            const temp = normal_buffer[v + 1];
            normal_buffer[v + 1] = normal_buffer[v + 2];
            normal_buffer[v + 2] = -temp;
          }
        }

        const uv_buffer = model.mesh_texcoord.subarray(
          model.mesh_texcoordadr[meshID] * 2,
          (model.mesh_texcoordadr[meshID] + model.mesh_texcoordnum[meshID]) * 2
        );

        const face_to_vertex_buffer = model.mesh_face.subarray(
          model.mesh_faceadr[meshID] * 3,
          (model.mesh_faceadr[meshID] + model.mesh_facenum[meshID]) * 3
        );

        geometry.setAttribute('position', new THREE.BufferAttribute(vertex_buffer, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normal_buffer, 3));

        if (uv_buffer.length > 0) {
          geometry.setAttribute('uv', new THREE.BufferAttribute(uv_buffer, 2));
        }

        geometry.setIndex(Array.from(face_to_vertex_buffer));
        geometry.computeVertexNormals(); // Recompute normals for better rendering

        meshes[meshID] = geometry;
      } else {
        geometry = meshes[meshID];
      }

      (bodies[b] as any).has_custom_mesh = true;
    }
    // Done with geometry creation

    // Set the Material Properties
    let texture: THREE.Texture | undefined = undefined;
    let color = [
      model.geom_rgba[(g * 4) + 0],
      model.geom_rgba[(g * 4) + 1],
      model.geom_rgba[(g * 4) + 2],
      model.geom_rgba[(g * 4) + 3]
    ];

    if (model.geom_matid[g] !== -1) {
      const matId = model.geom_matid[g];
      color = [
        model.mat_rgba[(matId * 4) + 0],
        model.mat_rgba[(matId * 4) + 1],
        model.mat_rgba[(matId * 4) + 2],
        model.mat_rgba[(matId * 4) + 3]
      ];

      // Construct Texture from model.tex_data
      const mjNTEXROLE = 10; // Total number of texture roles
      const mjTEXROLE_RGB = 1; // RGB texture role
      const texId = model.mat_texid[(matId * mjNTEXROLE) + mjTEXROLE_RGB];

      if (texId !== -1) {
        const width = model.tex_width[texId];
        const height = model.tex_height[texId];
        const offset = model.tex_adr[texId];
        const channels = model.tex_nchannel[texId];
        const texData = model.tex_data;
        const rgbaArray = new Uint8Array(width * height * 4);

        for (let p = 0; p < width * height; p++) {
          rgbaArray[(p * 4) + 0] = texData[offset + ((p * channels) + 0)];
          rgbaArray[(p * 4) + 1] = channels > 1 ? texData[offset + ((p * channels) + 1)] : rgbaArray[(p * 4) + 0];
          rgbaArray[(p * 4) + 2] = channels > 2 ? texData[offset + ((p * channels) + 2)] : rgbaArray[(p * 4) + 0];
          rgbaArray[(p * 4) + 3] = channels > 3 ? texData[offset + ((p * channels) + 3)] : 255;
        }

        texture = new THREE.DataTexture(rgbaArray, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.repeat = new THREE.Vector2(
          model.mat_texrepeat[(matId * 2) + 0],
          model.mat_texrepeat[(matId * 2) + 1]
        );
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
      }
    }

    // Create a new material for each geom
    const currentMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      transparent: color[3] < 1.0,
      opacity: color[3],
      specularIntensity: model.geom_matid[g] !== -1 ? model.mat_specular[model.geom_matid[g]] : undefined,
      reflectivity: model.geom_matid[g] !== -1 ? model.mat_reflectance[model.geom_matid[g]] : undefined,
      roughness: model.geom_matid[g] !== -1 ? 1.0 - model.mat_shininess[model.geom_matid[g]] : undefined,
      metalness: model.geom_matid[g] !== -1 ? 0.1 : undefined,
      map: texture
    });

    let mesh: THREE.Mesh | any;
    if (type === mujoco.mjtGeom.mjGEOM_PLANE.value) {
      // Use Reflector for plane
      mesh = new Reflector(new THREE.PlaneGeometry(100, 100), { clipBias: 0.003, texture: texture });
      if (swizzle) {
        mesh.rotateX(-Math.PI / 2);
      }
    } else {
      mesh = new THREE.Mesh(geometry, currentMaterial);
      if (swizzle) {
        mesh.rotateX(-Math.PI / 2);
      }
    }

    mesh.castShadow = g === 0 ? false : true;
    mesh.receiveShadow = type !== mujoco.mjtGeom.mjGEOM_MESH.value;
    (mesh as any).bodyID = b;

    bodies[b].add(mesh);
    getPosition(model.geom_pos, g, mesh.position, swizzle);
    if (type !== mujoco.mjtGeom.mjGEOM_PLANE.value) {
      getQuaternion(model.geom_quat, g, mesh.quaternion, swizzle);
    }
    if (type === mujoco.mjtGeom.mjGEOM_ELLIPSOID.value) {
      mesh.scale.set(size[0], size[2], size[1]); // Stretch the Ellipsoid
    }
  }

  // Calculate required instance counts for tendons and flex vertices
  // Note: At load time, data.ten_wrapnum may not be populated yet, so we use conservative estimates
  let maxCylinders = 0;
  let maxSpheres = 0;

  // Estimate tendon instances based on model data
  // Each tendon can have multiple wrap points (model doesn't tell us max, so use conservative estimate)
  // Use a conservative estimate of max 20 wrap points per tendon
  const estimatedWrapsPerTendon = 20;
  if (model.ntendon > 0) {
    maxCylinders = model.ntendon * estimatedWrapsPerTendon;
    maxSpheres = model.ntendon * (estimatedWrapsPerTendon + 1);  // One more sphere than cylinders
  }

  // Count flex vertex instances from model (this is available at load time)
  for (let i = 0; i < model.nflex; i++) {
    maxSpheres += model.flex_vertnum[i];
  }

  // Ensure minimum of 1 instance to avoid errors
  maxCylinders = Math.max(1, maxCylinders);
  maxSpheres = Math.max(1, maxSpheres);

  console.log(`Creating instanced meshes: ${maxCylinders} cylinders, ${maxSpheres} spheres (for ${model.ntendon} tendons, ${model.nflex} flex)`);

  // Parse tendons - create instanced meshes for efficient rendering
  const tendonMat = new THREE.MeshPhongMaterial();
  tendonMat.color = new THREE.Color(0.8, 0.3, 0.3);

  (mujocoRoot as any).cylinders = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1),
    tendonMat,
    maxCylinders
  );
  (mujocoRoot as any).cylinders.receiveShadow = true;
  (mujocoRoot as any).cylinders.castShadow = true;
  mujocoRoot.add((mujocoRoot as any).cylinders);

  (mujocoRoot as any).spheres = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 10),
    tendonMat,
    maxSpheres
  );
  (mujocoRoot as any).spheres.receiveShadow = true;
  (mujocoRoot as any).spheres.castShadow = true;
  mujocoRoot.add((mujocoRoot as any).spheres);

  // Add bodies to scene hierarchy
  for (let b = 0; b < model.nbody; b++) {
    if (b === 0 || !bodies[0]) {
      if (bodies[b]) mujocoRoot.add(bodies[b]);
    } else if (bodies[b]) {
      bodies[0].add(bodies[b]);
    } else {
      console.log('Body without Geometry detected; adding to bodies', b, bodies[b]);
      bodies[b] = new THREE.Group();
      bodies[b].name = names[b + 1];
      (bodies[b] as any).bodyID = b;
      (bodies[b] as any).has_custom_mesh = false;
      bodies[0].add(bodies[b]);
    }
  }

  return { mujocoRoot, bodies, meshes };
}

/**
 * Update tendon and flex vertex rendering
 * Adapted from mujoco_wasm/src/mujocoUtils.js drawTendonsAndFlex
 *
 * @param mujocoRoot - The MuJoCo root group containing cylinder and sphere instances
 * @param model - MuJoCo model
 * @param data - MuJoCo data
 * @param swizzle - Whether to apply coordinate swizzling (default: true)
 */
export function drawTendonsAndFlex(
  mujocoRoot: THREE.Group,
  model: any,
  data: any,
  swizzle: boolean = false
): void {
  // Update tendon transforms
  const identityQuat = new THREE.Quaternion();
  let numWraps = 0;

  if (mujocoRoot && (mujocoRoot as any).cylinders && (mujocoRoot as any).spheres) {
    const mat = new THREE.Matrix4();
    // Get the maximum instance count - this was set when creating the InstancedMesh
    // We need to store it or retrieve it from the instanceMatrix array length / 16
    const cylindersMesh = (mujocoRoot as any).cylinders as THREE.InstancedMesh;
    const spheresMesh = (mujocoRoot as any).spheres as THREE.InstancedMesh;
    // instanceMatrix.array.length is maxCount * 16 (4x4 matrix)
    const maxCylinders = cylindersMesh.instanceMatrix.array.length / 16;
    const maxSpheres = spheresMesh.instanceMatrix.array.length / 16;

    for (let t = 0; t < model.ntendon; t++) {
      const startW = data.ten_wrapadr[t];
      const r = model.tendon_width[t];

      for (let w = startW; w < startW + data.ten_wrapnum[t] - 1; w++) {
        const tendonStart = new THREE.Vector3();
        const tendonEnd = new THREE.Vector3();
        getPosition(data.wrap_xpos, w, tendonStart, swizzle);
        getPosition(data.wrap_xpos, w + 1, tendonEnd, swizzle);
        const tendonAvg = new THREE.Vector3().addVectors(tendonStart, tendonEnd).multiplyScalar(0.5);

        const validStart = tendonStart.length() > 0.01;
        const validEnd = tendonEnd.length() > 0.01;

        if (validStart && numWraps < maxSpheres) {
          (mujocoRoot as any).spheres.setMatrixAt(numWraps, mat.compose(tendonStart, identityQuat, new THREE.Vector3(r, r, r)));
        }
        if (validEnd && numWraps + 1 < maxSpheres) {
          (mujocoRoot as any).spheres.setMatrixAt(numWraps + 1, mat.compose(tendonEnd, identityQuat, new THREE.Vector3(r, r, r)));
        }
        if (validStart && validEnd) {
          if (numWraps < maxCylinders) {
            mat.compose(
              tendonAvg,
              identityQuat.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                tendonEnd.clone().sub(tendonStart).normalize()
              ),
              new THREE.Vector3(r, tendonStart.distanceTo(tendonEnd), r)
            );
            (mujocoRoot as any).cylinders.setMatrixAt(numWraps, mat);
            numWraps++;
          } else {
            console.warn(`Exceeded cylinder instance limit: ${maxCylinders}`);
          }
        }
      }
    }

    // Render flex vertices
    let curFlexSphereInd = numWraps;
    const tempvertPos = new THREE.Vector3();
    const tempvertRad = new THREE.Vector3();

    for (let i = 0; i < model.nflex; i++) {
      for (let j = 0; j < model.flex_vertnum[i]; j++) {
        if (curFlexSphereInd >= maxSpheres) {
          console.warn(`Exceeded sphere instance limit at index ${curFlexSphereInd}, max: ${maxSpheres}`);
          break;
        }

        const vertIndex = model.flex_vertadr[i] + j;
        getPosition(data.flexvert_xpos, vertIndex, tempvertPos, swizzle);
        const r = 0.01;
        mat.compose(tempvertPos, identityQuat, tempvertRad.set(r, r, r));

        (mujocoRoot as any).spheres.setMatrixAt(curFlexSphereInd, mat);
        curFlexSphereInd++;
      }
    }

    (mujocoRoot as any).cylinders.count = numWraps;
    (mujocoRoot as any).spheres.count = curFlexSphereInd;
    (mujocoRoot as any).cylinders.instanceMatrix.needsUpdate = true;
    (mujocoRoot as any).spheres.instanceMatrix.needsUpdate = true;
  }
}

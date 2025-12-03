#!/usr/bin/env python3
"""
Extract MuJoCo rendering parameters from a model file.
This script loads a MuJoCo model and extracts all rendering-related parameters
that affect visual appearance, including materials, tendons, lights, and visualization options.
"""

import mujoco
import numpy as np
import sys
import json

def extract_rendering_params(model_path):
    """Extract all rendering parameters from a MuJoCo model."""

    print(f"Loading model from: {model_path}")
    model = mujoco.MjModel.from_xml_path(model_path)
    data = mujoco.MjData(model)

    # Initialize visualization options with defaults
    opt = mujoco.MjvOption()
    mujoco.mjv_defaultOption(opt)

    print("\n" + "="*80)
    print("MUJOCO RENDERING PARAMETERS")
    print("="*80)

    # ========================================================================
    # VISUALIZATION OPTIONS (mjvOption)
    # ========================================================================
    print("\n[1] VISUALIZATION OPTIONS (mjvOption)")
    print("-" * 80)

    # Print visualization flags
    print("\nVisualization Flags (opt.flags):")
    vis_flags = {
        'mjVIS_CONVEXHULL': mujoco.mjtVisFlag.mjVIS_CONVEXHULL,
        'mjVIS_TEXTURE': mujoco.mjtVisFlag.mjVIS_TEXTURE,
        'mjVIS_JOINT': mujoco.mjtVisFlag.mjVIS_JOINT,
        'mjVIS_CAMERA': mujoco.mjtVisFlag.mjVIS_CAMERA,
        'mjVIS_ACTUATOR': mujoco.mjtVisFlag.mjVIS_ACTUATOR,
        'mjVIS_ACTIVATION': mujoco.mjtVisFlag.mjVIS_ACTIVATION,
        'mjVIS_LIGHT': mujoco.mjtVisFlag.mjVIS_LIGHT,
        'mjVIS_TENDON': mujoco.mjtVisFlag.mjVIS_TENDON,
        'mjVIS_RANGEFINDER': mujoco.mjtVisFlag.mjVIS_RANGEFINDER,
        'mjVIS_CONSTRAINT': mujoco.mjtVisFlag.mjVIS_CONSTRAINT,
        'mjVIS_INERTIA': mujoco.mjtVisFlag.mjVIS_INERTIA,
        'mjVIS_SCLINERTIA': mujoco.mjtVisFlag.mjVIS_SCLINERTIA,
        'mjVIS_PERTFORCE': mujoco.mjtVisFlag.mjVIS_PERTFORCE,
        'mjVIS_PERTOBJ': mujoco.mjtVisFlag.mjVIS_PERTOBJ,
        'mjVIS_CONTACTPOINT': mujoco.mjtVisFlag.mjVIS_CONTACTPOINT,
        'mjVIS_CONTACTFORCE': mujoco.mjtVisFlag.mjVIS_CONTACTFORCE,
        'mjVIS_CONTACTSPLIT': mujoco.mjtVisFlag.mjVIS_CONTACTSPLIT,
        'mjVIS_TRANSPARENT': mujoco.mjtVisFlag.mjVIS_TRANSPARENT,
        'mjVIS_AUTOCONNECT': mujoco.mjtVisFlag.mjVIS_AUTOCONNECT,
        'mjVIS_COM': mujoco.mjtVisFlag.mjVIS_COM,
        'mjVIS_SELECT': mujoco.mjtVisFlag.mjVIS_SELECT,
        'mjVIS_STATIC': mujoco.mjtVisFlag.mjVIS_STATIC,
        'mjVIS_SKIN': mujoco.mjtVisFlag.mjVIS_SKIN,
    }

    for flag_name, flag_value in vis_flags.items():
        enabled = opt.flags[flag_value] == 1
        print(f"  {flag_name:25s} = {enabled}")

    # ========================================================================
    # MATERIAL PROPERTIES
    # ========================================================================
    print("\n[2] MATERIAL PROPERTIES")
    print("-" * 80)
    print(f"Number of materials: {model.nmat}")

    for i in range(model.nmat):
        print(f"\nMaterial {i}:")

        # Material RGBA
        rgba = model.mat_rgba[i]
        print(f"  rgba:         [{rgba[0]:.3f}, {rgba[1]:.3f}, {rgba[2]:.3f}, {rgba[3]:.3f}]")
        print(f"  rgba (0-255): [RGB({int(rgba[0]*255)}, {int(rgba[1]*255)}, {int(rgba[2]*255)}), A={rgba[3]:.3f}]")

        # Material properties
        print(f"  shininess:    {model.mat_shininess[i]:.3f}")
        print(f"  specular:     {model.mat_specular[i]:.3f}")
        print(f"  reflectance:  {model.mat_reflectance[i]:.3f}")

        # Emission
        emission = model.mat_emission[i]
        print(f"  emission:     {emission:.3f}")

        # Texture repeat
        texrepeat = model.mat_texrepeat[i]
        print(f"  texrepeat:    [{texrepeat[0]:.3f}, {texrepeat[1]:.3f}]")

    # ========================================================================
    # GEOMETRY PROPERTIES
    # ========================================================================
    print("\n[3] GEOMETRY PROPERTIES")
    print("-" * 80)
    print(f"Number of geoms: {model.ngeom}")
    print("\nShowing first 10 geoms (or all if fewer):")

    for i in range(min(10, model.ngeom)):
        geom_type = model.geom_type[i]
        type_names = ['PLANE', 'HFIELD', 'SPHERE', 'CAPSULE', 'ELLIPSOID', 'CYLINDER', 'BOX', 'MESH']
        type_name = type_names[geom_type] if geom_type < len(type_names) else f'UNKNOWN({geom_type})'

        print(f"\nGeom {i} ({type_name}):")

        # Geom RGBA
        rgba = model.geom_rgba[i]
        print(f"  rgba:         [{rgba[0]:.3f}, {rgba[1]:.3f}, {rgba[2]:.3f}, {rgba[3]:.3f}]")
        print(f"  rgba (0-255): [RGB({int(rgba[0]*255)}, {int(rgba[1]*255)}, {int(rgba[2]*255)}), A={rgba[3]:.3f}]")

        # Material ID
        mat_id = model.geom_matid[i]
        print(f"  material_id:  {mat_id}")

        if mat_id >= 0:
            print(f"    -> Material shininess:   {model.mat_shininess[mat_id]:.3f}")
            print(f"    -> Material specular:    {model.mat_specular[mat_id]:.3f}")
            print(f"    -> Material reflectance: {model.mat_reflectance[mat_id]:.3f}")

    # ========================================================================
    # TENDON PROPERTIES
    # ========================================================================
    print("\n[4] TENDON PROPERTIES")
    print("-" * 80)
    print(f"Number of tendons: {model.ntendon}")

    if model.ntendon > 0:
        print("\nDefault tendon settings:")
        for i in range(model.ntendon):
            print(f"\nTendon {i}:")

            # Tendon width
            width = model.tendon_width[i]
            print(f"  width:        {width:.6f}")

            # Tendon RGBA
            rgba = model.tendon_rgba[i]
            print(f"  rgba:         [{rgba[0]:.3f}, {rgba[1]:.3f}, {rgba[2]:.3f}, {rgba[3]:.3f}]")
            print(f"  rgba (0-255): [RGB({int(rgba[0]*255)}, {int(rgba[1]*255)}, {int(rgba[2]*255)}), A={rgba[3]:.3f}]")

            # Limited
            limited = model.tendon_limited[i]
            print(f"  limited:      {limited}")
    else:
        print("No tendons in model")

    # ========================================================================
    # LIGHT PROPERTIES
    # ========================================================================
    print("\n[5] LIGHT PROPERTIES")
    print("-" * 80)
    print(f"Number of lights: {model.nlight}")

    for i in range(model.nlight):
        print(f"\nLight {i}:")

        # Light mode
        mode = model.light_mode[i]
        mode_names = ['FIXED', 'TRACK', 'TRACKCOM', 'TARGETBODY', 'TARGETBODYCOM']
        mode_name = mode_names[mode] if mode < len(mode_names) else f'UNKNOWN({mode})'
        print(f"  mode:         {mode_name}")

        # Directional flag
        directional = model.light_directional[i]
        print(f"  directional:  {bool(directional)}")

        # Position
        pos = model.light_pos[i]
        print(f"  position:     [{pos[0]:.3f}, {pos[1]:.3f}, {pos[2]:.3f}]")

        # Direction
        direction = model.light_dir[i]
        print(f"  direction:    [{direction[0]:.3f}, {direction[1]:.3f}, {direction[2]:.3f}]")

        # Attenuation
        attenuation = model.light_attenuation[i]
        print(f"  attenuation:  [{attenuation[0]:.3f}, {attenuation[1]:.3f}, {attenuation[2]:.3f}]")

        # Cutoff
        cutoff = model.light_cutoff[i]
        print(f"  cutoff:       {cutoff:.3f}")

        # Exponent
        exponent = model.light_exponent[i]
        print(f"  exponent:     {exponent:.3f}")

        # Ambient
        ambient = model.light_ambient[i]
        print(f"  ambient:      [{ambient[0]:.3f}, {ambient[1]:.3f}, {ambient[2]:.3f}]")

        # Diffuse
        diffuse = model.light_diffuse[i]
        print(f"  diffuse:      [{diffuse[0]:.3f}, {diffuse[1]:.3f}, {diffuse[2]:.3f}]")

        # Specular
        specular = model.light_specular[i]
        print(f"  specular:     [{specular[0]:.3f}, {specular[1]:.3f}, {specular[2]:.3f}]")

    # ========================================================================
    # RENDERING FLAGS (mjvScene defaults)
    # ========================================================================
    print("\n[6] RENDERING FLAGS (mjvScene defaults)")
    print("-" * 80)
    print("These flags control OpenGL rendering effects:")

    rnd_flags = {
        'mjRND_SHADOW': mujoco.mjtRndFlag.mjRND_SHADOW,
        'mjRND_WIREFRAME': mujoco.mjtRndFlag.mjRND_WIREFRAME,
        'mjRND_REFLECTION': mujoco.mjtRndFlag.mjRND_REFLECTION,
        'mjRND_ADDITIVE': mujoco.mjtRndFlag.mjRND_ADDITIVE,
        'mjRND_SKYBOX': mujoco.mjtRndFlag.mjRND_SKYBOX,
        'mjRND_FOG': mujoco.mjtRndFlag.mjRND_FOG,
        'mjRND_HAZE': mujoco.mjtRndFlag.mjRND_HAZE,
        'mjRND_SEGMENT': mujoco.mjtRndFlag.mjRND_SEGMENT,
        'mjRND_IDCOLOR': mujoco.mjtRndFlag.mjRND_IDCOLOR,
        'mjRND_CULL_FACE': mujoco.mjtRndFlag.mjRND_CULL_FACE,
    }

    # Create a scene to get default rendering flags
    scene = mujoco.MjvScene(model, maxgeom=10000)

    for flag_name, flag_value in rnd_flags.items():
        enabled = scene.flags[flag_value] == 1
        print(f"  {flag_name:20s} = {enabled}")

    # ========================================================================
    # EXPORT TO JSON
    # ========================================================================
    print("\n[7] EXPORTING TO JSON")
    print("-" * 80)

    export_data = {
        "visualization_options": {
            flag_name: bool(opt.flags[flag_value])
            for flag_name, flag_value in vis_flags.items()
        },
        "materials": [
            {
                "index": i,
                "rgba": model.mat_rgba[i].tolist(),
                "shininess": float(model.mat_shininess[i]),
                "specular": float(model.mat_specular[i]),
                "reflectance": float(model.mat_reflectance[i]),
                "emission": float(model.mat_emission[i]),
                "texrepeat": model.mat_texrepeat[i].tolist(),
            }
            for i in range(model.nmat)
        ],
        "tendons": [
            {
                "index": i,
                "width": float(model.tendon_width[i]),
                "rgba": model.tendon_rgba[i].tolist(),
                "limited": bool(model.tendon_limited[i]),
            }
            for i in range(model.ntendon)
        ],
        "lights": [
            {
                "index": i,
                "mode": int(model.light_mode[i]),
                "directional": bool(model.light_directional[i]),
                "position": model.light_pos[i].tolist(),
                "direction": model.light_dir[i].tolist(),
                "attenuation": model.light_attenuation[i].tolist(),
                "cutoff": float(model.light_cutoff[i]),
                "exponent": float(model.light_exponent[i]),
                "ambient": model.light_ambient[i].tolist(),
                "diffuse": model.light_diffuse[i].tolist(),
                "specular": model.light_specular[i].tolist(),
            }
            for i in range(model.nlight)
        ],
        "rendering_flags": {
            flag_name: bool(scene.flags[flag_value])
            for flag_name, flag_value in rnd_flags.items()
        },
    }

    json_path = model_path.replace('.xml', '_rendering_params.json')
    with open(json_path, 'w') as f:
        json.dump(export_data, f, indent=2)

    print(f"Parameters exported to: {json_path}")

    print("\n" + "="*80)
    print("EXTRACTION COMPLETE")
    print("="*80)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_mujoco_rendering_params.py <path_to_model.xml>")
        print("\nExample:")
        print("  python extract_mujoco_rendering_params.py data/models/MS-Human-700/MS-Human-700-Locomotion.xml")
        sys.exit(1)

    model_path = sys.argv[1]
    extract_rendering_params(model_path)

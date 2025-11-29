import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';

export class ConstellationLayer {
    constructor() {
        this.id = 'constellation-layer';
        this.type = 'custom';
        this.renderingMode = '3d';

        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.map = null;
        this.renderer = null;

        this.nodes = new Map(); // id -> { mesh, line, data }
    }

    onAdd(map, gl) {
        this.map = map;

        this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true,
            alpha: true
        });

        this.renderer.autoClear = false;
    }

    render(gl, matrix) {
        // Sync Camera
        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
            .makeTranslation(0, 0, 0)
            .scale(new THREE.Vector3(1, -1, 1));

        this.camera.projectionMatrix = m.multiply(l);

        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        this.map.triggerRepaint();

        // Animate Nodes
        this.updateAnimations();
    }

    updateAnimations() {
        const time = Date.now() * 0.002;

        this.nodes.forEach(node => {
            // Pulse effect based on Amplitude
            const baseScale = 1;
            const amp = node.amplitude || 0;

            // Node Pulse
            const nodeScale = baseScale + (Math.sin(time + node.offset) * 0.2) + (amp * 3.0);
            node.mesh.scale.set(nodeScale, nodeScale, nodeScale);

            // Rotate Node
            node.mesh.rotation.y += 0.01;
            node.mesh.rotation.z += 0.005;
        });
    }

    updateAmplitudes(data) {
        this.nodes.forEach((node, id) => {
            if (data[id] !== undefined) {
                node.amplitude = data[id];
            }
        });
    }

    addNode(id, lat, lng, label) {
        if (this.nodes.has(id)) return;

        const modelOrigin = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
        const scale = modelOrigin.meterInMercatorCoordinateUnits();

        // 1. Create Mesh (Glowing Star)
        // Huge size for visibility (2000m radius)
        const geometry = new THREE.IcosahedronGeometry(2000 * scale, 1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.9
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Position: Float HIGH above ground (5000m) to avoid mountains
        const zOffset = 5000 * scale;
        mesh.position.set(modelOrigin.x, modelOrigin.y, modelOrigin.z + zOffset);

        // Add to Scene
        this.scene.add(mesh);

        console.log(`Added Node ${id} at ${lat}, ${lng}`);

        this.nodes.set(id, {
            mesh,
            offset: Math.random() * 100,
            amplitude: 0
        });
    }

    removeNode(id) {
        const node = this.nodes.get(id);
        if (node) {
            this.scene.remove(node.mesh);
            node.mesh.geometry.dispose();
            node.mesh.material.dispose();
            this.nodes.delete(id);
        }
    }
}

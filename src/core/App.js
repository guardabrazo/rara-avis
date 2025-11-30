import * as Tone from 'tone';
import { MapManager } from '../map/MapManager';
import { UIManager } from '../ui/UIManager';
import { Director } from '../logic/Director';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export class App {
    constructor() {
        this.mapManager = new MapManager(MAPBOX_TOKEN);
        this.uiManager = new UIManager();
        // this.visLayer = new ConstellationLayer(); // Removed
        this.director = new Director(this.mapManager, this.uiManager);
        this.animationFrameId = null;
    }

    async init() {
        // 1. Init UI
        this.uiManager.init();
        this.wireUIEvents();

        // 2. Init Map
        await this.mapManager.init('map');
        // this.mapManager.addCustomLayer(this.visLayer); // Removed

        // 3. Silent Start (Load Audio Buffers & Start Logic)
        try {
            console.log('Loading Audio Buffers...');
            await this.director.initAudio();
            console.log('Audio Buffers Loaded. Starting Director...');
            this.director.start();
        } catch (e) {
            console.error('Auto-start failed:', e);
        }

        // 4. Resume Audio Context on First Interaction (Browser Policy)
        const resumeAudio = async () => {
            if (Tone.context.state !== 'running') {
                console.log('Resuming Audio Context...');
                await Tone.start();
                console.log('Audio Context Resumed.');
            }
            // Remove listeners once resumed
            document.removeEventListener('mousedown', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
            document.removeEventListener('touchstart', resumeAudio);
        };

        document.addEventListener('mousedown', resumeAudio);
        document.addEventListener('keydown', resumeAudio);
        document.addEventListener('touchstart', resumeAudio);

        // 5. Start Animation Loop
        this.animate();
    }

    wireUIEvents() {
        // Audio Init
        // Playback (Handles Init if needed)
        this.uiManager.on('play', async () => {
            if (!this.director.audioInitialized) {
                this.uiManager.setLoadingText('Starting Audio...');
                try {
                    await Tone.start();
                    await this.director.initAudio();
                    this.uiManager.hideOverlay();
                } catch (e) {
                    this.uiManager.setLoadingText('Error Starting Audio');
                    console.error(e);
                    return;
                }
            }
            this.director.start();
        });

        this.uiManager.on('stop', () => this.director.stop());

        // Map Controls

        this.uiManager.on('setMapStyle', (style) => this.mapManager.setStyle(style));



        // Wanderer Controls
        this.uiManager.on('setWanderMode', (mode) => this.director.wanderer.setMode(mode));
        this.uiManager.on('setWanderDirection', (deg) => this.director.wanderer.setBearing(deg));
        this.uiManager.on('setFlySpeed', (val) => {
            this.director.wanderer.setSpeed(val);
        });
    }

    animate() {
        // Update Director with Map Data
        const mapData = this.analyzeMap();
        this.director.update(mapData);

        // Update UI Status
        const conductorState = this.director.getConductorState();
        this.uiManager.updateStatus(conductorState.type, conductorState.harmonyMode, conductorState.density);

        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    analyzeMap() {
        // Logic extracted from original main.js
        if (!this.mapManager.map) return { density: 0, type: 'mix', entropy: 0.5 };

        const centerPoint = this.mapManager.getProjectedCenter();
        const bbox = [
            [centerPoint.x - 50, centerPoint.y - 50],
            [centerPoint.x + 50, centerPoint.y + 50]
        ];
        const features = this.mapManager.getFeatures(bbox);

        // Calculate Density
        const rawCount = features.length;
        const density = Math.max(0, Math.min(rawCount / 50, 1));

        // Calculate Type
        let waterCount = 0;
        let buildingCount = 0;
        let natureCount = 0;

        features.forEach(f => {
            if (f.layer.id.includes('water')) waterCount++;
            else if (f.layer.id.includes('building') || f.layer.id.includes('road')) buildingCount++;
            else if (f.layer.id.includes('landuse') || f.layer.id.includes('park')) natureCount++;
        });

        let type = 'mix';
        if (waterCount > buildingCount && waterCount > natureCount) type = 'water';
        else if (buildingCount > waterCount && buildingCount > natureCount) type = 'urban';
        else if (natureCount > waterCount && natureCount > buildingCount) type = 'nature';

        // Calculate Entropy
        let entropy = 0.5;
        if (type === 'urban') entropy = 0.2;
        else if (type === 'nature') entropy = 0.8;

        return { density, type, entropy };
    }
}

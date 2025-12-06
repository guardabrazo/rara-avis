import mapboxgl from 'mapbox-gl';

export class MapManager {
    constructor(token) {
        this.token = token;
        this.map = null;
    }

    // Curated list of interesting locations (Mountains, Forests, Cities, Deserts)
    // Curated list of famous Birdwatching Hotspots
    static INTERESTING_LOCATIONS = [
        { name: 'Manu National Park, Peru', coords: [-71.7201, -11.9981] },
        { name: 'Pipeline Road, Panama', coords: [-79.7500, 9.1500] },
        { name: 'Mindo Cloud Forest, Ecuador', coords: [-78.7760, -0.0519] },
        { name: 'Rio Blanco, Colombia', coords: [-75.4830, 5.0670] },
        { name: 'Everglades National Park, USA', coords: [-80.8980, 25.2860] },
        { name: 'Monfragüe National Park, Spain', coords: [-6.0000, 39.8500] },
        { name: 'Lochinvar National Park, Zambia', coords: [27.2500, -15.8000] },
        { name: 'Kruger National Park, South Africa', coords: [31.4833, -24.0116] },
        { name: 'Kakadu National Park, Australia', coords: [132.4333, -12.4333] },
        { name: 'Varirata National Park, PNG', coords: [147.3667, -9.4333] },
        { name: 'Danum Valley, Borneo', coords: [117.6667, 4.9667] },
        { name: 'Bharatpur Bird Sanctuary, India', coords: [77.5333, 27.1667] },

        // Original Interesting Locations
        { name: 'Grand Canyon', coords: [-112.1129, 36.1069] },
        { name: 'Mont Blanc', coords: [6.8763, 45.8326] },
        { name: 'Machu Picchu', coords: [-72.5450, -13.1631] },
        { name: 'Mt. Fuji', coords: [138.7274, 35.3606] },
        { name: 'Madrid', coords: [-3.7038, 40.4168] },
        { name: 'Rio de Janeiro', coords: [-43.2096, -22.9068] },
        { name: 'Mt. Everest', coords: [86.9250, 27.9881] },
        { name: 'Skógafoss', coords: [-19.5113, 63.5321] },
        { name: 'Mauna Kea', coords: [-155.5828, 19.8968] },
        { name: 'Rome', coords: [12.4964, 41.9028] },
        { name: 'San Francisco', coords: [-122.4194, 37.7749] },
        { name: 'Pyramids of Giza', coords: [31.1342, 29.9792] },
        { name: 'Sydney', coords: [151.2093, -33.8688] },
        { name: 'New York City', coords: [-73.9352, 40.7306] },
    ];

    init(containerId) {
        mapboxgl.accessToken = this.token;

        const randomStart = MapManager.INTERESTING_LOCATIONS[Math.floor(Math.random() * MapManager.INTERESTING_LOCATIONS.length)];
        console.log('Starting at:', randomStart.name);

        const isMobile = window.innerWidth <= 768;
        const initialStyle = isMobile ? 'mapbox://styles/mapbox/satellite-v9' : 'mapbox://styles/mapbox/dark-v11';

        this.map = new mapboxgl.Map({
            container: containerId,
            style: initialStyle,
            center: randomStart.coords,
            zoom: 13,
            pitch: 0,
            bearing: 0,
            maxPitch: 70,
        });

        // Add Navigation Control (Zoom / Compass)
        this.map.addControl(new mapboxgl.NavigationControl({
            visualizePitch: true
        }), 'top-right');

        this.isInteracting = false;
        this.interactionTimeout = null;

        return new Promise((resolve) => {
            this.map.on('load', () => {
                // this.addTerrain(); // Removed
                // this.applyStyleOverrides(initialStyle); // Removed


                // Track User Interaction
                const explicitStartEvents = ['mousedown', 'touchstart', 'dragstart', 'rotatestart', 'pitchstart', 'zoomstart'];
                const explicitEndEvents = ['mouseup', 'touchend', 'dragend', 'rotateend', 'pitchend', 'zoomend'];

                // 1. Explicit Start/End (Drag, Rotate, Pitch, Zoom)
                explicitStartEvents.forEach(e => {
                    this.map.on(e, () => {
                        this.isInteracting = true;
                        // Clear any pending wheel timeout to prevent race conditions
                        if (this.interactionTimeout) clearTimeout(this.interactionTimeout);
                    });
                });

                const endInteraction = () => {
                    // Small delay to ensure animations clear
                    this.interactionTimeout = setTimeout(() => {
                        this.isInteracting = false;
                    }, 100);
                };

                explicitEndEvents.forEach(e => {
                    this.map.on(e, endInteraction);
                });

                // Global safety for mouseup/touchend (in case cursor leaves map)
                window.addEventListener('mouseup', endInteraction);
                window.addEventListener('touchend', endInteraction);

                // 2. Momentary (Wheel/Scroll) - Needs Debounce
                this.map.on('wheel', () => {
                    this.isInteracting = true;
                    if (this.interactionTimeout) clearTimeout(this.interactionTimeout);

                    // Debounce: Assume interaction ended if no scroll for 300ms
                    this.interactionTimeout = setTimeout(() => {
                        this.isInteracting = false;
                    }, 300);
                });

                // Apply the initial style with overrides (Terrain, Contours, etc.)
                this.setStyle(initialStyle);

                resolve();
            });
        });
    }

    async setStyle(styleUrl) {
        try {
            // 1. Fetch the Style JSON
            const response = await fetch(this.getStyleUrl(styleUrl));
            const styleJson = await response.json();

            // 2. Merge Terrain Source & Config
            if (!styleJson.sources) styleJson.sources = {};

            // Ensure mapbox-dem source is present in the new style
            styleJson.sources['mapbox-dem'] = {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 14,
            };

            // Ensure terrain is enabled in the new style
            styleJson.terrain = { source: 'mapbox-dem', exaggeration: 1.2 };

            // 3. Apply Mode-Specific Overrides (Dark Mode Contours)
            if (styleUrl.includes('dark')) {
                // Add Contours Source
                styleJson.sources['contours'] = {
                    type: 'vector',
                    url: 'mapbox://mapbox.mapbox-terrain-v2'
                };

                // Find insertion point (below labels)
                let firstSymbolIndex = styleJson.layers.findIndex(l => l.type === 'symbol');
                if (firstSymbolIndex === -1) firstSymbolIndex = styleJson.layers.length;

                // Create Custom Layers
                const hillshadeLayer = {
                    'id': 'hillshading',
                    'type': 'hillshade',
                    'source': 'mapbox-dem',
                    'layout': { visibility: 'visible' },
                    'paint': {
                        'hillshade-shadow-color': '#000000',
                        'hillshade-highlight-color': '#ffffff',
                        'hillshade-accent-color': '#000000',
                        'hillshade-exaggeration': 0.05,
                        'hillshade-opacity': 0.1
                    }
                };

                const minorContours = {
                    'id': 'contour-lines-minor',
                    'type': 'line',
                    'source': 'contours',
                    'source-layer': 'contour',
                    'filter': ['!=', ['%', ['get', 'ele'], 100], 0],
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': {
                        'line-color': '#ffffff',
                        'line-width': 0.5,
                        'line-opacity': 0.075
                    }
                };

                const majorContours = {
                    'id': 'contour-lines-major',
                    'type': 'line',
                    'source': 'contours',
                    'source-layer': 'contour',
                    'filter': ['==', ['%', ['get', 'ele'], 100], 0],
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': {
                        'line-color': '#ffffff',
                        'line-width': 0.5,
                        'line-opacity': 0.15
                    }
                };

                // Insert Layers
                styleJson.layers.splice(firstSymbolIndex, 0, hillshadeLayer, minorContours, majorContours);
            }

            // 4. Apply Mode-Specific Overrides (Outdoors Cleanup)
            if (styleUrl.includes('outdoors')) {
                styleJson.layers.forEach(layer => {
                    const id = layer.id;
                    if (
                        id.includes('poi-label') ||
                        id.includes('poi-scalerank') ||
                        id.includes('road-label') ||
                        id.includes('road-number-shield') ||
                        id.includes('peak-label') ||
                        id.includes('natural-point-label')
                    ) {
                        if (!layer.layout) layer.layout = {};
                        layer.layout.visibility = 'none';
                    }
                });
            }

            // 5. Apply the Merged Style
            // This prevents terrain from unloading/reloading, stopping the "jump"
            this.map.setStyle(styleJson);

        } catch (e) {
            console.error('Failed to set map style:', e);
            // Fallback to standard setStyle if fetch fails
            this.map.setStyle(styleUrl);
        }
    }

    getStyleUrl(mapboxUrl) {
        // Convert mapbox:// URL to HTTPS URL for fetching JSON
        // Format: mapbox://styles/user/styleId
        const parts = mapboxUrl.split('mapbox://styles/');
        if (parts.length === 2) {
            return `https://api.mapbox.com/styles/v1/${parts[1]}?access_token=${this.token}`;
        }
        return mapboxUrl;
    }

    getCenter() {
        return this.map.getCenter();
    }

    getProjectedCenter() {
        const center = this.map.getCenter();
        return this.map.project(center);
    }

    getFeatures(bbox) {
        if (!this.map || !this.map.isStyleLoaded()) return [];
        try {
            return this.map.queryRenderedFeatures(bbox);
        } catch (e) {
            console.warn('Map query failed:', e);
            return [];
        }
    }

    resize() {
        if (this.map) {
            this.map.resize();
        }
    }

    getNearestLandmark() {
        const center = this.getCenter();
        if (!center) return null;

        let nearest = null;
        let minDist = Infinity;

        MapManager.INTERESTING_LOCATIONS.forEach(loc => {
            const dx = loc.coords[0] - center.lng;
            const dy = loc.coords[1] - center.lat;
            const dist = dx * dx + dy * dy; // Squared distance is fine for comparison

            if (dist < minDist) {
                minDist = dist;
                nearest = loc;
            }
        });

        return nearest;
    }

    addCustomLayer(layer) {
        if (this.map) {
            this.map.addLayer(layer);
        }
    }
}

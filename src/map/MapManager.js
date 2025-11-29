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

        this.isInteracting = false;

        return new Promise((resolve) => {
            this.map.on('load', () => {
                this.addTerrain();
                this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');

                // Track User Interaction
                const startEvents = ['mousedown', 'touchstart', 'dragstart', 'rotatestart', 'pitchstart'];
                const endEvents = ['mouseup', 'touchend', 'dragend', 'rotateend', 'pitchend'];

                startEvents.forEach(e => {
                    this.map.on(e, () => {
                        this.isInteracting = true;
                        // console.log('Interaction Start:', e);
                    });
                });

                endEvents.forEach(e => {
                    this.map.on(e, () => {
                        this.isInteracting = false;
                        // console.log('Interaction End:', e);
                    });
                });

                resolve();
            });
        });
    }

    addTerrain() {
        if (!this.map.getSource('mapbox-dem')) {
            this.map.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 14,
            });
        }
        this.map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    }

    setStyle(styleUrl) {
        this.map.setStyle(styleUrl);
        this.map.once('style.load', () => {
            this.addTerrain();
        });
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

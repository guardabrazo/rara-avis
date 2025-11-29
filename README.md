# RARA AVIS
### Geospatial Instrument V 1.0

**Rara Avis** ("Rare Bird") is an immersive, web-based geospatial instrument that allows users to explore the sonic landscape of the world. By combining 3D terrain mapping with real-time audio synthesis and geolocation-based field recordings, it creates a unique "flight" experience through the biophony of our planet.

![Rara Avis Screenshot](./screenshot.png)

## Features

*   **Global Biophony**: Automatically fetches and plays bird songs (via Xeno-canto) and ambient field recordings (via Freesound) based on your virtual location.
*   **3D Compass HUD**: A custom-built, 3D-reactive compass that visualizes sound sources in real-time. Markers pulse with audio amplitude, and the compass tilts and rotates with your flight path.
*   **Flight Mode**: "Fly" over the terrain with automated wandering or manual control.
*   **Dynamic Audio Engine**: Powered by Tone.js, featuring distance-based mixing, separate volume controls for birds and background ambience, and a seamless "silent start" experience.

## Technology Stack

*   **Core**: Vanilla JavaScript (ES6+)
*   **Build Tool**: [Vite](https://vitejs.dev/)
*   **Mapping**: [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) (3D Terrain & Satellite)
*   **Audio**: [Tone.js](https://tonejs.github.io/)
*   **Data Sources**:
    *   [Xeno-canto](https://xeno-canto.org/) (Bird sounds)
    *   [Freesound](https://freesound.org/) (Ambient textures)
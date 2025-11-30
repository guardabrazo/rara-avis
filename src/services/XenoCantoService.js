export class XenoCantoService {
    constructor() {
        // Use local proxy path defined in vite.config.js
        this.baseUrl = '/api/xeno-canto';
    }

    async fetchSamples(lat, lon, radiusKm = 20) {
        // Adaptive Search: Try requested radius, if empty, expand.
        // Xeno-canto 'box' query: box:LAT_MIN,LON_MIN,LAT_MAX,LON_MAX
        // 1 deg lat ~= 111km. 1 deg lon ~= 111km * cos(lat)

        let currentRadius = radiusKm;
        const maxRadius = 500; // Max expansion
        const attempts = 10; // Increased to ensure we can reach 500km (20 -> 40 -> 80 -> 160 -> 320 -> 500)

        for (let i = 0; i < attempts; i++) {
            // console.log(`Fetching Xeno-canto (Attempt ${i + 1}/${attempts}): Radius ${currentRadius}km`);

            const latDelta = currentRadius / 111;
            const lonDelta = currentRadius / (111 * Math.cos(lat * Math.PI / 180));

            const box = `${(lat - latDelta).toFixed(3)},${(lon - lonDelta).toFixed(3)},${(lat + latDelta).toFixed(3)},${(lon + lonDelta).toFixed(3)}`;
            const query = `box:${box} len:10-60`;
            const apiKey = import.meta.env.VITE_XENOCANTO_KEY;

            let url;
            if (import.meta.env.PROD) {
                // Production: Use CORS Proxy with API v3
                // API v3 REQUIRES the 'key' parameter
                const targetUrl = `https://www.xeno-canto.org/api/3/recordings?query=${encodeURIComponent(query)}&key=${apiKey}`;
                url = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
            } else {
                // Development: Use local proxy (mapped to v3 in vite.config.js)
                url = `${this.baseUrl}?query=${encodeURIComponent(query)}&key=${apiKey}`;
            }
            // Development: Use local proxy
            url = `${this.baseUrl}?query=${encodeURIComponent(query)}&key=${apiKey}`;
        }

        try {
            const response = await fetch(url); Also
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const text = await response.text();
            const data = JSON.parse(text);
            const recordings = data.recordings || [];

            if (recordings.length > 0) {
                // Parse coordinates and filter invalid ones
                const validRecordings = recordings.map(r => ({
                    ...r,
                    lat: parseFloat(r.lat),
                    lng: parseFloat(r.lon) // Xeno-canto uses 'lon'
                })).filter(r => {
                    const valid = !isNaN(r.lat) && !isNaN(r.lng);
                    if (!valid) console.warn('Invalid coords for recording:', r.id, r.lat, r.lon);
                    return valid;
                });

                if (validRecordings.length > 0) {
                    console.log(`Found ${validRecordings.length} samples at ${currentRadius}km radius.`);
                    return validRecordings.slice(0, 100);
                }
            }

            // If we're here, we found nothing valid. Expand and retry.
            // console.log(`No samples found at ${currentRadius}km. Expanding...`);
            currentRadius *= 2;
            if (currentRadius > maxRadius) currentRadius = maxRadius;

        } catch (e) {
            console.warn("XenoCanto fetch failed:", e);
            // Don't retry on network error, just return empty
            return [];
        }
    }

        return[];
}
}

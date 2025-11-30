export class FreesoundService {
    constructor() {
        this.baseUrl = '/api/freesound';
        this.apiKey = import.meta.env.VITE_FREESOUND_KEY;
    }

    async fetchSamples(lat, lon, radiusKm = 50) {
        // Freesound geo search uses 'geo:lat,lon,distance'
        // But the text search endpoint is more flexible.
        // Let's use text search with geo filter.

        // Filter: geotagged=1 and within radius
        // Note: Freesound API v2 geo filtering syntax (Solr):
        // filter={!geofilt sfield=geotag pt=LAT,LON d=DIST}

        // We also want "field-recording" or "ambience"
        const query = "field-recording ambience nature";

        // Use Solr spatial filter syntax
        const geoFilter = `{!geofilt sfield=geotag pt=${lat.toFixed(4)},${lon.toFixed(4)} d=${radiusKm}}`;

        // Add duration filter (e.g., 30s to 5min)
        const durationFilter = "duration:[30 TO 300]";

        // Combine filters. Note: We need to be careful with spaces.
        // It's safer to pass them as separate filter parameters if the API supported it,
        // but here we concatenate.
        const filter = `${geoFilter} ${durationFilter}`;

        // Fields to return
        const fields = "id,name,previews,username,geotag,duration,url";

        let url;
        if (import.meta.env.PROD) {
            const targetUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&fields=${fields}&token=${this.apiKey}&page_size=10`;
            url = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        } else {
            url = `${this.baseUrl}/search/text/?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&fields=${fields}&token=${this.apiKey}&page_size=10`;
        }

        // console.log(`Fetching Freesound: ${url}`);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            const results = data.results || [];

            // console.log(`Freesound results: ${results.length}`);

            return results.map(r => ({
                id: r.id,
                name: r.name,
                url: r.previews['preview-hq-mp3'], // Use HQ MP3 preview
                lat: r.geotag ? r.geotag[0] : null,
                lon: r.geotag ? r.geotag[1] : null,
                duration: r.duration,
                source: 'freesound',
                credit: r.username
            }));

        } catch (e) {
            console.warn("Freesound fetch failed:", e);
            return [];
        }
    }
}

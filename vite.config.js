import { defineConfig } from 'vite';

export default defineConfig({
    base: '/rara-avis/',
    server: {
        proxy: {
            '/api/xeno-canto': {
                target: 'https://www.xeno-canto.org/api/3/recordings',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/xeno-canto/, ''),
            },
            '/proxy-audio': {
                target: 'api/3',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/proxy-audio/, ''),
            },
            '/api/freesound': {
                target: 'https://freesound.org/apiv2',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/freesound/, ''),
            },
        },
    },
});

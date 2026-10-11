import { defineConfig } from 'vite';

export default defineConfig({
    // Everything in assets/ (sprites, tiles, Tiled maps, audio) is served as-is
    // from the site root, e.g. assets/tiles/x.png -> /tiles/x.png.
    publicDir: 'assets',
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            // The browser only ever talks HTTP/JSON to Express; Express talks to C/C++.
            '/api': 'http://localhost:3001',
        },
    },
    build: {
        chunkSizeWarningLimit: 2000, // Phaser is large by design
    },
});

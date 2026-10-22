import { cloudflare } from '@cloudflare/vite-plugin';
import { serwist } from '@serwist/vite';
import { defineConfig } from 'vite';
import vinext from 'vinext';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom', 'react/jsx-runtime'] },
  plugins: [
    vinext(),
    serwist({
      swSrc: 'app/sw.ts',
      swDest: 'client/sw.js',
      globDirectory: 'dist/client',
      globIgnores: ['sw.js', 'assets/worker-entry-*.js'],
      injectionPoint: 'self.__SW_MANIFEST',
      type: 'classic',
      rollupFormat: 'iife',
    }),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
});

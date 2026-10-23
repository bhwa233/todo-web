import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import {
    Serwist, NetworkOnly,
} from 'serwist'


declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    // Only the public shell/build assets are precached. Authenticated HTML,
    // RSC payloads, APIs and mutations must never enter a shared runtime cache.
    runtimeCaching: [{ matcher: ({ request }) => request.mode === 'navigate', handler: new NetworkOnly() }],
    fallbacks: { entries: [{ url: '/offline.html', matcher: ({ request }) => request.destination === 'document' }] },
})

serwist.addEventListeners()

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name !== serwist.precacheStrategy.cacheName).map(name => caches.delete(name)))));
});

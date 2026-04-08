// Kesh versiyasi: Har safar Netlify'ga yangi narsa yuklaganda 
// shu raqamni bittaga oshirib qo'ysangiz (masalan v9, v10), barcha talabalarda sayt darhol yangilanadi.
const CACHE_NAME = 'pro-exam-cache-v8'; 

// Oflayn ishlashi uchun xotiraga olinadigan barcha fayllar ro'yxati
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/logo.png',
  '/bino.png',
  '/tg.png',
  '/insta.png',
  '/musiqa_nazariyasi.json',
  '/cholgu_ijrochiligi.json',
  '/vokal_ijrochiligi.json',
  '/metodika_repertuar.json'
];

// 1. O'RNATISH (INSTALL) - Fayllarni telefon xotirasiga yuklash
self.addEventListener('install', event => {
  // Yangi versiya kelganda kutib o'tirmasdan darhol o'rnatish
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Kesh ochildi va fayllar saqlanmoqda...');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. FAOLLASHTIRISH (ACTIVATE) - Eski xotirani (keshni) tozalash
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Agar xotiradagi nom hozirgi CACHE_NAME bilan bir xil bo'lmasa, uni o'chirib tashlash
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Eski kesh tozalandi:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Ochiq turgan sahifalarga yangi keshni darhol tatbiq etish
  );
});

// 3. MA'LUMOT SO'RASH (FETCH) - Saytni oflayn rejimda ishlashi uchun
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Agar so'ralgan fayl keshda bor bo'lsa, uni internet kutmasdan darhol berish
        if (response) {
          return response;
        }
        // Agar keshda bo'lmasa, uni to'g'ridan-to'g'ri internetdan yuklab olish
        return fetch(event.request);
      })
  );
});
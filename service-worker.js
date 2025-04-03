const CACHE_NAME = 'pdf-gpt-v1';
const urlsToCache = [
  './',
  './index.html',
  './online-style.css',
  './online-script.js',
  './icon-192.png',
  './icon-512.png',
  './manifest.json'
];

// نصب سرویس ورکر و ذخیره فایل‌ها در کش
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('کش ایجاد شد');
        return cache.addAll(urlsToCache);
      })
  );
});

// استراتژی کش اول، سپس شبکه
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // اگر منبع در کش یافت شد
        if (response) {
          return response;
        }
        
        // اگر در کش نبود، از شبکه درخواست می‌کنیم
        return fetch(event.request)
          .then(response => {
            // این درخواست را کش نمی‌کنیم چون ممکن است پویا باشد
            return response;
          })
          .catch(error => {
            console.log('خطا در بارگذاری منبع:', error);
          });
      })
  );
});

// فعال‌سازی سرویس ورکر و حذف کش‌های قدیمی
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // حذف کش‌های قدیمی
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 
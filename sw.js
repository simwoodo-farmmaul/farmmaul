// PC 앱 설치 규격(PWA) 완벽 통과를 위한 서비스 워커
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    // 통신에 실패했을 때만 작동하는 기본 안전장치
    event.respondWith(
        fetch(event.request).catch(() => {
            return new Response('인터넷 연결이 끊겨 팜마을에 접속할 수 없습니다.');
        })
    );
});
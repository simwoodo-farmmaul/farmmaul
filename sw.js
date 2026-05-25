// 팜마을 앱 오프라인 작동을 위한 서비스 워커 (버전 2)
self.addEventListener('install', (pEvent) => {
  console.log('팜마을 서비스 워커 설치 완료!');
});

self.addEventListener('fetch', (pEvent) => {
  // 앱이 구동될 때 필요한 데이터를 주고받는 통로 역할을 합니다.
});
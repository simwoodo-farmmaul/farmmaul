
-- 팜마을 데이터베이스(DB) 설계도 (MySQL 전용)
-- 호스팅 서버의 phpMyAdmin이나 MySQL 클라이언트에서 아래 코드를 복사해서 실행하시면 됩니다.

-- 1. 데이터베이스 생성 및 선택 (호스팅 환경에 따라 DB명은 카페24 아이디와 같을 수 있습니다)
CREATE DATABASE IF NOT EXISTS farmmaul_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE farmmaul_db;

-- =========================================================================
-- 1. 통합 회원 테이블 (Users)
-- 팜마을 철학에 따라 모든 회원은 하나의 테이블에서 관리되며, 생산자/HUB장 권한을 가질 수 있습니다.
-- =========================================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kakao_id VARCHAR(100) UNIQUE COMMENT '카카오 로그인 연동 ID',
    name VARCHAR(50) NOT NULL COMMENT '회원 실명',
    phone VARCHAR(20) NOT NULL COMMENT '휴대폰 번호',
    address VARCHAR(255) COMMENT '기본 배송지 주소',
    is_producer BOOLEAN DEFAULT FALSE COMMENT '생산자 권한 여부 (1: 생산자, 0: 일반)',
    is_hub_manager BOOLEAN DEFAULT FALSE COMMENT 'HUB 거점장 권한 여부 (1: HUB장, 0: 일반)',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '가입일시'
);

-- =========================================================================
-- 2. 생산자 농장 프로필 테이블 (Producer_Profiles)
-- 생산자 권한을 가진 회원의 농장 브랜드 및 상세 소개 정보를 담습니다.
-- =========================================================================
CREATE TABLE IF NOT EXISTS producer_profiles (
    user_id INT PRIMARY KEY COMMENT 'users 테이블의 id와 연결',
    farm_name VARCHAR(100) NOT NULL COMMENT '농장 상호명',
    farm_address VARCHAR(255) NOT NULL COMMENT '농장 소재지',
    main_items VARCHAR(200) COMMENT '주력 생산 품목',
    promo_text VARCHAR(100) COMMENT '한 줄 홍보 문구',
    description TEXT COMMENT '농장 상세 소개글',
    profile_image_url VARCHAR(255) COMMENT '대표 프로필 사진 경로',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================================================================
-- 3. 마을 HUB 거점 테이블 (Hubs)
-- 동네 카페, 편의점 등 승인된 마을 HUB 장소 정보를 담습니다.
-- =========================================================================
CREATE TABLE IF NOT EXISTS hubs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    manager_id INT NOT NULL COMMENT 'users 테이블의 HUB장 id와 연결',
    hub_name VARCHAR(100) NOT NULL COMMENT 'HUB 상호명 (예: 지산동 1호 카페초록)',
    hub_type VARCHAR(50) COMMENT '공간 형태 (카페/편의점/미용실 등)',
    hub_address VARCHAR(255) NOT NULL COMMENT '거점 소재지',
    open_time VARCHAR(10) COMMENT '운영 시작 시간 (예: 09:00)',
    close_time VARCHAR(10) COMMENT '운영 마감 시간 (예: 21:00)',
    hub_image_url VARCHAR(255) COMMENT '매장 전경 사진 경로',
    status ENUM('pending', 'active', 'inactive') DEFAULT 'pending' COMMENT '본사 승인 상태',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================================================================
-- 4. 상품 테이블 (Products)
-- 생산자가 등록한 농/축/수산물 상품 정보를 담습니다.
-- =========================================================================
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producer_id INT NOT NULL COMMENT 'users 테이블의 생산자 id와 연결',
    category VARCHAR(50) NOT NULL COMMENT '상품 분류 (농산물/축산물 등)',
    title VARCHAR(200) NOT NULL COMMENT '상품 제목',
    original_price INT NOT NULL COMMENT '정상 가격',
    sale_price INT NOT NULL COMMENT '할인 판매 가격',
    unit VARCHAR(50) COMMENT '판매 단위 (예: 2kg/박스)',
    harvest_date DATE COMMENT '수확/생산일',
    delivery_methods VARCHAR(200) COMMENT '수령 방식 (방문수거/HUB보관/택배)',
    youtube_url VARCHAR(255) COMMENT '유튜브 홍보 영상 주소',
    main_image_url VARCHAR(255) COMMENT '상품 대표 사진',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (producer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================================================================
-- 5. 주문 내역 테이블 (Orders)
-- 고객이 결제를 완료한 주문의 총괄 정보를 담습니다.
-- =========================================================================
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL COMMENT '주문 번호 (예: 20260515-0042)',
    buyer_id INT NOT NULL COMMENT '구매자 id',
    total_price INT NOT NULL COMMENT '최종 결제 금액',
    delivery_method VARCHAR(50) NOT NULL COMMENT '선택된 수령 방식',
    hub_id INT COMMENT 'HUB 수령일 경우 선택한 hub의 id',
    status ENUM('paid', 'preparing', 'ready_at_hub', 'completed') DEFAULT 'paid' COMMENT '주문 진행 상태',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (hub_id) REFERENCES hubs(id)
);

-- =========================================================================
-- 6. 농장 일기(블로그) 테이블 (Farm_Diaries)
-- 생산자가 마이페이지에서 작성한 일상/수확 소식을 담습니다.
-- =========================================================================
CREATE TABLE IF NOT EXISTS farm_diaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producer_id INT NOT NULL COMMENT '작성한 생산자 id',
    title VARCHAR(200) NOT NULL COMMENT '일기 제목',
    content TEXT NOT NULL COMMENT '일기 본문 내용',
    tags VARCHAR(255) COMMENT '해시태그 (예: #토마토 #수확)',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (producer_id) REFERENCES users(id) ON DELETE CASCADE
);

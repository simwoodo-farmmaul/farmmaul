require('./setup.js'); // 👈 서버가 켜질 때 도면(setup.js)을 자동으로 실행하는 마법의 주문!
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// 💡 사진 파일이 포함되므로 대용량(10메가) 데이터도 통과할 수 있도록 허가증 보강!
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 🌟 클라우드 환경에 맞춰 더 튼튼하게 보강된 마법의 열쇠! (모든 파일 접근 허가)
app.use(express.static(path.join(__dirname)));

// 클라우드타입 내부 데이터베이스 연결 설정
const db = mysql.createConnection({
    host: 'farm-db3', 
    port: 3306,       
    user: 'root',
    password: 'Farmmaul1234!',
    database: 'farmmaul_db'
});

// 창고 문이 잘 열렸는지 확인
db.connect((err) => {
    if (err) {
        console.error('❌ 데이터베이스 연결 실패:', err);
        return;
    }
    console.log('✅ 데이터베이스 창고 연결 성공!');
});

// 📌 [1] 메인 화면 직통 통로
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 📌 [2] 회원가입 화면 직통 통로
app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// 📌 [3] 로그인 화면 직통 통로
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 📌 [4] 마을 HUB 거점 신청 받는 곳
app.post('/api/hub-apply', (req, res) => {
    const { hub_name, hub_type, hub_address, hub_desc, hub_image } = req.body;

    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS hub_applications_v2 (
            id INT AUTO_INCREMENT PRIMARY KEY,
            hub_name VARCHAR(255) NOT NULL,
            hub_type VARCHAR(100) NOT NULL,
            hub_address VARCHAR(500) NOT NULL,
            hub_desc TEXT,
            hub_image LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    db.query(createTableQuery, (err) => {
        if (err) {
            console.error('테이블 생성 에러:', err);
            return res.status(500).json({ success: false, message: 'DB 준비 중 오류가 발생했습니다.' });
        }

        const insertQuery = `INSERT INTO hub_applications_v2 (hub_name, hub_type, hub_address, hub_desc, hub_image) VALUES (?, ?, ?, ?, ?)`;
        
        db.query(insertQuery, [hub_name, hub_type, hub_address, hub_desc, hub_image], (err, result) => {
            if (err) {
                console.error('신청서 저장 에러:', err);
                return res.status(500).json({ success: false, message: '저장 중 오류가 발생했습니다.' });
            }
            res.json({ success: true, message: '성공적으로 접수되었습니다! 팜마을 HUB가 되어주셔서 감사합니다.' });
        });
    });
});

// 📌 [5] 전체 마을 HUB 목록 보내주기
app.get('/api/hubs', (req, res) => {
    const selectQuery = `SELECT * FROM hub_applications_v2 ORDER BY created_at DESC`;
    db.query(selectQuery, (err, results) => {
        if (err) {
            console.error('목록 불러오기 에러:', err);
            return res.status(500).json({ success: false, message: '데이터를 불러오는 중 오류가 발생했습니다.' });
        }
        res.json({ success: true, data: results });
    });
});

// 📌 [6] 개별 마을 HUB 상세 정보 꺼내주기
app.get('/api/hubs/:id', (req, res) => {
    const hubId = req.params.id;
    const selectOneQuery = `SELECT * FROM hub_applications_v2 WHERE id = ?`;
    
    db.query(selectOneQuery, [hubId], (err, result) => {
        if (err) {
            console.error('상세페이지 조회 에러:', err);
            return res.status(500).json({ success: false, message: '데이터를 불러오는 중 오류가 발생했습니다.' });
        }
        if (result.length === 0) {
            return res.status(404).json({ success: false, message: '해당 HUB 거점을 찾을 수 없습니다.' });
        }
        res.json({ success: true, data: result[0] });
    });
});

// 📌 [7] ★ 카카오 로그인 회원 처리 수신함 (새로 추가된 부분!) ★
app.get('/auth/kakao/callback', async (req, res) => {
    const authCode = req.query.code; 
    
    // 🚨 아래 작은따옴표 안의 글자를 지우고, 이사장님의 카카오 REST API 키를 넣어주세요!
    const KAKAO_REST_API_KEY = 'e2676a110b5565e56d2863dd7a9581c8'; 
    const REDIRECT_URI = 'https://farmmaul.com/auth/kakao/callback'; 

    if (!authCode) return res.send("<script>alert('인증 코드가 없습니다.'); location.href='/';</script>");

    try {
        const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
            body: `grant_type=authorization_code&client_id=${KAKAO_REST_API_KEY}&redirect_uri=${REDIRECT_URI}&code=${authCode}`
        });
        const tokenData = await tokenResponse.json();

        const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const userData = await userResponse.json();

        const kakaoId = userData.id;
        const nickname = userData.kakao_account?.profile?.nickname || '팜마을 회원';
        const email = userData.kakao_account?.email || '';

        const createMemberTable = `
            CREATE TABLE IF NOT EXISTS farm_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                kakao_id BIGINT UNIQUE NOT NULL,
                nickname VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        db.query(createMemberTable, (err) => {
            if (err) throw err;

            const insertMember = `INSERT INTO farm_members (kakao_id, nickname, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE nickname=?`;
            db.query(insertMember, [kakaoId, nickname, email, nickname], (err) => {
                if (err) throw err;
                
                res.send(`<script>alert('${nickname}님, 반갑습니다! 팜마을 로그인에 성공했습니다 🎉'); location.href='/';</script>`);
            });
        });

    } catch (error) {
        console.error('카카오 인증 실패:', error);
        res.send("<script>alert('카카오 로그인 중 오류가 발생했습니다.'); location.href='/';</script>");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 팜마을 서버가 ${PORT}번 방에서 힘차게 달리고 있습니다!`);
});
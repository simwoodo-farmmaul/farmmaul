require('./setup.js'); // 👈 서버가 켜질 때 도면(setup.js)을 자동으로 실행하는 마법의 주문!
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// 💡 화면에서 보내는 데이터를 서버가 읽을 수 있도록 번역기 장착!
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🌟 클라우드 환경에 맞춰 더 튼튼하게 보강된 마법의 열쇠! (모든 파일 접근 허가)
app.use(express.static(path.join(__dirname)));

// 클라우드타입 내부 데이터베이스 연결 설정
const db = mysql.createConnection({
    host: 'farm-db3', // 우리가 새로 지은 든든한 창고 이름
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

// 📌 [2] 회원가입 화면 직통 통로 (확실하게 문 열어주기!)
app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// 📌 [3] 로그인 화면 직통 통로 (확실하게 문 열어주기!)
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});
// 📌 [4] 마을 HUB 거점 신청 받는 곳 (데이터베이스 저장)
app.post('/api/hub-apply', (req, res) => {
    // 화면에서 보낸 이름, 종류, 주소 데이터를 꺼냅니다.
    const { hub_name, hub_type, hub_address } = req.body;

    // 1. 혹시 창고에 서랍(테이블)이 없을까 봐, 튼튼한 서랍부터 만듭니다.
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS hub_applications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            hub_name VARCHAR(255) NOT NULL,
            hub_type VARCHAR(100) NOT NULL,
            hub_address VARCHAR(500) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    db.query(createTableQuery, (err) => {
        if (err) {
            console.error('테이블 생성 에러:', err);
            return res.status(500).json({ success: false, message: 'DB 준비 중 오류가 발생했습니다.' });
        }

        // 2. 서랍이 준비되었으니, 입력받은 데이터를 안전하게 쏙 넣습니다!
        const insertQuery = `INSERT INTO hub_applications (hub_name, hub_type, hub_address) VALUES (?, ?, ?)`;
        
        db.query(insertQuery, [hub_name, hub_type, hub_address], (err, result) => {
            if (err) {
                console.error('신청서 저장 에러:', err);
                return res.status(500).json({ success: false, message: '저장 중 오류가 발생했습니다.' });
            }
            
            // 3. 저장이 완료되면 화면에 성공했다고 기쁜 소식을 알려줍니다!
            res.json({ success: true, message: '성공적으로 접수되었습니다! 팜마을 HUB가 되어주셔서 감사합니다.' });
        });
    });
});
// 📌 [5] 관리자 페이지에 마을 HUB 목록 보내주기 (데이터 조회)
app.get('/api/hubs', (req, res) => {
    // 창고(hub_applications 테이블)에서 신청 목록을 최신순으로 전부 꺼냅니다.
    const selectQuery = `SELECT * FROM hub_applications ORDER BY created_at DESC`;
    
    db.query(selectQuery, (err, results) => {
        if (err) {
            console.error('목록 불러오기 에러:', err);
            return res.status(500).json({ success: false, message: '데이터를 불러오는 중 오류가 발생했습니다.' });
        }
        // 꺼낸 데이터를 화면으로 예쁘게 포장해서 보냅니다!
        res.json({ success: true, data: results });
    });
});
// 클라우드 서버가 지정해 주는 방 번호(포트) 또는 3000번 방에서 대기 시작!
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 팜마을 서버가 ${PORT}번 방에서 힘차게 달리고 있습니다!`);
});
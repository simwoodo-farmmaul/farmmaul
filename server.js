const session = require('express-session');
require('./setup.js'); 
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(session({
    secret: 'farmmaul_secret_key_0424',
    resave: false,                      
    saveUninitialized: true,           
    cookie: { secure: false }   
}));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

const db = mysql.createConnection({
    host: 'farm-db3', port: 3306, user: 'root', password: 'Farmmaul1234!', database: 'farmmaul_db'
});

db.connect((err) => {
    if (err) { console.error('❌ DB 연결 실패:', err); return; }
    console.log('✅ 데이터베이스 창고 연결 성공!');
    // 🌟 기존 테이블이 있다면 '조회수(views)' 기둥을 안전하게 몰래 추가합니다.
    db.query(`ALTER TABLE farm_board ADD COLUMN views INT DEFAULT 0`, () => {}); 
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

app.post('/api/hub-apply', (req, res) => {
    const { hub_name, hub_type, hub_address, hub_desc, hub_image } = req.body;
    const createTableQuery = `CREATE TABLE IF NOT EXISTS hub_applications_v2 (id INT AUTO_INCREMENT PRIMARY KEY, hub_name VARCHAR(255) NOT NULL, hub_type VARCHAR(100) NOT NULL, hub_address VARCHAR(500) NOT NULL, hub_desc TEXT, hub_image LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    db.query(createTableQuery, (err) => {
        const insertQuery = `INSERT INTO hub_applications_v2 (hub_name, hub_type, hub_address, hub_desc, hub_image) VALUES (?, ?, ?, ?, ?)`;
        db.query(insertQuery, [hub_name, hub_type, hub_address, hub_desc, hub_image], (err, result) => {
            res.json({ success: true, message: '성공적으로 접수되었습니다!' });
        });
    });
});

app.get('/api/hubs', (req, res) => {
    db.query(`SELECT * FROM hub_applications_v2 ORDER BY created_at DESC`, (err, results) => {
        res.json({ success: true, data: results });
    });
});

app.get('/api/hubs/:id', (req, res) => {
    db.query(`SELECT * FROM hub_applications_v2 WHERE id = ?`, [req.params.id], (err, result) => {
        res.json({ success: true, data: result[0] });
    });
});

app.get('/auth/kakao/callback', async (req, res) => {
    const authCode = req.query.code; 
    const KAKAO_REST_API_KEY = 'e2676a110b5565e56d2863dd7a9581c8'; 
    const REDIRECT_URI = 'https://farmmaul.com/auth/kakao/callback'; 
    if (!authCode) return res.send("<script>alert('인증 코드가 없습니다.'); location.href='/';</script>");

    try {
        const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, body: `grant_type=authorization_code&client_id=${KAKAO_REST_API_KEY}&redirect_uri=${REDIRECT_URI}&code=${authCode}` });
        const tokenData = await tokenResponse.json();
        const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
        const userData = await userResponse.json();

        const kakaoId = userData.id;
        const nickname = userData.kakao_account?.profile?.nickname || '팜마을 회원';
        const email = userData.kakao_account?.email || '';

        db.query(`CREATE TABLE IF NOT EXISTS farm_members (id INT AUTO_INCREMENT PRIMARY KEY, kakao_id BIGINT UNIQUE NOT NULL, nickname VARCHAR(100) NOT NULL, email VARCHAR(100), joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
            db.query(`INSERT INTO farm_members (kakao_id, nickname, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE nickname=?`, [kakaoId, nickname, email, nickname], () => {
                req.session.user = { kakaoId: kakaoId, nickname: nickname };
                res.send(`<script>alert('${nickname}님, 반갑습니다!'); location.href='/';</script>`);
            });
        });
    } catch (error) { res.send("<script>alert('로그인 오류'); location.href='/';</script>"); }
});

app.get('/api/user', (req, res) => {
    if (req.session && req.session.user) res.json({ loggedIn: true, user: req.session.user });
    else res.json({ loggedIn: false });
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.send("<script>alert('로그아웃되었습니다.'); location.href='/';</script>"));
});

// 📌 잔디밭 글 저장
app.post('/api/board', (req, res) => {
    const { title, content, youtube_url, images } = req.body;
    const nickname = (req.session && req.session.user) ? req.session.user.nickname : '익명 주민';
    // 🌟 views 컬럼 포함하여 테이블 생성
    db.query(`CREATE TABLE IF NOT EXISTS farm_board (id INT AUTO_INCREMENT PRIMARY KEY, nickname VARCHAR(100) NOT NULL, title VARCHAR(255) NOT NULL, content TEXT NOT NULL, youtube_url VARCHAR(500), images LONGTEXT, views INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
        db.query(`INSERT INTO farm_board (nickname, title, content, youtube_url, images) VALUES (?, ?, ?, ?, ?)`, [nickname, title, content, youtube_url, JSON.stringify(images || [])], () => {
            res.json({ success: true, message: '글이 성공적으로 등록되었습니다!' });
        });
    });
});

// 📌 잔디밭 목록 보기 (조회수 포함)
app.get('/api/board', (req, res) => {
    db.query(`SELECT id, nickname, title, youtube_url, images, views, created_at FROM farm_board ORDER BY created_at DESC`, (err, results) => {
        if(err) return res.json({ success: true, data: [] });
        res.json({ success: true, data: results });
    });
});

// 📌 잔디밭 상세 보기 (조회수 증가 + 현재 로그인 유저 정보 전달)
app.get('/api/board/:id', (req, res) => {
    const postId = req.params.id;
    // 🌟 1. 글을 열면 먼저 조회수(views)를 1 올립니다.
    db.query(`UPDATE farm_board SET views = views + 1 WHERE id = ?`, [postId], () => {
        // 🌟 2. 그 다음 글 정보를 꺼내서 화면에 보냅니다.
        db.query(`SELECT * FROM farm_board WHERE id = ?`, [postId], (err, result) => {
            if (result.length === 0) return res.status(404).json({ success: false });
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            res.json({ success: true, data: result[0], currentUser: currentUser });
        });
    });
});

// 📌 잔디밭 글 수정하기 (NEW)
app.put('/api/board/:id', (req, res) => {
    const postId = req.params.id;
    const { title, content, youtube_url, images } = req.body;
    const nickname = (req.session && req.session.user) ? req.session.user.nickname : '익명 주민';
    
    db.query(`UPDATE farm_board SET title=?, content=?, youtube_url=?, images=? WHERE id=? AND nickname=?`, 
    [title, content, youtube_url, JSON.stringify(images || []), postId, nickname], (err, result) => {
         if(result.affectedRows === 0) return res.status(403).json({ success: false, message: '수정 권한이 없습니다.'});
         res.json({ success: true, message: '글이 성공적으로 수정되었습니다!' });
    });
});

// 📌 잔디밭 글 삭제하기 (NEW)
app.delete('/api/board/:id', (req, res) => {
    const postId = req.params.id;
    const nickname = (req.session && req.session.user) ? req.session.user.nickname : '익명 주민';
    
    db.query(`DELETE FROM farm_board WHERE id=? AND nickname=?`, [postId, nickname], (err, result) => {
         if(result.affectedRows === 0) return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.'});
         res.json({ success: true, message: '글이 안전하게 삭제되었습니다.' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 팜마을 서버가 ${PORT}번 방에서 달리고 있습니다!`));
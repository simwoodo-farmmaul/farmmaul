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

// 🌟 접속자가 없어도 DB 금고가 수면 상태로 빠지지 않도록 'createPool' 적용 완료
const db = mysql.createPool({
    host: 'localhost', 
    port: 3306, 
    user: 'root', 
    password: 'Farmmaul1234!', 
    database: 'farmmaul_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.query(`ALTER TABLE farm_board ADD COLUMN views INT DEFAULT 0`, () => {}); 
const createEmailMembersTable = `
    CREATE TABLE IF NOT EXISTS farm_email_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;
db.query(createEmailMembersTable, () => {});
console.log('✅ 데이터베이스 창고 무중단 풀(Pool) 연결 성공!');

const adminNames = ['김영진', '김영진(지산)', '지산']; 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/join.html', (req, res) => res.sendFile(path.join(__dirname, 'join.html')));

app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    db.query('SELECT * FROM farm_email_users WHERE email = ?', [email], (err, results) => {
        if (results && results.length > 0) return res.status(400).json({ success: false, message: '이미 가입된 이메일 주소입니다.' });
        db.query('INSERT INTO farm_email_users (name, email, password) VALUES (?, ?, ?)', [name, email, password], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: '가입 처리 중 데이터베이스 오류가 발생했습니다.' });
            res.json({ success: true, message: '팜마을 회원가입이 성공적으로 완료되었습니다! 🎉' });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM farm_email_users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: '로그인 처리 중 오류 발생' });
        if (results && results.length > 0) {
            req.session.user = { kakaoId: null, nickname: results[0].name, email: results[0].email };
            res.json({ success: true, message: `${results[0].name}님, 반갑습니다!` });
        } else {
            res.status(412).json({ success: false, message: '이메일 주소 또는 비밀번호가 일치하지 않습니다.' });
        }
    });
});

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
    const REDIRECT_URI = 'https://farmaul.com/auth/kakao/callback'; 
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

app.post('/api/board', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요한 서비스입니다.' });
    const { title, content, youtube_url, images } = req.body;
    const nickname = req.session.user.nickname;
    db.query(`CREATE TABLE IF NOT EXISTS farm_board (id INT AUTO_INCREMENT PRIMARY KEY, nickname VARCHAR(100) NOT NULL, title VARCHAR(255) NOT NULL, content TEXT NOT NULL, youtube_url VARCHAR(500), images LONGTEXT, views INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
        db.query(`INSERT INTO farm_board (nickname, title, content, youtube_url, images) VALUES (?, ?, ?, ?, ?)`, [nickname, title, content, youtube_url, JSON.stringify(images || [])], () => {
            res.json({ success: true, message: '글이 성공적으로 등록되었습니다!' });
        });
    });
});

app.get('/api/board', (req, res) => {
    db.query(`SELECT id, nickname, title, youtube_url, images, views, created_at FROM farm_board ORDER BY created_at DESC`, (err, results) => {
        if(err) return res.json({ success: true, data: [] });
        res.json({ success: true, data: results });
    });
});

app.get('/api/board/:id', (req, res) => {
    const postId = req.params.id;
    db.query(`UPDATE farm_board SET views = views + 1 WHERE id = ?`, [postId], () => {
        db.query(`SELECT * FROM farm_board WHERE id = ?`, [postId], (err, result) => {
            if (result.length === 0) return res.status(404).json({ success: false });
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            const isAdmin = adminNames.includes(currentUser); 
            res.json({ success: true, data: result[0], currentUser: currentUser, isAdmin: isAdmin });
        });
    });
});

app.put('/api/board/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '권한이 없습니다.'});
    const postId = req.params.id;
    const { title, content, youtube_url, images } = req.body;
    const nickname = req.session.user.nickname;
    db.query(`UPDATE farm_board SET title=?, content=?, youtube_url=?, images=? WHERE id=? AND nickname=?`, 
    [title, content, youtube_url, JSON.stringify(images || []), postId, nickname], (err, result) => {
         if(result.affectedRows === 0) return res.status(403).json({ success: false, message: '수정 권한이 없습니다.'});
         res.json({ success: true, message: '글이 성공적으로 수정되었습니다!' });
    });
});

app.delete('/api/board/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.'});
    const postId = req.params.id;
    const nickname = req.session.user.nickname;
    const isAdmin = adminNames.includes(nickname);
    if (isAdmin) {
        db.query(`DELETE FROM farm_board WHERE id=?`, [postId], (err, result) => {
            res.json({ success: true, message: '관리자 권한으로 글을 삭제했습니다.' });
        });
    } else {
        db.query(`DELETE FROM farm_board WHERE id=? AND nickname=?`, [postId, nickname], (err, result) => {
             if(result.affectedRows === 0) return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.'});
             res.json({ success: true, message: '글이 안전하게 삭제되었습니다.' });
        });
    }
});

// ==========================================
// 🌟 [상품 등록 창구] 화면에서 보낸 데이터를 DB에 저장 (사진 포함)
// ==========================================
app.post('/api/products', (req, res) => {
    const { farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize, certs, image, delivery, tags, contentData } = req.body;
    
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            farm_name VARCHAR(255),
            category VARCHAR(100),
            title VARCHAR(255) NOT NULL,
            org_price INT DEFAULT 0,
            sale_price INT DEFAULT 0,
            p_date VARCHAR(50),
            p_grade VARCHAR(50),
            p_size VARCHAR(50),
            certs VARCHAR(255),
            image LONGTEXT,
            delivery VARCHAR(255) DEFAULT '방문수거',
            tags VARCHAR(255),
            content_data LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, (err) => {
        db.query(`ALTER TABLE farm_products ADD COLUMN delivery VARCHAR(255) DEFAULT '방문수거'`, () => {
            db.query(`ALTER TABLE farm_products ADD COLUMN tags VARCHAR(255)`, () => {
                db.query(`ALTER TABLE farm_products ADD COLUMN content_data LONGTEXT`, () => {
                    db.query(`ALTER TABLE farm_products ADD COLUMN p_size VARCHAR(50)`, () => {
                        db.query(`ALTER TABLE farm_products ADD COLUMN certs VARCHAR(255)`, () => {
                            const insertQuery = `
                                INSERT INTO farm_products 
                                (farm_name, category, title, org_price, sale_price, p_date, p_grade, p_size, certs, image, delivery, tags, content_data) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `;
                                    
                            db.query(insertQuery, [farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize || '', certs || '', image, delivery || '방문수거', tags || '', contentData || '[]'], (insertErr, result) => {
                                if (insertErr) return res.status(500).json({ success: false, message: 'DB 저장 중 오류가 발생했습니다.' });
                                res.json({ success: true, message: '상품 등록 완료!' });
                            });
                        });
                    });
                });
            });
        });
    });
});
// ==========================================
// 🌟 [상품 목록 조회 창구] 
// ==========================================
app.get('/api/products', (req, res) => {
    db.query(`SELECT * FROM farm_products ORDER BY created_at DESC`, (err, results) => {
        if(err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});

// ==========================================
// 🌟 [상품 상세 조회 창구]
// ==========================================
app.get('/api/products/:id', (req, res) => {
    db.query(`SELECT * FROM farm_products WHERE id = ?`, [req.params.id], (err, result) => {
        if(err) return res.status(500).json({ success: false });
        if(result.length > 0) res.json({ success: true, data: result[0] });
        else res.json({ success: false, message: '상품을 찾을 수 없습니다.' });
    });
});

// ==========================================
// 🌟 [상품 수정 창구] 
// ==========================================
app.put('/api/products/:id', (req, res) => {
    const { farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize, certs, image, delivery, tags, contentData } = req.body;
    
    db.query(`ALTER TABLE farm_products ADD COLUMN delivery VARCHAR(255) DEFAULT '방문수거'`, () => {
        db.query(`ALTER TABLE farm_products ADD COLUMN tags VARCHAR(255)`, () => {
            db.query(`ALTER TABLE farm_products ADD COLUMN content_data LONGTEXT`, () => {
                db.query(`ALTER TABLE farm_products ADD COLUMN p_size VARCHAR(50)`, () => {
                    db.query(`ALTER TABLE farm_products ADD COLUMN certs VARCHAR(255)`, () => {
                        const updateQuery = `
                            UPDATE farm_products 
                            SET farm_name=?, category=?, title=?, org_price=?, sale_price=?, p_date=?, p_grade=?, p_size=?, certs=?, image=?, delivery=?, tags=?, content_data=? 
                            WHERE id=?
                        `;
                        db.query(updateQuery, [farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize || '', certs || '', image, delivery || '방문수거', tags || '', contentData || '[]', req.params.id], (err, result) => {
                            if (err) return res.status(500).json({ success: false, message: '수정 중 오류가 발생했습니다.' });
                            res.json({ success: true, message: '상품이 성공적으로 수정되었습니다!' });
                        });
                    });
                });
            });
        });
    });
});

// ==========================================
// 🌟 [상품 삭제 창구]
// ==========================================
app.delete('/api/products/:id', (req, res) => {
    db.query(`DELETE FROM farm_products WHERE id = ?`, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: '삭제 중 오류가 발생했습니다.' });
        res.json({ success: true, message: '상품이 안전하게 삭제되었습니다.' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 팜마을 서버가 ${PORT}번 방에서 달리고 있습니다!`));

// ==========================================
// [팜마을 관리자] 회사소개 및 약관 API
// ==========================================
app.get('/api/policy/:section', (req, res) => {
    db.query("SELECT content FROM farm_policy WHERE section_name = ?", [req.params.section], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        if (results.length > 0) res.json({ success: true, content: results[0].content });
        else res.json({ success: false }); 
    });
});

app.post('/api/policy', (req, res) => {
    const { section, content } = req.body;
    const query = `INSERT INTO farm_policy (section_name, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = ?`;
    db.query(query, [section, content, content], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});
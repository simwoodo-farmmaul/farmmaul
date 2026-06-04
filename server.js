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
// 🌟 [상품 등록 창구] 세션 기반 소유권(owner_nickname) 추가 및 로그인 보호
// ==========================================
app.post('/api/products', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요한 서비스입니다.' });
    }
    const ownerNickname = req.session.user.nickname;
    const { farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize, certs, image, delivery, tags, contentData, faqsData } = req.body;
    
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner_nickname VARCHAR(100),
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
            faqs LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, (err) => {
        db.query(`ALTER TABLE farm_products ADD COLUMN owner_nickname VARCHAR(100)`, () => {
            db.query(`ALTER TABLE farm_products ADD COLUMN delivery VARCHAR(255) DEFAULT '방문수거'`, () => {
                db.query(`ALTER TABLE farm_products ADD COLUMN tags VARCHAR(255)`, () => {
                    db.query(`ALTER TABLE farm_products ADD COLUMN content_data LONGTEXT`, () => {
                        db.query(`ALTER TABLE farm_products ADD COLUMN p_size VARCHAR(50)`, () => {
                            db.query(`ALTER TABLE farm_products ADD COLUMN certs VARCHAR(255)`, () => {
                                db.query(`ALTER TABLE farm_products ADD COLUMN faqs LONGTEXT`, () => {
                                    const insertQuery = `
                                        INSERT INTO farm_products 
                                        (owner_nickname, farm_name, category, title, org_price, sale_price, p_date, p_grade, p_size, certs, image, delivery, tags, content_data, faqs) 
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    `;
                                            
                                    db.query(insertQuery, [ownerNickname, farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize || '', certs || '', image, delivery || '방문수거', tags || '', contentData || '[]', faqsData || '[]'], (insertErr, result) => {
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
// 🌟 [상품 상세 조회 창구] 현재 접속자 세션 판별 데이터 함께 반환
// ==========================================
app.get('/api/products/:id', (req, res) => {
    db.query(`SELECT * FROM farm_products WHERE id = ?`, [req.params.id], (err, result) => {
        if(err) return res.status(500).json({ success: false });
        if(result.length > 0) {
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            const isAdmin = adminNames.includes(currentUser); 
            res.json({ success: true, data: result[0], currentUser: currentUser, isAdmin: isAdmin });
        } else {
            res.json({ success: false, message: '상품을 찾을 수 없습니다.' });
        }
    });
});

// ==========================================
// 🌟 [상품 수정 창구] 본인 소유권 철저 검증 (관리자 예외 허용)
// ==========================================
app.put('/api/products/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const nickname = req.session.user.nickname;
    const isAdmin = adminNames.includes(nickname);
    const { farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize, certs, image, delivery, tags, contentData, faqsData } = req.body;
    
    db.query(`SELECT owner_nickname FROM farm_products WHERE id = ?`, [req.params.id], (err, rows) => {
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
        
        // 본인이 등록한 상품이 아니면서 최고관리자도 아니면 차단
        if (rows[0].owner_nickname !== nickname && !isAdmin) {
            return res.status(403).json({ success: false, message: '본인이 등록한 상품만 수정할 수 있습니다.' });
        }

        db.query(`ALTER TABLE farm_products ADD COLUMN delivery VARCHAR(255) DEFAULT '방문수거'`, () => {
            db.query(`ALTER TABLE farm_products ADD COLUMN tags VARCHAR(255)`, () => {
                db.query(`ALTER TABLE farm_products ADD COLUMN content_data LONGTEXT`, () => {
                    db.query(`ALTER TABLE farm_products ADD COLUMN p_size VARCHAR(50)`, () => {
                        db.query(`ALTER TABLE farm_products ADD COLUMN certs VARCHAR(255)`, () => {
                            db.query(`ALTER TABLE farm_products ADD COLUMN faqs LONGTEXT`, () => {
                                const updateQuery = `
                                    UPDATE farm_products 
                                    SET farm_name=?, category=?, title=?, org_price=?, sale_price=?, p_date=?, p_grade=?, p_size=?, certs=?, image=?, delivery=?, tags=?, content_data=?, faqs=? 
                                    WHERE id=?
                                `;
                                db.query(updateQuery, [farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize || '', certs || '', image, delivery || '방문수거', tags || '', contentData || '[]', faqsData || '[]', req.params.id], (err, result) => {
                                    if (err) return res.status(500).json({ success: false, message: '수정 중 오류가 발생했습니다.' });
                                    res.json({ success: true, message: '상품이 성공적으로 수정되었습니다!' });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ==========================================
// 🌟 [상품 삭제 창구] 본인 소유권 철저 검증 (관리자 예외 허용)
// ==========================================
app.delete('/api/products/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const nickname = req.session.user.nickname;
    const isAdmin = adminNames.includes(nickname);

    db.query(`SELECT owner_nickname FROM farm_products WHERE id = ?`, [req.params.id], (err, rows) => {
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
        
        // 본인이 등록한 상품이 아니면서 최고관리자도 아니면 차단
        if (rows[0].owner_nickname !== nickname && !isAdmin) {
            return res.status(403).json({ success: false, message: '본인이 등록한 상품만 삭제할 수 있습니다.' });
        }

        db.query(`DELETE FROM farm_products WHERE id = ?`, [req.params.id], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: '삭제 중 오류가 발생했습니다.' });
            res.json({ success: true, message: '상품이 안전하게 삭제되었습니다.' });
        });
    });
});

// ==========================================
// 🌟 [추가] 1:1 문의(채팅) 저장 및 조회 API
// ==========================================

// 1. 채팅 메시지 전송 및 저장
app.post('/api/chat', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    
    const sender = req.session.user.nickname;
    const { receiver, message } = req.body;
    
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_chats (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sender VARCHAR(100) NOT NULL,
            receiver VARCHAR(100) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, (err) => {
        const insertQuery = `INSERT INTO farm_chats (sender, receiver, message) VALUES (?, ?, ?)`;
        // 생산자가 답변할 때나 고객이 문의할 때 모두 저장됨
        db.query(insertQuery, [sender, receiver || '지산동 영진농원', message], (err, result) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, message: '전송 완료' });
        });
    });
});

// 2. 관리자용: 고객별 최신 1:1 문의 목록 불러오기
app.get('/api/admin/chats', (req, res) => {
    const adminList = "('김영진', '김영진(지산)', '지산', '관리자')";
    
    // 관리자가 아닌 고객(발신자) 기준으로 가장 최근에 보낸 메시지를 그룹화하여 불러옵니다.
    const query = `
        SELECT c1.* FROM farm_chats c1
        INNER JOIN (
            SELECT sender, MAX(created_at) as max_time 
            FROM farm_chats 
            WHERE sender NOT IN ${adminList}
            GROUP BY sender
        ) c2 ON c1.sender = c2.sender AND c1.created_at = c2.max_time
        ORDER BY c1.created_at DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});

// 3. 특정 고객과의 1:1 전체 대화 내역 불러오기
app.get('/api/chat/history/:targetUser', (req, res) => {
    const targetUser = req.params.targetUser;
    const query = `
        SELECT * FROM farm_chats 
        WHERE sender = ? OR receiver = ? 
        ORDER BY created_at ASC
    `;
    db.query(query, [targetUser, targetUser], (err, results) => {
        if (err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});
// ==========================================
// 🌟 [추가] 비회원도 가능한 AI 고객센터 문의 저장 API
// ==========================================
app.post('/api/ai-chat', (req, res) => {
    const { productId, message } = req.body;
    
    // 비회원의 AI 문의를 따로 저장하는 전용 테이블 생성
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_ai_inquiries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            product_id VARCHAR(50),
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, (err) => {
        const insertQuery = `INSERT INTO farm_ai_inquiries (product_id, message) VALUES (?, ?)`;
        db.query(insertQuery, [productId || '알수없음', message], (err, result) => {
            if (err) return res.status(500).json({ success: false });
            
            // DB에 성공적으로 등록되면 AI가 화면에 띄워줄 자동 응답을 보냅니다.
            res.json({ 
                success: true, 
                reply: "질문이 성공적으로 등록되었습니다! 🌿<br>현재 AI 상담원이 학습 중이므로, 남겨주신 소중한 문의는 농장 생산자님께 바로 전달해 드리겠습니다." 
            });
        });
    });
});
const PORT = process.env.PORT || 3000;
// ==========================================
// 🌟 [추가] 관리자용: AI 고객센터 문의 내역 불러오기 API
// ==========================================
app.get('/api/admin/ai-inquiries', (req, res) => {
    // farm_ai_inquiries 테이블과 farm_products 테이블을 연결(JOIN)하여 
    // 어떤 상품에 대한 문의인지 제목과 농장 이름을 함께 가져옵니다.
    const query = `
        SELECT a.id, a.message, a.created_at, p.title, p.farm_name, p.owner_nickname 
        FROM farm_ai_inquiries a
        LEFT JOIN farm_products p ON a.product_id = p.id
        ORDER BY a.created_at DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});
// ==========================================
// 🌟 [추가] 생산자(농장) 등록 및 조회 API
// ==========================================
    app.post('/api/producers', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    
    const ownerNickname = req.session.user.nickname;
    const { farm_name, farm_short, farm_desc, profile_image, cover_image, bank_name, account_num } = req.body;
    
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_producers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner_nickname VARCHAR(100),
            farm_name VARCHAR(255) NOT NULL,
            farm_short VARCHAR(255) NOT NULL,
            farm_desc TEXT,
            profile_image LONGTEXT,
            cover_image LONGTEXT,
            bank_name VARCHAR(100),
            account_num VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, (err) => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN owner_nickname VARCHAR(100)`, () => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN farm_name VARCHAR(255)`, () => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN farm_short VARCHAR(255)`, () => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN farm_desc TEXT`, () => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN profile_image LONGTEXT`, () => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN cover_image LONGTEXT`, () => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN bank_name VARCHAR(100)`, () => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN account_num VARCHAR(100)`, () => {
        // ✨ 아래 1줄이 새롭게 추가된 핵심 코드입니다! (생성일자 누락 방지)
        db.query(`ALTER TABLE farm_producers ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, () => {
            
            const insertQuery = `INSERT INTO farm_producers (owner_nickname, farm_name, farm_short, farm_desc, profile_image, cover_image, bank_name, account_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            db.query(insertQuery, [ownerNickname, farm_name, farm_short, farm_desc, profile_image || '', cover_image || '', bank_name || '', account_num || ''], (err, result) => {
                if (err) {
                    console.error("생산자 등록 에러 로그:", err);
                    return res.status(500).json({ success: false, message: 'DB 저장 중 오류가 발생했습니다.' });
                }
                res.json({ success: true, message: '생산자 등록 완료!' });
            });
            
        }); }); }); }); }); }); }); }); }); // 👈 ALTER TABLE 닫는 괄호가 9개로 늘어났습니다.
    });
});

app.get('/api/producers', (req, res) => {
    // 임시 테이블 생성 코드를 제거하고 바로 조회만 하도록 수정합니다.
    db.query(`SELECT * FROM farm_producers ORDER BY created_at DESC`, (err, results) => {
        // 테이블이 아직 없어서 에러가 나더라도 화면이 깨지지 않게 빈 데이터를 보냅니다.
        if(err) return res.json({ success: true, data: [] }); 
        res.json({ success: true, data: results });
    });
});

app.get('/api/producers/:id', (req, res) => {
    db.query(`SELECT * FROM farm_producers WHERE id = ?`, [req.params.id], (err, result) => {
        if(err || result.length === 0) return res.status(404).json({ success: false, message: '생산자를 찾을 수 없습니다.' });
        res.json({ success: true, data: result[0] });
    });
});
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
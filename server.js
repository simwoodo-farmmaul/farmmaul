const express = require('express');
const session = require('express-session');  // 🌟 이 줄이 지워져서 난 에러입니다! 다시 꼭 넣어주세요!
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
    password: 'ALfmrqnf1020@', 
    database: 'farmaul_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const createEmailMembersTable = `
    CREATE TABLE IF NOT EXISTS farm_email_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20), /* 🌟 휴대폰 번호 저장 칸 추가 */
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;
db.query(createEmailMembersTable, () => {
    // 이미 테이블이 만들어져 있는 경우를 대비해 phone 칸을 강제로 추가하는 안전 코드
    db.query(`ALTER TABLE farm_email_users ADD COLUMN phone VARCHAR(20)`, () => {});
});

// 카카오 가입자 테이블도 미리 생성 (에러 방지용)
db.query(`CREATE TABLE IF NOT EXISTS farm_members (id INT AUTO_INCREMENT PRIMARY KEY, kakao_id BIGINT UNIQUE NOT NULL, nickname VARCHAR(100) NOT NULL, email VARCHAR(100), joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {});

console.log('✅ 데이터베이스 창고 무중단 풀(Pool) 연결 성공!');

// ==========================================
// 🌟 [수정] 관리자 권한 동적 할당 및 다중 권한 시스템
// ==========================================
let adminList = {}; // 메모리에서 빠르게 관리자 권한을 확인하기 위한 저장소

// 관리자 테이블 생성 및 초기 최고 관리자 셋팅
db.query(`CREATE TABLE IF NOT EXISTS farm_admins (email VARCHAR(100) PRIMARY KEY, role VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
    // 서버가 켜질 때 '대표님 계정'은 무조건 최고관리자(super)로 고정 삽입
    db.query(`INSERT IGNORE INTO farm_admins (email, role) VALUES ('greenpic@naver.com', 'super'), ('simwoodo@naver.com', 'super')`, () => {
        db.query(`SELECT email, role FROM farm_admins`, (err, rows) => {
            if (rows) { rows.forEach(r => adminList[r.email] = r.role); }
        });
    });
});

// 일반 관리자(부관리자 포함) 권한 확인
function checkIsAdmin(user) {
    if (!user) return false;
    return adminList[user.email] !== undefined; 
}

// 오직 최고 관리자(super)인지 확인
function checkIsSuperAdmin(user) {
    if (!user) return false;
    return adminList[user.email] === 'super';
}

// ------------------------------------------
// 🛠️ 운영진(부관리자) 권한 부여 API 추가 (server.js 하단 아무곳에 추가해도 무방합니다)
// ------------------------------------------
app.get('/api/admin/managers', (req, res) => {
    if (!checkIsAdmin(req.session?.user)) return res.status(403).json({ success: false });
    db.query(`SELECT * FROM farm_admins ORDER BY created_at DESC`, (err, results) => {
        res.json({ success: true, data: results, isSuper: checkIsSuperAdmin(req.session.user), currentUser: req.session.user.email });
    });
});

app.post('/api/admin/managers', (req, res) => {
    if (!checkIsSuperAdmin(req.session?.user)) return res.status(403).json({ success: false, message: '최고 관리자만 권한을 부여할 수 있습니다.' });
    const { email } = req.body;
    db.query(`INSERT INTO farm_admins (email, role) VALUES (?, 'manager') ON DUPLICATE KEY UPDATE role='manager'`, [email], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'DB 오류' });
        adminList[email] = 'manager'; // 즉시 메모리에 반영
        res.json({ success: true, message: '해당 회원에게 부관리자 권한이 성공적으로 부여되었습니다.' });
    });
});

app.delete('/api/admin/managers/:email', (req, res) => {
    if (!checkIsSuperAdmin(req.session?.user)) return res.status(403).json({ success: false, message: '최고 관리자만 권한을 회수할 수 있습니다.' });
    const targetEmail = req.params.email;
    if (adminList[targetEmail] === 'super') return res.status(400).json({ success: false, message: '최고 관리자 본인의 권한은 삭제할 수 없습니다.' });
    
    db.query(`DELETE FROM farm_admins WHERE email = ?`, [targetEmail], (err) => {
        if (err) return res.status(500).json({ success: false });
        delete adminList[targetEmail]; // 즉시 메모리에서 박탈
        res.json({ success: true, message: '부관리자 권한이 안전하게 회수(박탈)되었습니다.' });
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/join.html', (req, res) => res.sendFile(path.join(__dirname, 'join.html')));

app.post('/api/register', (req, res) => {
    const { name, email, password, phone, address } = req.body;
    
    db.query(`ALTER TABLE farm_email_users ADD COLUMN address VARCHAR(255)`, () => {
        db.query('SELECT * FROM farm_email_users WHERE email = ? OR (phone = ? AND phone != "")', [email, phone], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: '데이터베이스 조회 중 오류가 발생했습니다.' });
            
            if (results && results.length > 0) {
                if (results.some(user => user.email === email)) return res.status(400).json({ success: false, message: '이미 가입된 이메일 주소입니다.' });
                if (results.some(user => user.phone === phone)) return res.status(400).json({ success: false, message: '이미 가입된 전화번호입니다.' });
            }

            db.query('INSERT INTO farm_email_users (name, email, password, phone, address) VALUES (?, ?, ?, ?, ?)', 
            [name, email, password, phone || '', address || ''], (err, result) => {
                if (err) return res.status(500).json({ success: false, message: '가입 처리 중 데이터베이스 오류가 발생했습니다.' });
                res.json({ success: true, message: '팜마을 회원가입이 성공적으로 완료되었습니다! 🎉' });
            });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM farm_email_users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) {
            console.error("🚨 [로그인 DB 에러 원인]:", err); // <--- 에러의 진짜 이유를 출력하는 코드입니다!
            return res.status(500).json({ success: false, message: '로그인 처리 중 오류 발생' });
        }
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
                // 카카오 로그인 시 세션에 이메일 정보도 함께 저장하도록 추가
                req.session.user = { kakaoId: kakaoId, nickname: nickname, email: email };
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
            const isAdmin = checkIsAdmin(req.session ? req.session.user : null); 
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
    const isAdmin = checkIsAdmin(req.session.user);
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

app.get('/api/products', (req, res) => {
    db.query(`SELECT * FROM farm_products ORDER BY created_at DESC`, (err, results) => {
        if(err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});

app.get('/api/products/:id', (req, res) => {
    db.query(`SELECT * FROM farm_products WHERE id = ?`, [req.params.id], (err, result) => {
        if(err) return res.status(500).json({ success: false });
        if(result.length > 0) {
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            const isAdmin = checkIsAdmin(req.session ? req.session.user : null); 
            res.json({ success: true, data: result[0], currentUser: currentUser, isAdmin: isAdmin });
        } else {
            res.json({ success: false, message: '상품을 찾을 수 없습니다.' });
        }
    });
});

app.put('/api/products/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const nickname = req.session.user.nickname;
    const isAdmin = checkIsAdmin(req.session.user);;
    const { farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize, certs, image, delivery, tags, contentData, faqsData } = req.body;
    
    db.query(`SELECT owner_nickname FROM farm_products WHERE id = ?`, [req.params.id], (err, rows) => {
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
        
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

app.delete('/api/products/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const nickname = req.session.user.nickname;
    const isAdmin = checkIsAdmin(req.session.user);

    db.query(`SELECT owner_nickname FROM farm_products WHERE id = ?`, [req.params.id], (err, rows) => {
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
        
        if (rows[0].owner_nickname !== nickname && !isAdmin) {
            return res.status(403).json({ success: false, message: '본인이 등록한 상품만 삭제할 수 있습니다.' });
        }

        db.query(`DELETE FROM farm_products WHERE id = ?`, [req.params.id], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: '삭제 중 오류가 발생했습니다.' });
            res.json({ success: true, message: '상품이 안전하게 삭제되었습니다.' });
        });
    });
});

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
        db.query(insertQuery, [sender, receiver || '팜마을 관리자', message], (err, result) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, message: '전송 완료' });
        });
    });
});

app.get('/api/admin/chats', (req, res) => {
    const adminList = "('김영진', '김영진(지산)', '지산', '관리자')";
    
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

app.post('/api/ai-chat', (req, res) => {
    const { productId, message } = req.body;
    
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
            
            res.json({ 
                success: true, 
                reply: "질문이 성공적으로 등록되었습니다! 🌿<br>현재 AI 상담원이 학습 중이므로, 남겨주신 소중한 문의는 농장 생산자님께 바로 전달해 드리겠습니다." 
            });
        });
    });
});

// 외부 설정(운세톡) 무시하고 팜마을은 무조건 3000번으로 강제 고정!
const PORT = 3000; 

app.get('/api/admin/ai-inquiries', (req, res) => {
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
        // ✨ 생성일자 누락 방지 코드 포함 완료
        db.query(`ALTER TABLE farm_producers ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, () => {
            
            const insertQuery = `INSERT INTO farm_producers (owner_nickname, farm_name, farm_short, farm_desc, profile_image, cover_image, bank_name, account_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            db.query(insertQuery, [ownerNickname, farm_name, farm_short, farm_desc, profile_image || '', cover_image || '', bank_name || '', account_num || ''], (err, result) => {
                if (err) {
                    console.error("생산자 등록 에러 로그:", err);
                    return res.status(500).json({ success: false, message: 'DB 저장 중 오류가 발생했습니다.' });
                }
                res.json({ success: true, message: '생산자 등록 완료!' });
            });
            
        }); }); }); }); }); }); }); }); }); 
    });
});

app.get('/api/producers', (req, res) => {
    db.query(`SELECT * FROM farm_producers ORDER BY created_at DESC`, (err, results) => {
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

// ==========================================
// 🌟 [추가] 알림판(공지사항) DB 연동 API
// ==========================================
app.get('/api/notices', (req, res) => {
    // 1. 공지사항 전용 테이블 생성
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_notices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            notice_type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, (err) => {
        // 2. 화면이 허전하지 않도록, 테이블이 비어있으면 초기 샘플 데이터를 자동 생성합니다.
        db.query(`SELECT COUNT(*) as count FROM farm_notices`, (err, rows) => {
            if (rows && rows[0].count === 0) {
                const insertSample = `
                    INSERT INTO farm_notices (notice_type, title) VALUES 
                    ('중요공지', '팜마을 평택 비전동 제2허브 정식 오픈 및 이용 안내'),
                    ('이벤트', '🎉 첫 생산자 등록 이벤트! 스마트 농업 키트 증정'),
                    ('일반', '시스템 정기 점검에 따른 서비스 일시 중단 안내 (6/10 새벽)')
                `;
                db.query(insertSample, () => sendNotices(res));
            } else {
                sendNotices(res);
            }
        });
    });

    // 3. 최신순으로 공지사항 목록을 화면으로 보내줍니다.
    function sendNotices(res) {
        db.query(`SELECT * FROM farm_notices ORDER BY created_at DESC`, (err, results) => {
            if (err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    }
});

// 관리자가 추후에 공지를 편하게 등록할 수 있도록 미리 만들어두는 창구
app.post('/api/notices', (req, res) => {
    const { notice_type, title, content } = req.body;
    const query = `INSERT INTO farm_notices (notice_type, title, content) VALUES (?, ?, ?)`;
    db.query(query, [notice_type || '일반', title, content || ''], (err, result) => {
        if(err) return res.status(500).json({ success: false });
        res.json({ success: true, message: '공지 등록 완료' });
    });
});

// ==========================================
// 🌟 [추가] 마이페이지 (내 정보 조회/수정/탈퇴) API
// ==========================================
// 1. 내 정보 불러오기
app.get('/api/mypage', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    
    const user = req.session.user;
    if (user.kakaoId) {
        db.query(`ALTER TABLE farm_members ADD COLUMN address VARCHAR(255)`, () => {
            db.query('SELECT nickname as name, email, joined_at as created_at, address FROM farm_members WHERE kakao_id = ?', [user.kakaoId], (err, results) => {
                if (err || results.length === 0) return res.status(500).json({ success: false });
                res.json({ success: true, data: { ...results[0], join_type: 'kakao', phone: '카카오 간편가입 회원' } });
            });
        });
    } else {
        db.query(`ALTER TABLE farm_email_users ADD COLUMN address VARCHAR(255)`, () => {
            db.query('SELECT name, email, phone, created_at, address FROM farm_email_users WHERE email = ?', [user.email], (err, results) => {
                if (err || results.length === 0) return res.status(500).json({ success: false });
                res.json({ success: true, data: { ...results[0], join_type: 'email' } });
            });
        });
    }
});

// 2. 내 정보 수정하기
app.put('/api/mypage', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false });
    
    const user = req.session.user;
    const { phone, password, address } = req.body;

    if (user.kakaoId) {
        db.query('UPDATE farm_members SET address = ? WHERE kakao_id = ?', [address || '', user.kakaoId], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: '오류가 발생했습니다.' });
            res.json({ success: true, message: '정보가 성공적으로 수정되었습니다! 🌱' });
        });
    } else {
        let query = 'UPDATE farm_email_users SET phone = ?, address = ?';
        let params = [phone || '', address || ''];
        
        if (password && password.trim() !== '') {
            query += ', password = ?';
            params.push(password);
        }
        query += ' WHERE email = ?';
        params.push(user.email);

        db.query(query, params, (err, result) => {
            if (err) return res.status(500).json({ success: false, message: '오류가 발생했습니다.' });
            res.json({ success: true, message: '내 정보가 성공적으로 수정되었습니다! 🌱' });
        });
    }
});

// 3. 회원 스스로 직접 탈퇴하기 (계정 삭제)
app.delete('/api/mypage', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false });
    
    const user = req.session.user;
    
    if (user.kakaoId) {
        db.query('DELETE FROM farm_members WHERE kakao_id = ?', [user.kakaoId], (err) => {
            req.session.destroy(() => res.json({ success: true, message: '회원 탈퇴가 안전하게 처리되었습니다. 그동안 감사했습니다.' }));
        });
    } else {
        db.query('DELETE FROM farm_email_users WHERE email = ?', [user.email], (err) => {
            req.session.destroy(() => res.json({ success: true, message: '회원 탈퇴가 안전하게 처리되었습니다. 그동안 감사했습니다.' }));
        });
    }
});

// ==========================================
// [팜마을 관리자] 회사소개 및 약관 API
// ==========================================
app.get('/api/policy/:section', (req, res) => {
    db.query(`CREATE TABLE IF NOT EXISTS farm_policy (section_name VARCHAR(100) PRIMARY KEY, content LONGTEXT)`, () => {
        db.query("SELECT content FROM farm_policy WHERE section_name = ?", [req.params.section], (err, results) => {
            if (err) return res.status(500).json({ success: false });
            if (results && results.length > 0) res.json({ success: true, content: results[0].content });
            else res.json({ success: false }); 
        });
    });
});

app.post('/api/policy', (req, res) => {
    const { section, content } = req.body;
    db.query(`CREATE TABLE IF NOT EXISTS farm_policy (section_name VARCHAR(100) PRIMARY KEY, content LONGTEXT)`, () => {
        const query = `INSERT INTO farm_policy (section_name, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = ?`;
        db.query(query, [section, content, content], (err, result) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true });
        });
    });
});

// ==========================================
// 🌟 [추가] 회원 관리 (목록 조회 및 강제 탈퇴) API
// ==========================================
app.get('/api/admin/members', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '권한이 없습니다.' });

    // 이메일 명단과 카카오 명단을 하나로 합치면서 '가입 구분표(join_type)'를 붙여줍니다.
    const query = `
        SELECT id, name as nickname, email, phone, created_at, 'email' as join_type, 'farm_email_users' as source_table 
        FROM farm_email_users 
        UNION ALL 
        SELECT id, nickname, email, '' as phone, joined_at as created_at, 'kakao' as join_type, 'farm_members' as source_table 
        FROM farm_members 
        ORDER BY created_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("회원목록 조회 에러:", err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true, data: results });
    });
});

// 카카오인지 이메일인지 구분하여 해당 테이블에서 삭제
app.delete('/api/admin/members/:type/:id', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '권한이 없습니다.' });

    const memberId = req.params.id;
    const targetTable = req.params.type; // 'farm_email_users' 또는 'farm_members'

    // 보안을 위해 테이블 이름 검증
    if(targetTable !== 'farm_email_users' && targetTable !== 'farm_members') {
        return res.status(400).json({ success: false });
    }

    db.query(`DELETE FROM ${targetTable} WHERE id = ?`, [memberId], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: '해당 회원이 강제 탈퇴 처리되었습니다.' });
    });
});

// ==========================================
// 🌟 [추가] 잘키우는법(노하우) 전용 게시판 DB 연동 API
// ==========================================

// 1. 노하우 글 작성 (POST)
app.post('/api/knowhow', (req, res) => {
    // 일반회원(로그인한 사람) 이상만 글쓰기 허용
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: '일반회원 이상 글쓰기가 가능합니다.' });
    }
    
    const { title, content, images } = req.body;
    const nickname = req.session.user.nickname;
    
    // 노하우 전용 저장소(테이블)가 없다면 자동으로 생성
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_knowhow (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nickname VARCHAR(100) NOT NULL,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            images LONGTEXT,
            views INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, () => {
        db.query(`INSERT INTO farm_knowhow (nickname, title, content, images) VALUES (?, ?, ?, ?)`, 
        [nickname, title, content, JSON.stringify(images || [])], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'DB 저장 오류' });
            res.json({ success: true, message: '성공적으로 노하우가 등록되었습니다! 🌟' });
        });
    });
});

// 2. 노하우 글 목록 전체 조회 (GET)
app.get('/api/knowhow', (req, res) => {
    // 카테고리 태그([🌱 농산] 등)가 포함된 최신 글부터 불러오기
    db.query(`SELECT id, nickname, title, content, images, views, created_at FROM farm_knowhow ORDER BY created_at DESC`, (err, results) => {
        if(err) return res.json({ success: true, data: [] });
        res.json({ success: true, data: results });
    });
});

// 3. 노하우 상세 조회 및 조회수 증가 (GET)
app.get('/api/knowhow/:id', (req, res) => {
    const postId = req.params.id;
    // 클릭 시 자동으로 조회수(views) 1 증가
    db.query(`UPDATE farm_knowhow SET views = views + 1 WHERE id = ?`, [postId], () => {
        db.query(`SELECT * FROM farm_knowhow WHERE id = ?`, [postId], (err, result) => {
            if (err || result.length === 0) return res.status(404).json({ success: false });
            
            // 현재 로그인한 사람과 관리자 여부를 파악하여 수정/삭제 버튼 노출 권한을 부여함
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            const isAdmin = checkIsAdmin(req.session ? req.session.user : null); 
            res.json({ success: true, data: result[0], currentUser: currentUser, isAdmin: isAdmin });
        });
    });
});

// 4. 노하우 글 삭제 (DELETE)
app.delete('/api/knowhow/:id', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    const postId = req.params.id;
    const nickname = req.session.user.nickname;
    const isAdmin = checkIsAdmin(req.session.user);

    if (isAdmin) {
        // 관리자는 묻지도 따지지도 않고 삭제 가능
        db.query(`DELETE FROM farm_knowhow WHERE id=?`, [postId], (err, result) => {
            res.json({ success: true, message: '관리자 권한으로 노하우를 삭제했습니다.' });
        });
    } else {
        // 일반회원은 자기가 쓴 글만 삭제 가능
        db.query(`DELETE FROM farm_knowhow WHERE id=? AND nickname=?`, [postId, nickname], (err, result) => {
             if(result.affectedRows === 0) return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.'});
             res.json({ success: true, message: '노하우가 안전하게 삭제되었습니다.' });
        });
    }
});

// ==========================================
// 🌟 [추가] 팜마을 질문있어요 (Q&A) 게시판 API
// ==========================================

// ==========================================
// 🌟 [추가] 팜마을 질문있어요 (Q&A) 게시판 API
// ==========================================
// 1. 질문 작성하기
app.post('/api/qna', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    
    const { title, content } = req.body;
    const nickname = req.session.user.nickname;
    
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_qna (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nickname VARCHAR(100) NOT NULL,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            reply TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, () => {
        db.query(`INSERT INTO farm_qna (nickname, title, content) VALUES (?, ?, ?)`, [nickname, title, content], (err) => {
            if (err) return res.status(500).json({ success: false, message: '저장 오류' });
            res.json({ success: true, message: '질문이 성공적으로 등록되었습니다!' });
        });
    });
});

// 2. 질문 목록 불러오기
app.get('/api/qna', (req, res) => {
    // 💡 에러 방지를 위해 테이블이 없을 경우 대비 껍데기 쿼리 실행
    db.query(`CREATE TABLE IF NOT EXISTS farm_qna (id INT AUTO_INCREMENT PRIMARY KEY, nickname VARCHAR(100), title VARCHAR(255), content TEXT, reply TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
        db.query(`SELECT * FROM farm_qna ORDER BY created_at DESC`, (err, results) => {
            if(err) return res.json({ success: true, data: [] });
            
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
            res.json({ success: true, data: results, currentUser, isAdmin });
        });
    });
});

// 3. 관리자 답변 달기
app.post('/api/qna/:id/reply', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자만 답변을 달 수 있습니다.' });
    
    const { reply } = req.body;
    db.query(`UPDATE farm_qna SET reply = ? WHERE id = ?`, [reply, req.params.id], (err) => {
        if(err) return res.status(500).json({ success: false, message: '답변 저장 오류' });
        res.json({ success: true, message: '답변이 등록되었습니다!' });
    });
});

// ==========================================
// 🌟 [추가] 자주 묻는 질문(FAQ) 관리 API
// ==========================================

// 1. FAQ 목록 불러오기 (일반 사용자 & 관리자 공통)
app.get('/api/faqs', (req, res) => {
    // 테이블이 없으면 자동 생성
    db.query(`CREATE TABLE IF NOT EXISTS farm_faqs (id INT AUTO_INCREMENT PRIMARY KEY, question VARCHAR(255) NOT NULL, answer TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
        db.query(`SELECT * FROM farm_faqs ORDER BY id ASC`, (err, results) => {
            if (err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});

// 2. FAQ 등록하기 (관리자 전용)
app.post('/api/faqs', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자 권한이 없습니다.' });
    
    const { question, answer } = req.body;
    db.query(`INSERT INTO farm_faqs (question, answer) VALUES (?, ?)`, [question, answer], (err) => {
        if(err) return res.status(500).json({ success: false, message: 'FAQ 저장 오류' });
        res.json({ success: true, message: '자주 묻는 질문이 등록되었습니다!' });
    });
});

// 3. FAQ 삭제하기 (관리자 전용)
app.delete('/api/faqs/:id', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자 권한이 없습니다.' });
    
    db.query(`DELETE FROM farm_faqs WHERE id = ?`, [req.params.id], (err) => {
        if(err) return res.status(500).json({ success: false, message: 'FAQ 삭제 오류' });
        res.json({ success: true, message: '해당 질문이 삭제되었습니다.' });
    });
});

// ==========================================
// 🌟 [추가] 알림판(공지사항) 삭제 API (관리자 전용)
// ==========================================
app.delete('/api/notices/:id', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자 권한이 없습니다.' });
    
    db.query(`DELETE FROM farm_notices WHERE id = ?`, [req.params.id], (err) => {
        if(err) return res.status(500).json({ success: false, message: '삭제 중 오류가 발생했습니다.' });
        res.json({ success: true, message: '해당 공지사항이 안전하게 삭제되었습니다.' });
    });
});
// ==========================================
// 🌟 [추가] 잘키우는법 게시판 - 수정/삭제 및 댓글 기능
// ==========================================
// 1. 게시글 수정 창구
app.put('/api/knowhow/:id', (req, res) => {
    const postId = req.params.id;
    const { title, content } = req.body;
    db.query('UPDATE farm_knowhow SET title = ?, content = ? WHERE id = ?', [title, content, postId], (err) => {
        if(err) return res.json({ success: false, message: '수정 실패' });
        res.json({ success: true, message: '게시글이 성공적으로 수정되었습니다.' });
    });
});

// 2. 댓글 등록 창구
app.post('/api/knowhow/comments', (req, res) => {
    if (!req.session || !req.session.user) return res.json({ success: false, message: '로그인이 필요합니다.' });
    const { post_id, content } = req.body;
    const author = req.session.user.nickname;
    
    db.query('CREATE TABLE IF NOT EXISTS farm_knowhow_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('INSERT INTO farm_knowhow_comments (post_id, author, content) VALUES (?, ?, ?)', [post_id, author, content], (err) => {
            if(err) return res.json({ success: false, message: '댓글 등록 실패' });
            res.json({ success: true, message: '댓글이 등록되었습니다.' });
        });
    });
});

// 3. 댓글 불러오기 창구
app.get('/api/knowhow/comments/:postId', (req, res) => {
    const postId = req.params.postId;
    db.query('CREATE TABLE IF NOT EXISTS farm_knowhow_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('SELECT * FROM farm_knowhow_comments WHERE post_id = ? ORDER BY created_at ASC', [postId], (err, results) => {
            if(err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});
// ==========================================
// 🌟 [추가] 잔디밭 게시판 - 댓글 기능 창구
// ==========================================
app.post('/api/board/comments', (req, res) => {
    if (!req.session || !req.session.user) return res.json({ success: false, message: '로그인이 필요합니다.' });
    const { post_id, content } = req.body;
    const author = req.session.user.nickname;
    
    db.query('CREATE TABLE IF NOT EXISTS farm_board_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('INSERT INTO farm_board_comments (post_id, author, content) VALUES (?, ?, ?)', [post_id, author, content], (err) => {
            if(err) return res.json({ success: false, message: '댓글 등록 실패' });
            res.json({ success: true, message: '댓글이 등록되었습니다.' });
        });
    });
});

app.get('/api/board/comments/:postId', (req, res) => {
    const postId = req.params.postId;
    db.query('CREATE TABLE IF NOT EXISTS farm_board_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('SELECT * FROM farm_board_comments WHERE post_id = ? ORDER BY created_at ASC', [postId], (err, results) => {
            if(err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});

// 🌟 서버 엔진 실행 코드는 무조건 파일 맨 마지막에 있어야 합니다!
app.listen(PORT, () => console.log(`🚀 팜마을 서버가 ${PORT}번 방에서 달리고 있습니다!`));
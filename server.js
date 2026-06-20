const express = require('express');
const session = require('express-session');
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

// 🌟 데이터베이스 무중단 풀(Pool) 연결
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
        phone VARCHAR(20),
        address VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;
db.query(createEmailMembersTable, () => {
    db.query(`ALTER TABLE farm_email_users ADD COLUMN phone VARCHAR(20)`, () => {});
    db.query(`ALTER TABLE farm_email_users ADD COLUMN address VARCHAR(255)`, () => {});
});

db.query(`CREATE TABLE IF NOT EXISTS farm_members (id INT AUTO_INCREMENT PRIMARY KEY, kakao_id BIGINT UNIQUE NOT NULL, nickname VARCHAR(100) NOT NULL, email VARCHAR(100), address VARCHAR(255), joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
    db.query(`ALTER TABLE farm_members ADD COLUMN address VARCHAR(255)`, () => {});
});

console.log('✅ 데이터베이스 창고 무중단 풀(Pool) 연결 성공!');

// ==========================================
// 🌟 관리자 권한 동적 할당 시스템
// ==========================================
let adminList = {}; 

db.query(`CREATE TABLE IF NOT EXISTS farm_admins (email VARCHAR(100) PRIMARY KEY, role VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
    db.query(`INSERT IGNORE INTO farm_admins (email, role) VALUES ('greenpic@naver.com', 'super'), ('simwoodo@naver.com', 'super')`, () => {
        db.query(`SELECT email, role FROM farm_admins`, (err, rows) => {
            if (rows) { rows.forEach(r => adminList[r.email] = r.role); }
        });
    });
});

function checkIsAdmin(user) {
    if (!user) return false;
    return adminList[user.email] !== undefined; 
}

function checkIsSuperAdmin(user) {
    if (!user) return false;
    return adminList[user.email] === 'super';
}

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
        adminList[email] = 'manager'; 
        res.json({ success: true, message: '해당 회원에게 부관리자 권한이 성공적으로 부여되었습니다.' });
    });
});

app.delete('/api/admin/managers/:email', (req, res) => {
    if (!checkIsSuperAdmin(req.session?.user)) return res.status(403).json({ success: false, message: '최고 관리자만 권한을 회수할 수 있습니다.' });
    const targetEmail = req.params.email;
    if (adminList[targetEmail] === 'super') return res.status(400).json({ success: false, message: '최고 관리자 본인의 권한은 삭제할 수 없습니다.' });
    
    db.query(`DELETE FROM farm_admins WHERE email = ?`, [targetEmail], (err) => {
        if (err) return res.status(500).json({ success: false });
        delete adminList[targetEmail]; 
        res.json({ success: true, message: '부관리자 권한이 안전하게 회수(박탈)되었습니다.' });
    });
});

// ==========================================
// 🌟 기본 페이지 연결 및 인증 API
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/join.html', (req, res) => res.sendFile(path.join(__dirname, 'join.html')));

app.post('/api/register', (req, res) => {
    const { name, email, password, phone, address } = req.body;
    
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

app.post('/api/find-password', (req, res) => {
    const { name, email, phone } = req.body;
    db.query('SELECT password FROM farm_email_users WHERE name = ? AND email = ? AND phone = ?', [name, email, phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'DB 조회 중 오류가 발생했습니다.' });
        if (results && results.length > 0) {
            res.json({ success: true, password: results[0].password });
        } else {
            res.json({ success: false, message: '입력하신 정보와 일치하는 회원이 없습니다.' });
        }
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
        db.query(`INSERT INTO farm_members (kakao_id, nickname, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE nickname=?`, [kakaoId, nickname, email, nickname], () => {
            req.session.user = { kakaoId: kakaoId, nickname: nickname, email: email };
            res.send(`<script>alert('${nickname}님, 반갑습니다!'); location.href='/';</script>`);
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

// ==========================================
// 🌟 마이페이지 (내 정보 조회/수정/탈퇴) API
// ==========================================
app.get('/api/mypage', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const user = req.session.user;
    if (user.kakaoId) {
        db.query('SELECT nickname as name, email, joined_at as created_at, address FROM farm_members WHERE kakao_id = ?', [user.kakaoId], (err, results) => {
            if (err || results.length === 0) return res.status(500).json({ success: false });
            res.json({ success: true, data: { ...results[0], join_type: 'kakao', phone: '카카오 간편가입 회원' } });
        });
    } else {
        db.query('SELECT name, email, phone, created_at, address FROM farm_email_users WHERE email = ?', [user.email], (err, results) => {
            if (err || results.length === 0) return res.status(500).json({ success: false });
            res.json({ success: true, data: { ...results[0], join_type: 'email' } });
        });
    }
});

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

app.delete('/api/mypage', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false });
    const user = req.session.user;
    if (user.kakaoId) {
        db.query('DELETE FROM farm_members WHERE kakao_id = ?', [user.kakaoId], (err) => {
            req.session.destroy(() => res.json({ success: true, message: '회원 탈퇴가 안전하게 처리되었습니다.' }));
        });
    } else {
        db.query('DELETE FROM farm_email_users WHERE email = ?', [user.email], (err) => {
            req.session.destroy(() => res.json({ success: true, message: '회원 탈퇴가 안전하게 처리되었습니다.' }));
        });
    }
});

// ==========================================
// 🌟 팜마을 상품 (Products) API - 🌟 주소 저장 기능 완벽 호환!
// ==========================================
app.post('/api/products', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요한 서비스입니다.' });
    const ownerNickname = req.session.user.nickname;
    const { farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize, certs, image, delivery, tags, contentData, faqsData, farm_address } = req.body; 
    
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
            farm_address VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    db.query(createTableQuery, () => {
        db.query(`ALTER TABLE farm_products ADD COLUMN owner_nickname VARCHAR(100)`, () => {});
        db.query(`ALTER TABLE farm_products ADD COLUMN delivery VARCHAR(255) DEFAULT '방문수거'`, () => {});
        db.query(`ALTER TABLE farm_products ADD COLUMN tags VARCHAR(255)`, () => {});
        db.query(`ALTER TABLE farm_products ADD COLUMN content_data LONGTEXT`, () => {});
        db.query(`ALTER TABLE farm_products ADD COLUMN p_size VARCHAR(50)`, () => {});
        db.query(`ALTER TABLE farm_products ADD COLUMN certs VARCHAR(255)`, () => {});
        db.query(`ALTER TABLE farm_products ADD COLUMN faqs LONGTEXT`, () => {});
        
        // 🌟 확실하게 주소 칸을 만들고 나서 상품을 저장(INSERT)합니다.
        db.query(`ALTER TABLE farm_products ADD COLUMN farm_address VARCHAR(500)`, () => {
            const insertQuery = `INSERT INTO farm_products (owner_nickname, farm_name, category, title, org_price, sale_price, p_date, p_grade, p_size, certs, image, delivery, tags, content_data, faqs, farm_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            db.query(insertQuery, [ownerNickname, farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize || '', certs || '', image, delivery || '방문수거', tags || '', contentData || '[]', faqsData || '[]', farm_address || ''], (insertErr, result) => {
                if (insertErr) return res.status(500).json({ success: false, message: 'DB 저장 중 오류가 발생했습니다.' });
                res.json({ success: true, message: '상품 등록 완료!' });
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

// 🌟 [핵심 수정 구간] 상품 수정(PUT) 시에도 주소 칸이 확실히 있는지 확인하고 업데이트합니다!
app.put('/api/products/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const nickname = req.session.user.nickname;
    const isAdmin = checkIsAdmin(req.session.user);
    const { farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize, certs, image, delivery, tags, contentData, faqsData, farm_address } = req.body;
    
    db.query(`SELECT owner_nickname FROM farm_products WHERE id = ?`, [req.params.id], (err, rows) => {
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
        if (rows[0].owner_nickname !== nickname && !isAdmin) return res.status(403).json({ success: false, message: '본인이 등록한 상품만 수정할 수 있습니다.' });

        // 🌟 서랍(farm_address)이 없으면 확실히 만들어주고 업데이트를 진행합니다.
        db.query(`ALTER TABLE farm_products ADD COLUMN farm_address VARCHAR(500)`, () => {
            const updateQuery = `UPDATE farm_products SET farm_name=?, category=?, title=?, org_price=?, sale_price=?, p_date=?, p_grade=?, p_size=?, certs=?, image=?, delivery=?, tags=?, content_data=?, faqs=?, farm_address=? WHERE id=?`;
            db.query(updateQuery, [farmName, category, title, orgPrice, salePrice, pDate, pGrade, pSize || '', certs || '', image, delivery || '방문수거', tags || '', contentData || '[]', faqsData || '[]', farm_address || '', req.params.id], (updateErr, result) => {
                if (updateErr) return res.status(500).json({ success: false, message: '수정 중 오류가 발생했습니다.' });
                res.json({ success: true, message: '상품이 성공적으로 수정되었습니다!' });
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
        if (rows[0].owner_nickname !== nickname && !isAdmin) return res.status(403).json({ success: false, message: '본인이 등록한 상품만 삭제할 수 있습니다.' });

        db.query(`DELETE FROM farm_products WHERE id = ?`, [req.params.id], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: '삭제 중 오류가 발생했습니다.' });
            res.json({ success: true, message: '상품이 안전하게 삭제되었습니다.' });
        });
    });
});

// ==========================================
// 🌟 생산자(농장) 등록 및 대시보드 API
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
    db.query(createTableQuery, () => {
        db.query(`ALTER TABLE farm_producers ADD COLUMN owner_nickname VARCHAR(100)`, () => {});
        db.query(`ALTER TABLE farm_producers ADD COLUMN farm_name VARCHAR(255)`, () => {});
        db.query(`ALTER TABLE farm_producers ADD COLUMN farm_short VARCHAR(255)`, () => {});
        db.query(`ALTER TABLE farm_producers ADD COLUMN farm_desc TEXT`, () => {});
        db.query(`ALTER TABLE farm_producers ADD COLUMN profile_image LONGTEXT`, () => {});
        db.query(`ALTER TABLE farm_producers ADD COLUMN cover_image LONGTEXT`, () => {});
        db.query(`ALTER TABLE farm_producers ADD COLUMN bank_name VARCHAR(100)`, () => {});
        db.query(`ALTER TABLE farm_producers ADD COLUMN account_num VARCHAR(100)`, () => {});
        db.query(`ALTER TABLE farm_producers ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, () => {});
        
        const insertQuery = `INSERT INTO farm_producers (owner_nickname, farm_name, farm_short, farm_desc, profile_image, cover_image, bank_name, account_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        db.query(insertQuery, [ownerNickname, farm_name, farm_short, farm_desc, profile_image || '', cover_image || '', bank_name || '', account_num || ''], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'DB 저장 중 오류가 발생했습니다.' });
            res.json({ success: true, message: '생산자 등록 완료!' });
        });
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

// [대시보드] 내가 등록한 상품 목록
app.get('/api/producer/products', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const nickname = req.session.user.nickname;
    db.query(`SELECT * FROM farm_products WHERE owner_nickname = ? ORDER BY created_at DESC`, [nickname], (err, results) => {
        if (err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});

// [대시보드] 내 농장 소식(일기)
app.get('/api/producer/stories', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false });
    const nickname = req.session.user.nickname;
    db.query(`SELECT id, title, views, created_at FROM farm_knowhow WHERE nickname = ? ORDER BY created_at DESC`, [nickname], (err, results) => {
        if(err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});

// [대시보드] 내 상품에 달린 AI 문의 및 답변 처리
app.get('/api/producer/ai-inquiries', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const nickname = req.session.user.nickname;
    const query = `
        SELECT a.id, a.message, a.created_at, p.title, p.farm_name, a.reply 
        FROM farm_ai_inquiries a
        JOIN farm_products p ON a.product_id = p.id
        WHERE p.owner_nickname = ?
        ORDER BY a.created_at DESC
    `;
    db.query(query, [nickname], (err, results) => {
        if (err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});

app.post('/api/producer/ai-inquiries/:id/reply', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false });
    const { reply } = req.body;
    db.query(`UPDATE farm_ai_inquiries SET reply = ? WHERE id = ?`, [reply, req.params.id], (err) => {
        if(err) return res.status(500).json({ success: false, message: '답변 저장 오류' });
        res.json({ success: true, message: '고객 문의에 답변이 성공적으로 등록되었습니다!' });
    });
});

// ==========================================
// 🌟 1:1 채팅 및 AI 문의 API
// ==========================================
app.post('/api/chat', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const sender = req.session.user.nickname;
    const { receiver, message } = req.body;
    const createTableQuery = `CREATE TABLE IF NOT EXISTS farm_chats (id INT AUTO_INCREMENT PRIMARY KEY, sender VARCHAR(100) NOT NULL, receiver VARCHAR(100) NOT NULL, message TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    db.query(createTableQuery, (err) => {
        db.query(`INSERT INTO farm_chats (sender, receiver, message) VALUES (?, ?, ?)`, [sender, receiver || '팜마을 관리자', message], (err, result) => {
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
    const query = `SELECT * FROM farm_chats WHERE sender = ? OR receiver = ? ORDER BY created_at ASC`;
    db.query(query, [targetUser, targetUser], (err, results) => {
        if (err) return res.json({ success: false, data: [] });
        res.json({ success: true, data: results });
    });
});

app.post('/api/ai-chat', (req, res) => {
    const { productId, message } = req.body;
    const createTableQuery = `CREATE TABLE IF NOT EXISTS farm_ai_inquiries (id INT AUTO_INCREMENT PRIMARY KEY, product_id VARCHAR(50), message TEXT NOT NULL, reply TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    db.query(createTableQuery, (err) => {
        db.query(`ALTER TABLE farm_ai_inquiries ADD COLUMN reply TEXT`, () => {});
        db.query(`INSERT INTO farm_ai_inquiries (product_id, message) VALUES (?, ?)`, [productId || '알수없음', message], (err, result) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, reply: "질문이 성공적으로 등록되었습니다! 🌿<br>현재 AI 상담원이 학습 중이므로, 남겨주신 소중한 문의는 농장 생산자님께 바로 전달해 드리겠습니다." });
        });
    });
});

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
// 🌟 잘키우는법 (노하우) 및 잔디밭 게시판 API
// ==========================================
// 노하우
app.post('/api/knowhow', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '일반회원 이상 글쓰기가 가능합니다.' });
    const { title, content, images } = req.body;
    const nickname = req.session.user.nickname;
    const createTableQuery = `CREATE TABLE IF NOT EXISTS farm_knowhow (id INT AUTO_INCREMENT PRIMARY KEY, nickname VARCHAR(100) NOT NULL, title VARCHAR(255) NOT NULL, content TEXT NOT NULL, images LONGTEXT, views INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    db.query(createTableQuery, () => {
        db.query(`INSERT INTO farm_knowhow (nickname, title, content, images) VALUES (?, ?, ?, ?)`, [nickname, title, content, JSON.stringify(images || [])], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'DB 저장 오류' });
            res.json({ success: true, message: '성공적으로 노하우가 등록되었습니다! 🌟' });
        });
    });
});

app.get('/api/knowhow', (req, res) => {
    db.query(`SELECT id, nickname, title, content, images, views, created_at FROM farm_knowhow ORDER BY created_at DESC`, (err, results) => {
        if(err) return res.json({ success: true, data: [] });
        res.json({ success: true, data: results });
    });
});

app.get('/api/knowhow/:id', (req, res) => {
    const postId = req.params.id;
    db.query(`UPDATE farm_knowhow SET views = views + 1 WHERE id = ?`, [postId], () => {
        db.query(`SELECT * FROM farm_knowhow WHERE id = ?`, [postId], (err, result) => {
            if (err || result.length === 0) return res.status(404).json({ success: false });
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            const isAdmin = checkIsAdmin(req.session ? req.session.user : null); 
            res.json({ success: true, data: result[0], currentUser: currentUser, isAdmin: isAdmin });
        });
    });
});

app.put('/api/knowhow/:id', (req, res) => {
    const { title, content } = req.body;
    db.query('UPDATE farm_knowhow SET title = ?, content = ? WHERE id = ?', [title, content, req.params.id], (err) => {
        if(err) return res.json({ success: false, message: '수정 실패' });
        res.json({ success: true, message: '게시글이 성공적으로 수정되었습니다.' });
    });
});

app.delete('/api/knowhow/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const nickname = req.session.user.nickname;
    const isAdmin = checkIsAdmin(req.session.user);
    if (isAdmin) {
        db.query(`DELETE FROM farm_knowhow WHERE id=?`, [req.params.id], (err, result) => res.json({ success: true, message: '관리자 권한으로 노하우를 삭제했습니다.' }));
    } else {
        db.query(`DELETE FROM farm_knowhow WHERE id=? AND nickname=?`, [req.params.id, nickname], (err, result) => {
             if(result.affectedRows === 0) return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.'});
             res.json({ success: true, message: '노하우가 안전하게 삭제되었습니다.' });
        });
    }
});

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

app.get('/api/knowhow/comments/:postId', (req, res) => {
    db.query('CREATE TABLE IF NOT EXISTS farm_knowhow_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('SELECT * FROM farm_knowhow_comments WHERE post_id = ? ORDER BY created_at ASC', [req.params.postId], (err, results) => {
            if(err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});

// 잔디밭 (Board)
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
    db.query(`UPDATE farm_board SET views = views + 1 WHERE id = ?`, [req.params.id], () => {
        db.query(`SELECT * FROM farm_board WHERE id = ?`, [req.params.id], (err, result) => {
            if (result.length === 0) return res.status(404).json({ success: false });
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            const isAdmin = checkIsAdmin(req.session ? req.session.user : null); 
            res.json({ success: true, data: result[0], currentUser: currentUser, isAdmin: isAdmin });
        });
    });
});

app.put('/api/board/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '권한이 없습니다.'});
    const { title, content, youtube_url, images } = req.body;
    const nickname = req.session.user.nickname;
    db.query(`UPDATE farm_board SET title=?, content=?, youtube_url=?, images=? WHERE id=? AND nickname=?`, [title, content, youtube_url, JSON.stringify(images || []), req.params.id, nickname], (err, result) => {
         if(result.affectedRows === 0) return res.status(403).json({ success: false, message: '수정 권한이 없습니다.'});
         res.json({ success: true, message: '글이 성공적으로 수정되었습니다!' });
    });
});

app.delete('/api/board/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.'});
    const nickname = req.session.user.nickname;
    const isAdmin = checkIsAdmin(req.session.user);
    if (isAdmin) {
        db.query(`DELETE FROM farm_board WHERE id=?`, [req.params.id], (err, result) => res.json({ success: true, message: '관리자 권한으로 글을 삭제했습니다.' }));
    } else {
        db.query(`DELETE FROM farm_board WHERE id=? AND nickname=?`, [req.params.id, nickname], (err, result) => {
             if(result.affectedRows === 0) return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.'});
             res.json({ success: true, message: '글이 안전하게 삭제되었습니다.' });
        });
    }
});

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
    db.query('CREATE TABLE IF NOT EXISTS farm_board_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('SELECT * FROM farm_board_comments WHERE post_id = ? ORDER BY created_at ASC', [req.params.postId], (err, results) => {
            if(err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});

// ==========================================
// 🌟 QnA(질문있어요) 및 FAQ API
// ==========================================
app.post('/api/qna', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    const { title, content } = req.body;
    const nickname = req.session.user.nickname;
    const createTableQuery = `CREATE TABLE IF NOT EXISTS farm_qna (id INT AUTO_INCREMENT PRIMARY KEY, nickname VARCHAR(100) NOT NULL, title VARCHAR(255) NOT NULL, content TEXT NOT NULL, reply TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    db.query(createTableQuery, () => {
        db.query(`INSERT INTO farm_qna (nickname, title, content) VALUES (?, ?, ?)`, [nickname, title, content], (err) => {
            if (err) return res.status(500).json({ success: false, message: '저장 오류' });
            res.json({ success: true, message: '질문이 성공적으로 등록되었습니다!' });
        });
    });
});

app.get('/api/qna', (req, res) => {
    db.query(`CREATE TABLE IF NOT EXISTS farm_qna (id INT AUTO_INCREMENT PRIMARY KEY, nickname VARCHAR(100), title VARCHAR(255), content TEXT, reply TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
        db.query(`SELECT * FROM farm_qna ORDER BY created_at DESC`, (err, results) => {
            if(err) return res.json({ success: true, data: [] });
            const currentUser = (req.session && req.session.user) ? req.session.user.nickname : null;
            const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
            res.json({ success: true, data: results, currentUser, isAdmin });
        });
    });
});

app.put('/api/qna/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '권한이 없습니다.'});
    const { title, content } = req.body;
    const nickname = req.session.user.nickname;
    db.query(`UPDATE farm_qna SET title=?, content=? WHERE id=? AND nickname=?`, [title, content, req.params.id, nickname], (err, result) => {
        if(err || result.affectedRows === 0) return res.status(403).json({ success: false, message: '수정 권한이 없거나 오류가 발생했습니다.'});
        res.json({ success: true, message: '질문이 성공적으로 수정되었습니다.' });
    });
});

app.delete('/api/qna/:id', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '권한이 없습니다.'});
    const nickname = req.session.user.nickname;
    db.query(`DELETE FROM farm_qna WHERE id=? AND nickname=?`, [req.params.id, nickname], (err, result) => {
        if(err || result.affectedRows === 0) return res.status(403).json({ success: false, message: '삭제 권한이 없거나 오류가 발생했습니다.'});
        res.json({ success: true, message: '질문이 안전하게 삭제되었습니다.' });
    });
});

app.post('/api/qna/:id/reply', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자만 답변을 달 수 있습니다.' });
    const { reply } = req.body;
    db.query(`UPDATE farm_qna SET reply = ? WHERE id = ?`, [reply, req.params.id], (err) => {
        if(err) return res.status(500).json({ success: false, message: '답변 저장 오류' });
        res.json({ success: true, message: '답변이 등록되었습니다!' });
    });
});

app.post('/api/qna/comments', (req, res) => {
    if (!req.session || !req.session.user) return res.json({ success: false, message: '로그인이 필요합니다.' });
    const { post_id, content } = req.body;
    const author = req.session.user.nickname;
    db.query('CREATE TABLE IF NOT EXISTS farm_qna_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('INSERT INTO farm_qna_comments (post_id, author, content) VALUES (?, ?, ?)', [post_id, author, content], (err) => {
            if(err) return res.json({ success: false, message: '댓글 등록 실패' });
            res.json({ success: true, message: '댓글이 등록되었습니다.' });
        });
    });
});

app.get('/api/qna/comments/:postId', (req, res) => {
    db.query('CREATE TABLE IF NOT EXISTS farm_qna_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('SELECT * FROM farm_qna_comments WHERE post_id = ? ORDER BY created_at ASC', [req.params.postId], (err, results) => {
            if(err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});

app.get('/api/faqs', (req, res) => {
    db.query(`CREATE TABLE IF NOT EXISTS farm_faqs (id INT AUTO_INCREMENT PRIMARY KEY, question VARCHAR(255) NOT NULL, answer TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
        db.query(`SELECT * FROM farm_faqs ORDER BY id ASC`, (err, results) => {
            if (err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});

app.post('/api/faqs', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자 권한이 없습니다.' });
    const { question, answer } = req.body;
    db.query(`INSERT INTO farm_faqs (question, answer) VALUES (?, ?)`, [question, answer], (err) => {
        if(err) return res.status(500).json({ success: false, message: 'FAQ 저장 오류' });
        res.json({ success: true, message: '자주 묻는 질문이 등록되었습니다!' });
    });
});

app.delete('/api/faqs/:id', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자 권한이 없습니다.' });
    db.query(`DELETE FROM farm_faqs WHERE id = ?`, [req.params.id], (err) => {
        if(err) return res.status(500).json({ success: false, message: 'FAQ 삭제 오류' });
        res.json({ success: true, message: '해당 질문이 삭제되었습니다.' });
    });
});

// ==========================================
// 🌟 회사소개/이용약관 및 회원 강제 탈퇴 (관리자)
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

app.get('/api/admin/members', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '권한이 없습니다.' });

    const query = `
        SELECT id, name as nickname, email, phone, created_at, 'email' as join_type, 'farm_email_users' as source_table 
        FROM farm_email_users 
        UNION ALL 
        SELECT id, nickname, email, '' as phone, joined_at as created_at, 'kakao' as join_type, 'farm_members' as source_table 
        FROM farm_members 
        ORDER BY created_at DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, data: results });
    });
});

app.delete('/api/admin/members/:type/:id', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '권한이 없습니다.' });

    const memberId = req.params.id;
    const targetTable = req.params.type; 

    if(targetTable !== 'farm_email_users' && targetTable !== 'farm_members') {
        return res.status(400).json({ success: false });
    }

    db.query(`DELETE FROM ${targetTable} WHERE id = ?`, [memberId], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: '해당 회원이 강제 탈퇴 처리되었습니다.' });
    });
});

// ==========================================
// 🌟 알림판(Notice) 통합 API (메인 고정 연동)
// ==========================================
app.get('/api/notices', (req, res) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_notices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            notice_type VARCHAR(50) DEFAULT '일반',
            title VARCHAR(255) NOT NULL,
            content TEXT,
            is_pinned BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.query(createTableQuery, (err) => {
        db.query(`ALTER TABLE farm_notices ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE`, () => {
            db.query(`SELECT COUNT(*) as count FROM farm_notices`, (err, rows) => {
                if (rows && rows[0].count === 0) {
                    const insertSample = `
                        INSERT INTO farm_notices (notice_type, title, is_pinned) VALUES 
                        ('중요공지', '팜마을 평택 비전동 제2허브 정식 오픈 및 이용 안내', FALSE),
                        ('이벤트', '🎉 첫 생산자 등록 이벤트! 스마트 농업 키트 증정', FALSE),
                        ('일반', '시스템 정기 점검에 따른 서비스 일시 중단 안내 (6/10 새벽)', FALSE)
                    `;
                    db.query(insertSample, () => sendNotices(res));
                } else {
                    sendNotices(res);
                }
            });
        });
    });

    function sendNotices(res) {
        db.query(`SELECT * FROM farm_notices ORDER BY is_pinned DESC, created_at DESC`, (err, results) => {
            if (err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    }
});

app.post('/api/notices', (req, res) => {
    const { notice_type, title, content, is_pinned } = req.body;
    
    if (is_pinned) {
        db.query(`UPDATE farm_notices SET is_pinned = FALSE`, () => {
            db.query(`INSERT INTO farm_notices (notice_type, title, content, is_pinned) VALUES (?, ?, ?, ?)`, 
            [notice_type || '일반', title, content || '', true], (err) => {
                if(err) return res.json({ success: false });
                res.json({ success: true, message: '상단 고정 알림이 등록되어 메인페이지에 반영되었습니다.' });
            });
        });
    } else {
        db.query(`INSERT INTO farm_notices (notice_type, title, content, is_pinned) VALUES (?, ?, ?, ?)`, 
        [notice_type || '일반', title, content || '', false], (err) => {
            if(err) return res.json({ success: false });
            res.json({ success: true, message: '일반 알림이 성공적으로 등록되었습니다.' });
        });
    }
});

app.put('/api/notices/:id/pin', (req, res) => {
    const { is_pinned } = req.body;
    if (is_pinned) {
        db.query(`UPDATE farm_notices SET is_pinned = FALSE`, () => {
            db.query(`UPDATE farm_notices SET is_pinned = TRUE WHERE id = ?`, [req.params.id], () => {
                res.json({ success: true });
            });
        });
    } else {
        db.query(`UPDATE farm_notices SET is_pinned = FALSE WHERE id = ?`, [req.params.id], () => {
            res.json({ success: true });
        });
    }
});

app.put('/api/notices/:id', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자 권한이 없습니다.' });
    const { title, content } = req.body;
    db.query(`UPDATE farm_notices SET title=?, content=? WHERE id=?`, [title, content, req.params.id], (err, result) => {
        if(err) return res.status(500).json({ success: false, message: '수정 중 오류가 발생했습니다.'});
        res.json({ success: true, message: '공지사항이 성공적으로 수정되었습니다.' });
    });
});

app.delete('/api/notices/:id', (req, res) => {
    const isAdmin = checkIsAdmin(req.session ? req.session.user : null);
    if (!isAdmin) return res.status(403).json({ success: false, message: '관리자 권한이 없습니다.' });
    db.query(`DELETE FROM farm_notices WHERE id = ?`, [req.params.id], (err) => {
        if(err) return res.status(500).json({ success: false, message: '삭제 중 오류가 발생했습니다.' });
        res.json({ success: true, message: '해당 공지사항이 안전하게 삭제되었습니다.' });
    });
});

app.post('/api/notices/comments', (req, res) => {
    if (!req.session || !req.session.user) return res.json({ success: false, message: '로그인이 필요합니다.' });
    const { post_id, content } = req.body;
    const author = req.session.user.nickname;
    db.query('CREATE TABLE IF NOT EXISTS farm_notice_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('INSERT INTO farm_notice_comments (post_id, author, content) VALUES (?, ?, ?)', [post_id, author, content], (err) => {
            if(err) return res.json({ success: false, message: '댓글 등록 실패' });
            res.json({ success: true, message: '댓글이 등록되었습니다.' });
        });
    });
});

app.get('/api/notices/comments/:postId', (req, res) => {
    db.query('CREATE TABLE IF NOT EXISTS farm_notice_comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, author VARCHAR(50), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)', () => {
        db.query('SELECT * FROM farm_notice_comments WHERE post_id = ? ORDER BY created_at ASC', [req.params.postId], (err, results) => {
            if(err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});

// ==========================================
// 🌟 마을 HUB 거점 관리 통합 API
// ==========================================
app.post('/api/hub-apply', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    
    const owner_nickname = req.session.user.nickname;
    const { hub_name, hub_type, hub_address, hub_desc, hub_image } = req.body;
    
    const createTableQuery = `CREATE TABLE IF NOT EXISTS hub_applications_v2 (id INT AUTO_INCREMENT PRIMARY KEY, owner_nickname VARCHAR(100), hub_name VARCHAR(255) NOT NULL, hub_type VARCHAR(100) NOT NULL, hub_address VARCHAR(500) NOT NULL, hub_desc TEXT, hub_image LONGTEXT, status VARCHAR(20) DEFAULT '신청완료', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    
    db.query(createTableQuery, (err) => {
        db.query(`ALTER TABLE hub_applications_v2 ADD COLUMN owner_nickname VARCHAR(100)`, () => {});
        db.query(`ALTER TABLE hub_applications_v2 ADD COLUMN status VARCHAR(20) DEFAULT '신청완료'`, () => {});
        
        const insertQuery = `INSERT INTO hub_applications_v2 (owner_nickname, hub_name, hub_type, hub_address, hub_desc, hub_image) VALUES (?, ?, ?, ?, ?, ?)`;
        db.query(insertQuery, [owner_nickname, hub_name, hub_type, hub_address, hub_desc, hub_image], (err, result) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, message: '성공적으로 접수되었습니다!' });
        });
    });
});

app.get('/api/my-hub', (req, res) => {
    if (!req.session || !req.session.user) return res.json({ success: false });
    const nickname = req.session.user.nickname;
    db.query(`SELECT id FROM hub_applications_v2 WHERE owner_nickname = ? ORDER BY created_at DESC LIMIT 1`, [nickname], (err, results) => {
        if(err || results.length === 0) return res.json({ success: false });
        res.json({ success: true, hubId: results[0].id });
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

// 관리자 HUB 승인 처리
app.put('/api/admin/hubs/:id/approve', (req, res) => {
    db.query(`UPDATE hub_applications_v2 SET status = '승인완료' WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.json({ success: false, message: 'DB 오류가 발생했습니다.' });
        res.json({ success: true, message: '마전 HUB가 성공적으로 승인되었습니다!' });
    });
});

// ==========================================
// 🌟 생산자 개별 홈페이지 - 농장 일기 관리 API
// ==========================================
app.post('/api/producers/diary', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    
    const nickname = req.session.user.nickname;
    const { producer_id, content } = req.body;
    
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS farm_diary (
            id INT AUTO_INCREMENT PRIMARY KEY,
            producer_id INT,
            nickname VARCHAR(100),
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    db.query(createTableQuery, () => {
        db.query(`INSERT INTO farm_diary (producer_id, nickname, content) VALUES (?, ?, ?)`, [producer_id, nickname, content], (err) => {
            if(err) return res.status(500).json({ success: false, message: '일기 등록 오류' });
            res.json({ success: true, message: '오늘의 농장 일기가 성공적으로 등록되었습니다! 📝' });
        });
    });
});

app.get('/api/producers/:id/diary', (req, res) => {
    db.query(`CREATE TABLE IF NOT EXISTS farm_diary (id INT AUTO_INCREMENT PRIMARY KEY, producer_id INT, nickname VARCHAR(100), content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, () => {
        db.query(`SELECT * FROM farm_diary WHERE producer_id = ? ORDER BY created_at DESC`, [req.params.id], (err, results) => {
            if(err) return res.json({ success: false, data: [] });
            res.json({ success: true, data: results });
        });
    });
});

app.listen(3000, () => console.log(`🚀 팜마을 서버가 3000번 방에서 달리고 있습니다!`));
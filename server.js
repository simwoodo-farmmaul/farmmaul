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

// 클라우드 서버가 지정해 주는 방 번호(포트) 또는 3000번 방에서 대기 시작!
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 팜마을 서버가 ${PORT}번 방에서 힘차게 달리고 있습니다!`);
});
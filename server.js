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

// 현재 폴더에 있는 모든 HTML, 그림 파일들을 화면에 보여주라는 허가증
app.use(express.static(__dirname));

// 클라우드타입 내부 연결 설정
const db = mysql.createConnection({
    host: 'farm-db3', // 우리가 새로 지은 든든한 창고 이름입니다.
    port: 3306,       // 내부 연결 전용 기본 통로 번호입니다.
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

// 인터넷 창에 주소를 치고 들어왔을 때 메인 화면을 보여주는 규칙
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 클라우드 서버가 지정해 주는 방 번호(포트) 또는 3000번 방에서 대기 시작!
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 팜마을 서버가 ${PORT}번 방에서 힘차게 달리고 있습니다!`);
});
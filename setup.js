const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

// 클라우드타입 내부 연결 설정
const db = mysql.createConnection({
    host: 'farm-db3', // 👈 [핵심!] 길고 복잡한 주소 대신, 방금 만든 창고 이름만 적습니다.
    port: 3306,       // 👈 내부 연결 전용 기본 통로 번호입니다.
    user: 'root',
    password: 'Farmmaul1234!',
    database: 'farmmaul_db',
    multipleStatements: true // setup.js에만 이 줄이 필요합니다.
});

// 2. 창고에 들어가서 서랍장 조립 시작!
db.connect((err) => {
    if (err) {
        console.error('❌ 창고 연결에 실패했습니다.', err);
        return;
    }
    console.log('✅ 클라우드 창고에 무사히 입장했습니다! 도면대로 서랍장 조립을 시작합니다...');

    // database_setup.sql 도면 파일 읽어오기
    const sql_blueprint = fs.readFileSync(path.join(__dirname, 'database_setup.sql'), 'utf8');

    // 창고에 서랍장 뚝딱뚝딱 만들기
    db.query(sql_blueprint, (err, result) => {
        if (err) {
            console.error('❌ 서랍장 조립 중 문제가 발생했습니다:', err);
            return;
        }
        console.log('🎉 축하합니다! 팜마을 서랍장(테이블) 세팅이 완벽하게 끝났습니다!');
        console.log('이제 이 파일은 지우셔도 됩니다.');
        db.end(); // 작업이 끝났으니 창고 문 닫고 퇴근!
    });
});
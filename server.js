const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
// 다른 주소(프론트엔드)에서 접근할 수 있도록 문을 열어줍니다.
app.use(cors());

const server = http.createServer(app);

// Socket.io (실시간 전화 교환기) 세팅
const io = new Server(server, {
    cors: {
        origin: "*", // 테스트를 위해 우선 모든 접속을 허용합니다.
        methods: ["GET", "POST"]
    }
});

// 누군가 웹사이트에 들어와서 통신망에 연결되었을 때 작동하는 부분
io.on('connection', (socket) => {
    console.log('🟢 새로운 사용자가 접속했습니다! (ID:', socket.id, ')');

    // 사용자가 웹사이트를 끄거나 나갔을 때
    socket.on('disconnect', () => {
        console.log('🔴 사용자가 퇴장했습니다. (ID:', socket.id, ')');
    });
});

// Nginx 문지기가 바라보고 있는 4000번 방에서 대기 시작!
const PORT = 4000;
server.listen(PORT, () => {
    console.log(`🚀 운세톡 실시간 통화 서버가 ${PORT}번 방에서 대기 중입니다!`);
});
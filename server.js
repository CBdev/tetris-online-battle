// server.js
// 실행 방법:
// 1) Node.js 설치
// 2) 이 파일을 server.js로 저장
// 3) 같은 폴더에서 터미널 실행
// 4) npm init -y
// 5) npm install express ws
// 6) node server.js
// 7) 1P PC: http://localhost:3000
// 8) 2P PC: http://서버PC의IP주소:3000

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const clients = new Map();
let nextPlayer = 1;

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  let player = null;

  if (nextPlayer <= 2) {
    player = nextPlayer;
    nextPlayer++;
    clients.set(ws, player);
    ws.send(JSON.stringify({ type: 'assign', player }));
    broadcast({ type: 'system', message: `${player}P 접속` });
  } else {
    ws.send(JSON.stringify({ type: 'full' }));
    ws.close();
    return;
  }

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === 'state' || data.type === 'attack' || data.type === 'lose' || data.type === 'restart') {
      broadcast({ ...data, player });
    }
  });

  ws.on('close', () => {
    const disconnected = clients.get(ws);
    clients.delete(ws);
    broadcast({ type: 'system', message: `${disconnected}P 접속 종료` });

    if (disconnected === 1 || disconnected === 2) {
      nextPlayer = Math.min(nextPlayer, disconnected);
    }
  });
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>온라인 2인 대전 테트리스</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: radial-gradient(circle at top, #1f2937, #020617 70%);
      font-family: Arial, sans-serif;
      color: #f8fafc;
    }
    .game-wrap {
      width: min(1180px, calc(100vw - 24px));
      display: grid;
      grid-template-columns: 1fr 230px 1fr;
      gap: 20px;
      padding: 24px;
      border-radius: 24px;
      background: rgba(15, 23, 42, 0.88);
      box-shadow: 0 24px 80px rgba(0,0,0,.45);
      border: 1px solid rgba(148,163,184,.18);
    }
    .player-area { display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .player-title {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(30,41,59,.82);
      border: 1px solid rgba(148,163,184,.16);
    }
    .player-title strong { font-size: 20px; }
    .mine { color: #38bdf8; font-weight: 800; }
    .winner { color: #facc15; font-weight: 800; }
    canvas {
      background: #020617;
      border-radius: 14px;
      border: 2px solid #334155;
      box-shadow: inset 0 0 24px rgba(15,23,42,.7);
      max-width: 100%;
    }
    .center-panel { display: flex; flex-direction: column; gap: 14px; }
    h1 { margin: 0; font-size: 25px; line-height: 1.2; letter-spacing: -0.04em; text-align: center; }
    .card { padding: 15px; border-radius: 16px; background: rgba(30,41,59,.82); border: 1px solid rgba(148,163,184,.16); }
    .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .label { font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
    .value { font-size: 24px; font-weight: 800; }
    .controls, .rule { line-height: 1.65; font-size: 13px; color: #cbd5e1; }
    .controls strong { color: #f8fafc; }
    button {
      width: 100%; border: 0; border-radius: 14px; padding: 13px 14px;
      font-size: 15px; font-weight: 800; cursor: pointer; color: #020617;
      background: linear-gradient(135deg, #38bdf8, #a78bfa);
    }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .status { min-height: 42px; color: #fbbf24; font-weight: 800; text-align: center; line-height: 1.4; }
    @media (max-width: 980px) {
      body { align-items: flex-start; padding: 12px 0; }
      .game-wrap { grid-template-columns: 1fr; padding: 16px; }
      .center-panel { order: -1; }
    }
  </style>
</head>
<body>
  <main class="game-wrap">
    <section class="player-area">
      <div class="player-title"><strong>1P</strong><span id="p1State">대기중</span></div>
      <canvas id="board1" width="300" height="600"></canvas>
    </section>

    <section class="center-panel">
      <h1>온라인 2인 대전<br>테트리스</h1>
      <div class="status" id="status">서버 연결 중...</div>
      <div class="card">
        <div class="score-grid">
          <div><div class="label">1P 점수</div><div class="value" id="p1Score">0</div></div>
          <div><div class="label">2P 점수</div><div class="value" id="p2Score">0</div></div>
          <div><div class="label">1P 삭제줄</div><div class="value" id="p1Lines">0</div></div>
          <div><div class="label">2P 삭제줄</div><div class="value" id="p2Lines">0</div></div>
        </div>
      </div>
      <div class="card controls">
        <strong>내 조작키</strong><br>
        ← / → : 이동<br>
        ↑ : 회전<br>
        ↓ : 빠르게 내리기<br>
        Space : 즉시 떨어뜨리기<br>
        P : 일시정지
      </div>
      <div class="card rule">
        접속 순서대로 1P, 2P가 됩니다.<br>
        2줄 이상 삭제하면 상대에게 방해줄을 보냅니다.<br>
        같은 와이파이 또는 내부망에서 접속해야 합니다.
      </div>
      <button id="restartBtn" disabled>새 게임</button>
    </section>

    <section class="player-area">
      <div class="player-title"><strong>2P</strong><span id="p2State">대기중</span></div>
      <canvas id="board2" width="300" height="600"></canvas>
    </section>
  </main>

<script>
const COLS = 10, ROWS = 20, BLOCK = 30;
const COLORS = { I:'#22d3ee', J:'#60a5fa', L:'#fb923c', O:'#facc15', S:'#4ade80', T:'#c084fc', Z:'#f87171', G:'#64748b' };
const SHAPES = {
  I:[[1,1,1,1]], J:[[1,0,0],[1,1,1]], L:[[0,0,1],[1,1,1]], O:[[1,1],[1,1]],
  S:[[0,1,1],[1,1,0]], T:[[0,1,0],[1,1,1]], Z:[[1,1,0],[0,1,1]]
};

const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restartBtn');
let myPlayer = null;
let paused = false;
let finished = false;
let animationId;
let lastTime = 0;
let ws;

const p1 = createPlayer('1P', document.getElementById('board1'), document.getElementById('p1Score'), document.getElementById('p1Lines'), document.getElementById('p1State'));
const p2 = createPlayer('2P', document.getElementById('board2'), document.getElementById('p2Score'), document.getElementById('p2Lines'), document.getElementById('p2State'));
const players = [p1, p2];

function createPlayer(name, canvas, scoreEl, linesEl, stateEl) {
  return { name, canvas, ctx: canvas.getContext('2d'), scoreEl, linesEl, stateEl, board: createBoard(), piece: null, score: 0, lines: 0, level: 1, dropCounter: 0, dropInterval: 900, lost: false };
}
function createBoard() { return Array.from({length: ROWS}, () => Array(COLS).fill(null)); }
function randomPiece() {
  const types = Object.keys(SHAPES);
  const type = types[Math.floor(Math.random() * types.length)];
  return { type, shape: SHAPES[type].map(r => [...r]), x: Math.floor(COLS/2) - Math.ceil(SHAPES[type][0].length/2), y: 0 };
}
function drawBlock(ctx, x, y, color) {
  ctx.fillStyle = color; ctx.fillRect(x*BLOCK, y*BLOCK, BLOCK, BLOCK);
  ctx.strokeStyle = 'rgba(15,23,42,.65)'; ctx.lineWidth = 2; ctx.strokeRect(x*BLOCK+1, y*BLOCK+1, BLOCK-2, BLOCK-2);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x*BLOCK+4, y*BLOCK+4, BLOCK-8, 5);
}
function drawPlayer(player) {
  const { ctx, canvas } = player;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = 'rgba(51,65,85,.35)'; ctx.lineWidth = 1;
  for (let x=0; x<=COLS; x++) { ctx.beginPath(); ctx.moveTo(x*BLOCK,0); ctx.lineTo(x*BLOCK,canvas.height); ctx.stroke(); }
  for (let y=0; y<=ROWS; y++) { ctx.beginPath(); ctx.moveTo(0,y*BLOCK); ctx.lineTo(canvas.width,y*BLOCK); ctx.stroke(); }
  player.board.forEach((row,y) => row.forEach((cell,x) => { if (cell) drawBlock(ctx,x,y,COLORS[cell]); }));
  if (player.piece && !player.lost) {
    player.piece.shape.forEach((row,dy) => row.forEach((cell,dx) => { if (cell) drawBlock(ctx, player.piece.x+dx, player.piece.y+dy, COLORS[player.piece.type]); }));
  }
  if (player.lost) {
    ctx.fillStyle = 'rgba(2,6,23,.76)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.fillText('LOSE', canvas.width/2, canvas.height/2);
  }
}
function drawAll() { players.forEach(drawPlayer); }
function collide(player, testPiece = player.piece) {
  if (!testPiece) return false;
  return testPiece.shape.some((row,dy) => row.some((cell,dx) => {
    if (!cell) return false;
    const x = testPiece.x + dx, y = testPiece.y + dy;
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && player.board[y][x]);
  }));
}
function mergePiece(player) {
  player.piece.shape.forEach((row,dy) => row.forEach((cell,dx) => {
    if (cell) {
      const y = player.piece.y + dy, x = player.piece.x + dx;
      if (y >= 0) player.board[y][x] = player.piece.type;
    }
  }));
}
function clearLines(player) {
  let cleared = 0;
  for (let y=ROWS-1; y>=0; y--) {
    if (player.board[y].every(Boolean)) {
      player.board.splice(y,1); player.board.unshift(Array(COLS).fill(null)); cleared++; y++;
    }
  }
  if (cleared > 0) {
    player.score += [0,100,300,500,800][cleared] * player.level;
    player.lines += cleared;
    player.level = Math.floor(player.lines / 10) + 1;
    player.dropInterval = Math.max(120, 900 - (player.level - 1) * 80);
    updatePanel(player);
    if (cleared >= 2) send({ type:'attack', count: cleared - 1 });
  }
}
function addGarbageLines(player, count) {
  if (player.lost) return;
  for (let i=0; i<count; i++) {
    player.board.shift();
    const hole = Math.floor(Math.random() * COLS);
    player.board.push(Array.from({length: COLS}, (_,x) => x === hole ? null : 'G'));
  }
  if (collide(player)) lose(player);
}
function rotate(matrix) { return matrix[0].map((_,i) => matrix.map(row => row[i]).reverse()); }
function rotatePiece(player) {
  if (player.lost) return;
  const original = player.piece.shape;
  const rotated = rotate(player.piece.shape);
  for (const offset of [0,-1,1,-2,2]) {
    player.piece.shape = rotated; player.piece.x += offset;
    if (!collide(player)) return;
    player.piece.x -= offset;
  }
  player.piece.shape = original;
}
function movePiece(player, dir) { if (!player.lost) { player.piece.x += dir; if (collide(player)) player.piece.x -= dir; } }
function dropPiece(player) {
  if (player.lost) return;
  player.piece.y++;
  if (collide(player)) {
    player.piece.y--; mergePiece(player); clearLines(player); player.piece = randomPiece();
    if (collide(player)) lose(player);
  }
  player.dropCounter = 0;
}
function hardDrop(player) {
  if (player.lost) return;
  while (!collide(player)) player.piece.y++;
  player.piece.y--; mergePiece(player); clearLines(player); player.piece = randomPiece();
  if (collide(player)) lose(player);
  player.dropCounter = 0;
}
function updatePanel(player) { player.scoreEl.textContent = player.score; player.linesEl.textContent = player.lines; }
function serializePlayer(player) { return { board: player.board, piece: player.piece, score: player.score, lines: player.lines, lost: player.lost }; }
function applyRemoteState(player, state) {
  player.board = state.board; player.piece = state.piece; player.score = state.score; player.lines = state.lines; player.lost = state.lost;
  updatePanel(player);
}
function send(data) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function getMine() { return myPlayer === 1 ? p1 : p2; }
function getOpponent() { return myPlayer === 1 ? p2 : p1; }
function syncMine() { if (myPlayer) send({ type:'state', state: serializePlayer(getMine()) }); }
function lose(player) {
  player.lost = true; player.stateEl.textContent = '패배';
  finished = true;
  send({ type:'lose' });
  statusEl.textContent = '패배했습니다.';
  drawAll(); cancelAnimationFrame(animationId);
}
function startLocalGame() {
  players.forEach(player => {
    player.board = createBoard(); player.piece = randomPiece(); player.score = 0; player.lines = 0; player.level = 1;
    player.dropCounter = 0; player.dropInterval = 900; player.lost = false; player.stateEl.textContent = '진행중'; updatePanel(player);
  });
  paused = false; finished = false; lastTime = 0; statusEl.textContent = myPlayer + 'P로 플레이 중';
  cancelAnimationFrame(animationId); update();
}
function restartGame() { send({ type:'restart' }); startLocalGame(); syncMine(); }
function togglePause() {
  if (finished || !myPlayer) return;
  paused = !paused; statusEl.textContent = paused ? '일시정지' : myPlayer + 'P로 플레이 중';
  if (!paused) { lastTime = performance.now(); update(lastTime); }
}
function update(time = 0) {
  if (finished || paused || !myPlayer) return;
  const mine = getMine();
  const delta = time - lastTime; lastTime = time;
  mine.dropCounter += delta;
  if (mine.dropCounter > mine.dropInterval) dropPiece(mine);
  drawAll(); syncMine();
  animationId = requestAnimationFrame(update);
}
function connect() {
  ws = new WebSocket('ws://' + location.host);
  ws.onopen = () => { statusEl.textContent = '상대 접속 대기 중...'; };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'assign') {
      myPlayer = data.player;
      restartBtn.disabled = false;
      p1.stateEl.innerHTML = myPlayer === 1 ? '<span class="mine">내 화면</span>' : '상대';
      p2.stateEl.innerHTML = myPlayer === 2 ? '<span class="mine">내 화면</span>' : '상대';
      statusEl.textContent = myPlayer + 'P로 접속됨. 새 게임을 누르세요.';
      drawAll();
    }
    if (data.type === 'full') statusEl.textContent = '이미 2명이 접속 중입니다.';
    if (data.type === 'system') statusEl.textContent = data.message;
    if (data.type === 'restart') { startLocalGame(); }
    if (data.type === 'state' && data.player !== myPlayer) {
      applyRemoteState(data.player === 1 ? p1 : p2, data.state);
      drawAll();
    }
    if (data.type === 'attack' && data.player !== myPlayer) {
      addGarbageLines(getMine(), data.count);
      syncMine(); drawAll();
    }
    if (data.type === 'lose' && data.player !== myPlayer) {
      finished = true;
      getOpponent().lost = true;
      getOpponent().stateEl.textContent = '패배';
      getMine().stateEl.innerHTML = '<span class="winner">승리</span>';
      statusEl.textContent = '승리했습니다!';
      drawAll(); cancelAnimationFrame(animationId);
    }
  };
  ws.onclose = () => { statusEl.textContent = '서버 연결이 끊겼습니다.'; };
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (finished || paused || !myPlayer) return;
  const mine = getMine();
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'ArrowLeft') movePiece(mine, -1);
  if (e.code === 'ArrowRight') movePiece(mine, 1);
  if (e.code === 'ArrowDown') dropPiece(mine);
  if (e.code === 'ArrowUp') rotatePiece(mine);
  if (e.code === 'Space') hardDrop(mine);
  drawAll(); syncMine();
});
restartBtn.addEventListener('click', restartGame);
connect();
drawAll();
</script>
</body>
</html>`);
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log('온라인 2인 대전 테트리스 서버 실행 중');
  console.log(`서버 PC 접속: http://localhost:${PORT}`);
  console.log(`같은 내부망 접속: http://${ip}:${PORT}`);
  console.log('외부 접속은 ngrok, Cloudflare Tunnel, Render, Railway 등 공개 주소를 사용하세요.');
});

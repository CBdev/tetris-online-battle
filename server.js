// server.js
// 5인 온라인 대전 테트리스 + 실시간 채팅
// 실행:
// npm init -y
// npm install express ws
// node server.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 5;

const clients = new Map();

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function usedPlayers() {
  return [...clients.values()].map(c => c.player);
}

function playerNames() {
  const names = {};
  for (const info of clients.values()) {
    names[info.player] = info.nickname || (info.player + 'P');
  }
  return names;
}

function getAvailablePlayer() {
  const used = usedPlayers();
  for (let i = 1; i <= MAX_PLAYERS; i++) {
    if (!used.includes(i)) return i;
  }
  return null;
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function sendPlayers() {
  broadcast({
    type: 'players',
    players: [...clients.values()].map(c => c.player),
    names: playerNames()
  });
}

wss.on('connection', (ws) => {
  const player = getAvailablePlayer();

  if (!player) {
    ws.send(JSON.stringify({ type: 'full' }));
    ws.close();
    return;
  }

  clients.set(ws, { player, nickname: player + 'P' });
  ws.send(JSON.stringify({ type: 'assign', player, maxPlayers: MAX_PLAYERS }));
  broadcast({ type: 'system', message: player + 'P 접속' });
  sendPlayers();

  ws.on('message', (message) => {
    let data;
    try { data = JSON.parse(message); } catch { return; }

    if (data.type === 'join') {
      const info = clients.get(ws);
      const nickname = String(data.nickname || '').trim().slice(0, 12) || (player + 'P');
      if (info) info.nickname = nickname;
      broadcast({ type: 'system', message: player + 'P ' + nickname + ' 입장' });
      sendPlayers();
      return;
    }

    if (['state', 'attack', 'lose', 'restart', 'chat'].includes(data.type)) {
      const info = clients.get(ws);
      broadcast({ ...data, player, nickname: info ? info.nickname : player + 'P' });
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    clients.delete(ws);
    if (info) broadcast({ type: 'system', message: info.player + 'P ' + (info.nickname || '') + ' 접속 종료' });
    sendPlayers();
  });
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>5인 온라인 대전 테트리스</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at top, #1f2937, #020617 70%);
      font-family: Arial, sans-serif;
      color: #f8fafc;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 10px;
    }
    .join-modal {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(2,6,23,.82);
      backdrop-filter: blur(6px);
    }
    .join-modal.show { display: flex; }
    .join-modal.hidden { display: none; }
    .join-box {
      width: min(360px, calc(100vw - 32px));
      padding: 24px;
      border-radius: 22px;
      background: rgba(15,23,42,.96);
      border: 1px solid rgba(148,163,184,.22);
      box-shadow: 0 24px 80px rgba(0,0,0,.5);
      text-align: center;
    }
    .join-box h2 { margin: 0 0 8px; font-size: 24px; }
    .join-box p { margin: 0 0 16px; color: #cbd5e1; font-size: 14px; }
    .join-box form { display: flex; flex-direction: column; gap: 10px; }
    .join-box input {
      border: 1px solid #475569;
      background: #020617;
      color: #f8fafc;
      border-radius: 12px;
      padding: 13px;
      outline: none;
      font-size: 15px;
      text-align: center;
    }
    .game-wrap {
      width: min(1900px, calc(100vw - 20px));
      height: min(1060px, calc(100vh - 20px));
      display: grid;
      grid-template-columns: 390px 1fr 1fr 330px;
      grid-template-rows: repeat(2, 1fr);
      gap: 14px;
      padding: 14px;
      border-radius: 24px;
      background: rgba(15, 23, 42, 0.9);
      box-shadow: 0 24px 80px rgba(0,0,0,.45);
      border: 1px solid rgba(148,163,184,.18);
    }
    .player-area { display: flex; flex-direction: column; align-items: center; gap: 8px; transition: transform .2s ease, opacity .2s ease; min-height: 0; }
    .player-area.is-mine {
      grid-column: 1;
      grid-row: 1 / 3;
      align-self: start;
      justify-self: center;
      width: 100%;
    }
    .player-area.is-mine canvas[id^="board"] {
      width: 360px;
      max-width: 360px;
      border-color: #38bdf8;
    }
    .player-area.is-mine .player-title {
      max-width: 360px;
      border-color: #38bdf8;
      box-shadow: 0 0 0 1px rgba(56,189,248,.35);
    }
    .player-area.is-mine .preview-card { width: 120px; }
    .player-area.is-opponent {
      width: 100%;
      height: 100%;
      max-width: 100%;
      display: grid;
      grid-template-columns: auto auto;
      grid-template-rows: auto 1fr;
      align-items: center;
      justify-content: center;
      justify-items: center;
      column-gap: 2px;
      row-gap: 4px;
      opacity: .95;
      padding: 8px;
      border-radius: 16px;
      background: rgba(30,41,59,.55);
      border: 1px solid rgba(148,163,184,.16);
      overflow: hidden;
    }
    .player-area.is-opponent canvas[id^="board"] {
      width: 145px;
      max-width: 145px;
      align-self: center;
      grid-column: 1;
      grid-row: 2;
    }
    .player-area.is-opponent .player-title {
      width: 100%;
      padding: 7px 9px;
      min-width: 0;
      grid-column: 1 / 3;
      grid-row: 1;
    }
    .player-area.is-opponent .preview-card {
      width: 70px;
      padding: 3px;
      grid-column: 2;
      grid-row: 2;
      align-self: center;
    }
    .player-area.is-opponent .preview-label { font-size: 9px; margin-bottom: 2px; }
    .player-area.is-opponent .player-title strong {
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 120px;
    }
    .player-area.is-opponent .player-title span {
      font-size: 11px;
      white-space: nowrap;
    }
    .player-title {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(30,41,59,.82);
      border: 1px solid rgba(148,163,184,.16);
    }
    .player-title strong { font-size: 20px; }
    .mine { color: #38bdf8; font-weight: 800; }
    .winner { color: #facc15; font-weight: 800; }
    .dead { color: #f87171; font-weight: 800; }
    canvas {
      background: #020617;
      border-radius: 14px;
      border: 2px solid #334155;
      box-shadow: inset 0 0 24px rgba(15,23,42,.7);
      width: 100%;
      max-width: 300px;
      height: auto;
      aspect-ratio: 1 / 2;
      display: block;
    }
    .panel { grid-column: 4; grid-row: 1 / 3; display: flex; flex-direction: column; gap: 9px; min-width: 0; max-height: 100%; overflow: hidden; }
    h1 { margin: 0; font-size: 22px; line-height: 1.2; letter-spacing: -0.04em; text-align: center; }
    .card { padding: 10px; border-radius: 16px; background: rgba(30,41,59,.82); border: 1px solid rgba(148,163,184,.16); }
    .status { min-height: 42px; color: #fbbf24; font-weight: 800; text-align: center; line-height: 1.4; }
    .score-list { display: grid; gap: 5px; }
    .score-row { display: grid; grid-template-columns: 78px 1fr 1fr 1fr; gap: 5px; align-items: center; font-size: 12px; }
    .score-row strong { font-size: 15px; }
    .label { color: #94a3b8; font-size: 12px; }
    .controls, .rule { line-height: 1.38; font-size: 12px; color: #cbd5e1; }
    .controls strong { color: #f8fafc; }
    button {
      width: 100%; border: 0; border-radius: 14px; padding: 12px 14px;
      font-size: 15px; font-weight: 800; cursor: pointer; color: #020617;
      background: linear-gradient(135deg, #38bdf8, #a78bfa);
    }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .preview-card {
      width: 120px;
      padding: 8px;
      border-radius: 14px;
      background: rgba(30,41,59,.82);
      border: 1px solid rgba(148,163,184,.16);
      text-align: center;
    }
    .preview-label {
      margin-bottom: 6px;
      font-size: 12px;
      color: #94a3b8;
    }
    .preview-card canvas {
      width: 100%;
      height: auto;
      aspect-ratio: 4 / 3;
      max-width: none;
      border-radius: 10px;
      border: 1px solid #334155;
    }
    .chat-box { height: 115px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }
    .chat-line { font-size: 12px; line-height: 1.4; color: #e2e8f0; word-break: break-word; }
    .chat-line.system { color: #fbbf24; }
    .chat-form { display: flex; gap: 6px; margin-top: 10px; }
    .chat-form input {
      flex: 1;
      min-width: 0;
      border: 1px solid #475569;
      background: #020617;
      color: #f8fafc;
      border-radius: 10px;
      padding: 10px;
      outline: none;
    }
    .chat-form button { width: 58px; padding: 10px; }
    @media (max-width: 1600px) {
      body { padding: 6px; }
      .game-wrap {
        width: 100%;
        height: calc(100vh - 12px);
        grid-template-columns: 330px minmax(240px, 1fr) 270px;
        grid-template-rows: repeat(2, 1fr);
        gap: 8px;
        padding: 8px;
      }
      .player-area.is-mine canvas[id^="board"] { width: 310px; max-width: 310px; }
      .player-area.is-mine .player-title { max-width: 310px; }
      .player-area.is-opponent {
        grid-template-columns: auto auto;
        column-gap: 2px;
        row-gap: 3px;
        padding: 6px;
      }
      .player-area.is-opponent canvas[id^="board"] { width: 100px; max-width: 100px; }
      .player-area.is-opponent .preview-card { display: block; width: 58px; padding: 3px; }
      .player-area.is-opponent .preview-label { font-size: 9px; }
      .player-area.is-opponent .player-title { padding: 5px 6px; }
      .player-area.is-opponent .player-title strong { font-size: 11px; max-width: 86px; }
      .player-area.is-opponent .player-title span { font-size: 10px; }
      h1 { font-size: 18px; }
      .card { padding: 8px; }
      .score-row { font-size: 12px; grid-template-columns: 60px 1fr 1fr 1fr; }
      .controls, .rule { font-size: 11px; line-height: 1.35; }
      .chat-box { height: 85px; }
      .preview-card { width: 105px; padding: 6px; }
    }
    @media (max-width: 900px) {
      html, body { overflow-y: auto; }
      body { height: auto; min-height: 100vh; overflow-y: auto; }
      .game-wrap {
        height: auto;
        grid-template-columns: 1fr;
        grid-template-rows: auto;
      }
      .panel { grid-column: 1 !important; grid-row: auto !important; order: -1; }
      .player-area.is-mine { grid-column: 1 !important; grid-row: auto !important; }
      .player-area.is-mine canvas[id^="board"] { max-width: 300px; }
      .player-area.is-opponent {
        grid-column: 1 !important;
        grid-row: auto !important;
        grid-template-columns: auto auto;
        max-width: 360px;
        justify-self: center;
      }
      .player-area.is-opponent canvas[id^="board"] { width: min(100%, 115px); max-width: 115px; }
      .player-area.is-opponent .preview-card { width: 62px; display: block; }
    }
  </style>
</head>
<body>
  <div class="join-modal" id="joinModal">
    <div class="join-box">
      <h2>플레이어 이름 입력</h2>
      <p>게임에서 표시될 이름을 입력하세요.</p>
      <form id="joinForm">
        <input id="nicknameInput" maxlength="12" placeholder="예: 정혁" autocomplete="off" />
        <button type="submit">입장하기</button>
      </form>
    </div>
  </div>

  <main class="game-wrap">
    <section class="player-area" id="area1">
      <div class="player-title"><strong id="p1Name">1P</strong><span id="p1State">대기중</span></div>
      <canvas id="board1" width="300" height="600"></canvas>
      <div class="preview-card">
        <div class="preview-label">다음 블록</div>
        <canvas id="next1" width="120" height="90"></canvas>
      </div>
    </section>
    <section class="player-area" id="area2">
      <div class="player-title"><strong id="p2Name">2P</strong><span id="p2State">대기중</span></div>
      <canvas id="board2" width="300" height="600"></canvas>
      <div class="preview-card">
        <div class="preview-label">다음 블록</div>
        <canvas id="next2" width="120" height="90"></canvas>
      </div>
    </section>
    <section class="player-area" id="area3">
      <div class="player-title"><strong id="p3Name">3P</strong><span id="p3State">대기중</span></div>
      <canvas id="board3" width="300" height="600"></canvas>
      <div class="preview-card">
        <div class="preview-label">다음 블록</div>
        <canvas id="next3" width="120" height="90"></canvas>
      </div>
    </section>
    <section class="player-area" id="area4">
      <div class="player-title"><strong id="p4Name">4P</strong><span id="p4State">대기중</span></div>
      <canvas id="board4" width="300" height="600"></canvas>
      <div class="preview-card">
        <div class="preview-label">다음 블록</div>
        <canvas id="next4" width="120" height="90"></canvas>
      </div>
    </section>
    <section class="player-area" id="area5">
      <div class="player-title"><strong id="p5Name">5P</strong><span id="p5State">대기중</span></div>
      <canvas id="board5" width="300" height="600"></canvas>
      <div class="preview-card">
        <div class="preview-label">다음 블록</div>
        <canvas id="next5" width="120" height="90"></canvas>
      </div>
    </section>

    <section class="panel">
      <h1>5인 온라인 대전<br>테트리스</h1>
      <div class="status" id="status">서버 연결 중...</div>
      <button id="restartBtn" disabled>새 게임</button>

      <div class="card score-list">
        <div class="score-row label"><span></span><span>점수</span><span>줄</span><span>콤보</span></div>
        <div class="score-row"><strong id="s1Name">1P</strong><span id="p1Score">0</span><span id="p1Lines">0</span><span id="p1Combo">0</span></div>
        <div class="score-row"><strong id="s2Name">2P</strong><span id="p2Score">0</span><span id="p2Lines">0</span><span id="p2Combo">0</span></div>
        <div class="score-row"><strong id="s3Name">3P</strong><span id="p3Score">0</span><span id="p3Lines">0</span><span id="p3Combo">0</span></div>
        <div class="score-row"><strong id="s4Name">4P</strong><span id="p4Score">0</span><span id="p4Lines">0</span><span id="p4Combo">0</span></div>
        <div class="score-row"><strong id="s5Name">5P</strong><span id="p5Score">0</span><span id="p5Lines">0</span><span id="p5Combo">0</span></div>
      </div>

      <div class="card controls">
        <strong>조작키</strong><br>
        ← / → : 이동<br>
        ↑ : 회전<br>
        ↓ : 빠르게 내리기<br>
        Space : 즉시 떨어뜨리기<br>
        P : 일시정지
      </div>

      <div class="card rule">
        5명 중 마지막 생존자가 승리합니다.<br>
        2줄 이상 삭제하면 생존 상대 중 1명에게 방해줄을 보냅니다.<br>
        콤보가 높을수록 추가 공격이 붙습니다.
      </div>

      <div class="card">
        <div class="label" style="margin-bottom:8px;">실시간 대화</div>
        <div class="chat-box" id="chatBox"></div>
        <form class="chat-form" id="chatForm">
          <input id="chatInput" maxlength="80" placeholder="메시지 입력" autocomplete="off" />
          <button type="submit">전송</button>
        </form>
      </div>
    </section>
  </main>

<script>
const COLS = 10, ROWS = 20, BLOCK = 30, MAX_PLAYERS = 5;
const COLORS = { I:'#22d3ee', J:'#60a5fa', L:'#fb923c', O:'#facc15', S:'#4ade80', T:'#c084fc', Z:'#f87171', G:'#64748b' };
const SHAPES = {
  I:[[1,1,1,1]], J:[[1,0,0],[1,1,1]], L:[[0,0,1],[1,1,1]], O:[[1,1],[1,1]],
  S:[[0,1,1],[1,1,0]], T:[[0,1,0],[1,1,1]], Z:[[1,1,0],[0,1,1]]
};

const joinModal = document.getElementById('joinModal');
const joinForm = document.getElementById('joinForm');
const nicknameInput = document.getElementById('nicknameInput');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restartBtn');
const chatBox = document.getElementById('chatBox');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
let myPlayer = null;
let connectedPlayers = [];
let playerNames = {};
let myNickname = '';
let paused = false;
let finished = false;
let animationId;
let lastTime = 0;
let ws;

const players = [1,2,3,4,5].map(n => createPlayer(
  n,
  document.getElementById('board' + n),
  document.getElementById('next' + n),
  document.getElementById('p' + n + 'Score'),
  document.getElementById('p' + n + 'Lines'),
  document.getElementById('p' + n + 'Combo'),
  document.getElementById('p' + n + 'State')
));

function createPlayer(num, canvas, nextCanvas, scoreEl, linesEl, comboEl, stateEl) {
  return { num, name: num + 'P', nameEl: document.getElementById('p' + num + 'Name'), scoreNameEl: document.getElementById('s' + num + 'Name'), areaEl: document.getElementById('area' + num), canvas, ctx: canvas.getContext('2d'), nextCanvas, nextCtx: nextCanvas.getContext('2d'), scoreEl, linesEl, comboEl, stateEl, board: createBoard(), piece: null, nextPiece: null, score: 0, lines: 0, combo: 0, level: 1, dropCounter: 0, dropInterval: 900, lost: false, active: false };
}
function createBoard() { return Array.from({length: ROWS}, () => Array(COLS).fill(null)); }
function getPlayer(num) { return players[num - 1]; }
function getMine() { return getPlayer(myPlayer); }
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
  if (player.lost) overlayText(ctx, canvas, 'LOSE');
  if (!player.active) overlayText(ctx, canvas, 'WAIT');
}
function overlayText(ctx, canvas, text) {
  ctx.fillStyle = 'rgba(2,6,23,.76)'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.fillText(text, canvas.width/2, canvas.height/2);
}
function drawPreview(player) {
  const ctx = player.nextCtx;
  const canvas = player.nextCanvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!player.nextPiece) return;

  const shape = player.nextPiece.shape;
  const block = 22;
  const shapeW = shape[0].length * block;
  const shapeH = shape.length * block;
  const offsetX = Math.floor((canvas.width - shapeW) / 2);
  const offsetY = Math.floor((canvas.height - shapeH) / 2);

  shape.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) return;
      ctx.fillStyle = COLORS[player.nextPiece.type];
      ctx.fillRect(offsetX + x * block, offsetY + y * block, block, block);
      ctx.strokeStyle = 'rgba(15,23,42,.65)';
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX + x * block + 1, offsetY + y * block + 1, block - 2, block - 2);
    });
  });
}
function drawAll() { players.forEach(player => { drawPlayer(player); drawPreview(player); }); }
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
function aliveOpponents() {
  return players.filter(p => p.active && !p.lost && p.num !== myPlayer);
}
function clearLines(player) {
  let cleared = 0;
  for (let y=ROWS-1; y>=0; y--) {
    if (player.board[y].every(Boolean)) {
      player.board.splice(y,1); player.board.unshift(Array(COLS).fill(null)); cleared++; y++;
    }
  }
  if (cleared > 0) {
    player.combo++;
    const baseScore = [0,100,300,500,800][cleared] * player.level;
    const comboBonus = player.combo >= 2 ? player.combo * 50 * player.level : 0;
    player.score += baseScore + comboBonus;
    player.lines += cleared;
    player.level = Math.floor(player.lines / 10) + 1;
    player.dropInterval = Math.max(120, 900 - (player.level - 1) * 80);
    updatePanel(player);

    let attackCount = cleared >= 2 ? cleared - 1 : 0;
    if (player.combo >= 3) attackCount += 1;
    if (player.combo >= 5) attackCount += 1;
    const targets = aliveOpponents();
    if (attackCount > 0 && targets.length > 0) {
      const target = targets[Math.floor(Math.random() * targets.length)].num;
      send({ type:'attack', count: attackCount, target });
      addChatLine('system', player.name + ' → ' + target + 'P 공격줄 ' + attackCount + '개');
    }
  } else {
    player.combo = 0;
    updatePanel(player);
  }
}
function addGarbageLines(player, count) {
  if (player.lost || !player.active) return;
  for (let i=0; i<count; i++) {
    player.board.shift();
    const hole = Math.floor(Math.random() * COLS);
    player.board.push(Array.from({length: COLS}, (_,x) => x === hole ? null : 'G'));
  }
  if (collide(player)) lose(player);
}
function rotate(matrix) { return matrix[0].map((_,i) => matrix.map(row => row[i]).reverse()); }
function rotatePiece(player) {
  if (player.lost || !player.active) return;
  const original = player.piece.shape;
  const rotated = rotate(player.piece.shape);
  for (const offset of [0,-1,1,-2,2]) {
    player.piece.shape = rotated; player.piece.x += offset;
    if (!collide(player)) return;
    player.piece.x -= offset;
  }
  player.piece.shape = original;
}
function movePiece(player, dir) { if (!player.lost && player.active) { player.piece.x += dir; if (collide(player)) player.piece.x -= dir; } }
function dropPiece(player) {
  if (player.lost || !player.active) return;
  player.piece.y++;
  if (collide(player)) {
    player.piece.y--; mergePiece(player); clearLines(player); spawnNextPiece(player);
    if (collide(player)) lose(player);
  }
  player.dropCounter = 0;
}
function hardDrop(player) {
  if (player.lost || !player.active) return;
  while (!collide(player)) player.piece.y++;
  player.piece.y--; mergePiece(player); clearLines(player); spawnNextPiece(player);
  if (collide(player)) lose(player);
  player.dropCounter = 0;
}
function spawnNextPiece(player) {
  player.piece = player.nextPiece || randomPiece();
  player.nextPiece = randomPiece();
}
function updatePanel(player) { player.scoreEl.textContent = player.score; player.linesEl.textContent = player.lines; player.comboEl.textContent = player.combo; }
function serializePlayer(player) { return { board: player.board, piece: player.piece, nextPiece: player.nextPiece, score: player.score, lines: player.lines, combo: player.combo, lost: player.lost, active: player.active }; }
function applyRemoteState(player, state) {
  player.board = state.board; player.piece = state.piece; player.nextPiece = state.nextPiece || null; player.score = state.score; player.lines = state.lines; player.combo = state.combo || 0; player.lost = state.lost; player.active = state.active;
  updatePanel(player); updateStates();
}
function send(data) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function syncMine() { if (myPlayer) send({ type:'state', state: serializePlayer(getMine()) }); }
function checkWinner() {
  const activeAlive = players.filter(p => p.active && !p.lost);
  if (connectedPlayers.length >= 2 && activeAlive.length === 1) {
    finished = true;
    activeAlive[0].stateEl.innerHTML = '<span class="winner">승리</span>';
    statusEl.textContent = activeAlive[0].name + ' 승리!';
    drawAll();
    cancelAnimationFrame(animationId);
  }
}
function lose(player) {
  player.lost = true;
  player.stateEl.innerHTML = '<span class="dead">패배</span>';
  send({ type:'lose' });
  syncMine();
  checkWinner();
  drawAll();
}
function updatePlayerNames() {
  players.forEach(p => {
    const displayName = playerNames[p.num] ? p.num + 'P ' + playerNames[p.num] : p.num + 'P';
    p.name = displayName;
    p.nameEl.textContent = displayName;
    p.scoreNameEl.textContent = displayName;
  });
}
function updateStates() {
  updatePlayerNames();
  let opponentRow = 1;
  players.forEach(p => {
    p.areaEl.classList.remove('is-mine', 'is-opponent');
    p.areaEl.style.order = '';
    p.areaEl.style.gridColumn = '';
    p.areaEl.style.gridRow = '';

    if (myPlayer && p.num === myPlayer) {
      p.areaEl.classList.add('is-mine');
      p.areaEl.style.gridColumn = '1';
      p.areaEl.style.gridRow = '1 / 3';
    } else {
      p.areaEl.classList.add('is-opponent');
      const opponentCol = opponentRow % 2 === 1 ? 2 : 3;
      const opponentGridRow = opponentRow <= 2 ? 1 : 2;
      p.areaEl.style.gridColumn = String(opponentCol);
      p.areaEl.style.gridRow = String(opponentGridRow);
      opponentRow++;
    }
    if (!connectedPlayers.includes(p.num)) {
      p.active = false;
      p.stateEl.textContent = '대기중';
    } else if (p.num === myPlayer && !p.lost) {
      p.active = true;
      p.stateEl.innerHTML = '<span class="mine">내 화면</span>';
    } else if (!p.lost) {
      p.active = true;
      p.stateEl.textContent = '상대';
    }
  });
}
function startLocalGame() {
  players.forEach(player => {
    player.board = createBoard(); player.piece = randomPiece(); player.nextPiece = randomPiece(); player.score = 0; player.lines = 0; player.combo = 0; player.level = 1;
    player.dropCounter = 0; player.dropInterval = 900; player.lost = false; player.active = connectedPlayers.includes(player.num); updatePanel(player);
  });
  paused = false; finished = false; lastTime = 0; updateStates();
  statusEl.textContent = myPlayer + 'P로 플레이 중';
  cancelAnimationFrame(animationId); update(); syncMine(); drawAll();
}
function restartGame() { send({ type:'restart' }); startLocalGame(); }
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
  drawAll(); syncMine(); checkWinner();
  animationId = requestAnimationFrame(update);
}
function addChatLine(type, text) {
  const div = document.createElement('div');
  div.className = 'chat-line' + (type === 'system' ? ' system' : '');
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}
function connect() {
  const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(wsProtocol + location.host);
  ws.onopen = () => { statusEl.textContent = '접속 대기 중...'; };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'assign') {
      myPlayer = data.player;
      restartBtn.disabled = false;
      joinModal.classList.remove('hidden');
      joinModal.classList.add('show');
      statusEl.textContent = myPlayer + 'P로 접속됨. 이름을 입력하고 입장하세요.';
      setTimeout(function () { nicknameInput.focus(); }, 50);
      updateStates(); drawAll();
    }
    if (data.type === 'full') statusEl.textContent = '이미 5명이 접속 중입니다.';
    if (data.type === 'system') addChatLine('system', data.message);
    if (data.type === 'players') {
      connectedPlayers = data.players || [];
      playerNames = Object.assign({}, playerNames, data.names || {});
      players.forEach(p => p.active = connectedPlayers.includes(p.num));
      updateStates(); drawAll();
    }
    if (data.type === 'restart') startLocalGame();
    if (data.type === 'state' && data.player !== myPlayer) {
      applyRemoteState(getPlayer(data.player), data.state);
      drawAll(); checkWinner();
    }
    if (data.type === 'attack' && data.target === myPlayer) {
      addGarbageLines(getMine(), data.count);
      addChatLine('system', data.player + 'P에게 공격받음: ' + data.count + '줄');
      syncMine(); drawAll();
    }
    if (data.type === 'lose') {
      const p = getPlayer(data.player);
      p.lost = true;
      p.stateEl.innerHTML = '<span class="dead">패배</span>';
      checkWinner(); drawAll();
    }
    if (data.type === 'chat') {
      addChatLine('chat', (data.nickname || data.player + 'P') + ': ' + data.message);
    }
  };
  ws.onclose = () => { statusEl.textContent = '서버 연결이 끊겼습니다.'; };
}

document.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return;
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
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!myPlayer) return;
  myNickname = nicknameInput.value.trim().slice(0, 12) || ('Player' + myPlayer);
  send({ type: 'join', nickname: myNickname });
  playerNames[myPlayer] = myNickname;
  updatePlayerNames();
  joinModal.classList.remove('show');
  joinModal.classList.add('hidden');
  statusEl.textContent = myPlayer + 'P ' + myNickname + ' 입장 완료. 새 게임을 누르세요.';
});
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message || !myPlayer) return;
  send({ type:'chat', message });
  chatInput.value = '';
});
connect();
drawAll();
</script>
</body>
</html>`);
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log('5인 온라인 대전 테트리스 서버 실행 중');
  console.log(`서버 PC 접속: http://localhost:${PORT}`);
  console.log(`같은 내부망 접속: http://${ip}:${PORT}`);
  console.log('외부 접속은 Render, Railway, ngrok 등 공개 주소를 사용하세요.');
});

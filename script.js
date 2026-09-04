/* ============================================================
   FLAPPY LINK — Minijogo "Link na Bio" (Vanilla JS)
   Avatar: avatar-normal.png (jogando) / avatar-sad.png (game over)
   Recorde local: localStorage | Ganchos prontos p/ Firebase/Supabase
   ============================================================ */
"use strict";

/* ---------- Configuração dos LINKS da bio + Backend ---------- */
const LINKS_CONFIG = {
  firebase: {
    apiKey: "", // ← alternativa Firebase (opcional)
    projectId: "",
  },
  supabase: {
    url: "https://vpzxrmxqkjrkxhzodovg.supabase.co", // ✅ projeto configurado
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwenhybXhxa2pya3hoem9kb3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0OTEzNDksImV4cCI6MjEwNDA2NzM0OX0.vCAzhSyY3mC_ruKyZ-5dL73f8Qzq4dMHUiawooMIfOo", // ✅ anon key configurada — placar global ativo
  },
};

/* ---------- Nome do jogador (para o placar global) ---------- */
let playerName = localStorage.getItem("flappylink_name") || "ANÔNIMO";


/* ---------- Canvas & Contexto ---------- */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = canvas.width;   // largura lógica (muda com o tamanho da tela)
let H = canvas.height;  // altura lógica (muda com o tamanho da tela)

/* ---------- Detecção de dispositivo (PC vs Celular) ---------- */
const isMobile =
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  window.matchMedia("(pointer: coarse)").matches;
const hintEl = document.getElementById("control-hint");
if (hintEl) {
  hintEl.innerHTML = isMobile
    ? "📱 Toque na tela para voar"
    : "💻 Aperte <b>ESPAÇO</b> ou clique para voar 🚀";
}

/* ---------- Avatares locais ---------- */
const avatarNormal = new Image();
avatarNormal.src = "avatar-normal.png";
const avatarSad = new Image();
avatarSad.src = "avatar-sad.png";

/* ---------- Estado do jogo ---------- */
const STATE = { READY: 0, PLAYING: 1, OVER: 2 };
let state = STATE.READY;

const GRAVITY_BASE = 0.45;
const FLAP_FORCE = -7.8;
const GROUND_H = 60;

const bird = {
  x: 80,
  y: H / 2,
  r: 24, // raio (avatar circular)
  v: 0,
  rot: 0,
};

let pipes = [];
let frames = 0;
let ambient = 0; // contador que nunca para (anima estrelas mesmo no menu)
let score = 0;
let best = Number(localStorage.getItem("flappylink_best") || 0);
let particles = [];

/* ---------- Céu noturno: estrelas cintilantes (com parallax) ---------- */
let stars = [];
function makeStars() {
  return Array.from({ length: 55 }, () => ({
    x: Math.random() * W,
    y: Math.random() * Math.max(50, H - GROUND_H - 80),
    r: 0.4 + Math.random() * 1.5,
    tw: Math.random() * Math.PI * 2,          // fase do brilho
    sp: 0.15 + Math.random() * 0.5,           // velocidade do drift
    b: 0.3 + Math.random() * 0.7,             // brilho base
  }));
}

/* ---------- RESPONSIVIDADE: adapta o canvas ao tamanho da tela ---------- */
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  const oldW = W, oldH = H;
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // nitidez em telas retina

  W = Math.round(rect.width);
  H = Math.round(rect.height);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Reposiciona elementos proporcionalmente ao novo tamanho
  if (oldW && oldH) {
    const rx = W / oldW, ry = H / oldH;
    bird.x *= rx;
    bird.y *= ry;
    bird.r = Math.max(16, Math.min(26, W * 0.065));
    for (const p of pipes) { p.x *= rx; p.top *= ry; }
  }
  bird.x = Math.max(46, Math.min(bird.x, W * 0.25));
  stars = makeStars();
  buildCity(); // regenera a cidade ao fundo com a nova largura
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 150));

/* ============================================================
   CRIATURAS AMBIENTAIS (só cenário — NÃO colidem, não afetam o jogo)
   Sprites grátis da PokeAPI (API pública, sem chave/autenticação).
   Se o sprite não carregar (offline), cai para o emoji equivalente.
   ============================================================ */
const CREATURE_TYPES = [
  { name: "dragon",  label: "dragão",        src: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/149.png", emoji: "🐉", size: 120 },
  { name: "squid",   label: "lula gigante",  src: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/73.png",  emoji: "🦑", size: 110 },
  { name: "octo",    label: "polvo",         src: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/224.png", emoji: "🐙", size: 95 },
  { name: "bat",     label: "morcego",       src: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/42.png",  emoji: "🦇", size: 75 },
];
const creatureImgs = {};
for (const t of CREATURE_TYPES) {
  const im = new Image();
  im.src = t.src;
  creatureImgs[t.name] = im;
}

const creatures = [];   // criaturas/referências ativas na tela
let nextCreatureAt = 500; // primeira aparição rápida (~8s de jogo)

/* ---------- Referências aleatórias que voam no fundo ---------- */
const REF_EMOJIS = ["👾", "🛸", "🚀", "🎮", "💾", "📼", "🍕", "☕", "🐔", "⭐", "👽", "🗡️"];

// 👽 Alienígena pixel-art (aparece voando de vez em quando)
const ALIEN_PIXELS = [
  "..GGGG..",
  ".GGGGGG.",
  "GEGGGGEG",
  "GGGGGGGG",
  "GGGGGGGG",
  ".GGGGGG.",
  "..G..G..",
];
const ALIEN_COLORS = { G: "#5fd35f", E: "#101010" };

const CLT_REFS = [
  "💼 CLT", "💵 13º SALÁRIO", "🏖️ FÉRIAS REMUNERADAS",
  "🎟️ VALE-REFEIÇÃO", "⏰ BANCO DE HORAS", "📋 CARTEIRA ASSINADA",
  "🤝 FGTS", "🩺 PLANO DE SAÚDE",
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Sorteia o que vai cruzar o fundo: criatura (PokeAPI), emoji pop ou placar CLT. */
function spawnCreature() {
  const roll = Math.random();
  const base = {
    x: W + 80,
    y: 50 + Math.random() * Math.max(60, H * 0.45),
    vx: -(0.35 + Math.random() * 0.55),
    swayA: 10 + Math.random() * 22,
    swayS: 0.008 + Math.random() * 0.015,
    born: ambient,
  };

  if (roll < 0.35) {
    // Criatura com sprite da PokeAPI (fallback: emoji)
    const t = pick(CREATURE_TYPES);
    creatures.push({ type: "img", img: creatureImgs[t.name], emoji: t.emoji,
      size: t.size * (0.7 + Math.random() * 0.6), ...base });
  } else if (roll < 0.55) {
    // 👽 Alienígena pixel-art
    creatures.push({ type: "alien", size: 24 + Math.random() * 16,
      vx: -(0.8 + Math.random() * 0.8), ...base });
  } else if (roll < 0.72) {
    // Referência pop aleatória voando (👾 🛸 🚀 👽...)
    creatures.push({ type: "emoji", emoji: pick(REF_EMOJIS),
      size: 34 + Math.random() * 30, vx: -(0.7 + Math.random() * 0.9), ...base });
  } else {
    // Placa de benefícios da CLT flutuando 😄
    creatures.push({ type: "text", text: pick(CLT_REFS),
      size: 11 + Math.random() * 5, vx: -(0.5 + Math.random() * 0.6), ...base });
  }
}

function updateCreatures() {
  if (ambient >= nextCreatureAt) {
    spawnCreature();
    nextCreatureAt = ambient + 500 + Math.random() * 700; // aparições frequentes
  }
  for (const c of creatures) c.x += c.vx;
  while (creatures.length && creatures[0].x < -260) creatures.shift();
}

function drawCreatures() {
  for (const c of creatures) {
    const yy = c.y + Math.sin((ambient - c.born) * c.swayS) * c.swayA; // balanço
    ctx.save();
    ctx.globalAlpha = c.type === "text" ? 0.45 : 0.30; // bem ao fundo, discreto
    if (c.type === "img" && c.img && c.img.complete && c.img.naturalWidth) {
      ctx.drawImage(c.img, c.x, yy, c.size, c.size);
    } else if (c.type === "alien") {
      // 👽 alienígena pixel-art
      const s = Math.max(2, Math.round(c.size / 8));
      ALIEN_PIXELS.forEach((row, r) => {
        for (let col = 0; col < row.length; col++) {
          if (row[col] !== ".") {
            ctx.fillStyle = ALIEN_COLORS[row[col]];
            ctx.fillRect(c.x + col * s, yy + r * s, s, s);
          }
        }
      });
    } else if (c.type === "emoji") {
      ctx.font = `${Math.round(c.size)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.emoji, c.x, yy);
    } else {
      // Placa CLT em fonte pixel dourada
      ctx.font = `${Math.round(c.size)}px "Press Start 2P", monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffd166";
      ctx.fillText(c.text, c.x, yy);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------- Cidade ao fundo (vista de MUITO longe, com parallax) ---------- */
let cityFar = null, cityNear = null;

function makeCityLayer(minH, maxH, speed, color, windowColor) {
  const b = [];
  let x = 0;
  while (x < W + 120) {
    const w = 26 + Math.random() * 54;
    const h = minH + Math.random() * (maxH - minH);
    // janelas acesas pré-computadas (40% de chance)
    const wins = [];
    const rows = Math.floor(h / 16), cols = Math.floor(w / 12);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (Math.random() < 0.35) wins.push([c * 12 + 3, r * 16 + 6]);
    b.push({ x, w, h, wins });
    x += w + 4 + Math.random() * 18;
  }
  return { b, total: x, speed, color, windowColor };
}

function buildCity() {
  cityFar  = makeCityLayer(H * 0.08, H * 0.18, 0.08, "#1c1540", "#8f86d8");
  cityNear = makeCityLayer(H * 0.14, H * 0.28, 0.22, "#2a1f55", "#ffd166");
}

function drawCityLayer(L) {
  if (!L) return;
  const off = (frames * L.speed) % L.total;
  // prédios (2 cópias para o loop infinito)
  ctx.fillStyle = L.color;
  for (let copy = 0; copy < 2; copy++) {
    for (const bd of L.b) {
      const bx = bd.x - off + copy * L.total;
      if (bx + bd.w < 0 || bx > W) continue;
      ctx.fillRect(bx, H - GROUND_H - bd.h, bd.w, bd.h);
    }
  }
  // janelas acesas
  ctx.fillStyle = L.windowColor;
  ctx.globalAlpha = 0.7;
  for (let copy = 0; copy < 2; copy++) {
    for (const bd of L.b) {
      const bx = bd.x - off + copy * L.total;
      if (bx + bd.w < 0 || bx > W) continue;
      for (const [wx, wy] of bd.wins) ctx.fillRect(bx + wx, H - GROUND_H - bd.h + wy, 4, 6);
    }
  }
  ctx.globalAlpha = 1;
}

function drawCity() {
  drawCityLayer(cityFar);  // bem distante, quase um contorno
  drawCityLayer(cityNear); // mais perto, com janelas douradas
}

/* ---------- 🍄 Mário no chão: easter egg raro ("JOGO ERRADO!") ---------- */
let mario = null;
let nextMarioAt = 2200; // primeira aparição (~35s de jogo)

const MARIO_PIXELS = [
  "....RRRRR...",
  "...RRRRRRRRR",
  "...BBBSSBS..",
  "..BSBSSSBSS.",
  "..BSBSSSSBSS",
  "..BBSSSSBBBB",
  "....SSSSSS..",
  "..RROOROO...",
  ".RRROORRORR.",
  "RRRROOOORRRR",
  "SSROYOOYORSS",
  "SSSOOOOOOSSS",
  "SSOOOOOOOOSS",
  "..OOO..OOO..",
  ".BBB....BBB.",
  "BBBB....BBBB",
];
const MARIO_COLORS = { R: "#e52521", B: "#6b3e1e", S: "#ffc7a8", O: "#1560ad", Y: "#ffd166" };

function updateMario() {
  if (!mario && state === STATE.PLAYING && ambient >= nextMarioAt) {
    mario = { x: W + 40, seed: Math.random() * 100 };
    nextMarioAt = ambient + 3000 + Math.random() * 4000; // reaparece de vez em quando
  }
  if (mario) {
    mario.x -= 0.55; // caminhadinha para a esquerda
    if (mario.x < -90) mario = null;
  }
}

function drawMario() {
  if (!mario) return;
  const s = 2, wpx = 12, hpx = 16; // sprite 12x16 pixels, escala 2
  const gy = H - GROUND_H - hpx * s;
  const bob = Math.sin((ambient + mario.seed) * 0.05) * 1.5;

  // Sprite pixel-art do Mário
  MARIO_PIXELS.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch !== ".") {
        ctx.fillStyle = MARIO_COLORS[ch];
        ctx.fillRect(mario.x + c * s, gy + r * s, s, s);
      }
    }
  });

  // Balão de fala
  const text = "JOGO ERRADO!";
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const tw = ctx.measureText(text).width;
  const bx = mario.x + wpx * s + 8;
  const by = gy - 20 + bob;
  const rx = bx - 5, ry = by - 5, rw = tw + 10, rh = 16;
  // caixa do balão (estilo pixel: retângulo com contorno)
  ctx.fillStyle = "#fff";
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(rx, ry, rw, rh);
  // rabinho do balão apontando pro Mário
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(rx + 4, ry + rh);
  ctx.lineTo(rx + 1, ry + rh + 7);
  ctx.lineTo(rx + 10, ry + rh);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(rx + 4, ry + rh); ctx.lineTo(rx + 1, ry + rh + 7); ctx.lineTo(rx + 10, ry + rh);
  ctx.stroke();
  // texto
  ctx.fillStyle = "#e63946";
  ctx.fillText(text, bx, by);
}

/* ---------- Helper: desenha um sprite pixel-art a partir de um mapa ---------- */
function drawPixelMap(map, colors, x, y, s) {
  map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch !== ".") {
        ctx.fillStyle = colors[ch];
        ctx.fillRect(x + c * s, y + r * s, s, s);
      }
    }
  });
}

/* ============================================================
   CHÃO VIVO: cicla entre 🏖️ Areia → 🛣️ Estrada → 🦴 Fósseis
   (com crossfade suave na troca de bioma)
   ============================================================ */
const GROUND_CYCLE = 2200; // ~36s por bioma

function drawGround() {
  const t = frames % GROUND_CYCLE;
  const idx = Math.floor(frames / GROUND_CYCLE) % 3;
  if (t > GROUND_CYCLE - 90) {
    // crossfade de 1,5s para o próximo bioma
    drawGroundStyle(idx, 1);
    drawGroundStyle((idx + 1) % 3, (t - (GROUND_CYCLE - 90)) / 90);
  } else {
    drawGroundStyle(idx, 1);
  }
}

function drawGroundStyle(style, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const gy = H - GROUND_H;
  const scroll = (frames * pipeSpeed() * 0.5);

  if (style === 0) {
    // 🏖️ AREIA
    ctx.fillStyle = "#e7c27d";
    ctx.fillRect(0, gy, W, GROUND_H);
    ctx.fillStyle = "#cfa55e";
    ctx.fillRect(0, gy, W, 6);
    ctx.fillStyle = "rgba(170,130,70,.55)";
    for (let i = 0; i < W / 16 + 2; i++) {
      const gx = i * 16 - scroll % 16;
      ctx.fillRect(gx, gy + 14 + (i % 3) * 9, 3, 3);
    }
    // conchinhas
    ctx.fillStyle = "#fff2dc";
    for (let i = 0; i < W / 90 + 2; i++) {
      const gx = i * 90 - scroll % 90;
      ctx.fillRect(gx, gy + GROUND_H - 14, 6, 4);
    }
  } else if (style === 1) {
    // 🛣️ ESTRADA
    ctx.fillStyle = "#3b3b44";
    ctx.fillRect(0, gy, W, GROUND_H);
    ctx.fillStyle = "#7d7d86"; // meio-fio
    ctx.fillRect(0, gy, W, 4);
    // faixa amarela tracejada central (rolando)
    ctx.fillStyle = "#ffd166";
    for (let i = 0; i < W / 40 + 2; i++) {
      const gx = i * 40 - (frames * pipeSpeed() * 0.8) % 40;
      ctx.fillRect(gx, gy + GROUND_H / 2 - 2, 22, 5);
    }
    // rachaduras
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.lineWidth = 2;
    for (let i = 0; i < W / 130 + 2; i++) {
      const gx = i * 130 - scroll % 130;
      ctx.beginPath();
      ctx.moveTo(gx, gy + 8);
      ctx.lineTo(gx + 10, gy + 18);
      ctx.lineTo(gx + 2, gy + GROUND_H - 6);
      ctx.stroke();
    }
  } else {
    // 🦴 FÓSSEIS (camada sedimentar com dinossauros embaixo)
    ctx.fillStyle = "#8a7a5f";
    ctx.fillRect(0, gy, W, GROUND_H);
    // estratos de terra
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(0, gy + 14, W, 3);
    ctx.fillRect(0, gy + 32, W, 3);
    // fósseis rolando junto com o chão
    for (let i = 0; i < Math.ceil(W / 220) + 2; i++) {
      let fx = i * 220 - (scroll % (W + 260));
      if (fx < -130) fx += W + 260;
      drawFossil(fx, gy + 12);
    }
  }
  ctx.restore();
}

/** Esqueleto de dinossauro: crânio + vértebras + costelas. */
function drawFossil(x, y) {
  ctx.fillStyle = "#efe6cf";
  // crânio
  ctx.beginPath();
  ctx.ellipse(x + 20, y + 9, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // olho (furo)
  ctx.fillStyle = "#6f6248";
  ctx.beginPath();
  ctx.arc(x + 16, y + 7, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // vértebras
  ctx.fillStyle = "#efe6cf";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x + 40 + i * 10, y + 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // costelas
  ctx.strokeStyle = "#efe6cf";
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x + 44 + i * 10, y + 9, 9, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
}

/* ---------- 🛰️ Satélite da CIA que vira TRANSFORMER ---------- */
let spy = null;
let nextSpyAt = 1000;

const SATELLITE_PIXELS = [
  "BB.BB...BB.BB.",
  "Bb.Bb...Bb.Bb.",
  "..............",
  "....GGGGGG....",
  "...GGWWWWGG...",
  "...GGGGGGGG...",
  "....G....G....",
];
const SAT_COLORS = { B: "#1e3a8a", b: "#3b82f6", G: "#8a939e", W: "#e8e8e8" };

const ROBOT_PIXELS = [
  "...M..M...",
  "...MMMM...",
  "...MBMB...",
  "....MM....",
  ".MMMMMMMM.",
  "MMMRRRMMMM",
  "MMMRRRMMMM",
  "M.MMMMMM.M",
  "M.MMMMMM.M",
  "..MM..MM..",
  ".MMM..MMM.",
];
const ROBOT_COLORS = { M: "#9aa3ad", B: "#4fc3f7", R: "#e63946" };

function updateSpy() {
  if (!spy && ambient >= nextSpyAt) {
    spy = { x: W + 60, y: 45 + Math.random() * 70, mode: "sat", to: "robot", timer: 700 };
    nextSpyAt = ambient + 2500 + Math.random() * 2500;
  }
  if (!spy) return;
  spy.x -= 0.35; // deriva orbital lenta
  spy.timer--;
  if (spy.timer <= 0) {
    if (spy.mode === "sat") { spy.mode = "transform"; spy.to = "robot"; spy.timer = 36; }
    else if (spy.mode === "robot") { spy.mode = "transform"; spy.to = "sat"; spy.timer = 36; }
    else { spy.mode = spy.to; spy.timer = spy.to === "sat" ? 700 : 550; }
  }
  if (spy.x < -90) spy = null;
}

function drawSpy() {
  if (!spy) return;
  const bob = Math.sin(ambient * 0.02 + spy.y) * 3;
  const y = spy.y + bob;

  if (spy.mode === "transform") {
    // ✨ transformação: tremor + piscada entre as formas + flash
    const jx = (Math.random() - 0.5) * 5, jy = (Math.random() - 0.5) * 5;
    const showRobot = Math.floor(spy.timer / 6) % 2 === 0;
    drawPixelMap(showRobot ? ROBOT_PIXELS : SATELLITE_PIXELS,
                 showRobot ? ROBOT_COLORS : SAT_COLORS, spy.x + jx, y + jy, 3);
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (spy.timer / 36)})`;
    ctx.fillRect(spy.x - 40, y - 40, 130, 100);
    return;
  }

  const isSat = spy.mode === "sat";
  drawPixelMap(isSat ? SATELLITE_PIXELS : ROBOT_PIXELS,
               isSat ? SAT_COLORS : ROBOT_COLORS, spy.x, y, 3);
  if (isSat) {
    // etiqueta da agência 🕵️
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.fillStyle = "#ff5a5a";
    ctx.fillText("CIA", spy.x + 14, y + 26);
  }
}

/* ---------- ☄️ Meteoro riscando o céu ---------- */
let meteor = null;
let nextMeteorAt = 700;

function updateMeteor() {
  if (!meteor && ambient >= nextMeteorAt) {
    meteor = {
      x: W * (0.35 + Math.random() * 0.6), y: -20,
      vx: -(4 + Math.random() * 3), vy: 3 + Math.random() * 2,
    };
    nextMeteorAt = ambient + 1000 + Math.random() * 2000; // a cada ~17-50s
  }
  if (meteor) {
    meteor.x += meteor.vx;
    meteor.y += meteor.vy;
    if (meteor.y > H || meteor.x < -60) meteor = null;
  }
}

function drawMeteor() {
  if (!meteor) return;
  const m = meteor;
  // cauda (rastro decrescente)
  const trail = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 10, m.y - m.vy * 10);
  trail.addColorStop(0, "rgba(255,255,255,.9)");
  trail.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = trail;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(m.x - m.vx * 10, m.y - m.vy * 10);
  ctx.stroke();
  // cabeça brilhante
  ctx.fillStyle = "#fffbe6";
  ctx.beginPath();
  ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- 🛸 Nave do Rick e Morty passando no fundo ---------- */
let ship = null;
let nextShipAt = 1400;

function updateShip() {
  if (!ship && ambient >= nextShipAt) {
    ship = { x: W + 70, y: 60 + Math.random() * Math.max(60, H * 0.35), seed: Math.random() * 100 };
    nextShipAt = ambient + 1800 + Math.random() * 2600; // a cada ~30-65s
  }
  if (ship) {
    ship.x -= 2.3; // velocidade de verdade, é uma nave!
    if (ship.x < -90) ship = null;
  }
}

function drawShip() {
  if (!ship) return;
  const bob = Math.sin(ambient * 0.03 + ship.seed) * 6;
  const x = ship.x, y = ship.y + bob;

  ctx.save();
  ctx.globalAlpha = 0.85;
  // rastro de portal verde
  ctx.fillStyle = "rgba(151, 255, 109, .4)";
  ctx.beginPath();
  ctx.ellipse(x + 38, y + 4, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // corpo do disco
  ctx.fillStyle = "#b7b7c8";
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // faixa vermelha da nave
  ctx.fillStyle = "#d94f3d";
  ctx.beginPath();
  ctx.ellipse(x, y + 3, 30, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // cúpula de vidro
  ctx.fillStyle = "rgba(140, 200, 255, .55)";
  ctx.beginPath();
  ctx.arc(x, y - 3, 13, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // Rick (cabelo azul-claro, jaleco branco)
  ctx.fillStyle = "#f2f2f2";
  ctx.beginPath(); ctx.arc(x - 5, y - 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#85d6f0";
  ctx.beginPath(); ctx.arc(x - 5, y - 7, 3.5, 0, Math.PI * 2); ctx.fill();
  // Morty (camisa amarela, cabelo marrom)
  ctx.fillStyle = "#f7d354";
  ctx.beginPath(); ctx.arc(x + 6, y - 2, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8b5a2b";
  ctx.beginPath(); ctx.arc(x + 6, y - 7, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}


/* ============================================================
   ÁUDIO — Música chiptune + efeitos (Web Audio API, sem arquivos)
   ============================================================ */
const AudioFX = {
  ctx: null,
  musicOn: true,
  musicTimer: null,
  step: 0,
  acc: 0,
  lastTick: 0,

  // 4 FASES musicais estilo Undertale — andamento RÁPIDO e constante,
  // cada fase ADICIONA camadas (oitava, arpejo, bateria) em vez de desacelerar
  phases: [
    { // Fase 1: riff dirigido em Ré menor (homagem a Megalovania)
      tempo: 130,
      melody: [294, 294, 0, 587, 0, 523, 494, 440, 349, 294, 0, 349, 392, 0, 294, 0],
      bass:   [147, 0, 147, 0, 110, 0, 110, 0, 98, 0, 98, 0, 110, 0, 110, 0],
      drums: false, octave: false, arp: false,
    },
    { // Fase 2: + melodia dobrada em oitava (som mais cheio)
      tempo: 130,
      melody: [294, 294, 0, 587, 0, 523, 494, 440, 349, 294, 0, 349, 392, 0, 440, 466],
      bass:   [147, 0, 147, 147, 110, 0, 110, 110, 98, 0, 98, 98, 110, 0, 130, 130],
      drums: true, octave: true, arp: false,
    },
    { // Fase 3: + arpejo de 16 avos como contracanto (estilo "Megalovania" / "ASGORE")
      tempo: 122,
      melody: [294, 0, 587, 523, 494, 0, 440, 523, 349, 0, 440, 466, 523, 0, 494, 440],
      bass:   [147, 147, 0, 147, 110, 110, 0, 110, 98, 98, 0, 98, 110, 110, 130, 130],
      arp: [294, 349, 440, 523],
      drums: true, octave: true, arp: true,
    },
    { // Fase 4: CLÍMAX — tudo junto, bateria dobrada, baixo em 16 avos
      tempo: 112,
      melody: [294, 587, 0, 587, 523, 494, 587, 440, 349, 698, 0, 698, 587, 523, 494, 466],
      bass:   [147, 147, 147, 147, 110, 110, 110, 110, 98, 98, 98, 98, 110, 110, 130, 130],
      arp: [294, 349, 440, 523, 587, 523, 440, 349],
      drums: true, octave: true, arp: true, doubleDrums: true,
    },
  ],


  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  tone(freq, dur = 0.12, type = "square", vol = 0.12, when = 0) {
    if (!this.ctx || !freq) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  startMusic() {
    this.init();
    if (!this.ctx) return;
    this.stopMusic();
    this.step = 0;
    this.acc = 0;
    this.lastTick = performance.now();
    // Tick rápido + acumulador: o tempo entre notas muda por fase sem recriar o timer
    this.musicTimer = setInterval(() => this.tick(), 25);
  },

  /** Relógio da música: escolhe a fase conforme a dificuldade atual do jogo. */
  tick() {
    if (!this.musicOn) return;
    const now = performance.now();
    this.acc += now - this.lastTick;
    this.lastTick = now;

    // 🎚️ fase = dificuldade (0→1) dividida em 4 estágios; nunca regride no meio da partida
    const lvl = Math.min(this.phases.length - 1, Math.floor(difficulty() * this.phases.length));
    const ph = this.phases[lvl];

    while (this.acc >= ph.tempo) {
      this.acc -= ph.tempo;
      const i = this.step % ph.melody.length;
      const dur = (ph.tempo / 1000) * 0.9;

      this.tone(ph.melody[i], dur, "square", 0.055);                        // melodia principal
      if (ph.octave && ph.melody[i]) this.tone(ph.melody[i] * 2, dur, "square", 0.025); // dobrada em oitava
      if (ph.bass[i]) this.tone(ph.bass[i], dur * 1.8, "triangle", 0.08);   // baixo
      if (ph.arp) this.tone(ph.arp[this.step % ph.arp.length], dur * 0.5, "sawtooth", 0.03); // arpejo contracanto
      if (ph.drums && i % 2 === 1) this.tone(3200, 0.03, "square", 0.03);   // chimbal
      if (ph.drums && i % 8 === 4) this.tone(90, 0.1, "sine", 0.2);         // bumbo
      if (ph.doubleDrums && i % 8 === 0) this.tone(70, 0.12, "sine", 0.22); // bumbo extra
      this.step++;
    }
  },

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  },

  flap()    { this.init(); this.tone(500, 0.08, "square", 0.1); this.tone(700, 0.07, "square", 0.08, 0.05); },
  score()   { this.init(); this.tone(880, 0.09, "square", 0.1); this.tone(1318, 0.12, "square", 0.1, 0.08); },
  hit() {
    this.init();
    this.tone(200, 0.2, "sawtooth", 0.15);
    this.tone(120, 0.3, "sawtooth", 0.12, 0.08);
  },
  jingle() { // derrotinha triste 😢
    [523, 494, 440, 349].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.12, i * 0.18));
  },
};


/* ---------- DOM ---------- */
const el = {
  score: document.getElementById("score"),
  best: document.getElementById("best"),
  finalScore: document.getElementById("final-score"),
  finalBest: document.getElementById("final-best"),
  newRecord: document.getElementById("new-record"),
  overlayStart: document.getElementById("overlay-start"),
  overlayGameOver: document.getElementById("overlay-gameover"),
  btnStart: document.getElementById("btn-start"),
  btnRestart: document.getElementById("btn-restart"),
  overlayStory: document.getElementById("overlay-story"),
  storyText: document.getElementById("story-text"),
  storyPrompt: document.getElementById("story-prompt"),
  playerName: document.getElementById("player-name"),
  finalName: document.getElementById("final-name"),
  rankList: document.getElementById("rank-list"),
  btnMute: document.getElementById("btn-mute"),
  hitCounter: document.getElementById("hit-counter"),
};
el.best.textContent = best;

// Restaura o nome salvo no campo
if (el.playerName) el.playerName.value = playerName === "ANÔNIMO" ? "" : playerName;

/* ---------- Contador de visitantes nostálgico (localStorage) ---------- */
let visits = Number(localStorage.getItem("flappylink_visits") || 0) + 1;
localStorage.setItem("flappylink_visits", visits);
if (el.hitCounter) el.hitCounter.textContent = String(visits).padStart(6, "0");

/* ---------- Cutscene: tela PRETA com a história após clicar em JOGAR ---------- */
const STORY_TEXT =
  "Israel conseguiu uma entrevista de emprego! 🎉\n\n" +
  "Mas a empresa fica do outro lado da cidade...\n\n" +
  "Ajude Israel a voar entre os canos\n" +
  "e chegar a tempo da entrevista!";

let typeTimer = null;
let storyDone = false;

/** Digita a história em ~5 segundos. */
function typeStory() {
  clearInterval(typeTimer);
  el.storyText.textContent = "";
  el.storyPrompt.classList.add("hidden");
  storyDone = false;
  let i = 0;
  const speed = Math.max(15, Math.round(5000 / STORY_TEXT.length)); // ≈5s no total
  typeTimer = setInterval(() => {
    el.storyText.textContent += STORY_TEXT[i] || "";
    i++;
    if (i >= STORY_TEXT.length) {
      clearInterval(typeTimer);
      storyDone = true;
      showStoryPrompt();
    }
  }, speed);
}

/** Clique antecipado: completa o texto na hora. */
function finishStory() {
  clearInterval(typeTimer);
  el.storyText.textContent = STORY_TEXT;
  storyDone = true;
  showStoryPrompt();
}

function showStoryPrompt() {
  el.storyPrompt.textContent = isMobile
    ? "▶ TOQUE NA TELA PARA JOGAR"
    : "▶ PRESSIONE ENTER PARA JOGAR";
  el.storyPrompt.classList.remove("hidden");
}

/** Botão JOGAR da tela inicial → salva o nome e abre a tela preta da história. */
function startStory() {
  // 💾 valida e salva o nome digitado antes de começar
  const typed = (el.playerName.value || "").trim().toUpperCase().slice(0, 14);
  playerName = typed || "ANÔNIMO";
  localStorage.setItem("flappylink_name", playerName);

  AudioFX.stopMusic(); // 🎵 música para durante a cutscene
  el.overlayStart.classList.remove("visible");
  el.overlayStory.classList.add("visible");
  typeStory();
}

/** Enter / toque na tela: só inicia o jogo DEPOIS que o texto apareceu. */
function onStoryInput() {
  if (!storyDone) { finishStory(); return; } // 1º input completa o texto
  el.overlayStory.classList.remove("visible");
  startGame(); // 🎮 o jogo começa de fato (música volta)
}
el.overlayStory.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  onStoryInput();
});

el.btnMute.addEventListener("click", () => {
  AudioFX.musicOn = !AudioFX.musicOn;
  el.btnMute.textContent = AudioFX.musicOn ? "🔊" : "🔇";
});

/* ---------- Dificuldade progressiva ---------- */
function difficulty() {
  return Math.min(frames / 3600, 1); // 0 → 1 em ~60s
}
function pipeGap() {
  return Math.max(130, 190 - 60 * difficulty());
}
function pipeSpeed() {
  return 2.2 + 1.8 * difficulty();
}
function pipeInterval() {
  return Math.max(80, 120 - 40 * difficulty());
}

/* ---------- Canos reativos ---------- */
function spawnPipe() {
  const gap = pipeGap();
  const margin = 70;
  const topH = margin + Math.random() * (H - GROUND_H - gap - margin * 2);
  pipes.push({
    x: W + 20, top: topH, gap, w: 58, passed: false,
    // 🎨 Camaleão: troca de cor aleatoriamente (~12% dos canos)
    chameleon: Math.random() < 0.12,
    hue: 100 + Math.random() * 40,
    // 🫨 Trêmulo: parece que vai cair (só visual, ~10%)
    wobbly: Math.random() < 0.10,
    wobbleSeed: Math.random() * 100,
    // 🍂 Queda real: sorteada durante o jogo (~raro)
    falling: false, fy: 0, fvy: 0, frot: 0, fvrot: 0,
  });
}

/** Faz o cano tombar e cair de verdade (deixa de colidir). */
function triggerFall(p) {
  if (p.falling) return;
  p.falling = true;
  p.fvy = -1.2; // pulinho inicial, como se tivesse se soltado
  p.fvrot = (Math.random() < 0.5 ? -1 : 1) * (0.015 + Math.random() * 0.035);
}

function updatePipes() {
  if (frames % Math.round(pipeInterval()) === 0) spawnPipe();

  for (const p of pipes) {
    // 🍂 Cano caindo: gravidade + rotação, sem colisão (abriu um caminho!)
    if (p.falling) {
      p.fvy += 0.5;
      p.fy += p.fvy;
      p.frot += p.fvrot;
      continue;
    }

    p.x -= pipeSpeed();

    // 🎨 Camaleão muda de matiz de tempos em tempos
    if (p.chameleon && frames % 45 === 0) p.hue = Math.random() * 360;

    // Sorteio de queda (raro): cano se solta e tomba
    if (p.passed && Math.random() < 0.004) triggerFall(p);
    else if (!p.passed && p.x < W * 0.55 && Math.random() < 0.0015) triggerFall(p);

    // Pontuação
    if (!p.passed && p.x + p.w < bird.x - bird.r) {
      p.passed = true;
      score++;
      el.score.textContent = score;
      AudioFX.score(); // 🔊 som de ponto
    }

    // Colisão (círculo vs retângulo) — só canos firmes
    if (circleRect(bird.x, bird.y, bird.r - 3, p.x, 0, p.w, p.top) ||
        circleRect(bird.x, bird.y, bird.r - 3, p.x, p.top + p.gap, p.w, H - GROUND_H - p.top - p.gap)) {
      gameOver();
    }
  }
  pipes = pipes.filter((p) => p.x + p.w > -10 && !(p.falling && p.fy > H + 120));
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/* ---------- Partículas de pulo ---------- */
function flap() {
  if (state === STATE.READY) startGame();
  if (state !== STATE.PLAYING) return;
  bird.v = FLAP_FORCE;
  for (let i = 0; i < 4; i++) {
    particles.push({ x: bird.x - 18, y: bird.y + 8, vx: -1 - Math.random() * 2, vy: (Math.random() - .5) * 2, life: 22 });
  }
}

/* ---------- Render ---------- */
function draw() {
  // Céu noturno (gradiente escuro)
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0b0b1e");
  sky.addColorStop(.5, "#2b1e4f");
  sky.addColorStop(1, "#4a2a6b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Lua com halo brilhante
  const moonX = W - 62, moonY = 78;
  const halo = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 70);
  halo.addColorStop(0, "rgba(255,250,220,.5)");
  halo.addColorStop(1, "rgba(255,250,220,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff7d6";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 26, 0, Math.PI * 2);
  ctx.fill();
  // Crateras da lua
  ctx.fillStyle = "rgba(220,210,170,.6)";
  ctx.beginPath(); ctx.arc(moonX - 8, moonY - 6, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(moonX + 9, moonY + 8, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(moonX + 2, moonY - 12, 3, 0, Math.PI * 2); ctx.fill();

  // Estrelas cintilantes com parallax (mais dinâmicas quanto maior a dificuldade)
  for (const s of stars) {
    s.x -= s.sp + difficulty() * 0.6; // aceleram com a dificuldade
    if (s.x < -3) { s.x = W + 3; s.y = Math.random() * (H - GROUND_H - 80); }
    const alpha = s.b * (0.55 + 0.45 * Math.sin(ambient * 0.05 * s.sp + s.tw));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Nuvens noturnas (parallax leve)
  ctx.fillStyle = "rgba(255,255,255,.10)";
  for (let i = 0; i < 3; i++) {
    const cx = W - ((frames * 0.3 + i * 180) % (W + 120));
    const cy = 90 + i * 70;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.arc(cx + 24, cy + 6, 20, 0, Math.PI * 2);
    ctx.arc(cx - 24, cy + 6, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // 🛰️ Satélite da CIA (que às vezes vira Transformer)
  updateSpy();
  drawSpy();

  // ☄️ Meteoro no céu (atrás da cidade)
  updateMeteor();
  drawMeteor();

  // 🏙️ Cidade distante (duas camadas de parallax atrás de tudo jogável)
  drawCity();

  // 🐉 Criaturas e referências ambientais (dragão, lula, CLT...) — atrás dos canos
  updateCreatures();
  drawCreatures();

  // 🛸 Nave do Rick e Morty cruzando o fundo
  updateShip();
  drawShip();

  // Canos reativos (camaleão / trêmulo / caindo)
  for (const p of pipes) {
    // Cores: verde clássico ou matiz aleatória dos camaleões
    const c1 = p.chameleon ? `hsl(${p.hue}, 70%, 58%)` : "#5ee270";
    const c2 = p.chameleon ? `hsl(${p.hue}, 65%, 45%)` : "#3ec44f";
    const c3 = p.chameleon ? `hsl(${p.hue}, 60%, 33%)` : "#2a9d38";

    ctx.save();
    // Rotação: tombamento (queda) ou trêmulo (vai cair?)
    let rot = p.frot || 0;
    if (p.wobbly && !p.falling) rot += Math.sin(frames * 0.18 + p.wobbleSeed) * 0.05;
    const cx = p.x + p.w / 2;
    const cy = p.top + p.gap / 2;
    ctx.translate(cx, cy + p.fy);
    ctx.rotate(rot);
    ctx.translate(-cx, -cy);

    const grad = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
    grad.addColorStop(0, c1);
    grad.addColorStop(.5, c2);
    grad.addColorStop(1, c3);
    ctx.fillStyle = grad;
    // Deslocamento de queda: p.fy somado às alturas
    ctx.fillRect(p.x, p.fy, p.w, p.top);
    ctx.fillRect(p.x, p.fy + p.top + p.gap, p.w, H - GROUND_H - p.top - p.gap);
    // Abas do cano
    ctx.fillRect(p.x - 4, p.fy + p.top - 22, p.w + 8, 22);
    ctx.fillRect(p.x - 4, p.fy + p.top + p.gap, p.w + 8, 22);
    ctx.restore();
  }

  // 🏖️🛣️🦴 Chão vivo (cicla entre areia, estrada e fósseis)
  drawGround();

  // 🍄 Mário no chão com o balão "JOGO ERRADO!"
  updateMario();
  drawMario();

  // Partículas
  for (const pt of particles) {
    ctx.globalAlpha = pt.life / 22;
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Avatar do jogador (imagem local, circular, com rotação)
  const img = state === STATE.OVER ? avatarSad : avatarNormal;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);
  ctx.beginPath();
  ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
  ctx.clip();
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, -bird.r, -bird.r, bird.r * 2, bird.r * 2);
  } else {
    // Fallback: círculo amarelo caso a imagem não exista
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(-bird.r, -bird.r, bird.r * 2, bird.r * 2);
  }
  ctx.restore();
}

function updateParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.life--; }
  particles = particles.filter((p) => p.life > 0);
}

function updateBird() {
  bird.v += GRAVITY_BASE + 0.15 * difficulty();
  bird.y += bird.v;
  bird.rot = Math.max(-0.5, Math.min(1.2, bird.v / 10));

  // Teto e chão
  if (bird.y - bird.r < 0) { bird.y = bird.r; bird.v = 0; }
  if (bird.y + bird.r > H - GROUND_H) { bird.y = H - GROUND_H - bird.r; gameOver(); }
}

/* ---------- Loop principal ---------- */
function loop() {
  ambient++; // cintilar das estrelas roda sempre
  if (state === STATE.PLAYING) {
    frames++;
    updateBird();
    updatePipes();
    updateParticles();
  }
  draw();
  requestAnimationFrame(loop);
}

/* ---------- Controle de estados ---------- */
function resetGame() {
  bird.y = H / 2;
  bird.v = 0;
  bird.rot = 0;
  pipes = [];
  particles = [];
  frames = 0;
  score = 0;
  el.score.textContent = "0";
}

function startGame() {
  resetGame();
  state = STATE.PLAYING;
  el.overlayStart.classList.remove("visible");
  el.overlayGameOver.classList.remove("visible");
  AudioFX.startMusic(); // 🎵 música volta ao reiniciar
  flap();
}

/* ============================================================
   GAME OVER — pausa imediata, troca avatar p/ avatar-sad.png,
   mostra score + links da bio + botão de reiniciar
   ============================================================ */
function gameOver() {
  if (state === STATE.OVER) return;
  state = STATE.OVER; // ⏸️ pausa a física imediatamente

  AudioFX.hit();        // 🔊 som de colisão
  AudioFX.jingle();     // 🔊 derrotinha triste
  AudioFX.stopMusic();  // ⏹️ música para no game over

  const isRecord = score > best;
  if (isRecord) {
    best = score;
    localStorage.setItem("flappylink_best", best); // 💾 recorde local
    el.best.textContent = best;
  }

  el.finalScore.textContent = score;
  el.finalBest.textContent = best;
  el.finalName.textContent = "JOGADOR: " + playerName;
  el.newRecord.classList.toggle("hidden", !isRecord);
  el.overlayGameOver.classList.add("visible");

  // 🔌 GANCHO: envia ao backend e atualiza o placar geral na tela
  salvarPontuacaoGlobal(playerName, score).then(() => carregarRanking());
}

/** Escapa HTML para evitar injeção via nome do jogador. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Busca o top-10 global e renderiza na coluna de ranking do Game Over. */
async function carregarRanking() {
  if (!el.rankList) return;
  el.rankList.innerHTML = '<li class="rank-item"><span class="r-name">carregando...</span></li>';
  const list = await buscarRanking(10);
  if (!list.length) {
    el.rankList.innerHTML = '<li class="rank-item"><span class="r-name">sem pontuações ainda</span></li>';
    return;
  }
  el.rankList.innerHTML = "";
  list.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "rank-item" + (i === 0 ? " top1" : "") + (item.nome === playerName ? " me" : "");
    li.innerHTML =
      `<span class="r-name">${i + 1}. ${escapeHtml(item.nome)}</span>` +
      `<span class="r-score">${item.pontuacao}</span>`;
    el.rankList.appendChild(li);
  });
}

/* ============================================================
   GANCHOS DE BACKEND (Firebase / Supabase) — modulares e opcionais
   O jogo funciona 100% sem eles. Preencha LINKS_CONFIG para ativar.
   ============================================================ */

/** Envia a pontuação para o placar global (Supabase REST). Falha silenciosamente. */
async function salvarPontuacaoGlobal(nome, pontuacao) {
  const { url, anonKey } = LINKS_CONFIG.supabase;
  if (!url || !anonKey) {
    console.info("ℹ️ Supabase incompleto (falta anonKey) — pontuação salva apenas localmente.");
    return;
  }
  try {
    const resp = await fetch(`${url}/rest/v1/pontuacoes`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ nome, pontuacao }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    console.info("✅ Pontuação enviada ao placar global!");
  } catch (err) {
    console.warn("⚠️ Falha ao salvar pontuação global (jogo não afetado):", err);
  }
}

/** Busca o top-N do ranking global (Supabase REST). Retorna [] se indisponível. */
async function buscarRanking(limite = 10) {
  const { url, anonKey } = LINKS_CONFIG.supabase;
  if (!url || !anonKey) return [];
  try {
    const resp = await fetch(
      `${url}/rest/v1/pontuacoes?select=nome,pontuacao&order=pontuacao.desc&limit=${limite}`,
      { headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json(); // [{ nome, pontuacao }, ...]
  } catch (err) {
    console.warn("⚠️ Falha ao buscar ranking:", err);
    return [];
  }
}

/** Hook opcional de autenticação (login com Google etc.). */
async function autenticarUsuario() {
  // Implemente aqui Firebase Auth / Supabase Auth no futuro.
  return null; // convidado
}

/* ---------- Eventos (toque, clique, teclado) ---------- */
canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); flap(); });
el.btnStart.addEventListener("click", startStory); // JOGAR → cutscene da história
el.btnRestart.addEventListener("click", startGame);
document.addEventListener("keydown", (e) => {
  // ⌨️ digitando no campo de nome: não captura Space/Enter do jogo
  if (e.target && e.target.tagName === "INPUT") {
    if (e.code === "Enter") e.target.blur(); // Enter confirma e sai do campo
    return;
  }
  const storyVisible = el.overlayStory.classList.contains("visible");

  // ENTER/ESPAÇO na cutscene: completa o texto e depois inicia o jogo
  if (storyVisible && (e.code === "Enter" || e.code === "Space")) {
    e.preventDefault();
    onStoryInput();
    return;
  }
  // ENTER no game over reinicia
  if (e.code === "Enter" && state === STATE.OVER) {
    e.preventDefault();
    startGame();
    return;
  }
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (state === STATE.OVER) startGame();
    else flap();
  }
});
// Evita scroll/zoom por toque no jogo, MAS permite rolar dentro dos overlays
document.addEventListener("touchmove", (e) => {
  if (e.target && e.target.closest(".overlay")) return; // 📜 rolagem liberada no Game Over
  e.preventDefault();
}, { passive: false });

/* ---------- Start ---------- */
resizeCanvas(); // ajusta o canvas ao tamanho real da tela antes de começar
loop();


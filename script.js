// ============================================================
// PRO EXAM v10 — Main Script
// Fixes: Device ID/PWA bug, Certificate download, Boss Fight,
//        Charts (daily/weekly/monthly), Rentgen filters,
//        Comfort Eye, Admin hints, Restart btn, Donate modal
// ============================================================

// ---- CONFIG ----
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzC4-Axk2bQsnHJYxMhzn0fblk48j2fWAheHhCxJF5as8fH-NKlIgV0-C7uO6mQfHAM/exec";

const subjectNames = {
    musiqa_nazariyasi: "Musiqa nazariyasi",
    cholgu_ijrochiligi: "Cholg'u ijrochiligi",
    vokal_ijrochiligi: "Vokal ijrochiligi",
    metodika_repertuar: "Metodika"
};

// ============================================================
// 1. DEVICE ID — PWA BUG FIX
// Muammo: PWA o'rnatilganda localStorage boshqa context'da
// Yechim: IndexedDB ishlatamiz — u PWA va browser o'rtasida umumiy
// ============================================================

const DB_NAME = 'adham_pro_db';
const DB_VERSION = 1;
let dbInstance = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) { resolve(dbInstance); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('kv')) {
                db.createObjectStore('kv', { keyPath: 'key' });
            }
        };
        req.onsuccess = e => { dbInstance = e.target.result; resolve(dbInstance); };
        req.onerror = () => reject(req.error);
    });
}

async function dbGet(key) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('kv', 'readonly');
            const req = tx.objectStore('kv').get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => reject(req.error);
        });
    } catch(e) {
        return localStorage.getItem(key); // fallback
    }
}

async function dbSet(key, value) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put({ key, value });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch(e) {
        localStorage.setItem(key, value); // fallback
    }
}

async function getOrCreateDeviceId() {
    let deviceId = await dbGet('adham_pro_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        await dbSet('adham_pro_device_id', deviceId);
    }
    return deviceId;
}

// ============================================================
// 2. SERVICE WORKER & PWA INSTALL
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW xatolik:', err));
    });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('install-app-btn');
    if (btn) btn.classList.remove('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('install-app-btn');
    if (btn) {
        btn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') btn.classList.add('hidden');
            deferredPrompt = null;
        });
    }
});

window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('install-app-btn');
    if (btn) btn.classList.add('hidden');
    deferredPrompt = null;
});

// ============================================================
// 3. SECURITY: ANTI-CHEAT & ADMIN BLOCK
// ============================================================
function copyCard() {
    const cardEl = document.getElementById("card-num") || document.getElementById("card-num-donate");
    const cardText = cardEl ? cardEl.innerText : "9860350141282409";
    navigator.clipboard.writeText(cardText).then(() => {
        alert("✓ Karta raqami nusxalandi: " + cardText + "\nTo'lovni amalga oshirib, kvitansiyani adminga yuboring.");
    }).catch(() => alert("Karta raqami: " + cardText));
}

document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', function(e) {
    if (e.keyCode === 123 ||
        (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) ||
        (e.ctrlKey && e.keyCode === 85)) {
        e.preventDefault(); return false;
    }
    if (e.ctrlKey && e.keyCode === 67) {
        e.preventDefault();
        alert("⚠ Nusxalash (Ctrl+C) qat'iyan taqiqlangan!");
        return false;
    }
});

let cheatWarnings = 0;
document.addEventListener("visibilitychange", () => {
    const testScreen = document.getElementById("test-screen");
    if (testScreen && !testScreen.classList.contains("hidden") && document.hidden) {
        cheatWarnings++;
        if (cheatWarnings >= 3) {
            alert("❌ 3 marta oynadan chiqdingiz. Sessiya avtomatik yakunlandi!");
            finishExam(true);
        } else {
            alert(`⚠ OGOHLANTIRISH (${cheatWarnings}/3)\n\nBoshqa oynaga o'tish test sessiyasini yakunlaydi!`);
        }
    }
});

async function checkAdminBlock() {
    const savedName = localStorage.getItem('pro_exam_name');
    if (!savedName) return;
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "check_block", login: savedName })
        });
        const result = await response.json();
        if (result.blocked) {
            alert("🚫 Tizim ma'muriyati (Admin) tomonidan bloklangansiz!");
            localStorage.removeItem('pro_exam_auth');
            localStorage.removeItem('pro_exam_name');
            location.reload();
        }
    } catch (e) {}
}

// Heartbeat
setInterval(() => {
    const isAuth = localStorage.getItem('pro_exam_auth');
    if (isAuth === 'true' && !document.hidden) checkAdminBlock();
}, 60000);

// ============================================================
// 4. AUTHENTICATION
// ============================================================
async function authenticateUser() {
    const loginVal = document.getElementById('auth-login').value.trim();
    const passVal  = document.getElementById('auth-password').value.trim();
    const keygenVal = document.getElementById('auth-keygen').value.trim();
    const errorEl  = document.getElementById('auth-error');
    const btn      = document.getElementById('btn-auth');

    if (!loginVal || !passVal) {
        errorEl.innerText = "Login va Parol majburiy!";
        errorEl.classList.remove('hidden'); return;
    }
    btn.innerText = "Tekshirilmoqda..."; btn.disabled = true;
    errorEl.classList.add('hidden');

    try {
        const deviceId = await getOrCreateDeviceId();
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ login: loginVal, password: passVal, keygen: keygenVal, deviceId })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.setItem('pro_exam_auth', 'true');
            localStorage.setItem('pro_exam_name', result.name || loginVal);
            document.getElementById('student-name').value = result.name || loginVal;
            switchScreen('auth-screen', 'welcome-screen');
            setInterval(checkAdminBlock, 45000);
        } else {
            errorEl.innerText = result.message || "Xato ma'lumotlar!";
            errorEl.classList.remove('hidden');
        }
    } catch (e) {
        errorEl.innerText = "Tarmoqda xatolik. Internet aloqasini tekshiring.";
        errorEl.classList.remove('hidden');
    } finally {
        btn.innerText = "Kirish · Tasdiqlash"; btn.disabled = false;
    }
}

// ============================================================
// 5. AUDIO, PARTICLES, COMBO
// ============================================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playFeedback(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
        osc.start(); osc.stop(audioCtx.currentTime + 0.12);
        if ("vibrate" in navigator) navigator.vibrate(50);
    } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.22);
        gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
        osc.start(); osc.stop(audioCtx.currentTime + 0.22);
        if ("vibrate" in navigator) navigator.vibrate([150, 100, 150]);
    }
}

function createParticles(event) {
    if (!event) return;
    const x = event.clientX, y = event.clientY;
    for (let i = 0; i < 14; i++) {
        let p = document.createElement('div');
        p.className = 'magic-particle';
        document.body.appendChild(p);
        let dx = (Math.random() - 0.5) * 130;
        let dy = (Math.random() - 0.5) * 130;
        p.style.left = x + 'px'; p.style.top = y + 'px';
        p.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${dx}px,${dy}px) scale(0)`, opacity: 0 }
        ], { duration: 620, easing: 'ease-out' });
        setTimeout(() => p.remove(), 620);
    }
}

function speakQuestion(idx) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(currentTest[idx].q);
        msg.lang = 'uz-UZ'; msg.rate = 0.9;
        window.speechSynthesis.speak(msg);
    } else {
        alert("Brauzeringiz ovozli o'qishni qo'llab-quvvatlamaydi.");
    }
}

let comboCount = 0, hackerStreak = 0, lastAnswerTime = 0, totalErrorsInTest = 0;

function showComboBadge() {
    const badge = document.getElementById('combo-badge');
    badge.innerText = `COMBO x${comboCount} 🔥`;
    badge.classList.remove('hidden');
    badge.style.animation = 'none'; void badge.offsetWidth;
    badge.style.animation = 'comboPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    setTimeout(() => badge.classList.add('hidden'), 2000);
}

function showHackerBadge() {
    const badge = document.getElementById('hacker-badge');
    badge.classList.remove('hidden');
    badge.style.animation = 'none'; void badge.offsetWidth;
    badge.style.animation = 'comboPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    setTimeout(() => badge.classList.add('hidden'), 3000);
}

// ============================================================
// 6. STREAK & GREETING
// ============================================================
function updateDailyStreak() {
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem('adham_last_date');
    let streak = parseInt(localStorage.getItem('adham_streak')) || 0;
    if (lastDate !== today) {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        streak = (lastDate === yesterday.toDateString()) ? streak + 1 : 1;
        localStorage.setItem('adham_last_date', today);
        localStorage.setItem('adham_streak', streak);
    }
    const el1 = document.getElementById('streak-count');
    const el2 = document.getElementById('streak-dash');
    if (el1) el1.innerText = streak;
    if (el2) el2.innerText = streak;
}

function updateGreeting() {
    const h = new Date().getHours();
    let text = h >= 5 && h < 12 ? "Xayrli tong" :
               h >= 12 && h < 18 ? "Xayrli kun" :
               h >= 18 && h < 22 ? "Xayrli kech" : "Xayrli tun";
    const el = document.getElementById('greeting-text');
    if (el) el.innerText = text;
}

// ============================================================
// 7. GLOBAL STATE & MODAL HELPERS
// ============================================================
let bank = [], currentTest = [], userAnswers = [], currentIndex = 0;
let currentUser = null, timerInterval;
let stats = JSON.parse(localStorage.getItem('adham_pro_stats')) || { learned: [], errors: [], history: [] };
let pendingSubject = null, pendingLevelQs = [], testType = null;
let diffTime = 900, orderMode = 'random', isExamMode = false;
let testModeName = "";
let donateShownCount = parseInt(localStorage.getItem('adham_donate_count')) || 0;
let currentRentgenView = 'all';
let currentChartPeriod = 'daily';

function forceCloseAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}
function closeModal(e, id) {
    if (e.target.id === id) document.getElementById(id).style.display = 'none';
}
function closeModalDirect(id) {
    document.getElementById(id).style.display = 'none';
}

// ============================================================
// 8. DATA LOADING & INIT
// ============================================================
async function loadData() {
    const files = [
        'musiqa_nazariyasi.json',
        'cholgu_ijrochiligi.json',
        'vokal_ijrochiligi.json',
        'metodika_repertuar.json'
    ];
    let globalId = 1;
    for (const f of files) {
        try {
            const res = await fetch(f);
            const data = await res.json();
            const subName = f.replace('.json', '');
            data.forEach(q => {
                let opts = q.options.filter(o => o !== null && o !== undefined && o.toString().trim() !== '');
                let uniqueOpts = [...new Set(opts)];
                let correctText = q.options[q.answer];
                if (uniqueOpts.length === 3) uniqueOpts.push("Barcha javoblar to'g'ri");
                bank.push({ id: globalId++, subject: subName, q: q.q, originalOpts: uniqueOpts, correctText });
            });
        } catch (e) { console.warn(f + " topilmadi"); }
    }
    const el = document.getElementById('max-learned-total');
    if (el) el.innerText = `/ ${bank.length}`;
    updateDashboardStats();
    updateDailyStreak();
    updateGreeting();
    updateProgressChart(currentChartPeriod);
    updateCategoryProgress();
}

window.onload = async () => {
    await loadData();

    const isAuth = localStorage.getItem('pro_exam_auth');
    if (isAuth === 'true') {
        const name = localStorage.getItem('pro_exam_name') || 'Talaba';
        const snEl = document.getElementById('student-name');
        if (snEl) snEl.value = name;
        const dnEl = document.getElementById('display-name');
        if (dnEl) dnEl.innerText = name;
        currentUser = name;
        document.getElementById('global-nav').classList.remove('hidden');

        // Check if auth screen or welcome screen is active
        const authScreen = document.getElementById('auth-screen');
        if (authScreen && !authScreen.classList.contains('hidden')) {
            switchScreen('auth-screen', 'welcome-screen');
        }
        checkAdminBlock();
    }

    // Theme restore
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.replace('light-mode', 'dark-mode');
        const slider = document.getElementById('theme-slider');
        if (slider) slider.checked = true;
    }
    // Comfort Eye restore
    if (localStorage.getItem('comfort_eye') === 'on') {
        document.body.classList.add('comfort-eye');
        const btn = document.getElementById('comfortEyeToggle');
        if (btn) btn.classList.add('eye-active');
        const openEye = document.getElementById('eye-open-icon');
        const closedEye = document.getElementById('eye-closed-icon');
        if (openEye) { openEye.classList.add('active-eye'); }
        if (closedEye) { closedEye.classList.remove('active-eye'); }
    }
};

// ============================================================
// 9. THEME & COMFORT EYE
// ============================================================
function toggleTheme() {
    const slider = document.getElementById('theme-slider');
    if (slider && slider.checked) {
        document.body.classList.replace('light-mode', 'dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.replace('dark-mode', 'light-mode');
        localStorage.setItem('theme', 'light');
    }
}

function toggleComfortEye() {
    const btn = document.getElementById('comfortEyeToggle');
    const openEye   = document.getElementById('eye-open-icon');
    const closedEye = document.getElementById('eye-closed-icon');
    const isOn = document.body.classList.contains('comfort-eye');

    if (isOn) {
        document.body.classList.remove('comfort-eye');
        btn.classList.remove('eye-active');
        closedEye.classList.add('active-eye');
        openEye.classList.remove('active-eye');
        localStorage.setItem('comfort_eye', 'off');
    } else {
        document.body.classList.add('comfort-eye');
        btn.classList.add('eye-active');
        openEye.classList.add('active-eye');
        closedEye.classList.remove('active-eye');
        localStorage.setItem('comfort_eye', 'on');
    }
}

// ============================================================
// 10. SCREEN NAVIGATION
// ============================================================
function switchScreen(hideId, showId) {
    forceCloseAllModals();
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active'); s.classList.add('hidden');
    });
    const showEl = document.getElementById(showId);
    if (showEl) { showEl.classList.remove('hidden'); showEl.classList.add('active'); }
}

function handleLogin() {
    const name = document.getElementById('student-name').value.trim();
    if (name.length < 2) return alert("Ismingizni kiriting!");

    // Easter Egg: Admin
    if (name.toLowerCase() === 'adham') {
        alert("Assalomu alaykum, Admin (Creator)! 🔑\nSizga maxsus rejim yoqildi.");
    }

    currentUser = name;
    const dnEl = document.getElementById('display-name');
    if (dnEl) dnEl.innerText = name;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    document.getElementById('global-nav').classList.remove('hidden');
    switchScreen('welcome-screen', 'dashboard-screen');
    updateGreeting();
    updateProgressChart(currentChartPeriod);
    updateCategoryProgress();
    showRentgenOnDashboard();
}

function goHome() {
    clearInterval(timerInterval);
    forceCloseAllModals();
    document.getElementById('exit-test-btn').classList.add('hidden');
    document.getElementById('exam-timer').classList.add('hidden');
    document.getElementById('restart-mini-btn').classList.add('hidden');
    document.body.classList.remove('boss-fight-mode');
    const bossWarn = document.getElementById('boss-fight-warning');
    if (bossWarn) bossWarn.classList.add('hidden');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    cheatWarnings = 0; comboCount = 0; hackerStreak = 0; totalErrorsInTest = 0;
    switchScreen('test-screen', 'dashboard-screen');
    updateDashboardStats();
    updateProgressChart(currentChartPeriod);
    updateCategoryProgress();
    showRentgenOnDashboard();
}

function confirmExit() {
    if (confirm("Testdan chiqishni xohlaysizmi?\nJoriy natijalar yo'qoladi.")) goHome();
}

function logout() {
    if (confirm("Tizimdan chiqishni xohlaysizmi?")) {
        localStorage.removeItem('pro_exam_auth');
        location.reload();
    }
}

// ============================================================
// 11. DASHBOARD STATS & CHARTS
// ============================================================
function updateDashboardStats() {
    stats.learned = [...new Set(stats.learned)];
    stats.errors  = [...new Set(stats.errors)];
    localStorage.setItem('adham_pro_stats', JSON.stringify(stats));

    document.getElementById('learned-count').innerText = stats.learned.length;
    document.getElementById('error-count').innerText   = stats.errors.length;
    const errBtn = document.getElementById('error-work-btn');
    if (errBtn) errBtn.disabled = stats.errors.length === 0;
}

function updateCategoryProgress() {
    const subjects = ['musiqa_nazariyasi', 'cholgu_ijrochiligi', 'vokal_ijrochiligi', 'metodika_repertuar'];
    subjects.forEach(sub => {
        const subQs = bank.filter(q => q.subject === sub);
        if (!subQs.length) return;
        const learned = subQs.filter(q => stats.learned.includes(q.id)).length;
        const pct = Math.round((learned / subQs.length) * 100);
        const el = document.getElementById('prog-' + sub);
        if (el) el.innerText = pct + '%';
    });
}

// ---- PROGRESS CHART (Trading style) ----
function setChartPeriod(period, btn) {
    currentChartPeriod = period;
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateProgressChart(period);
}

function getHistoryByPeriod(period) {
    // history items: { date: 'YYYY-MM-DD', correct: N, errors: N }
    const history = stats.history || [];
    const now = new Date();
    let labels = [], correctData = [], errorData = [];

    if (period === 'daily') {
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now); d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0,10);
            const entry = history.find(h => h.date === key) || { correct: 0, errors: 0 };
            labels.push(d.toLocaleDateString('uz', { weekday: 'short' }));
            correctData.push(entry.correct || 0);
            errorData.push(entry.errors || 0);
        }
    } else if (period === 'weekly') {
        // Last 6 weeks
        for (let i = 5; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
            const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
            const startKey = weekStart.toISOString().slice(0,10);
            const endKey   = weekEnd.toISOString().slice(0,10);
            const weekEntries = history.filter(h => h.date >= startKey && h.date <= endKey);
            const c = weekEntries.reduce((s,e) => s + (e.correct||0), 0);
            const er = weekEntries.reduce((s,e) => s + (e.errors||0), 0);
            labels.push(weekStart.getDate() + '/' + (weekStart.getMonth()+1));
            correctData.push(c); errorData.push(er);
        }
    } else { // monthly
        for (let i = 5; i >= 0; i--) {
            const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = m.toISOString().slice(0,7); // 'YYYY-MM'
            const monthEntries = history.filter(h => h.date.startsWith(key));
            const c  = monthEntries.reduce((s,e) => s + (e.correct||0), 0);
            const er = monthEntries.reduce((s,e) => s + (e.errors||0), 0);
            labels.push(m.toLocaleDateString('uz', { month: 'short' }));
            correctData.push(c); errorData.push(er);
        }
    }
    return { labels, correctData, errorData };
}

function updateProgressChart(period) {
    const canvas = document.getElementById('progressChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { labels, correctData, errorData } = getHistoryByPeriod(period);
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 300;
    const H = 100;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const maxVal = Math.max(...correctData, ...errorData, 1);
    const padL = 6, padR = 6, padT = 10, padB = 18;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const n = labels.length;
    const step = chartW / (n - 1 || 1);

    function drawLine(data, color, fill) {
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = padL + i * step;
            const y = padT + chartH - (v / maxVal) * chartH;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        if (fill) {
            // Fill gradient
            const firstX = padL, lastX = padL + (n-1)*step;
            const lastY  = padT + chartH - (data[n-1] / maxVal) * chartH;
            ctx.lineTo(lastX, padT + chartH);
            ctx.lineTo(firstX, padT + chartH);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
            grad.addColorStop(0, color.replace(')', ',0.25)').replace('rgb', 'rgba'));
            grad.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'));
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.beginPath();
            data.forEach((v, i) => {
                const x = padL + i * step;
                const y = padT + chartH - (v / maxVal) * chartH;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Dots
        data.forEach((v, i) => {
            const x = padL + i * step;
            const y = padT + chartH - (v / maxVal) * chartH;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });
    }

    // Error line (red)
    drawLine(errorData, 'rgb(255,69,58)', true);
    // Correct line (green) — on top
    drawLine(correctData, 'rgb(48,209,88)', true);

    // Labels
    ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--text-sec').trim() || '#6B7280';
    ctx.font = `600 9px DM Sans, sans-serif`;
    ctx.textAlign = 'center';
    labels.forEach((label, i) => {
        ctx.fillText(label, padL + i * step, H - 3);
    });
}

// ---- RENTGEN ON DASHBOARD ----
function showRentgenOnDashboard() {
    if (!bank.length) return;
    const wrap = document.getElementById('rentgen-dashboard-wrap');
    if (wrap) { wrap.style.display = 'block'; updateDashboardRentgen('all'); }
}

function setRentgenView(view, btn) {
    currentRentgenView = view;
    document.querySelectorAll('.rentgen-filter .rentgen-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateDashboardRentgen(view);
}

function updateDashboardRentgen(view) {
    const container = document.getElementById('rentgen-dashboard-bars');
    if (!container) return;
    container.innerHTML = '';
    const subjects = ['musiqa_nazariyasi', 'cholgu_ijrochiligi', 'vokal_ijrochiligi', 'metodika_repertuar'];
    subjects.forEach(sub => {
        const subQs = bank.filter(q => q.subject === sub);
        if (!subQs.length) return;
        const learnedCount = subQs.filter(q => stats.learned.includes(q.id)).length;
        const errorCount   = subQs.filter(q => stats.errors.includes(q.id)).length;
        let value, color, suffix;
        if (view === 'errors') {
            value = Math.round((errorCount / subQs.length) * 100);
            color = 'var(--error)'; suffix = `${errorCount} xato`;
        } else if (view === 'learned') {
            value = Math.round((learnedCount / subQs.length) * 100);
            color = 'var(--success)'; suffix = `${learnedCount} to'g'ri`;
        } else {
            value = Math.round((learnedCount / subQs.length) * 100);
            color = value >= 80 ? 'var(--success)' : value >= 50 ? 'var(--warning)' : 'var(--error)';
            suffix = value + '%';
        }
        container.innerHTML += `
            <div class="rentgen-item">
                <div class="rentgen-label">
                    <span>${subjectNames[sub]}</span>
                    <span style="color:${color}">${suffix}</span>
                </div>
                <div class="rentgen-bar-bg">
                    <div class="rentgen-bar-fill" style="width:${value}%; background:${color};"></div>
                </div>
            </div>`;
    });
}

// ============================================================
// 12. TEST ENGINE — MODALS & NAVIGATION
// ============================================================
function openLevels(sub, title) {
    forceCloseAllModals();
    pendingSubject = sub;
    document.getElementById('modal-subject-title').innerText = title;
    const grid = document.getElementById('level-grid-box');
    grid.innerHTML = '';
    let subQs = bank.filter(q => q.subject === sub);
    for (let i = 0; i < 10; i++) {
        let start = i * 20, end = start + 20;
        if (start >= subQs.length) break;
        const chunk = subQs.slice(start, end);
        const learned = chunk.filter(q => stats.learned.includes(q.id)).length;
        const isDone = learned === chunk.length;
        const btn = document.createElement('button');
        btn.className = 'lvl-btn';
        btn.innerHTML = `<b>${i+1}-Daraja</b><span style="font-size:0.78rem; color:${isDone ? 'var(--success)' : 'var(--text-sec)'};">${learned}/${chunk.length} ✓</span>`;
        btn.onclick = () => { pendingLevelQs = chunk; testType = 'level'; openSetup(); };
        grid.appendChild(btn);
    }
    document.getElementById('modal-level').style.display = 'flex';
}

function openChapters() {
    forceCloseAllModals();
    const grid = document.getElementById('chapters-grid-box');
    grid.innerHTML = '';
    const cleanBank = [...bank].sort((a,b) => a.id - b.id);
    const chunks = Math.ceil(cleanBank.length / 20);
    for (let i = 0; i < chunks; i++) {
        let start = i * 20, end = Math.min(start + 20, cleanBank.length);
        const chunk = cleanBank.slice(start, end);
        const learned = chunk.filter(q => stats.learned.includes(q.id)).length;
        const isDone  = learned === chunk.length;
        const btn = document.createElement('button');
        btn.className = 'lvl-btn';
        btn.innerHTML = `<b>${start+1}–${end}</b><span style="font-size:0.78rem; color:${isDone ? 'var(--success)' : 'var(--warning)'};">${learned}/${end-start} ✓</span>`;
        btn.onclick = () => { pendingLevelQs = chunk; testType = 'chapter'; openSetup(); };
        grid.appendChild(btn);
    }
    document.getElementById('modal-chapters').style.display = 'flex';
}

function prepareTest(type) {
    forceCloseAllModals();
    if (type === 'errors' && stats.errors.length === 0) return alert("Hozircha xatolar topilmadi!");
    testType = type; openSetup();
}

function openSetup() {
    forceCloseAllModals();
    document.getElementById('setup-screen').style.display = 'flex';
}

function setDifficulty(level, btn) {
    document.querySelectorAll('.difficulty-control .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    diffTime = level === 'easy' ? 1200 : level === 'medium' ? 900 : 600;
}

function setOrder(mode, btn) {
    document.querySelectorAll('.order-control .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    orderMode = mode;
}

function applySetup() {
    forceCloseAllModals();
    isExamMode = false;
    cheatWarnings = 0; comboCount = 0; hackerStreak = 0; totalErrorsInTest = 0;
    document.body.classList.remove('boss-fight-mode');
    let pool = [];
    const cleanBank = [...bank].sort((a,b) => a.id - b.id);

    if (testType === 'level' || testType === 'chapter') {
        pool = [...pendingLevelQs];
        testModeName = testType === 'level' ? `${pendingSubject} daraja` : "Bob rejimi";
    } else if (testType === 'mix_800') {
        pool = [...cleanBank].sort(() => Math.random() - 0.5).slice(0, 20);
        testModeName = "Aralash Smart Mix";
    } else if (testType === 'errors') {
        pool = cleanBank.filter(q => stats.errors.includes(q.id)).sort(() => Math.random() - 0.5).slice(0, 20);
        testModeName = "Xatolar ustida ishlash";
    } else if (testType === 'sub_mix') {
        pool = cleanBank.filter(q => q.subject === pendingSubject).sort(() => Math.random() - 0.5).slice(0, 20);
        testModeName = (subjectNames[pendingSubject] || pendingSubject) + " aralash";
    }

    if (orderMode === 'random') pool = pool.sort(() => Math.random() - 0.5);
    else pool = pool.sort((a,b) => a.id - b.id);

    currentTest = pool;
    startTestSession();
}

function startExamMode() {
    forceCloseAllModals();
    testType = 'exam'; isExamMode = true;
    testModeName = "Imtihon Mode · Boss Fight";
    cheatWarnings = 0; comboCount = 0; hackerStreak = 0; totalErrorsInTest = 0;
    let examQs = [];
    const subjects = ['musiqa_nazariyasi', 'cholgu_ijrochiligi', 'vokal_ijrochiligi', 'metodika_repertuar'];
    subjects.forEach(sub => {
        const sQs = bank.filter(q => q.subject === sub).sort(() => Math.random() - 0.5).slice(0, 15);
        examQs = examQs.concat(sQs);
    });
    currentTest = examQs.sort(() => Math.random() - 0.5);
    diffTime = 3600;
    startTestSession();
}

function startTestSession() {
    switchScreen('dashboard-screen', 'test-screen');
    document.getElementById('exit-test-btn').classList.remove('hidden');
    document.getElementById('exam-timer').classList.remove('hidden');
    document.getElementById('restart-mini-btn').classList.add('hidden');

    currentIndex = 0;
    userAnswers = new Array(currentTest.length).fill(null);
    currentTest = currentTest.map(q => {
        const shuffledOpts = [...q.originalOpts].sort(() => Math.random() - 0.5);
        return { ...q, options: shuffledOpts, answer: shuffledOpts.indexOf(q.correctText) };
    });

    clearInterval(timerInterval);
    startTimer(diffTime);
    renderMap();
    renderAllQuestions();
}

function startTimer(seconds) {
    let time = seconds;
    const timerEl = document.getElementById('exam-timer');
    timerInterval = setInterval(() => {
        time--;
        const m = Math.floor(time / 60), s = time % 60;
        if (timerEl) timerEl.innerText = `${m}:${s < 10 ? '0'+s : s}`;
        if (time <= 0) { clearInterval(timerInterval); showResult(userAnswers.filter(a => a?.isCorrect).length); }
    }, 1000);
}

function renderMap() {
    const mapEl = document.getElementById('indicator-map');
    if (mapEl) mapEl.innerHTML = currentTest.map((_, i) => `<div class="dot" id="dot-${i}" onclick="goTo(${i})">${i+1}</div>`).join('');
}

function renderAllQuestions() {
    const area = document.getElementById('all-questions-area');
    if (!area) return;
    const isAdmin = (currentUser || '').toLowerCase() === 'adham';

    area.innerHTML = currentTest.map((q, idx) => {
        const opts = q.options.map((opt, optIdx) => {
            const isAdminHint = isAdmin && optIdx === q.answer;
            return `<button class="option-btn${isAdminHint ? ' admin-hint' : ''}"
                id="btn-${idx}-${optIdx}"
                onclick="checkAns(${idx}, ${optIdx}, event)"
                ${userAnswers[idx] ? 'disabled' : ''}>
                ${opt}
            </button>`;
        }).join('');

        return `
        <div class="q-block ${idx === currentIndex ? 'active-q' : 'blurred-q'}" id="q-block-${idx}">
            <div class="q-meta">
                <button class="tts-btn" onclick="speakQuestion(${idx})" title="Ovozli o'qish">🔊</button>
                <div class="spin-box" id="spin-${idx}">${idx+1}</div>
                <span>Savol ${idx+1} / ${currentTest.length}</span>
            </div>
            <div class="q-text">${q.q}</div>
            <div class="options-box" id="opts-${idx}">${opts}</div>
        </div>`;
    }).join('');

    updateMap(); scrollToActive(); runSpin(currentIndex);
}

function runSpin(idx) {
    const spin = document.getElementById(`spin-${idx}`);
    if (!spin) return;
    let sc = 0;
    const si = setInterval(() => {
        spin.innerText = Math.floor(Math.random() * currentTest.length) + 1;
        if (++sc > 8) { clearInterval(si); spin.innerText = idx + 1; }
    }, 40);
}

function updateFocus() {
    for (let i = 0; i < currentTest.length; i++) {
        const block = document.getElementById(`q-block-${i}`);
        if (block) {
            if (i === currentIndex) {
                block.classList.remove('blurred-q'); block.classList.add('active-q');
                runSpin(i);
            } else {
                block.classList.remove('active-q'); block.classList.add('blurred-q');
            }
        }
    }

    // Boss Fight Logic — last 5 questions in exam mode
    const bossWarn = document.getElementById('boss-fight-warning');
    if (isExamMode && currentTest.length >= 5 && currentIndex >= currentTest.length - 5) {
        document.body.classList.add('boss-fight-mode');
        if (bossWarn) bossWarn.classList.remove('hidden');
    } else {
        document.body.classList.remove('boss-fight-mode');
        if (bossWarn) bossWarn.classList.add('hidden');
    }

    scrollToActive(); updateMap();
}

function scrollToActive() {
    const activeBlock = document.getElementById(`q-block-${currentIndex}`);
    if (activeBlock) activeBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const activeDot = document.getElementById(`dot-${currentIndex}`);
    if (activeDot) activeDot.scrollIntoView({ behavior: 'smooth', inline: 'center' });
}

function updateMap() {
    const answered = userAnswers.filter(a => a !== null).length;
    const fillEl = document.getElementById('progress-fill');
    if (fillEl) fillEl.style.width = `${(answered / currentTest.length) * 100}%`;
    currentTest.forEach((_, i) => {
        const dot = document.getElementById(`dot-${i}`);
        if (dot) {
            dot.className = 'dot';
            if (i === currentIndex) dot.classList.add('active-dot');
            if (userAnswers[i]) dot.classList.add(userAnswers[i].isCorrect ? 'correct' : 'wrong');
        }
    });
}

// ============================================================
// 13. ANSWER LOGIC
// ============================================================
function checkAns(qIdx, optIdx, event) {
    if (qIdx !== currentIndex || userAnswers[qIdx]) return;

    const now = Date.now();
    if (now - lastAnswerTime < 1500) { hackerStreak++; if (hackerStreak === 10) showHackerBadge(); }
    else hackerStreak = 0;
    lastAnswerTime = now;

    const isCorrect = optIdx === currentTest[qIdx].answer;
    userAnswers[qIdx] = { selected: optIdx, isCorrect };
    const qId = currentTest[qIdx].id;
    const clickedBtn = document.getElementById(`btn-${qIdx}-${optIdx}`);

    if (isCorrect) {
        if (!stats.learned.includes(qId)) stats.learned.push(qId);
        stats.errors = stats.errors.filter(id => id !== qId);
        clickedBtn.classList.add('magic-correct');
        playFeedback('correct'); createParticles(event);
        comboCount++;
        if (comboCount >= 3) showComboBadge();
        document.body.classList.add('ambient-success');
        setTimeout(() => document.body.classList.remove('ambient-success'), 650);
    } else {
        if (!stats.errors.includes(qId)) stats.errors.push(qId);
        clickedBtn.classList.add('magic-wrong');
        playFeedback('wrong');
        comboCount = 0; hackerStreak = 0; totalErrorsInTest++;
        document.body.classList.add('ambient-error');
        setTimeout(() => document.body.classList.remove('ambient-error'), 650);
        if (totalErrorsInTest === 1) {
            document.getElementById('restart-mini-btn').classList.remove('hidden');
        }
    }

    localStorage.setItem('adham_pro_stats', JSON.stringify(stats));
    const opts = document.getElementById(`opts-${qIdx}`).getElementsByTagName('button');
    for (let btn of opts) btn.disabled = true;

    if (userAnswers.filter(a => a !== null).length === currentTest.length) {
        document.getElementById('finish-btn').classList.remove('hidden');
    }
    setTimeout(() => {
        const next = userAnswers.findIndex(ans => ans === null);
        if (next !== -1) { currentIndex = next; updateFocus(); }
    }, 820);
}

function move(step) {
    const n = currentIndex + step;
    if (n >= 0 && n < currentTest.length) { currentIndex = n; updateFocus(); }
}
function goTo(i) { currentIndex = i; updateFocus(); }

// Restart logic
function confirmRestart() {
    document.getElementById('modal-restart').style.display = 'flex';
}
function doRestart() {
    closeModalDirect('modal-restart');
    clearInterval(timerInterval);
    currentIndex = 0;
    userAnswers = new Array(currentTest.length).fill(null);
    comboCount = 0; hackerStreak = 0; totalErrorsInTest = 0;
    document.body.classList.remove('boss-fight-mode');
    document.getElementById('finish-btn').classList.add('hidden');
    document.getElementById('restart-mini-btn').classList.add('hidden');
    const bossWarn = document.getElementById('boss-fight-warning');
    if (bossWarn) bossWarn.classList.add('hidden');
    startTimer(diffTime);
    renderAllQuestions();
}

// ============================================================
// 14. FINISH & RESULTS
// ============================================================
function finishExam(force = false) {
    clearInterval(timerInterval);
    document.body.classList.remove('boss-fight-mode');
    const bossWarn = document.getElementById('boss-fight-warning');
    if (bossWarn) bossWarn.classList.add('hidden');
    document.getElementById('restart-mini-btn').classList.add('hidden');

    const correctCount = userAnswers.filter(a => a?.isCorrect).length;

    if (!isExamMode && correctCount < currentTest.length && !force) {
        alert(`Natija: ${correctCount}/${currentTest.length}.\nQoidaga ko'ra, 100% to'g'ri bo'lmaguncha savollar qayta beriladi.`);
        currentTest = shuffleArray(currentTest).map(q => {
            const correctText = q.options[q.answer];
            const shuffledOpts = shuffleArray([...q.options]);
            return { ...q, options: shuffledOpts, answer: shuffledOpts.indexOf(correctText) };
        });
        userAnswers = new Array(currentTest.length).fill(null);
        currentIndex = 0; totalErrorsInTest = 0; comboCount = 0;
        startTimer(diffTime); renderAllQuestions();
        document.getElementById('finish-btn').classList.add('hidden');
    } else {
        // Record history entry
        recordHistory(correctCount, currentTest.length - correctCount);
        showResult(correctCount);
    }
}

function shuffleArray(arr) { return arr.sort(() => Math.random() - 0.5); }

function recordHistory(correct, errors) {
    const today = new Date().toISOString().slice(0, 10);
    if (!stats.history) stats.history = [];
    const existing = stats.history.find(h => h.date === today);
    if (existing) {
        existing.correct += correct;
        existing.errors  += errors;
    } else {
        stats.history.push({ date: today, correct, errors });
        if (stats.history.length > 180) stats.history.shift(); // keep 6 months
    }
    localStorage.setItem('adham_pro_stats', JSON.stringify(stats));
}

function showResult(correctCount) {
    const percent = Math.round((correctCount / currentTest.length) * 100);
    document.getElementById('result-percent').innerText = `${percent}%`;

    let msg = '', color = '';
    if (percent >= 90) {
        msg = "Muhtasham natija! Siz haqiqiy mutaxassissiz. 🏆";
        color = "var(--success)";
        confetti({ particleCount: 220, spread: 90, origin: { y: 0.6 } });
        document.getElementById('cert-btn').style.display = 'block';
    } else if (percent >= 70) {
        msg = "Yaxshi ko'rsatkich! Akademik cho'qqiga oz qoldi. 👍";
        color = "var(--primary)";
        document.getElementById('cert-btn').style.display = 'none';
    } else if (percent >= 50) {
        msg = "Qoniqarli! Intellektual salohiyatingiz bundan baland. 📚";
        color = "var(--warning)";
        document.getElementById('cert-btn').style.display = 'none';
    } else {
        msg = "Chuqur tahlil qiling va qayta urinib ko'ring! ⚠";
        color = "var(--error)";
        document.getElementById('cert-btn').style.display = 'none';
    }

    document.getElementById('result-msg').innerText = msg;
    const donut = document.getElementById('result-donut');
    donut.style.borderColor = color;
    donut.style.boxShadow = `0 0 35px ${color}`;
    document.getElementById('result-percent').style.color = color;

    // Rentgen bars
    renderRentgenBars('all');

    // Trading chart
    renderTradingChart();

    forceCloseAllModals();
    document.getElementById('modal-result').style.display = 'flex';

    // Donate modal after every 3 completions
    donateShownCount++;
    localStorage.setItem('adham_donate_count', donateShownCount);
    if (donateShownCount % 3 === 0) {
        setTimeout(() => {
            forceCloseAllModals();
            document.getElementById('modal-donate').style.display = 'flex';
        }, 3000);
    }
}

function setResultRentgenView(view, btn) {
    document.querySelectorAll('.rentgen-filter-result .rentgen-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderRentgenBars(view);
}

function renderRentgenBars(view) {
    const barsContainer = document.getElementById('rentgen-bars');
    if (!barsContainer) return;
    barsContainer.innerHTML = '';
    const subjectsInTest = [...new Set(currentTest.map(q => q.subject))];

    subjectsInTest.forEach(sub => {
        const subQs = currentTest.filter(q => q.subject === sub);
        const subCorrect = subQs.filter((q) => {
            const idx = currentTest.indexOf(q);
            return userAnswers[idx] && userAnswers[idx].isCorrect;
        }).length;
        const subPercent = Math.round((subCorrect / subQs.length) * 100);
        const subError   = 100 - subPercent;

        let barColor, subMsg, displayValue;
        if (view === 'errors') {
            displayValue = subError;
            barColor = subError > 50 ? 'var(--error)' : 'var(--warning)';
            subMsg = `${subQs.length - subCorrect} xato`;
        } else if (view === 'learned') {
            displayValue = subPercent;
            barColor = subPercent >= 90 ? 'var(--success)' : subPercent >= 60 ? 'var(--warning)' : 'var(--error)';
            subMsg = `${subCorrect} to'g'ri`;
        } else {
            displayValue = subPercent;
            barColor = subPercent >= 90 ? 'var(--success)' : subPercent >= 60 ? 'var(--warning)' : 'var(--error)';
            subMsg = subPercent >= 90 ? '(Ajoyib!)' : subPercent >= 60 ? '(Yaxshi)' : '(Kuchsiz)';
        }

        barsContainer.innerHTML += `
            <div class="rentgen-item">
                <div class="rentgen-label">
                    <span>${subjectNames[sub] || sub} ${view === 'all' ? subMsg : ''}</span>
                    <span style="color:${barColor}">${view === 'all' ? subPercent+'%' : (view==='errors' ? subQs.length-subCorrect+' xato' : subCorrect+' to\'g\'ri')}</span>
                </div>
                <div class="rentgen-bar-bg">
                    <div class="rentgen-bar-fill" style="width:${displayValue}%; background:${barColor};"></div>
                </div>
            </div>`;
    });
}

function renderTradingChart() {
    const canvas = document.getElementById('tradingChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 380;
    const H = 90;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // Build per-question correct/error running totals
    const correctArr = [], errorArr = [];
    let c = 0, e = 0;
    userAnswers.forEach(ans => {
        if (ans === null) return;
        if (ans.isCorrect) c++; else e++;
        correctArr.push(c);
        errorArr.push(e);
    });
    if (!correctArr.length) return;

    const maxVal = Math.max(...correctArr, ...errorArr, 1);
    const padL = 6, padR = 6, padT = 8, padB = 6;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const n = correctArr.length;
    const step = n > 1 ? chartW / (n - 1) : chartW;

    function drawTradingLine(data, color) {
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = padL + i * step;
            const y = padT + chartH - (v / maxVal) * chartH;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        // Fill
        const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
        const rgba = color.includes('48,209') ? '48,209,88' : '255,69,58';
        grad.addColorStop(0, `rgba(${rgba},0.2)`);
        grad.addColorStop(1, `rgba(${rgba},0)`);
        ctx.lineTo(padL + (n-1)*step, padT + chartH);
        ctx.lineTo(padL, padT + chartH);
        ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();
        // Line
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = padL + i * step;
            const y = padT + chartH - (v / maxVal) * chartH;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        ctx.stroke();
    }

    drawTradingLine(errorArr, 'rgb(255,69,58)');
    drawTradingLine(correctArr, 'rgb(48,209,88)');
}

// ============================================================
// 15. CERTIFICATE
// ============================================================
function showCertificate() {
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2,'0')}.${(today.getMonth()+1).toString().padStart(2,'0')}.${today.getFullYear()}`;

    document.getElementById('cert-student-name').innerText = currentUser || "Noma'lum Talaba";
    document.getElementById('cert-mode-name').innerText    = testModeName || "Test";
    document.getElementById('cert-score').innerText        = document.getElementById('result-percent').innerText;
    document.getElementById('cert-global-stats').innerText = `${stats.learned.length}/${bank.length}`;
    document.getElementById('cert-date').innerText         = dateStr;

    // Subject bars in cert
    const barsEl = document.getElementById('cert-subject-bars');
    if (barsEl) {
        barsEl.innerHTML = '';
        const subjectsInTest = [...new Set(currentTest.map(q => q.subject))];
        subjectsInTest.forEach(sub => {
            const subQs = currentTest.filter(q => q.subject === sub);
            const subCorrect = subQs.filter((q) => {
                const idx = currentTest.indexOf(q);
                return userAnswers[idx] && userAnswers[idx].isCorrect;
            }).length;
            const pct = Math.round((subCorrect / subQs.length) * 100);
            barsEl.innerHTML += `
                <div class="cert-sub-bar-wrap">
                    <span class="cert-sub-label">${subjectNames[sub] || sub}</span>
                    <div class="cert-sub-bar-bg">
                        <div class="cert-sub-bar-fill" style="width:${pct}%"></div>
                    </div>
                    <span class="cert-sub-pct">${pct}%</span>
                </div>`;
        });
    }

    forceCloseAllModals();
    document.getElementById('modal-cert').style.display = 'flex';
    confetti({ particleCount: 300, spread: 130, origin: { y: 0.5 }, colors: ['#D4AF37', '#FFF8E7', '#FFFFFF'] });
}

async function downloadCertificate() {
    const certEl = document.getElementById('printable-cert');
    if (!certEl) return;
    try {
        const canvas = await html2canvas(certEl, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#0A0A0A',
            logging: false
        });
        const link = document.createElement('a');
        link.download = `PRO_EXAM_Sertifikat_${(currentUser||'Talaba').replace(/\s/g,'_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (e) {
        // Fallback: print
        window.print();
    }
}

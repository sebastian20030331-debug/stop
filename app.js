// CONFIGURACIÓN FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyBMBZoGsex5H2QDxPNrjpPWabHrNHuW1tg",
    authDomain: "stop-multiplayer-73a11.firebaseapp.com",
    projectId: "stop-multiplayer-73a11",
    storageBucket: "stop-multiplayer-73a11.firebasestorage.app",
    messagingSenderId: "214107973500",
    appId: "1:214107973500:web:230316d4f6a553529c26f9"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let room = "";
let player = "";
let isHost = false;
let timerInterval;
let roundFinished = false;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// --- 1. GESTIÓN DE SALAS ---
function createRoom() {
    player = document.getElementById("playerName").value.trim();
    if (!player) return showAlert("⚠️ Escribe tu nombre");
    room = Math.random().toString(36).substring(2, 7).toUpperCase();
    isHost = true; 

    db.ref("rooms/" + room).set({
        host: player,
        status: "lobby",
        stop: false,
        usedLetters: [],
        players: { [player]: true }
    }).then(() => enterLobby());
}

function joinRoom() {
    player = document.getElementById("playerName").value.trim();
    room = document.getElementById("roomCode").value.toUpperCase().trim();
    if (!player || !room) return showAlert("⚠️ Completa los datos");

    db.ref("rooms/" + room).once("value", snap => {
        if (!snap.exists()) return showAlert("⚠️ La sala no existe");
        db.ref("rooms/" + room + "/players/" + player).set(true).then(() => enterLobby());
    });
}

function enterLobby() {
    document.getElementById("login").classList.add("hidden");
    document.getElementById("lobby").classList.remove("hidden");
    document.getElementById("roomDisplay").innerText = room;
    listenPlayers();
    listenGameStatus();
    updateScoreBoard();
}

function listenPlayers() {
    db.ref("rooms/" + room + "/players").on("value", snap => {
        const players = snap.val() || {};
        let html = "<h3>👥 Jugadores</h3>";
        for (let p in players) html += `<p>${p} ${p === player ? '<b>(Tú)</b>' : ''}</p>`;
        document.getElementById("players").innerHTML = html;
        
        // El host siempre se verifica aquí
        db.ref("rooms/" + room + "/host").once("value", hSnap => {
            isHost = (player === hSnap.val());
            document.getElementById("startBtn").classList.toggle("hidden", !isHost);
        });
    });
}

// --- 2. LÓGICA DEL JUEGO ---
function startGame() {
    if (!isHost) return;
    db.ref("rooms/" + room).once('value', snap => {
        const data = snap.val();
        let used = data.usedLetters || [];
        let available = alphabet.filter(l => !used.includes(l));
        if (available.length === 0) { used = []; available = [...alphabet]; }
        let letter = available[Math.floor(Math.random() * available.length)];
        used.push(letter);

        db.ref("rooms/" + room).update({
            status: "playing",
            letter: letter,
            usedLetters: used,
            stop: false,
            stopper: "",
            answers: null,
            evaluations: null
        });
    });
}

function listenGameStatus() {
    db.ref("rooms/" + room + "/status").on("value", snap => {
        const status = snap.val();
        if (status === "playing") startRound();
        if (status === "review") showLiveReview();
        if (status === "results") showFinalRanking();
        if (status === "waiting_next") resetUIForNextRound();
    });
}

function startRound() {
    roundFinished = false;
    clearInterval(timerInterval);
    
    document.getElementById("resultModal").classList.add("hidden");
    document.getElementById("stopOverlay").classList.add("hidden");
    document.getElementById("lobby").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");
    document.getElementById("stopBtnAction").classList.remove("hidden");

    document.getElementById("postGameActions").classList.add("hidden");

    document.querySelectorAll("#game input").forEach(i => { 
        i.value = ""; 
        i.disabled = false; 
    });

    db.ref("rooms/" + room + "/letter").once("value", snap => {
        document.getElementById("letter").innerText = snap.val();
        listenStop();
        startTimer(60);
    });
}

function startTimer(time) {
    let t = time;
    document.getElementById("timer").innerText = t;
    timerInterval = setInterval(() => {
        t--;
        document.getElementById("timer").innerText = t;
        if (t <= 0 && !roundFinished) stopRound();
    }, 1000);
}

function stopRound() {
    if (roundFinished) return;
    db.ref("rooms/" + room).update({ stop: true, stopper: player });
}

function listenStop() {
    db.ref("rooms/" + room + "/stop").on("value", snap => {
        if (snap.val() === true && !roundFinished) {
            roundFinished = true;
            clearInterval(timerInterval);
            document.querySelectorAll("#game input").forEach(i => i.disabled = true);
            document.getElementById("stopBtnAction").classList.add("hidden");
            document.getElementById("stopOverlay").classList.remove("hidden");
            
            db.ref("rooms/" + room + "/stopper").once("value", sSnap => {
                document.getElementById("whoStopped").innerText = `¡${sSnap.val()} dijo STOP!`;
            });

            submitAnswers();
            if (isHost) setTimeout(() => db.ref("rooms/" + room).update({status: "review"}), 3000);
        }
    });
}

function submitAnswers() {
    const cats = {
        nombre: document.getElementById("catNombre").value.trim(),
        apellido: document.getElementById("catApellido").value.trim(),
        ciudad: document.getElementById("catCiudad").value.trim(),
        animal: document.getElementById("catAnimal").value.trim(),
        fruta: document.getElementById("catFruta").value.trim(),
        color: document.getElementById("catColor").value.trim(),
        cosa: document.getElementById("catCosa").value.trim()
    };
    db.ref("rooms/" + room + "/answers/" + player).set({ player, words: cats });
}

function showLiveReview() {
    document.getElementById("resultModal").classList.remove("hidden");
    document.getElementById("stopOverlay").classList.add("hidden");
    document.getElementById("waitMsg").classList.toggle("hidden", isHost);
    
    document.getElementById("closeModalBtn").classList.add("hidden");

    db.ref("rooms/" + room).on("value", snap => {
        const data = snap.val();
        if (!data || data.status !== "review") return;
        
        let html = '';
        for (let p in data.answers) {
            html += `<div class="player-review-block"><h4>👤 ${p}</h4>`;
            for (let cat in data.answers[p].words) {
                let word = data.answers[p].words[cat] || "---";
                let valid = (data.evaluations?.[p]?.[cat] !== false);
                html += `<div class="word-row">
                    <span class="${valid ? 'valid' : 'invalid'}"><b>${cat}:</b> ${word}</span>
                    ${isHost ? `<button onclick="toggleWord('${p}','${cat}',${!valid})">+/-</button>` : ''}
                </div>`;
            }
            html += `</div>`;
        }
        
        if (isHost) {
            html += `<button class="finish-btn" onclick="calculateFinalPoints()">Calcular Puntos</button>`;
        }
        document.getElementById("finalResults").innerHTML = html;
    });
}
function toggleWord(p, cat, state) { db.ref(`rooms/${room}/evaluations/${p}/${cat}`).set(state); }

function calculateFinalPoints() {
    db.ref("rooms/" + room).once("value", snap => {
        const data = snap.val();
        const letter = data.letter.toUpperCase();
        let wordCounts = {};
        let roundScores = {};

        for (let p in data.answers) {
            for (let cat in data.answers[p].words) {
                let val = data.answers[p].words[cat].toLowerCase().trim();
                if ((data.evaluations?.[p]?.[cat] !== false) && val && val[0].toUpperCase() === letter) {
                    wordCounts[cat] = wordCounts[cat] || {};
                    wordCounts[cat][val] = (wordCounts[cat][val] || 0) + 1;
                }
            }
        }

        for (let p in data.answers) {
            let total = 0;
            let ind = {};
            for (let cat in data.answers[p].words) {
                let val = data.answers[p].words[cat].toLowerCase().trim();
                let pts = 0;
                if ((data.evaluations?.[p]?.[cat] !== false) && val && val[0].toUpperCase() === letter) {
                    pts = (wordCounts[cat][val] > 1) ? 5 : 10;
                }
                ind[cat] = pts; total += pts;
            }
            roundScores[p] = { total, individual: ind };
        }
        db.ref("rooms/" + room).update({ status: "results", lastRoundPoints: roundScores });
    });
}

function showFinalRanking() {
    db.ref("rooms/" + room + "/lastRoundPoints").once("value", snap => {
        let pts = snap.val() || {};
        
        let html = "<h3>Ranking de la Ronda</h3>";
        html += Object.entries(pts)
            .map(([n, s]) => `<p><b>${n}:</b> ${s.total} pts</p>`)
            .join('');
            
        document.getElementById("finalResults").innerHTML = html;

        if (isHost) {
            document.getElementById("closeModalBtn").classList.remove("hidden");
        }
    });
}

function closeResults() {
    db.ref("rooms/" + room).once("value", snap => {
        const data = snap.val();
        
        const roundInfo = {
            letter: data.letter,
            details: data.answers,
            evaluations: data.evaluations || {},
            pointsWon: data.lastRoundPoints
        };

        db.ref(`rooms/${room}/history`).push(roundInfo);

        for (let p in data.lastRoundPoints) {
            let pnts = data.lastRoundPoints[p].total;
            db.ref(`rooms/${room}/totals/${p}`).transaction(curr => (curr || 0) + pnts);
        }

        db.ref("rooms/" + room).update({ 
            status: "waiting_next", 
            stop: false,
            answers: null,
            evaluations: null 
        });
    });
}

function resetUIForNextRound() {
    document.getElementById("resultModal").classList.add("hidden");
    if (isHost) document.getElementById("postGameActions").classList.remove("hidden");
}

function updateScoreBoard() {
    db.ref("rooms/" + room).on("value", snap => {
        const data = snap.val();
        if (!data) return;

        const totals = data.totals || {};
        const history = data.history || {}; 
        const container = document.getElementById("totalPointsList");
        container.innerHTML = "";

        Object.entries(totals).sort((a, b) => b[1] - a[1]).forEach(([pName, score]) => {
            const card = document.createElement("div");
            card.className = "player-score-card";
            card.innerHTML = `
                <div class="score-header" onclick="toggleDetails(this)">
                    <span>👤 ${pName}</span>
                    <span>${score} pts <small>▼</small></span>
                </div>
                <div class="score-details hidden">
                    ${generateHistoryHTML(pName, history)}
                </div>
            `;
            container.appendChild(card);
        });
    });
}

function toggleDetails(element) {
    const details = element.nextElementSibling;
    details.classList.toggle("hidden");
}

function generateHistoryHTML(playerName, history) {
    const rounds = Object.values(history);
    if (rounds.length === 0) return "<p style='padding:10px; font-size:12px; color: #aaa;'>No hay rondas registradas aún.</p>";

    return rounds.map((round, idx) => {
        const roundData = round.pointsWon ? round.pointsWon[playerName] : null;
        let totalRound = roundData ? (roundData.total || 0) : 0;
        let itemsHtml = "";
        const playerAnswers = round.details[playerName]?.words || {};

        for (let cat in playerAnswers) {
            const word = playerAnswers[cat] || "---";
            const score = (roundData && roundData.individual) ? (roundData.individual[cat] || 0) : 0;
            const isValid = score > 0;

            itemsHtml += `
            <li style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px; border-bottom: 1px solid #333;">
                <span><b>${cat}:</b> ${word}</span>
                <span style="color: ${isValid ? '#00ffcc' : '#ff4444'}">${score} pts</span>
            </li>`;
        }

        return `
        <div style="margin-top: 10px; border-left: 3px solid #00ffcc; padding-left: 10px;">
            <p style="font-size: 14px; margin-bottom: 5px;">Ronda ${idx + 1} (Letra ${round.letter}) - <b>${totalRound} pts</b></p>
            <ul style="list-style: none; padding: 0;">${itemsHtml}</ul>
        </div>`;
    }).join('');
}

// --- UTILIDADES ---
function showAlert(msg) {
    document.getElementById("alertMessage").innerText = msg;
    document.getElementById("customAlert").classList.remove("hidden");
}
function closeAlert() { document.getElementById("customAlert").classList.add("hidden"); }
function restartGame() { startGame(); }
function leaveRoom() { document.getElementById("confirmModal").classList.remove("hidden"); }
function closeConfirmModal() { document.getElementById("confirmModal").classList.add("hidden"); }
function executeLeave() { location.reload(); }

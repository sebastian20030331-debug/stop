// CONFIGURACIÓN FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyBMBZoGsex5H2QDxPNrjpPWabHrNHuW1tg",
    authDomain: "stop-multiplayer-73a11.firebaseapp.com",
    projectId: "stop-multiplayer-73a11",
    storageBucket: "stop-multiplayer-73a11.firebasestorage.app",
    messagingSenderId: "214107973500",
    appId: "1:214107973500:web:230316d4f6a553529c26f9"
};

// Inicialización segura
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let room = "";
let player = "";
let isHost = false;
let timerInterval;
let roundFinished = false;
const letters = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

// --- SALAS ---
function createRoom() {
    player = document.getElementById("playerName").value.trim();
    if (!player) return alert("Escribe tu nombre");

    room = Math.random().toString(36).substring(2, 7).toUpperCase();

    // Si el error es Firebase, esto soltará un error
    try {
        db.ref("rooms/" + room).set({
            host: player,
            status: "lobby",
            stop: false
        }).then(() => {
            db.ref("rooms/" + room + "/players/" + player).set(true);
            enterLobby();
        }).catch(err => {
            alert("ERROR DE FIREBASE: " + err.message);
        });
    } catch (e) {
        alert("ERROR CRÍTICO: " + e.message);
    }
}

function joinRoom() {
    player = document.getElementById("playerName").value.trim();
    room = document.getElementById("roomCode").value.toUpperCase().trim();
    if (!player || !room) return alert("Completa nombre y código");

    db.ref("rooms/" + room).once("value", snap => {
        if (!snap.exists()) return alert("La sala no existe");
        db.ref("rooms/" + room + "/players/" + player).set(true);
        enterLobby();
    });
}

function enterLobby() {
    document.getElementById("login").classList.add("hidden");
    document.getElementById("lobby").classList.remove("hidden");
    document.getElementById("roomDisplay").innerText = room;

    listenPlayers();
    listenGameStatus();
    updateScoreBoard();

    db.ref("rooms/" + room + "/host").once("value", snap => {
        isHost = (player === snap.val());
        document.getElementById("startBtn").classList.toggle("hidden", !isHost);
    });
}

function listenPlayers() {
    db.ref("rooms/" + room + "/players").on("value", snap => {
        let players = snap.val();
        let html = "<h3>👥 Jugadores</h3>";
        for (let p in players) html += `<p>${p}</p>`;
        document.getElementById("players").innerHTML = html;
    });
}

// --- FLUJO DE JUEGO ---
function listenGameStatus() {
    db.ref("rooms/" + room + "/status").on("value", snap => {
        const status = snap.val();
        if (!status) return;

        if (status === "playing") {
            startRound();
            document.getElementById("postGameActions").classList.add("hidden");
            document.getElementById("stopBtnAction").classList.remove("hidden");
        }
        else if (status === "review") {
            showLiveReview();
        }
        else if (status === "results") {
            showFinalRanking();
        }
        else if (status === "waiting_next") {
            document.getElementById("resultModal").classList.add("hidden");
            document.getElementById("game").classList.remove("hidden");
            document.getElementById("lobby").classList.add("hidden");
            document.getElementById("stopBtnAction").classList.add("hidden");
            document.getElementById("stopOverlay").classList.add("hidden");
            if (isHost) document.getElementById("postGameActions").classList.remove("hidden");
        }
    });
}

function startGame() {
    if (!isHost) return;
    let letter = letters[Math.floor(Math.random() * letters.length)];
    db.ref("rooms/" + room).update({
        status: "playing",
        letter: letter,
        stop: false,
        stopper: "",
        answers: null,
        evaluations: null,
        lastRoundPoints: null
    });
}

function restartGame() {
    startGame();
}

// --- MECÁNICAS ---
function startRound() {
    roundFinished = false;
    clearInterval(timerInterval);
    document.getElementById("resultModal").classList.add("hidden");
    document.getElementById("stopOverlay").classList.add("hidden");
    document.getElementById("lobby").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");

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
    roundFinished = true;
    clearInterval(timerInterval);
    document.querySelectorAll("#game input").forEach(i => i.disabled = true);

    document.getElementById("stopOverlay").classList.remove("hidden");
    document.getElementById("whoStopped").innerText = "¡Tú detuviste el juego!";

    db.ref("rooms/" + room).update({
        stop: true,
        stopper: player
    });
}

function listenStop() {
    db.ref("rooms/" + room + "/stop").on("value", snap => {
        if (snap.val() === true) {
            roundFinished = true;
            clearInterval(timerInterval);
            document.querySelectorAll("#game input").forEach(i => i.disabled = true);
            document.getElementById("stopOverlay").classList.remove("hidden");

            db.ref("rooms/" + room + "/stopper").once("value", sSnap => {
                const quienFue = sSnap.val();
                if (quienFue && quienFue !== player) {
                    document.getElementById("whoStopped").innerText = `¡${quienFue} dijo STOP!`;
                }
            });

            submitAnswers();

            if (isHost) {
                setTimeout(() => {
                    db.ref("rooms/" + room).update({ status: "review" });
                }, 1500);
            }
        }
    });
}

function submitAnswers() {
    const cats = {
        nombre: document.getElementById("catNombre").value.trim(),
        pais: document.getElementById("catPais").value.trim(),
        animal: document.getElementById("catAnimal").value.trim(),
        fruta: document.getElementById("catFruta").value.trim(),
        color: document.getElementById("catColor").value.trim()
    };
    db.ref("rooms/" + room + "/answers/" + player).set({ player, words: cats });
}

// --- REVISIÓN Y PUNTOS ---
function showLiveReview() {
    document.getElementById("resultModal").classList.remove("hidden");
    document.getElementById("stopOverlay").classList.add("hidden");
    document.getElementById("modalTitle").innerText = "Revisión";
    document.getElementById("waitMsg").classList.toggle("hidden", isHost);
    document.getElementById("closeModalBtn").classList.add("hidden");

    db.ref("rooms/" + room).on("value", snap => {
        const data = snap.val();
        if (!data || data.status !== "review") return;

        let html = '<div class="review-container">';
        for (let p in data.answers) {
            html += `<div class="player-review-block"><h4>👤 ${p}</h4>`;
            for (let cat in data.answers[p].words) {
                let word = data.answers[p].words[cat] || "---";
                let isValid = (data.evaluations?.[p]?.[cat] !== false);
                html += `<div class="word-row">
                    <span class="${isValid ? 'valid' : 'invalid'}"><b>${cat}:</b> ${word}</span>`;
                if (isHost) html += `<button onclick="toggleWord('${p}', '${cat}', ${!isValid})">+/-</button>`;
                html += `</div>`;
            }
            html += `</div>`;
        }
        if (isHost) html += `<button class="finish-btn" onclick="calculateFinalPoints()">Finalizar Calificación</button>`;
        document.getElementById("finalResults").innerHTML = html;
    });
}

function toggleWord(target, cat, state) {
    db.ref(`rooms/${room}/evaluations/${target}/${cat}`).set(state);
}

function calculateFinalPoints() {
    db.ref("rooms/" + room).once("value", snap => {
        const data = snap.val();
        const letter = data.letter.toUpperCase();
        let wordCounts = {};
        let roundScores = {};

        for (let p in data.answers) {
            for (let cat in data.answers[p].words) {
                let val = data.answers[p].words[cat].toLowerCase().trim();
                let approved = (data.evaluations?.[p]?.[cat] !== false);
                if (approved && val && val[0].toUpperCase() === letter) {
                    wordCounts[cat] = wordCounts[cat] || {};
                    wordCounts[cat][val] = (wordCounts[cat][val] || 0) + 1;
                } else { data.answers[p].words[cat] = ""; }
            }
        }

        for (let p in data.answers) {
            let pts = 0;
            for (let cat in data.answers[p].words) {
                let val = data.answers[p].words[cat].toLowerCase();
                if (val) pts += (wordCounts[cat][val] > 1) ? 5 : 10;
            }
            roundScores[p] = pts;
        }
        db.ref("rooms/" + room).update({ status: "results", lastRoundPoints: roundScores });
    });
}

function showFinalRanking() {
    db.ref("rooms/" + room + "/lastRoundPoints").once("value", snap => {
        let pts = snap.val() || {};
        let html = "";
        Object.entries(pts).sort((a, b) => b[1] - a[1]).forEach(([n, s]) => {
            html += `<p><b>${n}:</b> ${s} pts</p>`;
        });

        document.getElementById("finalResults").innerHTML = html;
        document.getElementById("modalTitle").innerText = "Resultados Ronda";

        // --- AJUSTE AQUÍ ---
        // Mostramos el botón azul solo al llegar a esta pantalla
        if (isHost) {
            document.getElementById("closeModalBtn").classList.remove("hidden");
        }
    });
}

function closeResults() {
    if (!isHost) return;
    db.ref("rooms/" + room + "/lastRoundPoints").once("value", snap => {
        let pts = snap.val();
        if (pts) {
            for (let p in pts) {
                db.ref("rooms/" + room + "/totals/" + p).transaction(c => (c || 0) + pts[p]);
            }
        }
        db.ref("rooms/" + room).update({
            status: "waiting_next",
            stop: false,
            answers: null,
            evaluations: null,
            lastRoundPoints: null
        });
    });
}

function updateScoreBoard() {
    db.ref("rooms/" + room + "/totals").on("value", snap => {
        let html = "";
        let totals = snap.val() || {};
        Object.entries(totals).sort((a, b) => b[1] - a[1]).forEach(([n, p]) => {
            html += `<div class="player-score"><b>${n}:</b> ${p} pts</div>`;
        });
        document.getElementById("totalPointsList").innerHTML = html;
    });
}

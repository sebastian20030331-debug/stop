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
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// --- SALAS ---
function createRoom() {
    player = document.getElementById("playerName").value.trim();
    if (!player) return alert("Escribe tu nombre");

    room = Math.random().toString(36).substring(2, 7).toUpperCase();

    try {
        db.ref("rooms/" + room).set({
            host: player,
            status: "lobby",
            stop: false,
            usedLetters: [] // Inicializamos la lista de letras usadas
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

    const roomRef = db.ref("rooms/" + room);

    roomRef.once('value').then((snapshot) => {
        const data = snapshot.val();
        let usedLetters = data.usedLetters || [];

        // Filtramos: letras que NO estén en la lista de usadas
        let availableLetters = alphabet.filter(l => !usedLetters.includes(l));

        // Si se acabaron las letras, reiniciamos el ciclo
        if (availableLetters.length === 0) {
            usedLetters = [];
            availableLetters = [...alphabet];
            console.log("Abecedario completado. Reiniciando...");
        }

        // Seleccionamos una letra al azar
        let letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
        usedLetters.push(letter);

        // Actualizamos Firebase
        roomRef.update({
            status: "playing",
            letter: letter,
            usedLetters: usedLetters,
            stop: false,
            stopper: "",
            answers: null,
            evaluations: null,
            lastRoundPoints: null
        });
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
        if (t <= 0 && !roundFinished) {
            stopRound();
        }
    }, 1000);
}

function stopRound() {
    if (roundFinished) return;
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
                }, 2000);
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

                // Estructura limpia para Flexbox:
                html += `
                <div class="word-row">
                    <span class="${isValid ? 'valid' : 'invalid'}">
                        <b>${cat}:</b> ${word}
                    </span>
                    ${isHost ? `<button onclick="toggleWord('${p}', '${cat}', ${!isValid})">+/-</button>` : ''}
                </div>`;
            }
            html += `</div>`;
        }

        if (isHost) {
            html += `<button class="finish-btn" onclick="calculateFinalPoints()">Finalizar Calificación</button>`;
        }
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

        // 1. Contar palabras válidas para detectar repetidas
        for (let p in data.answers) {
            for (let cat in data.answers[p].words) {
                let val = data.answers[p].words[cat].toLowerCase().trim();
                let approved = (data.evaluations?.[p]?.[cat] !== false);

                if (approved && val && val[0].toUpperCase() === letter) {
                    wordCounts[cat] = wordCounts[cat] || {};
                    wordCounts[cat][val] = (wordCounts[cat][val] || 0) + 1;
                }
            }
        }

        // 2. Asignar puntajes individuales y totales
        for (let p in data.answers) {
            let ptsTotal = 0;
            let individualScores = {}; // Nuevo: para guardar el puntaje de cada palabra

            for (let cat in data.answers[p].words) {
                let val = data.answers[p].words[cat].toLowerCase().trim();
                let approved = (data.evaluations?.[p]?.[cat] !== false);
                let wordPoints = 0;

                if (approved && val && val[0].toUpperCase() === letter) {
                    wordPoints = (wordCounts[cat][val] > 1) ? 5 : 10;
                }

                individualScores[cat] = wordPoints; // Guardamos el puntaje de la categoría
                ptsTotal += wordPoints;
            }

            // Guardamos ambos datos para el historial detallado
            roundScores[p] = {
                total: ptsTotal,
                individual: individualScores
            };
        }

        // 3. Actualizar Firebase
        db.ref("rooms/" + room).update({
            status: "results",
            lastRoundPoints: roundScores
        });
    });
}

function showFinalRanking() {
    db.ref("rooms/" + room + "/lastRoundPoints").once("value", snap => {
        let pts = snap.val() || {};
        let html = "";
        
        // CORRECCIÓN: Ordenar y extraer el valor numérico .total
        Object.entries(pts).sort((a, b) => {
            const valA = (typeof a[1] === 'object') ? (a[1].total || 0) : a[1];
            const valB = (typeof b[1] === 'object') ? (b[1].total || 0) : b[1];
            return valB - valA;
        }).forEach(([n, s]) => {
            // Extraemos solo el número para mostrar en el modal
            const finalPts = (typeof s === 'object') ? (s.total || 0) : s;
            html += `<p style="color: white; margin: 10px 0;"><b>${n}:</b> ${finalPts} pts</p>`;
        });

        document.getElementById("finalResults").innerHTML = html;
        document.getElementById("modalTitle").innerText = "Resultados Ronda";

        if (isHost) {
            document.getElementById("closeModalBtn").classList.remove("hidden");
        }
    });
}

function closeResults() {
    if (!isHost) return;
    db.ref("rooms/" + room).once("value", snap => {
        const data = snap.val();
        const roundData = data.lastRoundPoints; // Esto es { total: X, individual: {...} }
        
        if (roundData) {
            // 1. Guardamos el objeto completo en el historial para el desglose
            db.ref(`rooms/${room}/history`).push({
                letter: data.letter,
                details: data.answers,
                evaluations: data.evaluations || {},
                pointsWon: roundData
            });

            // 2. CORRECCIÓN CLAVE: Sumar solo el valor numérico al total acumulado
            for (let p in roundData) {
                // Extraemos el número .total. Si por error es un número viejo, lo usamos directo.
                const puntosDeEstaRonda = (typeof roundData[p] === 'object') ? (roundData[p].total || 0) : roundData[p];
                
                db.ref("rooms/" + room + "/totals/" + p).transaction(current => (current || 0) + puntosDeEstaRonda);
            }
        }
        
        // 3. Limpiar estado de la sala
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
    db.ref("rooms/" + room).on("value", snap => {
        const data = snap.val();
        if (!data) return;

        const totals = data.totals || {};
        const history = data.history || {};
        const container = document.getElementById("totalPointsList");
        container.innerHTML = "";

        // Ordenar y mostrar
        Object.entries(totals).sort((a, b) => {
            const scoreA = (typeof a[1] === 'object') ? (a[1].total || 0) : a[1];
            const scoreB = (typeof b[1] === 'object') ? (b[1].total || 0) : b[1];
            return scoreB - scoreA;
        }).forEach(([pName, totalData]) => {
            
            // CORRECCIÓN: Si totalData es el objeto erróneo, extraemos el número
            const finalScore = (typeof totalData === 'object') ? (totalData.total || 0) : totalData;

            const card = document.createElement("div");
            card.className = "player-score-card";
            card.innerHTML = `
                <div class="score-header" onclick="toggleDetails(this)">
                    <span>👤 ${pName}</span>
                    <span>${finalScore} pts <small>▼</small></span>
                </div>
                <div class="score-details hidden">
                    ${generateHistoryHTML(pName, history)}
                </div>
            `;
            container.appendChild(card);
        });
    });
}

// --- SALIR DE LA SALA ---
function leaveRoom() {
    document.getElementById("confirmModal").classList.remove("hidden");
}

function closeConfirmModal() {
    document.getElementById("confirmModal").classList.add("hidden");
}

function executeLeave() {
    if (!room || !player) return;

    db.ref(`rooms/${room}/players/${player}`).remove().then(() => {
        db.ref(`rooms/${room}/players`).off();
        db.ref(`rooms/${room}/status`).off();
        db.ref(`rooms/${room}/stop`).off();

        room = "";
        document.getElementById("confirmModal").classList.add("hidden");
        document.getElementById("lobby").classList.add("hidden");
        document.getElementById("game").classList.add("hidden");
        document.getElementById("login").classList.remove("hidden");
        document.getElementById("roomCode").value = "";
    });
}

function generateHistoryHTML(playerName, history) {
    const rounds = Object.values(history);
    if (rounds.length === 0) return "<p style='padding:10px; font-size:12px;'>No hay rondas registradas.</p>";

    return rounds.map((round, idx) => {
        // Obtenemos los datos de puntos del jugador en esta ronda
        const roundData = round.pointsWon ? round.pointsWon[playerName] : null;
        
        // CORRECCIÓN: Extraer el total numérico con seguridad
        let totalRound = 0;
        if (roundData) {
            totalRound = (typeof roundData === 'object') ? (roundData.total || 0) : roundData;
        }

        let itemsHtml = "";
        const playerAnswers = round.details[playerName]?.words || {};

        for (let cat in playerAnswers) {
            const word = playerAnswers[cat] || "---";
            const isValid = round.evaluations?.[playerName]?.[cat] !== false;
            
            // CORRECCIÓN: Extraer el puntaje individual de la categoría
            let score = 0;
            if (roundData && roundData.individual) {
                score = roundData.individual[cat] || 0;
            } else if (isValid && word !== "---") {
                // Backup por si no se guardó el individual: asumimos 10 si es válido
                score = 10; 
            }

            itemsHtml += `
            <li class="${isValid ? 'valid-row' : 'line-through'}">
                <span class="cat-name">${cat}:</span>
                <span class="word-val">${word}</span>
                <span class="word-score">${score} pts</span> 
            </li>`;
        }

        return `
        <div class="round-history-item">
            <strong style="padding-left:15px; display:block; margin-bottom:5px; color: #fff;">
                Ronda ${idx + 1} (Letra ${round.letter}): ${totalRound} pts
            </strong>
            <ul class="history-list">${itemsHtml}</ul>
        </div>`;
    }).join('');
}

function toggleDetails(element) {
    const details = element.nextElementSibling;
    details.classList.toggle("hidden");
}

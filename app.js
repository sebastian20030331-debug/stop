/**
 * CONFIGURACIÓN DE FIREBASE
 * Reemplaza estos valores con los de tu consola de Firebase si decides cambiar de proyecto.
 */
const firebaseConfig = {
    apiKey: "AIzaSyBMBZoGsex5H2QDxPNrjpPWabHrNHuW1tg",
    authDomain: "stop-multiplayer-73a11.firebaseapp.com",
    projectId: "stop-multiplayer-73a11",
    storageBucket: "stop-multiplayer-73a11.firebasestorage.app",
    messagingSenderId: "214107973500",
    appId: "1:214107973500:web:230316d4f6a553529c26f9"
};

// Inicialización de la App de Firebase y referencia a la base de datos (Realtime Database)
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/**
 * VARIABLES DE ESTADO GLOBAL
 * Mantienen la información de la sesión actual del usuario.
 */
let room = "";            // Código de la sala (ej: "X5Y9Z")
let player = "";          // Nombre elegido por el usuario
let isHost = false;       // Define si el usuario tiene permisos de administrador (creador)
let timerInterval;        // Referencia al contador de tiempo
let roundFinished = false; // Evita que se disparen múltiples finales de ronda
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * 🏠 GESTIÓN DE SALAS Y LOBBY
 */

// Crea una nueva sala, genera código aleatorio y asigna al creador como Host
function createRoom() {
    player = document.getElementById("playerName").value.trim();
    if (!player) return showAlert("⚠️ Escribe tu nombre");
    
    room = Math.random().toString(36).substring(2, 7).toUpperCase();
    isHost = true; 

    db.ref("rooms/" + room).set({
        host: player,
        status: "lobby",      // Estado inicial
        stop: false,
        usedLetters: [],
        players: { [player]: true }
    }).then(() => enterLobby());
}

// Permite a otros usuarios unirse a una sala existente mediante código
function joinRoom() {
    player = document.getElementById("playerName").value.trim();
    room = document.getElementById("roomCode").value.toUpperCase().trim();
    if (!player || !room) return showAlert("⚠️ Completa los datos");

    db.ref("rooms/" + room).once("value", snap => {
        if (!snap.exists()) return showAlert("⚠️ La sala no existe");
        // Agrega al jugador a la lista de la sala
        db.ref("rooms/" + room + "/players/" + player).set(true).then(() => enterLobby());
    });
}

// Configura la interfaz visual para el estado de espera (Lobby)
function enterLobby() {
    document.getElementById("login").classList.add("hidden");
    document.getElementById("lobby").classList.remove("hidden");
    document.getElementById("roomDisplay").innerText = room;
    listenPlayers();      // Activa escucha de quién entra
    listenGameStatus();   // Activa escucha de cambios de estado (Play/Review/etc)
    updateScoreBoard();   // Muestra los puntos acumulados
}

// Escucha en tiempo real la lista de jugadores conectados
function listenPlayers() {
    db.ref("rooms/" + room + "/players").on("value", snap => {
        const players = snap.val() || {};
        let html = "<h3>👥 Jugadores</h3>";
        for (let p in players) html += `<p>${p} ${p === player ? '<b>(Tú)</b>' : ''}</p>`;
        document.getElementById("players").innerHTML = html;
        
        // Verifica si el jugador actual es el host para mostrar/ocultar el botón "Iniciar"
        db.ref("rooms/" + room + "/host").once("value", hSnap => {
            isHost = (player === hSnap.val());
            document.getElementById("startBtn").classList.toggle("hidden", !isHost);
        });
    });
}

/**
 * 🎮 MECÁNICAS DEL JUEGO (STOP)
 */

// (Solo Host) Inicia la partida eligiendo una letra al azar no repetida
function startGame() {
    if (!isHost) return;
    db.ref("rooms/" + room).once('value', snap => {
        const data = snap.val();
        let used = data.usedLetters || [];
        let available = alphabet.filter(l => !used.includes(l));
        
        // Si ya se usaron todas las letras, reinicia el abecedario
        if (available.length === 0) { used = []; available = [...alphabet]; }
        
        let letter = available[Math.floor(Math.random() * available.length)];
        used.push(letter);

        // Cambia el estado a "playing" para todos los jugadores
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

// Orquestador: Reacciona automáticamente cuando Firebase indica un cambio de fase
function listenGameStatus() {
    db.ref("rooms/" + room + "/status").on("value", snap => {
        const status = snap.val();
        if (status === "playing") startRound();       // Pantalla de juego
        if (status === "review") showLiveReview();    // Pantalla de votación/revisión
        if (status === "results") showFinalRanking(); // Pantalla de puntos ganados
        if (status === "waiting_next") resetUIForNextRound(); // Regreso al lobby
    });
}

// Prepara la pantalla de juego, limpia inputs y arranca el cronómetro
function startRound() {
    roundFinished = false;
    clearInterval(timerInterval);
    
    // Reset visual
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

    // Carga la letra y activa la escucha del botón STOP
    db.ref("rooms/" + room + "/letter").once("value", snap => {
        document.getElementById("letter").innerText = snap.val();
        listenStop();
        startTimer(60);
    });
}

// Maneja el conteo regresivo de la ronda
function startTimer(time) {
    let t = time;
    document.getElementById("timer").innerText = t;
    timerInterval = setInterval(() => {
        t--;
        document.getElementById("timer").innerText = t;
        
        // Si el tiempo llega a cero
        if (t <= 0 && !roundFinished) {
            clearInterval(timerInterval);
            // Enviamos "reloj" como el responsable del STOP
            db.ref("rooms/" + room).update({ 
                stop: true, 
                stopper: "reloj" 
            });
        }
    }, 1000);
}
// Envía la señal a Firebase de que el jugador actual presionó STOP
function stopRound() {
    if (roundFinished) return;
    db.ref("rooms/" + room).update({ stop: true, stopper: player });
}

// Escucha si alguien (o el tiempo) detuvo la ronda
function listenStop() {
    db.ref("rooms/" + room + "/stop").on("value", snap => {
        if (snap.val() === true && !roundFinished) {
            roundFinished = true;
            clearInterval(timerInterval);
            
            document.querySelectorAll("#game input").forEach(i => i.disabled = true);
            document.getElementById("stopBtnAction").classList.add("hidden");
            document.getElementById("stopOverlay").classList.remove("hidden");
            
            // Leemos quién detuvo el juego
            db.ref("rooms/" + room + "/stopper").once("value", sSnap => {
                const quien = sSnap.val();
                const textoAlerta = document.getElementById("whoStopped");

                if (quien === "reloj") {
                    textoAlerta.innerText = "⏰ ¡El tiempo se ha agotado!";
                } else {
                    textoAlerta.innerText = `🛑 ¡${quien} dijo STOP!`;
                }
            });

            submitAnswers(); 
            if (isHost) setTimeout(() => db.ref("rooms/" + room).update({status: "review"}), 3000);
        }
    });
}

// Recopila los valores de los inputs y los guarda bajo el nombre del jugador
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

/**
 * 📝 REVISIÓN Y PUNTUACIÓN
 */

// Muestra las respuestas de todos los jugadores para que el host las valide
function showLiveReview() {
    document.getElementById("resultModal").classList.remove("hidden");
    document.getElementById("stopOverlay").classList.add("hidden");
    document.getElementById("closeModalBtn").classList.add("hidden");

    db.ref("rooms/" + room).on("value", snap => {
        const data = snap.val();
        if (!data || data.status !== "review") return;
        
        // 1. Insertamos las instrucciones dinámicamente al inicio del HTML
        let html = `
            <div id="voteInstructions" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 20px; border: 1px dashed #00ffcc;">
                <p style="margin: 0; font-size: 14px; color: #aaa;">
                    Vota ✅ si la palabra es válida o ❌ si no lo es.<br>
                    <span style="color: #00ffcc;">La mayoría decide el puntaje.</span>
                </p>
            </div>`;

        const totalPlayers = Object.keys(data.players).length;

        for (let p in data.answers) {
            html += `<div class="player-review-block"><h4>👤 ${p}</h4>`;
            for (let cat in data.answers[p].words) {
                let word = data.answers[p].words[cat] || "---";
                
                let votes = data.evaluations?.[p]?.[cat] || {};
                let positiveVotes = Object.values(votes).filter(v => v === true).length;
                let negativeVotes = Object.values(votes).filter(v => v === false).length;
                
                let isValid = positiveVotes >= negativeVotes;
                let myVote = votes[player];

                html += `<div class="word-row">
                    <span class="${isValid ? 'valid' : 'invalid'}">
                        <b>${cat}:</b> ${word} 
                        <small style="display:block; font-size:10px; opacity:0.6;">(${positiveVotes}✅ / ${negativeVotes}❌)</small>
                    </span>
                    <div class="vote-btns">
                        <button class="${myVote === true ? 'active-v' : ''}" onclick="toggleWord('${p}','${cat}', true)">✅</button>
                        <button class="${myVote === false ? 'active-x' : ''}" onclick="toggleWord('${p}','${cat}', false)">❌</button>
                    </div>
                </div>`;
            }
            html += `</div>`;
        }
        
        if (isHost) {
            html += `<button class="finish-btn" onclick="calculateFinalPoints()">Calcular Puntos Finales</button>`;
        }
        document.getElementById("finalResults").innerHTML = html;
    });
}

// Permite que CUALQUIER jugador vote. 
// Guardamos el voto bajo: rooms/CODIGO/evaluations/JUGADOR_EVALUADO/CATEGORIA/VOTANTE
function toggleWord(targetPlayer, cat, currentState) {
    // currentState nos dirá si el jugador actual quiere marcarla como válida (true) o no (false)
    db.ref(`rooms/${room}/evaluations/${targetPlayer}/${cat}/${player}`).set(currentState);
}

// (Solo Host) Aplica la lógica: 10 pts si es única, 5 pts si está repetida entre jugadores
function calculateFinalPoints() {
    db.ref("rooms/" + room).once("value", snap => {
        const data = snap.val();
        const letter = data.letter.toUpperCase();
        let wordCounts = {}; 
        let roundScores = {};

        // Función auxiliar para decidir si la palabra ganó por mayoría
        const isWordValidByVote = (targetP, category) => {
            let votes = data.evaluations?.[targetP]?.[category] || {};
            let pos = Object.values(votes).filter(v => v === true).length;
            let neg = Object.values(votes).filter(v => v === false).length;
            // Si nadie votó, la consideramos válida por defecto si tiene contenido
            if (pos === 0 && neg === 0) return true; 
            return pos >= neg;
        };

        // 1. Contar frecuencia de palabras válidas por voto
        for (let p in data.answers) {
            for (let cat in data.answers[p].words) {
                let val = data.answers[p].words[cat].toLowerCase().trim();
                if (isWordValidByVote(p, cat) && val && val[0].toUpperCase() === letter) {
                    wordCounts[cat] = wordCounts[cat] || {};
                    wordCounts[cat][val] = (wordCounts[cat][val] || 0) + 1;
                }
            }
        }

        // 2. Asignar puntajes
        for (let p in data.answers) {
            let total = 0;
            let ind = {};
            for (let cat in data.answers[p].words) {
                let val = data.answers[p].words[cat].toLowerCase().trim();
                let pts = 0;
                if (isWordValidByVote(p, cat) && val && val[0].toUpperCase() === letter) {
                    pts = (wordCounts[cat][val] > 1) ? 5 : 10;
                }
                ind[cat] = pts; total += pts;
            }
            roundScores[p] = { total, individual: ind };
        }
        db.ref("rooms/" + room).update({ status: "results", lastRoundPoints: roundScores });
    });
}

// Muestra el desglose de puntos obtenidos en la ronda actual
function showFinalRanking() {
    db.ref("rooms/" + room + "/lastRoundPoints").once("value", snap => {
        let pts = snap.val() || {};
        let html = "<h3>Ranking de la Ronda</h3>";
        html += Object.entries(pts)
            .map(([n, s]) => `<p><b>${n}:</b> ${s.total} pts</p>`)
            .join('');
            
        document.getElementById("finalResults").innerHTML = html;
        if (isHost) document.getElementById("closeModalBtn").classList.remove("hidden");
    });
}

// Cierra la ronda, suma los puntos al total acumulado y guarda en el historial
function closeResults() {
    db.ref("rooms/" + room).once("value", snap => {
        const data = snap.val();
        
        // Guardar copia de la ronda en el historial
        const roundInfo = {
            letter: data.letter,
            details: data.answers,
            evaluations: data.evaluations || {},
            pointsWon: data.lastRoundPoints
        };
        db.ref(`rooms/${room}/history`).push(roundInfo);

        // Actualizar puntajes totales de cada jugador
        for (let p in data.lastRoundPoints) {
            let pnts = data.lastRoundPoints[p].total;
            db.ref(`rooms/${room}/totals/${p}`).transaction(curr => (curr || 0) + pnts);
        }

        // Limpiar para la siguiente ronda
        db.ref("rooms/" + room).update({ 
            status: "waiting_next", 
            stop: false,
            answers: null,
            evaluations: null 
        });
    });
}

// Restablece la interfaz para volver al lobby
function resetUIForNextRound() {
    document.getElementById("resultModal").classList.add("hidden");
    if (isHost) document.getElementById("postGameActions").classList.remove("hidden");
}

/**
 * 🏆 TABLA DE PUNTUACIÓN Y DETALLES
 */

// Actualiza la lista de puntos totales y permite desplegar el historial de cada jugador
function updateScoreBoard() {
    db.ref("rooms/" + room).on("value", snap => {
        const data = snap.val();
        if (!data) return;

        const totals = data.totals || {};
        const history = data.history || {}; 
        const container = document.getElementById("totalPointsList");
        container.innerHTML = "";

        // Ordenar jugadores por puntaje de mayor a menor
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

// Expande o colapsa el historial de un jugador en la tabla
function toggleDetails(element) {
    const details = element.nextElementSibling;
    details.classList.toggle("hidden");
}

// Construye el HTML con el detalle de palabras y puntos de todas las rondas pasadas
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

/**
 * 🛠️ UTILIDADES Y MODALES
 */
function showAlert(msg) {
    document.getElementById("alertMessage").innerText = msg;
    document.getElementById("customAlert").classList.remove("hidden");
}

function closeAlert() { document.getElementById("customAlert").classList.add("hidden"); }

function restartGame() { startGame(); }

function leaveRoom() { document.getElementById("confirmModal").classList.remove("hidden"); }

function closeConfirmModal() { document.getElementById("confirmModal").classList.add("hidden"); }

function executeLeave() { location.reload(); }

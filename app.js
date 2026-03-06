// CONFIGURACIÓN FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBMBZoGsex5H2QDxPNrjpPWabHrNHuW1tg",
  authDomain: "stop-multiplayer-73a11.firebaseapp.com",
  projectId: "stop-multiplayer-73a11",
  storageBucket: "stop-multiplayer-73a11.firebasestorage.app",
  messagingSenderId: "214107973500",
  appId: "1:214107973500:web:230316d4f6a553529c26f9"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let room = "";
let player = "";
let timerInterval;

const letters = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

// GENERAR LETRA
function randomLetter(){
return letters[Math.floor(Math.random() * letters.length)];
}

// ENTRAR A SALA
function joinRoom(){

player = document.getElementById("playerName").value;
room = document.getElementById("roomCode").value;

if(!player || !room){
alert("Ingresa nombre y código de sala");
return;
}

const roomRef = db.ref("rooms/" + room);

roomRef.once("value", snap => {

if(!snap.exists()){

// PRIMER JUGADOR CREA SALA
roomRef.set({
host: player,
letter: randomLetter(),
status: "playing"
});

}

// REGISTRAR JUGADOR
db.ref("rooms/"+room+"/players/"+player).set(true);

// MOSTRAR JUEGO
document.getElementById("login").classList.add("hidden");
document.getElementById("game").classList.remove("hidden");

// ESCUCHAR EVENTOS
listenPlayers();
listenLetter();
listenStop();
listenResults();

// SOLO EL HOST INICIA TEMPORIZADOR
db.ref("rooms/"+room+"/host").once("value", snap => {

if(snap.val() === player){
startTimer(60);
}

});

});

}

// ESCUCHAR JUGADORES
function listenPlayers(){

db.ref("rooms/"+room+"/players").on("value", snap => {

let players = snap.val();

let html = "👥 Jugadores:<br>";

for(let p in players){

html += p + "<br>";

}

document.getElementById("players").innerHTML = html;

});

}

// ESCUCHAR LETRA
function listenLetter(){

db.ref("rooms/"+room+"/letter").on("value", snap => {

let letter = snap.val();

document.getElementById("letter").innerText = letter;

});

}

// TEMPORIZADOR
function startTimer(time){

let t = time;

document.getElementById("timer").innerText = t;

timerInterval = setInterval(() => {

t--;

document.getElementById("timer").innerText = t;

if(t <= 0){

clearInterval(timerInterval);
triggerStop();

}

},1000);

}

// BOTON STOP
function stopRound(){

triggerStop();

}

// STOP GLOBAL
function triggerStop(){

db.ref("rooms/"+room+"/stop").set(true);

}

// ESCUCHAR STOP
function listenStop(){

db.ref("rooms/"+room+"/stop").on("value", snap => {

if(snap.val() === true){

clearInterval(timerInterval);

submitAnswers();

}

});

}

// ENVIAR RESPUESTAS
function submitAnswers(){

const answers = {

nombre: document.getElementById("catNombre").value,
pais: document.getElementById("catPais").value,
animal: document.getElementById("catAnimal").value,
fruta: document.getElementById("catFruta").value,
color: document.getElementById("catColor").value

};

db.ref("rooms/"+room+"/answers/"+player).set(answers);

}

// ESCUCHAR RESULTADOS
function listenResults(){

db.ref("rooms/"+room+"/answers").on("value", snap => {

let data = snap.val();

if(!data) return;

let html = "<h2>🏆 Resultados</h2>";

for(let p in data){

let score = 0;

let a = data[p];

for(let k in a){

if(a[k] && a[k] !== ""){
score += 10;
}

}

html += "<p><b>"+p+"</b>: "+score+" puntos</p>";

}

document.getElementById("results").innerHTML = html;

});

}





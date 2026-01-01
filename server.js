const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = [];
let gameState = 'LOBBY'; // LOBBY, PLAYING, VOTING, RESULT
let impostorId = null;
let currentWord = "";
let votes = {};

// Palabras para el juego
const wordList = [
    "Fuegos Artificiales", "Uvas", "Champagne", "Cena Navideña", 
    "Suegra", "Regalos", "Aguinaldo", "Hallaca", "Pan de Jamón",
    "Lentejas", "Maletas", "Propósitos", "Resaca", "Karaoke"
];

io.on('connection', (socket) => {
    console.log('Nuevo jugador conectado:', socket.id);

    socket.on('join', (username) => {
        if (gameState !== 'LOBBY') {
            socket.emit('error', 'Partida en curso, espera a que termine.');
            return;
        }
        const player = { id: socket.id, username, avatar: '😎', role: 'civilian', alive: true };
        players.push(player);
        io.emit('updatePlayers', players);
    });

    socket.on('startGame', () => {
        if (players.length < 3) return; // Mínimo 3
        
        // Reset
        gameState = 'PLAYING';
        votes = {};
        currentWord = wordList[Math.floor(Math.random() * wordList.length)];
        
        // Asignar Impostor
        const impostorIndex = Math.floor(Math.random() * players.length);
        impostorId = players[impostorIndex].id;

        players.forEach((p, index) => {
            p.role = (index === impostorIndex) ? 'impostor' : 'civilian';
            p.alive = true;
        });

        // Enviar roles
        io.to(impostorId).emit('gameStarted', { role: 'impostor', word: '???' });
        players.forEach(p => {
            if (p.id !== impostorId) {
                io.to(p.id).emit('gameStarted', { role: 'civilian', word: currentWord });
            }
        });
        
        io.emit('stateChange', 'PLAYING');
    });

    socket.on('startVoting', () => {
        gameState = 'VOTING';
        io.emit('stateChange', 'VOTING');
    });

    socket.on('vote', (targetId) => {
        if (gameState !== 'VOTING') return;
        votes[socket.id] = targetId;

        // Comprobar si todos votaron
        if (Object.keys(votes).length === players.length) {
            calculateWinner();
        }
    });

    socket.on('restart', () => {
        gameState = 'LOBBY';
        players = []; // Opcional: limpiar jugadores o mantenerlos
        io.emit('resetGame');
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('updatePlayers', players);
    });
});

function calculateWinner() {
    const voteCounts = {};
    let maxVotes = 0;
    let eliminatedId = null;

    Object.values(votes).forEach(id => {
        voteCounts[id] = (voteCounts[id] || 0) + 1;
        if (voteCounts[id] > maxVotes) {
            maxVotes = voteCounts[id];
            eliminatedId = id;
        }
    });

    // Lógica simple: El más votado pierde.
    // Si el eliminado es el impostor, ganan los civiles.
    // Si quedan 2 personas y el impostor sigue vivo, gana el impostor.
    
    const impostorName = players.find(p => p.id === impostorId)?.username || "Nadie";
    const eliminatedName = players.find(p => p.id === eliminatedId)?.username || "Nadie";
    
    let resultMessage = "";
    let winner = "";

    if (eliminatedId === impostorId) {
        winner = "CIVILES";
        resultMessage = `¡Atraparon al impostor! Era ${impostorName}.`;
    } else {
        winner = "IMPOSTOR";
        resultMessage = `¡Se equivocaron! Eliminaron a ${eliminatedName}. El impostor era ${impostorName}.`;
    }

    io.emit('gameOver', { winner, message: resultMessage });
    gameState = 'RESULT';
}

server.listen(3000, () => {
    console.log('Server corriendo en puerto 3000');
});
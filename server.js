const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = [];
let gameState = 'LOBBY'; 
let impostorId = null;
let currentWord = "";
let votes = {};

// 🇻🇪 LISTA NAVIDEÑA VENEZOLANA MEJORADA
const wordList = [
    "Hallaca", "Pan de Jamón", "Ensalada de Gallina", "Pernil", 
    "Ponche Crema", "Gaitas", "El Cañonazo", "Las 12 Uvas", 
    "Maletas afuera", "Billete en el zapato", "Lentejas", 
    "Torta Negra", "Amigo Secreto", "Estrenos", "Viejo Año",
    "Fuegos Artificiales", "La Billo's", "Intercambio de Regalos",
    "Uvas del Tiempo", "Brindis", "Tío borracho"
];

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    socket.on('join', (username) => {
        // 1. Validación de estado
        if (gameState !== 'LOBBY') {
            socket.emit('error', 'Partida en curso. Espera que terminen.');
            return;
        }

        // 2. Validación de nombre duplicado
        const nameExists = players.some(p => p.username.toLowerCase() === username.toLowerCase());
        if (nameExists) {
            socket.emit('error', '¡Ese nombre ya está en uso! Ponte otro.');
            return;
        }

        const player = { id: socket.id, username, role: 'civilian' };
        players.push(player);
        
        // Confirmamos al usuario que entró exitosamente
        socket.emit('joinedSuccess', player); 
        io.emit('updatePlayers', players);
    });

    socket.on('startGame', () => {
        if (players.length < 3) return; 
        
        gameState = 'PLAYING';
        votes = {};
        currentWord = wordList[Math.floor(Math.random() * wordList.length)];
        
        // Asignar Impostor
        const impostorIndex = Math.floor(Math.random() * players.length);
        impostorId = players[impostorIndex].id;

        players.forEach((p, index) => {
            p.role = (index === impostorIndex) ? 'impostor' : 'civilian';
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

        // Verificar si todos (menos los desconectados) votaron
        const activePlayers = players.length;
        if (Object.keys(votes).length >= activePlayers) {
            calculateWinner();
        }
    });

    // 3. LOGICA DE REINICIO CORREGIDA
    socket.on('restartGame', () => {
        gameState = 'LOBBY';
        votes = {};
        impostorId = null;
        currentWord = "";
        // Mantenemos a los jugadores conectados, solo limpiamos roles
        players.forEach(p => p.role = 'civilian');
        
        io.emit('resetToLobby'); // Evento global para mover pantallas
        io.emit('updatePlayers', players);
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('updatePlayers', players);
        
        // Si se vacía la sala, resetear server por seguridad
        if (players.length === 0) {
            gameState = 'LOBBY';
            votes = {};
        }
    });
});

function calculateWinner() {
    const voteCounts = {};
    let maxVotes = 0;
    let eliminatedId = null;

    // Contar votos
    Object.values(votes).forEach(id => {
        voteCounts[id] = (voteCounts[id] || 0) + 1;
    });

    // Determinar eliminado (mayoría simple)
    // En caso de empate, eliminamos al primero que alcanzó el máximo (simple)
    for (const [id, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
            eliminatedId = id;
        }
    }

    const impostorObj = players.find(p => p.id === impostorId);
    const eliminatedObj = players.find(p => p.id === eliminatedId);
    
    const impostorName = impostorObj ? impostorObj.username : "Desconectado";
    const eliminatedName = eliminatedObj ? eliminatedObj.username : "Nadie";
    
    let winner = "";
    let message = "";

    if (eliminatedId === impostorId) {
        winner = "CIVILES";
        message = `¡Buena esa! Atrapadon a ${impostorName}.`;
    } else {
        winner = "IMPOSTOR";
        message = `¡Se pelaron! Sacaron a ${eliminatedName}. El impostor era ${impostorName}.`;
    }

    io.emit('gameOver', { winner, message });
    gameState = 'RESULT';
}

server.listen(3000, () => {
    console.log('Server listo en puerto 3000');
});
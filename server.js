const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public')); // Статические файлы (HTML, CSS, JS) в папке public

// Хранение комнат и игроков
const rooms = new Map();

wss.on('connection', (ws) => {
    console.log('Новый клиент подключился');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'joinRoom':
                handleJoinRoom(ws, data);
                break;
            case 'startGame':
                handleStartGame(ws, data);
                break;
            case 'submitGuess':
                handleSubmitGuess(ws, data);
                break;
            default:
                console.log('Неизвестный тип сообщения:', data.type);
        }
    });

    ws.on('close', () => {
        console.log('Клиент отключился');
        // Удаление клиента из комнаты
        for (let [roomId, room] of rooms) {
            if (room.players.has(ws)) {
                room.players.delete(ws);
                if (room.players.size === 0) {
                    rooms.delete(roomId);
                } else {
                    broadcastToRoom(roomId, { type: 'playerLeft' });
                }
                break;
            }
        }
    });
});

function handleJoinRoom(ws, data) {
    let room = rooms.get(data.roomId);
    if (!room) {
        room = { players: new Set(), panorama: null, guesses: new Map() };
        rooms.set(data.roomId, room);
    }

    room.players.add(ws);
    ws.roomId = data.roomId;
    ws.playerId = `player${room.players.size}`;

    ws.send(JSON.stringify({
        type: 'roomJoined',
        playerId: ws.playerId,
        totalPlayers: room.players.size
    }));

    if (room.players.size === 2) {
        broadcastToRoom(data.roomId, { type: 'gameReady' });
    }
}

function handleStartGame(ws, data) {
    const room = rooms.get(ws.roomId);
    if (room && !room.panorama) {
        // Генерация случайной панорамы (здесь упрощено, как в предыдущем примере)
        const locations = [
            { lat: 51.505, lng: -0.09 }, // Лондон
            { lat: 48.8566, lng: 2.3522 }, // Париж
            { lat: 35.6762, lng: 139.6503 } // Токио
        ];
        room.panorama = locations[Math.floor(Math.random() * locations.length)];
        broadcastToRoom(ws.roomId, {
            type: 'panoramaSet',
            panorama: room.panorama
        });
    }
}

function handleSubmitGuess(ws, data) {
    const room = rooms.get(ws.roomId);
    if (room) {
        room.guesses.set(ws.playerId, data.guess);
        if (room.guesses.size === room.players.size) {
            // Оба игрока сделали выбор, отправляем результаты
            const results = {};
            room.guesses.forEach((guess, playerId) => {
                const distance = calculateDistance(guess.lat, guess.lng, room.panorama.lat, room.panorama.lng);
                results[playerId] = distance;
            });
            broadcastToRoom(ws.roomId, {
                type: 'results',
                results: results
            });
            room.guesses.clear(); // Сброс догадок для новой игры
        }
    }
}

function broadcastToRoom(roomId, message) {
    const room = rooms.get(roomId);
    if (room) {
        room.players.forEach(player => {
            if (player.readyState === WebSocket.OPEN) {
                player.send(JSON.stringify(message));
            }
        });
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Радиус Земли в км
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});ы
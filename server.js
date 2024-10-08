const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3050;

// In-memory storage for active rooms
const activeRooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create a new room
app.post('/api/create-room', (req, res) => {
    const roomId = uuidv4();
    activeRooms.set(roomId, { users: new Set(), code: '' });
    res.json({ roomId });
});

// Check if a room exists
app.get('/api/room-exists/:roomId', (req, res) => {
    const { roomId } = req.params;
    res.json({ exists: activeRooms.has(roomId) });
});

// Serve room.html
app.get('/room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join room', ({ roomId, username }) => {
        if (!activeRooms.has(roomId)) {
            socket.emit('room error', 'Room does not exist');
            return;
        }

        socket.join(roomId);
        activeRooms.get(roomId).users.add(username);
        socket.emit('initial code', activeRooms.get(roomId).code);
        console.log(`${username} joined room ${roomId}`);
    });

    socket.on('code change', ({ roomId, code }) => {
        if (activeRooms.has(roomId)) {
            activeRooms.get(roomId).code = code;
            socket.to(roomId).emit('code update', code);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        activeRooms.forEach((room, roomId) => {
            if (room.users.has(socket.username)) {
                room.users.delete(socket.username);
                if (room.users.size === 0) {
                    activeRooms.delete(roomId);
                }
            }
        });
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
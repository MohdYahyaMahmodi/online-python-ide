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
    activeRooms.set(roomId, { users: new Map(), code: '' });
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
        socket.username = username;
        socket.roomId = roomId;

        const room = activeRooms.get(roomId);
        room.users.set(socket.id, { username, typing: false });

        socket.emit('initial code', room.code);
        io.to(roomId).emit('user list', Array.from(room.users.values()));
        console.log(`${username} joined room ${roomId}`);
    });

    socket.on('code change', ({ roomId, delta }) => {
        if (activeRooms.has(roomId)) {
            const room = activeRooms.get(roomId);
            room.code = applyDelta(room.code, delta);
            socket.to(roomId).emit('code update', { delta, userId: socket.id });
        }
    });

    socket.on('typing', ({ roomId, isTyping }) => {
        if (activeRooms.has(roomId)) {
            const room = activeRooms.get(roomId);
            const user = room.users.get(socket.id);
            if (user) {
                user.typing = isTyping;
                io.to(roomId).emit('user typing', { userId: socket.id, isTyping });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        if (socket.roomId && activeRooms.has(socket.roomId)) {
            const room = activeRooms.get(socket.roomId);
            room.users.delete(socket.id);
            io.to(socket.roomId).emit('user list', Array.from(room.users.values()));
            if (room.users.size === 0) {
                activeRooms.delete(socket.roomId);
            }
        }
    });
});

function applyDelta(code, delta) {
    const lines = code.split('\n');
    const { start, end, action, lines: newLines } = delta;

    if (action === 'insert') {
        lines.splice(start.row, 0, ...newLines);
    } else if (action === 'remove') {
        lines.splice(start.row, end.row - start.row + 1);
    } else if (action === 'replace') {
        lines.splice(start.row, end.row - start.row + 1, ...newLines);
    }

    return lines.join('\n');
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
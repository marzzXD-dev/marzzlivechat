const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('public'));

// Store connected users
const users = new Map();
const messageHistory = [];

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // User authentication
    socket.on('authenticate', (userData) => {
        const user = {
            id: socket.id,
            ...userData,
            socketId: socket.id,
            joinedAt: new Date().toISOString()
        };
        
        users.set(socket.id, user);
        
        // Send welcome message
        socket.emit('system:message', `Welcome to marzzXD-LiveChat, ${user.name}!`);
        
        // Send current members list
        socket.emit('members:list', Array.from(users.values()));
        
        // Broadcast new user joined
        socket.broadcast.emit('members:update', user);
        socket.broadcast.emit('system:message', `${user.name} joined the chat!`);
        
        // Send message history
        socket.emit('message:history', messageHistory.slice(-50));
    });
    
    // Handle messages
    socket.on('message:send', (message) => {
        message.id = Date.now();
        messageHistory.push(message);
        
        // Broadcast to all clients
        io.emit('message:receive', message);
    });
    
    // Handle typing indicators
    socket.on('typing:start', (user) => {
        socket.broadcast.emit('typing:start', user);
    });
    
    socket.on('typing:stop', () => {
        socket.broadcast.emit('typing:stop', socket.id);
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            users.delete(socket.id);
            io.emit('members:remove', socket.id);
            io.emit('system:message', `${user.name} left the chat`);
        }
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
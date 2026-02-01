const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// ========== RAILWAY FIX ==========
// PORT harus dari environment variable
const PORT = process.env.PORT || 8080;

// CORS untuk Railway
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

app.use(express.json());

// Root endpoint untuk Railway health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'RGB Chat Server',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString() 
    });
});

// ========== SOCKET.IO ==========
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Store users
const users = new Map();
const messages = [];

io.on('connection', (socket) => {
    console.log('🔗 New connection:', socket.id);
    
    // User join
    socket.on('user:join', (userData) => {
        const user = {
            id: socket.id,
            ...userData,
            socketId: socket.id,
            joinedAt: new Date().toISOString(),
            online: true
        };
        
        users.set(socket.id, user);
        
        // Send current users to new user
        socket.emit('users:list', Array.from(users.values()));
        
        // Broadcast to others
        socket.broadcast.emit('user:joined', user);
        
        // Welcome message
        socket.emit('system:message', {
            text: `Welcome ${user.name}!`,
            type: 'welcome'
        });
        
        // Notify others
        socket.broadcast.emit('system:message', {
            text: `${user.name} joined the chat`,
            type: 'info'
        });
        
        // Send message history
        socket.emit('messages:history', messages.slice(-50));
    });
    
    // Handle messages
    socket.on('message:send', (messageData) => {
        const user = users.get(socket.id);
        if (!user) return;
        
        const message = {
            id: Date.now(),
            userId: socket.id,
            sender: user.name,
            avatar: user.avatar,
            text: messageData.text,
            timestamp: new Date().toISOString()
        };
        
        messages.push(message);
        if (messages.length > 1000) messages.shift();
        
        // Broadcast to all
        io.emit('message:receive', message);
    });
    
    // Typing indicators
    socket.on('typing:start', () => {
        const user = users.get(socket.id);
        if (user) {
            socket.broadcast.emit('typing:update', {
                userId: socket.id,
                name: user.name,
                typing: true
            });
        }
    });
    
    socket.on('typing:stop', () => {
        socket.broadcast.emit('typing:update', {
            userId: socket.id,
            typing: false
        });
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            users.delete(socket.id);
            io.emit('user:left', socket.id);
            io.emit('system:message', {
                text: `${user.name} left the chat`,
                type: 'info'
            });
        }
    });
});

// ========== START SERVER ==========
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 WebSocket ready`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Error handling
server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is already in use`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    server.close(() => {
        process.exit(0);
    });
});

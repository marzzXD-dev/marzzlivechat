const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Untuk serve static files

// ========== FIX: TAMBAH ROUTE UTAMA ==========
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'RGB Group Chat Server',
        timestamp: new Date().toISOString(),
        endpoints: {
            root: '/',
            health: '/health',
            users: '/api/users',
            messages: '/api/messages',
            websocket: '/socket.io/'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage()
    });
});

// API endpoints
app.get('/api/users', (req, res) => {
    res.json({
        total: users.size,
        online: Array.from(users.values()).filter(u => u.online).length,
        users: Array.from(users.values()).map(u => ({
            id: u.id,
            name: u.name,
            online: u.online,
            joinedAt: u.joinedAt
        }))
    });
});

app.get('/api/messages', (req, res) => {
    res.json({
        total: messageHistory.length,
        messages: messageHistory.slice(-20)
    });
});

// ========== SOCKET.IO SETUP ==========
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Store connected users
const users = new Map();
const messageHistory = [];

io.on('connection', (socket) => {
    console.log('🔗 New connection:', socket.id);
    
    // Handle user join
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
        
        // Send welcome message
        socket.emit('system:message', {
            type: 'welcome',
            text: `Welcome ${user.name}!`,
            timestamp: new Date().toISOString()
        });
        
        // Broadcast join notification
        socket.broadcast.emit('system:message', {
            type: 'info',
            text: `${user.name} joined the chat`,
            timestamp: new Date().toISOString()
        });
        
        // Send message history
        socket.emit('messages:history', messageHistory.slice(-50));
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
        
        // Store message
        messageHistory.push(message);
        if (messageHistory.length > 1000) messageHistory.shift();
        
        // Broadcast to all
        io.emit('message:receive', message);
    });
    
    // Handle typing
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
            
            // Broadcast leave
            io.emit('user:left', socket.id);
            
            io.emit('system:message', {
                type: 'info',
                text: `${user.name} left the chat`,
                timestamp: new Date().toISOString()
            });
        }
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`📡 WebSocket: ws://localhost:${PORT}`);
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});



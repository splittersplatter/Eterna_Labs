const express = require('express');
const http = require('http'); // Required for Socket.io
const { Server } = require('socket.io'); // Required for Socket.io
require('dotenv').config();

// Import all modules
const { getTokenList } = require('./apiClient'); 
const { startScheduler } = require('./scheduler');
const { setupWebsocket } = require('./websocket');

const app = express();
// Middleware to parse JSON body
app.use(express.json());

const port = process.env.PORT || 5000;

// 1. Create HTTP Server from Express App
const server = http.createServer(app);

// 2. Initialize Socket.io Server
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for testing
        methods: ["GET", "POST"]
    }
});

// 3. Initialize WebSocket and Scheduler
setupWebsocket(io);
startScheduler();


// Simple health check endpoint
app.get('/', (req, res) => {
    res.status(200).send('Crypto Aggregation Service is Running.');
});

// New Endpoint: Token List with Filtering, Sorting, and Pagination
// Example: /api/token-list?limit=10&sortBy=volume24h&nextCursor=10
app.get('/api/token-list', getTokenList);

// NOTE: The old /api/token-data/:symbol route is removed as aggregation is now backgrounded.


// 4. Start the Combined Server
server.listen(port, () => {
    console.log(`\n🚀 HTTP Server running on port ${port}`);
    console.log(`🌐 WebSocket Server running`);
    console.log(`Test List Endpoint: http://localhost:${port}/api/token-list?sortBy=volume24h`);
});
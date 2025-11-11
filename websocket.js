const { redis } = require('./redisClient');
const { REALTIME_CHANNEL } = require('./scheduler');
const ioredis = require('ioredis');

// We need a separate Redis client instance for subscription, 
// as a subscribed client cannot be used for other commands.
const subscriber = new ioredis(process.env.REDIS_URL);

/**
 * Initializes Socket.io and sets up Redis Pub/Sub listener.
 * @param {object} io - The Socket.io server instance.
 */
function setupWebsocket(io) {
    console.log('🔗 Setting up Socket.io connections...');

    // --- Redis Pub/Sub Listener ---
    subscriber.subscribe(REALTIME_CHANNEL, (err, count) => {
        if (err) {
            console.error(`❌ Failed to subscribe to Redis channel ${REALTIME_CHANNEL}:`, err);
        } else {
            console.log(`✅ Subscribed to Redis channel ${REALTIME_CHANNEL}. Ready for real-time push.`);
        }
    });

    // When a message is received from Redis Pub/Sub
    subscriber.on('message', (channel, message) => {
        if (channel === REALTIME_CHANNEL) {
            try {
                const data = JSON.parse(message);
                // Broadcast the update to all connected Socket.io clients
                io.emit('priceUpdate', data);
                console.log(`[WS Push] Broadcasted update for ${data.symbol}`);
            } catch (e) {
                console.error('Error parsing Redis message:', e);
            }
        }
    });

    // --- Socket.io Connection Handler ---
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Handle client requests to subscribe to specific tokens (optional feature)
        socket.on('subscribe', (token) => {
            socket.join(token.toUpperCase());
            console.log(`${socket.id} subscribed to updates for ${token.toUpperCase()}`);
        });

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });
}

module.exports = { setupWebsocket };
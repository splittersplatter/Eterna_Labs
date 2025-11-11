const Redis = require('ioredis');
require('dotenv').config();

// Connect to Redis using the URL from environment variables
const redis = new Redis(process.env.REDIS_URL); 

redis.on('connect', () => {
    console.log('✅ Connected to Redis cache.');
});

redis.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err);
});

// Cache TTL constant (30 seconds)
const CACHE_TTL_SECONDS = 30;

/**
 * Retrieves data from Redis, parsing it from JSON.
 * @param {string} key - The cache key.
 * @returns {Promise<object | null>} - The parsed cached data or null.
 */
async function getJson(key) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
}

/**
 * Stores data in Redis, serializing it to JSON.
 * @param {string} key - The cache key.
 * @param {object} data - The data to store.
 * @param {number} [ttl=CACHE_TTL_SECONDS] - Time to live in seconds.
 */
async function setJson(key, data, ttl = CACHE_TTL_SECONDS) {
    // NX is important: Only set if the key does NOT EXIST. This can prevent race conditions
    // but typically we want to overwrite, so we just use EX (expire)
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
}

module.exports = {
    getJson,
    setJson,
    redis, // Exporting the client instance for Pub/Sub use later
};
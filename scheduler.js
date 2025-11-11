const cron = require('node-cron');
const { fetchDexScreener, fetchJupiterPrice, mergeAndCleanTokenData, TOKEN_LIST_KEY } = require('./apiClient');
const { getJson, setJson, redis } = require('./redisClient');

const AGGREGATION_CRON = process.env.AGGREGATION_CRON || '*/5 * * * *'; // Default: every 5 minutes
const TICKER_CRON = process.env.TICKER_CRON || '*/5 * * * * *'; // Default: every 5 seconds
const REALTIME_CHANNEL = 'token_price_updates';

// Mock list of popular tokens to track
const MOCK_TOP_TOKENS = ['SOL', 'JUP', 'BONK', 'WEN'];

/**
 * Executes a full aggregation, merging, and stores the final list in Redis.
 * This runs less frequently (e.g., every 5 minutes).
 */
async function runFullAggregation() {
    console.log(`[Scheduler] Starting full token aggregation job...`);
    
    try {
        // --- Step 1: Fetch Data for Top Tokens ---
        const fetchPromises = MOCK_TOP_TOKENS.map(async symbol => {
            // Note: In a real app, this list would come from a persistent store (DB)
            const [dex, jup] = await Promise.allSettled([
                fetchDexScreener(symbol), // Get pairs for volume/price change
                fetchJupiterPrice(symbol) // Get price/meta data
            ]);
            
            // Simplified data structure for merger
            return {
                symbol,
                dexScreener: dex.status === 'fulfilled' ? dex.value : null,
                jupiterPrice: jup.status === 'fulfilled' ? jup.value : null,
            };
        });

        const rawResults = (await Promise.all(fetchPromises)).filter(r => r.dexScreener || r.jupiterPrice);

        // --- Step 2: Merge and Clean ---
        // We pass the raw results for all tokens to the general merger
        const aggregatedList = mergeAndCleanTokenData(rawResults); 

        // --- Step 3: Store in Redis ---
        await setJson(TOKEN_LIST_KEY, aggregatedList); 
        console.log(`[Scheduler] Successfully updated ${aggregatedList.length} tokens in ${TOKEN_LIST_KEY}.`);

    } catch (error) {
        console.error(`[Scheduler] Full aggregation failed:`, error.message);
    }
}

/**
 * Runs a very fast check for price changes on high-volume tokens
 * and publishes updates to the REALTIME_CHANNEL via Redis Pub/Sub.
 * This runs frequently (e.g., every 5 seconds).
 */
async function runRealtimeTicker() {
    // In a real application, you would only query low-latency APIs here.
    
    const [solDex, solOld] = await Promise.all([
        fetchDexScreener('SOL'), // Quick poll for SOL
        getJson('ticker:SOL')    // Get last known state
    ]);

    if (solDex && solDex.length > 0) {
        const latestPair = solDex.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))[0];
        const newPrice = parseFloat(latestPair.priceUsd);

        if (solOld && Math.abs(newPrice - solOld.price) / solOld.price > 0.0005) { // Price change > 0.05%
            const update = {
                symbol: 'SOL',
                price: newPrice,
                volume24h: latestPair.volume.h24,
                timestamp: new Date().toISOString()
            };
            
            // Publish update to the WebSocket listeners
            redis.publish(REALTIME_CHANNEL, JSON.stringify(update));
            console.log(`[Ticker] Price change for SOL detected and published: ${newPrice}`);
        }
        
        // Update last known state in cache for comparison next run
        await setJson('ticker:SOL', { price: newPrice }, 60); // TTL of 60s
    }
}

/**
 * Initializes and starts both background cron jobs.
 */
function startScheduler() {
    // 1. Full aggregation job (less frequent)
    cron.schedule(AGGREGATION_CRON, runFullAggregation, {
        scheduled: true,
        timezone: "America/New_York"
    });
    console.log(`[Scheduler] Full Aggregation Cron scheduled: ${AGGREGATION_CRON}`);
    
    // 2. Real-time ticker job (frequent)
    cron.schedule(TICKER_CRON, runRealtimeTicker, {
        scheduled: true,
        timezone: "America/New_York"
    });
    console.log(`[Scheduler] Real-time Ticker Cron scheduled: ${TICKER_CRON}`);

    // Run immediately on startup to seed the initial data
    runFullAggregation(); 
}

module.exports = {
    startScheduler,
    REALTIME_CHANNEL
};
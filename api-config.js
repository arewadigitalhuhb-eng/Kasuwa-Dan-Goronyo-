/**
 * KASUWA API - REST & WebSocket Configuration
 * Version: 1.0.0
 */

const API_CONFIG = {
    // Base configuration
    version: 'v1',
    basePath: '/api/v1',
    
    // Server endpoints (change these to your server)
    endpoints: {
        development: 'http://localhost:3000',
        production: 'https://api.kasuwa.com',
        firebase: 'https://your-project-default-rtdb.firebaseio.com'
    },
    
    // Current environment
    environment: 'development',
    
    // Get current base URL
    get baseURL() {
        return this.endpoints[this.environment];
    },
    
    // API Key (for external access)
    apiKey: localStorage.getItem('apiKey') || null,
    
    // WebSocket connection
    ws: null,
    wsConnected: false,
    
    // Rate limiting
    rateLimit: {
        maxRequests: 100,
        windowMs: 60000, // 1 minute
        requests: []
    }
};

// API Response Handler
class APIResponse {
    constructor(success, data = null, error = null, meta = {}) {
        this.success = success;
        this.data = data;
        this.error = error;
        this.meta = {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
            ...meta
        };
    }
    
    static success(data, meta = {}) {
        return new APIResponse(true, data, null, meta);
    }
    
    static error(message, code = 400, meta = {}) {
        return new APIResponse(false, null, { message, code }, meta);
    }
}

// Generate unique request ID
function generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==================== REST API CLIENT ====================

class KasuwaAPI {
    constructor() {
        this.baseURL = API_CONFIG.baseURL;
        this.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Version': API_CONFIG.version
        };
        
        // Add auth token if available
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        if (user.token) {
            this.headers['Authorization'] = `Bearer ${user.token}`;
        }
        
        // Add API key if available
        if (API_CONFIG.apiKey) {
            this.headers['X-API-Key'] = API_CONFIG.apiKey;
        }
    }
    
    // Check rate limit
    checkRateLimit() {
        const now = Date.now();
        const windowStart = now - API_CONFIG.rateLimit.windowMs;
        
        // Remove old requests
        API_CONFIG.rateLimit.requests = API_CONFIG.rateLimit.requests.filter(
            time => time > windowStart
        );
        
        if (API_CONFIG.rateLimit.requests.length >= API_CONFIG.rateLimit.maxRequests) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }
        
        API_CONFIG.rateLimit.requests.push(now);
        return true;
    }
    
    // Generic request method
    async request(method, endpoint, data = null, params = {}) {
        try {
            this.checkRateLimit();
            
            // Build URL with query params
            let url = `${this.baseURL}${API_CONFIG.basePath}${endpoint}`;
            if (Object.keys(params).length > 0) {
                const queryString = new URLSearchParams(params).toString();
                url += `?${queryString}`;
            }
            
            const options = {
                method: method,
                headers: this.headers,
                mode: 'cors',
                cache: 'no-cache'
            };
            
            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(data);
            }
            
            // Add timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
            options.signal = controller.signal;
            
            const response = await fetch(url, options);
            clearTimeout(timeoutId);
            
            // Handle HTTP errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            // Parse response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return await response.text();
            
        } catch (error) {
            console.error(`API ${method} Error:`, error);
            
            // Return offline fallback if available
            if (!navigator.onLine) {
                return this.getOfflineFallback(endpoint);
            }
            
            throw error;
        }
    }
    
    // Offline fallback data
    getOfflineFallback(endpoint) {
        const userId = AppState.currentUser?.userId || 'guest';
        
        // Map endpoints to local storage
        const mapping = {
            '/products': `products_${userId}`,
            '/sales': `sales_${userId}`,
            '/customers': `customers_${userId}`,
            '/categories': `categories_${userId}`,
            '/settings': `settings_${userId}`
        };
        
        const key = Object.keys(mapping).find(k => endpoint.startsWith(k));
        if (key) {
            const data = JSON.parse(localStorage.getItem(mapping[key]) || '[]');
            return APIResponse.success(data, { source: 'offline', cached: true });
        }
        
        throw new Error('Offline data not available for this endpoint');
    }
    
    // ==================== PRODUCTS API ====================
    
    async getProducts(filters = {}) {
        return this.request('GET', '/products', null, filters);
    }
    
    async getProduct(id) {
        return this.request('GET', `/products/${id}`);
    }
    
    async createProduct(product) {
        return this.request('POST', '/products', product);
    }
    
    async updateProduct(id, updates) {
        return this.request('PUT', `/products/${id}`, updates);
    }
    
    async deleteProduct(id) {
        return this.request('DELETE', `/products/${id}`);
    }
    
    async bulkUpdateProducts(products) {
        return this.request('POST', '/products/bulk', { products });
    }
    
    // ==================== SALES API ====================
    
    async getSales(filters = {}) {
        return this.request('GET', '/sales', null, filters);
    }
    
    async getSale(id) {
        return this.request('GET', `/sales/${id}`);
    }
    
    async createSale(sale) {
        return this.request('POST', '/sales', sale);
    }
    
    async updateSale(id, updates) {
        return this.request('PATCH', `/sales/${id}`, updates);
    }
    
    async getSalesReport(params = {}) {
        return this.request('GET', '/sales/report', null, params);
    }
    
    // ==================== CUSTOMERS API ====================
    
    async getCustomers(filters = {}) {
        return this.request('GET', '/customers', null, filters);
    }
    
    async getCustomer(id) {
        return this.request('GET', `/customers/${id}`);
    }
    
    async createCustomer(customer) {
        return this.request('POST', '/customers', customer);
    }
    
    async updateCustomer(id, updates) {
        return this.request('PUT', `/customers/${id}`, updates);
    }
    
    async deleteCustomer(id) {
        return this.request('DELETE', `/customers/${id}`);
    }
    
    async getCustomerHistory(id) {
        return this.request('GET', `/customers/${id}/history`);
    }
    
    // ==================== INVENTORY API ====================
    
    async getInventory() {
        return this.request('GET', '/inventory');
    }
    
    async updateStock(id, quantity, reason = '') {
        return this.request('POST', '/inventory/adjust', {
            productId: id,
            quantity,
            reason,
            timestamp: new Date().toISOString()
        });
    }
    
    async getLowStock() {
        return this.request('GET', '/inventory/low-stock');
    }
    
    // ==================== ANALYTICS API ====================
    
    async getDashboardStats() {
        return this.request('GET', '/analytics/dashboard');
    }
    
    async getRevenueReport(period = 'month') {
        return this.request('GET', '/analytics/revenue', null, { period });
    }
    
    async getTopProducts(limit = 10) {
        return this.request('GET', '/analytics/top-products', null, { limit });
    }
    
    // ==================== WEBHOOK API ====================
    
    async registerWebhook(url, events) {
        return this.request('POST', '/webhooks', { url, events });
    }
    
    async getWebhooks() {
        return this.request('GET', '/webhooks');
    }
    
    async deleteWebhook(id) {
        return this.request('DELETE', `/webhooks/${id}`);
    }
    
    // ==================== EXPORT API ====================
    
    async exportData(format = 'json', type = 'all') {
        return this.request('GET', '/export', null, { format, type });
    }
    
    async importData(data, type = 'products') {
        return this.request('POST', '/import', { type, data });
    }
}

// ==================== WEBSOCKET API ====================

class KasuwaWebSocket {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.listeners = new Map();
        this.pendingMessages = [];
    }
    
    connect() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }
        
        const wsURL = API_CONFIG.baseURL.replace('http', 'ws') + '/ws';
        
        try {
            this.ws = new WebSocket(wsURL);
            
            this.ws.onopen = () => {
                console.log('🔌 WebSocket connected');
                this.reconnectAttempts = 0;
                API_CONFIG.wsConnected = true;
                
                // Send pending messages
                this.flushPendingMessages();
                
                // Authenticate
                const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
                this.send('auth', { token: user.token, userId: user.userId });
                
                // Trigger connect event
                this.trigger('connected', {});
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                API_CONFIG.wsConnected = false;
                this.attemptReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.trigger('error', error);
            };
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.attemptReconnect();
        }
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        API_CONFIG.wsConnected = false;
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.trigger('disconnected', { permanent: true });
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        
        console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connect();
        }, delay);
    }
    
    send(type, payload) {
        const message = {
            type,
            payload,
            timestamp: Date.now(),
            id: generateRequestId()
        };
        
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            this.pendingMessages.push(message);
        }
    }
    
    flushPendingMessages() {
        while (this.pendingMessages.length > 0) {
            const message = this.pendingMessages.shift();
            this.ws.send(JSON.stringify(message));
        }
    }
    
    handleMessage(message) {
        // Trigger registered listeners
        this.trigger(message.type, message.payload);
        
        // Handle specific message types
        switch(message.type) {
            case 'sale_created':
                handleRealtimeSale(message.payload);
                break;
            case 'stock_updated':
                handleRealtimeStockUpdate(message.payload);
                break;
            case 'price_changed':
                handleRealtimePriceChange(message.payload);
                break;
            case 'notification':
                showToast(message.payload.message, message.payload.level || 'info');
                break;
            case 'sync_request':
                handleSyncRequest(message.payload);
                break;
        }
    }
    
    // Event listener system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
    }
    
    trigger(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('Event callback error:', error);
            }
        });
    }
    
    // Specific message senders
    subscribeToChannel(channel) {
        this.send('subscribe', { channel });
    }
    
    unsubscribeFromChannel(channel) {
        this.send('unsubscribe', { channel });
    }
    
    broadcastSale(sale) {
        this.send('sale', sale);
    }
    
    requestSync() {
        this.send('sync_request', { userId: AppState.currentUser?.userId });
    }
}

// ==================== REALTIME HANDLERS ====================

function handleRealtimeSale(sale) {
    console.log('🛒 Realtime sale received:', sale);
    
    // Update local data if it's from another device
    if (sale.deviceId !== AppState.deviceId) {
        const sales = Data.sales;
        if (!sales.find(s => s.id === sale.id)) {
            sales.push(sale);
            Data.sales = sales;
            
            // Update UI if on relevant page
            if (getCurrentPage() === 'index') {
                updateStats();
                loadRecentSales();
            }
            if (getCurrentPage() === 'history') {
                renderHistory();
            }
            
            showToast(`New sale: ${formatCurrency(sale.total)}`, 'info');
        }
    }
}

function handleRealtimeStockUpdate(update) {
    console.log('📦 Stock update:', update);
    
    const products = Data.products;
    const product = products.find(p => p.id === update.productId);
    
    if (product) {
        product.quantity = update.newQuantity;
        product.lastUpdated = update.timestamp;
        Data.products = products;
        
        // Check if low stock
        if (product.quantity <= (product.alertLevel || 5)) {
            showToast(`Low stock alert: ${product.name} (${product.quantity})`, 'warning');
        }
        
        // Update UI
        if (getCurrentPage() === 'stocks') {
            renderStockTable();
        }
        if (getCurrentPage() === 'sale') {
            renderProducts();
        }
    }
}

function handleRealtimePriceChange(change) {
    console.log('💰 Price change:', change);
    
    const products = Data.products;
    const product = products.find(p => p.id === change.productId);
    
    if (product) {
        product.price = change.newPrice;
        Data.products = products;
        
        if (getCurrentPage() === 'sale') {
            renderProducts();
            showToast(`${product.name} price updated`, 'info');
        }
    }
}

function handleSyncRequest(payload) {
    console.log('🔄 Sync requested');
    
    // Send current data to server
    if (window.api) {
        window.api.syncToCloud(AppState.currentUser?.userId);
    }
}

// ==================== API INITIALIZATION ====================

let api = null;
let ws = null;

function initializeAPI() {
    // Initialize REST API client
    api = new KasuwaAPI();
    window.api = api; // Global access
    
    // Initialize WebSocket
    ws = new KasuwaWebSocket();
    window.ws = ws; // Global access
    
    // Setup WebSocket listeners
    setupWebSocketListeners();
    
    // Connect WebSocket
    if (navigator.onLine) {
        ws.connect();
    }
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
        console.log('🌐 Back online, connecting WebSocket...');
        ws.connect();
        api.processSyncQueue();
    });
    
    window.addEventListener('offline', () => {
        console.log('📴 Offline, WebSocket disconnected');
        ws.disconnect();
    });
    
    console.log('✅ API initialized');
}

function setupWebSocketListeners() {
    // Listen for connection events
    ws.on('connected', () => {
        updateConnectionStatus('connected');
        
        // Subscribe to user-specific channel
        if (AppState.currentUser?.userId) {
            ws.subscribeToChannel(`user_${AppState.currentUser.userId}`);
        }
    });
    
    ws.on('disconnected', (data) => {
        updateConnectionStatus(data.permanent ? 'disconnected' : 'reconnecting');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('error');
    });
}

function updateConnectionStatus(status) {
    const indicator = document.getElementById('connectionStatus');
    if (!indicator) return;
    
    const icons = {
        connected: '<i class="fas fa-wifi"></i>',
        reconnecting: '<i class="fas fa-sync fa-spin"></i>',
        disconnected: '<i class="fas fa-wifi-slash"></i>',
        error: '<i class="fas fa-exclamation-triangle"></i>'
    };
    
    const texts = {
        connected: 'Live',
        reconnecting: 'Connecting...',
        disconnected: 'Offline',
        error: 'Error'
    };
    
    indicator.innerHTML = `${icons[status]} ${texts[status]}`;
    indicator.className = `connection-status ${status}`;
}

// ==================== SERVICE WORKER (for offline) ====================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registered:', registration);
            })
            .catch(error => {
                console.error('❌ Service Worker registration failed:', error);
            });
    }
}

// ==================== EXPORT FOR GLOBAL USE ====================

window.KasuwaAPI = {
    REST: KasuwaAPI,
    WebSocket: KasuwaWebSocket,
    Response: APIResponse,
    config: API_CONFIG,
    initialize: initializeAPI,
    instance: () => api,
    ws: () => ws
};

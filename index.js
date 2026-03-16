

// ==================== FIREBASE DATA LAYER ====================

const FirebaseStorage = {
    // Check if Firebase is available
    isOnline() {
        return typeof firebase !== 'undefined' && 
               firebase.apps.length > 0 && 
               navigator.onLine;
    },

    // Get data with Firebase fallback
    async get(key, defaultValue = []) {
        // Try local first
        const localData = Storage.get(key, null);
        
        // If Firebase is available, sync with cloud
        if (this.isOnline() && AppState.currentUser?.userId) {
            try {
                const snapshot = await firebase.database()
                    .ref(`users/${AppState.currentUser.userId}/${key}`)
                    .once('value');
                
                const cloudData = snapshot.val();
                
                // Merge if cloud data is newer
                if (cloudData && cloudData.lastUpdated > (localData?.lastUpdated || 0)) {
                    Storage.set(key, cloudData.data);
                    return cloudData.data;
                }
            } catch (error) {
                console.error('Firebase get error:', error);
            }
        }
        
        return localData !== null ? localData : defaultValue;
    },

    // Save data to both local and cloud
    async set(key, value) {
        // Always save locally first
        Storage.set(key, value);
        
        // Add timestamp
        const dataWithMeta = {
            data: value,
            lastUpdated: Date.now(),
            deviceId: AppState.deviceId || 'unknown'
        };
        
        // Sync to cloud if available
        if (this.isOnline() && AppState.currentUser?.userId) {
            try {
                await firebase.database()
                    .ref(`users/${AppState.currentUser.userId}/${key}`)
                    .set(dataWithMeta);
                
                console.log(`☁️ Synced ${key} to cloud`);
            } catch (error) {
                console.error('Firebase set error:', error);
                // Queue for later sync
                this.queueForSync(key, value);
            }
        } else {
            // Queue for later sync
            this.queueForSync(key, value);
        }
        
        return true;
    },

    // Queue data for sync when online
    syncQueue: [],
    
    queueForSync(key, value) {
        this.syncQueue.push({ key, value, timestamp: Date.now() });
        localStorage.setItem('pendingSync', JSON.stringify(this.syncQueue));
    },

    // Process sync queue
    async processSyncQueue() {
        if (!this.isOnline() || !AppState.currentUser?.userId) return;
        
        const queue = JSON.parse(localStorage.getItem('pendingSync') || '[]');
        if (queue.length === 0) return;
        
        console.log(`🔄 Processing ${queue.length} pending syncs...`);
        
        for (const item of queue) {
            try {
                await firebase.database()
                    .ref(`users/${AppState.currentUser.userId}/${item.key}`)
                    .set({
                        data: item.value,
                        lastUpdated: item.timestamp
                    });
            } catch (error) {
                console.error('Sync failed for', item.key, error);
            }
        }
        
        localStorage.removeItem('pendingSync');
        this.syncQueue = [];
        showToast(`${queue.length} items synced to cloud`, 'success');
    }
};

// Update Data object to use Firebase
const Data = {
    get products() { return Storage.get('products', []); },
    set products(value) { 
        Storage.set('products', value);
        FirebaseStorage.set('products', value);
    },
    
    get sales() { return Storage.get('sales', []); },
    set sales(value) { 
        Storage.set('sales', value);
        FirebaseStorage.set('sales', value);
    },
    
    get customers() { return Storage.get('customers', []); },
    set customers(value) { 
        Storage.set('customers', value);
        FirebaseStorage.set('customers', value);
    },
    
    get categories() { 
        return Storage.get('categories', [
            { id: 1, name: 'General', icon: '📦', color: '#667eea', description: 'General items' },
            { id: 2, name: 'Electronics', icon: '🔌', color: '#4299e1', description: 'Electronic devices' },
            { id: 3, name: 'Food', icon: '🍔', color: '#48bb78', description: 'Food and beverages' }
        ]); 
    },
    set categories(value) { 
        Storage.set('categories', value);
        FirebaseStorage.set('categories', value);
    },
    
    get settings() { 
        return Storage.get('settings', {
            shopName: 'Dan Goronyo Shop',
            currency: 'NGN',
            lowStockAlert: 5,
            soundEnabled: true,
            darkMode: false,
            receiptFooter: 'Thank you for your patronage!'
        }); 
    },
    set settings(value) { 
        Storage.set('settings', value);
        FirebaseStorage.set('settings', value);
    }
};

// Real-time listeners setup
function setupRealtimeListeners() {
    if (!FirebaseStorage.isOnline() || !AppState.currentUser?.userId) return;
    
    const userId = AppState.currentUser.userId;
    const db = firebase.database();
    
    // Listen for products changes
    db.ref(`users/${userId}/products`).on('value', snapshot => {
        const data = snapshot.val();
        if (data && data.lastUpdated > (AppState.lastSync || 0)) {
            console.log('📥 Products updated from cloud');
            Storage.set('products', data.data);
            if (getCurrentPage() === 'stocks') renderStockTable();
            if (getCurrentPage() === 'sale') renderProducts();
        }
    });
    
    // Listen for sales changes
    db.ref(`users/${userId}/sales`).on('value', snapshot => {
        const data = snapshot.val();
        if (data && data.lastUpdated > (AppState.lastSync || 0)) {
            console.log('📥 Sales updated from cloud');
            Storage.set('sales', data.data);
            if (getCurrentPage() === 'history') renderHistory();
            if (getCurrentPage() === 'index') updateStats();
        }
    });
    
    // Listen for customers changes
    db.ref(`users/${userId}/customers`).on('value', snapshot => {
        const data = snapshot.val();
        if (data && data.lastUpdated > (AppState.lastSync || 0)) {
            console.log('📥 Customers updated from cloud');
            Storage.set('customers', data.data);
            if (getCurrentPage() === 'customers') renderCustomers();
            if (getCurrentPage() === 'sale') populateCustomerSelect();
        }
    });
    
    console.log('👂 Real-time listeners activated');
}

// Conflict resolution
function resolveConflict(localData, cloudData, key) {
    const localTime = localData.lastUpdated || 0;
    const cloudTime = cloudData.lastUpdated || 0;
    
    if (cloudTime > localTime) {
        console.log(`☁️ Using cloud ${key} (newer)`);
        return cloudData.data;
    } else if (localTime > cloudTime) {
        console.log(`💾 Using local ${key} (newer)`);
        // Upload local to cloud
        FirebaseStorage.set(key, localData.data);
        return localData.data;
    } else {
        // Same timestamp, merge arrays
        console.log(`🔄 Merging ${key} data`);
        return mergeArrays(localData.data, cloudData.data);
    }
}

function mergeArrays(local, cloud) {
    if (!Array.isArray(local) || !Array.isArray(cloud)) return local || cloud || [];
    
    const merged = [...local];
    const localIds = new Set(local.map(item => item.id));
    
    cloud.forEach(item => {
        if (!localIds.has(item.id)) {
            merged.push(item);
        }
    });
    
    return merged;
}

// Global Variables
// User-specific data management
function getCurrentUser() {
    return JSON.parse(localStorage.getItem('currentUser'));
}

function getUserData(key) {
    const user = getCurrentUser();
    if (!user) return [];
    return JSON.parse(localStorage.getItem(`${key}_${user.userId}`)) || [];
}

function setUserData(key, data) {
    const user = getCurrentUser();
    if (!user) return;
    localStorage.setItem(`${key}_${user.userId}`, JSON.stringify(data));
}

// Override existing functions to use user-specific data
function loadUserData() {
    const user = getCurrentUser();
    if (user) {
        products = getUserData('products');
        sales = getUserData('sales');
        customers = getUserData('customers');
        categories = getUserData('categories');
        
        // Update UI with user info
        const userNameElements = document.querySelectorAll('.user-name');
        userNameElements.forEach(el => el.textContent = user.fullName);
        
        const shopNameElements = document.querySelectorAll('.shop-name');
        shopNameElements.forEach(el => el.textContent = user.shopName);
    }
}

// Update save functions
function saveProducts() {
    setUserData('products', products);
}

function saveSales() {
    setUserData('sales', sales);
}

function saveCustomers() {
    setUserData('customers', customers);
}

function saveCategories() {
    setUserData('categories', categories);
}

let currentUser = null;
let products = JSON.parse(localStorage.getItem('products')) || [];
let sales = JSON.parse(localStorage.getItem('sales')) || [];
let customers = JSON.parse(localStorage.getItem('customers')) || [];
let categories = JSON.parse(localStorage.getItem('categories')) || [
    { id: 1, name: 'General', icon: '📦', color: '#667eea', description: 'General items' }
];
let cart = [];
let currentPage = 1;
const itemsPerPage = 10;

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    initApp();
});

function initApp() {
    checkAuth();
    setupEventListeners();
    loadPageData();
    updateDateDisplay();
}

// Navigation
function goPage(page) {
    window.location.href = page + '.html';
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

// Authentication
function checkAuth() {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser && !window.location.href.includes('login')) {
        // Redirect to login if not authenticated
        // window.location.href = 'login.html';
    }
}

function logoutUser() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('currentUser');
        window.location.href = 'login.html';
    }
}

// Page Specific Functions
function loadPageData() {
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    
    switch(currentPage) {
        case 'index':
        case '':
            loadDashboard();
            break;
        case 'stocks':
            loadStocks();
            break;
        case 'sale':
            loadSalePage();
            break;
        case 'customers':
            loadCustomers();
            break;
        case 'categories':
            loadCategories();
            break;
        case 'history':
            loadHistory();
            break;
        case 'reports':
            loadReports();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'profile':
            loadProfile();
            break;
        case 'upgrade':
            loadUpgradePage();
            break;
    }
}

// Dashboard Functions
function loadDashboard() {
    updateStats();
    checkLowStock();
    loadRecentSales();
}

function updateStats() {
    document.getElementById('totalProducts').textContent = products.length;
    
    const today = new Date().toDateString();
    const todaySales = sales.filter(s => new Date(s.date).toDateString() === today);
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    
    document.getElementById('todaySales').textContent = formatCurrency(todayRevenue);
    document.getElementById('usageSales').textContent = todaySales.length;
    document.getElementById('usageProducts').textContent = `${products.length}/100`;
    
    const totalProfit = sales.reduce((sum, s) => sum + (s.profit || 0), 0);
    document.getElementById('totalProfit').textContent = formatCurrency(totalProfit);
    
    const inventoryValue = products.reduce((sum, p) => sum + (p.cost * p.quantity), 0);
    document.getElementById('inventoryValue').textContent = formatCurrency(inventoryValue);
}

function checkLowStock() {
    const lowStock = products.filter(p => p.quantity <= (p.alertLevel || 5));
    const alertDiv = document.getElementById('lowStockAlert');
    
    if (lowStock.length > 0) {
        alertDiv.innerHTML = `
            <strong>⚠️ Low Stock Alert:</strong> ${lowStock.length} item(s) running low: 
            ${lowStock.map(p => p.name).join(', ')}
        `;
    } else {
        alertDiv.innerHTML = '';
    }
}

function loadRecentSales() {
    const recentSales = sales.slice(-5).reverse();
    const container = document.getElementById('recentSalesList');
    
    if (recentSales.length === 0) {
        container.innerHTML = '<p class="empty-state">No recent sales</p>';
        return;
    }
    
    container.innerHTML = recentSales.map(sale => `
        <div class="sale-item" style="padding: 15px; border-bottom: 1px solid #e2e8f0;">
            <div style="display: flex; justify-content: space-between;">
                <span>Receipt #${sale.id}</span>
                <span>${formatCurrency(sale.total)}</span>
            </div>
            <small style="color: #718096;">${new Date(sale.date).toLocaleString()}</small>
        </div>
    `).join('');
}

// Stock Management
function loadStocks() {
    renderStockTable();
    updateStockStats();
    populateCategorySelect();
}

function renderStockTable(filter = 'all') {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;
    
    let filteredProducts = products;
    if (filter === 'low') {
        filteredProducts = products.filter(p => p.quantity <= (p.alertLevel || 5) && p.quantity > 0);
    } else if (filter === 'out') {
        filteredProducts = products.filter(p => p.quantity === 0);
    }
    
    tbody.innerHTML = filteredProducts.map(product => `
        <tr>
            <td>${product.name}</td>
            <td>${getCategoryName(product.categoryId)}</td>
            <td>${product.quantity}</td>
            <td>${formatCurrency(product.cost)}</td>
            <td>${formatCurrency(product.price)}</td>
            <td>
                <span class="status ${getStockStatus(product.quantity, product.alertLevel)}">
                    ${getStockStatusText(product.quantity, product.alertLevel)}
                </span>
            </td>
            <td>
                <button onclick="editProduct(${product.id})" class="btn-small">Edit</button>
                <button onclick="deleteProduct(${product.id})" class="btn-small btn-danger">Delete</button>
            </td>
        </tr>
    `).join('');
}

function updateStockStats() {
    const lowStock = products.filter(p => p.quantity <= (p.alertLevel || 5) && p.quantity > 0).length;
    const outOfStock = products.filter(p => p.quantity === 0).length;
    
    const totalEl = document.getElementById('totalStockCount');
    const lowEl = document.getElementById('lowStockCount');
    const outEl = document.getElementById('outOfStockCount');
    
    if (totalEl) totalEl.textContent = products.length;
    if (lowEl) lowEl.textContent = lowStock;
    if (outEl) outEl.textContent = outOfStock;
}

function getStockStatus(quantity, alertLevel) {
    if (quantity === 0) return 'overdue';
    if (quantity <= (alertLevel || 5)) return 'pending';
    return 'paid';
}

function getStockStatusText(quantity, alertLevel) {
    if (quantity === 0) return 'Out of Stock';
    if (quantity <= (alertLevel || 5)) return 'Low Stock';
    return 'In Stock';
}

function saveProduct(e) {
    e.preventDefault();
    
    const product = {
        id: Date.now(),
        name: document.getElementById('prodName').value,
        categoryId: parseInt(document.getElementById('prodCategory').value),
        cost: parseFloat(document.getElementById('prodCost').value),
        price: parseFloat(document.getElementById('prodPrice').value),
        quantity: parseInt(document.getElementById('prodQty').value),
        alertLevel: parseInt(document.getElementById('prodAlert').value) || 5,
        barcode: document.getElementById('prodBarcode').value
    };
    
    products.push(product);
    localStorage.setItem('products', JSON.stringify(products));
    
    closeModal('addProductModal');
    renderStockTable();
    updateStockStats();
    showToast('Product added successfully!', 'success');
    e.target.reset();
}

function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        products = products.filter(p => p.id !== id);
        localStorage.setItem('products', JSON.stringify(products));
        renderStockTable();
        updateStockStats();
        showToast('Product deleted', 'success');
    }
}

// Sale Page Functions
function loadSalePage() {
    renderProducts();
    renderCart();
    populateCustomerSelect();
    populateCategoryButtons();
}

function renderProducts(categoryFilter = 'all') {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    let filtered = products.filter(p => p.quantity > 0);
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.categoryId == categoryFilter);
    }
    
    grid.innerHTML = filtered.map(product => `
        <div class="product-card" onclick="addToCart(${product.id})">
            <div style="font-size: 30px; margin-bottom: 10px;">📦</div>
            <h4>${product.name}</h4>
            <p style="color: var(--primary); font-weight: 600;">
                ${formatCurrency(product.price)}
            </p>
            <small style="color: #718096;">Stock: ${product.quantity}</small>
        </div>
    `).join('');
}

function populateCategoryButtons() {
    const container = document.getElementById('categoryButtons');
    if (!container) return;
    
    container.innerHTML = categories.map(cat => `
        <button class="filter-btn" onclick="filterCategory(${cat.id})">${cat.name}</button>
    `).join('');
}

function filterCategory(catId) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderProducts(catId);
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        if (existingItem.quantity < product.quantity) {
            existingItem.quantity++;
        } else {
            showToast('Not enough stock!', 'error');
            return;
        }
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            cost: product.cost,
            quantity: 1
        });
    }
    
    renderCart();
    showToast('Added to cart', 'success');
}

function renderCart() {
    const container = document.getElementById('cartItems');
    if (!container) return;
    
    if (cart.length === 0) {
        container.innerHTML = '<p class="empty-state">No items added yet</p>';
        document.getElementById('subtotal').textContent = formatCurrency(0);
        document.getElementById('totalAmount').textContent = formatCurrency(0);
        return;
    }
    
    container.innerHTML = cart.map((item, index) => `
        <div class="cart-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #e2e8f0;">
            <div>
                <strong>${item.name}</strong>
                <div style="color: #718096; font-size: 12px;">
                    ${formatCurrency(item.price)} x ${item.quantity}
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span>${formatCurrency(item.price * item.quantity)}</span>
                <button onclick="removeFromCart(${index})" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 18px;">×</button>
            </div>
        </div>
    `).join('');
    
    calculateTotal();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function calculateTotal() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = parseFloat(document.getElementById('discountInput')?.value) || 0;
    const total = subtotal - discount;
    
    document.getElementById('subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('totalAmount').textContent = formatCurrency(total);
}

function processSale() {
    if (cart.length === 0) {
        showToast('Cart is empty!', 'error');
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = parseFloat(document.getElementById('discountInput')?.value) || 0;
    const finalTotal = total - discount;
    const profit = cart.reduce((sum, item) => sum + ((item.price - item.cost) * item.quantity), 0) - discount;
    
    const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || 'cash';
    const customerId = document.getElementById('customerSelect')?.value || null;
    
    const sale = {
        id: 'INV' + Date.now(),
        date: new Date().toISOString(),
        items: [...cart],
        subtotal: total,
        discount: discount,
        total: finalTotal,
        profit: profit,
        paymentMethod: paymentMethod,
        customerId: customerId,
        status: 'completed'
    };
    
    // Update product quantities
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (product) {
            product.quantity -= item.quantity;
        }
    });
    
    sales.push(sale);
    localStorage.setItem('sales', JSON.stringify(sales));
    localStorage.setItem('products', JSON.stringify(products));
    
    // Clear cart
    cart = [];
    renderCart();
    document.getElementById('discountInput').value = '';
    
    showToast(`Sale completed! Total: ${formatCurrency(finalTotal)}`, 'success');
    
    // Print receipt option
    if (confirm('Print receipt?')) {
        printReceipt(sale);
    }
}

// Customer Functions
function loadCustomers() {
    renderCustomers();
    updateCustomerStats();
}

function renderCustomers() {
    const container = document.getElementById('customersContainer');
    if (!container) return;
    
    if (customers.length === 0) {
        container.innerHTML = '<p class="empty-state">No customers yet</p>';
        return;
    }
    
    container.innerHTML = customers.map(customer => {
        const customerSales = sales.filter(s => s.customerId == customer.id);
        const totalSpent = customerSales.reduce((sum, s) => sum + s.total, 0);
        const creditBalance = customer.creditLimit - (customer.creditUsed || 0);
        
        return `
        <div class="customer-card" onclick="viewCustomerDetails(${customer.id})">
            ${customer.creditUsed > 0 ? '<span class="credit-badge">Credit</span>' : ''}
            <div class="customer-header">
                <div class="customer-avatar">${customer.name.charAt(0).toUpperCase()}</div>
                <div class="customer-info">
                    <h4>${customer.name}</h4>
                    <p>${customer.phone}</p>
                    <small style="color: var(--primary); text-transform: uppercase; font-size: 10px;">${customer.type || 'Regular'}</small>
                </div>
            </div>
            <div class="customer-stats">
                <div class="customer-stat">
                    <span class="value">${customerSales.length}</span>
                    <span class="label">Orders</span>
                </div>
                <div class="customer-stat">
                    <span class="value">${formatCurrency(totalSpent)}</span>
                    <span class="label">Total</span>
                </div>
                <div class="customer-stat">
                    <span class="value" style="${creditBalance < 1000 ? 'color: var(--danger)' : ''}">
                        ${formatCurrency(creditBalance)}
                    </span>
                    <span class="label">Credit</span>
                </div>
            </div>
        </div>
    `}).join('');
}

function saveCustomer(e) {
    e.preventDefault();
    
    const customer = {
        id: Date.now(),
        name: document.getElementById('custName').value,
        phone: document.getElementById('custPhone').value,
        email: document.getElementById('custEmail').value,
        address: document.getElementById('custAddress').value,
        type: document.getElementById('custType').value,
        creditLimit: parseFloat(document.getElementById('custCreditLimit').value) || 0,
        creditUsed: 0,
        notes: document.getElementById('custNotes').value
    };
    
    customers.push(customer);
    localStorage.setItem('customers', JSON.stringify(customers));
    
    closeModal('addCustomerModal');
    renderCustomers();
    updateCustomerStats();
    showToast('Customer added successfully!', 'success');
    e.target.reset();
}

// Category Functions
function loadCategories() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;
    
    grid.innerHTML = categories.map(cat => {
        const count = products.filter(p => p.categoryId == cat.id).length;
        return `
        <div class="category-card" style="border-top-color: ${cat.color}">
            <div class="cat-icon">${cat.icon || '📦'}</div>
            <h3>${cat.name}</h3>
            <p class="product-count">${count} products</p>
            <p style="color: #718096; font-size: 14px; margin: 10px 0;">${cat.description || ''}</p>
            <div class="category-actions">
                <button onclick="editCategory(${cat.id})" class="btn-small">Edit</button>
                <button onclick="deleteCategory(${cat.id})" class="btn-small btn-danger">Delete</button>
            </div>
        </div>
    `}).join('');
}

function saveCategory(e) {
    e.preventDefault();
    
    const category = {
        id: Date.now(),
        name: document.getElementById('catName').value,
        description: document.getElementById('catDescription').value,
        icon: document.getElementById('catIcon').value || '📦',
        color: document.getElementById('catColor').value
    };
    
    categories.push(category);
    localStorage.setItem('categories', JSON.stringify(categories));
    
    closeModal('addCategoryModal');
    loadCategories();
    showToast('Category added!', 'success');
    e.target.reset();
}

// History Functions
function loadHistory() {
    renderHistoryTable();
    updateHistoryStats();
}

function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedSales = sales.slice().reverse().slice(start, start + itemsPerPage);
    
    tbody.innerHTML = paginatedSales.map(sale => {
        const customer = customers.find(c => c.id == sale.customerId);
        return `
        <tr>
            <td>${sale.id}</td>
            <td>${new Date(sale.date).toLocaleString()}</td>
            <td>${customer ? customer.name : 'Walk-in'}</td>
            <td>${sale.items.length} items</td>
            <td>${formatCurrency(sale.total)}</td>
            <td><span class="status paid">${sale.paymentMethod}</span></td>
            <td>
                <button onclick="viewReceipt('${sale.id}')" class="btn-small">View</button>
                <button onclick="printReceiptById('${sale.id}')" class="btn-small">Print</button>
            </td>
        </tr>
    `}).join('');
    
    updatePagination();
}

// Reports Functions
function loadReports() {
    generateReport();
}

function generateReport() {
    const period = document.getElementById('reportPeriod')?.value || 'today';
    let startDate, endDate;
    
    const now = new Date();
    if (period === 'today') {
        startDate = new Date(now.setHours(0,0,0,0));
        endDate = new Date();
    } else if (period === 'week') {
        startDate = new Date(now.setDate(now.getDate() - 7));
        endDate = new Date();
    } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date();
    } else if (period === 'custom') {
        startDate = new Date(document.getElementById('reportStart').value);
        endDate = new Date(document.getElementById('reportEnd').value);
    }
    
    const filteredSales = sales.filter(s => {
        const saleDate = new Date(s.date);
        return saleDate >= startDate && saleDate <= endDate;
    });
    
    const revenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const profit = filteredSales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const orders = filteredSales.length;
    const items = filteredSales.reduce((sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);
    
    document.getElementById('reportRevenue').textContent = formatCurrency(revenue);
    document.getElementById('reportProfit').textContent = formatCurrency(profit);
    document.getElementById('reportOrders').textContent = orders;
    document.getElementById('reportItems').textContent = items;
    
    // Render charts if Chart.js is available
    if (typeof Chart !== 'undefined') {
        renderSalesChart(filteredSales);
        renderCategoryChart(filteredSales);
    }
}

// Utility Functions
function formatCurrency(amount) {
    return '₦' + amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

function getCategoryName(id) {
    const cat = categories.find(c => c.id == id);
    return cat ? cat.name : 'Uncategorized';
}

function populateCategorySelect() {
    const select = document.getElementById('prodCategory');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Category</option>' +
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function populateCustomerSelect() {
    const select = document.getElementById('customerSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Walk-in Customer</option>' +
        customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function updateDateDisplay() {
    const dateEl = document.getElementById('currentDate');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-NG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Search Functions
function searchProducts() {
    const query = document.getElementById('productSearch')?.value.toLowerCase();
    if (!query) {
        renderProducts();
        return;
    }
    
    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(query) && p.quantity > 0
    );
    
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = filtered.map(product => `
        <div class="product-card" onclick="addToCart(${product.id})">
            <div style="font-size: 30px; margin-bottom: 10px;">📦</div>
            <h4>${product.name}</h4>
            <p style="color: var(--primary); font-weight: 600;">
                ${formatCurrency(product.price)}
            </p>
            <small style="color: #718096;">Stock: ${product.quantity}</small>
        </div>
    `).join('');
}

function searchStock() {
    const query = document.getElementById('stockSearch')?.value.toLowerCase();
    const tbody = document.getElementById('stockTableBody');
    if (!query) {
        renderStockTable();
        return;
    }
    
    const filtered = products.filter(p => p.name.toLowerCase().includes(query));
    
    tbody.innerHTML = filtered.map(product => `
        <tr>
            <td>${product.name}</td>
            <td>${getCategoryName(product.categoryId)}</td>
            <td>${product.quantity}</td>
            <td>${formatCurrency(product.cost)}</td>
            <td>${formatCurrency(product.price)}</td>
            <td>
                <span class="status ${getStockStatus(product.quantity, product.alertLevel)}">
                    ${getStockStatusText(product.quantity, product.alertLevel)}
                </span>
            </td>
            <td>
                <button onclick="editProduct(${product.id})" class="btn-small">Edit</button>
                <button onclick="deleteProduct(${product.id})" class="btn-small btn-danger">Delete</button>
            </td>
        </tr>
    `).join('');
}

function searchCustomers() {
    const query = document.getElementById('customerSearch')?.value.toLowerCase();
    if (!query) {
        renderCustomers();
        return;
    }
    
    const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.phone.includes(query)
    );
    
    // Temporary replace customers array for rendering
    const original = customers;
    customers = filtered;
    renderCustomers();
    customers = original;
}

// Event Listeners
function setupEventListeners() {
    // Close modals when clicking outside
    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    }
    
    // Setup form submissions
    const forms = {
        'addProductForm': saveProduct,
        'addCustomerForm': saveCustomer,
        'addCategoryForm': saveCategory,
        'storeSettingsForm': saveStoreSettings,
        'profileForm': updateProfile,
        'passwordForm': changePassword
    };
    
    Object.entries(forms).forEach(([id, handler]) => {
        const form = document.getElementById(id);
        if (form) {
            form.addEventListener('submit', handler);
        }
    });
}

// Placeholder functions for features not fully implemented
function editProduct(id) { showToast('Edit feature coming soon', 'warning'); }
function editCategory(id) { showToast('Edit feature coming soon', 'warning'); }
function deleteCategory(id) { 
    if (confirm('Delete this category?')) {
        categories = categories.filter(c => c.id !== id);
        localStorage.setItem('categories', JSON.stringify(categories));
        loadCategories();
        showToast('Category deleted', 'success');
    }
}
function viewCustomerDetails(id) { showToast('Customer details view coming soon', 'warning'); }
function viewReceipt(id) { showToast('Receipt view coming soon', 'warning'); }
function printReceipt(sale) { window.print(); }
function printReceiptById(id) { window.print(); }
function saveStoreSettings(e) { e.preventDefault(); showToast('Settings saved!', 'success'); }
function updateProfile(e) { e.preventDefault(); showToast('Profile updated!', 'success'); }
function changePassword(e) { e.preventDefault(); showToast('Password changed!', 'success'); }
function backupData() { showToast('Backup started...', 'success'); }
function restoreData() { showToast('Restore feature coming soon', 'warning'); }
function clearAllData() { 
    if (confirm('WARNING: This will delete all data! Continue?')) {
        localStorage.clear();
        showToast('All data cleared', 'success');
        setTimeout(() => location.reload(), 1000);
    }
}
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}
function exportHistory() { showToast('Export started...', 'success'); }
function exportReport() { showToast('PDF export coming soon', 'warning'); }
function upgradePlan(plan) { showToast(`Upgrading to ${plan}...`, 'success'); }
function downgradePlan(plan) { showToast('Contact support to downgrade', 'warning'); }
function downloadInvoice(id) { showToast('Downloading invoice...', 'success'); }
function renderSalesChart(data) { /* Chart.js implementation */ }
function renderCategoryChart(data) { /* Chart.js implementation */ }
function updateHistoryStats() { /* Calculate and display stats */ }
function updateCustomerStats() { /* Calculate and display stats */ }
function filterHistory() { renderHistoryTable(); }
function searchHistory() { renderHistoryTable(); }
function prevPage() { if (currentPage > 1) { currentPage--; renderHistoryTable(); } }
function nextPage() { if (currentPage < Math.ceil(sales.length / itemsPerPage)) { currentPage++; renderHistoryTable(); } }
function updatePagination() { /* Update pagination controls */ }
function toggleView(view) { /* Toggle between grid and list view */ }
function openAddProductModal() { openModal('addProductModal'); }
function openAddCustomerModal() { openModal('addCustomerModal'); }
function openAddCategoryModal() { openModal('addCategoryModal'); }
function changeAvatar() { showToast('Avatar change coming soon', 'warning'); }

// Check for saved dark mode
if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    const checkbox = document.getElementById('darkMode');
    if (checkbox) checkbox.checked = true;
}
 
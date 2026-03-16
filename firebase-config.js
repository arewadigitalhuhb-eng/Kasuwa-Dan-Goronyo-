/**
 * FIREBASE CONFIGURATION
 * Kasuwa Dan Goronyo - Cloud Database Integration
 */

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCVWEH9KGYWM-VfOpK1_RKP6ikwzalRKkM",
  authDomain: "kasuwa-dan-goronyo.firebaseapp.com",
  projectId: "kasuwa-dan-goronyo",
  storageBucket: "kasuwa-dan-goronyo.firebasestorage.app",
  messagingSenderId: "835427191014",
  appId: "1:835427191014:web:aa25b2b74cf720710e1327",
  measurementId: "G-BTC45ZK1Z1"
};

// Initialize Firebase
let app, database, auth, firestore;
let firebaseInitialized = false;

// Initialize Firebase when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeFirebase();
});

function initializeFirebase() {
    try {
        // Check if Firebase is loaded
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK not loaded. Loading from CDN...');
            loadFirebaseSDK().then(() => {
                initFirebaseApp();
            });
            return;
        }
        
        initFirebaseApp();
    } catch (error) {
        console.error('Firebase initialization error:', error);
        enableOfflineMode();
    }
}

// Load Firebase SDK dynamically
function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
        const scripts = [
            'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
            'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js',
            'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
            'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js'
        ];
        
        let loaded = 0;
        scripts.forEach(src => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                loaded++;
                if (loaded === scripts.length) resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    });
}

function initFirebaseApp() {
    try {
        // Initialize Firebase App
        app = firebase.initializeApp(firebaseConfig);
        
        // Initialize services
        database = firebase.database();
        auth = firebase.auth();
        firestore = firebase.firestore();
        
        firebaseInitialized = true;
        
        console.log('✅ Firebase initialized successfully');
        
        // Setup auth state listener
        setupAuthStateListener();
        
        // Enable offline persistence
        enableOfflinePersistence();
        
        // Sync local data to cloud
        syncLocalToCloud();
        
    } catch (error) {
        console.error('Firebase init error:', error);
        enableOfflineMode();
    }
}

// Enable offline persistence
function enableOfflinePersistence() {
    if (database) {
        database.goOnline();
        
        // Enable disk persistence for web
        try {
            firebase.database().enableLogging(false);
        } catch (e) {
            console.log('Database logging disabled');
        }
    }
    
    if (firestore) {
        firestore.enablePersistence({
            synchronizeTabs: true
        }).catch(err => {
            if (err.code == 'failed-precondition') {
                console.warn('Multiple tabs open, persistence enabled in first tab only');
            } else if (err.code == 'unimplemented') {
                console.warn('Browser does not support persistence');
            }
        });
    }
}

// Setup authentication state listener
function setupAuthStateListener() {
    if (!auth) return;
    
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log('🔐 User signed in:', user.email);
            
            // Update app state
            const userData = {
                userId: user.uid,
                email: user.email,
                fullName: user.displayName || user.email.split('@')[0],
                photoURL: user.photoURL,
                isEmailVerified: user.emailVerified,
                provider: user.providerData[0]?.providerId
            };
            
            // Merge with existing local user data
            const existingUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            AppState.currentUser = { ...existingUser, ...userData, firebaseUser: true };
            localStorage.setItem('currentUser', JSON.stringify(AppState.currentUser));
            
            // Start real-time sync
            startRealtimeSync(user.uid);
            
            // Update UI
            updateUserInterface();
            
        } else {
            console.log('🔓 User signed out');
            
            // Check if we have local session
            const localUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            if (localUser.userId && !localUser.firebaseUser) {
                // Local session exists, keep it
                console.log('Using local session');
            } else {
                // Clear session
                clearSession();
                if (!window.location.href.includes('login.html')) {
                    redirectToLogin('Session ended. Please login again.');
                }
            }
        }
    });
}

// Start real-time database sync
function startRealtimeSync(userId) {
    if (!database) return;
    
    const userRef = database.ref(`users/${userId}`);
    
    // Listen for data changes
    userRef.on('value', snapshot => {
        const cloudData = snapshot.val();
        if (cloudData) {
            console.log('☁️ Cloud data updated');
            mergeCloudData(cloudData);
        }
    }, error => {
        console.error('Sync error:', error);
    });
    
    // Sync local changes to cloud
    setupLocalToCloudSync(userId);
}

// Merge cloud data with local data
function mergeCloudData(cloudData) {
    const lastSync = localStorage.getItem('lastCloudSync');
    const cloudLastUpdate = cloudData.lastUpdated || 0;
    const localLastUpdate = parseInt(lastSync) || 0;
    
    // Use whichever is newer
    if (cloudLastUpdate > localLastUpdate) {
        console.log('📥 Downloading cloud data...');
        
        // Update local storage with cloud data
        if (cloudData.products) Data.products = cloudData.products;
        if (cloudData.sales) Data.sales = cloudData.sales;
        if (cloudData.customers) Data.customers = cloudData.customers;
        if (cloudData.categories) Data.categories = cloudData.categories;
        if (cloudData.settings) Data.settings = cloudData.settings;
        
        localStorage.setItem('lastCloudSync', cloudLastUpdate.toString());
        
        // Refresh current page
        refreshCurrentPage();
        
        showToast('Data synced from cloud', 'success');
    }
}

// Sync local changes to cloud
function setupLocalToCloudSync(userId) {
    // Watch for local storage changes
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);
        
        // Check if it's a data key
        if (key.startsWith('products_') || key.startsWith('sales_') || 
            key.startsWith('customers_') || key.startsWith('categories_') ||
            key.startsWith('settings_')) {
            
            debouncedCloudSync(userId);
        }
    };
}

// Debounced sync to prevent too many writes
let syncTimeout;
function debouncedCloudSync(userId) {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        syncToCloud(userId);
    }, 3000); // Sync after 3 seconds of inactivity
}

// Sync local data to cloud
async function syncToCloud(userId) {
    if (!database || !navigator.onLine) return;
    
    try {
        const userRef = database.ref(`users/${userId}`);
        
        const syncData = {
            products: Data.products,
            sales: Data.sales,
            customers: Data.customers,
            categories: Data.categories,
            settings: Data.settings,
            lastUpdated: Date.now(),
            deviceInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                lastSync: new Date().toISOString()
            }
        };
        
        await userRef.set(syncData);
        
        localStorage.setItem('lastCloudSync', Date.now().toString());
        console.log('📤 Synced to cloud');
        
        // Update sync indicator
        updateSyncStatus('synced');
        
    } catch (error) {
        console.error('Cloud sync failed:', error);
        updateSyncStatus('error');
    }
}

// Manual sync trigger
function forceSync() {
    if (!AppState.currentUser?.userId) {
        showToast('Please login to sync', 'warning');
        return;
    }
    
    if (!navigator.onLine) {
        showToast('You are offline. Sync will happen when online.', 'warning');
        return;
    }
    
    showToast('Syncing...', 'info');
    syncToCloud(AppState.currentUser.userId).then(() => {
        showToast('Sync completed!', 'success');
    }).catch(err => {
        showToast('Sync failed: ' + err.message, 'error');
    });
}

// Sync status indicator
function updateSyncStatus(status) {
    const indicator = document.getElementById('syncStatus');
    if (!indicator) return;
    
    const icons = {
        synced: '<i class="fas fa-check-circle"></i> Synced',
        syncing: '<i class="fas fa-sync fa-spin"></i> Syncing...',
        error: '<i class="fas fa-exclamation-circle"></i> Sync failed',
        offline: '<i class="fas fa-wifi-slash"></i> Offline'
    };
    
    indicator.innerHTML = icons[status] || icons.synced;
    indicator.className = `sync-status ${status}`;
}

// ==================== FIREBASE AUTH FUNCTIONS ====================

// Sign up with email/password
async function firebaseSignup(email, password, userData) {
    if (!auth) {
        showToast('Firebase not available', 'error');
        return false;
    }
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update profile
        await user.updateProfile({
            displayName: userData.fullName,
            photoURL: userData.photoURL || null
        });
        
        // Save additional user data to database
        await database.ref(`users/${user.uid}/profile`).set({
            ...userData,
            email: email,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            plan: 'free'
        });
        
        console.log('✅ Firebase signup successful');
        return true;
        
    } catch (error) {
        console.error('Firebase signup error:', error);
        showToast(getAuthErrorMessage(error.code), 'error');
        return false;
    }
}

// Login with email/password
async function firebaseLogin(email, password) {
    if (!auth) {
        // Fallback to local auth
        return handleLocalLogin(email, password);
    }
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        console.log('✅ Firebase login successful');
        return true;
        
    } catch (error) {
        console.error('Firebase login error:', error);
        
        // If user not found in Firebase, try local
        if (error.code === 'auth/user-not-found') {
            return handleLocalLogin(email, password);
        }
        
        showToast(getAuthErrorMessage(error.code), 'error');
        return false;
    }
}

// Google Sign In
async function googleSignIn() {
    if (!auth) {
        showToast('Firebase not available', 'error');
        return;
    }
    
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // Check if new user
        const userRef = database.ref(`users/${user.uid}`);
        const snapshot = await userRef.once('value');
        
        if (!snapshot.exists()) {
            // New user - create profile
            await userRef.child('profile').set({
                fullName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                plan: 'free',
                provider: 'google'
            });
            
            // Initialize default data
            initializeDefaultData(user.uid);
        }
        
        console.log('✅ Google sign in successful');
        return true;
        
    } catch (error) {
        console.error('Google sign in error:', error);
        showToast(getAuthErrorMessage(error.code), 'error');
        return false;
    }
}

// Logout
async function firebaseLogout() {
    if (auth) {
        await auth.signOut();
    }
    clearSession();
}

// Error message helper
function getAuthErrorMessage(code) {
    const messages = {
        'auth/invalid-email': 'Invalid email address',
        'auth/user-disabled': 'Account has been disabled',
        'auth/user-not-found': 'Account not found',
        'auth/wrong-password': 'Incorrect password',
        'auth/email-already-in-use': 'Email already registered',
        'auth/weak-password': 'Password should be at least 6 characters',
        'auth/invalid-credential': 'Invalid login credentials',
        'auth/network-request-failed': 'Network error. Check your connection',
        'auth/popup-closed-by-user': 'Sign in cancelled',
        'auth/cancelled-popup-request': 'Multiple popups opened'
    };
    return messages[code] || 'Authentication failed. Please try again.';
}

// ==================== OFFLINE MODE ====================

function enableOfflineMode() {
    console.log('📴 Running in offline mode');
    AppState.offlineMode = true;
    
    // Show offline indicator
    const indicator = document.getElementById('syncStatus');
    if (indicator) {
        indicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline Mode';
        indicator.className = 'sync-status offline';
    }
    
    // Setup periodic local backup
    setupLocalBackup();
}

function setupLocalBackup() {
    // Create backup every hour
    setInterval(() => {
        createLocalBackup();
    }, 3600000);
}

function createLocalBackup() {
    const backup = {
        timestamp: Date.now(),
        userId: AppState.currentUser?.userId || 'anonymous',
        data: {
            products: Data.products,
            sales: Data.sales,
            customers: Data.customers,
            categories: Data.categories,
            settings: Data.settings
        }
    };
    
    const backups = JSON.parse(localStorage.getItem('localBackups') || '[]');
    backups.push(backup);
    
    // Keep only last 10 backups
    if (backups.length > 10) backups.shift();
    
    localStorage.setItem('localBackups', JSON.stringify(backups));
    console.log('💾 Local backup created');
}

function restoreFromBackup(timestamp) {
    const backups = JSON.parse(localStorage.getItem('localBackups') || '[]');
    const backup = backups.find(b => b.timestamp === timestamp);
    
    if (!backup) {
        showToast('Backup not found', 'error');
        return;
    }
    
    if (confirm('Restore data from backup? This will replace current data.')) {
        Data.products = backup.data.products;
        Data.sales = backup.data.sales;
        Data.customers = backup.data.customers;
        Data.categories = backup.data.categories;
        Data.settings = backup.data.settings;
        
        showToast('Backup restored successfully', 'success');
        refreshCurrentPage();
    }
}

// ==================== UTILITY FUNCTIONS ====================

function syncLocalToCloud() {
    // Initial sync when Firebase is ready
    if (firebaseInitialized && AppState.currentUser?.userId) {
        syncToCloud(AppState.currentUser.userId);
    }
}

function refreshCurrentPage() {
    const page = getCurrentPage();
    switch(page) {
        case 'index':
            loadDashboard();
            break;
        case 'stocks':
            loadStocksPage();
            break;
        case 'customers':
            loadCustomersPage();
            break;
        case 'history':
            loadHistoryPage();
            break;
    }
}

// Network status monitoring
window.addEventListener('online', () => {
    console.log('🌐 Back online');
    updateSyncStatus('synced');
    if (AppState.currentUser?.userId) {
        syncToCloud(AppState.currentUser.userId);
    }
});

window.addEventListener('offline', () => {
    console.log('📴 Gone offline');
    updateSyncStatus('offline');
});

// Export for global access
window.FirebaseDB = {
    isInitialized: () => firebaseInitialized,
    forceSync: forceSync,
    restoreFromBackup: restoreFromBackup,
    getBackups: () => JSON.parse(localStorage.getItem('localBackups') || '[]')
};

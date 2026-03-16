// ==================== UPDATED AUTH FUNCTIONS ====================

async function handleSignup(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const shopName = document.getElementById('shopName').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validation
    if (password !== confirmPassword) {
        showAuthToast('Passwords do not match!', 'error');
        return;
    }
    
    showLoading(true);
    
    // Try Firebase first
    if (typeof firebase !== 'undefined') {
        const firebaseSuccess = await firebaseSignup(email, password, {
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            shopName,
            phone
        });
        
        if (firebaseSuccess) {
            showLoading(false);
            showAuthToast('Account created! Welcome to the cloud.', 'success');
            setTimeout(() => goPage('index'), 1500);
            return;
        }
    }
    
    // Fallback to local auth
    const users = JSON.parse(localStorage.getItem('users')) || [];
    if (users.find(u => u.email === email)) {
        showLoading(false);
        showAuthToast('Email already registered', 'error');
        return;
    }
    
    const newUser = {
        id: 'local_' + Date.now(),
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        shopName,
        email,
        phone,
        password: hashPassword(password),
        createdAt: new Date().toISOString(),
        plan: 'free',
        isLocal: true
    };
    
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    
    // Create session
    createSession(newUser);
    initializeShopData(newUser.id);
    
    showLoading(false);
    showAuthToast('Account created! (Local mode)', 'success');
    setTimeout(() => goPage('index'), 1500);
}

async function handleLogin(e) {
    e.preventDefault();
    
    const loginInput = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    showLoading(true);
    
    // Try Firebase first
    if (typeof firebase !== 'undefined' && loginInput.includes('@')) {
        const firebaseSuccess = await firebaseLogin(loginInput, password);
        if (firebaseSuccess) {
            showLoading(false);
            showAuthToast('Welcome back!', 'success');
            setTimeout(() => goPage('index'), 1000);
            return;
        }
    }
    
    // Fallback to local auth
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const user = users.find(u => 
        u.email === loginInput || u.phone === loginInput
    );
    
    if (!user || user.password !== hashPassword(password)) {
        showLoading(false);
        showAuthToast('Invalid credentials', 'error');
        return;
    }
    
    createSession(user, rememberMe);
    showLoading(false);
    showAuthToast(`Welcome back, ${user.firstName}!`, 'success');
    setTimeout(() => goPage('index'), 1000);
}

// Social login handlers
async function socialSignup(provider) {
    showLoading(true);
    
    if (provider === 'google' && typeof firebase !== 'undefined') {
        const success = await googleSignIn();
        showLoading(false);
        if (success) {
            showAuthToast('Welcome! Your data will sync across devices.', 'success');
            setTimeout(() => goPage('index'), 1500);
        }
    } else {
        showLoading(false);
        showAuthToast(`${provider} login coming soon`, 'warning');
    }
}

async function socialLogin(provider) {
    showLoading(true);
    
    if (provider === 'google' && typeof firebase !== 'undefined') {
        const success = await googleSignIn();
        showLoading(false);
        if (success) {
            setTimeout(() => goPage('index'), 1000);
        }
    } else {
        showLoading(false);
        showAuthToast(`${provider} login not available in offline mode`, 'warning');
    }
}

// history.js

let allSales = [];
let uid, db;

document.addEventListener('DOMContentLoaded', () => {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            uid = user.uid;
            db = firebase.database();
            await loadSales();
            displayCurrentDate();
        } else {
            window.location.href = 'login.html';
        }
    });
});

async function loadSales() {
    const salesRef = db.ref(`users/${uid}/sales`);
    try {
        const snap = await salesRef.once('value');
        allSales = [];
        snap.forEach(child => {
            allSales.push({ id: child.key, ...child.val() });
        });
        renderTable(allSales);
    } catch (error) {
        console.error('Error loading sales:', error);
    }
}

function renderTable(sales) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';
    sales.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    sales.forEach(sale => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${sale.date || ''} ${new Date(sale.timestamp).toLocaleTimeString()}</td>
            <td>${sale.productName || ''}</td>
            <td>${sale.quantity || 0}</td>
            <td>${formatCurrency(sale.unitPrice || 0)}</td>
            <td>${formatCurrency(sale.total || 0)}</td>
            <td>${sale.paymentMethod || 'cash'}</td>
            <td>${sale.customerId ? 'Walk-in' : 'Walk-in'}</td>
        `;
    });
}

// Filter by date
window.filterHistory = () => {
    const filterDate = document.getElementById('dateFilter').value;
    if (!filterDate) {
        renderTable(allSales);
        return;
    }
    const filtered = allSales.filter(s => s.date === filterDate);
    renderTable(filtered);
};

window.resetFilter = () => {
    document.getElementById('dateFilter').value = '';
    renderTable(allSales);
};

function formatCurrency(amount) {
    return '₦' + parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}
function displayCurrentDate() {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString(undefined, options);
}
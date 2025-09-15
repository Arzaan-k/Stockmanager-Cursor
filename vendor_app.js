// Vendor Management Application
let vendorData = null;
let filteredVendors = [];
let currentView = 'grid';

// Load vendor data when page loads
document.addEventListener('DOMContentLoaded', async function() {
    await loadVendorData();
    initializeEventListeners();
    updateStatistics();
    populateFilters();
    displayVendors();
    displayCategories('all');
    setupSmoothScroll();
});

// Load vendor data from JSON file
async function loadVendorData() {
    try {
        const response = await fetch('vendor_data.json');
        vendorData = await response.json();
        filteredVendors = [...vendorData.vendors];
        console.log('Vendor data loaded successfully');
    } catch (error) {
        console.error('Error loading vendor data:', error);
        showErrorMessage('Failed to load vendor data. Please refresh the page.');
    }
}

// Initialize all event listeners
function initializeEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('vendor-search');
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    
    // Filter functionality
    document.getElementById('category-filter').addEventListener('change', applyFilters);
    document.getElementById('status-filter').addEventListener('change', applyFilters);
    document.getElementById('city-filter').addEventListener('change', applyFilters);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    
    // Category tabs
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            displayCategories(this.dataset.category);
        });
    });
    
    // View controls
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentView = this.dataset.view;
            displayVendors();
        });
    });
    
    // Product search
    document.getElementById('search-product-btn').addEventListener('click', searchProducts);
    document.getElementById('product-search').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchProducts();
    });
    
    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('vendor-modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
}

// Update dashboard statistics
function updateStatistics() {
    if (!vendorData) return;
    
    document.getElementById('total-vendors').textContent = vendorData.statistics.totalVendors;
    document.getElementById('active-vendors').textContent = vendorData.statistics.activeVendors;
    document.getElementById('total-products').textContent = vendorData.statistics.uniqueProducts;
    document.getElementById('total-categories').textContent = vendorData.statistics.subcategories;
    document.getElementById('total-cities').textContent = vendorData.statistics.cities;
}

// Populate filter dropdowns
function populateFilters() {
    if (!vendorData) return;
    
    // Category filter
    const categoryFilter = document.getElementById('category-filter');
    const categories = [...new Set(vendorData.vendors.map(v => v.subcategory))].sort();
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
    
    // City filter
    const cityFilter = document.getElementById('city-filter');
    const cities = [...new Set(vendorData.vendors.map(v => v.city))].sort();
    cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        cityFilter.appendChild(option);
    });
}

// Handle search
function handleSearch() {
    const searchTerm = document.getElementById('vendor-search').value.toLowerCase();
    
    if (!searchTerm) {
        filteredVendors = [...vendorData.vendors];
    } else {
        filteredVendors = vendorData.vendors.filter(vendor => 
            vendor.name.toLowerCase().includes(searchTerm) ||
            vendor.productType.toLowerCase().includes(searchTerm) ||
            vendor.location.toLowerCase().includes(searchTerm) ||
            vendor.city.toLowerCase().includes(searchTerm) ||
            vendor.subcategory.toLowerCase().includes(searchTerm)
        );
    }
    
    applyFilters();
}

// Apply all filters
function applyFilters() {
    let filtered = [...filteredVendors];
    
    const categoryFilter = document.getElementById('category-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const cityFilter = document.getElementById('city-filter').value;
    
    if (categoryFilter) {
        filtered = filtered.filter(v => v.subcategory === categoryFilter);
    }
    
    if (statusFilter) {
        filtered = filtered.filter(v => v.status === statusFilter);
    }
    
    if (cityFilter) {
        filtered = filtered.filter(v => v.city === cityFilter);
    }
    
    displayFilteredVendors(filtered);
}

// Clear all filters
function clearFilters() {
    document.getElementById('vendor-search').value = '';
    document.getElementById('category-filter').value = '';
    document.getElementById('status-filter').value = '';
    document.getElementById('city-filter').value = '';
    
    filteredVendors = [...vendorData.vendors];
    displayVendors();
}

// Display vendors in grid or list view
function displayVendors() {
    displayFilteredVendors(filteredVendors);
}

function displayFilteredVendors(vendors) {
    const vendorsGrid = document.getElementById('vendors-grid');
    vendorsGrid.className = currentView === 'list' ? 'vendors-grid list-view' : 'vendors-grid';
    
    if (vendors.length === 0) {
        vendorsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No vendors found matching your criteria</p>
            </div>
        `;
        return;
    }
    
    vendorsGrid.innerHTML = vendors.map(vendor => createVendorCard(vendor)).join('');
    
    // Add click listeners to vendor cards
    document.querySelectorAll('.vendor-card').forEach(card => {
        card.addEventListener('click', function() {
            const vendorId = this.dataset.vendorId;
            const vendor = vendorData.vendors.find(v => v.id === vendorId);
            if (vendor) showVendorProfile(vendor);
        });
    });
}

// Create vendor card HTML
function createVendorCard(vendor) {
    const statusClass = vendor.status === 'Active' ? 'status-active' : 
                       vendor.status === 'Inactive' ? 'status-inactive' : 'status-unknown';
    
    return `
        <div class="vendor-card" data-vendor-id="${vendor.id}">
            <div class="vendor-card-header">
                <div>
                    <div class="vendor-name">${vendor.name}</div>
                    <div class="vendor-category">${vendor.subcategory}</div>
                </div>
                <span class="status-badge ${statusClass}">${vendor.status}</span>
            </div>
            <div class="vendor-card-body">
                <div class="vendor-info">
                    <i class="fas fa-box"></i>
                    <span>${vendor.productType}</span>
                </div>
                <div class="vendor-info">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${vendor.city}, ${vendor.state}</span>
                </div>
                <div class="vendor-info">
                    <i class="fas fa-phone"></i>
                    <span>${vendor.contact}</span>
                </div>
            </div>
            <div class="vendor-card-footer">
                <span class="view-profile-btn">View Full Profile →</span>
                <span style="color: #999; font-size: 0.85rem;">${vendor.zone} Zone</span>
            </div>
        </div>
    `;
}

// Display categories section
function displayCategories(category) {
    const categoryContent = document.getElementById('category-content');
    
    if (!vendorData || !vendorData.vendorsByCategory) {
        categoryContent.innerHTML = '<div class="loading">Loading categories...</div>';
        return;
    }
    
    let content = '';
    
    if (category === 'all') {
        // Show all categories
        Object.keys(vendorData.vendorsByCategory).forEach(mainCat => {
            content += `<h3 style="color: #764ba2; margin: 2rem 0 1rem; font-size: 1.5rem;">${mainCat}</h3>`;
            content += createSubcategoryContent(vendorData.vendorsByCategory[mainCat]);
        });
    } else {
        // Show specific category
        if (vendorData.vendorsByCategory[category]) {
            content = createSubcategoryContent(vendorData.vendorsByCategory[category]);
        } else {
            content = '<div class="empty-state"><p>No vendors found in this category</p></div>';
        }
    }
    
    categoryContent.innerHTML = content;
    
    // Add click listeners to vendor items in categories
    document.querySelectorAll('.subcategory-vendor-item').forEach(item => {
        item.addEventListener('click', function() {
            const vendorId = this.dataset.vendorId;
            const vendor = vendorData.vendors.find(v => v.id === vendorId);
            if (vendor) showVendorProfile(vendor);
        });
    });
}

// Create subcategory content
function createSubcategoryContent(subcategories) {
    let content = '';
    
    Object.keys(subcategories).sort().forEach(subcat => {
        const vendors = subcategories[subcat];
        content += `
            <div class="subcategory-section">
                <h4 class="subcategory-title">
                    ${subcat} 
                    <span style="font-weight: normal; color: #999; font-size: 0.9rem;">
                        (${vendors.length} vendor${vendors.length !== 1 ? 's' : ''})
                    </span>
                </h4>
                <div class="subcategory-vendors">
        `;
        
        vendors.forEach(vendor => {
            const statusClass = vendor.status === 'Active' ? 'status-active' : 
                               vendor.status === 'Inactive' ? 'status-inactive' : 'status-unknown';
            
            content += `
                <div class="subcategory-vendor-item vendor-card" data-vendor-id="${vendor.id}" 
                     style="cursor: pointer; padding: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <div style="font-weight: 600; color: #333;">${vendor.name}</div>
                            <div style="color: #666; font-size: 0.85rem; margin-top: 0.25rem;">
                                ${vendor.productType}
                            </div>
                            <div style="color: #999; font-size: 0.85rem; margin-top: 0.5rem;">
                                <i class="fas fa-map-marker-alt"></i> ${vendor.city}
                            </div>
                        </div>
                        <span class="status-badge ${statusClass}" style="font-size: 0.7rem;">
                            ${vendor.status}
                        </span>
                    </div>
                </div>
            `;
        });
        
        content += '</div></div>';
    });
    
    return content;
}

// Search products
function searchProducts() {
    const searchTerm = document.getElementById('product-search').value.toLowerCase();
    const productMapping = document.getElementById('product-mapping');
    
    if (!searchTerm) {
        productMapping.innerHTML = '<div class="empty-state"><p>Enter a product name to search</p></div>';
        return;
    }
    
    if (!vendorData || !vendorData.productVendorMapping) {
        productMapping.innerHTML = '<div class="loading">Loading product data...</div>';
        return;
    }
    
    // Find matching products
    const matchingProducts = Object.keys(vendorData.productVendorMapping)
        .filter(product => product.toLowerCase().includes(searchTerm));
    
    if (matchingProducts.length === 0) {
        productMapping.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No products found matching "${searchTerm}"</p>
            </div>
        `;
        return;
    }
    
    // Display matching products and their vendors
    let content = '';
    matchingProducts.forEach(product => {
        const vendors = vendorData.productVendorMapping[product];
        const activeVendors = vendors.filter(v => v.status === 'Active').length;
        
        content += `
            <div class="product-group">
                <h3 class="product-title">
                    ${product}
                    <span class="vendor-count">${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}</span>
                    ${activeVendors > 0 ? `<span style="color: #28a745; font-size: 0.9rem;">${activeVendors} active</span>` : ''}
                </h3>
                <div class="product-vendors">
        `;
        
        vendors.forEach(vendor => {
            const statusClass = vendor.status === 'Active' ? 'status-active' : 
                               vendor.status === 'Inactive' ? 'status-inactive' : 'status-unknown';
            
            content += `
                <div class="product-vendor-card" onclick="showVendorById('${vendor.vendorId}')">
                    <div class="product-vendor-name">${vendor.vendorName}</div>
                    <div class="product-vendor-info">
                        <i class="fas fa-tag"></i> Code: ${vendor.productCode}
                    </div>
                    <div class="product-vendor-info">
                        <i class="fas fa-folder"></i> ${vendor.subcategory}
                    </div>
                    <div class="product-vendor-info">
                        <i class="fas fa-map-marker-alt"></i> ${vendor.location}
                    </div>
                    <div style="margin-top: 0.5rem;">
                        <span class="status-badge ${statusClass}">${vendor.status}</span>
                    </div>
                </div>
            `;
        });
        
        content += '</div></div>';
    });
    
    productMapping.innerHTML = content;
}

// Show vendor profile modal
function showVendorProfile(vendor) {
    const modal = document.getElementById('vendor-modal');
    
    // Update modal content
    document.getElementById('modal-vendor-name').textContent = vendor.name;
    document.getElementById('profile-name').textContent = vendor.name;
    document.getElementById('profile-status').textContent = vendor.status;
    document.getElementById('profile-status').className = `status-badge ${
        vendor.status === 'Active' ? 'status-active' : 
        vendor.status === 'Inactive' ? 'status-inactive' : 'status-unknown'
    }`;
    
    document.getElementById('profile-contact').textContent = vendor.contact;
    document.getElementById('profile-location').textContent = vendor.location;
    document.getElementById('profile-city').textContent = vendor.city;
    document.getElementById('profile-state').textContent = vendor.state;
    document.getElementById('profile-zone').textContent = vendor.zone;
    
    document.getElementById('profile-category').textContent = vendor.mainCategory;
    document.getElementById('profile-subcategory').textContent = vendor.subcategory;
    document.getElementById('profile-product-type').textContent = vendor.productType;
    document.getElementById('profile-product-code').textContent = vendor.productCode;
    document.getElementById('profile-other-products').textContent = vendor.otherProducts;
    
    // Show modal
    modal.classList.add('active');
}

// Show vendor by ID
function showVendorById(vendorId) {
    const vendor = vendorData.vendors.find(v => v.id === vendorId);
    if (vendor) showVendorProfile(vendor);
}

// Close modal
function closeModal() {
    document.getElementById('vendor-modal').classList.remove('active');
}

// Smooth scroll for navigation
function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
                // Update active nav link
                document.querySelectorAll('.nav-link').forEach(link => {
                    link.classList.remove('active');
                });
                this.classList.add('active');
            }
        });
    });
}

// Utility function: Debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Show error message
function showErrorMessage(message) {
    console.error(message);
    // Could implement a toast notification here
}

// Export functions for global access
window.showVendorById = showVendorById;
window.showVendorProfile = showVendorProfile;

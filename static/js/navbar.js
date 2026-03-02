document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu');
    const navbarMenu = document.getElementById('navbar-menu');
    
    if (mobileMenuBtn && navbarMenu) {
        mobileMenuBtn.addEventListener('click', function() {
            this.classList.toggle('active');
            navbarMenu.classList.toggle('active');
            
            if (navbarMenu.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });
    }
    
    // Dropdown functionality for mobile
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
                e.preventDefault();
                const dropdown = this.closest('.dropdown');
                dropdown.classList.toggle('active');
            }
        });
    });
    
    // Close menu when clicking on a link (for mobile)
    const navLinks = document.querySelectorAll('.nav-link:not(.dropdown-toggle)');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768 && mobileMenuBtn && navbarMenu) {
                mobileMenuBtn.classList.remove('active');
                navbarMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
    
    // Set current year in footer
    const currentYearEl = document.getElementById('current-year');
    if (currentYearEl) {
        currentYearEl.textContent = new Date().getFullYear();
    }
    
    // Navbar scroll effect
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;
        if (window.scrollY > 50) {
            navbar.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
            navbar.style.height = '60px';
        } else {
            navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            navbar.style.height = '70px';
        }
    });
    
    // Desktop dropdown hover effect
    if (window.innerWidth > 768) {
        document.querySelectorAll('.dropdown').forEach(dropdown => {
            dropdown.addEventListener('mouseenter', function() {
                this.querySelector('.dropdown-menu').style.opacity = '1';
                this.querySelector('.dropdown-menu').style.visibility = 'visible';
                this.querySelector('.dropdown-menu').style.transform = 'translateY(0)';
            });
            
            dropdown.addEventListener('mouseleave', function() {
                this.querySelector('.dropdown-menu').style.opacity = '0';
                this.querySelector('.dropdown-menu').style.visibility = 'hidden';
                this.querySelector('.dropdown-menu').style.transform = 'translateY(10px)';
            });
        });
    }
    
    // Highlight active link based on current URL
    function highlightActiveLink() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.nav-link, .dropdown-link');
        
        navLinks.forEach(link => {
            const linkPath = link.getAttribute('href');
            
            // Check if the link matches the current path
            if (linkPath === currentPath) {
                link.classList.add('active');
                
                // If it's a dropdown item, also highlight its parent
                if (link.classList.contains('dropdown-link')) {
                    const dropdown = link.closest('.dropdown');
                    if (dropdown) {
                        dropdown.querySelector('.dropdown-toggle').classList.add('active');
                    }
                }
            }
        });
    }
    
    highlightActiveLink();
});




// Toggle mobile menu
document.addEventListener('DOMContentLoaded', function () {
    const mobileMenu = document.getElementById('mobile-menu');
    const navbarMenu = document.getElementById('navbar-menu');

    if (mobileMenu && navbarMenu) {
        mobileMenu.addEventListener('click', function () {
            navbarMenu.classList.toggle('active');
            mobileMenu.classList.toggle('active');
        });
    }

    // Logout button (si existe)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            try {
                const resp = await fetch('/iniciar-sesion/api/logout', {
                    method: 'POST',
                    credentials: 'same-origin', // importante para enviar cookies
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (resp.ok) {
                    // Redirigir al login
                    window.location.href = '/iniciar-sesion/';
                } else {
                    // si algo falla, intentar la ruta GET de logout
                    window.location.href = '/iniciar-sesion/logout';
                }
            } catch (err) {
                // fallback
                window.location.href = '/iniciar-sesion/logout';
            }
        });
    }
});

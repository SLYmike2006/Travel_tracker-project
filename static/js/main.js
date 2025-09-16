document.addEventListener('DOMContentLoaded', function() {
    // --- THEME LOGIC ---
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    function setTheme(theme) {
        body.className = theme === 'dark' ? 'dark-mode' : '';
        localStorage.setItem('travel-tracker-theme', theme);
    }

    themeToggle.addEventListener('click', () => {
        const currentTheme = localStorage.getItem('travel-tracker-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });

    const savedTheme = localStorage.getItem('travel-tracker-theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
    }

    // --- STATS DASHBOARD LOGIC ---
    window.fetchAndDisplayStats = function() {
        const statsDashboard = document.getElementById('stats-dashboard');
        if (!statsDashboard) return; // Don't run if the dashboard isn't on the page

        fetch('/api/stats')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok for stats');
                }
                return response.json();
            })
            .then(data => {
                document.getElementById('total-trips').textContent = data.total_trips;
                document.getElementById('unique-countries').textContent = data.unique_countries;
                document.getElementById('unique-continents').textContent = data.unique_continents;
            })
            .catch(error => {
                console.error('Error fetching stats:', error);
                statsDashboard.innerHTML = '<p>Could not load travel stats.</p>';
            });
    }

    fetchAndDisplayStats();
});

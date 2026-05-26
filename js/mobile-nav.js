document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('mobile-menu-btn');
    const panel = document.getElementById('mobile-menu');
    if (!btn || !panel) return;

    const iconMenu = btn.querySelector('[data-icon="menu"]');
    const iconClose = btn.querySelector('[data-icon="close"]');

    function setOpen(open) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.classList.toggle('open', open);
        panel.hidden = !open;
        if (iconMenu) iconMenu.classList.toggle('hidden', open);
        if (iconClose) iconClose.classList.toggle('hidden', !open);
    }

    btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));

    panel.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });
});

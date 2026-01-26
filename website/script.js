/**
 * Ralph UI Landing Page
 * Interactive functionality
 */

document.addEventListener('DOMContentLoaded', () => {
  // Copy to clipboard functionality
  initCopyButtons();

  // Smooth scroll for anchor links
  initSmoothScroll();

  // Showcase tabs
  initShowcaseTabs();

  // Intersection observer for scroll animations
  initScrollAnimations();
});

/**
 * Initialize copy-to-clipboard buttons
 */
function initCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn');

  copyButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const textToCopy = btn.dataset.copy;

      try {
        await navigator.clipboard.writeText(textToCopy);

        // Show success state
        btn.classList.add('copied');

        // Reset after 2 seconds
        setTimeout(() => {
          btn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
          document.execCommand('copy');
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 2000);
        } catch (e) {
          console.error('Failed to copy:', e);
        }

        document.body.removeChild(textarea);
      }
    });
  });
}

/**
 * Initialize showcase tabs
 */
function initShowcaseTabs() {
  const tabs = document.querySelectorAll('.showcase-tab');
  const panels = document.querySelectorAll('.showcase-panel');

  if (!tabs.length || !panels.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetPanel = tab.dataset.tab;

      // Update active tab
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active panel
      panels.forEach((panel) => {
        if (panel.dataset.panel === targetPanel) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });
}

/**
 * Initialize smooth scrolling for anchor links
 */
function initSmoothScroll() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');

      // Skip if it's just "#"
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();

        const navHeight = document.querySelector('.nav').offsetHeight;
        const targetPosition = target.offsetTop - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth',
        });

        // Update URL without scrolling
        history.pushState(null, null, href);
      }
    });
  });
}

/**
 * Initialize scroll-triggered animations using Intersection Observer
 */
function initScrollAnimations() {
  // Check if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.1,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe sections for scroll animations
  const sections = document.querySelectorAll('.features, .quickstart');
  sections.forEach((section) => observer.observe(section));
}

/**
 * Add visible class styling (if needed beyond CSS animations)
 */
const style = document.createElement('style');
style.textContent = `
  @media (prefers-reduced-motion: no-preference) {
    .features,
    .quickstart {
      opacity: 1;
      transition: opacity 0.6s ease;
    }
  }
`;
document.head.appendChild(style);

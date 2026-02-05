/**
 * Kids Affiliate Site - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', function() {
  // Mobile Menu Toggle
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const navMenu = document.querySelector('.nav-menu');

  if (mobileMenuBtn && navMenu) {
    mobileMenuBtn.addEventListener('click', function() {
      navMenu.classList.toggle('active');

      // Animate hamburger icon
      const spans = this.querySelectorAll('span');
      spans.forEach((span, index) => {
        span.style.transform = navMenu.classList.contains('active')
          ? index === 1
            ? 'scaleX(0)'
            : index === 0
              ? 'rotate(45deg) translate(5px, 5px)'
              : 'rotate(-45deg) translate(5px, -5px)'
          : '';
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
      if (!mobileMenuBtn.contains(e.target) && !navMenu.contains(e.target)) {
        navMenu.classList.remove('active');
        const spans = mobileMenuBtn.querySelectorAll('span');
        spans.forEach(span => span.style.transform = '');
      }
    });
  }

  // Header scroll effect
  const header = document.querySelector('.header');
  let lastScroll = 0;

  window.addEventListener('scroll', function() {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
      header.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
    } else {
      header.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
    }

    lastScroll = currentScroll;
  });

  // Category filter
  const categoryTags = document.querySelectorAll('.category-tag');
  const productCards = document.querySelectorAll('.product-card');

  categoryTags.forEach(tag => {
    tag.addEventListener('click', function() {
      // Update active state
      categoryTags.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      const category = this.dataset.category;

      // Filter products
      productCards.forEach(card => {
        if (category === 'all' || card.dataset.category === category) {
          card.style.display = '';
          card.style.animation = 'fadeIn 0.3s ease';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // Search functionality
  const searchInput = document.querySelector('.search-input');
  const searchBtn = document.querySelector('.search-btn');

  function performSearch() {
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase().trim();

    productCards.forEach(card => {
      const title = card.querySelector('.product-title')?.textContent.toLowerCase() || '';
      const excerpt = card.querySelector('.product-excerpt')?.textContent.toLowerCase() || '';

      if (title.includes(query) || excerpt.includes(query) || query === '') {
        card.style.display = '';
        card.style.animation = 'fadeIn 0.3s ease';
      } else {
        card.style.display = 'none';
      }
    });

    // Reset category filter
    categoryTags.forEach(t => t.classList.remove('active'));
    const allTag = document.querySelector('.category-tag[data-category="all"]');
    if (allTag) allTag.classList.add('active');
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', performSearch);
  }

  if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Lazy load images
  const lazyImages = document.querySelectorAll('img[data-src]');

  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      });
    });

    lazyImages.forEach(img => imageObserver.observe(img));
  } else {
    // Fallback for older browsers
    lazyImages.forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  }

  // Animate elements on scroll
  const animateOnScroll = document.querySelectorAll('.animate-on-scroll');

  if ('IntersectionObserver' in window && animateOnScroll.length > 0) {
    const animationObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
        }
      });
    }, { threshold: 0.1 });

    animateOnScroll.forEach(el => animationObserver.observe(el));
  }


  // Generate star rating HTML
  window.generateStars = function(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    let html = '';
    for (let i = 0; i < fullStars; i++) html += '★';
    if (halfStar) html += '☆';
    for (let i = 0; i < emptyStars; i++) html += '☆';

    return html;
  };
});

// Add fade-in animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .animate-on-scroll {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s ease, transform 0.5s ease;
  }

  .animate-on-scroll.animated {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(style);

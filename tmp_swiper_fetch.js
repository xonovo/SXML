(function(window){
  // Minimal Swiper shim to satisfy basic initialization used in webapp
  function SimpleSwiper(selector, opts){
    this.container = document.querySelector(selector);
    if (!this.container) return;
    this.wrapper = this.container.querySelector('.swiper-wrapper');
    this.slides = Array.from(this.container.querySelectorAll('.swiper-slide'));
    this.opts = opts || {};
    this.current = 0;
    this.timer = null;
    this.init();
  }
  SimpleSwiper.prototype.init = function(){
    var self = this;
    if (!this.wrapper) return;
    // basic styles
    this.wrapper.style.display = 'flex';
    this.wrapper.style.width = (this.slides.length * 100) + '%';
    this.slides.forEach(function(s){ s.style.flex = '0 0 100%'; s.style.boxSizing = 'border-box'; });

    // pagination
    var pagEl = document.querySelector(this.opts.pagination && this.opts.pagination.el) || this.container.querySelector('.swiper-pagination');
    if (pagEl) {
      pagEl.innerHTML = '';
      this.bullets = this.slides.map(function(_,i){
        var b = document.createElement('button');
        b.className = 'swiper-bullet';
        b.style.width = '8px'; b.style.height = '8px'; b.style.borderRadius='50%'; b.style.margin='0 4px'; b.style.border='0';
        b.style.background = i===0? '#fff' : 'rgba(255,255,255,0.6)';
        b.addEventListener('click', function(){ self.slideTo(i); });
        pagEl.appendChild(b);
        return b;
      });
    }

    if (this.opts.autoplay && this.opts.autoplay.delay) {
      this.startAutoplay();
    }
  };
  SimpleSwiper.prototype.startAutoplay = function(){
    var self = this;
    var delay = (this.opts.autoplay && this.opts.autoplay.delay) || 3000;
    this.stopAutoplay();
    this.timer = setInterval(function(){
      self.slideNext();
    }, delay);
  };
  SimpleSwiper.prototype.stopAutoplay = function(){ if (this.timer) { clearInterval(this.timer); this.timer = null; } };
  SimpleSwiper.prototype.slideNext = function(){ this.slideTo((this.current + 1) % this.slides.length); };
  SimpleSwiper.prototype.slideTo = function(index){
    this.current = index;
    if (this.wrapper) this.wrapper.style.transform = 'translateX(-'+(index*100)+'%)';
    if (this.bullets) this.bullets.forEach(function(b,bi){ b.style.background = bi===index ? '#fff' : 'rgba(255,255,255,0.6)'; });
  };
  // expose as Swiper
  window.Swiper = SimpleSwiper;
})(window);

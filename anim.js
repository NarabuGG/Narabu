/* =====================================================================
   Narabu : animations (relief 3D, ressort, ouvertures, moments forts)
   - Ne touche ni a la carte, ni aux donnees, ni aux comptes : seulement a l'apparence.
   - N'anime que transform et opacity.
   - Ne bloque jamais les clics : une nouvelle animation remplace l'ancienne.
   - Si le telephone demande moins d'animations : simples fondus.
   Si GSAP ne se charge pas (pas de reseau), le site marche normalement, sans ces effets.
   ===================================================================== */
(function () {
  'use strict';
  var g = window.gsap;
  if (!g) { window.NX = function () {}; return; }

  var RM = matchMedia('(prefers-reduced-motion: reduce)');
  var FINE = matchMedia('(hover: hover) and (pointer: fine)');
  var calme = RM.matches;
  var onChange = function (mq, fn) { mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn); };
  onChange(RM, function (e) { calme = e.matches; });

  var CARTE = !!document.getElementById('map');
  var COULEURS = ['#D6281F', '#FFC53D', '#2FCB7A'];   // rouge, jaune, vert Narabu

  /* --- ce qui s'incline au survol, et ce qui s'enfonce au clic --- */
  var TILT = CARTE
    ? '.lv:not(:disabled),.row,.mnb,.gard,.geoc,.bdg,.sit,.go a'
    : '.et.vu,.box.vu,.chif.vu>div,.af.vu,.btn';
  var PRESS = CARTE
    ? '.lv,.row,.mnb,.bdg,.sit,.go a,.f,.chip,.cities button,.seg button,.tabs button,.ptabs button,.help,.nx,.mx,.back,.btn,.geob,#near .nb button,#res button,.lnk,.celc,.num'
    : '.btn,.lk,.et,.af,.box';
  var COULEUR_STATUT = '[data-l],[data-nl],[data-rt]';

  // inclinaison maximale (degres) selon la taille de l'element : les grands bougent moins
  function amplitude(el) {
    if (el.matches('.row')) return 2;
    if (el.matches('.btn')) return 6;
    var w = el.offsetWidth;
    return w > 420 ? 2.5 : w > 220 ? 4 : 6;
  }
  // profondeur de l'enfoncement
  function enfonce(el) {
    if (el.matches('.row,.et,.af,.box,.gard,.mnb')) return 0.985;
    if (el.matches('.lv,#near .nb button')) return 0.95;
    return 0.94;
  }
  // une seule fois par element : on coupe sa transition CSS sur transform pour laisser GSAP faire
  function prendre(el) { if (!el._nx) { el._nx = 1; el.classList.add('nx-g'); } }

  /* =================== 1. Relief au survol (souris) =================== */
  var survol = null, boite = null;

  function entrer(el) {
    survol = el; prendre(el);
    boite = el.getBoundingClientRect();
    if (!el._qx) {
      g.set(el, { transformPerspective: el.offsetWidth > 500 ? 1400 : 800 });
      el._qx = g.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      el._qy = g.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    }
    el.style.setProperty('--nx-on', '1');
    if (!el.matches('.row')) g.to(el, { y: -2, duration: 0.3, ease: 'power3.out', overwrite: 'auto' });
  }
  function sortir(el) {
    if (!el) return;
    el._qx && el._qx(0); el._qy && el._qy(0);
    el.style.setProperty('--nx-on', '0');
    g.to(el, { y: 0, duration: 0.35, ease: 'power3.out', overwrite: 'auto' });
    if (survol === el) survol = null;
  }

  document.addEventListener('pointermove', function (e) {
    if (calme || e.pointerType !== 'mouse' || !FINE.matches) return;
    var el = e.target.closest ? e.target.closest(TILT) : null;
    if (el !== survol) { sortir(survol); if (el) entrer(el); }
    if (!survol || !boite || !boite.width) return;
    var px = Math.min(1, Math.max(0, (e.clientX - boite.left) / boite.width));
    var py = Math.min(1, Math.max(0, (e.clientY - boite.top) / boite.height));
    var A = amplitude(survol);
    survol._qx((0.5 - py) * A * 2);
    survol._qy((px - 0.5) * A * 2);
    var s = survol.style;
    s.setProperty('--nx-gx', (px * 100).toFixed(1) + '%');
    s.setProperty('--nx-gy', (py * 100).toFixed(1) + '%');
    s.setProperty('--nx-sx', ((0.5 - px) * 12).toFixed(1) + 'px');   // l'ombre part a l'oppose de la lumiere
    s.setProperty('--nx-sy', (4 + (0.5 - py) * 8).toFixed(1) + 'px');
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', function () { sortir(survol); });
  addEventListener('scroll', function () { if (survol) boite = survol.getBoundingClientRect(); }, { passive: true, capture: true });
  addEventListener('blur', function () { sortir(survol); });

  /* =================== 2. Ressort au clic / toucher =================== */
  var appuye = null, dernier = { x: innerWidth / 2, y: innerHeight / 2, t: 0 }, couleurStatut = null;

  document.addEventListener('pointerdown', function (e) {
    dernier = { x: e.clientX, y: e.clientY, t: Date.now() };
    if (!e.target.closest) return;
    var st = e.target.closest(COULEUR_STATUT);
    if (st) couleurStatut = st.style.color || st.style.backgroundColor || couleurStatut;
    if (e.target.closest('[data-tab]')) memoOnglet();
    var el = e.target.closest(PRESS);
    if (!el || el.disabled || calme) return;
    prendre(el); appuye = el;
    g.to(el, { scale: enfonce(el), duration: 0.1, ease: 'power2.out', overwrite: 'auto' });
  }, { passive: true, capture: true });

  function relacher() {
    if (!appuye) return;
    var el = appuye; appuye = null;
    g.to(el, { scale: 1, duration: 0.19, ease: 'back.out(3.2)', overwrite: 'auto' });
  }
  addEventListener('pointerup', relacher, { passive: true, capture: true });
  addEventListener('pointercancel', relacher, { passive: true, capture: true });

  /* =================== outils =================== */
  function $(s, r) { return (r || document).querySelector(s); }
  function visible(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return false;
    var p = $('#panel');
    return !(p && p.classList.contains('reduit') && p.contains(el));
  }
  function calque(cls, x, y) {
    var d = document.createElement('div');
    d.className = 'nx-fx ' + cls;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    document.body.appendChild(d);
    return d;
  }
  // petites particules aux couleurs Narabu
  function particules(x, y, n) {
    if (calme) return;
    for (var i = 0; i < n; i++) {
      var d = calque('nx-dot' + (i % 3 ? '' : ' r'), x, y);
      d.style.background = COULEURS[i % 3];
      var a = (i / n) * Math.PI * 2 + Math.random() * 0.5, v = 34 + Math.random() * 38;
      g.fromTo(d, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, {
        x: Math.cos(a) * v, y: Math.sin(a) * v - 18, rotation: (Math.random() - 0.5) * 360,
        scale: 0.2, opacity: 0, duration: 0.65 + Math.random() * 0.25, ease: 'power3.out',
        onComplete: d.remove.bind(d)
      });
    }
  }
  // coche de confirmation qui tourne et apparait, puis s'efface
  // ancre = le bouton : la coche est posee sur son parent pour rester nette meme si le bouton est grise
  function coche(hote, c, ancre) {
    var ok = document.createElement('span');
    ok.className = 'nx-ok'; ok.setAttribute('aria-hidden', 'true');
    ok.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="' + c + '"/></svg>';
    if (ancre) {
      var p = ancre.offsetParent === hote ? ancre : null, top = ancre.offsetTop, left = ancre.offsetLeft;
      if (!p) { var rh = hote.getBoundingClientRect(), ra = ancre.getBoundingClientRect(); top = ra.top - rh.top; left = ra.left - rh.left; }
      var petit = ancre.offsetHeight < 44;
      ok.style.cssText = petit
        ? 'right:auto;margin:0;width:24px;height:24px;top:' + (top - 8) + 'px;left:' + (left + ancre.offsetWidth - 16) + 'px'
        : 'right:auto;margin:0;top:' + (top + ancre.offsetHeight / 2 - 17) + 'px;left:' + (left + ancre.offsetWidth - 50) + 'px';
    }
    hote.appendChild(ok);
    g.timeline({ onComplete: function () { ok.remove(); } })
      .fromTo(ok, { scale: 0, rotation: -60 }, { scale: 1, rotation: 0, duration: 0.45, ease: 'back.out(2.6)', delay: 0.25 })
      .to(ok, { scale: 0.6, opacity: 0, duration: 0.25, ease: 'power2.in', delay: 1.4 });
  }
  // les blocs du panneau apparaissent en cascade
  function cascade(fort) {
    var pin = $('#pin');
    if (!pin) return;
    var items = [].slice.call(pin.children, 0, 10).filter(visible);
    if (!items.length) return;
    g.killTweensOf(items);
    if (calme) { g.fromTo(items, { opacity: 0 }, { opacity: 1, duration: 0.15, clearProps: 'opacity' }); return; }
    g.fromTo(items,
      fort ? { y: 26, rotationX: -14, opacity: 0, transformPerspective: 900, transformOrigin: '50% 0%' } : { y: 12, opacity: 0 },
      { y: 0, rotationX: 0, opacity: 1, duration: fort ? 0.44 : 0.3, ease: 'power3.out',
        stagger: { amount: fort ? 0.25 : 0.16 }, clearProps: 'transform,opacity' });
  }

  /* =================== 3. Moments forts =================== */
  var PTS_ATTENTE = null;

  // le compteur de points monte, avec des particules
  function compteur() {
    if (!PTS_ATTENTE) return;
    var b = $('#pin .pts b');
    if (!visible(b)) return;
    var de = PTS_ATTENTE.a, a = PTS_ATTENTE.b;
    PTS_ATTENTE = null;
    if (calme) return;
    // le panneau peut etre redessine pendant le comptage : on suit toujours le compteur affiche
    var o = { v: de }, cible = function () { var x = $('#pin .pts b'); if (x) x.textContent = Math.round(o.v); };
    cible();
    g.to(o, { v: a, duration: 0.9, ease: 'power2.out', onUpdate: cible });
    g.fromTo(b, { scale: 1 }, { scale: 1.3, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, transformOrigin: '50% 60%' });
    var r = b.getBoundingClientRect();
    particules(r.left + r.width / 2, r.top + r.height / 2, 12);
  }

  // onglets : memorise la pastille actuelle avant le changement
  var ongletAvant = null;
  function memoOnglet() {
    var s = $('.tabs [aria-selected=true]');
    ongletAvant = s ? s.getBoundingClientRect() : null;
  }

  var H = {
    // ouverture d'une fiche
    fiche: function () { cascade(true); },
    // retour a la liste
    liste: function () { cascade(false); compteur(); },

    // signalement envoye
    signal: function (d) {
      var c = d.c || couleurStatut || '#2FCB7A';
      if (d.svc) c = '#FFC53D';
      var recent = Date.now() - dernier.t < 5000;
      var x = recent ? dernier.x : innerWidth / 2, y = recent ? dernier.y : innerHeight / 2;
      if (!calme) {
        // la couleur du statut se propage en onde
        var o = calque('nx-ripple', x, y);
        o.style.background = c;
        var R = Math.min(380, Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
        g.fromTo(o, { scale: 0.2, opacity: 0.38 }, { scale: R / 30, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: o.remove.bind(o) });
      }
      // le bandeau de statut de la fiche se retourne en 3D (s'il est a l'ecran)
      var st = $('#pin .st');
      if (st && visible(st) && !d.svc) {
        if (calme) g.fromTo(st, { opacity: 0.3 }, { opacity: 1, duration: 0.15, clearProps: 'opacity' });
        else {
          g.fromTo(st, { rotationX: -88, opacity: 0.4, transformPerspective: 700, transformOrigin: '50% 50%' },
            { rotationX: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.5)', clearProps: 'transform,opacity' });
          coche(st, c);
        }
      }
      // une coche apparait aussi sur le bouton touche, la ou se trouve le doigt
      var sous = recent && document.elementFromPoint(x, y);
      var bouton = sous && sous.closest && sous.closest('#pin .lv,#pin .chip');
      if (bouton && !calme) {
        coche(bouton.parentElement, c, bouton);
        g.fromTo(bouton, { scale: 0.96 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1,0.45)', clearProps: 'transform' });
      }
      var notes = document.querySelectorAll('#pin .note');
      if (notes.length && !calme) g.fromTo(notes, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, delay: 0.15, ease: 'power3.out', stagger: 0.05, clearProps: 'transform,opacity' });
    },

    // points gagnes
    points: function (d) {
      if (!(d.b > d.a)) return;
      PTS_ATTENTE = { a: PTS_ATTENTE ? PTS_ATTENTE.a : d.a, b: d.b };
      if (visible($('#pin .pts b'))) return compteur();
      // compteur cache : petites particules au niveau de la notification "+X points"
      setTimeout(function () {
        var t = $('#toast');
        if (t && t.classList.contains('on')) { var r = t.getBoundingClientRect(); particules(r.left + r.width / 2, r.bottom - 6, 10); }
      }, 260);
    },

    // changement d'onglet Fast-food / Restaurants
    onglet: function (d) {
      var pin = $('#pin'), sens = d.t === 'rs' ? 1 : -1;
      if (pin) {
        g.killTweensOf(pin);
        if (calme) g.fromTo(pin, { opacity: 0.4 }, { opacity: 1, duration: 0.15, clearProps: 'opacity' });
        else g.fromTo(pin, { x: 28 * sens, rotationY: 9 * sens, opacity: 0.35, transformPerspective: 1100, transformOrigin: sens > 0 ? '0% 50%' : '100% 50%' },
          { x: 0, rotationY: 0, opacity: 1, duration: 0.4, ease: 'power3.out', clearProps: 'transform,opacity' });
      }
      // la pastille rouge glisse de l'ancien onglet au nouveau
      var nb = $('.tabs [aria-selected=true]');
      if (!nb || !ongletAvant || calme) { ongletAvant = null; return; }
      var tabs = nb.parentElement, r = nb.getBoundingClientRect();
      var pill = document.createElement('span');
      pill.className = 'nx-pill';
      pill.style.cssText = 'left:' + nb.offsetLeft + 'px;top:' + nb.offsetTop + 'px;width:' + nb.offsetWidth + 'px;height:' + nb.offsetHeight + 'px';
      tabs.insertBefore(pill, tabs.firstChild);
      nb.classList.add('nx-pilling');
      g.fromTo(pill, { x: ongletAvant.left - r.left, scaleX: ongletAvant.width / r.width },
        { x: 0, scaleX: 1, duration: 0.38, ease: 'power3.inOut', onComplete: function () { pill.remove(); nb.classList.remove('nx-pilling'); } });
      ongletAvant = null;
    }
  };

  // point d'entree appele par la carte : NX('fiche'), NX('signal', {...}) ...
  window.NX = function (type, d) {
    if (!H[type]) return;
    requestAnimationFrame(function () { try { H[type](d || {}); } catch (e) { console.warn("NX", type, e); } });
  };

  /* =================== 4. Petits plus sans signal =================== */
  if (CARTE) {
    // le compteur attendait d'etre visible : on regarde a chaque mise a jour du panneau
    var pin = $('#pin');
    if (pin) new MutationObserver(function () { if (PTS_ATTENTE) requestAnimationFrame(compteur); }).observe(pin, { childList: true });
    var panel = $('#panel');
    if (panel) panel.addEventListener('scroll', function () { if (PTS_ATTENTE) compteur(); }, { passive: true });

    // onglets du profil (badges, boutique...) : le contenu glisse en fondu
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#prof .ptabs button')) return;
      requestAnimationFrame(function () {
        var t = $('#prof .ptabs');
        if (!t) return;
        var items = [], n = t.nextElementSibling;
        while (n && items.length < 8) { items.push(n); n = n.nextElementSibling; }
        if (!items.length) return;
        if (calme) g.fromTo(items, { opacity: 0 }, { opacity: 1, duration: 0.15, clearProps: 'opacity' });
        else g.fromTo(items, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out', stagger: 0.03, clearProps: 'transform,opacity' });
      });
    });
  }
})();

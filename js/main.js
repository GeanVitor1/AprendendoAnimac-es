/* ============================================================
   AMOUDO 15.6" - scroll-driven storytelling
   GSAP ScrollTrigger + video scrubbing (no autoplay)
   ============================================================ */
(function () {
  "use strict";

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Nav state (sentinel via ScrollTrigger) ---------------- */
  var nav = document.getElementById("site-nav");
  if (nav) {
    ScrollTrigger.create({
      start: 48,
      end: 96,
      onToggle: function (self) {
        nav.classList.toggle("scrolled", self.isActive);
      },
    });
  }

  /* ---------------- Scroll-scrubbed video ----------------
     Performance notes for CDN hosting (Vercel):
     - Every currentTime seek beyond the buffered range is an HTTP
       round-trip. Seeks are coalesced to one per animation frame and
       only applied once the decoder is ready (canplay), so a cold
       video shows its poster instead of freezing on a stale frame.
     - Cache warming (warmVideoCache) downloads each clip into the
       HTTP cache at idle, turning every later seek into a local read. */
  function initScrubVideo(video, opts) {
    if (!video) return;

    var section = video.closest(".scene");
    var contentEl = opts.contentEl ? document.getElementById(opts.contentEl) : null;
    var trigger = null;
    var ready = false;
    var pendingSeek = null;
    var seekScheduled = false;

    video.muted = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("preload", opts.preload || "auto");
    /* ask the decoder to favor seek latency over throughput (Chrome/Edge 95+) */
    if ("decodingHint" in video) video.decodingHint = "low-latency";

    function applySeek(t) {
      try {
        /* quantized to ~1 video frame (24fps): sub-frame seeks are
           invisible but each one forces a decode pass, which stutters
           the scroll right at the end of a pinned scene */
        if (Math.abs(video.currentTime - t) > 0.05) {
          video.currentTime = t;
        }
      } catch (e) {
        /* seeking before metadata is safe to ignore */
      }
    }

    /* coalesce seeks: at most one decode pass per frame, latest target wins */
    function scheduleSeek(t) {
      pendingSeek = t;
      if (seekScheduled) return;
      seekScheduled = true;
      requestAnimationFrame(function () {
        seekScheduled = false;
        if (pendingSeek === null) return;
        var t2 = pendingSeek;
        pendingSeek = null;
        if (!ready) return; /* keep the poster until the decoder can render */
        applySeek(t2);
      });
    }

    function currentTarget() {
      var d = video.duration || opts.fallbackDuration || 10;
      var p = trigger && typeof trigger.progress === "number" ? trigger.progress : 0;
      return p * Math.max(0, d - 0.15);
    }

    function markReady() {
      if (ready) return;
      ready = true;
      /* snap to where the scroll already is */
      scheduleSeek(currentTarget());
    }
    video.addEventListener("loadeddata", markReady, { once: true });
    video.addEventListener("canplay", markReady, { once: true });

    if (reducedMotion) {
      /* static experience: show the final frame once metadata arrives */
      video.addEventListener(
        "loadedmetadata",
        function () {
          applySeek(Math.max(0, (video.duration || opts.fallbackDuration || 10) - 0.12));
        },
        { once: true }
      );
      return;
    }

    /* pinned section where the video scrubs with scroll.
       duration resolves lazily inside onUpdate, so pinning never
       waits for async metadata. */
    trigger = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: function () {
        return "+=" + Math.round(opts.viewports * window.innerHeight);
      },
      pin: true,
      scrub: 0.5,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (self) {
        var d = video.duration || opts.fallbackDuration || 10;
        var target = self.progress * Math.max(0, d - 0.15);
        scheduleSeek(target);
        if (contentEl) {
          /* the headline yields to the video as the story plays */
          contentEl.style.opacity = Math.max(0, 1 - self.progress * 5);
        }
      },
    });
  }

  initScrubVideo(document.getElementById("video-topo"), {
    viewports: 1.8,
    fallbackDuration: 10,
    contentEl: "hero-content",
  });

  initScrubVideo(document.getElementById("video-meio"), {
    viewports: 2.4,
    fallbackDuration: 6,
    contentEl: "liga-content",
    preload: "metadata",
  });

  initScrubVideo(document.getElementById("video-mochila"), {
    viewports: 1.6,
    fallbackDuration: 5.5,
    preload: "auto",
  });

  /* ---------------- Video cache warming ----------------
     Scrubbing over the network stalls whenever a seek lands outside
     the buffered range. Prefetching the clips into the HTTP cache at
     idle makes every later seek a local read — no round-trip, no
     freeze. Runs only when the page is idle and network is cheap
     (skipped under Save-Data or reduced motion, aborted when hidden). */
  (function warmVideoCache() {
    if (reducedMotion) return;
    if (navigator.connection && navigator.connection.saveData) return;
    if (!("fetch" in window)) return;

    var urls = [
      document.getElementById("video-topo"),
      document.getElementById("video-meio"),
      document.getElementById("video-mochila"),
    ]
      .filter(Boolean)
      .map(function (v) {
        return v.currentSrc || v.getAttribute("src");
      });
    if (!urls.length) return;

    var i = 0;
    var start = function () {
      if (i >= urls.length) return;
      var url = urls[i++];
      window
        .fetch(url, { cache: "force-cache" })
        .catch(function () {})
        .then(start);
    };
    var idle = window.requestIdleCallback
      ? function (fn) {
          return window.requestIdleCallback(fn, { timeout: 4000 });
        }
      : function (fn) {
          return setTimeout(fn, 2000);
        };

    window.addEventListener(
      "load",
      function () {
        idle(start);
      },
      { once: true }
    );
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) i = urls.length; /* stop the chain */
    });
  })();

  /* ---------------- Scroll reveals ---------------- */
  if (!reducedMotion) {
    var revealEls = document.querySelectorAll("[data-reveal]");
    revealEls.forEach(function (el, i) {
      gsap.fromTo(
        el,
        { y: 28, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          delay: (i % 3) * 0.05,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        }
      );
    });
  } else {
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }

  /* ---------------- Horizontal pan (desktop only) ---------------- */
  gsap.matchMedia().add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", function () {
    var section = document.getElementById("uso");
    var wrap = document.querySelector(".pan-wrap");
    var track = document.querySelector(".pan-track");
    var pinEl = document.querySelector(".pan-pin") || section;
    if (!section || !wrap || !track) return;

    var distance = function () {
      return track.scrollWidth - wrap.clientWidth;
    };

    var tween = gsap.to(track, {
      x: function () {
        return -distance();
      },
      ease: "none",
      scrollTrigger: {
        trigger: pinEl,
        start: "top top",
        end: function () {
          return "+=" + distance();
        },
        pin: true,
        scrub: 0.5,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    return function () {
      tween.scrollTrigger && tween.scrollTrigger.kill();
      tween.kill();
      gsap.set(track, { clearProps: "transform" });
    };
  });

  /* ---------------- keep trigger measurements honest ----------------
     Lazy images start with 0 height; once they load the layout grows and
     every pinned/reveal position measured at startup goes stale. Refresh
     ScrollTrigger whenever an image finishes loading — but ONLY when the
     layout actually changed, so we never pay for a full re-measure while
     the user is mid-scroll (aspect ratios keep the layout stable, so in
     practice this almost never fires). */
  var refreshQueued = false;
  function refreshOnImage() {
    if (refreshQueued) return;
    refreshQueued = true;
    var before = document.documentElement.scrollHeight + "x" + document.documentElement.scrollWidth;
    requestAnimationFrame(function () {
      refreshQueued = false;
      var after = document.documentElement.scrollHeight + "x" + document.documentElement.scrollWidth;
      if (before !== after) ScrollTrigger.refresh();
    });
  }
  document.querySelectorAll("img").forEach(function (img) {
    img.addEventListener("load", refreshOnImage);
    img.addEventListener("error", refreshOnImage);
  });

  /* ---------------- Smooth scroll for in-page anchors (JS-driven, ScrollTrigger-safe) ---------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var hash = link.getAttribute("href");
      var target = hash.length > 1 ? document.querySelector(hash) : null;
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", hash);
    });
  });

  /* ---------------- safety re-measures ---------------- */
  ScrollTrigger.refresh();
  window.addEventListener("load", function () {
    ScrollTrigger.refresh();
  });
  document.fonts && document.fonts.ready.then(function () {
    ScrollTrigger.refresh();
  });
})();

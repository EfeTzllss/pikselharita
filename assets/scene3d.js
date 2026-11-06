/* Piksel Harita — 3D scenes (three.js r149, assets/vendor/three.min.js).
   PH3D.intro(canvas, grid)   the loading screen: Turkey rising out of the sea, column by column, from real elevation data
   PH3D.viewer(canvas, lm)     a landmark built from its real OpenStreetMap building parts (heights, domes, minarets)
   Both render at a fraction of the screen resolution and are scaled up with nearest-neighbour sampling, so the 3D
   looks like the 2D map: chunky pixels, flat shading. */
(function () {
  'use strict';
  const T = window.THREE;
  const PIX = 3;                     // css px per rendered pixel
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const back = u => { const c = 1.6; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

  function makeRenderer(canvas, pix) {
    // 'default' power: integrated GPUs on laptops are steadier than forcing the discrete one
    const r = new T.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false });
    r.setPixelRatio(1 / pix);   // linear output keeps the site's hex palette as written
    canvas.style.imageRendering = 'pixelated';
    return r;
  }
  function fit(renderer, camera, canvas) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const s = renderer.getSize(new T.Vector2());
    if (s.x !== w || s.y !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }
  const hex = s => new T.Color('#' + s);

  /* ---------------- loading screen ---------------- */
  function intro(canvas, grid, onFail) {
    const renderer = makeRenderer(canvas, PIX);
    let failed = false;
    const fail = e => { if (failed) return; failed = true; try { stop(); } catch (e2) { /* already gone */ } if (onFail) onFail(e); };
    canvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); fail(new Error('webgl context lost')); }, { once: true });
    const scene = new T.Scene();
    scene.background = new T.Color('#0F1C47');
    scene.fog = new T.Fog('#0F1C47', 150, 330);
    const camera = new T.PerspectiveCamera(38, 1, 1, 1000);
    scene.add(new T.HemisphereLight('#fff6e6', '#2b3d7a', 0.62));
    const sun = new T.DirectionalLight('#fff1d6', 0.6); sun.position.set(-60, 120, 70); scene.add(sun);

    const { cols, rows, h, c } = grid, n = cols * rows;
    const geo = new T.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = new T.MeshLambertMaterial({ flatShading: true });
    const mesh = new T.InstancedMesh(geo, mat, n);
    const target = new Float32Array(n), delay = new Float32Array(n), sea = new Uint8Array(n);
    const col = new T.Color();
    for (let i = 0; i < n; i++) {
      const x = i % cols, y = (i / cols) | 0, e = h[i];
      sea[i] = e <= 0 ? 1 : 0;
      target[i] = sea[i] ? 0.35 : 0.8 + Math.pow(e, 0.85) / 70;     // vertical exaggeration so the mountains read
      // west to east wave, with a little noise so it does not look mechanical
      delay[i] = (x / cols) * 0.72 + ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.16 + (sea[i] ? 0.06 : 0);
      col.set('#' + c.substr(i * 6, 6));
      if (sea[i]) col.offsetHSL(0, 0, -0.04 - (e < -60 ? 0.05 : 0));
      mesh.setColorAt(i, col);
    }
    scene.add(mesh);
    const ox = cols / 2, oz = rows / 2;
    const m4 = new T.Matrix4(), cur = new Float32Array(n).fill(0.001);
    const ist = new T.Vector3(grid.ist[0] - ox, 0, grid.ist[1] - oz);

    // a lone pixel marker that drops onto Istanbul when the data is ready
    const pin = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 1.6), new T.MeshLambertMaterial({ color: '#E2483A', flatShading: true }));
    pin.visible = false; scene.add(pin);

    let shown = 0, progress = 0, finishing = 0, done = null, raf = 0, t0 = performance.now();
    function setProgress(p) { progress = Math.max(progress, Math.min(1, p)); }
    function finish(cb) { if (!finishing) { finishing = performance.now(); done = cb; } }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      try { step(now); } catch (e) { fail(e); }
    }
    function step(now) {
      fit(renderer, camera, canvas);
      const t = (now - t0) / 1000;
      // the rise always takes at least ~2.8 s, even when the data is already cached
      const cap = reduced ? 1 : Math.min(1, t / 2.8);
      shown += (Math.min(progress, cap) - shown) * (reduced ? 1 : 0.08);
      const p = reduced ? 1 : shown;
      for (let i = 0; i < n; i++) {
        const u = Math.min(1, Math.max(0, (p * 1.12 - delay[i]) / 0.2));
        const v = u <= 0 ? 0.001 : target[i] * (sea[i] ? u : back(u));
        if (Math.abs(v - cur[i]) > 0.002) {
          cur[i] = v;
          m4.makeScale(0.94, v, 0.94); m4.setPosition(i % cols - ox + .5, sea[i] ? -0.2 : 0, ((i / cols) | 0) - oz + .5);
          mesh.setMatrixAt(i, m4);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      // camera: slow orbit while loading, then a glide to a straight-down view over Istanbul
      // keep the whole country in frame whatever the screen shape (portrait phones see it from further away)
      const asp = camera.aspect || 1, halfW = asp >= 1 ? 90 : 96;
      const R = Math.min(680, Math.max(120, halfW / (Math.tan(19 * Math.PI / 180) * Math.min(asp, 1.9)) * 0.92));
      scene.fog.near = R * 0.8; scene.fog.far = R * 2.4;
      const a = -0.35 + Math.sin(t * 0.18) * 0.28;
      const orbit = new T.Vector3(Math.sin(a) * R * 0.78, R * 0.62, Math.cos(a) * R * 0.78);
      let pos = orbit, look = new T.Vector3(0, -2, 2);
      if (finishing) {
        const f = Math.min(1, (now - finishing) / (reduced ? 1 : 1900)), e = ease(f);
        pin.visible = true;
        pin.scale.setScalar(1 + e * 1.5);
        pin.position.set(ist.x, 26 * (1 - Math.min(1, f * 2.2)) + 3, ist.z);
        pin.rotation.y = t * 2;
        // end straight above the country, framed like the 2D map's first view, so the cross-fade lines up
        const fitH = Math.max(cols / (2 * Math.tan(19 * Math.PI / 180) * Math.max(asp, .3)), rows / (2 * Math.tan(19 * Math.PI / 180))) * 1.02;
        const top = new T.Vector3(0, fitH, 0.01), centre = new T.Vector3(0, 0, 0);
        pos = orbit.clone().lerp(top, e); look = look.clone().lerp(centre, e);
        canvas.style.opacity = String(1 - Math.max(0, (f - 0.72) / 0.28));
        if (f >= 1 && done) { const cb = done; done = null; stop(); cb(); }
      }
      camera.position.copy(pos); camera.lookAt(look);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
    let stopped = false;
    // frees the GPU context too: the intro never comes back, so its canvas can go for good
    function stop() { if (stopped) return; stopped = true; cancelAnimationFrame(raf); geo.dispose(); mat.dispose(); renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* fine */ } }
    return { setProgress, finish, stop };
  }

  /* ---------------- landmark viewer ---------------- */
  // project lon/lat to local metres around the landmark centre (x east, z south)
  function local(lm) {
    const k = 111320 * Math.cos(lm.lat * Math.PI / 180);
    return ([lon, lat]) => [(lon - lm.lon) * k, -(lat - lm.lat) * 110540];
  }
  const DEF = { wall: '#d9ccb2', lead: '#8f9dad', roof: '#b9674e', stone: '#cdbb98' };   // real materials
  function partColour(p, lm) {
    const c = p.colour; if (c && /^#?[0-9a-f]{6}$/i.test(c)) return c[0] === '#' ? c : '#' + c;
    if (c) return c;   // css colour names are fine for THREE.Color
    return lm.wall || DEF.wall;
  }
  function roofColour(p, lm) {
    const c = p.roofcolour; if (c) return /^[0-9a-f]{6}$/i.test(c) ? '#' + c : c;
    if (p.roof === 'dome' || p.roof === 'onion') return lm.dome || DEF.lead;
    if (p.roof === 'cone' || p.roof === 'pyramidal') return lm.dome || DEF.lead;
    return lm.roof || partColour(p, lm);
  }
  function safeColour(c, fallback) { try { return new T.Color(c); } catch (e) { return new T.Color(fallback); } }

  function buildModel(lm) {
    const g = new T.Group(), toL = local(lm);
    let maxH = 0, ext = 0;
    const parts = lm.parts.filter(p => p.part).length ? lm.parts.filter(p => p.part || p.keep) : lm.parts;
    for (const p of parts) {
      const rings = p.rings.map(r => r.map(toL));
      const outer = rings[0];
      if (outer.length < 4) continue;
      const shape = new T.Shape(outer.map(([x, z]) => new T.Vector2(x, z)));
      for (const hole of rings.slice(1)) shape.holes.push(new T.Path(hole.map(([x, z]) => new T.Vector2(x, z))));
      const h = p.h || lm.defaultH || 8, minh = p.minh || 0;
      const roofh = (p.roof && p.roof !== 'flat') ? (p.roofh || null) : 0;
      // footprint size for domes and cones
      let cx = 0, cz = 0; for (const [x, z] of outer) { cx += x; cz += z; } cx /= outer.length; cz /= outer.length;
      let area = 0; for (let i = 0; i < outer.length - 1; i++) area += outer[i][0] * outer[i + 1][1] - outer[i + 1][0] * outer[i][1];
      const rad = Math.sqrt(Math.abs(area) / 2 / Math.PI);
      for (const [x, z] of outer) ext = Math.max(ext, Math.hypot(x, z));
      let rh = roofh === null ? (p.roof === 'dome' || p.roof === 'onion' ? rad : p.roof === 'cone' || p.roof === 'pyramidal' ? rad * 2.4 : 0) : roofh;
      rh = Math.min(rh, Math.max(0, h - minh));
      const wallTop = h - rh;
      const wallMat = new T.MeshLambertMaterial({ color: safeColour(partColour(p, lm), DEF.wall), flatShading: true });
      if (wallTop - minh > 0.05) {
        const geo = new T.ExtrudeGeometry(shape, { depth: wallTop - minh, bevelEnabled: false, curveSegments: 6 });
        geo.rotateX(Math.PI / 2); geo.translate(0, wallTop, 0);
        g.add(new T.Mesh(geo, wallMat));
      }
      if (rh > 0.05) {
        const rmat = new T.MeshLambertMaterial({ color: safeColour(roofColour(p, lm), DEF.lead), flatShading: true });
        let roof;
        if (p.roof === 'dome' || p.roof === 'onion' || p.roof === 'round') {
          roof = new T.Mesh(new T.SphereGeometry(rad, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), rmat);
          roof.scale.y = rh / rad;
        } else if (p.roof === 'cone' || p.roof === 'pyramidal') {
          roof = new T.Mesh(new T.ConeGeometry(rad, rh, p.roof === 'cone' ? 10 : 4, 1), rmat);
          roof.position.y = rh / 2;
        } else {   // gabled, hipped, skillion…: a low hip is a good pixel-scale stand-in
          roof = new T.Mesh(new T.ConeGeometry(rad * 1.35, rh, 4, 1), rmat);
          roof.rotation.y = Math.PI / 4; roof.position.y = rh / 2;
        }
        roof.position.x = cx; roof.position.z = cz; roof.position.y += wallTop;
        g.add(roof);
      }
      maxH = Math.max(maxH, h);
    }
    return { group: g, maxH, ext: Math.max(ext, 10) };
  }

  function viewer(canvas, lm, onFail) {
    const renderer = makeRenderer(canvas, 2);
    let failed = false;
    const fail = e => { if (failed) return; failed = true; try { api.stop(); } catch (e2) { /* already gone */ } if (onFail) onFail(e); };
    canvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); fail(new Error('webgl context lost')); }, { once: true });
    const scene = new T.Scene();
    scene.background = new T.Color('#0F1C47');
    const camera = new T.PerspectiveCamera(32, 1, 0.5, 5000);
    scene.add(new T.HemisphereLight('#fff6e6', '#2b3766', 0.5));
    const sun = new T.DirectionalLight('#fff1d6', 0.62); sun.position.set(-80, 140, 60); scene.add(sun);
    const { group, maxH, ext } = buildModel(lm);
    scene.add(group);
    // ground: a cream map tile with a pixel grid
    const size = Math.ceil(ext * 2.6 / 10) * 10;
    const tile = new T.Mesh(new T.BoxGeometry(size, 2, size), new T.MeshLambertMaterial({ color: '#b9c29a', flatShading: true }));
    tile.position.y = -1; scene.add(tile);
    const grid = new T.GridHelper(size, size / 5, '#a6b087', '#afb890'); grid.position.y = 0.02; scene.add(grid);
    const rim = new T.Mesh(new T.BoxGeometry(size + 4, 4, size + 4), new T.MeshLambertMaterial({ color: '#1B3C8F', flatShading: true }));
    rim.position.y = -3.2; scene.add(rim);

    let az = -0.7, el = 0.52, dist = Math.max(ext * 3.1, maxH * 2.6, 60), auto = true, raf = 0, last = performance.now();
    const look = new T.Vector3(0, maxH * 0.32, 0);
    const minD = dist * 0.35, maxD = dist * 2.2;
    let dragging = null;
    const onDown = e => { dragging = { x: e.clientX, y: e.clientY, az, el }; auto = false; canvas.setPointerCapture(e.pointerId); };
    const onMove = e => { if (!dragging) return; az = dragging.az - (e.clientX - dragging.x) * 0.008; el = Math.min(1.35, Math.max(0.12, dragging.el + (e.clientY - dragging.y) * 0.006)); };
    const onUp = () => { dragging = null; };
    const onWheel = e => { e.preventDefault(); dist = Math.min(maxD, Math.max(minD, dist * Math.exp(e.deltaY * 0.0012))); };
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    let built = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      try { step(now); } catch (e) { fail(e); }
    }
    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      fit(renderer, camera, canvas);
      if (auto && !reduced) az += dt * 0.25;
      built = Math.min(1, built + dt * (reduced ? 99 : 1.4));
      group.scale.y = Math.max(0.001, back(built));
      camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist + look.y, Math.cos(az) * Math.cos(el) * dist);
      camera.lookAt(look);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
    let stopped = false;
    const api = {
      zoom(f) { dist = Math.min(maxD, Math.max(minD, dist * f)); auto = false; },
      stop() {
        if (stopped) return; stopped = true;
        cancelAnimationFrame(raf);
        canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('wheel', onWheel);
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) { /* fine: the page swaps in a fresh canvas next time */ }
      }
    };
    return api;
  }

  window.PH3D = { intro, viewer, buildModel, ok: !!(T && (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })()) };
})();

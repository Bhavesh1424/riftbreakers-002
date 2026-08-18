// renderer3d.js — Three.js 3D renderer for Riftbreakers
// Neon Cyberpunk arena, low-poly 3D humanoid fighters, PBR lighting

const Renderer3D = (() => {
  let renderer, scene, camera;
  let fighterMeshes = {}; // { p1: Group, p2: Group }
  let p1Light, p2Light;
  let shakeOffsetX = 0, shakeOffsetY = 0;
  let animTime = 0;

  // Stage world dimensions (maps from game coords 0-960 x 0-540)
  const WORLD_W = 9.6;
  const GROUND_WORLD_Y = 0;
  const FIGHTER_SCALE = 0.018; // game units -> world units

  // ─────────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────────
  function init(container) {
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(960, 540);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04020e);
    scene.fog = new THREE.FogExp2(0x04020e, 0.04);

    // Camera — cinematic side-view slightly above center
    camera = new THREE.PerspectiveCamera(55, 960 / 540, 0.1, 200);
    camera.position.set(0, 2.8, 9.5);
    camera.lookAt(0, 1.5, 0);

    buildLights();
    buildStage();
    buildBackground();
  }

  // ─────────────────────────────────────────────
  //  LIGHTS
  // ─────────────────────────────────────────────
  function buildLights() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x0a0820, 1.2);
    scene.add(ambient);

    // Hemisphere sky/ground
    const hemi = new THREE.HemisphereLight(0x1a1040, 0x050210, 0.6);
    scene.add(hemi);

    // Key directional light (casts shadows)
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    dirLight.position.set(3, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -8;
    dirLight.shadow.camera.right = 8;
    dirLight.shadow.camera.top = 8;
    dirLight.shadow.camera.bottom = -4;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // Per-fighter colored point lights (set during createFighter)
    p1Light = new THREE.PointLight(0x33d6c4, 3.5, 5);
    p1Light.position.set(-2, 1.5, 0.5);
    scene.add(p1Light);

    p2Light = new THREE.PointLight(0xe0334f, 3.5, 5);
    p2Light.position.set(2, 1.5, 0.5);
    scene.add(p2Light);

    // Rim light from behind
    const rimLight = new THREE.DirectionalLight(0x220a44, 1.0);
    rimLight.position.set(0, 2, -8);
    scene.add(rimLight);
  }

  // ─────────────────────────────────────────────
  //  STAGE (floor + walls + pillars)
  // ─────────────────────────────────────────────
  function buildStage() {
    // Floor — dark reflective metal with neon grid
    const floorGeo = new THREE.PlaneGeometry(20, 14);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x080614,
      roughness: 0.18,
      metalness: 0.9,
      envMapIntensity: 1.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = GROUND_WORLD_Y;
    floor.receiveShadow = true;
    scene.add(floor);

    // Neon grid lines on floor
    addFloorGrid();

    // Back wall
    const wallGeo = new THREE.PlaneGeometry(20, 10);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x060412,
      roughness: 0.95,
      metalness: 0.1,
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 4, -5.5);
    scene.add(backWall);

    // Neon accent strips on wall
    addWallAccents();

    // Side boundary pillars
    addPillars();

    // Ground glow strips
    addGroundGlowStrips();
  }

  function addFloorGrid() {
    const gridMat = new THREE.LineBasicMaterial({ color: 0x1a0a3a, transparent: true, opacity: 0.6 });
    const gridGroup = new THREE.Group();

    for (let x = -10; x <= 10; x += 1.2) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.01, -7), new THREE.Vector3(x, 0.01, 7)
      ]);
      gridGroup.add(new THREE.Line(geo, gridMat));
    }
    for (let z = -7; z <= 7; z += 1.2) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-10, 0.01, z), new THREE.Vector3(10, 0.01, z)
      ]);
      gridGroup.add(new THREE.Line(geo, gridMat));
    }
    scene.add(gridGroup);

    // Bright center cross lines
    const centerMat = new THREE.LineBasicMaterial({ color: 0x3300ff, transparent: true, opacity: 0.4 });
    const cH = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-10, 0.02, 0), new THREE.Vector3(10, 0.02, 0)
    ]);
    scene.add(new THREE.Line(cH, centerMat));
  }

  function addWallAccents() {
    // Horizontal neon stripes on back wall
    const stripeColors = [0x33d6c4, 0x6600cc, 0xe0334f];
    const stripeYs = [5.5, 4.0, 2.5];
    stripeColors.forEach((col, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: col });
      const geo = new THREE.BoxGeometry(18, 0.04, 0.04);
      const stripe = new THREE.Mesh(geo, mat);
      stripe.position.set(0, stripeYs[i], -5.45);
      scene.add(stripe);

      // Point light for each stripe glow
      const glow = new THREE.PointLight(col, 1.0, 6);
      glow.position.set(0, stripeYs[i], -4.5);
      scene.add(glow);
    });

    // Vertical neon pillars on wall
    [-7, -3.5, 0, 3.5, 7].forEach(x => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x220055 });
      const geo = new THREE.BoxGeometry(0.04, 8, 0.04);
      const stripe = new THREE.Mesh(geo, mat);
      stripe.position.set(x, 4, -5.45);
      scene.add(stripe);
    });
  }

  function addPillars() {
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x0d0825,
      roughness: 0.5,
      metalness: 0.7,
    });
    const pillarPositions = [-6.5, -4.5, 4.5, 6.5];
    pillarPositions.forEach(x => {
      const geo = new THREE.BoxGeometry(0.5, 6, 0.5);
      const pillar = new THREE.Mesh(geo, pillarMat);
      pillar.position.set(x, 3, -2);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      scene.add(pillar);

      // Neon trim on pillar
      const trimMat = new THREE.MeshBasicMaterial({ color: x < 0 ? 0x33d6c4 : 0xe0334f });
      const trimGeo = new THREE.BoxGeometry(0.52, 0.06, 0.52);
      [0.5, 2.5, 4.5].forEach(ty => {
        const trim = new THREE.Mesh(trimGeo, trimMat);
        trim.position.set(x, ty, -2);
        scene.add(trim);
      });
    });
  }

  function addGroundGlowStrips() {
    // Two neon strips running along the ground toward the camera
    const stripMat1 = new THREE.MeshBasicMaterial({ color: 0x33d6c4 });
    const stripMat2 = new THREE.MeshBasicMaterial({ color: 0xe0334f });
    const stripGeo = new THREE.BoxGeometry(0.04, 0.02, 14);

    const s1 = new THREE.Mesh(stripGeo, stripMat1);
    s1.position.set(-4, 0.01, 0);
    scene.add(s1);

    const s2 = new THREE.Mesh(stripGeo, stripMat2);
    s2.position.set(4, 0.01, 0);
    scene.add(s2);

    // glow lights along strips
    const g1 = new THREE.PointLight(0x33d6c4, 1.5, 5);
    g1.position.set(-4, 0.2, 0);
    scene.add(g1);
    const g2 = new THREE.PointLight(0xe0334f, 1.5, 5);
    g2.position.set(4, 0.2, 0);
    scene.add(g2);
  }

  // ─────────────────────────────────────────────
  //  BACKGROUND (stars / city skyline)
  // ─────────────────────────────────────────────
  function buildBackground() {
    // Distant city silhouette
    const buildingMat = new THREE.MeshBasicMaterial({ color: 0x080412 });
    const cityData = [
      { x: -9, w: 1.2, h: 4 }, { x: -7.5, w: 0.8, h: 6 }, { x: -6.5, w: 1.5, h: 3 },
      { x: -5, w: 0.9, h: 7 }, { x: -3.5, w: 1.1, h: 4.5 }, { x: -1.5, w: 0.7, h: 5 },
      { x: 0.5, w: 0.8, h: 8 }, { x: 2, w: 1.3, h: 4 }, { x: 3.5, w: 0.9, h: 6 },
      { x: 5, w: 1.0, h: 3.5 }, { x: 6.5, w: 1.4, h: 5 }, { x: 8, w: 0.8, h: 4 },
    ];
    cityData.forEach(b => {
      const geo = new THREE.BoxGeometry(b.w, b.h, 0.2);
      const mesh = new THREE.Mesh(geo, buildingMat);
      mesh.position.set(b.x, b.h / 2 + 0.5, -8);
      scene.add(mesh);

      // tiny window lights
      if (Math.random() > 0.4) {
        const winMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x3399ff : 0xffaa33 });
        const winGeo = new THREE.BoxGeometry(0.12, 0.08, 0.1);
        for (let wy = 1; wy < b.h - 0.5; wy += 0.6) {
          for (let wx = -b.w / 2 + 0.2; wx < b.w / 2 - 0.1; wx += 0.35) {
            if (Math.random() > 0.5) {
              const win = new THREE.Mesh(winGeo, winMat);
              win.position.set(b.x + wx, wy + 0.5, -7.9);
              scene.add(win);
            }
          }
        }
      }
    });

    // Starfield particles
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    for (let i = 0; i < 300; i++) {
      starVerts.push(
        (Math.random() - 0.5) * 40,
        4 + Math.random() * 12,
        -9 - Math.random() * 5
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xddeeff, size: 0.06, sizeAttenuation: true });
    scene.add(new THREE.Points(starGeo, starMat));

    // Moon
    const moonGeo = new THREE.SphereGeometry(0.7, 16, 16);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xc8bde0, roughness: 0.9, metalness: 0 });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(6, 9, -9);
    scene.add(moon);
    const moonGlow = new THREE.PointLight(0xaa99cc, 0.6, 8);
    moonGlow.position.set(6, 9, -8);
    scene.add(moonGlow);
  }

  // ─────────────────────────────────────────────
  //  FIGHTER MESH BUILDER
  // ─────────────────────────────────────────────
  function createFighter(color) {
    const colorHex = parseInt(color.replace('#', '0x'));
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.35,
      metalness: 0.7,
      emissive: colorHex,
      emissiveIntensity: 0.25,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111118,
      roughness: 0.6,
      metalness: 0.5,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: colorHex });

    const group = new THREE.Group();

    // — Head —
    const headGeo = new THREE.BoxGeometry(0.38, 0.38, 0.3);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(0, 1.75, 0);
    head.castShadow = true;
    group.add(head);

    // Face visor
    const visorGeo = new THREE.BoxGeometry(0.26, 0.1, 0.04);
    const visor = new THREE.Mesh(visorGeo, glowMat);
    visor.position.set(0, 1.77, 0.17);
    group.add(visor);

    // — Neck —
    const neckGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.12, 6);
    const neck = new THREE.Mesh(neckGeo, darkMat);
    neck.position.set(0, 1.52, 0);
    group.add(neck);

    // — Torso (upper) —
    const torsoGeo = new THREE.BoxGeometry(0.55, 0.55, 0.28);
    const torso = new THREE.Mesh(torsoGeo, darkMat);
    torso.position.set(0, 1.15, 0);
    torso.castShadow = true;
    group.add(torso);

    // Chest plate
    const chestGeo = new THREE.BoxGeometry(0.44, 0.32, 0.06);
    const chest = new THREE.Mesh(chestGeo, mat);
    chest.position.set(0, 1.18, 0.17);
    group.add(chest);

    // — Hips —
    const hipGeo = new THREE.BoxGeometry(0.45, 0.2, 0.25);
    const hips = new THREE.Mesh(hipGeo, darkMat);
    hips.name = 'hips';
    hips.position.set(0, 0.82, 0);
    group.add(hips);

    // — Left Upper Arm —
    const uArmGeo = new THREE.CapsuleGeometry(0.09, 0.3, 4, 6);
    const lUpperArm = new THREE.Mesh(uArmGeo, darkMat);
    lUpperArm.name = 'lUpperArm';
    lUpperArm.position.set(0.38, 1.15, 0);
    group.add(lUpperArm);

    // — Left Forearm —
    const foreArmGeo = new THREE.CapsuleGeometry(0.075, 0.28, 4, 6);
    const lForeArm = new THREE.Mesh(foreArmGeo, mat);
    lForeArm.name = 'lForeArm';
    lForeArm.position.set(0.38, 0.8, 0);
    group.add(lForeArm);

    // — Left Fist —
    const fistGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const lFist = new THREE.Mesh(fistGeo, mat);
    lFist.name = 'lFist';
    lFist.position.set(0.38, 0.58, 0);
    group.add(lFist);

    // — Right Upper Arm —
    const rUpperArm = new THREE.Mesh(uArmGeo, darkMat);
    rUpperArm.name = 'rUpperArm';
    rUpperArm.position.set(-0.38, 1.15, 0);
    group.add(rUpperArm);

    // — Right Forearm —
    const rForeArm = new THREE.Mesh(foreArmGeo, mat);
    rForeArm.name = 'rForeArm';
    rForeArm.position.set(-0.38, 0.8, 0);
    group.add(rForeArm);

    // — Right Fist —
    const rFist = new THREE.Mesh(fistGeo, mat);
    rFist.name = 'rFist';
    rFist.position.set(-0.38, 0.58, 0);
    group.add(rFist);

    // — Left Upper Leg —
    const uLegGeo = new THREE.CapsuleGeometry(0.11, 0.35, 4, 6);
    const lUpperLeg = new THREE.Mesh(uLegGeo, darkMat);
    lUpperLeg.name = 'lUpperLeg';
    lUpperLeg.position.set(0.15, 0.54, 0);
    group.add(lUpperLeg);

    // — Left Lower Leg —
    const loLegGeo = new THREE.CapsuleGeometry(0.09, 0.32, 4, 6);
    const lLowerLeg = new THREE.Mesh(loLegGeo, mat);
    lLowerLeg.name = 'lLowerLeg';
    lLowerLeg.position.set(0.15, 0.16, 0);
    group.add(lLowerLeg);

    // — Left Foot —
    const footGeo = new THREE.BoxGeometry(0.16, 0.1, 0.22);
    const lFoot = new THREE.Mesh(footGeo, darkMat);
    lFoot.name = 'lFoot';
    lFoot.position.set(0.15, 0.03, 0.05);
    group.add(lFoot);

    // — Right Upper Leg —
    const rUpperLeg = new THREE.Mesh(uLegGeo, darkMat);
    rUpperLeg.name = 'rUpperLeg';
    rUpperLeg.position.set(-0.15, 0.54, 0);
    group.add(rUpperLeg);

    // — Right Lower Leg —
    const rLowerLeg = new THREE.Mesh(loLegGeo, mat);
    rLowerLeg.name = 'rLowerLeg';
    rLowerLeg.position.set(-0.15, 0.16, 0);
    group.add(rLowerLeg);

    // — Right Foot —
    const rFoot = new THREE.Mesh(footGeo, darkMat);
    rFoot.name = 'rFoot';
    rFoot.position.set(-0.15, 0.03, 0.05);
    group.add(rFoot);

    // Shadow
    group.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

    scene.add(group);
    return group;
  }

  // ─────────────────────────────────────────────
  //  REGISTER FIGHTERS
  // ─────────────────────────────────────────────
  function registerFighters(p1Fighter, p2Fighter) {
    // Remove old meshes if re-registered
    if (fighterMeshes.p1) scene.remove(fighterMeshes.p1);
    if (fighterMeshes.p2) scene.remove(fighterMeshes.p2);

    fighterMeshes.p1 = createFighter(p1Fighter.color);
    fighterMeshes.p2 = createFighter(p2Fighter.color);

    // Update light colors to match fighter colors
    p1Light.color.set(p1Fighter.color);
    p2Light.color.set(p2Fighter.color);
  }

  // ─────────────────────────────────────────────
  //  POSE ANIMATION
  // ─────────────────────────────────────────────
  function getPart(group, name) {
    return group.children.find(c => c.name === name);
  }

  function resetPose(group) {
    // Reset all named parts to default position/rotation
    const defaults = {
      lUpperArm: { x:  0.38, y: 1.15, rx: 0 },
      lForeArm:  { x:  0.38, y: 0.80, rx: 0 },
      lFist:     { x:  0.38, y: 0.58, rx: 0 },
      rUpperArm: { x: -0.38, y: 1.15, rx: 0 },
      rForeArm:  { x: -0.38, y: 0.80, rx: 0 },
      rFist:     { x: -0.38, y: 0.58, rx: 0 },
      lUpperLeg: { x:  0.15, y: 0.54, rx: 0 },
      lLowerLeg: { x:  0.15, y: 0.16, rx: 0 },
      lFoot:     { x:  0.15, y: 0.03, rx: 0 },
      rUpperLeg: { x: -0.15, y: 0.54, rx: 0 },
      rLowerLeg: { x: -0.15, y: 0.16, rx: 0 },
      rFoot:     { x: -0.15, y: 0.03, rx: 0 },
    };
    for (const [name, d] of Object.entries(defaults)) {
      const part = getPart(group, name);
      if (part) {
        part.position.set(d.x, d.y, 0);
        part.rotation.set(d.rx, 0, 0);
      }
    }
  }

  function applyPose(group, state, facing, t) {
    resetPose(group);

    const bob = Math.sin(t * 2.5) * 0.03;

    if (state === 'idle') {
      // Gentle breathing bob
      group.children.forEach(c => { if (c.name === '' || !c.name) c.position.y += bob; });
      const la = getPart(group, 'lUpperArm');
      const ra = getPart(group, 'rUpperArm');
      if (la) la.rotation.z =  0.25 + Math.sin(t * 1.2) * 0.05;
      if (ra) ra.rotation.z = -0.25 - Math.sin(t * 1.2) * 0.05;
    }

    else if (state === 'walk') {
      const swing = Math.sin(t * 5) * 0.5;
      const la = getPart(group, 'lUpperArm'); if (la) la.rotation.x =  swing * 0.6;
      const ra = getPart(group, 'rUpperArm'); if (ra) ra.rotation.x = -swing * 0.6;
      const ll = getPart(group, 'lUpperLeg'); if (ll) ll.rotation.x =  swing;
      const rl = getPart(group, 'rUpperLeg'); if (rl) rl.rotation.x = -swing;
      const lll = getPart(group, 'lLowerLeg'); if (lll) lll.rotation.x = Math.max(0, -swing) * 0.6;
      const rll = getPart(group, 'rLowerLeg'); if (rll) rll.rotation.x = Math.max(0,  swing) * 0.6;
    }

    else if (state === 'jump') {
      // Tuck legs
      const ll = getPart(group, 'lUpperLeg'); if (ll) { ll.rotation.x = -0.9; ll.position.y += 0.2; }
      const rl = getPart(group, 'rUpperLeg'); if (rl) { rl.rotation.x = -0.9; rl.position.y += 0.2; }
      const lll = getPart(group, 'lLowerLeg'); if (lll) lll.rotation.x = 1.2;
      const rll = getPart(group, 'rLowerLeg'); if (rll) rll.rotation.x = 1.2;
      // Arms spread out
      const la = getPart(group, 'lUpperArm'); if (la) la.rotation.z = 0.7;
      const ra = getPart(group, 'rUpperArm'); if (ra) ra.rotation.z = -0.7;
    }

    else if (state === 'attack') {
      // Forward punch pose
      const ra = getPart(group, 'rUpperArm');
      const rf = getPart(group, 'rForeArm');
      const rfist = getPart(group, 'rFist');
      if (ra) { ra.rotation.x = -1.3; ra.position.y = 1.3; }
      if (rf) { rf.rotation.x = -0.4; rf.position.set(-0.38, 1.15, 0.35); }
      if (rfist) rfist.position.set(-0.38, 1.15, 0.72);
      // Left arm guard
      const la = getPart(group, 'lUpperArm'); if (la) la.rotation.z = 0.3;
    }

    else if (state === 'block') {
      // Arms crossed in front
      const la = getPart(group, 'lUpperArm'); if (la) { la.rotation.x = -0.8; la.rotation.z = 0.2; }
      const ra = getPart(group, 'rUpperArm'); if (ra) { ra.rotation.x = -0.8; ra.rotation.z = -0.2; }
      const lf = getPart(group, 'lForeArm'); if (lf) { lf.rotation.x = -0.5; lf.position.y = 1.1; }
      const rf = getPart(group, 'rForeArm'); if (rf) { rf.rotation.x = -0.5; rf.position.y = 1.1; }
      // Crouch
      group.position.y -= 0.1;
    }

    else if (state === 'hitstun') {
      // Lean back
      group.rotation.z = facing > 0 ? -0.2 : 0.2;
      const ra = getPart(group, 'rUpperArm'); if (ra) ra.rotation.x = 0.5;
      const la = getPart(group, 'lUpperArm'); if (la) la.rotation.x = 0.5;
    }

    else if (state === 'dodge') {
      group.position.z = 0.3;
      const ll = getPart(group, 'lUpperLeg'); if (ll) ll.rotation.x = -0.5;
      const rl = getPart(group, 'rUpperLeg'); if (rl) rl.rotation.x = 0.3;
    }

    else if (state === 'ko') {
      group.rotation.z = facing > 0 ? -1.1 : 1.1;
      group.position.y = 0;
    }
  }

  // ─────────────────────────────────────────────
  //  GAME → WORLD COORDINATE MAPPING
  // ─────────────────────────────────────────────
  // Game coords: x in [0, 960], y in [0, 540], ground at y=430
  // World coords: x in [-4.8, 4.8], y in [0, ~4], z = 0
  function gameToWorld(gx, gy) {
    const wx = (gx / 960) * WORLD_W - WORLD_W / 2;
    // gy=430 (GROUND_Y) → world y=0; sky proportional
    const wy = Math.max(0, (430 - gy) / 430) * 3.2;
    return { x: wx, y: wy };
  }

  // ─────────────────────────────────────────────
  //  UPDATE FIGHTER MESH FROM GAME STATE
  // ─────────────────────────────────────────────
  function updateFighter(group, fighter, t) {
    if (!group) return;

    const wPos = gameToWorld(fighter.x, fighter.y);
    group.position.x = wPos.x;
    group.position.y = wPos.y;
    group.position.z = 0;

    // Facing direction
    group.rotation.y = fighter.facing > 0 ? 0 : Math.PI;

    applyPose(group, fighter.state, fighter.facing, t);

    // Update per-fighter light position
    if (group === fighterMeshes.p1) {
      p1Light.position.set(wPos.x, wPos.y + 1.5, 1.5);
    } else {
      p2Light.position.set(wPos.x, wPos.y + 1.5, 1.5);
    }
  }

  // ─────────────────────────────────────────────
  //  SCREEN SHAKE
  // ─────────────────────────────────────────────
  function applyShake(ox, oy) {
    shakeOffsetX = ox / 960 * WORLD_W;
    shakeOffsetY = -(oy / 540 * 3.2);
  }

  // ─────────────────────────────────────────────
  //  MAIN RENDER
  // ─────────────────────────────────────────────
  function render(p1Fighter, p2Fighter, now) {
    animTime = now * 0.001;

    // Camera tracks midpoint of fighters
    if (p1Fighter && p2Fighter) {
      const midX = (gameToWorld(p1Fighter.x, p1Fighter.y).x + gameToWorld(p2Fighter.x, p2Fighter.y).x) / 2;
      const dist = Math.abs(p1Fighter.x - p2Fighter.x) / 960;
      const targetZ = 7.5 + dist * 4;
      camera.position.x += (midX * 0.3 - camera.position.x) * 0.05;
      camera.position.z += (targetZ - camera.position.z) * 0.04;
      camera.lookAt(camera.position.x, 1.5, 0);

      camera.position.x += shakeOffsetX;
      camera.position.y += shakeOffsetY;
    }

    // Animate p1Light intensity with subtle pulse
    const pulse = 1 + Math.sin(animTime * 3.5) * 0.15;
    p1Light.intensity = 3.0 * pulse;
    p2Light.intensity = 3.0 * (2 - pulse);

    renderer.render(scene, camera);
  }

  // ─────────────────────────────────────────────
  //  SUPER EFFECT — camera push-in flash
  // ─────────────────────────────────────────────
  function triggerSuperEffect(side) {
    const origZ = camera.position.z;
    let step = 0;
    const flash = () => {
      step++;
      if (step < 8) {
        camera.position.z = origZ - 1.5 + Math.sin(step / 8 * Math.PI) * 1.5;
        if (side === 'p1') p1Light.intensity = 12;
        else p2Light.intensity = 12;
        requestAnimationFrame(flash);
      } else {
        camera.position.z = origZ;
      }
    };
    flash();
  }

  return {
    init,
    registerFighters,
    updateFighter,
    render,
    applyShake,
    triggerSuperEffect,
    get meshes() { return fighterMeshes; },
  };
})();

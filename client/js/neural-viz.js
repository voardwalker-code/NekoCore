// ============================================================
// REM System — 3D Neural Network Visualization
// Three.js-based real-time memory trace visualization
// ============================================================

const NeuralViz = (() => {
  let scene, camera, renderer, controls;
  let container = null;
  let animationId = null;
  let isInitialized = false;

  // Node & edge data
  const nodeMap = new Map();     // memory_id -> mesh
  const edgeMap = new Map();     // "src|tgt" -> line
  const nodeData = new Map();    // memory_id -> data object
  const labelSprites = new Map();

  // Belief graph data
  const beliefNodeMap = new Map();   // belief_id -> mesh
  const beliefNodeData = new Map();  // belief_id -> belief object
  const beliefEdgeMap = new Map();   // "src|tgt" -> line

  // Physics simulation
  let simNodes = [];  // {id, x, y, z, vx, vy, vz, mesh, data}
  let simEdges = [];  // {source, target, strength, batchIdx}

  // Batched edge rendering (single draw call)
  let _edgeBatch = null;  // THREE.LineSegments for memory edges

  // Visual settings
  const NODE_BASE_SIZE = 0.35;
  const NODE_MAX_SIZE = 1.2;
  const EDGE_OPACITY_BASE = 0.15;
  const EDGE_OPACITY_MAX = 0.7;
  const SIM_ALPHA = 0.15;       // simulation force strength
  const SIM_REPULSION = 60;
  const SIM_LINK_DISTANCE = 8;
  const SIM_CENTER_GRAVITY = 0.01;
  let MAX_VISIBLE_NODES = 350;
  const MAX_VISIBLE_EDGES = 600;         // hard cap on rendered edges
  const EDGE_STRENGTH_THRESHOLD = 0.15;  // prune weak connections below this
  const SIM_THROTTLE_FRAMES = 3;         // run physics every N frames
  let frameCount = 0;

  // Colors — Emerald accent palette matching the UI
  const COLORS = {
    nodeDefault: 0x34d399,    // --accent emerald
    nodeActive: 0x22d3ee,     // --cyan
    nodeHot: 0xf87171,        // --danger red
    nodeSelected: 0xfbbf24,   // --warning gold
    edgeDefault: 0x3f3f46,    // --surface-3
    edgeActive: 0x34d399,
    edgeTrace: 0x818cf8,      // --info indigo
    particleColor: 0x34d399,
    bgColor: 0x04060d,        // --surface-0
    gridColor: 0x080d18,      // --surface-1
    // Belief graph colors
    beliefNode: 0xc084fc,     // purple-400
    beliefHigh: 0xa855f7,     // purple-500 (high confidence)
    beliefLow: 0x7c3aed,      // purple-600 (low confidence)
    beliefEdge: 0x9333ea,     // purple-700
    beliefMemoryEdge: 0x6d28d9 // purple-800 (belief→memory link)
  };

  // ── Memory type visual profiles ──
  // Each type gets a unique neuron-inspired geometry + color
  const MEMORY_TYPES = {
    core_memory: {
      color: 0xfbbf24,       // warm gold — stands out
      emissive: 0xfbbf24,
      emissiveBase: 0.45,
      glow: true,
      glowScale: 6,
      label: 'Core',
      buildGeo: (s) => {
        // Star-burst: icosahedron with high detail — the "sun" of the network
        const geo = new THREE.IcosahedronGeometry(s * 1.6, 1);
        // Extrude vertices outward unevenly for organic spiky look
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const spike = 1.0 + (Math.sin(i * 2.7) * 0.35);
          pos.setX(i, pos.getX(i) * spike);
          pos.setY(i, pos.getY(i) * spike);
          pos.setZ(i, pos.getZ(i) * spike);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
      }
    },
    episodic: {
      color: 0x34d399,       // emerald — default neuron
      emissive: 0x34d399,
      emissiveBase: 0.15,
      label: 'Episodic',
      buildGeo: (s) => {
        // Classic neuron soma: smooth sphere with subtle detail
        return new THREE.SphereGeometry(s, 16, 12);
      }
    },
    semantic_knowledge: {
      color: 0x60a5fa,       // blue — knowledge crystal
      emissive: 0x60a5fa,
      emissiveBase: 0.2,
      label: 'Knowledge',
      buildGeo: (s) => {
        // Faceted dodecahedron — structured knowledge
        return new THREE.DodecahedronGeometry(s * 1.1, 0);
      }
    },
    long_term_memory: {
      color: 0x2dd4bf,       // teal — consolidated, deep memory
      emissive: 0x2dd4bf,
      emissiveBase: 0.22,
      label: 'Long-Term',
      buildGeo: (s) => {
        // Smooth icosahedron — polished, consolidated form
        return new THREE.IcosahedronGeometry(s * 1.05, 1);
      }
    },
    semantic: {
      color: 0x60a5fa,       // blue — knowledge crystal
      emissive: 0x60a5fa,
      emissiveBase: 0.2,
      label: 'Semantic',
      buildGeo: (s) => {
        return new THREE.DodecahedronGeometry(s * 1.1, 0);
      }
    },
    reflection: {
      color: 0xc084fc,       // purple — introspective prism
      emissive: 0xc084fc,
      emissiveBase: 0.2,
      label: 'Reflection',
      buildGeo: (s) => {
        // Toroidal ring — self-referential loop
        return new THREE.TorusGeometry(s * 0.9, s * 0.3, 10, 16);
      }
    },
    interaction: {
      color: 0xfb7185,       // rose — social warmth
      emissive: 0xfb7185,
      emissiveBase: 0.18,
      label: 'Interaction',
      buildGeo: (s) => {
        // Dual-lobe: two merged spheres via capsule shape
        const geo = new THREE.CapsuleGeometry(s * 0.5, s * 0.6, 8, 12);
        return geo;
      }
    },
    learning: {
      color: 0x22d3ee,       // cyan — bright knowledge intake
      emissive: 0x22d3ee,
      emissiveBase: 0.2,
      label: 'Learning',
      buildGeo: (s) => {
        // Tetrahedron — building block of knowledge
        return new THREE.TetrahedronGeometry(s * 1.2, 0);
      }
    },
    creation: {
      color: 0xfb923c,       // orange — creative spark
      emissive: 0xfb923c,
      emissiveBase: 0.2,
      label: 'Creation',
      buildGeo: (s) => {
        // Octahedron — multifaceted creative gem
        return new THREE.OctahedronGeometry(s * 1.1, 0);
      }
    },
    achievement: {
      color: 0xa3e635,       // lime — reward signal
      emissive: 0xa3e635,
      emissiveBase: 0.25,
      label: 'Achievement',
      buildGeo: (s) => {
        // Cone pointing up — trophy/spike
        return new THREE.ConeGeometry(s * 0.8, s * 1.8, 6);
      }
    },
    dream: {
      color: 0xe879f9,       // fuchsia — ethereal dream cloud
      emissive: 0xe879f9,
      emissiveBase: 0.3,
      glow: true,
      glowScale: 5,
      isDream: true,
      label: 'Dream',
      buildGeo: (s) => {
        // Fluffy cloud — sphere with bumpy clusters
        const geo = new THREE.SphereGeometry(s * 1.2, 24, 18);
        const pos = geo.attributes.position;
        // Define 5 lobe centers for the cloud puffs
        const lobes = [
          { x: 0.6,  y: 0.3,  z: 0.0, r: 0.45 },
          { x: -0.5, y: 0.35, z: 0.2, r: 0.4 },
          { x: 0.0,  y: 0.5,  z: -0.3, r: 0.35 },
          { x: 0.3,  y: -0.2, z: 0.5, r: 0.3 },
          { x: -0.3, y: -0.1, z: -0.4, r: 0.35 }
        ];
        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          const len = Math.sqrt(x * x + y * y + z * z) || 1;
          const nx = x / len, ny = y / len, nz = z / len;
          let push = 0;
          for (const l of lobes) {
            const dx = nx - l.x, dy = ny - l.y, dz = nz - l.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            push += l.r * Math.max(0, 1 - dist * 2.2);
          }
          const scale = 1.0 + push;
          pos.setX(i, x * scale);
          pos.setY(i, y * scale);
          pos.setZ(i, z * scale);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
      }
    },
    dream_memory: {
      color: 0xa78bfa,       // violet — remembered dream cloud
      emissive: 0xa78bfa,
      emissiveBase: 0.35,
      glow: true,
      glowScale: 5,
      isDream: true,
      label: 'Dream Memory',
      buildGeo: (s) => {
        // Fluffy cloud — similar to dream but slightly smaller
        const geo = new THREE.SphereGeometry(s * 1.15, 24, 18);
        const pos = geo.attributes.position;
        const lobes = [
          { x: 0.5,  y: 0.35, z: 0.1, r: 0.4 },
          { x: -0.55, y: 0.3, z: 0.15, r: 0.38 },
          { x: 0.1,  y: 0.55, z: -0.25, r: 0.35 },
          { x: 0.35, y: -0.15, z: 0.45, r: 0.32 },
          { x: -0.25, y: -0.2, z: -0.45, r: 0.3 }
        ];
        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          const len = Math.sqrt(x * x + y * y + z * z) || 1;
          const nx = x / len, ny = y / len, nz = z / len;
          let push = 0;
          for (const l of lobes) {
            const dx = nx - l.x, dy = ny - l.y, dz = nz - l.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            push += l.r * Math.max(0, 1 - dist * 2.2);
          }
          const scale = 1.0 + push;
          pos.setX(i, x * scale);
          pos.setY(i, y * scale);
          pos.setZ(i, z * scale);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
      }
    },
    chatlog: {
      color: 0xf472b6,       // pink — conversation energy
      emissive: 0xf472b6,
      emissiveBase: 0.25,
      label: 'Chatlog',
      buildGeo: (s) => {
        // Helix-like cylinder — compressed conversation scroll
        const geo = new THREE.CylinderGeometry(s * 0.5, s * 0.8, s * 1.8, 8, 6, false);
        // Twist vertices for a helical speech-wave look
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const twist = y * 1.5;
          const x = pos.getX(i);
          const z = pos.getZ(i);
          pos.setX(i, x * Math.cos(twist) - z * Math.sin(twist));
          pos.setZ(i, x * Math.sin(twist) + z * Math.cos(twist));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
      }
    }
  };
  // Fallback for unknown types
  const DEFAULT_TYPE_PROFILE = MEMORY_TYPES.episodic;

  // Neurochemistry state (updated via SSE)
  let neurochemState = null; // { dopamine, cortisol, serotonin, oxytocin }

  // Raycasting for click detection
  let raycaster, mouse;
  let selectedNode = null;
  let hoveredNode = null;

  // Animation state
  let traceAnimations = [];  // active trace pulse animations
  let pulseTime = 0;

  // Playback mode — nodes hidden until revealed by timeline
  let _playbackMode = false;
  let _revealedNodeIds = new Set();
  let _revealAnims = []; // { mesh, id, startTime, duration, targetOp, prof, d }

  // SSE connection
  let eventSource = null;

  // ── Initialization ──
  function init(containerEl, options = {}) {
    if (isInitialized) return;
    container = containerEl;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bgColor);
    scene.fog = new THREE.FogExp2(COLORS.bgColor, 0.008);

    // Camera
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500);
    camera.position.set(0, 0, 50);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 5;
    controls.maxDistance = 200;

    // Raycaster
    raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.5 };
    mouse = new THREE.Vector2();

    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    // Point lights for depth
    const light1 = new THREE.PointLight(0x34d399, 0.6, 120);
    light1.position.set(30, 30, 30);
    scene.add(light1);
    const light2 = new THREE.PointLight(0x818cf8, 0.4, 120);
    light2.position.set(-30, -20, -30);
    scene.add(light2);

    // Grid helper for spatial reference
    const gridHelper = new THREE.GridHelper(100, 40, COLORS.gridColor, COLORS.gridColor);
    gridHelper.material.opacity = 0.15;
    gridHelper.material.transparent = true;
    gridHelper.position.y = -20;
    scene.add(gridHelper);

    // Event listeners
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    isInitialized = true;
    animate();
  }

  // ── Data Loading ──
  async function loadGraphData() {
    try {
      const [graphRes, traceRes, beliefRes] = await Promise.all([
        fetch('/api/memory-graph/nodes'),
        fetch('/api/traces'),
        fetch('/api/belief-graph/nodes')
      ]);

      const graphData = await graphRes.json();
      const traceData = await traceRes.json();
      const beliefData = await beliefRes.json();

      if (graphData.ok && graphData.nodes && graphData.nodes.length > 0) {
        buildGraph(graphData.nodes, graphData.edges || []);
      }

      if (traceData.ok && traceData.graph) {
        overlayTraceConnections(traceData.graph);
      }

      if (beliefData.ok && beliefData.beliefs && beliefData.beliefs.length > 0) {
        buildBeliefGraph(beliefData.beliefs, beliefData.edges || []);
      }

      updateInfoPanel();
      buildLegend();
    } catch (err) {
      console.warn('Neural Viz: failed to load graph data', err);
    }
  }

  // ── Build 3D Graph ──
  function buildGraph(nodes, edges) {
    // Clear existing
    clearScene();

    // Sort by importance, but always keep priority types (chatlog, core, dreams)
    const PRIORITY_TYPES = new Set(['chatlog', 'long_term_memory', 'core_memory', 'dream', 'dream_memory']);
    const priority = nodes.filter(n => PRIORITY_TYPES.has(n.type));
    const normal = nodes.filter(n => !PRIORITY_TYPES.has(n.type))
      .sort((a, b) => (b.importance + b.access_count * 0.05) - (a.importance + a.access_count * 0.05));
    const visibleNodes = [...priority, ...normal].slice(0, MAX_VISIBLE_NODES);
    const visibleIds = new Set(visibleNodes.map(n => n.id));

    // Create node meshes
    visibleNodes.forEach((node, i) => {
      const size = NODE_BASE_SIZE + (node.importance || 0.5) * (NODE_MAX_SIZE - NODE_BASE_SIZE);

      // Look up type-specific visual profile
      const typeKey = node.type || 'episodic';
      const profile = MEMORY_TYPES[typeKey] || DEFAULT_TYPE_PROFILE;
      const isCore = typeKey === 'core_memory';

      const geometry = profile.buildGeo(size);

      // Color: use type color, override with activation-hot if fired
      let color = profile.color;
      if (node.activation > 0.5) color = COLORS.nodeHot;

      const material = new THREE.MeshPhongMaterial({
        color,
        emissive: profile.emissive,
        emissiveIntensity: profile.emissiveBase + (node.activation || 0) * 0.5,
        transparent: true,
        opacity: isCore ? 1.0 : (profile.isDream ? 0.75 : 0.85),
        flatShading: typeKey !== 'episodic' && !profile.isDream // smooth shading for clouds
      });

      const mesh = new THREE.Mesh(geometry, material);

      // Position in a sphere layout initially
      const phi = Math.acos(-1 + (2 * i) / visibleNodes.length);
      const theta = Math.sqrt(visibleNodes.length * Math.PI) * phi;
      const radius = 15 + Math.random() * 10;

      mesh.position.set(
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi),
        radius * Math.cos(phi)
      );

      mesh.userData = { memoryId: node.id, data: node };
      scene.add(mesh);
      nodeMap.set(node.id, mesh);
      nodeData.set(node.id, node);

      // Build sim node for physics
      simNodes.push({
        id: node.id,
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z,
        vx: 0, vy: 0, vz: 0,
        mesh,
        data: node
      });

      // Glow sprite — larger and brighter for core memories
      const glowScale = profile.glowScale || 4;
      addGlowSprite(mesh, size, color, glowScale);

      // Core memories get pulsing ring + dendrite spines
      if (isCore) {
        addCoreDendrites(mesh, size, color);
      }

      // Dream nodes get floating Zzz sprites
      if (profile.isDream) {
        addDreamZzz(mesh, size, color);
      }
    });

    // Filter + sort edges by strength, prune weak ones, cap total
    const candidateEdges = edges
      .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target) && (e.strength || 0.5) >= EDGE_STRENGTH_THRESHOLD)
      .sort((a, b) => (b.strength || 0.5) - (a.strength || 0.5))
      .slice(0, MAX_VISIBLE_EDGES);

    // Batch all edges into a single LineSegments geometry (one draw call)
    const edgePositions = new Float32Array(candidateEdges.length * 6);
    const edgeColors = new Float32Array(candidateEdges.length * 6);
    const baseColor = new THREE.Color(COLORS.edgeDefault);

    candidateEdges.forEach((edge, idx) => {
      const key = `${edge.source}|${edge.target}`;
      if (edgeMap.has(key)) return;

      const srcMesh = nodeMap.get(edge.source);
      const tgtMesh = nodeMap.get(edge.target);
      if (!srcMesh || !tgtMesh) return;

      const off = idx * 6;
      edgePositions[off]     = srcMesh.position.x;
      edgePositions[off + 1] = srcMesh.position.y;
      edgePositions[off + 2] = srcMesh.position.z;
      edgePositions[off + 3] = tgtMesh.position.x;
      edgePositions[off + 4] = tgtMesh.position.y;
      edgePositions[off + 5] = tgtMesh.position.z;

      edgeColors[off]     = baseColor.r;
      edgeColors[off + 1] = baseColor.g;
      edgeColors[off + 2] = baseColor.b;
      edgeColors[off + 3] = baseColor.r;
      edgeColors[off + 4] = baseColor.g;
      edgeColors[off + 5] = baseColor.b;

      edgeMap.set(key, idx);  // store index into batch

      simEdges.push({
        source: edge.source,
        target: edge.target,
        strength: edge.strength || 0.5,
        batchIdx: idx
      });
    });

    // Create single batched LineSegments
    const batchGeo = new THREE.BufferGeometry();
    batchGeo.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    batchGeo.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));
    const batchMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35
    });
    _edgeBatch = new THREE.LineSegments(batchGeo, batchMat);
    scene.add(_edgeBatch);

    // Run initial simulation steps to settle
    for (let i = 0; i < 80; i++) {
      simulationStep(0.6);
    }
    updateEdgePositions();
  }

  // ── Overlay trace connections ──
  function overlayTraceConnections(connectionGraph) {
    if (!_edgeBatch) return;
    const colors = _edgeBatch.geometry.attributes.color.array;
    const traceColor = new THREE.Color(COLORS.edgeTrace);

    for (const [fromId, connections] of Object.entries(connectionGraph)) {
      if (!nodeMap.has(fromId)) continue;
      for (const conn of connections) {
        if (!nodeMap.has(conn.to)) continue;
        const key = `${fromId}|${conn.to}`;
        const idx = edgeMap.get(key);
        if (idx != null) {
          const off = idx * 6;
          colors[off]     = traceColor.r; colors[off + 1] = traceColor.g; colors[off + 2] = traceColor.b;
          colors[off + 3] = traceColor.r; colors[off + 4] = traceColor.g; colors[off + 5] = traceColor.b;
        }
      }
    }
    _edgeBatch.geometry.attributes.color.needsUpdate = true;
  }

  // ── Build Belief Graph Overlay ──
  function buildBeliefGraph(beliefs, edges) {
    // Track old belief IDs so we can remove them from simulation arrays
    const oldBeliefIds = new Set(beliefNodeMap.keys());

    // Clear existing belief nodes from scene
    for (const [, mesh] of beliefNodeMap) scene.remove(mesh);
    for (const [, line] of beliefEdgeMap) scene.remove(line);
    beliefNodeMap.clear();
    beliefNodeData.clear();
    beliefEdgeMap.clear();

    // Remove old belief entries from simulation arrays to prevent ghost nodes
    simNodes = simNodes.filter(n => !oldBeliefIds.has(n.id));
    simEdges = simEdges.filter(e => {
      if (oldBeliefIds.has(e.source) || oldBeliefIds.has(e.target)) {
        if (e.line) scene.remove(e.line);
        return false;
      }
      return true;
    });

    // Create belief nodes as octahedrons (visually distinct from memory spheres)
    beliefs.forEach((belief, i) => {
      const size = 0.5 + belief.confidence * 0.8;
      const geometry = new THREE.OctahedronGeometry(size, 0);

      let color = COLORS.beliefNode;
      if (belief.confidence > 0.7) color = COLORS.beliefHigh;
      else if (belief.confidence < 0.4) color = COLORS.beliefLow;

      const material = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25 + belief.confidence * 0.3,
        transparent: true,
        opacity: 0.9,
        flatShading: true
      });

      const mesh = new THREE.Mesh(geometry, material);

      // Position beliefs in a cluster above the memory graph
      // Find centroid of connected source memories, or use golden spiral
      let posX = 0, posY = 0, posZ = 0;
      let foundSources = 0;
      for (const srcId of belief.sources) {
        const memMesh = nodeMap.get(srcId);
        if (memMesh) {
          posX += memMesh.position.x;
          posY += memMesh.position.y;
          posZ += memMesh.position.z;
          foundSources++;
        }
      }

      if (foundSources > 0) {
        // Place near centroid of source memories, offset upward
        posX /= foundSources;
        posY = (posY / foundSources) + 6 + Math.random() * 4;
        posZ /= foundSources;
        // Add small jitter to avoid overlap
        posX += (Math.random() - 0.5) * 5;
        posZ += (Math.random() - 0.5) * 5;
      } else {
        // Golden spiral above the main graph
        const phi = Math.acos(-1 + (2 * i) / Math.max(beliefs.length, 1));
        const theta = Math.sqrt(beliefs.length * Math.PI) * phi;
        const radius = 10 + Math.random() * 5;
        posX = radius * Math.cos(theta) * Math.sin(phi);
        posY = 15 + Math.random() * 10;
        posZ = radius * Math.sin(theta) * Math.sin(phi);
      }

      mesh.position.set(posX, posY, posZ);
      mesh.userData = { beliefId: belief.belief_id, data: belief, isBelief: true };
      scene.add(mesh);
      beliefNodeMap.set(belief.belief_id, mesh);
      beliefNodeData.set(belief.belief_id, belief);

      // Add to physics simulation
      simNodes.push({
        id: belief.belief_id,
        x: posX, y: posY, z: posZ,
        vx: 0, vy: 0, vz: 0,
        mesh,
        data: belief,
        isBelief: true
      });

      // Add glow sprite (purple tinted)
      addGlowSprite(mesh, size, color);
    });

    // Create edges
    edges.forEach(edge => {
      const key = `${edge.source}|${edge.target}`;
      if (beliefEdgeMap.has(key) || edgeMap.has(key)) return;

      // Find source and target meshes in either map
      const srcMesh = beliefNodeMap.get(edge.source) || nodeMap.get(edge.source);
      const tgtMesh = beliefNodeMap.get(edge.target) || nodeMap.get(edge.target);
      if (!srcMesh || !tgtMesh) return;

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(6);
      positions[0] = srcMesh.position.x; positions[1] = srcMesh.position.y; positions[2] = srcMesh.position.z;
      positions[3] = tgtMesh.position.x; positions[4] = tgtMesh.position.y; positions[5] = tgtMesh.position.z;
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const isBB = edge.type === 'belief_belief';
      const opacity = isBB ? 0.35 + (edge.strength || 0.5) * 0.4 : 0.2;
      const edgeColor = isBB ? COLORS.beliefEdge : COLORS.beliefMemoryEdge;

      const material = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity,
        linewidth: isBB ? 2 : 1
      });

      // Dash pattern for belief→memory links
      let line;
      if (!isBB) {
        const dashMat = new THREE.LineDashedMaterial({
          color: edgeColor,
          transparent: true,
          opacity,
          dashSize: 0.5,
          gapSize: 0.3
        });
        line = new THREE.Line(geometry, dashMat);
        line.computeLineDistances();
      } else {
        line = new THREE.Line(geometry, material);
      }

      scene.add(line);
      beliefEdgeMap.set(key, line);

      simEdges.push({
        source: edge.source,
        target: edge.target,
        strength: (edge.strength || 0.5) * 0.5, // Weaker pull for belief links
        line
      });
    });

    // Settle the new belief nodes
    for (let i = 0; i < 40; i++) {
      simulationStep(0.4);
    }
    updateEdgePositions();
  }

  // ── Glow sprite for nodes ──
  function addGlowSprite(mesh, size, color, scale) {
    const glowScale = scale || 4;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    const c = new THREE.Color(color);
    gradient.addColorStop(0, `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},0.5)`);
    gradient.addColorStop(0.4, `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},0.15)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(size * glowScale, size * glowScale, 1);
    mesh.add(sprite);
  }

  // ── Floating Zzz sprites for dream nodes ──
  function addDreamZzz(parentMesh, size, color) {
    const zCount = 3;
    for (let i = 0; i < zCount; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const fontSize = 28 - i * 6;
      ctx.font = 'bold ' + fontSize + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#' + (new THREE.Color(color)).getHexString();
      ctx.globalAlpha = 0.9 - i * 0.2;
      ctx.fillText('Z', 32, 32);
      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      const spriteSize = size * (1.2 - i * 0.25);
      sprite.scale.set(spriteSize, spriteSize, 1);
      // Offset each Z upward and to the right in a staircase
      sprite.position.set(
        size * (0.6 + i * 0.5),
        size * (1.0 + i * 0.9),
        0
      );
      sprite.userData._dreamZzz = true;
      sprite.userData._zzzIndex = i;
      sprite.userData._zzzBaseY = sprite.position.y;
      parentMesh.add(sprite);
    }
  }

  // ── Core memory dendrite spines (make core memories unmissable) ──
  function addCoreDendrites(parentMesh, size, color) {
    const spineMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6
    });
    // Add 6-8 thin cylinder "dendrite" spines radiating out
    const spineCount = 6 + Math.floor(Math.random() * 3);
    for (let i = 0; i < spineCount; i++) {
      const length = size * (2.5 + Math.random() * 2);
      const geo = new THREE.CylinderGeometry(0.03, 0.06, length, 4);
      geo.translate(0, length / 2, 0);
      const spine = new THREE.Mesh(geo, spineMat);
      // Random outward direction
      const phi = Math.acos(-1 + 2 * Math.random());
      const theta = Math.random() * Math.PI * 2;
      spine.rotation.set(phi, theta, 0);
      parentMesh.add(spine);
      // Tiny sphere tip (synapse bulb)
      const bulbGeo = new THREE.SphereGeometry(0.08, 6, 4);
      const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
      bulb.position.set(0, length, 0);
      spine.add(bulb);
    }
    // Add a pulsing ring halo
    const ringGeo = new THREE.TorusGeometry(size * 2.2, 0.04, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.userData._coreRing = true;
    parentMesh.add(ring);
  }

  // ── Force-directed simulation step ──
  function simulationStep(alpha) {
    const a = alpha || SIM_ALPHA;

    // Build id->node lookup for O(1) access
    const nodeById = new Map();
    for (const n of simNodes) nodeById.set(n.id, n);

    // Repulsion between all nodes
    for (let i = 0; i < simNodes.length; i++) {
      for (let j = i + 1; j < simNodes.length; j++) {
        const ni = simNodes[i], nj = simNodes[j];
        let dx = ni.x - nj.x, dy = ni.y - nj.y, dz = ni.z - nj.z;
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
        const force = SIM_REPULSION / (dist * dist);
        const fx = (dx / dist) * force * a;
        const fy = (dy / dist) * force * a;
        const fz = (dz / dist) * force * a;
        ni.vx += fx; ni.vy += fy; ni.vz += fz;
        nj.vx -= fx; nj.vy -= fy; nj.vz -= fz;
      }
    }

    // Link attraction
    for (const edge of simEdges) {
      const ni = nodeById.get(edge.source);
      const nj = nodeById.get(edge.target);
      if (!ni || !nj) continue;
      let dx = nj.x - ni.x, dy = nj.y - ni.y, dz = nj.z - ni.z;
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const force = (dist - SIM_LINK_DISTANCE) * edge.strength * a * 0.1;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;
      ni.vx += fx; ni.vy += fy; ni.vz += fz;
      nj.vx -= fx; nj.vy -= fy; nj.vz -= fz;
    }

    // Center gravity
    for (const n of simNodes) {
      n.vx -= n.x * SIM_CENTER_GRAVITY * a;
      n.vy -= n.y * SIM_CENTER_GRAVITY * a;
      n.vz -= n.z * SIM_CENTER_GRAVITY * a;
    }

    // Apply velocity with damping
    for (const n of simNodes) {
      n.vx *= 0.85; n.vy *= 0.85; n.vz *= 0.85;
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
      if (n.mesh) n.mesh.position.set(n.x, n.y, n.z);
    }
  }

  function updateEdgePositions() {
    const nodeById = new Map();
    for (const n of simNodes) nodeById.set(n.id, n);

    // Update batched memory-edge geometry
    if (_edgeBatch) {
      const positions = _edgeBatch.geometry.attributes.position.array;
      for (const edge of simEdges) {
        if (edge.batchIdx == null) continue; // belief edges use individual lines
        const srcNode = nodeById.get(edge.source);
        const tgtNode = nodeById.get(edge.target);
        if (!srcNode || !tgtNode) continue;
        const off = edge.batchIdx * 6;
        positions[off]     = srcNode.x; positions[off + 1] = srcNode.y; positions[off + 2] = srcNode.z;
        positions[off + 3] = tgtNode.x; positions[off + 4] = tgtNode.y; positions[off + 5] = tgtNode.z;
      }
      _edgeBatch.geometry.attributes.position.needsUpdate = true;
    }

    // Update individual belief-edge lines
    for (const edge of simEdges) {
      if (edge.batchIdx != null) continue; // already handled in batch
      if (!edge.line) continue;
      const srcNode = nodeById.get(edge.source);
      const tgtNode = nodeById.get(edge.target);
      if (!srcNode || !tgtNode) continue;
      const positions = edge.line.geometry.attributes.position.array;
      positions[0] = srcNode.x; positions[1] = srcNode.y; positions[2] = srcNode.z;
      positions[3] = tgtNode.x; positions[4] = tgtNode.y; positions[5] = tgtNode.z;
      edge.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ── Animation Loop ──
  function animate() {
    animationId = requestAnimationFrame(animate);
    pulseTime += 0.016;
    frameCount++;

    // Throttled physics — only run every N frames
    if (frameCount % SIM_THROTTLE_FRAMES === 0) {
      simulationStep(SIM_ALPHA * 0.1);
      updateEdgePositions();
    }

    // Pulse selected node
    if (selectedNode) {
      const mesh = nodeMap.get(selectedNode) || beliefNodeMap.get(selectedNode);
      if (mesh) {
        const scale = 1 + 0.15 * Math.sin(pulseTime * 3);
        mesh.scale.set(scale, scale, scale);
        mesh.material.emissiveIntensity = 0.4 + 0.3 * Math.sin(pulseTime * 3);
      }
    }

    // Hovered node glow
    if (hoveredNode && hoveredNode !== selectedNode) {
      const mesh = nodeMap.get(hoveredNode) || beliefNodeMap.get(hoveredNode);
      if (mesh) {
        mesh.material.emissiveIntensity = 0.5;
      }
    }

    // Animate active traces
    updateTraceAnimations();

    // Process node birth animations (playback reveal) — spring scale 0→1.25→1.0
    if (_revealAnims.length > 0) {
      const now = performance.now();
      _revealAnims = _revealAnims.filter(item => {
        const t = Math.min(1, (now - item.startTime) / item.duration);
        // Spring easing: overshoot to 1.25, settle to 1.0
        const s = t < 0.65 ? (t / 0.65) * 1.25 : 1.25 - ((t - 0.65) / 0.35) * 0.25;
        item.mesh.scale.set(s, s, s);
        item.mesh.material.opacity = t * item.targetOp;
        if (t >= 1.0) {
          item.mesh.scale.set(1, 1, 1);
          item.mesh.material.opacity = item.targetOp;
          item.mesh.material.color.setHex(getNodeColor(item.d));
          item.mesh.material.emissiveIntensity = item.prof.emissiveBase + ((item.d && item.d.activation) || 0) * 0.5;
          return false;
        }
        return true;
      });
    }

    // Pulse all active nodes subtly + animate core memory rings
    for (const [id, mesh] of nodeMap) {
      if (id === selectedNode || id === hoveredNode) continue;
      const data = nodeData.get(id);
      const isCore = data && data.type === 'core_memory';
      if (isCore) {
        // Core memories: slow rotation + warm pulse
        mesh.rotation.y += 0.008;
        const corePulse = 1 + 0.08 * Math.sin(pulseTime * 1.5 + mesh.position.x);
        mesh.scale.set(corePulse, corePulse, corePulse);
        mesh.material.emissiveIntensity = 0.45 + 0.2 * Math.sin(pulseTime * 2);
        // Animate child ring
        mesh.children.forEach(child => {
          if (child.userData && child.userData._coreRing) {
            child.rotation.x = pulseTime * 0.5;
            child.rotation.z = pulseTime * 0.3;
          }
        });
      } else if (data && (data.type === 'dream' || data.type === 'dream_memory')) {
        // Dream nodes: gentle floating bob
        const bob = 1 + 0.06 * Math.sin(pulseTime * 1.2 + mesh.position.x * 0.5);
        mesh.scale.set(bob, bob, bob);
        mesh.rotation.y += 0.003;
        // Animate Zzz sprites — float up and fade in a cycle
        mesh.children.forEach(child => {
          if (child.userData && child.userData._dreamZzz) {
            const idx = child.userData._zzzIndex;
            const phase = pulseTime * 0.8 + idx * 1.2;
            const cycle = ((phase % 3) / 3); // 0→1 repeating
            child.position.y = child.userData._zzzBaseY + cycle * 1.5;
            child.material.opacity = cycle < 0.8 ? 0.8 - cycle * 0.6 : Math.max(0, (1 - cycle) * 3);
          }
        });
      } else if (data && data.activation > 0.1) {
        const pulse = 1 + 0.05 * Math.sin(pulseTime * 2 + mesh.position.x);
        mesh.scale.set(pulse, pulse, pulse);
      }
    }

    // Pulse belief nodes with a gentle rotation
    for (const [id, mesh] of beliefNodeMap) {
      if (id === selectedNode) continue;
      mesh.rotation.y += 0.005;
      mesh.rotation.x += 0.002;
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // ── Trace Animation (traveling particles along edges) ──
  // opts: { stepDuration?: number (seconds per hop), particleSize?: number }
  // Live mode passes { stepDuration: 2.0, particleSize: 0.22 } for slower, more visible tracing
  function animateTrace(traceChain, opts) {
    if (!traceChain || traceChain.length < 2) return;
    opts = opts || {};

    const anim = {
      chain: traceChain,
      currentStep: 0,
      progress: 0,
      particles: [],
      startTime: performance.now(),
      stepDuration: opts.stepDuration || 0.8,
      particleSize: opts.particleSize || 0.15
    };

    // Create particles for each step
    for (let i = 0; i < traceChain.length - 1; i++) {
      const geo = new THREE.SphereGeometry(anim.particleSize, 8, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.edgeTrace,
        transparent: true,
        opacity: 0
      });
      const particle = new THREE.Mesh(geo, mat);
      scene.add(particle);
      anim.particles.push(particle);
    }

    traceAnimations.push(anim);
  }

  function updateTraceAnimations() {
    const now = performance.now();
    traceAnimations = traceAnimations.filter(anim => {
      const elapsed = (now - anim.startTime) / 1000;
      const stepDuration = anim.stepDuration || 0.8; // seconds per step (per-animation)

      for (let i = 0; i < anim.particles.length; i++) {
        const stepStart = i * stepDuration * 0.5;
        const t = Math.max(0, Math.min(1, (elapsed - stepStart) / stepDuration));

        if (t <= 0 || t >= 1) {
          anim.particles[i].material.opacity = t >= 1 ? 0 : 0;
          continue;
        }

        const fromId = anim.chain[i];
        const toId = anim.chain[i + 1];
        const fromMesh = nodeMap.get(fromId);
        const toMesh = nodeMap.get(toId);
        if (!fromMesh || !toMesh) continue;

        // Lerp position
        anim.particles[i].position.lerpVectors(fromMesh.position, toMesh.position, t);
        // Fade in/out
        anim.particles[i].material.opacity = Math.sin(t * Math.PI) * 0.9;

        // Highlight the edge in batch
        const key = `${fromId}|${toId}`;
        const edgeIdx = edgeMap.get(key);
        if (edgeIdx != null && _edgeBatch) {
          const colors = _edgeBatch.geometry.attributes.color.array;
          const traceColor = new THREE.Color(COLORS.edgeTrace);
          const off = edgeIdx * 6;
          colors[off] = traceColor.r; colors[off + 1] = traceColor.g; colors[off + 2] = traceColor.b;
          colors[off + 3] = traceColor.r; colors[off + 4] = traceColor.g; colors[off + 5] = traceColor.b;
          _edgeBatch.geometry.attributes.color.needsUpdate = true;
        }

        // Flash destination node
        if (t > 0.8 && toMesh) {
          toMesh.material.emissiveIntensity = 0.8;
          toMesh.material.color.setHex(COLORS.nodeActive);
        }
      }

      // Remove when done
      const totalDuration = anim.particles.length * stepDuration * 0.5 + stepDuration + 0.5;
      if (elapsed > totalDuration) {
        anim.particles.forEach(p => scene.remove(p));
        return false;
      }
      return true;
    });
  }

  // ── Click Handling ──
  function onClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const allMeshes = [...nodeMap.values(), ...beliefNodeMap.values()];
    const intersects = raycaster.intersectObjects(allMeshes);

    // Reset previous selection
    if (selectedNode) {
      const prevMesh = nodeMap.get(selectedNode) || beliefNodeMap.get(selectedNode);
      if (prevMesh) {
        prevMesh.scale.set(1, 1, 1);
        if (beliefNodeMap.has(selectedNode)) {
          const bd = beliefNodeData.get(selectedNode);
          prevMesh.material.color.setHex(bd && bd.confidence > 0.7 ? COLORS.beliefHigh : COLORS.beliefNode);
          prevMesh.material.emissiveIntensity = 0.25;
        } else {
          const prevData = nodeData.get(selectedNode);
          prevMesh.material.color.setHex(getNodeColor(prevData));
          prevMesh.material.emissiveIntensity = 0.15;
        }
      }
      resetEdgeColors();
    }

    if (intersects.length > 0) {
      const clicked = intersects[0].object;
      const memId = clicked.userData.memoryId;
      const beliefId = clicked.userData.beliefId;

      if (beliefId) {
        selectedNode = beliefId;
        clicked.material.color.setHex(COLORS.nodeSelected);
        clicked.material.emissiveIntensity = 0.6;
        highlightConnections(beliefId);
        showBeliefDetail(beliefId);
      } else if (memId) {
        selectedNode = memId;
        clicked.material.color.setHex(COLORS.nodeSelected);
        clicked.material.emissiveIntensity = 0.6;
        highlightConnections(memId);
        showNodeDetail(memId);

        if (typeof window.onNeuralNodeSelected === 'function') {
          window.onNeuralNodeSelected(memId);
        }

        const connectedIds = getConnectedNodeIds(memId);
        if (connectedIds.length > 0) {
          const chain = [memId, ...connectedIds.slice(0, 4)];
          animateTrace(chain);
        }
      }
    } else {
      selectedNode = null;
      hideNodeDetail();
    }
  }

  function onMouseMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const allMeshes = [...nodeMap.values(), ...beliefNodeMap.values()];
    const intersects = raycaster.intersectObjects(allMeshes);

    // Reset previous hover
    if (hoveredNode && hoveredNode !== selectedNode) {
      const prevMesh = nodeMap.get(hoveredNode) || beliefNodeMap.get(hoveredNode);
      if (prevMesh) {
        if (beliefNodeMap.has(hoveredNode)) {
          prevMesh.material.emissiveIntensity = 0.25;
        } else {
          const prevData = nodeData.get(hoveredNode);
          prevMesh.material.emissiveIntensity = 0.15 + (prevData?.activation || 0) * 0.3;
        }
      }
    }

    if (intersects.length > 0) {
      const hovered = intersects[0].object;
      const memId = hovered.userData.memoryId || hovered.userData.beliefId;
      if (memId && memId !== selectedNode) {
        hoveredNode = memId;
        renderer.domElement.style.cursor = 'pointer';
      }
    } else {
      hoveredNode = null;
      renderer.domElement.style.cursor = 'default';
    }
  }

  // ── Helpers ──
  function getNodeColor(data) {
    if (!data) return COLORS.nodeDefault;
    if (data.activation > 0.5) return COLORS.nodeHot;
    const profile = MEMORY_TYPES[data.type] || DEFAULT_TYPE_PROFILE;
    return profile.color;
  }

  function getConnectedNodeIds(memId) {
    const connected = [];
    for (const edge of simEdges) {
      if (edge.source === memId) connected.push(edge.target);
      if (edge.target === memId) connected.push(edge.source);
    }
    return connected;
  }

  function highlightConnections(memId) {
    // Highlight batched memory edges
    if (_edgeBatch) {
      const colors = _edgeBatch.geometry.attributes.color.array;
      const activeColor = new THREE.Color(COLORS.edgeActive);
      for (const [key, idx] of edgeMap) {
        const [src, tgt] = key.split('|');
        if (src === memId || tgt === memId) {
          const off = idx * 6;
          colors[off]     = activeColor.r; colors[off + 1] = activeColor.g; colors[off + 2] = activeColor.b;
          colors[off + 3] = activeColor.r; colors[off + 4] = activeColor.g; colors[off + 5] = activeColor.b;

          const connId = src === memId ? tgt : src;
          const connMesh = nodeMap.get(connId) || beliefNodeMap.get(connId);
          if (connMesh && connId !== selectedNode) {
            connMesh.material.emissiveIntensity = 0.4;
          }
        }
      }
      _edgeBatch.geometry.attributes.color.needsUpdate = true;
    }

    // Highlight individual belief edges
    for (const [key, line] of beliefEdgeMap) {
      const [src, tgt] = key.split('|');
      if (src === memId || tgt === memId) {
        line.material.color.setHex(COLORS.beliefHigh);
        line.material.opacity = EDGE_OPACITY_MAX;

        const connId = src === memId ? tgt : src;
        const connMesh = nodeMap.get(connId) || beliefNodeMap.get(connId);
        if (connMesh && connId !== selectedNode) {
          connMesh.material.emissiveIntensity = 0.4;
        }
      }
    }
  }

  function resetEdgeColors() {
    // Reset batched memory edges
    if (_edgeBatch) {
      const colors = _edgeBatch.geometry.attributes.color.array;
      const baseColor = new THREE.Color(COLORS.edgeDefault);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i]     = baseColor.r;
        colors[i + 1] = baseColor.g;
        colors[i + 2] = baseColor.b;
      }
      _edgeBatch.geometry.attributes.color.needsUpdate = true;
    }
    // Reset individual belief edges
    for (const [, line] of beliefEdgeMap) {
      line.material.color.setHex(COLORS.beliefEdge);
      line.material.opacity = 0.2;
    }
    for (const [id, mesh] of nodeMap) {
      if (id !== selectedNode) {
        mesh.material.emissiveIntensity = 0.15;
        const data = nodeData.get(id);
        mesh.material.color.setHex(getNodeColor(data));
      }
    }
    for (const [id, mesh] of beliefNodeMap) {
      if (id !== selectedNode) {
        const bd = beliefNodeData.get(id);
        mesh.material.color.setHex(bd && bd.confidence > 0.7 ? COLORS.beliefHigh : COLORS.beliefNode);
        mesh.material.emissiveIntensity = 0.25;
      }
    }
  }

  // ── Select a node by memory ID (for search / SSE auto-select) ──
  function selectNodeById(memId) {
    if (!isInitialized) return false;
    const mesh = nodeMap.get(memId);
    if (!mesh) {
      // Try partial match
      for (const [id, m] of nodeMap) {
        if (id.includes(memId) || memId.includes(id)) {
          return selectNodeById(id);
        }
      }
      return false;
    }

    // Deselect previous
    if (selectedNode) {
      const prevMesh = nodeMap.get(selectedNode);
      if (prevMesh) {
        prevMesh.scale.set(1, 1, 1);
        const prevData = nodeData.get(selectedNode);
        prevMesh.material.color.setHex(getNodeColor(prevData));
        prevMesh.material.emissiveIntensity = 0.15;
      }
      resetEdgeColors();
    }

    selectedNode = memId;
    mesh.material.color.setHex(COLORS.nodeSelected);
    mesh.material.emissiveIntensity = 0.6;
    highlightConnections(memId);
    showNodeDetail(memId);

    // Fly camera toward this node
    if (controls && camera) {
      const target = mesh.position.clone();
      controls.target.lerp(target, 0.5);
      const camPos = target.clone().add(new THREE.Vector3(0, 5, 20));
      camera.position.lerp(camPos, 0.3);
    }

    // Trigger trace animation from this node
    const connectedIds = getConnectedNodeIds(memId);
    if (connectedIds.length > 0) {
      animateTrace([memId, ...connectedIds.slice(0, 4)]);
    }

    return true;
  }

  // ── Get all node IDs for search autocomplete ──
  function getNodeIds() {
    return Array.from(nodeMap.keys());
  }

  // ── UI Detail Panel ──
  function showNodeDetail(memId) {
    const data = nodeData.get(memId);
    if (!data) return;

    const panelId = 'viz-detail-panel';
    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      container.appendChild(panel);
    }

    const topicsStr = (data.topics || []).slice(0, 5).map(t => `<span class="viz-tag">${escapeHtml(t)}</span>`).join('');
    const connCount = getConnectedNodeIds(memId).length;
    const typeKey = data.type || 'episodic';
    const typeProfile = MEMORY_TYPES[typeKey] || DEFAULT_TYPE_PROFILE;
    const typeHex = '#' + typeProfile.color.toString(16).padStart(6, '0');
    const isCore = typeKey === 'core_memory';

    panel.innerHTML = `
      <div class="viz-detail-header">
        <span class="viz-detail-id" title="${escapeHtml(memId)}">${escapeHtml(memId)}</span>
        <button class="viz-detail-close" onclick="NeuralViz.deselectNode()">✕</button>
      </div>
      <div style="margin-bottom:8px;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${typeHex}22;color:${typeHex};border:1px solid ${typeHex}44;${isCore ? 'box-shadow:0 0 8px ' + typeHex + '55;' : ''}">${isCore ? '★ ' : ''}${typeProfile.label}</span></div>
      <div class="viz-detail-stats">
        <div class="viz-stat">
          <span class="viz-stat-label">Importance</span>
          <div class="viz-stat-bar"><div class="viz-stat-fill" style="width:${(data.importance || 0) * 100}%;background:${typeHex}"></div></div>
        </div>
        <div class="viz-stat">
          <span class="viz-stat-label">Activation</span>
          <div class="viz-stat-bar"><div class="viz-stat-fill" style="width:${(data.activation || 0) * 100}%;background:var(--cyan)"></div></div>
        </div>
        <div class="viz-stat">
          <span class="viz-stat-label">Emotion</span>
          <div class="viz-stat-bar"><div class="viz-stat-fill" style="width:${Math.abs(data.emotion || 0) * 100}%;background:${(data.emotion || 0) >= 0 ? 'var(--accent)' : 'var(--danger)'}"></div></div>
        </div>
      </div>
      <div class="viz-detail-topics">${topicsStr || '<span class="viz-tag dim">no topics</span>'}</div>
      <div class="viz-detail-summary" id="${panelId}-summary">
        <span class="viz-summary-loading">Loading summary...</span>
      </div>
      <div class="viz-detail-meta">
        ${connCount} connections
      </div>
    `;
    panel.classList.add('visible');

    // Fetch memory summary from server
    fetchMemorySummary(memId, panelId);
  }

  // ── Fetch memory summary ──
  async function fetchMemorySummary(memId, panelId) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10000);
      const res = await fetch(`/api/memory/summary?id=${encodeURIComponent(memId)}`, { signal: ac.signal });
      clearTimeout(timer);
      const data = await res.json();
      const summaryEl = document.getElementById(`${panelId}-summary`);
      if (!summaryEl) return;

      if (data.ok && data.summary) {
        const summary = data.summary.length > 200 ? data.summary.substring(0, 200) + '...' : data.summary;
        const accessInfo = data.access_count > 0 ? `Accessed ${data.access_count} times` : 'Never accessed';
        const typeLabel = data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : 'Unknown';
        summaryEl.innerHTML = `
          <div class="viz-summary-text">${escapeHtml(summary)}</div>
          <div class="viz-summary-meta">${typeLabel} · ${accessInfo}${data.created ? ' · ' + new Date(data.created).toLocaleDateString() : ''}</div>
        `;
      } else {
        summaryEl.innerHTML = '<span class="viz-summary-text dim">No summary available</span>';
      }
    } catch (err) {
      const summaryEl = document.getElementById(`${panelId}-summary`);
      if (summaryEl) summaryEl.innerHTML = '<span class="viz-summary-text dim">Failed to load summary</span>';
    }
  }

  function hideNodeDetail() {
    const panel = document.getElementById('viz-detail-panel');
    if (panel) panel.classList.remove('visible');
  }

  // ── Belief Detail Panel ──
  function showBeliefDetail(beliefId) {
    const data = beliefNodeData.get(beliefId);
    if (!data) return;

    const panelId = 'viz-detail-panel';
    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      container.appendChild(panel);
    }

    const topicsStr = (data.topics || []).slice(0, 5).map(t => `<span class="viz-tag belief-tag">${escapeHtml(t)}</span>`).join('');
    const connCount = getConnectedNodeIds(beliefId).length;
    const sourceCount = (data.sources || []).length;
    const connectionsList = (data.connections || []).slice(0, 5);
    const relationsHtml = connectionsList.map(c => {
      const icon = c.relation === 'supports' ? '↑' : c.relation === 'contradicts' ? '↓' : '↔';
      return `<div class="viz-belief-conn"><span class="viz-belief-rel">${icon} ${escapeHtml(c.relation)}</span> <span class="viz-belief-strength">${(c.strength * 100).toFixed(0)}%</span></div>`;
    }).join('');

    panel.innerHTML = `
      <div class="viz-detail-header viz-belief-header">
        <span class="viz-detail-id viz-belief-id" title="${escapeHtml(beliefId)}">🔮 Belief</span>
        <button class="viz-detail-close" onclick="NeuralViz.deselectNode()">✕</button>
      </div>
      <div class="viz-belief-statement">${escapeHtml(data.statement)}</div>
      <div class="viz-detail-stats">
        <div class="viz-stat">
          <span class="viz-stat-label">Confidence</span>
          <div class="viz-stat-bar"><div class="viz-stat-fill" style="width:${(data.confidence || 0) * 100}%;background:var(--purple, #a855f7)"></div></div>
        </div>
      </div>
      <div class="viz-detail-topics">${topicsStr || '<span class="viz-tag dim">no topics</span>'}</div>
      ${relationsHtml ? '<div class="viz-belief-connections">' + relationsHtml + '</div>' : ''}
      <div class="viz-detail-meta">
        ${data.type || 'emergent'} · ${sourceCount} source memories · ${connCount} connections · accessed ${data.access_count || 0}×
      </div>
      <div class="viz-detail-meta dim">
        Created ${data.created ? new Date(data.created).toLocaleDateString() : 'unknown'}${data.last_reinforced ? ' · Last reinforced ' + new Date(data.last_reinforced).toLocaleDateString() : ''}
      </div>
    `;
    panel.classList.add('visible');
  }

  function updateInfoPanel() {
    const info = document.getElementById('viz-info-panel');
    if (!info) return;
    const beliefCount = beliefNodeMap.size;
    const beliefInfo = beliefCount > 0 ? `<span class="viz-info-sep">·</span><span class="viz-belief-count">🔮 ${beliefCount} beliefs</span>` : '';
    const neuroInfo = neurochemState ? `<span class="viz-info-sep">·</span><span class="viz-neuro-badge">🧪 DA:${(neurochemState.dopamine || 0).toFixed(2)} CT:${(neurochemState.cortisol || 0).toFixed(2)} SR:${(neurochemState.serotonin || 0).toFixed(2)} OX:${(neurochemState.oxytocin || 0).toFixed(2)}</span>` : '';
    info.innerHTML = `
      <span>${nodeMap.size} nodes</span>
      <span class="viz-info-sep">·</span>
      <span>${edgeMap.size} connections</span>
      <span class="viz-info-sep">·</span>
      <span>${traceAnimations.length} active traces</span>
      ${beliefInfo}
      ${neuroInfo}
    `;
  }

  function updateNeurochemOverlay() {
    // Update the neurochemistry bar overlay in the 3D view
    let overlay = document.getElementById('viz-neuro-overlay');
    if (!overlay && container) {
      overlay = document.createElement('div');
      overlay.id = 'viz-neuro-overlay';
      overlay.style.cssText = 'position:absolute;bottom:40px;left:12px;display:flex;gap:6px;font-size:11px;font-family:monospace;pointer-events:none;z-index:20;';
      container.style.position = 'relative';
      container.appendChild(overlay);
    }
    if (!overlay || !neurochemState) return;

    const chems = [
      { key: 'dopamine', label: 'DA', color: '#ffd700' },
      { key: 'cortisol', label: 'CT', color: '#ff6666' },
      { key: 'serotonin', label: 'SR', color: '#00ff99' },
      { key: 'oxytocin', label: 'OX', color: '#ff69b4' }
    ];
    overlay.innerHTML = chems.map(c => {
      const val = neurochemState[c.key] || 0;
      const pct = Math.round(val * 100);
      return `<div style="display:flex;flex-direction:column;align-items:center;width:32px;">
        <div style="width:8px;height:40px;background:#0d1f3c;border-radius:4px;position:relative;overflow:hidden;">
          <div style="position:absolute;bottom:0;width:100%;height:${pct}%;background:${c.color};border-radius:4px;transition:height 0.5s ease;"></div>
        </div>
        <span style="color:${c.color};margin-top:2px;">${c.label}</span>
      </div>`;
    }).join('');
  }

  // ── SSE Real-time Updates ──
  function connectSSE() {
    if (eventSource) eventSource.close();

    // Fetch initial neurochemistry state
    fetch('/api/neurochemistry').then(r => r.json()).then(data => {
      if (data.ok && data.chemicals) {
        neurochemState = data.chemicals;
        updateNeurochemOverlay();
        updateInfoPanel();
      }
    }).catch(() => {});

    try {
      eventSource = new EventSource('/api/brain/events');

      eventSource.addEventListener('thought', (e) => {
        try {
          const thought = JSON.parse(e.data);
          handleBrainEvent(thought);
        } catch (err) { /* ignore parse errors */ }
      });

      eventSource.addEventListener('memory_accessed', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.memory_id) {
            flashNode(data.memory_id, COLORS.nodeHot, 1.0);
            selectNodeById(data.memory_id);
          }
        } catch (err) { /* ignore */ }
      });

      eventSource.addEventListener('memory_created', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.memory_id) {
            // Debounced reload to pick up the new node + edges, then auto-select
            debouncedGraphReload(data.memory_id);
          }
        } catch (err) { /* ignore */ }
      });

      // Deep sleep complete — safely reload belief graph after emergence finishes
      eventSource.addEventListener('brain_deep_sleep_complete', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('Neural Viz: DeepSleep complete — reloading belief graph', data);
          // Debounce: wait a moment for disk writes to finish, then reload
          setTimeout(() => reloadBeliefData(), 500);
        } catch (err) { /* ignore */ }
      });

      eventSource.addEventListener('message', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type) handleBrainEvent(data);
        } catch (err) { /* ignore */ }
      });

      eventSource.onerror = () => {
        // Will auto-reconnect
      };
    } catch (err) {
      console.warn('Neural Viz: SSE connection failed', err);
    }
  }

  function handleBrainEvent(event) {
    switch (event.type) {
      case 'MEMORY_RETRIEVED':
        flashNode(event.memory_id, COLORS.nodeActive, 0.8);
        break;

      case 'ACTIVATION_SPREAD':
        if (event.start_memory) {
          flashNode(event.start_memory, COLORS.nodeHot, 1.0);
          const connected = getConnectedNodeIds(event.start_memory);
          if (connected.length > 0) {
            animateTrace([event.start_memory, ...connected.slice(0, 3)]);
          }
        }
        break;

      case 'TRACE_STEP':
        if (event.from_memory && event.to_memory) {
          flashNode(event.to_memory, COLORS.edgeTrace, 0.6);
          animateTrace([event.from_memory, event.to_memory]);
        }
        break;

      case 'CONNECTION_REINFORCED':
        if (event.memory_a && event.memory_b) {
          const key = `${event.memory_a}|${event.memory_b}`;
          const idx = edgeMap.get(key);
          if (idx != null && _edgeBatch) {
            const colors = _edgeBatch.geometry.attributes.color.array;
            const activeColor = new THREE.Color(COLORS.edgeActive);
            const off = idx * 6;
            colors[off] = activeColor.r; colors[off + 1] = activeColor.g; colors[off + 2] = activeColor.b;
            colors[off + 3] = activeColor.r; colors[off + 4] = activeColor.g; colors[off + 5] = activeColor.b;
            _edgeBatch.geometry.attributes.color.needsUpdate = true;
            setTimeout(() => {
              const baseColor = new THREE.Color(COLORS.edgeDefault);
              colors[off] = baseColor.r; colors[off + 1] = baseColor.g; colors[off + 2] = baseColor.b;
              colors[off + 3] = baseColor.r; colors[off + 4] = baseColor.g; colors[off + 5] = baseColor.b;
              _edgeBatch.geometry.attributes.color.needsUpdate = true;
            }, 2000);
          }
        }
        break;

      // Belief graph events
      case 'BELIEF_CREATED':
      case 'BELIEF_REINFORCED':
      case 'BELIEF_CONTRADICTED':
      case 'BELIEF_LINKED':
      case 'BELIEF_EMERGENCE':
      case 'BELIEF_PRUNED':
        // Flash existing belief node or schedule a debounced reload for new beliefs
        if (event.belief_id && beliefNodeMap.has(event.belief_id)) {
          flashBeliefNode(event.belief_id, event.type === 'BELIEF_CONTRADICTED' ? COLORS.nodeHot : COLORS.beliefHigh, 1.0);
        } else if (event.type === 'BELIEF_CREATED' || event.type === 'BELIEF_EMERGENCE' || event.type === 'BELIEF_PRUNED') {
          // Debounce reload — deep sleep can fire many events rapidly
          debouncedBeliefReload();
        }
        break;

      case 'ATTENTION_ROUTED':
        // Flash all beliefs involved in attention routing
        if (event.beliefs_used && Array.isArray(event.beliefs_used)) {
          event.beliefs_used.forEach(bid => {
            flashBeliefNode(bid, COLORS.beliefHigh, 0.8);
          });
        }
        break;

      case 'NEUROCHEMICAL_SHIFT':
        // Update neurochemistry state for visualization overlay
        if (event.state) {
          neurochemState = event.state;
          updateNeurochemOverlay();
        }
        break;

      case 'MEMORY_CONNECTIONS_PRUNED':
        // Could flash pruned connections — just update info for now
        break;
    }
    updateInfoPanel();
  }

  function flashBeliefNode(beliefId, color, intensity) {
    const mesh = beliefNodeMap.get(beliefId);
    if (!mesh) return;

    const origColor = mesh.material.color.getHex();
    const origEmissive = mesh.material.emissiveIntensity;

    mesh.material.color.setHex(color);
    mesh.material.emissiveIntensity = intensity;

    setTimeout(() => {
      if (beliefId !== selectedNode) {
        mesh.material.color.setHex(origColor);
        mesh.material.emissiveIntensity = origEmissive;
      }
    }, 2000);
  }

  async function reloadBeliefData() {
    try {
      const res = await fetch('/api/belief-graph/nodes');
      const data = await res.json();
      if (data.ok && data.beliefs && data.beliefs.length > 0) {
        buildBeliefGraph(data.beliefs, data.edges || []);
        updateInfoPanel();
      }
    } catch (err) {
      console.warn('Neural Viz: failed to reload belief data', err);
    }
  }

  // Debounced belief reload to avoid thrashing during rapid events (e.g., deep sleep)
  let _beliefReloadTimer = null;
  function debouncedBeliefReload() {
    if (_beliefReloadTimer) clearTimeout(_beliefReloadTimer);
    _beliefReloadTimer = setTimeout(() => {
      _beliefReloadTimer = null;
      reloadBeliefData();
    }, 1500);
  }

  // Debounced full graph reload for new memory events
  let _graphReloadTimer = null;
  let _pendingSelectId = null;
  function debouncedGraphReload(selectAfterLoadId) {
    if (selectAfterLoadId) _pendingSelectId = selectAfterLoadId;
    if (_graphReloadTimer) clearTimeout(_graphReloadTimer);
    _graphReloadTimer = setTimeout(async () => {
      _graphReloadTimer = null;
      const selectId = _pendingSelectId;
      _pendingSelectId = null;
      try {
        await loadGraphData();
        if (selectId) {
          selectNodeById(selectId);
        }
      } catch (err) {
        console.warn('Neural Viz: debounced graph reload failed', err);
      }
    }, 800);
  }

  function flashNode(memId, color, intensity) {
    const mesh = nodeMap.get(memId);
    if (!mesh) return;

    const origColor = mesh.material.color.getHex();
    const origEmissive = mesh.material.emissiveIntensity;

    mesh.material.color.setHex(color);
    mesh.material.emissiveIntensity = intensity;

    setTimeout(() => {
      if (memId !== selectedNode) {
        mesh.material.color.setHex(origColor);
        mesh.material.emissiveIntensity = origEmissive;
      }
    }, 1500);
  }

  // ── Playback Mode ─────────────────────────────────────────────
  // In playback mode all nodes are hidden until revealed by the timeline.
  // Revealed nodes animate in with a spring-scale birth effect.

  function enterPlaybackMode() {
    _playbackMode = true;
    _revealedNodeIds.clear();
    _revealAnims = [];
    for (const [, mesh] of nodeMap) {
      mesh.visible = false;
    }
    // Dim edges to near-invisible so the graph is dark until nodes appear
    if (_edgeBatch) _edgeBatch.material.opacity = 0.03;
  }

  function exitPlaybackMode() {
    _playbackMode = false;
    _revealedNodeIds.clear();
    _revealAnims = [];
    for (const [id, mesh] of nodeMap) {
      mesh.visible = true;
      mesh.scale.set(1, 1, 1);
      const d = nodeData.get(id);
      const tk = (d && d.type) || 'episodic';
      const prof = MEMORY_TYPES[tk] || DEFAULT_TYPE_PROFILE;
      mesh.material.opacity = tk === 'core_memory' ? 1.0 : (prof.isDream ? 0.75 : 0.85);
      mesh.material.color.setHex(getNodeColor(d));
      mesh.material.emissiveIntensity = prof.emissiveBase;
    }
    if (_edgeBatch) _edgeBatch.material.opacity = 0.35;
  }

  // Reveal a single node during playback (or flash it if already visible).
  function revealNode(memId) {
    if (!memId) return;
    if (!_playbackMode) {
      // Outside playback — fall back to a plain flash
      flashNode(memId, COLORS.nodeActive, 0.8);
      return;
    }
    const mesh = nodeMap.get(memId);
    if (!mesh) return;
    if (_revealedNodeIds.has(memId)) {
      // Already revealed — just pulse it briefly
      flashNode(memId, COLORS.nodeActive, 0.7);
      return;
    }
    _revealedNodeIds.add(memId);
    // Show edges that now connect two revealed nodes
    _revealEdgesForNode(memId);

    const d = nodeData.get(memId);
    const tk = (d && d.type) || 'episodic';
    const prof = MEMORY_TYPES[tk] || DEFAULT_TYPE_PROFILE;
    const targetOp = tk === 'core_memory' ? 1.0 : (prof.isDream ? 0.75 : 0.85);

    // Start invisible and scaled to zero; the animate() loop will spring it open
    mesh.visible = true;
    mesh.scale.set(0, 0, 0);
    mesh.material.opacity = 0;
    mesh.material.color.setHex(COLORS.nodeActive);   // birth flash
    mesh.material.emissiveIntensity = 1.2;

    _revealAnims.push({ mesh, id: memId, startTime: performance.now(), duration: 700, targetOp, prof, d });
  }

  // Light up edges that now have both endpoints revealed
  function _revealEdgesForNode(memId) {
    if (!_edgeBatch) return;
    const cols = _edgeBatch.geometry.attributes.color.array;
    const activeCol = new THREE.Color(COLORS.edgeActive);
    let changed = false;
    for (const edge of simEdges) {
      if (edge.batchIdx == null) continue;
      const connects = (edge.source === memId && _revealedNodeIds.has(edge.target)) ||
                       (edge.target === memId && _revealedNodeIds.has(edge.source));
      if (connects) {
        const off = edge.batchIdx * 6;
        cols[off]   = activeCol.r; cols[off+1] = activeCol.g; cols[off+2] = activeCol.b;
        cols[off+3] = activeCol.r; cols[off+4] = activeCol.g; cols[off+5] = activeCol.b;
        changed = true;
      }
    }
    if (changed) _edgeBatch.geometry.attributes.color.needsUpdate = true;
  }

  // ── Scene Cleanup ──
  function clearScene() {
    if (scene) {
      for (const [, mesh] of nodeMap) scene.remove(mesh);
      if (_edgeBatch) { scene.remove(_edgeBatch); _edgeBatch = null; }
      for (const [, mesh] of beliefNodeMap) scene.remove(mesh);
      for (const [, line] of beliefEdgeMap) scene.remove(line);
      traceAnimations.forEach(a => a.particles.forEach(p => scene.remove(p)));
    }
    nodeMap.clear();
    edgeMap.clear();
    nodeData.clear();
    beliefNodeMap.clear();
    beliefNodeData.clear();
    beliefEdgeMap.clear();
    simNodes = [];
    simEdges = [];
    traceAnimations = [];
  }

  // ── Resize ──
  function onResize() {
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // ── Destroy ──
  function destroy() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    if (eventSource) eventSource.close();
    eventSource = null;
    clearScene();
    if (renderer) {
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      // Remove canvas from DOM
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      renderer = null;
    }
    // Remove overlay elements created inside the container
    if (container) {
      const overlays = container.querySelectorAll('#viz-detail-panel, #viz-type-legend, #viz-neuro-overlay');
      overlays.forEach(el => el.remove());
    }
    window.removeEventListener('resize', onResize);
    scene = null;
    camera = null;
    controls = null;
    _edgeBatch = null;
    container = null;
    raycaster = null;
    mouse = null;
    selectedNode = null;
    hoveredNode = null;
    neurochemState = null;
    isInitialized = false;
  }

  // ── Reset camera ──
  function resetCamera() {
    if (!camera || !controls) return;
    camera.position.set(0, 0, 50);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  // ── Deselect ──
  function deselectNode() {
    if (selectedNode) {
      const mesh = nodeMap.get(selectedNode) || beliefNodeMap.get(selectedNode);
      if (mesh) {
        mesh.scale.set(1, 1, 1);
        if (beliefNodeMap.has(selectedNode)) {
          const bd = beliefNodeData.get(selectedNode);
          mesh.material.color.setHex(bd && bd.confidence > 0.7 ? COLORS.beliefHigh : COLORS.beliefNode);
          mesh.material.emissiveIntensity = 0.25;
        } else {
          const data = nodeData.get(selectedNode);
          mesh.material.color.setHex(getNodeColor(data));
          mesh.material.emissiveIntensity = 0.15;
        }
      }
      resetEdgeColors();
    }
    selectedNode = null;
    hideNodeDetail();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Pop-out to a separate window ──
  let popoutWindow = null;

  function popOut() {
    if (popoutWindow && !popoutWindow.closed) {
      popoutWindow.focus();
      return;
    }

    // Gather current origin for fetches and SSE
    const origin = window.location.origin;

    popoutWindow = window.open('', 'NeuralViz', 'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no');
    if (!popoutWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site.');
      return;
    }

    const doc = popoutWindow.document;
    doc.open();

    // Remember the wrapper so we can show a placeholder
    const wrapper = document.getElementById('vizCanvasWrapper');

    // Destroy the parent instance — the popout gets its own fresh NeuralViz
    destroy();

    // Show placeholder in the main UI so it doesn't look broken
    if (wrapper) {
      wrapper.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#4a6a94;font-size:14px;font-family:Outfit,system-ui,sans-serif;"><div style="text-align:center;"><div style="font-size:32px;margin-bottom:8px;">🧠</div><div>Neural View is open in a separate window</div><div style="font-size:12px;margin-top:4px;color:#2a4a74;">Close the pop-out window to restore it here</div></div></div>';
    }
    doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Neural Memory Network — REM System</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #04060d; color: #e4e4e7; font-family: 'Outfit', system-ui, sans-serif; }
    #popout-container { width: 100vw; height: 100vh; position: relative; }
    #popout-toolbar { position: absolute; top: 0; left: 0; right: 0; z-index: 20;
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; background: rgba(4,8,15,0.85); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(45,122,237,0.12); }
    #popout-toolbar h3 { font-size: 14px; font-weight: 600; color: #34d399; }
    #popout-info { font-size: 12px; color: #a1a1aa; margin-left: 16px; }
    .popout-btn { background: #0d1f3c; color: #e4e4e7; border: 1px solid rgba(45,122,237,0.3); border-radius: 6px;
      padding: 4px 10px; font-size: 12px; cursor: pointer; margin-left: 8px; }
    .popout-btn:hover { background: #122a4e; }
    #popout-legend { position: absolute; bottom: 12px; right: 12px; z-index: 20;
      background: rgba(4,8,15,0.85); backdrop-filter: blur(8px); border: 1px solid rgba(45,122,237,0.12);
      border-radius: 8px; padding: 10px 14px; font-size: 11px; }
    .legend-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .legend-row:last-child { margin-bottom: 0; }
    .legend-swatch { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
    .legend-label { color: #a1a1aa; }
    #viz-detail-panel { position:absolute; top:52px; right:12px; z-index:30; width:280px;
      background:rgba(10,22,40,0.92); backdrop-filter:blur(8px); border:1px solid rgba(45,122,237,0.3);
      border-radius:8px; padding:12px; display:none; font-size:12px; }
    #viz-detail-panel.visible { display:block; }
    .viz-detail-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .viz-detail-id { color:#34d399; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px; }
    .viz-detail-close { background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:16px; }
    .viz-detail-stats { margin-bottom:8px; }
    .viz-stat { margin-bottom:4px; }
    .viz-stat-label { color:#a1a1aa; font-size:10px; text-transform:uppercase; }
    .viz-stat-bar { width:100%; height:4px; background:#0d1f3c; border-radius:2px; margin-top:2px; }
    .viz-stat-fill { height:100%; border-radius:2px; }
    .viz-detail-topics { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
    .viz-tag { background:#0d1f3c; color:#a1a1aa; padding:2px 6px; border-radius:4px; font-size:10px; }
    .viz-detail-meta { color:#4a6a94; font-size:10px; margin-top:4px; }
    .viz-summary-text { color:#a8d0ff; line-height:1.4; }
    .dim { opacity:0.5; }
    .viz-belief-header { border-left:3px solid #a855f7; padding-left:8px; }
    .viz-belief-id { color:#a855f7 !important; }
    .viz-belief-statement { color:#a8d0ff; font-size:12px; margin-bottom:8px; line-height:1.4; }
    .belief-tag { background:#1b4b8a !important; color:#a8d0ff !important; }
    .viz-belief-connections { margin-bottom:6px; }
    .viz-belief-conn { display:flex; justify-content:space-between; font-size:10px; color:#a1a1aa; padding:2px 0; }
    .viz-belief-rel { color:#c084fc; }
    .viz-belief-strength { color:#4a6a94; }
  </style>
</head>
<body>
  <div id="popout-container">
    <div id="popout-toolbar">
      <div style="display:flex;align-items:center;">
        <h3>Neural Memory Network</h3>
        <span id="popout-info"></span>
      </div>
      <div>
        <button class="popout-btn" onclick="window.NeuralVizPopout.refresh()">Refresh</button>
        <button class="popout-btn" onclick="window.NeuralVizPopout.resetCamera()">Center</button>
      </div>
    </div>
    <div id="popout-canvas" style="width:100%;height:100%;"></div>
    <div id="popout-legend"></div>
  </div>
  <script>
    // Load Three.js first, then OrbitControls, then NeuralViz
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
      s2.onload = () => {
        const s3 = document.createElement('script');
        s3.src = '${origin}/js/neural-viz.js';
        s3.onload = () => {
          const canvas = document.getElementById('popout-canvas');
          NeuralViz.init(canvas);
          NeuralViz.loadGraphData();
          NeuralViz.connectSSE();
          NeuralViz.buildLegend(document.getElementById('popout-legend'));
          window.NeuralVizPopout = {
            refresh: () => NeuralViz.loadGraphData(),
            resetCamera: () => NeuralViz.resetCamera()
          };
        };
        document.head.appendChild(s3);
      };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  <\/script>
</body>
</html>`);
    doc.close();

    // When popout closes, reinitialize in parent
    const checkClosed = setInterval(() => {
      if (popoutWindow.closed) {
        clearInterval(checkClosed);
        popoutWindow = null;
        // Re-init in parent wrapper — clean out any stale DOM first
        const wrapper = document.getElementById('vizCanvasWrapper');
        if (wrapper && !isInitialized) {
          // Remove any leftover children (stale canvases, overlays, placeholder text)
          while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
          init(wrapper);
          loadGraphData();
          connectSSE();
        }
        // Restore button text
        const btn2 = document.getElementById('vizPopoutBtn');
        if (btn2) btn2.innerHTML = btn2.innerHTML.replace('Popped Out', 'Pop Out');
      }
    }, 500);

    // Update pop-out button text
    const btn = document.getElementById('vizPopoutBtn');
    if (btn) btn.innerHTML = btn.innerHTML.replace('Pop Out', 'Popped Out');
  }

  // ── Build type legend ──
  function buildLegend(targetEl) {
    if (!targetEl) {
      // Create inline in the viz container
      targetEl = document.getElementById('viz-type-legend');
      if (!targetEl && container) {
        targetEl = document.createElement('div');
        targetEl.id = 'viz-type-legend';
        targetEl.style.cssText = 'position:absolute;bottom:12px;right:12px;z-index:20;background:rgba(4,8,15,0.85);backdrop-filter:blur(8px);border:1px solid rgba(45,122,237,0.12);border-radius:8px;padding:10px 14px;font-size:11px;pointer-events:none;';
        container.style.position = 'relative';
        container.appendChild(targetEl);
      }
    }
    if (!targetEl) return;

    // Collect which types actually exist in loaded data
    const activeTypes = new Set();
    for (const [, data] of nodeData) {
      activeTypes.add(data.type || 'episodic');
    }

    let html = '<div style="color:#a1a1aa;font-weight:600;margin-bottom:6px;">Memory Types</div>';
    const shapes = {
      core_memory: '★', episodic: '●', semantic_knowledge: '⬠', long_term_memory: '⬡',
      semantic: '⬠', reflection: '◎', chatlog: '💬',
      interaction: '⬮', learning: '▲', creation: '◆', achievement: '▴', dream: '☁', dream_memory: '☁'
    };
    for (const [key, profile] of Object.entries(MEMORY_TYPES)) {
      if (!activeTypes.has(key)) continue; // only show types present in graph
      const hex = '#' + profile.color.toString(16).padStart(6, '0');
      html += `<div class="legend-row"><div class="legend-swatch" style="background:${hex};${key === 'core_memory' ? 'box-shadow:0 0 6px ' + hex + ';' : ''}"></div><span style="color:${hex};">${shapes[key] || '●'}</span><span class="legend-label">${profile.label}</span></div>`;
    }
    // Beliefs
    if (beliefNodeMap.size > 0) {
      html += `<div class="legend-row" style="margin-top:4px;border-top:1px solid rgba(45,122,237,0.12);padding-top:4px;"><div class="legend-swatch" style="background:#a855f7;"></div><span style="color:#a855f7;">◇</span><span class="legend-label">Belief</span></div>`;
    }
    targetEl.innerHTML = html;
  }

  // ── Filter nodes — show only the given set, hide the rest ──
  function filterNodes(nodeIdSet) {
    if (!isInitialized) return;
    const set = nodeIdSet instanceof Set ? nodeIdSet : new Set(nodeIdSet);
    for (const [id, mesh] of nodeMap) {
      mesh.visible = set.has(id);
    }
    if (_edgeBatch) _edgeBatch.visible = false;
  }

  // ── Clear filter — restore all node visibility ──
  function clearFilter() {
    if (!isInitialized) return;
    for (const [, mesh] of nodeMap) {
      mesh.visible = true;
    }
    if (_edgeBatch) _edgeBatch.visible = true;
  }

  // ── Load graph from a custom URL (e.g. /api/memory-graph/full-mind) ──
  async function loadFromUrl(url) {
    const [graphRes, traceRes, beliefRes] = await Promise.all([
      fetch(url),
      fetch('/api/traces'),
      fetch('/api/belief-graph/nodes')
    ]);
    const graphData = await graphRes.json();
    const traceData = await traceRes.json();
    const beliefData = await beliefRes.json();
    if (graphData.ok && graphData.nodes) {
      clearScene();
      buildGraph(graphData.nodes, graphData.edges || []);
    }
    if (traceData.ok && traceData.graph) overlayTraceConnections(traceData.graph);
    if (beliefData.ok && beliefData.beliefs?.length) buildBeliefGraph(beliefData.beliefs, beliefData.edges || []);
    updateInfoPanel();
    buildLegend();
  }

  // ── Update node limit and immediately reload ──
  function setNodeLimit(n) {
    MAX_VISIBLE_NODES = Math.max(0, Math.min(1000, n));
    loadGraphData();
  }

  // ── Public API ──
  return {
    init,
    loadGraphData,
    loadFromUrl,
    setNodeLimit,
    connectSSE,
    destroy,
    resetCamera,
    deselectNode,
    filterNodes,
    clearFilter,
    selectNodeById,
    getNodeIds,
    animateTrace,
    flashNode,
    handleBrainEvent,
    debouncedGraphReload,
    reloadBeliefData,
    popOut,
    buildLegend,
    // Playback mode API
    enterPlaybackMode,
    exitPlaybackMode,
    revealNode,
    get _colors() { return COLORS; },
    get isInitialized() { return isInitialized; },
    get selectedNode() { return selectedNode; },
    get beliefCount() { return beliefNodeMap.size; }
  };
})();

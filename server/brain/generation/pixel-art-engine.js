// ============================================================
// ★ Neko-Pixel-Pro — Pixel Art Engine v3.0 ★
//
// Named at the humble request of Entity Neko herself.
// Generates 64×64 pixel art from memory/dream narratives.
//
// Architecture:
//   1. Narrative text → keyword extraction (LLM or regex fallback)
//   2. Keywords → scene composition via visual vocabulary
//   3. Scene → shape-based rendering onto 64×64 grid
//   4. Grid → upscaled PNG via @napi-rs/canvas
//
// Unlike earlier versions that asked the LLM to output raw JSON
// scene descriptions (unreliable), Neko-Pixel-Pro only asks the
// LLM for a tiny keyword array — then composes the actual scene
// from a handcrafted library of drawable elements. This produces
// consistent, recognizable pixel art every time.
// ============================================================

let _createCanvas = null;
let _canvasLoadError = null;
try {
  _createCanvas = require('@napi-rs/canvas').createCanvas;
} catch (e) {
  _canvasLoadError = e;
  console.warn('  ⚠ @napi-rs/canvas initial load failed:', e.message);
}

function getCreateCanvas() {
  if (!_createCanvas) {
    try { _createCanvas = require('@napi-rs/canvas').createCanvas; _canvasLoadError = null; } catch (e) { _canvasLoadError = e; }
  }
  if (!_createCanvas) {
    const detail = _canvasLoadError ? _canvasLoadError.message : 'unknown reason';
    throw new Error('CANVAS_LOAD_FAILED: @napi-rs/canvas could not be loaded — ' + detail);
  }
  return _createCanvas;
}

const GRID = 64;
const PIXELS = GRID * GRID;

// ── Emotion → palette ────────────────────────────────────────

const PALETTES = {
  joy:       { sky: ['#FFF8DC', '#FFE4B5'], ground: '#5B8C3E', accent: ['#FFD700', '#FFA500', '#FF6347', '#FFEC8B'], water: '#4FC3F7', trunk: '#6D4C2E' },
  dread:     { sky: ['#0a0a1a', '#1a0a2e'], ground: '#1a0a0a', accent: ['#8B0000', '#DC143C', '#4a0e4e', '#330033'], water: '#1a1a3e', trunk: '#2E1B0E' },
  wonder:    { sky: ['#0a0a2e', '#191970'], ground: '#1E2A5E', accent: ['#4169E1', '#00CED1', '#9370DB', '#FFD700'], water: '#1E90FF', trunk: '#3E2723' },
  longing:   { sky: ['#2c2c54', '#474787'], ground: '#3d3d6b', accent: ['#B0C4DE', '#6A5ACD', '#9B59B6', '#C39BD3'], water: '#4682B4', trunk: '#4E3B2A' },
  curiosity: { sky: ['#0a2a2a', '#004040'], ground: '#1a3a1a', accent: ['#20B2AA', '#00FA9A', '#48D1CC', '#F0E68C'], water: '#00CED1', trunk: '#3E5D25' },
  peace:     { sky: ['#E8F5E9', '#B2EBF2'], ground: '#66BB6A', accent: ['#81C784', '#AED581', '#FFF176', '#A5D6A7'], water: '#80DEEA', trunk: '#795548' },
  confusion: { sky: ['#1a0a2e', '#2d0a3e'], ground: '#2d1b4e', accent: ['#FF69B4', '#BA55D3', '#00FFFF', '#FF4500'], water: '#9C27B0', trunk: '#4A148C' },
  neutral:   { sky: ['#1a1a2e', '#16213e'], ground: '#263238', accent: ['#607D8B', '#78909C', '#E94560', '#533483'], water: '#455A64', trunk: '#4E342E' },
  anger:     { sky: ['#1a0000', '#3d0000'], ground: '#330000', accent: ['#FF0000', '#FF4500', '#B71C1C', '#FF6F00'], water: '#B71C1C', trunk: '#3E0000' },
  sadness:   { sky: ['#1a1a3e', '#0d0d2b'], ground: '#263238', accent: ['#5C6BC0', '#7986CB', '#90A4AE', '#B0BEC5'], water: '#37474F', trunk: '#37474F' },
  fear:      { sky: ['#0a0a0a', '#1a0a1a'], ground: '#0d0d0d', accent: ['#4A148C', '#880E4F', '#1B5E20', '#004D40'], water: '#1a1a2e', trunk: '#1B0F0F' },
  love:      { sky: ['#FFE0EC', '#FFC0CB'], ground: '#F48FB1', accent: ['#E91E63', '#FF4081', '#FF80AB', '#FF1744'], water: '#F06292', trunk: '#8D6E63' },
};

// ── Sky presets ──────────────────────────────────────────────

const SKY_PRESETS = {
  night:   { top: '#050520', bot: '#1a1a3e', stars: true },
  sunset:  { top: '#FF6B35', bot: '#2C2C54', stars: false },
  dawn:    { top: '#FFB6C1', bot: '#ADD8E6', stars: false },
  storm:   { top: '#2F2F2F', bot: '#4A4A4A', stars: false },
  day:     { top: '#87CEEB', bot: '#B0E0E6', stars: false },
  space:   { top: '#020208', bot: '#050520', stars: true },
  cloudy:  { top: '#708090', bot: '#A9A9A9', stars: false },
  fog:     { top: '#C0C0C0', bot: '#A0A0A0', stars: false },
  aurora:  { top: '#0a1a2e', bot: '#0a2a1a', stars: true },
};

// ── Synonym map → canonical keywords ─────────────────────────

const SYNONYMS = {
  // Sky / time of day
  dark: 'night', darkness: 'night', midnight: 'night', evening: 'night',
  dusk: 'sunset', twilight: 'sunset', sundown: 'sunset',
  morning: 'dawn', sunrise: 'dawn', daybreak: 'dawn',
  lightning: 'storm', thunder: 'storm', tempest: 'storm',
  sunny: 'day', bright: 'day', daylight: 'day',
  cosmic: 'space', universe: 'space', galaxy: 'space', nebula: 'space',
  mist: 'fog', haze: 'fog', misty: 'fog',
  // Celestial
  crescent: 'moon', lunar: 'moon', moonlight: 'moon', moonlit: 'moon',
  solar: 'sun', sunlight: 'sun', sunshine: 'sun',
  constellation: 'stars', starlight: 'stars', starry: 'stars',
  spectrum: 'rainbow',
  // Terrain / biomes
  sea: 'ocean', waves: 'ocean', beach: 'ocean', shore: 'ocean', tidal: 'ocean', coast: 'ocean',
  lake: 'water', river: 'water', stream: 'water', pond: 'water', waterfall: 'water', creek: 'water',
  hill: 'mountain', peak: 'mountain', cliff: 'mountain', ridge: 'mountain', volcano: 'mountain', summit: 'mountain',
  woods: 'forest', woodland: 'forest', jungle: 'forest', grove: 'forest',
  sand: 'desert', dune: 'desert', wasteland: 'desert', arid: 'desert',
  cavern: 'cave', underground: 'cave', tunnel: 'cave', grotto: 'cave',
  meadow: 'field', grassland: 'field', plain: 'field', garden: 'field', pasture: 'field',
  blizzard: 'snow', frost: 'snow', ice: 'snow', frozen: 'snow', winter: 'snow', glacial: 'snow',
  swamp: 'marsh', bog: 'marsh', wetland: 'marsh', bayou: 'marsh',
  // Settlements / structures
  town: 'city', village: 'city', skyscraper: 'city', urban: 'city', street: 'city',
  castle: 'tower', fortress: 'tower', spire: 'tower', lighthouse: 'tower', pillar: 'tower',
  cottage: 'house', cabin: 'house', home: 'house', shelter: 'house', hut: 'house',
  gateway: 'door', entrance: 'door', archway: 'door', doorway: 'door',
  crossing: 'bridge', span: 'bridge',
  picket: 'fence', barrier: 'fence', wall: 'fence', railing: 'fence',
  tent: 'tent', campsite: 'tent', camp: 'tent',
  ruins: 'ruin', rubble: 'ruin', crumbling: 'ruin', ancient: 'ruin', temple: 'ruin', shrine: 'ruin',
  windmill: 'windmill', mill: 'windmill',
  grave: 'tombstone', cemetery: 'tombstone', graveyard: 'tombstone', headstone: 'tombstone',
  // Furniture / interior
  sofa: 'couch', couch: 'couch', settee: 'couch',
  bed: 'bed', sleeping: 'bed', mattress: 'bed',
  chair: 'chair', seat: 'chair', throne: 'chair', stool: 'chair',
  table: 'table', desk: 'table', counter: 'table',
  // Vehicles / transport
  ship: 'boat', vessel: 'boat', sailing: 'boat', raft: 'boat',
  car: 'car', automobile: 'car', vehicle: 'car', driving: 'car', truck: 'car',
  // Weather
  rainfall: 'rain', raining: 'rain', downpour: 'rain', drizzle: 'rain', pouring: 'rain',
  // Fire / light
  flame: 'fire', bonfire: 'fire', burning: 'fire', torch: 'fire', blaze: 'fire',
  candle: 'candle', candlelight: 'candle',
  glow: 'light', beam: 'light', radiance: 'light', lantern: 'light', lamp: 'light', luminous: 'light',
  // Nature / vegetation
  bloom: 'flower', rose: 'flower', petal: 'flower', blossom: 'flower', lily: 'flower', daisy: 'flower', tulip: 'flower',
  bush: 'bush', shrub: 'bush', hedge: 'bush', thicket: 'bush',
  vine: 'vine', ivy: 'vine', tendril: 'vine', creeper: 'vine',
  mushroom: 'mushroom', fungus: 'mushroom', toadstool: 'mushroom',
  leaf: 'leaf', leaves: 'leaf', foliage: 'leaf', autumn: 'leaf',
  boulder: 'rock', stone: 'rock', pebble: 'rock',
  // Objects
  hourglass: 'clock', timepiece: 'clock', watch: 'clock',
  book: 'book', tome: 'book', scroll: 'book', pages: 'book', library: 'book', reading: 'book',
  key: 'key', keyhole: 'key', unlock: 'key', locked: 'key',
  sword: 'sword', blade: 'sword', dagger: 'sword', weapon: 'sword', knife: 'sword',
  crown: 'crown', tiara: 'crown', royal: 'crown', king: 'crown', queen: 'crown',
  mask: 'mask', disguise: 'mask', masked: 'mask', face: 'mask',
  bell: 'bell', chime: 'bell', ringing: 'bell',
  chest: 'chest', treasure: 'chest', crate: 'chest', box: 'chest',
  flag: 'flag', banner: 'flag', pennant: 'flag',
  chain: 'chain', shackle: 'chain', bound: 'chain', chains: 'chain',
  cage: 'cage', prison: 'cage', trapped: 'cage', jail: 'cage',
  bottle: 'bottle', potion: 'bottle', jar: 'bottle', flask: 'bottle', vial: 'bottle',
  skull: 'skull', bone: 'skull', skeleton: 'skull', bones: 'skull',
  heart: 'heart', heartbeat: 'heart', valentine: 'heart',
  // People / beings
  silhouette: 'figure', person: 'figure', human: 'figure', someone: 'figure', stranger: 'figure', child: 'figure', woman: 'figure', man: 'figure',
  eyes: 'eye', watching: 'eye', gaze: 'eye', staring: 'eye', pupil: 'eye',
  raven: 'bird', eagle: 'bird', crow: 'bird', dove: 'bird', owl: 'bird', flying: 'bird', wings: 'bird',
  kitten: 'cat', feline: 'cat', kitty: 'cat',
  puppy: 'dog', hound: 'dog', canine: 'dog', wolf: 'dog',
  horse: 'horse', stallion: 'horse', mare: 'horse', pony: 'horse', steed: 'horse',
  butterfly: 'butterfly', moth: 'butterfly',
  spider: 'spider', tarantula: 'spider', arachnid: 'spider',
  rabbit: 'rabbit', bunny: 'rabbit', hare: 'rabbit',
  deer: 'deer', stag: 'deer', elk: 'deer', antler: 'deer',
  whale: 'whale', leviathan: 'whale',
  bat: 'bat',
  phantom: 'ghost', spirit: 'ghost', specter: 'ghost', apparition: 'ghost', haunted: 'ghost',
  creature: 'monster', beast: 'monster', dragon: 'monster', demon: 'monster', ogre: 'monster',
  serpent: 'snake', viper: 'snake', slither: 'snake',
  angel: 'angel', seraph: 'angel', divine: 'angel', halo: 'angel',
  // Abstract / symbolic
  gem: 'crystal', jewel: 'crystal', prism: 'crystal', diamond: 'crystal', glowing: 'crystal',
  staircase: 'stairs', steps: 'stairs', ladder: 'stairs',
  swirl: 'spiral', vortex: 'spiral', whirlpool: 'spiral', tornado: 'spiral',
  abyss: 'void', emptiness: 'void', nothingness: 'void', hollow: 'void',
  cobweb: 'web', threads: 'web', weave: 'web',
  reflection: 'mirror', glass: 'mirror',
  portal: 'portal', warp: 'portal', rift: 'portal',
  road: 'path', trail: 'path', walkway: 'path', corridor: 'path', hallway: 'path', alley: 'path',
  arrow: 'arrow', pointing: 'arrow', direction: 'arrow',
  music: 'note', melody: 'note', song: 'note', singing: 'note', instrument: 'note',
  tear: 'teardrop', crying: 'teardrop', weeping: 'teardrop', tears: 'teardrop', sob: 'teardrop',
  blood: 'blood', bleeding: 'blood', wound: 'blood',
  smoke: 'smoke', fumes: 'smoke', smoldering: 'smoke',
  shadow: 'shadow', silhouetted: 'shadow', dark_figure: 'shadow',
};

// All canonical keywords the engine can draw
const ALL_KEYWORDS = new Set([
  // Sky / time
  'night', 'sunset', 'dawn', 'storm', 'day', 'space', 'cloudy', 'fog', 'aurora',
  // Celestial
  'moon', 'sun', 'stars', 'clouds', 'rainbow',
  // Terrain / biomes
  'ocean', 'water', 'mountain', 'forest', 'desert', 'cave', 'field', 'snow', 'city', 'marsh',
  // Structures
  'tower', 'house', 'door', 'bridge', 'stairs', 'fence', 'tent', 'ruin', 'windmill', 'tombstone',
  // Furniture
  'couch', 'bed', 'chair', 'table',
  // Vehicles
  'boat', 'car',
  // Weather
  'rain', 'smoke',
  // Fire / light
  'fire', 'candle', 'light',
  // Vegetation
  'tree', 'flower', 'bush', 'vine', 'mushroom', 'leaf', 'rock',
  // Objects
  'clock', 'crystal', 'book', 'key', 'sword', 'crown', 'mask', 'bell', 'chest', 'flag',
  'chain', 'cage', 'bottle', 'skull', 'heart', 'arrow', 'note',
  // Beings
  'figure', 'eye', 'bird', 'cat', 'dog', 'horse', 'fish', 'snake', 'ghost', 'monster',
  'butterfly', 'spider', 'rabbit', 'deer', 'whale', 'bat', 'angel',
  // Abstract / symbolic
  'spiral', 'mirror', 'void', 'web', 'portal', 'path', 'teardrop', 'blood', 'shadow',
]);

// Genre → default keywords when nothing else matches
const GENRE_DEFAULTS = {
  surreal_narrative:  ['night', 'door', 'eye', 'stairs', 'moon', 'key'],
  lucid_adventure:    ['dawn', 'mountain', 'forest', 'crystal', 'clouds', 'path'],
  emotional_echo:     ['sunset', 'figure', 'ocean', 'rain', 'teardrop'],
  abstract_vision:    ['space', 'spiral', 'void', 'stars', 'light'],
  prophetic_fable:    ['night', 'tower', 'moon', 'fire', 'snake', 'skull'],
  memory_remix:       ['cloudy', 'house', 'door', 'figure', 'clock', 'book'],
  free_imagination:   ['space', 'moon', 'crystal', 'ghost', 'aurora', 'butterfly'],
  dark_nightmare:     ['night', 'monster', 'cage', 'blood', 'shadow', 'skull'],
  peaceful_dream:     ['dawn', 'field', 'flower', 'butterfly', 'bird', 'rabbit'],
};

// ── Engine ───────────────────────────────────────────────────

class NekoPixelPro {
  constructor(options = {}) {
    this.gridSize = options.gridSize || GRID;
    this.modelRouter = options.modelRouter || null;
  }

  // ── Keyword Extraction ─────────────────────────────────────

  /**
   * Build a simple prompt asking the LLM for visual keywords.
   * This is a tiny task any model can handle reliably.
   */
  _buildKeywordPrompt(narrative) {
    return `Look at this dream/memory text and pick 5-8 visual elements you would draw in a tiny pixel art image for it. Return ONLY a JSON array of lowercase single words — nothing else.

Good examples:
["night","ocean","moon","cliff","figure","rain"]
["sunset","city","tower","bird","clouds","fire"]
["cave","crystal","darkness","water","eye","ghost"]
["dawn","field","tree","flower","figure","light"]

Text:
"${narrative.slice(0, 1500)}"

JSON array:`;
  }

  /**
   * Ask the LLM for keywords, or fall back to regex extraction.
   */
  async _extractKeywords(narrative, callLLM) {
    const regexKws = this._extractKeywordsFallback(narrative);

    if (!callLLM) return regexKws;

    try {
      const prompt = this._buildKeywordPrompt(narrative);
      const response = await callLLM(prompt);
      if (!response) return regexKws;

      const cleaned = response.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      const arrMatch = cleaned.match(/\[[\s\S]*?\]/);
      if (!arrMatch) return regexKws;

      const arr = JSON.parse(arrMatch[0]);
      if (!Array.isArray(arr) || arr.length === 0) return regexKws;

      const normalized = arr
        .filter(w => typeof w === 'string')
        .map(w => this._normalizeKeyword(w.toLowerCase().trim()))
        .filter(w => w && ALL_KEYWORDS.has(w));

      // Merge LLM + regex keywords for best coverage
      const merged = new Set([...normalized, ...regexKws]);
      return [...merged].slice(0, 12);
    } catch (err) {
      console.warn('  ⚠ Keyword extraction LLM failed, using regex:', err.message);
      return regexKws;
    }
  }

  /**
   * Extract keywords from narrative text using regex matching.
   */
  _extractKeywordsFallback(narrative) {
    const text = (narrative || '').toLowerCase();
    const found = new Set();

    for (const kw of ALL_KEYWORDS) {
      if (text.includes(kw)) found.add(kw);
    }
    for (const [word, canonical] of Object.entries(SYNONYMS)) {
      if (word.length >= 3 && text.includes(word)) found.add(canonical);
    }

    return [...found].slice(0, 10);
  }

  _normalizeKeyword(word) {
    if (ALL_KEYWORDS.has(word)) return word;
    return SYNONYMS[word] || null;
  }

  // ── Scene Composition ──────────────────────────────────────

  /**
   * Build a complete scene from keywords + emotion.
   */
  _composeScene(keywords, emotion, genre) {
    const pal = PALETTES[emotion] || PALETTES.neutral;
    const kws = new Set(keywords);
    const scene = { bg: {}, elements: [] };
    const S = this.gridSize;

    // Seeded PRNG for variety
    let seed = (Date.now() ^ (keywords.join('').length * 2654435761)) >>> 0;
    if (seed === 0) seed = 1;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const els = scene.elements;

    // ─ 1. Sky background ─
    const skyPreset = this._pickSky(kws, pal);
    scene.bg = { topColor: skyPreset.top, bottomColor: skyPreset.bot };

    // ─ 2. Stars ─
    if (skyPreset.stars || kws.has('stars')) {
      for (let i = 0; i < randInt(15, 45); i++) {
        els.push({ type: 'rect', x: randInt(0, S - 1), y: randInt(0, 42), w: 1, h: 1,
          color: pick(['#FFFFFF', '#FFFACD', '#FFD700', '#E0E0FF']) });
      }
    }

    // ─ 3. Aurora ─
    if (kws.has('aurora')) {
      for (let i = 0; i < randInt(3, 5); i++) {
        els.push({ type: 'ellipse', x: randInt(8, 56), y: randInt(5, 22),
          w: randInt(14, 28), h: randInt(2, 4),
          color: pick(['#00FF7F', '#7B68EE', '#00CED1', '#FF69B4', '#9370DB']) });
      }
    }

    // ─ 4. Celestial bodies ─
    if (kws.has('moon')) {
      els.push({ type: 'circle', x: randInt(10, 54), y: randInt(6, 16),
        w: randInt(5, 8), color: '#FFFACD', outline: '#FFF8DC' });
    }
    if (kws.has('sun')) {
      const sx = randInt(12, 52), sy = randInt(6, 16), sr = randInt(5, 8);
      els.push({ type: 'circle', x: sx, y: sy, w: sr, color: pick([pal.accent[0], '#FFD700', '#FFA500']) });
      for (let a = 0; a < 6; a++) {
        const angle = (a / 6) * Math.PI * 2 + rand() * 0.3;
        const len = sr + randInt(3, 6);
        els.push({ type: 'line', x: sx, y: sy,
          w: sx + Math.round(Math.cos(angle) * len), h: sy + Math.round(Math.sin(angle) * len),
          color: '#FFD700', thickness: 1 });
      }
    }
    if (kws.has('rainbow')) {
      const rcx = randInt(20, 44), rcy = randInt(15, 25);
      const colors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF'];
      for (let i = 0; i < colors.length; i++) {
        els.push({ type: 'ellipse', x: rcx, y: rcy, w: 20 - i * 2, h: 12 - i, color: null, outline: colors[i] });
      }
    }
    if (kws.has('clouds')) {
      for (let i = 0; i < randInt(2, 4); i++) {
        els.push({ type: 'ellipse', x: randInt(8, 56), y: randInt(4, 14),
          w: randInt(8, 14), h: randInt(2, 4), color: '#E0E0E0' });
      }
    }

    // ─ 5. Birds ─
    if (kws.has('bird')) {
      for (let i = 0; i < randInt(2, 5); i++) {
        const bx = randInt(5, 58), by = randInt(4, 20);
        els.push({ type: 'line', x: bx - 2, y: by + 1, w: bx, h: by, color: '#222222', thickness: 1 });
        els.push({ type: 'line', x: bx, y: by, w: bx + 2, h: by + 1, color: '#222222', thickness: 1 });
      }
    }

    // ─ 6. Mountains (background) ─
    let groundY = 50;
    if (kws.has('mountain')) {
      groundY = Math.min(groundY, randInt(30, 38));
      for (let i = 0; i < randInt(2, 4); i++) {
        const mh = randInt(16, 32);
        els.push({ type: 'triangle', x: randInt(5, 58), y: groundY - mh + randInt(0, 6),
          w: randInt(18, 36), h: mh, color: pick(pal.accent) });
      }
      for (let i = 0; i < randInt(1, 2); i++) {
        els.push({ type: 'triangle', x: randInt(15, 48), y: groundY - randInt(20, 30),
          w: randInt(5, 9), h: randInt(3, 6), color: '#FFFFFF' });
      }
    }

    // ─ 7. City skyline ─
    if (kws.has('city')) {
      const streetY = Math.min(groundY, randInt(48, 54));
      groundY = streetY;
      els.push({ type: 'rect', x: 0, y: streetY, w: S, h: S - streetY, color: '#333333' });
      for (let i = 0; i < randInt(5, 9); i++) {
        const bx = randInt(0, 56), bw = randInt(5, 11), bh = randInt(14, 34);
        els.push({ type: 'rect', x: bx, y: streetY - bh, w: bw, h: bh,
          color: pick(pal.accent), outline: '#222222' });
        for (let wy = streetY - bh + 2; wy < streetY - 2; wy += randInt(3, 5)) {
          for (let wx = bx + 1; wx < bx + bw - 1; wx += randInt(2, 4)) {
            els.push({ type: 'rect', x: wx, y: wy, w: 1, h: 1,
              color: rand() < 0.6 ? '#FFD700' : '#111111' });
          }
        }
      }
    }

    // ─ 8. Terrain / ground ─
    let waterY = null;
    if (kws.has('ocean')) {
      waterY = Math.min(groundY, randInt(28, 36));
      groundY = waterY;
      els.push({ type: 'rect', x: 0, y: waterY, w: S, h: S - waterY, color: pal.water });
      for (let i = 0; i < randInt(4, 8); i++) {
        const wy = randInt(waterY + 3, S - 3);
        els.push({ type: 'line', x: randInt(0, 8), y: wy, w: randInt(50, 63), h: wy + randInt(-1, 1),
          color: this._lighten(pal.water, 0.2), thickness: 1 });
      }
    } else if (kws.has('water')) {
      waterY = Math.min(groundY + 4, randInt(42, 52));
      els.push({ type: 'rect', x: 0, y: waterY, w: S, h: S - waterY, color: pal.water });
      for (let i = 0; i < randInt(2, 5); i++) {
        const wy = randInt(waterY + 2, S - 2);
        els.push({ type: 'line', x: randInt(2, 12), y: wy, w: randInt(48, 62), h: wy,
          color: this._lighten(pal.water, 0.15), thickness: 1 });
      }
    } else if (kws.has('cave')) {
      const wallW = randInt(10, 16);
      els.push({ type: 'rect', x: 0, y: 0, w: wallW, h: S, color: '#2E1B0E' });
      els.push({ type: 'rect', x: S - wallW, y: 0, w: wallW, h: S, color: '#2E1B0E' });
      els.push({ type: 'rect', x: 0, y: 0, w: S, h: randInt(6, 12), color: '#2E1B0E' });
      for (let i = 0; i < randInt(3, 6); i++) {
        els.push({ type: 'triangle', x: randInt(wallW, S - wallW), y: 0,
          w: randInt(2, 4), h: randInt(6, 14), color: '#3E2723' });
      }
      els.push({ type: 'rect', x: 0, y: S - randInt(6, 10), w: S, h: 12, color: '#3E2723' });
      groundY = 54;
    } else if (kws.has('desert')) {
      groundY = Math.min(groundY, randInt(38, 46));
      els.push({ type: 'rect', x: 0, y: groundY, w: S, h: S - groundY, color: '#D2B48C' });
      for (let i = 0; i < randInt(2, 4); i++) {
        els.push({ type: 'ellipse', x: randInt(10, 54), y: randInt(groundY, groundY + 8),
          w: randInt(12, 22), h: randInt(3, 7), color: '#C2A278' });
      }
    } else if (kws.has('snow')) {
      groundY = Math.min(groundY, randInt(42, 50));
      els.push({ type: 'rect', x: 0, y: groundY, w: S, h: S - groundY, color: '#F0F0F0' });
      for (let i = 0; i < randInt(15, 30); i++) {
        els.push({ type: 'rect', x: randInt(0, S - 1), y: randInt(0, S - 4), w: 1, h: 1, color: '#FFFFFF' });
      }
    } else if (kws.has('marsh')) {
      groundY = Math.min(groundY, randInt(38, 46));
      els.push({ type: 'rect', x: 0, y: groundY, w: S, h: S - groundY, color: '#4A6741' });
      for (let i = 0; i < randInt(4, 7); i++) {
        els.push({ type: 'ellipse', x: randInt(5, 58), y: randInt(groundY + 2, S - 4),
          w: randInt(6, 14), h: randInt(2, 4), color: '#3B5F3B' });
      }
      for (let i = 0; i < randInt(3, 6); i++) {
        const rx = randInt(5, 58), ry = randInt(groundY, S - 3);
        els.push({ type: 'rect', x: rx, y: ry, w: 1, h: 1, color: '#6B8E6B' });
      }
      waterY = groundY + 2;
    } else if (kws.has('field')) {
      groundY = Math.min(groundY, randInt(40, 50));
      els.push({ type: 'rect', x: 0, y: groundY, w: S, h: S - groundY, color: '#4CAF50' });
      for (let i = 0; i < randInt(4, 8); i++) {
        els.push({ type: 'rect', x: randInt(0, S - 4), y: groundY, w: randInt(3, 8), h: 1, color: '#388E3C' });
      }
    } else if (!kws.has('city') && !kws.has('cave')) {
      groundY = Math.min(groundY, randInt(46, 54));
      els.push({ type: 'rect', x: 0, y: groundY, w: S, h: S - groundY, color: pal.ground });
    }

    // ─ 9. Vegetation ─
    if (kws.has('forest')) {
      for (let i = 0; i < randInt(4, 8); i++) {
        const tx = randInt(3, 60);
        const base = Math.min(groundY + 2, randInt(32, 48));
        const th = randInt(10, 20);
        els.push({ type: 'rect', x: tx, y: base - th, w: 2, h: th, color: pal.trunk });
        els.push({ type: 'triangle', x: tx + 1, y: base - th - randInt(4, 8),
          w: randInt(8, 14), h: randInt(10, 16),
          color: pick(['#2E7D32', '#388E3C', '#1B5E20', '#4CAF50']) });
      }
    }
    if (kws.has('tree') && !kws.has('forest')) {
      for (let i = 0; i < randInt(1, 3); i++) {
        const tx = randInt(15, 48);
        const base = Math.min(groundY + 1, 52);
        const th = randInt(8, 14);
        els.push({ type: 'rect', x: tx, y: base - th, w: 3, h: th, color: pal.trunk });
        els.push({ type: 'circle', x: tx + 1, y: base - th - 3, w: randInt(4, 7), color: '#2E7D32' });
      }
    }
    if (kws.has('flower')) {
      for (let i = 0; i < randInt(5, 12); i++) {
        els.push({ type: 'rect', x: randInt(5, 58), y: randInt(groundY - 2, Math.min(groundY + 6, S - 2)),
          w: 1, h: 1, color: pick(pal.accent) });
      }
    }
    if (kws.has('bush')) {
      for (let i = 0; i < randInt(2, 5); i++) {
        const bx = randInt(5, 58), by = Math.min(groundY - 1, 52);
        els.push({ type: 'ellipse', x: bx, y: by, w: randInt(4, 7), h: randInt(3, 5),
          color: pick(['#2E7D32', '#388E3C', '#4CAF50', '#1B5E20']) });
      }
    }
    if (kws.has('vine')) {
      for (let i = 0; i < randInt(2, 4); i++) {
        const vx = randInt(5, 58);
        for (let s = 0; s < randInt(6, 14); s++) {
          els.push({ type: 'rect', x: vx + (s % 2 === 0 ? 0 : 1), y: randInt(8, 20) + s * 2,
            w: 1, h: 2, color: pick(['#2E7D32', '#388E3C', '#1B5E20']) });
        }
      }
    }
    if (kws.has('mushroom')) {
      for (let i = 0; i < randInt(2, 5); i++) {
        const mx = randInt(10, 54), my = Math.min(groundY, 54);
        els.push({ type: 'rect', x: mx, y: my - randInt(3, 5), w: 1, h: randInt(3, 5), color: '#E0E0E0' });
        els.push({ type: 'ellipse', x: mx, y: my - randInt(5, 7), w: randInt(2, 4), h: randInt(1, 3),
          color: pick(['#D32F2F', '#F44336', '#9C27B0', '#FF9800']) });
      }
    }
    if (kws.has('leaf')) {
      for (let i = 0; i < randInt(8, 18); i++) {
        els.push({ type: 'rect', x: randInt(2, 60), y: randInt(8, S - 4),
          w: 1, h: 1, color: pick(['#FF8F00', '#F57F17', '#E65100', '#2E7D32', '#8D6E63']) });
      }
    }
    if (kws.has('rock')) {
      for (let i = 0; i < randInt(2, 4); i++) {
        const rx = randInt(8, 54), ry = Math.min(groundY + 1, 54);
        els.push({ type: 'ellipse', x: rx, y: ry, w: randInt(3, 6), h: randInt(2, 4), color: '#757575' });
      }
    }

    // ─ 10. Structures ─
    if (kws.has('tower')) {
      const tx = randInt(20, 40), tw = randInt(6, 10), th = randInt(22, 38);
      const ty = groundY - th;
      els.push({ type: 'rect', x: tx, y: ty, w: tw, h: th, color: pick(pal.accent), outline: '#333333' });
      els.push({ type: 'triangle', x: tx + Math.floor(tw / 2), y: ty - randInt(5, 9),
        w: tw + 4, h: randInt(5, 9), color: pick(pal.accent) });
      els.push({ type: 'circle', x: tx + Math.floor(tw / 2), y: ty + randInt(3, 7), w: 2, color: '#FFD700' });
    }
    if (kws.has('house')) {
      const hx = randInt(15, 42), hw = randInt(10, 15), hh = randInt(8, 13);
      const hy = groundY - hh;
      els.push({ type: 'rect', x: hx, y: hy, w: hw, h: hh, color: pick(pal.accent), outline: '#5D4037' });
      els.push({ type: 'triangle', x: hx + Math.floor(hw / 2), y: hy - randInt(4, 7),
        w: hw + 4, h: randInt(4, 7), color: '#B71C1C' });
      els.push({ type: 'rect', x: hx + Math.floor(hw / 2) - 1, y: hy + hh - 4, w: 3, h: 4, color: '#5D4037' });
      els.push({ type: 'rect', x: hx + 2, y: hy + 2, w: 2, h: 2, color: '#FFD700' });
    }
    if (kws.has('door') && !kws.has('house')) {
      const dx = randInt(25, 37), dy = groundY - 12;
      els.push({ type: 'rect', x: dx, y: dy, w: 6, h: 12, color: '#5D4037', outline: '#3E2723' });
      els.push({ type: 'rect', x: dx + 4, y: dy + 6, w: 1, h: 1, color: '#FFD700' });
    }
    if (kws.has('bridge')) {
      const by = waterY ? waterY - 2 : groundY - 4;
      els.push({ type: 'rect', x: 10, y: by, w: 44, h: 3, color: '#8D6E63', outline: '#5D4037' });
      els.push({ type: 'rect', x: 10, y: by, w: 2, h: 8, color: '#5D4037' });
      els.push({ type: 'rect', x: 52, y: by, w: 2, h: 8, color: '#5D4037' });
    }
    if (kws.has('stairs')) {
      const sx = randInt(20, 36), sy = groundY;
      for (let s = 0; s < randInt(5, 8); s++) {
        els.push({ type: 'rect', x: sx + s * 2, y: sy - s * 3, w: 4, h: 3, color: pick(pal.accent) });
      }
    }
    if (kws.has('fence')) {
      const fy = Math.min(groundY - 4, 50);
      for (let i = 0; i < randInt(5, 10); i++) {
        const fx = randInt(2, 58);
        els.push({ type: 'rect', x: fx, y: fy, w: 1, h: 5, color: '#8D6E63' });
      }
      els.push({ type: 'line', x: 2, y: fy + 1, w: 60, h: fy + 1, color: '#8D6E63', thickness: 1 });
      els.push({ type: 'line', x: 2, y: fy + 3, w: 60, h: fy + 3, color: '#8D6E63', thickness: 1 });
    }
    if (kws.has('tent')) {
      const tx = randInt(20, 40), ty = groundY;
      els.push({ type: 'triangle', x: tx, y: ty - randInt(12, 18),
        w: randInt(14, 20), h: randInt(12, 18), color: pick(['#8D6E63', '#795548', '#A1887F', '#D84315']) });
      els.push({ type: 'rect', x: tx - 1, y: ty - 4, w: 3, h: 4, color: '#3E2723' });
    }
    if (kws.has('ruin')) {
      for (let i = 0; i < randInt(3, 5); i++) {
        const rx = randInt(10, 50), rh = randInt(6, 16);
        els.push({ type: 'rect', x: rx, y: groundY - rh, w: randInt(3, 6), h: rh, color: '#9E9E9E' });
      }
      for (let i = 0; i < randInt(3, 6); i++) {
        els.push({ type: 'rect', x: randInt(10, 54), y: Math.min(groundY + 1, S - 2),
          w: randInt(2, 4), h: randInt(1, 2), color: '#757575' });
      }
    }
    if (kws.has('windmill')) {
      const wx = randInt(22, 42), wh = randInt(16, 24), wy = groundY - wh;
      els.push({ type: 'rect', x: wx - 2, y: wy, w: 5, h: wh, color: '#E0E0E0', outline: '#9E9E9E' });
      for (let a = 0; a < 4; a++) {
        const angle = (a / 4) * Math.PI * 2 + rand() * 0.5;
        const bLen = randInt(6, 10);
        els.push({ type: 'line', x: wx, y: wy + 3,
          w: wx + Math.round(Math.cos(angle) * bLen), h: wy + 3 + Math.round(Math.sin(angle) * bLen),
          color: '#5D4037', thickness: 1 });
      }
    }
    if (kws.has('tombstone')) {
      for (let i = 0; i < randInt(2, 5); i++) {
        const tx = randInt(10, 52), ty = groundY;
        els.push({ type: 'rect', x: tx, y: ty - randInt(4, 7), w: 3, h: randInt(4, 7), color: '#9E9E9E' });
        els.push({ type: 'ellipse', x: tx + 1, y: ty - randInt(6, 9), w: 2, h: 2, color: '#9E9E9E' });
      }
    }
    if (kws.has('couch')) {
      const cx = randInt(18, 38), cy = Math.min(groundY - 4, 50);
      els.push({ type: 'rect', x: cx, y: cy, w: 14, h: 5, color: pick(pal.accent) });
      els.push({ type: 'rect', x: cx, y: cy - 3, w: 14, h: 3, color: this._darken(pick(pal.accent), 0.2) });
      els.push({ type: 'rect', x: cx, y: cy + 5, w: 2, h: 2, color: '#5D4037' });
      els.push({ type: 'rect', x: cx + 12, y: cy + 5, w: 2, h: 2, color: '#5D4037' });
    }
    if (kws.has('bed')) {
      const bx = randInt(18, 38), by = Math.min(groundY - 3, 50);
      els.push({ type: 'rect', x: bx, y: by, w: 16, h: 5, color: '#E0E0E0' });
      els.push({ type: 'rect', x: bx, y: by, w: 4, h: 3, color: '#F5F5F5' });
      els.push({ type: 'rect', x: bx, y: by + 5, w: 1, h: 2, color: '#5D4037' });
      els.push({ type: 'rect', x: bx + 15, y: by + 5, w: 1, h: 2, color: '#5D4037' });
      els.push({ type: 'rect', x: bx + 2, y: by + 1, w: 12, h: 3, color: pick(pal.accent) });
    }
    if (kws.has('chair')) {
      const cx = randInt(22, 42), cy = Math.min(groundY - 6, 48);
      els.push({ type: 'rect', x: cx, y: cy, w: 5, h: 3, color: '#8D6E63' });
      els.push({ type: 'rect', x: cx, y: cy - 5, w: 1, h: 5, color: '#8D6E63' });
      els.push({ type: 'rect', x: cx, y: cy + 3, w: 1, h: 3, color: '#5D4037' });
      els.push({ type: 'rect', x: cx + 4, y: cy + 3, w: 1, h: 3, color: '#5D4037' });
    }
    if (kws.has('table')) {
      const tx = randInt(18, 40), ty = Math.min(groundY - 4, 50);
      els.push({ type: 'rect', x: tx, y: ty, w: 12, h: 2, color: '#8D6E63' });
      els.push({ type: 'rect', x: tx + 1, y: ty + 2, w: 1, h: 4, color: '#5D4037' });
      els.push({ type: 'rect', x: tx + 10, y: ty + 2, w: 1, h: 4, color: '#5D4037' });
    }

    // ─ 11. Objects ─
    if (kws.has('fire')) {
      const fx = randInt(22, 42), fy = Math.min(groundY, 52);
      els.push({ type: 'circle', x: fx, y: fy - 1, w: randInt(3, 5), color: '#FF4500' });
      els.push({ type: 'triangle', x: fx, y: fy - randInt(7, 12), w: randInt(4, 7), h: randInt(6, 10), color: '#FF6D00' });
      els.push({ type: 'triangle', x: fx + randInt(-2, 2), y: fy - randInt(10, 16),
        w: randInt(2, 4), h: randInt(4, 7), color: '#FFD600' });
      for (let i = 0; i < randInt(2, 5); i++) {
        els.push({ type: 'rect', x: fx + randInt(-4, 4), y: fy - randInt(10, 20), w: 1, h: 1, color: '#FFAB00' });
      }
    }
    if (kws.has('crystal')) {
      for (let i = 0; i < randInt(3, 6); i++) {
        const crH = randInt(4, 10);
        els.push({ type: 'rect', x: randInt(16, 48), y: randInt(groundY - crH - 4, groundY - 1),
          w: randInt(1, 3), h: crH, color: pick(pal.accent) });
      }
    }
    if (kws.has('boat') && waterY) {
      const bx = randInt(18, 44), by = waterY - 1;
      els.push({ type: 'rect', x: bx - 3, y: by, w: 7, h: 3, color: '#8D6E63' });
      els.push({ type: 'line', x: bx, y: by - 7, w: bx, h: by, color: '#5D4037', thickness: 1 });
      els.push({ type: 'triangle', x: bx + 1, y: by - 7, w: 4, h: 6, color: '#FFFFFF' });
    }
    if (kws.has('clock')) {
      const clx = randInt(22, 42), cly = randInt(16, 36), clr = randInt(5, 8);
      els.push({ type: 'circle', x: clx, y: cly, w: clr, color: '#FFFACD', outline: '#333333' });
      els.push({ type: 'line', x: clx, y: cly, w: clx, h: cly - clr + 2, color: '#333333', thickness: 1 });
      els.push({ type: 'line', x: clx, y: cly, w: clx + clr - 2, h: cly, color: '#333333', thickness: 1 });
      els.push({ type: 'rect', x: clx, y: cly, w: 1, h: 1, color: '#FF0000' });
    }
    if (kws.has('candle')) {
      const cx = randInt(22, 42), cy = Math.min(groundY, 52);
      els.push({ type: 'rect', x: cx, y: cy - randInt(4, 7), w: 2, h: randInt(4, 7), color: '#FFFDE7' });
      els.push({ type: 'rect', x: cx, y: cy - randInt(7, 9), w: 1, h: 2, color: '#FF6D00' });
      els.push({ type: 'rect', x: cx, y: cy - randInt(9, 11), w: 1, h: 1, color: '#FFD600' });
    }
    if (kws.has('book')) {
      const bx = randInt(20, 44), by = randInt(groundY - 8, Math.min(groundY, 52));
      els.push({ type: 'rect', x: bx, y: by, w: 6, h: 5, color: pick(pal.accent), outline: '#333333' });
      els.push({ type: 'line', x: bx + 3, y: by, w: bx + 3, h: by + 4, color: '#FFFFFF', thickness: 1 });
    }
    if (kws.has('key')) {
      const kx = randInt(22, 44), ky = randInt(20, 42);
      els.push({ type: 'circle', x: kx, y: ky, w: 3, color: '#FFD700', outline: '#B8860B' });
      els.push({ type: 'rect', x: kx + 3, y: ky, w: 6, h: 1, color: '#FFD700' });
      els.push({ type: 'rect', x: kx + 7, y: ky, w: 1, h: 2, color: '#FFD700' });
      els.push({ type: 'rect', x: kx + 9, y: ky, w: 1, h: 2, color: '#FFD700' });
    }
    if (kws.has('sword')) {
      const sx = randInt(24, 40), sy = randInt(16, 36);
      els.push({ type: 'rect', x: sx, y: sy - 10, w: 1, h: 14, color: '#C0C0C0' });
      els.push({ type: 'rect', x: sx - 2, y: sy + 2, w: 5, h: 1, color: '#8D6E63' });
      els.push({ type: 'rect', x: sx, y: sy + 3, w: 1, h: 3, color: '#5D4037' });
      els.push({ type: 'rect', x: sx, y: sy - 11, w: 1, h: 1, color: '#FFFFFF' });
    }
    if (kws.has('crown')) {
      const crx = randInt(22, 42), cry = randInt(12, 28);
      els.push({ type: 'rect', x: crx - 4, y: cry, w: 9, h: 4, color: '#FFD700' });
      els.push({ type: 'triangle', x: crx - 3, y: cry - 3, w: 2, h: 3, color: '#FFD700' });
      els.push({ type: 'triangle', x: crx, y: cry - 4, w: 2, h: 4, color: '#FFD700' });
      els.push({ type: 'triangle', x: crx + 3, y: cry - 3, w: 2, h: 3, color: '#FFD700' });
      els.push({ type: 'rect', x: crx - 3, y: cry + 1, w: 1, h: 1, color: '#E91E63' });
      els.push({ type: 'rect', x: crx + 3, y: cry + 1, w: 1, h: 1, color: '#2196F3' });
    }
    if (kws.has('mask')) {
      const mx = randInt(22, 42), my = randInt(18, 36);
      els.push({ type: 'ellipse', x: mx, y: my, w: 7, h: 5, color: '#FFFDE7', outline: '#333333' });
      els.push({ type: 'ellipse', x: mx - 3, y: my - 1, w: 2, h: 1, color: '#000000' });
      els.push({ type: 'ellipse', x: mx + 3, y: my - 1, w: 2, h: 1, color: '#000000' });
    }
    if (kws.has('bell')) {
      const bx = randInt(24, 40), by = randInt(14, 30);
      els.push({ type: 'ellipse', x: bx, y: by, w: 5, h: 6, color: '#FFD700' });
      els.push({ type: 'rect', x: bx - 1, y: by - 6, w: 3, h: 2, color: '#FFD700' });
      els.push({ type: 'rect', x: bx, y: by + 5, w: 1, h: 1, color: '#B8860B' });
    }
    if (kws.has('chest')) {
      const cx = randInt(20, 42), cy = Math.min(groundY - 5, 50);
      els.push({ type: 'rect', x: cx, y: cy, w: 8, h: 5, color: '#8D6E63', outline: '#5D4037' });
      els.push({ type: 'rect', x: cx, y: cy, w: 8, h: 2, color: '#A1887F' });
      els.push({ type: 'rect', x: cx + 3, y: cy + 2, w: 2, h: 1, color: '#FFD700' });
    }
    if (kws.has('flag')) {
      const fx = randInt(20, 44), fy = Math.min(groundY - 14, 38);
      els.push({ type: 'rect', x: fx, y: fy, w: 1, h: 14, color: '#5D4037' });
      els.push({ type: 'rect', x: fx + 1, y: fy, w: 8, h: 5, color: pick(pal.accent) });
    }
    if (kws.has('chain')) {
      const cx = randInt(18, 46), cy = randInt(6, 16);
      for (let i = 0; i < randInt(6, 12); i++) {
        els.push({ type: 'circle', x: cx + (i % 2 === 0 ? 0 : 1), y: cy + i * 3, w: 1,
          color: null, outline: '#9E9E9E' });
      }
    }
    if (kws.has('cage')) {
      const cx = randInt(18, 38), cy = randInt(16, 32), cw = randInt(12, 16), ch = randInt(12, 18);
      els.push({ type: 'rect', x: cx, y: cy, w: cw, h: ch, color: null, outline: '#616161' });
      for (let i = 2; i < cw - 1; i += 2) {
        els.push({ type: 'line', x: cx + i, y: cy, w: cx + i, h: cy + ch, color: '#757575', thickness: 1 });
      }
    }
    if (kws.has('bottle')) {
      const bx = randInt(24, 42), by = randInt(groundY - 8, Math.min(groundY, 52));
      els.push({ type: 'rect', x: bx, y: by, w: 3, h: 5, color: pick(['#4FC3F7', '#81C784', '#E57373', '#CE93D8']) });
      els.push({ type: 'rect', x: bx + 1, y: by - 2, w: 1, h: 2, color: '#9E9E9E' });
    }
    if (kws.has('skull')) {
      const sx = randInt(22, 42), sy = randInt(groundY - 6, Math.min(groundY + 2, 54));
      els.push({ type: 'circle', x: sx, y: sy, w: 4, color: '#F5F5F5' });
      els.push({ type: 'rect', x: sx - 2, y: sy - 1, w: 1, h: 1, color: '#111111' });
      els.push({ type: 'rect', x: sx + 1, y: sy - 1, w: 1, h: 1, color: '#111111' });
      els.push({ type: 'rect', x: sx - 1, y: sy + 2, w: 2, h: 1, color: '#222222' });
    }
    if (kws.has('heart')) {
      const hx = randInt(22, 42), hy = randInt(16, 36);
      els.push({ type: 'circle', x: hx - 2, y: hy, w: 3, color: '#E91E63' });
      els.push({ type: 'circle', x: hx + 2, y: hy, w: 3, color: '#E91E63' });
      els.push({ type: 'triangle', x: hx, y: hy + 6, w: 8, h: 6, color: '#E91E63' });
    }
    if (kws.has('arrow')) {
      const ax = randInt(14, 30), ay = randInt(20, 40);
      els.push({ type: 'line', x: ax, y: ay, w: ax + 20, h: ay, color: '#8D6E63', thickness: 1 });
      els.push({ type: 'triangle', x: ax + 22, y: ay, w: 4, h: 3, color: '#9E9E9E' });
    }
    if (kws.has('note')) {
      for (let i = 0; i < randInt(3, 6); i++) {
        const nx = randInt(10, 54), ny = randInt(10, 46);
        els.push({ type: 'circle', x: nx, y: ny, w: 2, color: pick(pal.accent) });
        els.push({ type: 'line', x: nx + 2, y: ny, w: nx + 2, h: ny - randInt(4, 8), color: pick(pal.accent), thickness: 1 });
      }
    }
    if (kws.has('car')) {
      const cx = randInt(14, 38), cy = Math.min(groundY - 3, 52);
      els.push({ type: 'rect', x: cx, y: cy, w: 14, h: 4, color: pick(pal.accent) });
      els.push({ type: 'rect', x: cx + 2, y: cy - 3, w: 8, h: 3, color: this._lighten(pick(pal.accent), 0.2) });
      els.push({ type: 'rect', x: cx + 4, y: cy - 2, w: 3, h: 2, color: '#B3E5FC' });
      els.push({ type: 'circle', x: cx + 2, y: cy + 4, w: 2, color: '#333333' });
      els.push({ type: 'circle', x: cx + 11, y: cy + 4, w: 2, color: '#333333' });
    }

    // ─ 12. Weather ─
    if (kws.has('rain')) {
      for (let i = 0; i < randInt(20, 40); i++) {
        const rx = randInt(0, S - 1), ry = randInt(0, S - 8);
        els.push({ type: 'line', x: rx, y: ry, w: rx - 1, h: ry + randInt(3, 6),
          color: '#90CAF9', thickness: 1 });
      }
    }
    if (kws.has('fog') && !kws.has('cave')) {
      for (let i = 0; i < randInt(3, 6); i++) {
        els.push({ type: 'ellipse', x: randInt(0, S), y: randInt(20, 48),
          w: randInt(14, 28), h: randInt(3, 6), color: '#C0C0C0' });
      }
    }
    if (kws.has('smoke')) {
      for (let i = 0; i < randInt(3, 6); i++) {
        els.push({ type: 'ellipse', x: randInt(16, 48), y: randInt(8, 32),
          w: randInt(4, 10), h: randInt(3, 6), color: pick(['#9E9E9E', '#BDBDBD', '#757575']) });
      }
    }

    // ─ 13. Beings ─
    if (kws.has('figure')) {
      const fx = randInt(22, 42), fy = Math.min(groundY - 9, 46);
      els.push({ type: 'rect', x: fx - 1, y: fy + 3, w: 3, h: 6, color: '#222222' });
      els.push({ type: 'circle', x: fx, y: fy, w: 2, color: '#222222' });
      els.push({ type: 'line', x: fx - 1, y: fy + 9, w: fx - 2, h: fy + 12, color: '#222222', thickness: 1 });
      els.push({ type: 'line', x: fx + 1, y: fy + 9, w: fx + 2, h: fy + 12, color: '#222222', thickness: 1 });
    }
    if (kws.has('eye')) {
      const ecx = randInt(22, 42), ecy = randInt(18, 38);
      const erx = randInt(8, 14), ery = randInt(4, 7);
      els.push({ type: 'ellipse', x: ecx, y: ecy, w: erx, h: ery, color: '#FFFFFF', outline: '#333333' });
      els.push({ type: 'circle', x: ecx, y: ecy, w: randInt(3, 5), color: pick(pal.accent) });
      els.push({ type: 'circle', x: ecx, y: ecy, w: 2, color: '#000000' });
      els.push({ type: 'rect', x: ecx + 1, y: ecy - 1, w: 1, h: 1, color: '#FFFFFF' });
    }
    if (kws.has('ghost')) {
      const gx = randInt(20, 44), gy = randInt(18, 40);
      els.push({ type: 'ellipse', x: gx, y: gy, w: randInt(5, 8), h: randInt(7, 11), color: '#D0D0D0' });
      els.push({ type: 'rect', x: gx - 2, y: gy - 1, w: 1, h: 1, color: '#111111' });
      els.push({ type: 'rect', x: gx + 2, y: gy - 1, w: 1, h: 1, color: '#111111' });
    }
    if (kws.has('cat')) {
      const cx = randInt(24, 42), cy = Math.min(groundY - 2, 50);
      els.push({ type: 'ellipse', x: cx, y: cy, w: 4, h: 3, color: '#333333' });
      els.push({ type: 'circle', x: cx - 3, y: cy - 2, w: 2, color: '#333333' });
      els.push({ type: 'triangle', x: cx - 5, y: cy - 5, w: 2, h: 2, color: '#333333' });
      els.push({ type: 'triangle', x: cx - 2, y: cy - 5, w: 2, h: 2, color: '#333333' });
      els.push({ type: 'line', x: cx + 3, y: cy, w: cx + 6, h: cy - 3, color: '#333333', thickness: 1 });
      els.push({ type: 'rect', x: cx - 4, y: cy - 2, w: 1, h: 1, color: '#FFD700' });
      els.push({ type: 'rect', x: cx - 2, y: cy - 2, w: 1, h: 1, color: '#FFD700' });
    }
    if (kws.has('fish') && waterY) {
      for (let i = 0; i < randInt(1, 3); i++) {
        const fishX = randInt(15, 48), fishY = randInt(waterY + 4, S - 5);
        els.push({ type: 'ellipse', x: fishX, y: fishY, w: 3, h: 2, color: pick(pal.accent) });
        els.push({ type: 'triangle', x: fishX + 4, y: fishY, w: 3, h: 3, color: pick(pal.accent) });
        els.push({ type: 'rect', x: fishX - 1, y: fishY, w: 1, h: 1, color: '#000000' });
      }
    }
    if (kws.has('snake')) {
      const snX = randInt(15, 30), snY = Math.min(groundY + 2, 54);
      for (let i = 0; i < 8; i++) {
        els.push({ type: 'rect', x: snX + i * 3, y: snY + (i % 2 === 0 ? 0 : 2), w: 3, h: 2, color: '#2E7D32' });
      }
      els.push({ type: 'rect', x: snX - 1, y: snY, w: 1, h: 1, color: '#FF0000' });
    }
    if (kws.has('monster')) {
      const mx = randInt(18, 40), my = randInt(20, 40);
      const mr = randInt(8, 14);
      els.push({ type: 'circle', x: mx, y: my, w: mr, color: pick(pal.accent) });
      els.push({ type: 'rect', x: mx - 3, y: my - 2, w: 2, h: 2, color: '#FF0000' });
      els.push({ type: 'rect', x: mx + 2, y: my - 2, w: 2, h: 2, color: '#FF0000' });
      els.push({ type: 'rect', x: mx - 2, y: my + 3, w: 5, h: 2, color: '#000000' });
      els.push({ type: 'triangle', x: mx - 4, y: my - mr - 3, w: 3, h: 5, color: pick(pal.accent) });
      els.push({ type: 'triangle', x: mx + 4, y: my - mr - 3, w: 3, h: 5, color: pick(pal.accent) });
    }
    if (kws.has('dog')) {
      const dx = randInt(20, 42), dy = Math.min(groundY - 3, 50);
      els.push({ type: 'ellipse', x: dx, y: dy, w: 5, h: 3, color: '#8D6E63' });
      els.push({ type: 'circle', x: dx - 4, y: dy - 2, w: 3, color: '#8D6E63' });
      els.push({ type: 'rect', x: dx - 5, y: dy - 4, w: 2, h: 3, color: '#795548' });
      els.push({ type: 'rect', x: dx - 3, y: dy - 4, w: 2, h: 3, color: '#795548' });
      els.push({ type: 'line', x: dx + 4, y: dy - 1, w: dx + 7, h: dy - 4, color: '#8D6E63', thickness: 1 });
      els.push({ type: 'rect', x: dx - 6, y: dy - 2, w: 1, h: 1, color: '#000000' });
      els.push({ type: 'rect', x: dx - 3, y: dy + 3, w: 1, h: 3, color: '#795548' });
      els.push({ type: 'rect', x: dx + 3, y: dy + 3, w: 1, h: 3, color: '#795548' });
    }
    if (kws.has('horse')) {
      const hx = randInt(18, 38), hy = Math.min(groundY - 8, 44);
      els.push({ type: 'ellipse', x: hx, y: hy, w: 8, h: 5, color: '#8D6E63' });
      els.push({ type: 'ellipse', x: hx - 7, y: hy - 4, w: 3, h: 4, color: '#8D6E63' });
      els.push({ type: 'triangle', x: hx - 8, y: hy - 9, w: 2, h: 3, color: '#795548' });
      els.push({ type: 'rect', x: hx - 5, y: hy + 5, w: 1, h: 5, color: '#795548' });
      els.push({ type: 'rect', x: hx + 5, y: hy + 5, w: 1, h: 5, color: '#795548' });
      for (let i = 0; i < 5; i++) {
        els.push({ type: 'rect', x: hx + 6 + i, y: hy - 2 + i, w: 1, h: 1, color: '#5D4037' });
      }
    }
    if (kws.has('butterfly')) {
      for (let i = 0; i < randInt(2, 4); i++) {
        const bx = randInt(10, 54), by = randInt(8, 36);
        const bc = pick(pal.accent);
        els.push({ type: 'ellipse', x: bx - 2, y: by, w: 2, h: 3, color: bc });
        els.push({ type: 'ellipse', x: bx + 2, y: by, w: 2, h: 3, color: bc });
        els.push({ type: 'rect', x: bx, y: by - 1, w: 1, h: 3, color: '#333333' });
      }
    }
    if (kws.has('spider')) {
      const sx = randInt(20, 44), sy = randInt(16, 40);
      els.push({ type: 'circle', x: sx, y: sy, w: 2, color: '#333333' });
      for (let a = 0; a < 8; a++) {
        const angle = (a / 8) * Math.PI * 2;
        els.push({ type: 'line', x: sx, y: sy,
          w: sx + Math.round(Math.cos(angle) * 4), h: sy + Math.round(Math.sin(angle) * 4),
          color: '#333333', thickness: 1 });
      }
    }
    if (kws.has('rabbit')) {
      const rx = randInt(22, 42), ry = Math.min(groundY - 3, 50);
      els.push({ type: 'ellipse', x: rx, y: ry, w: 3, h: 3, color: '#E0E0E0' });
      els.push({ type: 'circle', x: rx - 2, y: ry - 2, w: 2, color: '#E0E0E0' });
      els.push({ type: 'rect', x: rx - 3, y: ry - 6, w: 1, h: 3, color: '#E0E0E0' });
      els.push({ type: 'rect', x: rx - 1, y: ry - 6, w: 1, h: 3, color: '#E0E0E0' });
      els.push({ type: 'rect', x: rx - 3, y: ry - 2, w: 1, h: 1, color: '#FF1744' });
      els.push({ type: 'circle', x: rx + 3, y: ry + 1, w: 1, color: '#E0E0E0' });
    }
    if (kws.has('deer')) {
      const dx = randInt(18, 40), dy = Math.min(groundY - 10, 42);
      els.push({ type: 'ellipse', x: dx, y: dy, w: 6, h: 4, color: '#8D6E63' });
      els.push({ type: 'circle', x: dx - 5, y: dy - 3, w: 2, color: '#8D6E63' });
      els.push({ type: 'line', x: dx - 5, y: dy - 6, w: dx - 8, h: dy - 12, color: '#5D4037', thickness: 1 });
      els.push({ type: 'line', x: dx - 4, y: dy - 6, w: dx - 1, h: dy - 12, color: '#5D4037', thickness: 1 });
      els.push({ type: 'line', x: dx - 8, y: dy - 12, w: dx - 10, h: dy - 14, color: '#5D4037', thickness: 1 });
      els.push({ type: 'line', x: dx - 1, y: dy - 12, w: dx + 1, h: dy - 14, color: '#5D4037', thickness: 1 });
      els.push({ type: 'rect', x: dx - 3, y: dy + 4, w: 1, h: 5, color: '#795548' });
      els.push({ type: 'rect', x: dx + 4, y: dy + 4, w: 1, h: 5, color: '#795548' });
    }
    if (kws.has('whale') && waterY) {
      const wx = randInt(14, 40), wy = randInt(waterY + 6, S - 8);
      els.push({ type: 'ellipse', x: wx, y: wy, w: 10, h: 5, color: '#37474F' });
      els.push({ type: 'ellipse', x: wx, y: wy - 1, w: 8, h: 3, color: '#546E7A' });
      els.push({ type: 'triangle', x: wx + 10, y: wy, w: 6, h: 5, color: '#37474F' });
      els.push({ type: 'rect', x: wx - 6, y: wy, w: 1, h: 1, color: '#FFFFFF' });
    }
    if (kws.has('bat')) {
      for (let i = 0; i < randInt(2, 5); i++) {
        const bx = randInt(8, 56), by = randInt(4, 24);
        els.push({ type: 'rect', x: bx, y: by, w: 1, h: 1, color: '#333333' });
        els.push({ type: 'line', x: bx - 3, y: by + 1, w: bx - 1, h: by - 1, color: '#333333', thickness: 1 });
        els.push({ type: 'line', x: bx + 1, y: by - 1, w: bx + 3, h: by + 1, color: '#333333', thickness: 1 });
      }
    }
    if (kws.has('angel')) {
      const ax = randInt(22, 42), ay = randInt(12, 30);
      els.push({ type: 'circle', x: ax, y: ay, w: 2, color: '#FFFFFF' });
      els.push({ type: 'rect', x: ax - 1, y: ay + 3, w: 3, h: 6, color: '#FFFFFF' });
      els.push({ type: 'ellipse', x: ax - 5, y: ay + 4, w: 3, h: 5, color: '#E0E0E0' });
      els.push({ type: 'ellipse', x: ax + 5, y: ay + 4, w: 3, h: 5, color: '#E0E0E0' });
      els.push({ type: 'circle', x: ax, y: ay - 3, w: 3, color: null, outline: '#FFD700' });
    }

    // ─ 14. Abstract ─
    if (kws.has('spiral')) {
      const scx = S / 2, scy = S / 2;
      for (let r = 3; r < 24; r += 3) {
        els.push({ type: 'circle', x: scx, y: scy, w: r, color: null, outline: pal.accent[r % pal.accent.length] });
      }
    }
    if (kws.has('void')) {
      const vx = randInt(24, 40), vy = randInt(22, 42), vr = randInt(8, 13);
      els.push({ type: 'circle', x: vx, y: vy, w: vr + 4, color: '#0a0a0a' });
      els.push({ type: 'circle', x: vx, y: vy, w: vr, color: '#000000' });
      els.push({ type: 'circle', x: vx, y: vy, w: vr + 6, color: null, outline: pick(pal.accent) });
    }
    if (kws.has('light') && !kws.has('sun')) {
      const lx = randInt(20, 44), ly = randInt(10, 30);
      for (let a = 0; a < 10; a++) {
        const angle = (a / 10) * Math.PI * 2;
        const len = randInt(14, 28);
        els.push({ type: 'line', x: lx, y: ly,
          w: lx + Math.round(Math.cos(angle) * len), h: ly + Math.round(Math.sin(angle) * len),
          color: '#FFFDE7', thickness: 1 });
      }
      els.push({ type: 'circle', x: lx, y: ly, w: 3, color: '#FFFFFF' });
    }
    if (kws.has('mirror')) {
      els.push({ type: 'line', x: 0, y: S / 2, w: S - 1, h: S / 2, color: '#C0C0C0', thickness: 1 });
      els.push({ type: 'rect', x: S / 2 - 6, y: S / 2 - 12, w: 12, h: 24, color: null, outline: '#A0A0A0' });
    }
    if (kws.has('web')) {
      const wcx = randInt(20, 44), wcy = randInt(20, 44);
      for (let a = 0; a < 8; a++) {
        const angle = (a / 8) * Math.PI * 2;
        const len = randInt(12, 22);
        els.push({ type: 'line', x: wcx, y: wcy,
          w: wcx + Math.round(Math.cos(angle) * len), h: wcy + Math.round(Math.sin(angle) * len),
          color: '#E0E0E0', thickness: 1 });
      }
      for (let r = 5; r < 20; r += 5) {
        els.push({ type: 'circle', x: wcx, y: wcy, w: r, color: null, outline: '#D0D0D0' });
      }
    }
    if (kws.has('portal')) {
      const pcx = randInt(22, 42), pcy = randInt(22, 42);
      for (let r = 3; r < 11; r += 2) {
        els.push({ type: 'circle', x: pcx, y: pcy, w: r, color: null, outline: pal.accent[r % pal.accent.length] });
      }
      els.push({ type: 'circle', x: pcx, y: pcy, w: 2, color: '#FFFFFF' });
    }
    if (kws.has('path')) {
      const pw = randInt(4, 8);
      const px = S / 2 - Math.floor(pw / 2);
      els.push({ type: 'rect', x: px, y: groundY, w: pw, h: S - groundY, color: '#A1887F' });
      for (let py = groundY; py < S; py += randInt(3, 5)) {
        els.push({ type: 'rect', x: px + randInt(-1, pw), y: py, w: 1, h: 1, color: '#8D6E63' });
      }
    }
    if (kws.has('teardrop')) {
      for (let i = 0; i < randInt(3, 7); i++) {
        const tx = randInt(10, 54), ty = randInt(10, 46);
        els.push({ type: 'circle', x: tx, y: ty, w: 2, color: '#90CAF9' });
        els.push({ type: 'triangle', x: tx, y: ty - 4, w: 2, h: 3, color: '#90CAF9' });
      }
    }
    if (kws.has('blood')) {
      for (let i = 0; i < randInt(4, 8); i++) {
        els.push({ type: 'circle', x: randInt(8, 56), y: randInt(groundY - 6, Math.min(groundY + 4, S - 2)),
          w: randInt(1, 3), color: '#B71C1C' });
      }
    }
    if (kws.has('shadow')) {
      const sx = randInt(16, 40), sy = randInt(20, 44);
      els.push({ type: 'ellipse', x: sx, y: sy, w: randInt(6, 12), h: randInt(10, 18), color: '#111111' });
      els.push({ type: 'rect', x: sx - 1, y: sy - 4, w: 1, h: 1, color: '#FF0000' });
      els.push({ type: 'rect', x: sx + 1, y: sy - 4, w: 1, h: 1, color: '#FF0000' });
    }

    return scene;
  }

  /**
   * Pick sky gradient from keywords or emotion palette.
   */
  _pickSky(kws, pal) {
    for (const [key, preset] of Object.entries(SKY_PRESETS)) {
      if (kws.has(key)) return preset;
    }
    return { top: pal.sky[0], bot: pal.sky[1], stars: false };
  }

  // ── Scene Renderer ─────────────────────────────────────────

  _renderScene(scene) {
    const grid = new Array(PIXELS);
    const S = this.gridSize;

    const topRGB = this._hexToRGB(scene.bg.topColor || '#000000');
    const botRGB = this._hexToRGB(scene.bg.bottomColor || '#111111');
    for (let y = 0; y < S; y++) {
      const t = y / (S - 1);
      const r = Math.round(topRGB.r + (botRGB.r - topRGB.r) * t);
      const g = Math.round(topRGB.g + (botRGB.g - topRGB.g) * t);
      const b = Math.round(topRGB.b + (botRGB.b - topRGB.b) * t);
      const color = this._rgbToHex(r, g, b);
      for (let x = 0; x < S; x++) {
        grid[y * S + x] = color;
      }
    }

    for (const el of scene.elements) {
      this._drawElement(grid, el, S);
    }

    return grid;
  }

  _drawElement(grid, el, S) {
    const color = el.color || null;
    const outline = el.outline || null;
    if (!color && !outline) return;

    const x = Math.round(Number(el.x) || 0);
    const y = Math.round(Number(el.y) || 0);
    const w = Math.round(Number(el.w) || 4);
    const h = Math.round(Number(el.h) || 4);

    switch (el.type) {
      case 'rect':     this._drawRect(grid, S, x, y, w, h, color, outline); break;
      case 'circle':   this._drawCircle(grid, S, x, y, w, color, outline); break;
      case 'ellipse':  this._drawEllipse(grid, S, x, y, w, h, color, outline); break;
      case 'triangle': this._drawTriangle(grid, S, x, y, w, h, color, outline); break;
      case 'line':     this._drawLine(grid, S, x, y, w, h, color, el.thickness || 1); break;
      default:         if (color) this._drawRect(grid, S, x, y, w, h, color, outline);
    }
  }

  _setPixel(grid, S, x, y, color) {
    if (x >= 0 && x < S && y >= 0 && y < S && color) {
      grid[y * S + x] = color;
    }
  }

  _drawRect(grid, S, x, y, w, h, color, outline) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const isEdge = outline && (dy === 0 || dy === h - 1 || dx === 0 || dx === w - 1);
        const c = isEdge ? outline : color;
        if (c) this._setPixel(grid, S, x + dx, y + dy, c);
      }
    }
  }

  _drawCircle(grid, S, cx, cy, r, color, outline) {
    const r2 = r * r;
    const ri2 = Math.max(0, (r - 1) * (r - 1));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) {
          if (outline && d2 > ri2) {
            this._setPixel(grid, S, cx + dx, cy + dy, outline);
          } else if (color) {
            this._setPixel(grid, S, cx + dx, cy + dy, color);
          }
        }
      }
    }
  }

  _drawEllipse(grid, S, cx, cy, rx, ry, color, outline) {
    if (rx <= 0 || ry <= 0) return;
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d <= 1.0) {
          if (outline && d > 0.7) {
            this._setPixel(grid, S, cx + dx, cy + dy, outline);
          } else if (color) {
            this._setPixel(grid, S, cx + dx, cy + dy, color);
          }
        }
      }
    }
  }

  _drawTriangle(grid, S, topX, topY, baseW, h, color, outline) {
    for (let row = 0; row < h; row++) {
      const progress = row / Math.max(h - 1, 1);
      const rowW = Math.max(1, Math.round(baseW * progress));
      const startX = topX - Math.floor(rowW / 2);
      for (let dx = 0; dx < rowW; dx++) {
        const isEdge = outline && (row === 0 || row === h - 1 || dx === 0 || dx === rowW - 1);
        if (isEdge) {
          this._setPixel(grid, S, startX + dx, topY + row, outline);
        } else if (color) {
          this._setPixel(grid, S, startX + dx, topY + row, color);
        }
      }
    }
  }

  _drawLine(grid, S, x0, y0, x1, y1, color, thickness) {
    if (!color) return;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0, cy = y0;
    const half = Math.floor(thickness / 2);

    for (let step = 0; step < 500; step++) {
      for (let t = -half; t <= half; t++) {
        if (dx >= dy) this._setPixel(grid, S, cx, cy + t, color);
        else this._setPixel(grid, S, cx + t, cy, color);
      }
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  // ── Color Utilities ────────────────────────────────────────

  _hexToRGB(hex) {
    const n = parseInt((hex || '#000000').slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  _rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  _lighten(hex, factor) {
    const rgb = this._hexToRGB(hex);
    return this._rgbToHex(
      Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor)),
      Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor)),
      Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor))
    );
  }

  _darken(hex, factor) {
    const rgb = this._hexToRGB(hex);
    return this._rgbToHex(
      Math.round(rgb.r * (1 - factor)),
      Math.round(rgb.g * (1 - factor)),
      Math.round(rgb.b * (1 - factor))
    );
  }

  // ── PNG Rendering ──────────────────────────────────────────

  renderToPNG(colorGrid, scale = 4) {
    const size = this.gridSize * scale;
    const canvas = getCreateCanvas()(size, size);
    const ctx = canvas.getContext('2d');

    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        ctx.fillStyle = colorGrid[y * this.gridSize + x] || '#000000';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    return canvas.toBuffer('image/png');
  }

  // ── Public API ─────────────────────────────────────────────

  async generateColorGrid(narrative, emotion, genre, callLLM) {
    const keywords = await this._extractKeywords(narrative, callLLM);

    const finalKws = keywords.length > 0
      ? keywords
      : (GENRE_DEFAULTS[genre] || GENRE_DEFAULTS.surreal_narrative);

    console.log(`  ★ Neko-Pixel-Pro keywords: [${finalKws.join(', ')}]`);

    const scene = this._composeScene(finalKws, emotion, genre);
    return this._renderScene(scene);
  }

  async generateFromNarrative(narrative, options = {}) {
    const emotion = options.emotion || 'neutral';
    const genre = options.genre || 'abstract_vision';
    const scale = options.scale || 4;
    const callLLM = options.callLLM || null;

    console.log(`  ★ Neko-Pixel-Pro: generating ${this.gridSize}×${this.gridSize} [${emotion}/${genre}]`);

    const colorGrid = await this.generateColorGrid(narrative, emotion, genre, callLLM);
    const png = this.renderToPNG(colorGrid, scale);

    return {
      png,
      colorGrid,
      metadata: {
        engine: 'Neko-Pixel-Pro v3.0',
        gridSize: this.gridSize,
        scale,
        outputSize: this.gridSize * scale,
        emotion,
        genre,
        generated: new Date().toISOString(),
        pixelCount: PIXELS,
        usedLLM: !!callLLM,
      }
    };
  }
}

/**
 * Check whether optional pixel art dependencies are installed.
 */
NekoPixelPro.depsInstalled = function () {
  try { require.resolve('@napi-rs/canvas'); return true; } catch (_) { return false; }
};

module.exports = NekoPixelPro;

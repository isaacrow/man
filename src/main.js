import { RDFManuscriptParser } from './rdf-parser.js';
import { AREngine } from './ar-engine.js';
import { ARCardManager } from './ar-card.js';
import { RDFGraphVisualizer } from './graph-visualizer.js';
import { ManuscriptSimulator } from './simulator.js';
import { ManuscriptSpeechEngine } from './speech.js';

class AppController {
  constructor() {
    this.mode = 'camera'; // 'camera' or 'simulator'
    this.rdfParser = new RDFManuscriptParser();
    this.speech = new ManuscriptSpeechEngine();
    this.arEngine = null;
    this.simulator = null;
    this.cardManager = null;
    this.graphVisualizer = null;
    this.rawInitialTtl = '';
    this.activeHotspot = null;
    this.lastTime = performance.now();

    // DOM Elements
    this.dom = {
      arContainer: document.getElementById('ar-container'),
      simulatorContainer: document.getElementById('simulator-container'),
      modeToggleBtn: document.getElementById('btn-mode-toggle'),
      modeIcon: document.getElementById('mode-icon'),
      modeText: document.getElementById('mode-text'),
      audioGuideBtn: document.getElementById('btn-audio-guide'),
      snapshotBtn: document.getElementById('btn-snapshot'),
      helpBtn: document.getElementById('btn-help'),
      trackingStatus: document.getElementById('tracking-status'),
      trackingText: document.getElementById('tracking-text'),
      scanningHud: document.getElementById('scanning-hud'),
      metaTitle: document.getElementById('meta-title'),
      metaCreator: document.getElementById('meta-creator'),
      metaDate: document.getElementById('meta-date'),
      metaPublisher: document.getElementById('meta-publisher'),
      metaMaterial: document.getElementById('meta-material'),
      textArabic: document.getElementById('text-arabic'),
      textEnglish: document.getElementById('text-english'),
      btnReadAr: document.getElementById('btn-read-ar'),
      btnReadEn: document.getElementById('btn-read-en'),
      graphCanvas: document.getElementById('graph-canvas'),
      ttlEditor: document.getElementById('ttl-code-editor'),
      btnApplyRdf: document.getElementById('btn-apply-rdf'),
      btnResetRdf: document.getElementById('btn-reset-rdf'),
      hotspotModal: document.getElementById('hotspot-modal'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      btnCloseModal: document.getElementById('btn-close-modal'),
      btnModalAction: document.getElementById('btn-modal-action'),
      helpModal: document.getElementById('help-modal'),
      btnCloseHelp: document.getElementById('btn-close-help'),
      cameraFlash: document.getElementById('camera-flash')
    };
  }

  async init() {
    console.log('Initializing Kitāb al-Shifāʾ WebAR with RDF...');
    this._setupTabNavigation();
    this._setupModals();
    this._setupButtons();

    // 1. Load and parse RDF data
    try {
      const baseUrl = import.meta.env.BASE_URL || './';
      const data = await this.rdfParser.loadFromUrl(`${baseUrl}data/manuscript.ttl`);
      this.rawInitialTtl = this.rdfParser.rawTurtle;
      this.dom.ttlEditor.value = this.rawInitialTtl;
      this._updateUIWithMetadata(data.metadata);

      // Setup graph visualizer
      this.graphVisualizer = new RDFGraphVisualizer(this.dom.graphCanvas);
      this.graphVisualizer.setData(this.rdfParser.getGraphData());
      this.graphVisualizer.onSelect((node) => {
        console.log('Selected Graph Node:', node);
      });
    } catch (err) {
      console.error('Failed to load initial RDF:', err);
    }

    // 2. Initialize AR Camera mode
    await this._startCameraMode();
  }

  async _startCameraMode() {
    this.mode = 'camera';
    this.dom.arContainer.style.display = 'block';
    this.dom.simulatorContainer.style.display = 'none';
    this.dom.modeIcon.textContent = '📷';
    this.dom.modeText.textContent = 'AR Camera';
    this.dom.modeToggleBtn.classList.add('active');

    this._setTrackingState(false, 'Scanning for Manuscript...');

    if (this.simulator) {
      this.simulator.destroy();
      this.simulator = null;
    }

    try {
      const baseUrl = import.meta.env.BASE_URL || './';
      this.arEngine = new AREngine(this.dom.arContainer, `${baseUrl}targets/manuscript.mind`);

      this.arEngine.onTargetFound = () => {
        console.log('Target Detected in Real AR Camera!');
        this._setTrackingState(true, '🎯 Target Tracked (Real AR · 60 FPS)');
      };

      this.arEngine.onTargetLost = () => {
        console.log('Target Lost in AR Camera');
        this._setTrackingState(false, '🔍 Scanning for Manuscript...');
      };

      this.arEngine.onError = (err) => {
        console.warn('Camera AR unavailable, switching to Desktop Simulator:', err);
        this._startSimulatorMode();
      };

      const { renderer, scene, camera, anchorGroup } = await this.arEngine.init();

      // Create 3D Holographic Board, Hotspot Pins, and 3D AR Coordinates Frame
      this.cardManager = new ARCardManager(anchorGroup);
      this.cardManager.createHolographicCard(this.rdfParser.metadata);
      this.cardManager.createHotspots(this.rdfParser.hotspots);

      // Start AR tracking and animation loop
      this.lastTime = performance.now();
      await this.arEngine.start(() => {
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;
        if (this.cardManager) {
          this.cardManager.update(delta);
        }
      });

      this._setupInteractionRaycasting(renderer.domElement, camera);
    } catch (err) {
      console.warn('Camera AR init failed, switching to Desktop Simulator:', err);
      this._startSimulatorMode();
    }
  }

  _startSimulatorMode() {
    this.mode = 'simulator';
    this.dom.arContainer.style.display = 'none';
    this.dom.simulatorContainer.style.display = 'block';
    this.dom.modeIcon.textContent = '🖥️';
    this.dom.modeText.textContent = '3D Simulator';
    this.dom.modeToggleBtn.classList.remove('active');

    if (this.arEngine) {
      this.arEngine.stop();
      this.arEngine = null;
    }

    this.simulator = new ManuscriptSimulator(
      this.dom.simulatorContainer,
      () => {
        this._setTrackingState(true, '🎯 Target Tracked (Virtual 3D)');
      },
      () => {
        this._setTrackingState(false, 'Target Not in View');
      }
    );

    const anchorGroup = this.simulator.getAnchorGroup();
    const camera = this.simulator.getCamera();

    this.cardManager = new ARCardManager(anchorGroup);
    this.cardManager.createHolographicCard(this.rdfParser.metadata);
    this.cardManager.createHotspots(this.rdfParser.hotspots);

    this._setupInteractionRaycasting(this.simulator.renderer.domElement, camera);
  }

  _setupInteractionRaycasting(domElement, camera) {
    const handleTap = (e) => {
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

      if (this.cardManager) {
        const hitHotspot = this.cardManager.checkRaycast(
          camera,
          clientX,
          clientY,
          domElement.clientWidth,
          domElement.clientHeight
        );

        if (hitHotspot) {
          this._openHotspotModal(hitHotspot);
        }
      }
    };

    domElement.addEventListener('click', handleTap);
  }

  _setTrackingState(isFound, message) {
    if (isFound) {
      this.dom.trackingStatus.classList.add('found');
      this.dom.trackingText.textContent = message || 'Target Tracked';
      this.dom.scanningHud.classList.add('hidden');
    } else {
      this.dom.trackingStatus.classList.remove('found');
      this.dom.trackingText.textContent = message || 'Scanning for Manuscript...';
      this.dom.scanningHud.classList.remove('hidden');
    }
  }

  _updateUIWithMetadata(meta) {
    if (!meta) return;

    this.dom.metaTitle.textContent = meta.title || '—';
    this.dom.metaCreator.textContent = `${meta.creator || 'Ibn Sīnā'} (${meta.authorJob || ''})`;
    this.dom.metaDate.textContent = meta.date || '—';
    this.dom.metaPublisher.textContent = meta.publisher || '—';
    this.dom.metaMaterial.textContent = meta.material || '—';

    this.dom.textArabic.textContent = meta.transcriptionArabic || '—';
    this.dom.textEnglish.textContent = meta.translationEnglish || '—';
  }

  _setupTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('active'));
        tabPanes.forEach((p) => p.classList.remove('active'));

        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        const pane = document.getElementById(tabId);
        if (pane) {
          pane.classList.add('active');
        }

        if (tabId === 'tab-graph' && this.graphVisualizer) {
          setTimeout(() => this.graphVisualizer.resize(), 50);
        }
      });
    });
  }

  _setupModals() {
    this.dom.btnCloseModal.addEventListener('click', () => {
      this.dom.hotspotModal.classList.remove('active');
    });

    this.dom.btnModalAction.addEventListener('click', () => {
      if (this.activeHotspot) {
        this.speech.speak(`${this.activeHotspot.label}. ${this.activeHotspot.description}`);
      }
    });

    this.dom.helpBtn.addEventListener('click', () => {
      this.dom.helpModal.classList.add('active');
    });

    this.dom.btnCloseHelp.addEventListener('click', () => {
      this.dom.helpModal.classList.remove('active');
    });
  }

  _openHotspotModal(hs) {
    this.activeHotspot = hs;
    this.dom.modalTitle.textContent = hs.label;
    this.dom.modalBody.innerHTML = `
      <p style="margin-bottom: 8px;"><strong>Location:</strong> <span style="color: var(--cyan-primary);">${hs.folio}</span></p>
      <p style="line-height: 1.6;">${hs.description}</p>
    `;
    this.dom.hotspotModal.classList.add('active');
  }

  _setupButtons() {
    // Mode switch
    this.dom.modeToggleBtn.addEventListener('click', () => {
      if (this.mode === 'camera') {
        this._startSimulatorMode();
      } else {
        this._startCameraMode();
      }
    });

    // Audio Guide Main
    this.dom.audioGuideBtn.addEventListener('click', () => {
      const summary = `You are viewing the illuminated opening of Kitāb al-Shifāʾ, the Book of Healing, by the legendary Islamic polymath Ibn Sīnā, also known as Avicenna. This 16th to 17th century manuscript features an ornate lapis lazuli and gold headpiece, clear Naskh calligraphy, and the historical seal of the Iranian National Parliament Library.`;
      this.speech.toggle(summary, 'en');
    });

    // Read Arabic text
    this.dom.btnReadAr.addEventListener('click', () => {
      const arText = this.dom.textArabic.textContent;
      this.speech.toggle(arText, 'ar');
    });

    // Read English translation
    this.dom.btnReadEn.addEventListener('click', () => {
      const enText = this.dom.textEnglish.textContent;
      this.speech.toggle(enText, 'en');
    });

    // Snapshot feature
    this.dom.snapshotBtn.addEventListener('click', () => {
      this.dom.cameraFlash.classList.add('flash');
      setTimeout(() => this.dom.cameraFlash.classList.remove('flash'), 200);

      const targetCanvas = this.mode === 'camera' 
        ? this.dom.arContainer.querySelector('canvas') 
        : this.dom.simulatorContainer.querySelector('canvas');

      if (targetCanvas) {
        const link = document.createElement('a');
        link.download = `manuscript-ar-${Date.now()}.png`;
        link.href = targetCanvas.toDataURL('image/png');
        link.click();
      }
    });

    // RDF Live Editor: Apply
    this.dom.btnApplyRdf.addEventListener('click', async () => {
      try {
        const updatedTtl = this.dom.ttlEditor.value;
        const data = await this.rdfParser.parseTurtle(updatedTtl);
        this._updateUIWithMetadata(data.metadata);

        if (this.cardManager) {
          this.cardManager.createHolographicCard(data.metadata);
          this.cardManager.createHotspots(data.hotspots);
        }

        if (this.graphVisualizer) {
          this.graphVisualizer.setData(this.rdfParser.getGraphData());
        }

        alert('✨ AR Hologram and Metadata updated successfully from modified RDF!');
      } catch (err) {
        alert(`RDF Syntax Error: ${err.message}`);
      }
    });

    // RDF Live Editor: Reset
    this.dom.btnResetRdf.addEventListener('click', async () => {
      this.dom.ttlEditor.value = this.rawInitialTtl;
      const data = await this.rdfParser.parseTurtle(this.rawInitialTtl);
      this._updateUIWithMetadata(data.metadata);

      if (this.cardManager) {
        this.cardManager.createHolographicCard(data.metadata);
        this.cardManager.createHotspots(data.hotspots);
      }

      if (this.graphVisualizer) {
        this.graphVisualizer.setData(this.rdfParser.getGraphData());
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.init();
});

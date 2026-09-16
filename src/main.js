import { RDFManuscriptParser } from './rdf-parser.js';
import { AREngine } from './ar-engine.js';
import { ARCardManager } from './ar-card.js';
import { RDFGraphVisualizer } from './graph-visualizer.js';
import { ManuscriptSimulator } from './simulator.js';
import { ManuscriptSpeechEngine } from './speech.js';

class AppController {
  constructor() {
    this.mode = 'camera';
    this.parsers = [
      new RDFManuscriptParser(),
      new RDFManuscriptParser(),
      new RDFManuscriptParser(),
      new RDFManuscriptParser(),
      new RDFManuscriptParser()
    ];
    this.speech = new ManuscriptSpeechEngine();
    this.arEngine = null;
    this.simulator = null;
    this.cardManagers = [];
    this.graphVisualizer = null;
    this.currentTargetIndex = 0;
    this.activeHotspot = null;
    this.lastTime = performance.now();

    this.targetNames = [
      'Al-Qabasat (Mir Damad)',
      'The Quran (Haydar Ali)',
      'Ilal al-Sharayi (Al-Saduq)',
      'Kufic Quran (Zayn al-Abidin)',
      'Archaic Naskh Quran'
    ];

    // DOM Elements
    this.dom = {
      arContainer: document.getElementById('ar-container'),
      simulatorContainer: document.getElementById('simulator-container'),
      modeToggleBtn: document.getElementById('btn-mode-toggle'),
      modeText: document.getElementById('mode-text'),
      audioGuideBtn: document.getElementById('btn-audio-guide'),
      snapshotBtn: document.getElementById('btn-snapshot'),
      trackingStatus: document.getElementById('tracking-status'),
      trackingText: document.getElementById('tracking-text'),
      scanningHud: document.getElementById('scanning-hud'),
      bottomPanel: document.getElementById('bottom-panel'),
      targetSwitcher: document.getElementById('target-switcher-wrapper'),
      targetBtns: document.querySelectorAll('.target-btn'),
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
      cameraFlash: document.getElementById('camera-flash')
    };
  }

  async init() {
    console.log('Initializing Alqami 5-Target AR...');
    this._setupTabNavigation();
    this._setupModals();
    this._setupButtons();

    // 1. Load all 5 MARC21 RDF datasets
    try {
      const baseUrl = import.meta.env.BASE_URL || './';
      await Promise.all([
        this.parsers[0].loadFromUrl(`${baseUrl}data/manuscript.ttl`),
        this.parsers[1].loadFromUrl(`${baseUrl}data/manuscript2.ttl`),
        this.parsers[2].loadFromUrl(`${baseUrl}data/manuscript3.ttl`),
        this.parsers[3].loadFromUrl(`${baseUrl}data/manuscript4.ttl`),
        this.parsers[4].loadFromUrl(`${baseUrl}data/manuscript5.ttl`)
      ]);

      this._displayTargetData(0);

      this.graphVisualizer = new RDFGraphVisualizer(this.dom.graphCanvas);
      this.graphVisualizer.setData(this.parsers[0].getGraphData());
    } catch (err) {
      console.error('Failed to load RDF datasets:', err);
    }

    // 2. Start in Camera AR mode
    await this._startCameraMode();
  }

  _displayTargetData(targetIndex) {
    this.currentTargetIndex = targetIndex;
    const parser = this.parsers[targetIndex];
    if (!parser || !parser.metadata) return;

    this.dom.ttlEditor.value = parser.rawTurtle;
    this._updateUIWithMetadata(parser.metadata);

    if (this.graphVisualizer) {
      this.graphVisualizer.setData(parser.getGraphData());
    }

    this.dom.targetBtns.forEach(btn => {
      const btnIdx = parseInt(btn.getAttribute('data-target'), 10);
      btn.classList.toggle('active', btnIdx === targetIndex);
    });
  }

  async _startCameraMode() {
    this.mode = 'camera';
    this.dom.arContainer.style.display = 'block';
    this.dom.simulatorContainer.style.display = 'none';
    this.dom.targetSwitcher.style.display = 'none';
    this.dom.modeText.textContent = 'Camera';
    this.dom.modeToggleBtn.classList.add('active');

    this._setTrackingState(false, 'Scanning for manuscript');

    if (this.simulator) {
      this.simulator.destroy();
      this.simulator = null;
    }

    try {
      const baseUrl = import.meta.env.BASE_URL || './';
      this.arEngine = new AREngine(this.dom.arContainer, `${baseUrl}targets/targets.mind`);

      this.arEngine.onTargetFound = (targetIndex) => {
        console.log(`Target ${targetIndex} Detected in AR Camera!`);
        this._displayTargetData(targetIndex);
        const name = this.targetNames[targetIndex] || `Target ${targetIndex + 1}`;
        this._setTrackingState(true, `${name} · 60 FPS`);
      };

      this.arEngine.onTargetLost = (targetIndex) => {
        console.log(`Target ${targetIndex} Lost`);
        this._setTrackingState(false, 'Scanning for manuscript');
      };

      this.arEngine.onError = (err) => {
        console.warn('Camera AR unavailable, switching to Simulator:', err);
        this._startSimulatorMode();
      };

      const { renderer, scene, camera, anchorGroups } = await this.arEngine.init();

      // Create 3D Holograms for all 5 targets
      this.cardManagers = anchorGroups.map((group, index) => {
        const mgr = new ARCardManager(group);
        if (this.parsers[index] && this.parsers[index].metadata) {
          mgr.createHolographicCard(this.parsers[index].metadata);
          mgr.createHotspots(this.parsers[index].hotspots);
        }
        return mgr;
      });

      this.lastTime = performance.now();
      await this.arEngine.start(() => {
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;
        this.cardManagers.forEach(mgr => mgr.update(delta));
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
    this.dom.targetSwitcher.style.display = 'flex';
    this.dom.modeText.textContent = 'Simulator';
    this.dom.modeToggleBtn.classList.remove('active');

    if (this.arEngine) {
      this.arEngine.stop();
      this.arEngine = null;
    }

    this.simulator = new ManuscriptSimulator(
      this.dom.simulatorContainer,
      (targetIndex) => {
        this._displayTargetData(targetIndex);
        const name = this.targetNames[targetIndex] || `Target ${targetIndex + 1}`;
        this._setTrackingState(true, `${name} (Virtual 3D)`);
      },
      () => {
        this._setTrackingState(false, 'Target Not in View');
      }
    );

    const anchorGroup = this.simulator.getAnchorGroup();
    const camera = this.simulator.getCamera();

    this.cardManagers = [new ARCardManager(anchorGroup)];
    this.cardManagers[0].createHolographicCard(this.parsers[0].metadata);
    this.cardManagers[0].createHotspots(this.parsers[0].hotspots);

    this._setupInteractionRaycasting(this.simulator.renderer.domElement, camera);
  }

  _setupInteractionRaycasting(domElement, camera) {
    const handleTap = (e) => {
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

      for (const mgr of this.cardManagers) {
        const hitHotspot = mgr.checkRaycast(
          camera,
          clientX,
          clientY,
          domElement.clientWidth,
          domElement.clientHeight
        );

        if (hitHotspot) {
          this._openHotspotModal(hitHotspot);
          break;
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
      this.dom.bottomPanel.classList.remove('collapsed');
      this.dom.bottomPanel.classList.add('expanded');
    } else {
      this.dom.trackingStatus.classList.remove('found');
      this.dom.trackingText.textContent = message || 'Scanning for manuscript';
      this.dom.scanningHud.classList.remove('hidden');
      this.dom.bottomPanel.classList.add('collapsed');
      this.dom.bottomPanel.classList.remove('expanded');
    }
  }

  _updateUIWithMetadata(meta) {
    if (!meta) return;

    this.dom.metaTitle.textContent = meta.title || '—';
    this.dom.metaCreator.textContent = meta.creator || 'Master Scribe';
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
  }

  _openHotspotModal(hs) {
    this.activeHotspot = hs;
    this.dom.modalTitle.textContent = hs.label;
    this.dom.modalBody.innerHTML = `
      <p style="margin-bottom: 8px;"><strong>Location:</strong> <span style="color: var(--apple-blue);">${hs.folio}</span></p>
      <p style="line-height: 1.6;">${hs.description}</p>
    `;
    this.dom.hotspotModal.classList.add('active');
  }

  _setupButtons() {
    this.dom.modeToggleBtn.addEventListener('click', () => {
      if (this.mode === 'camera') {
        this._startSimulatorMode();
      } else {
        this._startCameraMode();
      }
    });

    this.dom.targetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetIdx = parseInt(btn.getAttribute('data-target'), 10);
        this._displayTargetData(targetIdx);

        if (this.simulator) {
          this.simulator.loadTarget(targetIdx);
          if (this.cardManagers[0]) {
            this.cardManagers[0].createHolographicCard(this.parsers[targetIdx].metadata);
            this.cardManagers[0].createHotspots(this.parsers[targetIdx].hotspots);
          }
        }
      });
    });

    this.dom.audioGuideBtn.addEventListener('click', () => {
      const meta = this.parsers[this.currentTargetIndex]?.metadata;
      const summary = `You are viewing ${meta?.title || 'the manuscript'}. Author or scribe: ${meta?.creator || ''}. Period: ${meta?.date || ''}. Holding repository: ${meta?.publisher || 'Al-Abbas Holy Shrine Library'}.`;
      this.speech.toggle(summary, 'en');
    });

    this.dom.btnReadAr.addEventListener('click', () => {
      const arText = this.dom.textArabic.textContent;
      this.speech.toggle(arText, 'ar');
    });

    this.dom.btnReadEn.addEventListener('click', () => {
      const enText = this.dom.textEnglish.textContent;
      this.speech.toggle(enText, 'en');
    });

    this.dom.snapshotBtn.addEventListener('click', () => {
      this.dom.cameraFlash.classList.add('flash');
      setTimeout(() => this.dom.cameraFlash.classList.remove('flash'), 200);

      const targetCanvas = this.mode === 'camera' 
        ? this.dom.arContainer.querySelector('canvas') 
        : this.dom.simulatorContainer.querySelector('canvas');

      if (targetCanvas) {
        const link = document.createElement('a');
        link.download = `alqami-${Date.now()}.png`;
        link.href = targetCanvas.toDataURL('image/png');
        link.click();
      }
    });

    this.dom.btnApplyRdf.addEventListener('click', async () => {
      try {
        const updatedTtl = this.dom.ttlEditor.value;
        const data = await this.parsers[this.currentTargetIndex].parseTurtle(updatedTtl);
        this._updateUIWithMetadata(data.metadata);

        const currentMgr = this.cardManagers[this.currentTargetIndex] || this.cardManagers[0];
        if (currentMgr) {
          currentMgr.createHolographicCard(data.metadata);
          currentMgr.createHotspots(data.hotspots);
        }

        if (this.graphVisualizer) {
          this.graphVisualizer.setData(this.parsers[this.currentTargetIndex].getGraphData());
        }

        alert('AR Hologram and metadata updated successfully.');
      } catch (err) {
        alert(`RDF Syntax Error: ${err.message}`);
      }
    });

    this.dom.btnResetRdf.addEventListener('click', async () => {
      const parser = this.parsers[this.currentTargetIndex];
      this.dom.ttlEditor.value = parser.rawTurtle;
      const data = await parser.parseTurtle(parser.rawTurtle);
      this._updateUIWithMetadata(data.metadata);

      const currentMgr = this.cardManagers[this.currentTargetIndex] || this.cardManagers[0];
      if (currentMgr) {
        currentMgr.createHolographicCard(data.metadata);
        currentMgr.createHotspots(data.hotspots);
      }

      if (this.graphVisualizer) {
        this.graphVisualizer.setData(parser.getGraphData());
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.init();
});

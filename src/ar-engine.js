import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import * as THREE from 'three';

export class AREngine {
  constructor(containerElement, targetSrc = '/targets/targets.mind') {
    this.container = containerElement;
    this.targetSrc = targetSrc;
    this.mindarThree = null;
    this.anchors = [];
    this.isRunning = false;
    this.activeTargetIndex = -1;

    this.onTargetFound = null;
    this.onTargetLost = null;
    this.onError = null;
  }

  async init() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) not supported in this browser. Please ensure HTTPS is enabled or use Chrome/Safari.');
      }

      this.mindarThree = new MindARThree({
        container: this.container,
        imageTargetSrc: this.targetSrc,
        filterMinCF: 0.0005,
        filterBeta: 500,
        warmupTolerance: 4,
        missTolerance: 6,
        uiLoading: 'no',
        uiScanning: 'no'
      });

      const { renderer, scene, camera } = this.mindarThree;

      if (renderer.outputEncoding !== undefined) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
      dirLight.position.set(1, 3, 2);
      scene.add(dirLight);

      const pointLight = new THREE.PointLight(0x0071e3, 2.0, 8);
      pointLight.position.set(0, 1, 1);
      scene.add(pointLight);

      // Support 5 targets:
      // 0: Al-Qabasat (Mir Damad)
      // 1: Quran (Haydar Ali, Karbala)
      // 2: Ilal al-Sharayi' (Al-Saduq)
      // 3: Kufic Quran (Zayn al-Abidin)
      // 4: Archaic Naskh Quran with Polychrome Vocalization
      this.anchors = [
        this.mindarThree.addAnchor(0),
        this.mindarThree.addAnchor(1),
        this.mindarThree.addAnchor(2),
        this.mindarThree.addAnchor(3),
        this.mindarThree.addAnchor(4)
      ];

      this.anchors.forEach((anchor, index) => {
        anchor.onTargetFound = () => {
          this.activeTargetIndex = index;
          if (this.onTargetFound) this.onTargetFound(index);
        };

        anchor.onTargetLost = () => {
          if (this.activeTargetIndex === index) {
            this.activeTargetIndex = -1;
          }
          if (this.onTargetLost) this.onTargetLost(index);
        };
      });

      return {
        renderer,
        scene,
        camera,
        anchorGroups: this.anchors.map(a => a.group)
      };
    } catch (err) {
      console.error('AREngine init error:', err);
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  async start(onFrameUpdate) {
    if (!this.mindarThree) return;
    try {
      await this.mindarThree.start();
      this.isRunning = true;

      const { renderer, scene, camera } = this.mindarThree;
      renderer.setAnimationLoop(() => {
        if (onFrameUpdate) onFrameUpdate();
        renderer.render(scene, camera);
      });
    } catch (err) {
      console.error('Error starting MindAR:', err);
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  stop() {
    if (this.mindarThree) {
      try {
        const { renderer } = this.mindarThree;
        if (renderer) {
          renderer.setAnimationLoop(null);
        }
        if (this.isRunning) {
          this.mindarThree.stop();
        }
      } catch (e) {
        console.warn('Error during MindAR stop:', e);
      }
      this.isRunning = false;
      this.activeTargetIndex = -1;
    }
  }

  getAnchorGroups() {
    return this.anchors.map(a => a.group);
  }

  getCamera() {
    return this.mindarThree ? this.mindarThree.camera : null;
  }

  getRenderer() {
    return this.mindarThree ? this.mindarThree.renderer : null;
  }
}

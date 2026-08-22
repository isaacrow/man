import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import * as THREE from 'three';

export class AREngine {
  constructor(containerElement, targetSrc = '/targets/manuscript.mind') {
    this.container = containerElement;
    this.targetSrc = targetSrc;
    this.mindarThree = null;
    this.anchor = null;
    this.isRunning = false;
    this.isTargetFound = false;

    this.onTargetFound = null;
    this.onTargetLost = null;
    this.onError = null;
  }

  async init() {
    try {
      // Check camera permission availability
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) not supported in this browser. Please ensure HTTPS is enabled or use Chrome/Safari.');
      }

      this.mindarThree = new MindARThree({
        container: this.container,
        imageTargetSrc: this.targetSrc,
        filterMinCF: 0.0005, // Ultra-smooth filter for jitter reduction
        filterBeta: 500,
        warmupTolerance: 4,
        missTolerance: 6,
        uiLoading: 'no',
        uiScanning: 'no'
      });

      const { renderer, scene, camera } = this.mindarThree;

      // Enable realistic color space
      if (renderer.outputEncoding !== undefined) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      // Add atmospheric lighting to the AR scene
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
      dirLight.position.set(1, 2, 2);
      scene.add(dirLight);

      const pointLight = new THREE.PointLight(0x00d2ff, 1.5, 5);
      pointLight.position.set(0, 1, 1);
      scene.add(pointLight);

      // Add target anchor (Target index 0 = manuscript)
      this.anchor = this.mindarThree.addAnchor(0);

      this.anchor.onTargetFound = () => {
        this.isTargetFound = true;
        if (this.onTargetFound) this.onTargetFound();
      };

      this.anchor.onTargetLost = () => {
        this.isTargetFound = false;
        if (this.onTargetLost) this.onTargetLost();
      };

      return {
        renderer,
        scene,
        camera,
        anchorGroup: this.anchor.group
      };
    } catch (err) {
      console.error('AREngine init error:', err);
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  async start() {
    if (!this.mindarThree) return;
    try {
      await this.mindarThree.start();
      this.isRunning = true;
    } catch (err) {
      console.error('Error starting MindAR:', err);
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  stop() {
    if (this.mindarThree && this.isRunning) {
      try {
        this.mindarThree.stop();
      } catch (e) {
        console.warn('Error during MindAR stop:', e);
      }
      this.isRunning = false;
      this.isTargetFound = false;
    }
  }

  getAnchorGroup() {
    return this.anchor ? this.anchor.group : null;
  }

  getCamera() {
    return this.mindarThree ? this.mindarThree.camera : null;
  }

  getRenderer() {
    return this.mindarThree ? this.mindarThree.renderer : null;
  }
}

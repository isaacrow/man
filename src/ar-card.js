import * as THREE from 'three';

export class ARCardManager {
  constructor(anchorGroup) {
    this.anchor = anchorGroup;
    this.hotspotMeshes = [];
    this.hologramGroup = new THREE.Group();
    this.anchor.add(this.hologramGroup);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // High-resolution canvas texture for the 3D holographic board
    this.cardCanvas = document.createElement('canvas');
    this.cardCanvas.width = 1024;
    this.cardCanvas.height = 720;
    this.cardContext = this.cardCanvas.getContext('2d');
    this.cardTexture = new THREE.CanvasTexture(this.cardCanvas);
    this.cardTexture.minFilter = THREE.LinearFilter;

    this.cardMesh = null;
    this.gridMesh = null;
    this.axesGroup = null;
    this.hotspotGroup = new THREE.Group();
    this.hologramGroup.add(this.hotspotGroup);

    this.time = 0;
    this.currentMetadata = null;
    this.onHotspotClick = null;

    // Build AR Surface Grid & 3D Axes
    this._createARSurfaceGridAndAxes();
  }

  _createARSurfaceGridAndAxes() {
    // 1. Holographic AR Surface Boundary Box (Manuscript aspect ratio: 1.0 x 0.88)
    const targetW = 1.0;
    const targetH = 0.88;

    // Surface plane border with glowing corners
    const borderGroup = new THREE.Group();

    // Animated gold corner brackets
    const bracketMat = new THREE.LineBasicMaterial({ color: 0xffd700, linewidth: 2 });
    const cornerSize = 0.12;

    const addCorner = (x, y, dx, dy) => {
      const points = [
        new THREE.Vector3(x, y + dy * cornerSize, 0.002),
        new THREE.Vector3(x, y, 0.002),
        new THREE.Vector3(x + dx * cornerSize, y, 0.002)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, bracketMat);
      borderGroup.add(line);
    };

    const halfW = targetW / 2;
    const halfH = targetH / 2;

    addCorner(-halfW, -halfH, 1, 1);    // Bottom-Left
    addCorner(halfW, -halfH, -1, 1);    // Bottom-Right
    addCorner(-halfW, halfH, 1, -1);    // Top-Left
    addCorner(halfW, halfH, -1, -1);    // Top-Right

    // Glowing perimeter outline
    const perimeterGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfW, -halfH, 0.001),
      new THREE.Vector3(halfW, -halfH, 0.001),
      new THREE.Vector3(halfW, halfH, 0.001),
      new THREE.Vector3(-halfW, halfH, 0.001),
      new THREE.Vector3(-halfW, -halfH, 0.001)
    ]);
    const perimeterMat = new THREE.LineBasicMaterial({
      color: 0x00d2ff,
      transparent: true,
      opacity: 0.5
    });
    const perimeterLine = new THREE.Line(perimeterGeo, perimeterMat);
    borderGroup.add(perimeterLine);

    this.hologramGroup.add(borderGroup);

    // 2. 3D AR Coordinate Frame / Axes Gizmo (X=Red, Y=Green, Z=Cyan Elevation)
    const axes = new THREE.Group();
    axes.position.set(-halfW - 0.05, -halfH - 0.05, 0.002);

    const axisLength = 0.18;

    // X Axis (Red)
    const xGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(axisLength, 0, 0)]);
    const xMat = new THREE.LineBasicMaterial({ color: 0xff3b30, linewidth: 3 });
    axes.add(new THREE.Line(xGeo, xMat));

    // Y Axis (Green)
    const yGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axisLength, 0)]);
    const yMat = new THREE.LineBasicMaterial({ color: 0x34c759, linewidth: 3 });
    axes.add(new THREE.Line(yGeo, yMat));

    // Z Axis (Cyan / Elevation)
    const zGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axisLength)]);
    const zMat = new THREE.LineBasicMaterial({ color: 0x00d2ff, linewidth: 3 });
    axes.add(new THREE.Line(zGeo, zMat));

    this.axesGroup = axes;
    this.hologramGroup.add(axes);
  }

  createHolographicCard(metadata) {
    this.currentMetadata = metadata;
    this._renderCardTexture(metadata);

    if (!this.cardMesh) {
      // 3D Plane positioned floating above the top edge of the manuscript
      const geometry = new THREE.PlaneGeometry(0.95, 0.65);
      const material = new THREE.MeshBasicMaterial({
        map: this.cardTexture,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide
      });

      this.cardMesh = new THREE.Mesh(geometry, material);
      // Position floating slightly above the top edge, elevated in Z
      this.cardMesh.position.set(0, 0.62, 0.16);
      this.cardMesh.rotation.x = -Math.PI * 0.12; // tilted towards viewer

      // Neon blue wireframe border frame
      const frameGeo = new THREE.PlaneGeometry(0.98, 0.68);
      const wireframeMat = new THREE.MeshBasicMaterial({
        color: 0x00d2ff,
        wireframe: true,
        transparent: true,
        opacity: 0.4
      });
      const frameMesh = new THREE.Mesh(frameGeo, wireframeMat);
      frameMesh.position.z = -0.002;
      this.cardMesh.add(frameMesh);

      // Gold tether laser line anchoring the 3D card to the manuscript surface
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.32, 0),
        new THREE.Vector3(0, -0.62, -0.16)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.7
      });
      const anchorLine = new THREE.Line(lineGeo, lineMat);
      this.cardMesh.add(anchorLine);

      this.hologramGroup.add(this.cardMesh);
    } else {
      this.cardTexture.needsUpdate = true;
    }
  }

  _renderCardTexture(meta) {
    const ctx = this.cardContext;
    const w = this.cardCanvas.width;
    const h = this.cardCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Glassmorphic dark blue gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, 'rgba(10, 18, 38, 0.95)');
    bgGrad.addColorStop(1, 'rgba(5, 10, 24, 0.98)');
    ctx.fillStyle = bgGrad;
    this._roundRect(ctx, 16, 16, w - 32, h - 32, 24);
    ctx.fill();

    // Glowing Gold & Cyan Border
    const borderGrad = ctx.createLinearGradient(0, 0, w, 0);
    borderGrad.addColorStop(0, '#ffd700');
    borderGrad.addColorStop(0.5, '#00d2ff');
    borderGrad.addColorStop(1, '#ffd700');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Header Badge: RDF LINKED DATA AR
    ctx.fillStyle = 'rgba(0, 210, 255, 0.18)';
    this._roundRect(ctx, 40, 36, 260, 42, 12);
    ctx.fill();
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillStyle = '#00d2ff';
    ctx.fillText('⚡ RDF LINKED DATA AR', 55, 63);

    // Identifier Badge
    ctx.font = '16px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(meta?.identifier || 'MS-SHIFA-1302-MAJLIS', w - 45, 63);
    ctx.textAlign = 'left';

    // Title (English)
    ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(meta?.title || 'Kitāb al-Shifāʾ: Logic & Metaphysics', 45, 125);

    // Arabic Subtitle
    if (meta?.titleArabic) {
      ctx.font = '26px "Amiri", "Traditional Arabic", serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(meta.titleArabic, 45, 168);
    }

    // Divider Line
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(45, 192);
    ctx.lineTo(w - 45, 192);
    ctx.stroke();

    // Metadata Properties Grid
    const drawProp = (label, val, x, y, icon = '✦') => {
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`${icon} ${label}:`, x, y);

      ctx.font = '19px sans-serif';
      ctx.fillStyle = '#e2e8f0';
      const truncated = val && val.length > 34 ? val.slice(0, 32) + '…' : (val || '—');
      ctx.fillText(truncated, x, y + 24);
    };

    drawProp('AUTHOR (dc:creator)', meta?.creator || 'Ibn Sīnā (Avicenna)', 45, 235, '👤');
    drawProp('DATE & PERIOD', meta?.date || '16th-17th C.', 520, 235, '📅');

    drawProp('MATERIAL (schema:material)', meta?.material || 'Gold leaf, Lapis, Rag paper', 45, 310, '📜');
    drawProp('COLLECTION (dc:publisher)', meta?.publisher || 'Majlis Parliament Library', 520, 310, '🏛️');

    drawProp('SCRIPT STYLE', 'Naskh text with Marginal Nastaliq', 45, 385, '🖋️');
    drawProp('DIMENSIONS', meta?.dimensions || '26.5 x 17.2 cm', 520, 385, '📐');

    // Bottom Quote / Transcription Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    this._roundRect(ctx, 45, 445, w - 90, 160, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#00d2ff';
    ctx.fillText('ONTOLOGY TRANSCRIPTION (dc:description / ms:transcriptionArabic)', 65, 475);

    ctx.font = 'italic 18px "Amiri", "Traditional Arabic", serif';
    ctx.fillStyle = '#fef08a';
    ctx.fillText('« بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ - الحمد لله الواحد الأحد الصمد المصور... »', 65, 515);

    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('"In the Name of God... origination (ibdāʿ) and cosmic formation (takwīn)..."', 65, 550);

    // Live Tracking Status footer
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#4ade80';
    ctx.fillText('● TARGET TRACKED (60 FPS REAL AR) — TAP 3D PINS ON FOLIO', 65, 588);

    this.cardTexture.needsUpdate = true;
  }

  _roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  createHotspots(hotspotsList) {
    while (this.hotspotGroup.children.length > 0) {
      const obj = this.hotspotGroup.children[0];
      this.hotspotGroup.remove(obj);
    }
    this.hotspotMeshes = [];

    const targetW = 1.0;
    const targetH = 0.88;

    hotspotsList.forEach((hs, idx) => {
      const posX = (hs.normX - 0.5) * targetW;
      const posY = (0.5 - hs.normY) * targetH;
      const posZ = hs.elevZ || 0.06;

      const group = new THREE.Group();
      group.position.set(posX, posY, posZ);
      group.userData = { hotspot: hs, index: idx };

      // 1. Glowing Vertical Beam Line to Manuscript Surface
      const beamGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -posZ)
      ]);
      const beamMat = new THREE.LineBasicMaterial({
        color: 0x00d2ff,
        transparent: true,
        opacity: 0.85,
        linewidth: 2
      });
      const beam = new THREE.Line(beamGeo, beamMat);
      group.add(beam);

      // 2. Base Target Ring on Manuscript Surface
      const ringGeo = new THREE.RingGeometry(0.02, 0.038, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = -posZ + 0.001;
      group.add(ring);

      // 3. Floating 3D Octahedron / Diamond Pin Marker
      const pinGeo = new THREE.OctahedronGeometry(0.032, 0);
      const pinMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0x00d2ff,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.name = 'pinMesh';
      group.add(pinMesh);

      // 4. Billboard text label
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 384;
      labelCanvas.height = 96;
      const lCtx = labelCanvas.getContext('2d');
      lCtx.fillStyle = 'rgba(10, 18, 38, 0.92)';
      this._roundRect(lCtx, 4, 4, 376, 88, 16);
      lCtx.fill();
      lCtx.strokeStyle = '#00d2ff';
      lCtx.lineWidth = 3;
      lCtx.stroke();

      lCtx.font = 'bold 22px sans-serif';
      lCtx.fillStyle = '#ffffff';
      lCtx.textAlign = 'center';
      const truncatedLabel = hs.label.length > 22 ? hs.label.slice(0, 20) + '…' : hs.label;
      lCtx.fillText(truncatedLabel, 192, 42);

      lCtx.font = '16px monospace';
      lCtx.fillStyle = '#ffd700';
      lCtx.fillText(hs.folio || 'Region', 192, 72);

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelGeo = new THREE.PlaneGeometry(0.24, 0.06);
      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        transparent: true,
        side: THREE.DoubleSide
      });
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);
      labelMesh.position.y = 0.055;
      labelMesh.name = 'labelBillboard';
      group.add(labelMesh);

      this.hotspotGroup.add(group);
      this.hotspotMeshes.push(pinMesh);
    });
  }

  update(delta) {
    this.time += delta;

    // Bobbing animation for the floating card in 3D AR space
    if (this.cardMesh) {
      this.cardMesh.position.z = 0.16 + Math.sin(this.time * 2.5) * 0.015;
    }

    // Animate hotspot pins (spinning and pulsing)
    this.hotspotGroup.children.forEach((group, idx) => {
      const pin = group.getObjectByName('pinMesh');
      if (pin) {
        pin.rotation.y = this.time * 1.8 + idx;
        pin.rotation.z = Math.sin(this.time * 2.2 + idx) * 0.25;
        pin.position.z = Math.sin(this.time * 3.0 + idx) * 0.008;
      }
    });
  }

  checkRaycast(camera, screenX, screenY, width, height) {
    this.mouse.x = (screenX / width) * 2 - 1;
    this.mouse.y = -(screenY / height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(this.hotspotMeshes, true);

    if (intersects.length > 0) {
      const hit = intersects[0].object.parent;
      if (hit && hit.userData && hit.userData.hotspot) {
        return hit.userData.hotspot;
      }
    }
    return null;
  }
}

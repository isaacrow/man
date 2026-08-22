import { CompilerBase } from '../node_modules/mind-ar/src/image-target/compiler-base.js';
import { buildTrackingImageList } from '../node_modules/mind-ar/src/image-target/image-list.js';
import { extractTrackingFeatures } from '../node_modules/mind-ar/src/image-target/tracker/extract-utils.js';
import '../node_modules/mind-ar/src/image-target/detector/kernels/cpu/index.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class NodeCompiler extends CompilerBase {
  createProcessCanvas(img) {
    const canvas = createCanvas(img.width, img.height);
    return canvas;
  }

  compileTrack({ progressCallback, targetImages, basePercent }) {
    return new Promise((resolve) => {
      const percentPerImage = (100 - basePercent) / targetImages.length;
      let percent = 0;
      const list = [];
      for (let i = 0; i < targetImages.length; i++) {
        const targetImage = targetImages[i];
        const imageList = buildTrackingImageList(targetImage);
        const percentPerAction = percentPerImage / imageList.length;

        const trackingData = extractTrackingFeatures(imageList, (index) => {
          percent += percentPerAction;
          if (progressCallback) {
            progressCallback(basePercent + percent);
          }
        });
        list.push(trackingData);
      }
      resolve(list);
    });
  }
}

async function compileManuscripts() {
  const outputDir = path.resolve(__dirname, '../public/targets');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const img1Path = path.resolve(__dirname, '../manuscript.jpg');
  const img2Path = path.resolve(__dirname, '../manuscript2.jpg');

  console.log(`Loading Target 1: ${img1Path}...`);
  const image1 = await loadImage(img1Path);

  console.log(`Loading Target 2: ${img2Path}...`);
  const image2 = await loadImage(img2Path);

  const compiler = new NodeCompiler();
  console.log('Compiling both manuscripts into multi-target targets.mind descriptor...');

  await compiler.compileImageTargets([image1, image2], (progress) => {
    process.stdout.write(`\rProgress: ${progress.toFixed(1)}%`);
  });

  console.log('\nExporting multi-target buffer...');
  const buffer = compiler.exportData();

  const outputPath = path.join(outputDir, 'targets.mind');
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  console.log(`Successfully saved multi-target descriptor to ${outputPath} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);

  // Also write manuscript.mind as alias for backwards compatibility
  const singlePath = path.join(outputDir, 'manuscript.mind');
  fs.writeFileSync(singlePath, Buffer.from(buffer));
}

compileManuscripts().catch((err) => {
  console.error('Error compiling targets:', err);
  process.exit(1);
});

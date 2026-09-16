import fs from 'fs';
import path from 'path';

const pdfPath = 'C:/Users/MK/.gemini/antigravity/brain/453eb641-b74d-43c3-984d-05154e443bd5/.user_uploaded/media_1789588441127.pdf';
const buf = fs.readFileSync(pdfPath);
let start = 0;
let imgCount = 0;

while (true) {
  const soi = buf.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]), start);
  if (soi === -1) break;
  const eoi = buf.indexOf(Buffer.from([0xFF, 0xD9]), soi);
  if (eoi === -1) break;
  imgCount++;
  const imgData = buf.subarray(soi, eoi + 2);
  const outPath = `manuscript5_p${imgCount}.jpg`;
  fs.writeFileSync(outPath, imgData);
  console.log(`Extracted JPEG ${imgCount} (${(imgData.length / 1024).toFixed(1)} KB) -> ${outPath}`);
  start = eoi + 2;
}

if (imgCount === 0) {
  console.log('No direct JPEG markers found, PDF might use FlateDecode streams.');
}

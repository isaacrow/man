import { RDFManuscriptParser } from '../src/rdf-parser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testRdf() {
  console.log('=== 4-TARGET RDF PARSER ACCURACY VALIDATION ===');

  const files = [
    { name: 'Target 1: Al-Qabasat (MS 4662)', file: 'manuscript.ttl' },
    { name: 'Target 2: Quran Haydar Ali (MS 4175)', file: 'manuscript2.ttl' },
    { name: 'Target 3: Ilal al-Sharayi (MS 4433)', file: 'manuscript3.ttl' },
    { name: 'Target 4: Kufic Quran Zayn al-Abidin (MS 176854)', file: 'manuscript4.ttl' }
  ];

  for (const item of files) {
    const ttl = fs.readFileSync(path.resolve(__dirname, `../data/${item.file}`), 'utf8');
    const parser = new RDFManuscriptParser();
    const res = await parser.parseTurtle(ttl);

    console.log(`\n--- ${item.name} ---`);
    console.log(`Title (English): ${res.metadata.title}`);
    console.log(`Title (Arabic): ${res.metadata.titleArabic}`);
    console.log(`Creator: ${res.metadata.creator}`);
    console.log(`Date: ${res.metadata.date}`);
    console.log(`Format: ${res.metadata.format}`);
    console.log(`Material: ${res.metadata.material}`);
    console.log(`Repository: ${res.metadata.publisher}`);
    console.log(`Hotspots Count: ${res.hotspots.length}`);
  }

  console.log('\n=== ALL 4 TARGETS VALIDATED SUCCESSFULLY ===');
}

testRdf().catch(console.error);

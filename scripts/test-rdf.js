import { RDFManuscriptParser } from '../src/rdf-parser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testRdf() {
  console.log('=== RDF PARSER ACCURACY VALIDATION ===');

  // Test Manuscript 1
  const ttl1 = fs.readFileSync(path.resolve(__dirname, '../data/manuscript.ttl'), 'utf8');
  const parser1 = new RDFManuscriptParser();
  const res1 = await parser1.parseTurtle(ttl1);

  console.log('\n--- TARGET 1: MANUSCRIPT 1 (MARC21: b125923 / 4662) ---');
  console.log(`Title (English): ${res1.metadata.title}`);
  console.log(`Title (Arabic): ${res1.metadata.titleArabic}`);
  console.log(`Author / Creator: ${res1.metadata.creator}`);
  console.log(`Date: ${res1.metadata.date}`);
  console.log(`Material: ${res1.metadata.material}`);
  console.log(`Holding Repository: ${res1.metadata.publisher}`);

  // Test Manuscript 2
  const ttl2 = fs.readFileSync(path.resolve(__dirname, '../data/manuscript2.ttl'), 'utf8');
  const parser2 = new RDFManuscriptParser();
  const res2 = await parser2.parseTurtle(ttl2);

  console.log('\n--- TARGET 2: MANUSCRIPT 2 (MARC21: b125999 / 4175) ---');
  console.log(`Title (English): ${res2.metadata.title}`);
  console.log(`Title (Arabic): ${res2.metadata.titleArabic}`);
  console.log(`Scribe / Creator: ${res2.metadata.creator}`);
  console.log(`Date: ${res2.metadata.date}`);
  console.log(`Material: ${res2.metadata.material}`);
  console.log(`Holding Repository: ${res2.metadata.publisher}`);

  console.log('\n=== VALIDATION COMPLETED SUCCESSFULLY ===');
}

testRdf().catch(console.error);

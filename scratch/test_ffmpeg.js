import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import fs from 'fs';
import path from 'path';

const CORE_VERSION = '0.12.6';
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

async function runTest() {
  console.log('--- FFmpeg.wasm Real Transcoding and Bitrate Audit ---');
  
  const ffmpeg = new FFmpeg();
  
  console.log('Loading FFmpeg.wasm from CDN...');
  await ffmpeg.load({
    coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  console.log('FFmpeg.wasm successfully initialized!');

  // Define task inputs/outputs
  const output128 = 'output_128.mp3';
  const output320 = 'output_320.mp3';

  console.log('\nRunning Transcode: Generate 3 seconds of 1000Hz Sine wave @ 128kbps...');
  // Command: ffmpeg -f lavfi -i sine=frequency=1000:duration=3 -b:a 128k output_128.mp3
  await ffmpeg.exec([
    '-f', 'lavfi', 
    '-i', 'sine=frequency=1000:duration=3', 
    '-b:a', '128k', 
    output128
  ]);

  console.log('Running Transcode: Generate 3 seconds of 1000Hz Sine wave @ 320kbps...');
  await ffmpeg.exec([
    '-f', 'lavfi', 
    '-i', 'sine=frequency=1000:duration=3', 
    '-b:a', '320k', 
    output320
  ]);

  // Read files from virtual filesystem
  const file128 = await ffmpeg.readFile(output128);
  const file320 = await ffmpeg.readFile(output320);

  const size128 = file128.length;
  const size320 = file320.length;

  console.log(`\nAudit Results:`);
  console.log(`- MP3 128kbps output size: ${size128} bytes`);
  console.log(`- MP3 320kbps output size: ${size320} bytes`);

  // Verify file sizes change with bitrate
  if (size320 > size128 * 1.5) {
    console.log('✅ PASS: Bitrate changes output file sizes correctly (real transcode verified).');
  } else {
    throw new Error('❌ FAIL: Bitrates did not affect file size.');
  }

  // Inspect headers
  const header128 = Buffer.from(file128.slice(0, 10));
  console.log(`- MP3 file header check (first 10 bytes):`, header128);
  
  // MP3 files might start with ID3 tag (0x49 0x44 0x33 -> "ID3") or sync frame (0xFF 0xFB)
  const isID3 = header128[0] === 0x49 && header128[1] === 0x44 && header128[2] === 0x33;
  const isSync = header128[0] === 0xFF && (header128[1] & 0xE0) === 0xE0;

  if (isID3 || isSync) {
    console.log('✅ PASS: Output file contains a valid MP3 structure header.');
  } else {
    throw new Error('❌ FAIL: Invalid file header signature.');
  }

  // Clean up WASM FS files
  await ffmpeg.deleteFile(output128);
  await ffmpeg.deleteFile(output320);
  
  ffmpeg.terminate();
  console.log('\nAudit successfully completed without errors.');
}

runTest().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});

import https from 'https';

const urls = [
  'https://yandellcuevas-sketch.github.io/MPMusicWeb/',
  'https://yandellcuevas-sketch.github.io/MPMusicWeb/ffmpeg/ffmpeg-core.js',
  'https://yandellcuevas-sketch.github.io/MPMusicWeb/ffmpeg/ffmpeg-core.wasm'
];

function checkUrl(url) {
  return new Promise((resolve) => {
    console.log(`[CHECK] ${url}`);
    const start = Date.now();
    
    const req = https.request(url, { method: 'HEAD', timeout: 15000 }, (res) => {
      const elapsed = Date.now() - start;
      console.log(`[OK] status: ${res.statusCode} | time: ${elapsed}ms`);
      resolve({
        url,
        statusCode: res.statusCode,
        contentType: res.headers['content-type'] || 'none',
        contentLength: res.headers['content-length']
          ? parseInt(res.headers['content-length'], 10)
          : 'unknown',
        timeMs: elapsed
      });
    });

    req.on('timeout', () => {
      console.log(`[TIMEOUT] 15s`);
      req.destroy();
      resolve({
        url,
        statusCode: 'TIMEOUT',
        contentType: 'none',
        contentLength: 0,
        timeMs: 15000
      });
    });

    req.on('error', (err) => {
      console.log(`[FAIL] Error: ${err.message}`);
      resolve({
        url,
        statusCode: 'ERROR: ' + err.message,
        contentType: 'none',
        contentLength: 0,
        timeMs: Date.now() - start
      });
    });

    req.end();
  });
}

async function audit() {
  console.log('--- Auditing Production Assets on GitHub Pages ---');
  
  const results = [];
  for (const url of urls) {
    const res = await checkUrl(url);
    results.push(res);
  }

  console.log('\n--- Final Asset Diagnostics ---');
  results.forEach(res => {
    console.log(`\nURL: ${res.url}`);
    console.log(`- Status: ${res.statusCode}`);
    console.log(`- MIME Type: ${res.contentType}`);
    console.log(`- File Size: ${res.contentLength} bytes`);
    console.log(`- Response Time: ${res.timeMs}ms`);
  });

  // Exit explicitly to close HTTP agent sockets
  process.exit(0);
}

audit();

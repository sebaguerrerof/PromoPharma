/**
 * Script para configurar CORS en el bucket de Firebase Storage.
 * Usa el token de firebase-tools para autenticarse.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BUCKET_NAME = 'promopharma-2ce16.firebasestorage.app';

const corsConfig = [
  {
    origin: ['https://promopharma-2ce16.web.app', 'http://localhost:5173'],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    maxAgeSeconds: 3600,
    responseHeader: [
      'Content-Type',
      'Authorization',
      'Content-Length',
      'User-Agent',
      'x-goog-resumable',
      'x-goog-upload-protocol',
      'x-goog-upload-command',
      'x-goog-upload-header-content-type',
      'x-goog-upload-header-content-length',
      'x-goog-upload-offset',
      'x-goog-upload-url',
      'x-firebase-storage-version',
    ],
  },
];

async function getFirebaseToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const refreshToken = config.tokens.refresh_token;

  // Refresh the access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function main() {
  console.log('Getting Firebase token...');
  const token = await getFirebaseToken();

  // Try both bucket name formats
  const bucketNames = [
    'promopharma-2ce16.firebasestorage.app',
    'promopharma-2ce16.appspot.com',
  ];

  for (const bucket of bucketNames) {
    console.log(`\nTrying bucket: ${bucket}`);
    
    // First, get current metadata to check bucket exists
    const getRes = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}?fields=cors`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!getRes.ok) {
      console.log(`  Bucket ${bucket}: ${getRes.status} ${getRes.statusText}`);
      const body = await getRes.text();
      console.log(`  ${body.substring(0, 200)}`);
      continue;
    }

    console.log(`  ✓ Bucket found: ${bucket}`);
    const current = await getRes.json();
    console.log(`  Current CORS:`, JSON.stringify(current.cors, null, 2));

    // PATCH the bucket metadata to set CORS
    const patchRes = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cors: corsConfig }),
      }
    );

    if (!patchRes.ok) {
      console.log(`  Error setting CORS: ${patchRes.status}`);
      const errBody = await patchRes.text();
      console.log(`  ${errBody.substring(0, 300)}`);
      continue;
    }

    const result = await patchRes.json();
    console.log(`  ✓ CORS configurado correctamente!`);
    console.log(`  New CORS:`, JSON.stringify(result.cors, null, 2));
    return;
  }

  console.error('No se pudo configurar CORS en ningún bucket.');
  process.exit(1);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

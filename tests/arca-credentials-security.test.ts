import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { app, createArcaSessionToken } from '../server';
import { arcaService } from '../src/services/arcaService';

describe('Auditoría y Protección de Credenciales ARCA (Etapa 1)', () => {
  let server: http.Server;
  let baseUrl = '';
  const tempCredsFile = path.join('/tmp', `test_arca_creds_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  const originalCredsFileEnv = process.env.ARCA_CREDENTIALS_FILE;
  const originalCertEnv = process.env.ARCA_CERT;
  const originalKeyEnv = process.env.ARCA_PRIVATE_KEY;

  // Generate a temporary self-signed test certificate & key for testing (not real secrets)
  let testKeyPem = '';
  let testCertPem = '';

  beforeAll(async () => {
    process.env.ARCA_CREDENTIALS_FILE = tempCredsFile;
    delete process.env.ARCA_CERT;
    delete process.env.ARCA_PRIVATE_KEY;

    const tmpKeyPath = path.join('/tmp', `test_key_${Date.now()}.key`);
    const tmpCertPath = path.join('/tmp', `test_cert_${Date.now()}.crt`);
    try {
      execSync(
        `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${tmpKeyPath}" -out "${tmpCertPath}" -days 1 -subj "/C=AR/O=TEST/CN=test/serialNumber=CUIT 20255065166"`,
        { stdio: 'pipe' }
      );
      testKeyPem = fs.readFileSync(tmpKeyPath, 'utf-8');
      testCertPem = fs.readFileSync(tmpCertPath, 'utf-8');
    } finally {
      if (fs.existsSync(tmpKeyPath)) fs.unlinkSync(tmpKeyPath);
      if (fs.existsSync(tmpCertPath)) fs.unlinkSync(tmpCertPath);
    }

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (originalCredsFileEnv !== undefined) {
      process.env.ARCA_CREDENTIALS_FILE = originalCredsFileEnv;
    } else {
      delete process.env.ARCA_CREDENTIALS_FILE;
    }
    if (originalCertEnv !== undefined) process.env.ARCA_CERT = originalCertEnv;
    if (originalKeyEnv !== undefined) process.env.ARCA_PRIVATE_KEY = originalKeyEnv;

    if (fs.existsSync(tempCredsFile)) {
      try {
        fs.unlinkSync(tempCredsFile);
      } catch (_) {}
    }

    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
  });

  it('1. Bloquea solicitudes NO autenticadas (401) en rutas sensibles de credenciales ARCA', async () => {
    const getRes = await fetch(`${baseUrl}/api/arca/credentials`);
    expect(getRes.status).toBe(401);

    const saveRes = await fetch(`${baseUrl}/api/arca/save-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuit: '20-25506516-6' }),
    });
    expect(saveRes.status).toBe(401);

    const csrRes = await fetch(`${baseUrl}/api/arca/generate-csr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuit: '20255065166', companyName: 'TEST', alias: 'necopos' }),
    });
    expect(csrRes.status).toBe(401);

    const parseRes = await fetch(`${baseUrl}/api/arca/parse-cert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certText: testCertPem }),
    });
    expect(parseRes.status).toBe(401);
  });

  it('2. Bloquea usuarios autenticados sin rol administrativo (CAJERO / CONSULTA) con 403 Forbidden', async () => {
    const cashierToken = createArcaSessionToken({
      id: 'USR-03',
      username: 'cajero1',
      role: 'CAJERO',
    });
    const viewerToken = createArcaSessionToken({
      id: 'USR-04',
      username: 'consulta1',
      role: 'CONSULTA',
    });

    for (const token of [cashierToken, viewerToken]) {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const getRes = await fetch(`${baseUrl}/api/arca/credentials`, { headers });
      expect(getRes.status).toBe(403);

      const saveRes = await fetch(`${baseUrl}/api/arca/save-credentials`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ privateKey: testKeyPem, certificate: testCertPem }),
      });
      expect(saveRes.status).toBe(403);

      const csrRes = await fetch(`${baseUrl}/api/arca/generate-csr`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cuit: '20255065166', companyName: 'TEST', alias: 'necopos' }),
      });
      expect(csrRes.status).toBe(403);
    }
  });

  it('3. Rechaza tokens adulterados o expirados con 401 Unauthorized', async () => {
    const expiredToken = createArcaSessionToken(
      { id: 'USR-01', username: 'admin', role: 'SUPERADMIN' },
      -5000
    );
    const tamperedToken = `${expiredToken.split('.')[0]}.firmaInvalida123`;

    for (const badToken of [expiredToken, tamperedToken]) {
      const res = await fetch(`${baseUrl}/api/arca/credentials`, {
        headers: { Authorization: `Bearer ${badToken}` },
      });
      expect(res.status).toBe(401);
    }
  });

  it('4. POST /api/arca/save-credentials y GET /api/arca/credentials nunca devuelven claves privadas, certificados ni secretos en HTTP', async () => {
    const adminToken = createArcaSessionToken({
      id: 'USR-01',
      username: 'admin',
      role: 'SUPERADMIN',
    });
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    const saveRes = await fetch(`${baseUrl}/api/arca/save-credentials`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cuit: '20-25506516-6',
        companyName: 'MOYA CARLOS HUGO',
        environment: 'produccion',
        alias: 'necopos',
        certificate: testCertPem,
        privateKey: testKeyPem,
      }),
    });

    expect(saveRes.status).toBe(200);
    const saveBodyText = await saveRes.text();
    const saveJson = JSON.parse(saveBodyText);

    expect(saveJson.success).toBe(true);
    expect(saveJson.credentials.hasCertificate).toBe(true);
    expect(saveJson.credentials.hasPrivateKey).toBe(true);
    expect(saveJson.credentials.certificateLinked).toBe(true);
    expect(saveJson.credentials.certificate).toBeUndefined();
    expect(saveJson.credentials.privateKey).toBeUndefined();
    expect(saveBodyText).not.toContain('BEGIN CERTIFICATE');
    expect(saveBodyText).not.toContain('PRIVATE KEY');

    // Now test GET /api/arca/credentials
    const getRes = await fetch(`${baseUrl}/api/arca/credentials`, { headers });
    expect(getRes.status).toBe(200);
    const getBodyText = await getRes.text();
    const getJson = JSON.parse(getBodyText);

    expect(getJson.success).toBe(true);
    expect(getJson.credentials.hasCertificate).toBe(true);
    expect(getJson.credentials.hasPrivateKey).toBe(true);
    expect(getJson.credentials.certificateLinked).toBe(true);
    expect(getJson.credentials.certificate).toBeUndefined();
    expect(getJson.credentials.privateKey).toBeUndefined();
    expect(getBodyText).not.toContain('BEGIN CERTIFICATE');
    expect(getBodyText).not.toContain('PRIVATE KEY');
  });

  it('5. POST /api/arca/generate-csr guarda la clave privada en el servidor pero NUNCA la incluye en la respuesta HTTP', async () => {
    const adminToken = createArcaSessionToken({
      id: 'USR-02',
      username: 'admin2',
      role: 'ADMIN',
    });

    const csrRes = await fetch(`${baseUrl}/api/arca/generate-csr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        cuit: '20-25506516-6',
        companyName: 'MOYA CARLOS HUGO',
        alias: 'necopos',
        format: 'exact',
      }),
    });

    expect(csrRes.status).toBe(200);
    const csrBodyText = await csrRes.text();
    const csrJson = JSON.parse(csrBodyText);

    expect(csrJson.success).toBe(true);
    expect(csrJson.csr).toContain('BEGIN CERTIFICATE REQUEST');
    expect(csrJson.hasPrivateKey).toBe(true);
    expect(csrJson.privateKey).toBeUndefined();
    expect(csrBodyText).not.toContain('PRIVATE KEY');
  });

  it('6. POST /api/arca/status informa estado no sensible y diagnóstico de variables de entorno sin exponer secretos', async () => {
    const statusRes = await fetch(`${baseUrl}/api/arca/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuit: '20-25506516-6' }),
    });

    expect(statusRes.status).toBe(200);
    const bodyText = await statusRes.text();
    const statusJson = JSON.parse(bodyText);

    expect(statusJson.success).toBe(true);
    expect(typeof statusJson.hasCert).toBe('boolean');
    expect(typeof statusJson.hasKey).toBe('boolean');
    expect(Array.isArray(statusJson.missingEnvVars)).toBe(true);
    expect(bodyText).not.toContain('BEGIN CERTIFICATE');
    expect(bodyText).not.toContain('PRIVATE KEY');
    expect((statusJson as any).certificate).toBeUndefined();
    expect((statusJson as any).privateKey).toBeUndefined();
    expect(statusJson.wsaa?.token).toBeUndefined();
    expect(statusJson.wsaa?.sign).toBeUndefined();
  });

  it('7. arcaService en el cliente depura y nunca almacena claves privadas ni certificados en localStorage', () => {
    const store: Record<string, string> = {
      necopos_arca_certificate: testCertPem,
      necopos_arca_private_key: testKeyPem,
      necopos_arca_generated_key: testKeyPem,
    };

    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };

    (globalThis as any).localStorage = mockStorage;

    const result = arcaService.persistCredentials({
      cuit: '20-25506516-6',
      companyName: 'MOYA CARLOS HUGO',
      certificate: testCertPem,
      privateKey: testKeyPem,
    });

    expect(result.certificate).toBeUndefined();
    expect(result.privateKey).toBeUndefined();
    expect(result.hasCertificate).toBe(true);
    expect(result.hasPrivateKey).toBe(true);
    expect(store['necopos_arca_certificate']).toBeUndefined();
    expect(store['necopos_arca_private_key']).toBeUndefined();
    expect(store['necopos_arca_generated_key']).toBeUndefined();
    expect(store['necopos_arca_config']).not.toContain('PRIVATE KEY');
    expect(store['necopos_arca_config']).not.toContain('BEGIN CERTIFICATE');
  });
});

import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import codeAnalyzerPlugin from './src/components/ArchitectureMap/plugins/codeAnalyzer';

/**
 * Vite plugin that exposes backup API endpoints during dev.
 * - POST /api/backup/save   — write a YAML backup to backups/ folder
 * - GET  /api/backup/list   — list all YAML files in backups/ folder
 * - GET  /api/backup/read?file=<name>  — read a specific backup file
 * - DELETE /api/backup/delete?file=<name>  — delete a specific backup file
 */
function backupServerPlugin(): Plugin {
  const backupsDir = path.resolve(__dirname, 'backups');

  return {
    name: 'backup-server',
    configureServer(server) {
      // Ensure backups directory exists
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      server.middlewares.use('/api/backup', (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const pathname = url.pathname;

        // POST /api/backup/save
        if (req.method === 'POST' && pathname === '/save') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const { filename, content } = JSON.parse(body);
              const safeName = path.basename(filename || `suite_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.yaml`);
              const filePath = path.join(backupsDir, safeName);
              fs.writeFileSync(filePath, content, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, filename: safeName, path: filePath }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: String(err) }));
            }
          });
          return;
        }

        // GET /api/backup/list
        if (req.method === 'GET' && pathname === '/list') {
          try {
            const files = fs.readdirSync(backupsDir)
              .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
              .map(f => {
                const stats = fs.statSync(path.join(backupsDir, f));
                return {
                  name: f,
                  size: stats.size,
                  modified: stats.mtime.toISOString(),
                };
              })
              .sort((a, b) => b.modified.localeCompare(a.modified));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // GET /api/backup/read?file=<name>
        if (req.method === 'GET' && pathname === '/read') {
          const fileName = url.searchParams.get('file');
          if (!fileName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing file parameter' }));
            return;
          }
          const safeName = path.basename(fileName);
          const filePath = path.join(backupsDir, safeName);
          if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }
          const content = fs.readFileSync(filePath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/yaml' });
          res.end(content);
          return;
        }

        // DELETE /api/backup/delete?file=<name>
        if (req.method === 'DELETE' && pathname === '/delete') {
          const fileName = url.searchParams.get('file');
          if (!fileName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing file parameter' }));
            return;
          }
          const safeName = path.basename(fileName);
          const filePath = path.join(backupsDir, safeName);
          if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }
          fs.unlinkSync(filePath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });
    },
  };
}

/**
 * Vite dev-only log endpoint to surface client logs in the terminal.
 * POST /__log { severity, context, message, ... }
 */
function devLogPlugin(): Plugin {
  return {
    name: 'dev-log-endpoint',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            const line = `[${payload.severity || 'LOG'}] ${payload.context || 'Client'}: ${payload.message || ''}`;
            // Log to terminal without exposing in the UI.
            console.log(line);
            if (payload.data) console.log('  data:', payload.data);
            if (payload.stack) console.log('  stack:', payload.stack);
            res.writeHead(204);
            res.end();
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), backupServerPlugin(), devLogPlugin(), codeAnalyzerPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

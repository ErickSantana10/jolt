const { app, BrowserWindow, ipcMain, desktopCapturer, session, shell } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { spawn } = require('child_process');

// Define pasta fixa no AppData do Windows para nunca perder sessão/localStorage entre atualizações do .exe portátil
const PERSISTENT_DATA_DIR = path.join(app.getPath('appData'), 'JoltDesktop');
try {
  if (!fs.existsSync(PERSISTENT_DATA_DIR)) {
    fs.mkdirSync(PERSISTENT_DATA_DIR, { recursive: true });
  }
  app.setPath('userData', PERSISTENT_DATA_DIR);
} catch (err) {
  console.warn('[Electron] Falha ao fixar userData:', err);
}

const SAVED_AUTH_FILE = path.join(PERSISTENT_DATA_DIR, 'saved-auth.json');

function readSavedAuthFromDisk() {
  try {
    if (fs.existsSync(SAVED_AUTH_FILE)) {
      const raw = fs.readFileSync(SAVED_AUTH_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[Electron] Erro ao ler saved-auth.json:', err);
  }
  return null;
}

function writeSavedAuthToDisk(data) {
  try {
    if (!fs.existsSync(PERSISTENT_DATA_DIR)) {
      fs.mkdirSync(PERSISTENT_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SAVED_AUTH_FILE, JSON.stringify(data || {}, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn('[Electron] Erro ao salvar saved-auth.json:', err);
    return false;
  }
}

// Ativa reprodução automática de áudio/vídeo e captura limpa de áudio do sistema (sem AEC cancelando o loopback!)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch(
  'enable-features',
  'PulseAudioLoopbackForScreenShare,WebRTCPipeWireCapturer'
);
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns,AudioServiceOutOfProcess');

let mainWindow = null;
let selectedSourceId = null;
let selectedShareAudio = true;
let localServer = null;

// Limpa arquivo .old deixado por atualização anterior do executável portátil
function cleanupOldUpdateFiles() {
  try {
    const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
    if (portableExe && fs.existsSync(portableExe + '.old')) {
      fs.unlinkSync(portableExe + '.old');
    }
  } catch {
    // Ignora se ainda estiver sendo liberado pelo sistema
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function startStaticServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let pathname = decodeURIComponent(parsedUrl.pathname);
        if (pathname === '/') pathname = '/index.html';

        let filePath = path.join(distDir, pathname);
        if (!filePath.startsWith(distDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
            return;
          }
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
          });
          res.end(content);
        });
      } catch (e) {
        res.writeHead(500);
        res.end('Server Error');
      }
    });

    // Porta fixa 19847 para manter o localStorage persistente entre sessões e atualizações
    const tryPorts = [19847, 19848, 19849, 0];
    let portIndex = 0;

    const tryListen = () => {
      const port = tryPorts[portIndex];
      server.once('error', (err) => {
        if (portIndex < tryPorts.length - 1) {
          portIndex++;
          tryListen();
        } else {
          reject(err);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        resolve({ server, port: address.port });
      });
    };

    tryListen();
  });
}

function downloadFileWithProgress(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 8) {
        return reject(new Error('Muitos redirecionamentos durante o download.'));
      }

      const client = currentUrl.startsWith('https') ? https : http;
      client
        .get(
          currentUrl,
          {
            headers: {
              'User-Agent': 'Jolt-Desktop-Updater',
            },
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              const nextUrl = new URL(res.headers.location, currentUrl).toString();
              return request(nextUrl, redirectCount + 1);
            }

            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`Falha no download (HTTP ${res.statusCode})`));
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let transferredBytes = 0;

            const fileStream = fs.createWriteStream(destPath);
            res.on('data', (chunk) => {
              transferredBytes += chunk.length;
              if (totalBytes > 0 && onProgress) {
                const percent = Math.min(100, Math.round((transferredBytes / totalBytes) * 100));
                onProgress({
                  percent,
                  transferredMB: (transferredBytes / (1024 * 1024)).toFixed(1),
                  totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
                });
              }
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
              fileStream.close(() => resolve(destPath));
            });

            fileStream.on('error', (err) => {
              try {
                fs.unlinkSync(destPath);
              } catch {}
              reject(err);
            });
          }
        )
        .on('error', (err) => {
          reject(err);
        });
    };

    request(url);
  });
}

function setupScreenShareAndPermissions() {
  // 1. Concede automaticamente permissões de microfone, câmera e captura de tela + áudio
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = [
      'media',
      'display-capture',
      'audioCapture',
      'videoCapture',
      'desktopCapture',
      'fullscreen',
      'notifications',
    ];
    callback(allowed.includes(permission) || true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);

  // 2. IPC para listar todas as telas e janelas abertas com miniatura em tempo real
  ipcMain.handle('desktop-capturer:get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
      });

      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        display_id: source.display_id,
        isScreen: source.id.startsWith('screen:'),
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      }));
    } catch (err) {
      console.error('[Electron] Erro ao listar fontes de captura:', err);
      return [];
    }
  });

  // 3. IPC para definir qual tela/janela o usuário escolheu antes de iniciar getDisplayMedia
  ipcMain.handle('desktop-capturer:select-source', (_event, { sourceId, shareAudio }) => {
    selectedSourceId = sourceId || null;
    selectedShareAudio = shareAudio !== undefined ? Boolean(shareAudio) : true;
    return { success: true };
  });

  // 4. Handler nativo para getDisplayMedia no Electron com suporte a áudio loopback do Windows
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
      });

      if (!sources || sources.length === 0) {
        callback({});
        return;
      }

      let chosen = null;
      if (selectedSourceId) {
        chosen = sources.find((s) => s.id === selectedSourceId);
      }
      if (!chosen) {
        chosen = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
      }

      const response = { video: chosen };
      if (selectedShareAudio && process.platform === 'win32') {
        response.audio = 'loopback';
      }

      callback(response);
    } catch (err) {
      console.error('[Electron] Erro em setDisplayMediaRequestHandler:', err);
      callback({});
    }
  });

  // 5. Abrir links externos no navegador padrão do usuário
  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  // 5.1 Persistência nativa em disco para lembrar login/senha no PC mesmo entre atualizações
  ipcMain.handle('auth:get-saved', async () => {
    return readSavedAuthFromDisk();
  });

  ipcMain.handle('auth:save', async (_event, data) => {
    return { success: writeSavedAuthToDisk(data) };
  });

  ipcMain.handle('auth:clear', async () => {
    try {
      if (fs.existsSync(SAVED_AUTH_FILE)) {
        fs.unlinkSync(SAVED_AUTH_FILE);
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  // 6. Auto-Atualizador com 1 clique (Zero EBUSY): baixa em pasta dedicada, substitui via script pós-fechamento se bloqueado e reinicia!
  ipcMain.handle('app:install-update', async (_event, { downloadUrl }) => {
    try {
      const targetUrl =
        downloadUrl ||
        'https://github.com/ErickSantana10/jolt/releases/download/v1.0.0/Jolt-Windows.exe';

      if (!fs.existsSync(PERSISTENT_DATA_DIR)) {
        fs.mkdirSync(PERSISTENT_DATA_DIR, { recursive: true });
      }

      const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
      const downloadsDir = app.getPath('downloads');
      const isTempScopedDir =
        !portableExe ||
        portableExe.toLowerCase().includes('scoped_dir') ||
        portableExe.toLowerCase().includes('\\temp\\');

      const finalExePath = !isTempScopedDir
        ? portableExe
        : path.join(downloadsDir, 'Jolt-Windows.exe');

      // Sempre baixa para um arquivo único dentro de %APPDATA%\JoltDesktop para nunca dar conflito EBUSY no download
      const tempDownloadPath = path.join(PERSISTENT_DATA_DIR, `Jolt-Update-${Date.now()}.exe`);

      await downloadFileWithProgress(targetUrl, tempDownloadPath, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:update-progress', progress);
        }
      });

      if (localServer) {
        try {
          localServer.close();
          localServer = null;
        } catch {}
      }

      // Tenta substituição direta renomeando o executável antigo primeiro (permitido pelo Windows mesmo em execução)
      let replacedDirectly = false;
      try {
        if (fs.existsSync(finalExePath)) {
          const oldBackupPath = `${finalExePath}.old`;
          try {
            if (fs.existsSync(oldBackupPath)) {
              fs.unlinkSync(oldBackupPath);
            }
          } catch {}
          fs.renameSync(finalExePath, oldBackupPath);
        }
        fs.copyFileSync(tempDownloadPath, finalExePath);
        try {
          fs.unlinkSync(tempDownloadPath);
        } catch {}
        replacedDirectly = true;
      } catch (err) {
        console.warn('[Updater] Substituição direta bloqueada (usando script pós-saída):', err.message);
      }

      if (replacedDirectly) {
        spawn(finalExePath, [], { detached: true, stdio: 'ignore' }).unref();
        setTimeout(() => app.quit(), 300);
        return { success: true };
      }

      // Se o arquivo de destino estava EBUSY/bloqueado, cria um script .cmd invisível que aguarda o app fechar (2s),
      // substitui o .exe sem bloqueio e já abre a versão nova automaticamente!
      const batchPath = path.join(PERSISTENT_DATA_DIR, 'jolt-updater.cmd');
      const batchScript = [
        '@echo off',
        'timeout /t 2 /nobreak >nul',
        `del /F /Q "${finalExePath}.old" >nul 2>&1`,
        `move /Y "${finalExePath}" "${finalExePath}.old" >nul 2>&1`,
        `copy /Y "${tempDownloadPath}" "${finalExePath}" >nul 2>&1`,
        'if %ERRORLEVEL% EQU 0 (',
        `  start "" "${finalExePath}"`,
        `  del /F /Q "${tempDownloadPath}" >nul 2>&1`,
        ') else (',
        `  start "" "${tempDownloadPath}"`,
        ')',
        `del /F /Q "${finalExePath}.old" >nul 2>&1`,
      ].join('\r\n');

      fs.writeFileSync(batchPath, batchScript, 'utf-8');
      spawn('cmd.exe', ['/c', batchPath], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      }).unref();

      setTimeout(() => app.quit(), 250);
      return { success: true };
    } catch (err) {
      console.error('[Updater] Erro ao atualizar aplicativo:', err);
      return { success: false, error: err.message || 'Erro ao baixar atualização.' };
    }
  });
}

async function createWindow() {
  const iconPath = fs.existsSync(path.join(__dirname, '../dist/icon.ico'))
    ? path.join(__dirname, '../dist/icon.ico')
    : path.join(__dirname, '../public/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    title: 'Jolt',
    backgroundColor: '#090612',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    const distDir = path.join(__dirname, '../dist');
    const { server, port } = await startStaticServer(distDir);
    localServer = server;
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }
}

app.whenReady().then(async () => {
  cleanupOldUpdateFiles();
  setupScreenShareAndPermissions();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

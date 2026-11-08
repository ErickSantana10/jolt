import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { initDatabase, loadDB, saveDB, DBUser, DBServer, DBChannel, DBFriendship, DBMessage, DBDMMessage, ServerRole } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e7,
});

interface OnlineSession {
  userId: string;
  socketId: string;
  currentVoiceChannel: string | null;
  currentServerId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  streamQuality: 'potato' | 'balanced' | 'gamer';
}

export interface PlaylistItem {
  id: string;
  url: string;
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  addedBy: {
    id: string;
    name: string;
    avatarColor: string;
    avatarUrl?: string;
  };
}

export interface MediaRoomState {
  channelId: string;
  currentTrack: PlaylistItem | null;
  queue: PlaylistItem[];
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  skipVotes: string[];
  listeners: string[];
}

const mediaRooms = new Map<string, MediaRoomState>();

function extractYouTubeId(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const cleanUrl = url.trim();

  // If user pasted just the 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
    return cleanUrl;
  }

  // YouTube Shorts: /shorts/<id>
  const shortsMatch = cleanUrl.match(/(?:shorts\/)([a-zA-Z0-9_-]{11})/);
  if (shortsMatch && shortsMatch[1]) return shortsMatch[1];

  // Standard youtu.be / watch?v= / embed / music.youtube.com
  const standardMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/);
  if (standardMatch && standardMatch[1]) return standardMatch[1];

  // Fallback: ?v= parameter or &v= parameter anywhere in the query string
  const paramMatch = cleanUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (paramMatch && paramMatch[1]) return paramMatch[1];

  return null;
}

const onlineSessions = new Map<string, OnlineSession>();

// ===== Segurança de credenciais =====
// Senhas eram gravadas e comparadas em texto puro. Agora usam scrypt (nativo do Node, sem dependências).
// Contas antigas continuam entrando: no primeiro login bem-sucedido a senha é migrada para hash.
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(stored: string | undefined, password: string): { ok: boolean; needsUpgrade: boolean } {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (stored.startsWith('scrypt$')) {
    const [, salt, hashHex] = stored.split('$');
    if (!salt || !hashHex) return { ok: false, needsUpgrade: false };
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return { ok: expected.length === actual.length && crypto.timingSafeEqual(expected, actual), needsUpgrade: false };
  }
  // Legado: senha em texto puro
  const a = Buffer.from(stored);
  const b = Buffer.from(password);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, needsUpgrade: ok };
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Token de sessão para o login automático. Antes, `auth:session` aceitava apenas o userId — que é
// público (vai para todos em online:list) — então qualquer um podia entrar na conta de outra pessoa.
const MAX_SESSION_TOKENS = 10;
function issueSessionToken(user: DBUser): string {
  const token = crypto.randomBytes(32).toString('hex');
  const tokens = (user.sessionTokens || []).filter(Boolean);
  tokens.push(sha256(token));
  user.sessionTokens = tokens.slice(-MAX_SESSION_TOKENS);
  return token;
}

function hasValidSessionToken(user: DBUser, token: unknown): boolean {
  if (typeof token !== 'string' || token.length < 32) return false;
  const hashed = Buffer.from(sha256(token));
  return (user.sessionTokens || []).some((t) => {
    const stored = Buffer.from(t);
    return stored.length === hashed.length && crypto.timingSafeEqual(stored, hashed);
  });
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'JJ-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateUniqueTag(name: string, db: ReturnType<typeof loadDB>): string {
  const cleanNameLower = name.trim().toLowerCase();
  const existingTags = new Set(
    db.users
      .filter((u) => (u.name || (u as any).displayName || (u as any).username || '').trim().toLowerCase() === cleanNameLower)
      .map((u) => u.tag)
  );

  // Tenta números sequenciais formatados ex: 001, 002, 003... ou aleatório
  for (let i = 1; i <= 999; i++) {
    const formatted = i.toString().padStart(3, '0');
    if (!existingTags.has(formatted)) {
      return formatted;
    }
  }

  // Se passar de 999, tenta 4 dígitos
  for (let i = 1000; i <= 9999; i++) {
    const formatted = i.toString();
    if (!existingTags.has(formatted)) {
      return formatted;
    }
  }

  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getUserFriends(userId: string, db: ReturnType<typeof loadDB>) {
  const friendships = db.friendships.filter(
    (f) => f.fromUserId === userId || f.toUserId === userId
  );

  return friendships.map((f) => {
    const friendId = f.fromUserId === userId ? f.toUserId : f.fromUserId;
    const friendUser = db.users.find((u) => u.id === friendId);
    const isOnline = Array.from(onlineSessions.values()).some((s) => s.userId === friendId);

    const friendName = friendUser?.name || (friendUser as any)?.displayName || (friendUser as any)?.username || 'Gamer';
    const friendTag = friendUser?.tag || '001';

    return {
      friendshipId: f.id,
      status: f.status,
      isInitiator: f.fromUserId === userId,
      friend: friendUser
        ? {
            id: friendUser.id,
            name: friendName,
            tag: friendTag,
            username: friendName,
            displayName: friendName,
            avatarColor: friendUser.avatarColor,
            avatarUrl: friendUser.avatarUrl,
            bio: friendUser.bio,
            isOnline,
          }
        : null,
    };
  }).filter((item) => item.friend !== null);
}

function getDeduplicatedOnlineUsers(db: ReturnType<typeof loadDB>) {
  const byUserId = new Map<string, OnlineSession>();

  for (const session of onlineSessions.values()) {
    const existing = byUserId.get(session.userId);
    if (!existing) {
      byUserId.set(session.userId, session);
    } else {
      // Prioriza a sessão que está conectada em um canal de voz ou compartilhando tela
      if (session.currentVoiceChannel && !existing.currentVoiceChannel) {
        byUserId.set(session.userId, session);
      } else if (session.isScreenSharing && !existing.isScreenSharing) {
        byUserId.set(session.userId, session);
      } else if (!existing.currentVoiceChannel) {
        byUserId.set(session.userId, session);
      }
    }
  }

  return Array.from(byUserId.values()).map((session) => {
    const u = db.users.find((dbU) => dbU.id === session.userId);
    const name = u?.name || (u as any)?.displayName || (u as any)?.username || 'Gamer';
    const tag = u?.tag || '001';
    return {
      id: session.userId,
      socketId: session.socketId,
      name,
      tag,
      username: name,
      displayName: name,
      avatarColor: u?.avatarColor || '#8b5cf6',
      avatarUrl: u?.avatarUrl,
      bio: u?.bio,
      currentVoiceChannel: session.currentVoiceChannel,
      currentServerId: session.currentServerId,
      isMuted: session.isMuted,
      isDeafened: session.isDeafened,
      isScreenSharing: session.isScreenSharing,
      streamQuality: session.streamQuality,
    };
  });
}

function getUserState(userId: string) {
  const db = loadDB();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;

  const userName = user.name || (user as any).displayName || (user as any).username || 'Gamer';
  const userTag = user.tag || '001';

  const userServers = db.servers.filter((s) => s.members.includes(userId));
  const serverIds = userServers.map((s) => s.id);
  const userMessages = db.messages.filter((m) => serverIds.includes(m.serverId));
  const userDMs = (db.dmMessages || []).filter(
    (m) => m.fromUserId === userId || m.toUserId === userId
  );
  const friends = getUserFriends(userId, db);
  const activeUsers = getDeduplicatedOnlineUsers(db);

  const allUsersMap = db.users.map((u) => ({
    id: u.id,
    name: u.name || (u as any).displayName || (u as any).username || 'Gamer',
    tag: u.tag || '001',
    avatarColor: u.avatarColor || '#8b5cf6',
    avatarUrl: u.avatarUrl,
    bio: u.bio,
  }));

  return {
    currentUser: {
      id: user.id,
      name: userName,
      tag: userTag,
      username: userName,
      displayName: userName,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
    },
    servers: userServers,
    allServerMembers: allUsersMap,
    messages: userMessages,
    dmMessages: userDMs,
    friends,
    onlineUsers: activeUsers,
  };
}

function broadcastOnlineList() {
  const db = loadDB();
  const activeUsers = getDeduplicatedOnlineUsers(db);
  io.emit('online:list', activeUsers);
}

function updateUserFriends(userId: string) {
  const db = loadDB();
  const friends = getUserFriends(userId, db);
  for (const [sId, sSession] of onlineSessions.entries()) {
    if (sSession.userId === userId) {
      io.to(sId).emit('friend:list', friends);
    }
  }
}

function isServerAdminOrOwner(server: DBServer, userId: string): boolean {
  if (server.ownerId === userId) return true;
  const userRoles = server.memberRoles?.[userId] || [];
  return (server.roles || []).some((r) => userRoles.includes(r.id) && r.isAdmin);
}

function broadcastServerUpdated(server: DBServer) {
  for (const [sId, sSession] of onlineSessions.entries()) {
    if (server.members.includes(sSession.userId)) {
      io.to(sId).emit('server:updated', server);
    }
  }
}

app.get('/download/windows', (req, res) => {
  const exePath = path.resolve(__dirname, '..', '..', 'client', 'release', 'Jolt-Windows.exe');
  if (fs.existsSync(exePath)) {
    return res.download(exePath, 'Jolt-Windows.exe');
  }
  // Se estiver no Render (que só roda a pasta server), redireciona para a release pública no GitHub
  res.redirect('https://github.com/ErickSantana10/jolt/releases/latest/download/Jolt-Windows.exe');
});

app.get('/api/version', (_req, res) => {
  res.json({
    name: 'Jolt',
    version: '1.2.0',
    downloadUrl: 'https://github.com/ErickSantana10/jolt/releases/latest/download/Jolt-Windows.exe',
    changelog: [
      'Correção completa do áudio da transmissão de tela (WASAPI Loopback + elemento de áudio dedicado)',
      'Novo nome e identidade visual: Jolt',
      'Botão de Atualização Automática integrada no App Desktop e Web',
      'Seletor de Microfone e Fone estilo Discord + Tela Cheia na transmissão',
    ],
  });
});

// ===== TURN (relay para quem não consegue conexão direta: CGNAT, 4G, roteador restrito) =====
// Configure UMA das opções nas variáveis de ambiente do Render:
//  - METERED_TURN_URL: URL de credenciais da Metered (https://<app>.metered.live/api/v1/turn/credentials?apiKey=...)
//  - CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN: chave TURN da Cloudflare Realtime
//  - TURN_URLS (separadas por vírgula) + TURN_USERNAME + TURN_CREDENTIAL: servidor TURN próprio (coturn)
const DEFAULT_STUN: any[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
let turnCache: { servers: any[]; expiresAt: number } | null = null;

async function getIceServers(): Promise<any[]> {
  if (turnCache && turnCache.expiresAt > Date.now()) return turnCache.servers;
  let turn: any[] = [];
  let ttlMs = 6 * 60 * 60 * 1000;
  try {
    if (process.env.METERED_TURN_URL) {
      const r = await fetch(process.env.METERED_TURN_URL);
      if (r.ok) turn = await r.json();
    } else if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) {
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: 86400 }),
        }
      );
      if (r.ok) {
        const data: any = await r.json();
        turn = data.iceServers || [];
        ttlMs = 12 * 60 * 60 * 1000;
      }
    } else if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      turn = [
        {
          urls: process.env.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_CREDENTIAL,
        },
      ];
    }
  } catch (err: any) {
    console.error('[TURN] Falha ao obter credenciais:', err.message);
  }
  if (!Array.isArray(turn)) turn = [turn];
  const servers = [...DEFAULT_STUN, ...turn];
  // Sem TURN configurado, guarda por pouco tempo para tentar de novo
  turnCache = { servers, expiresAt: Date.now() + (turn.length ? ttlMs : 5 * 60 * 1000) };
  return servers;
}

app.get('/api/turn', async (_req, res) => {
  const servers = await getIceServers();
  res.set('Cache-Control', 'no-store');
  res.json({ iceServers: servers, hasTurn: servers.length > DEFAULT_STUN.length });
});

app.get('/api/health', (req, res) => {
  const db = loadDB();
  res.json({
    status: 'ok',
    users: db.users.length,
    servers: db.servers.length,
    online: onlineSessions.size,
  });
});

io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Conectado: ${socket.id}`);

  // 1. REGISTRO (Apenas Nome, Senha, Tag automática ou personalizada)
  socket.on('auth:register', ({ name, username, password, avatarColor, avatarUrl }, callback) => {
    const rawName = (name || username || '').trim();
    const cleanPassword = (password || '').trim();

    if (!rawName || rawName.length < 2) {
      return callback?.({ success: false, error: 'O nome deve ter pelo menos 2 caracteres.' });
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      return callback?.({ success: false, error: 'A senha deve ter pelo menos 4 caracteres.' });
    }

    const db = loadDB();
    const tag = generateUniqueTag(rawName, db);

    const newUser: DBUser = {
      id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: rawName,
      tag,
      password: hashPassword(cleanPassword),
      avatarColor: avatarColor || '#6366f1',
      avatarUrl: avatarUrl || undefined,
      createdAt: new Date().toISOString(),
    };

    const sessionToken = issueSessionToken(newUser);
    db.users.push(newUser);
    saveDB(db);

    const session: OnlineSession = {
      userId: newUser.id,
      socketId: socket.id,
      currentVoiceChannel: null,
      currentServerId: null,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      streamQuality: 'balanced',
    };
    onlineSessions.set(socket.id, session);

    const state = getUserState(newUser.id);
    callback?.({ success: true, user: state?.currentUser, state, sessionToken });
    broadcastOnlineList();
  });

  // 2. LOGIN (Aceita tanto "nome#001" quanto só "nome" se único, ou login tradicional)
  socket.on('auth:login', ({ name, username, password }, callback) => {
    const inputIdentifier = (name || username || '').trim();
    const cleanPassword = (password || '').trim();

    const db = loadDB();

    let user: DBUser | undefined;

    if (inputIdentifier.includes('#')) {
      const parts = inputIdentifier.split('#');
      const inputName = parts[0].trim().toLowerCase();
      const inputTag = parts[1].trim();

      user = db.users.find(
        (u) =>
          ((u.name || (u as any).displayName || (u as any).username || '').toLowerCase() === inputName) &&
          (u.tag === inputTag || u.tag === inputTag.padStart(3, '0')) &&
          verifyPassword(u.password, cleanPassword).ok
      );
    } else {
      // Se não passou #, busca pelo nome
      const matchedUsers = db.users.filter(
        (u) =>
          ((u.name || (u as any).displayName || (u as any).username || '').toLowerCase() === inputIdentifier.toLowerCase()) &&
          verifyPassword(u.password, cleanPassword).ok
      );
      if (matchedUsers.length === 1) {
        user = matchedUsers[0];
      } else if (matchedUsers.length > 1) {
        return callback?.({
          success: false,
          error: `Existem múltiplos usuários com o nome "${inputIdentifier}". Por favor informe seu nome com a sua hashtag (ex: ${inputIdentifier}#${matchedUsers[0].tag}).`,
        });
      }
    }

    if (!user) {
      return callback?.({ success: false, error: 'Nome de usuário ou senha incorretos.' });
    }

    // Migra senha legada (texto puro) para hash e emite token de sessão
    if (verifyPassword(user.password, cleanPassword).needsUpgrade) {
      user.password = hashPassword(cleanPassword);
    }
    const sessionToken = issueSessionToken(user);
    saveDB(db);

    const session: OnlineSession = {
      userId: user.id,
      socketId: socket.id,
      currentVoiceChannel: null,
      currentServerId: null,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      streamQuality: 'balanced',
    };
    onlineSessions.set(socket.id, session);

    const state = getUserState(user.id);
    callback?.({ success: true, user: state?.currentUser, state, sessionToken });
    broadcastOnlineList();
  });

  // 3. RETOMAR SESSÃO (exige o token emitido no login; só o userId não basta)
  socket.on('auth:session', ({ userId, sessionToken }: { userId?: string; sessionToken?: string } = {}, callback) => {
    const db = loadDB();
    const user = db.users.find((u) => u.id === userId);

    if (!user || !hasValidSessionToken(user, sessionToken)) {
      return callback?.({ success: false, error: 'Sessão inválida.' });
    }

    const session: OnlineSession = {
      userId: user.id,
      socketId: socket.id,
      currentVoiceChannel: null,
      currentServerId: null,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      streamQuality: 'balanced',
    };
    onlineSessions.set(socket.id, session);

    const state = getUserState(user.id);
    callback?.({ success: true, user: state?.currentUser, state });
    broadcastOnlineList();
  });

  // 3.1 LOGOUT: revoga o token deste dispositivo
  socket.on('auth:logout', ({ userId, sessionToken }: { userId?: string; sessionToken?: string } = {}, callback) => {
    const db = loadDB();
    const user = db.users.find((u) => u.id === userId);
    if (user && typeof sessionToken === 'string') {
      const hashed = sha256(sessionToken);
      const before = (user.sessionTokens || []).length;
      user.sessionTokens = (user.sessionTokens || []).filter((t) => t !== hashed);
      if (user.sessionTokens.length !== before) saveDB(db);
    }
    callback?.({ success: true });
  });

  // 4. ATUALIZAR PERFIL (Apenas Nome, Foto, Cor) - a # continua intacta ou muda se o nome mudar
  socket.on('user:update-profile', ({ name, displayName, avatarColor, avatarUrl, bio }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const user = db.users.find((u) => u.id === session.userId);
    if (!user) return callback?.({ success: false, error: 'Usuário não encontrado.' });

    const newName = (name || displayName || '').trim();
    if (newName && newName !== user.name) {
      user.name = newName;
      // Garante que a tag continua única para o novo nome
      const existing = db.users.find(
        (u) =>
          u.id !== user.id &&
          (u.name || '').toLowerCase() === newName.toLowerCase() &&
          u.tag === user.tag
      );
      if (existing) {
        user.tag = generateUniqueTag(newName, db);
      }
    }

    if (avatarColor) user.avatarColor = avatarColor;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    if (bio !== undefined) user.bio = bio;

    saveDB(db);

    const state = getUserState(user.id);
    socket.emit('user:profile-updated', state?.currentUser);

    const friends = getUserFriends(session.userId, db);
    friends.forEach((f) => {
      if (f.friend) {
        updateUserFriends(f.friend.id);
      }
    });

    broadcastOnlineList();
    callback?.({ success: true, user: state?.currentUser });
  });

  // 5. CRIAR NOVO CANAL NO SERVIDOR (Texto, Voz ou Sala de Música/Vídeo)
  socket.on('channel:create', ({ serverId, name, type }: { serverId: string; name: string; type: 'text' | 'voice' | 'media' }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const cleanName = (name || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanName) return callback?.({ success: false, error: 'O nome do canal é obrigatório.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);
    if (!server || !server.members.includes(session.userId)) {
      return callback?.({ success: false, error: 'Servidor não encontrado ou você não é membro.' });
    }

    const typePrefix = type === 'voice' ? 'vox' : type === 'media' ? 'med' : 'txt';
    const channelDisplayName = type === 'voice' ? `🔊 ${cleanName}` : type === 'media' ? `🎬 ${cleanName}` : cleanName;

    const newChannel: DBChannel = {
      id: `c-${typePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      serverId,
      name: channelDisplayName,
      type,
    };

    server.channels.push(newChannel);
    saveDB(db);

    // Se for canal de mídia, inicializa estado da fila
    if (type === 'media') {
      mediaRooms.set(newChannel.id, {
        channelId: newChannel.id,
        currentTrack: null,
        queue: [],
        isPlaying: false,
        currentTime: 0,
        updatedAt: Date.now(),
        skipVotes: [],
        listeners: [],
      });
    }

    // Transmitir para todos os membros online do servidor
    for (const [sId, sSession] of onlineSessions.entries()) {
      if (server.members.includes(sSession.userId)) {
        io.to(sId).emit('server:channel-created', { serverId, channel: newChannel });
      }
    }

    callback?.({ success: true, channel: newChannel });
  });

  // 6. CHAT PRIVADO (DMs)
  socket.on('dm:send', ({ toUserId, text, attachment }: { toUserId: string; text?: string; attachment?: any }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session || (!text?.trim() && !attachment)) return;

    const db = loadDB();
    const sender = db.users.find((u) => u.id === session.userId);
    const recipient = db.users.find((u) => u.id === toUserId);

    if (!sender || !recipient) return callback?.({ success: false, error: 'Destinatário não encontrado.' });

    const isFriend = db.friendships.some(
      (f) =>
        f.status === 'accepted' &&
        ((f.fromUserId === session.userId && f.toUserId === toUserId) ||
          (f.fromUserId === toUserId && f.toUserId === session.userId))
    );

    if (!isFriend) {
      return callback?.({ success: false, error: 'Você só pode enviar mensagens diretas para amigos adicionados.' });
    }

    const newDM: DBDMMessage = {
      id: Math.random().toString(36).substring(2, 9),
      fromUserId: sender.id,
      toUserId: recipient.id,
      text: (text || '').trim(),
      attachment: attachment || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString(),
    };

    if (!db.dmMessages) db.dmMessages = [];
    db.dmMessages.push(newDM);
    if (db.dmMessages.length > 2000) db.dmMessages.shift();
    saveDB(db);

    socket.emit('dm:message', newDM);

    for (const [sId, sSession] of onlineSessions.entries()) {
      if (sSession.userId === toUserId) {
        io.to(sId).emit('dm:message', newDM);
      }
    }

    callback?.({ success: true, message: newDM });
  });

  // 7. LIGAÇÃO PRIVADA ENTRE AMIGOS (DM Call Ringing)
  socket.on('dm:call-start', ({ toUserId, channelId }: { toUserId: string; channelId: string }) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return;

    const db = loadDB();
    const caller = db.users.find((u) => u.id === session.userId);
    if (!caller) return;

    // Notificar amigo da chamada
    for (const [sId, sSession] of onlineSessions.entries()) {
      if (sSession.userId === toUserId) {
        io.to(sId).emit('dm:incoming-call', {
          fromUser: {
            id: caller.id,
            username: caller.username || caller.name,
            displayName: caller.displayName || caller.name,
            avatarColor: caller.avatarColor,
            avatarUrl: caller.avatarUrl,
          },
          channelId,
        });
      }
    }
  });

  socket.on('dm:call-end', ({ toUserId }: { toUserId: string }) => {
    for (const [sId, sSession] of onlineSessions.entries()) {
      if (sSession.userId === toUserId) {
        io.to(sId).emit('dm:call-ended');
      }
    }
  });

  // 8. CRIAR SERVIDOR
  socket.on('server:create', ({ name, iconColor, iconUrl, bannerUrl, description }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const serverName = (name || '').trim();
    if (!serverName) return callback?.({ success: false, error: 'Nome do servidor obrigatório.' });

    const db = loadDB();
    const serverId = `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const inviteCode = generateInviteCode();

    const newServer: DBServer = {
      id: serverId,
      name: serverName,
      iconColor: iconColor || '#8b5cf6',
      iconUrl: iconUrl || undefined,
      bannerUrl: bannerUrl || undefined,
      description: description ? description.trim() : undefined,
      ownerId: session.userId,
      inviteCode,
      members: [session.userId],
      channels: [
        { id: `c-txt-${Date.now()}`, serverId, name: 'geral', type: 'text' },
        { id: `c-vox-${Date.now()}`, serverId, name: '🔊 Geral', type: 'voice' },
      ],
      roles: [
        { id: 'role-admin', name: 'Administrador', color: '#ef4444', isAdmin: true },
        { id: 'role-mod', name: 'Moderador', color: '#8b5cf6', isAdmin: false },
        { id: 'role-member', name: 'Membro', color: '#a855f7', isAdmin: false },
      ],
      memberRoles: {
        [session.userId]: ['role-admin'],
      },
      timeouts: {},
    };

    db.servers.push(newServer);
    saveDB(db);

    for (const [sId, sSession] of onlineSessions.entries()) {
      if (sSession.userId === session.userId) {
        io.to(sId).emit('server:created', newServer);
      }
    }
    callback?.({ success: true, server: newServer });
  });

  // 9. ENTRAR VIA CONVITE
  socket.on('server:join-by-invite', ({ inviteCode }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const cleanCode = (inviteCode || '').trim().toUpperCase();
    const db = loadDB();
    const server = db.servers.find((s) => s.inviteCode.toUpperCase() === cleanCode);

    if (!server) {
      return callback?.({ success: false, error: 'Código de convite inválido ou expirado.' });
    }

    if (server.members.includes(session.userId)) {
      return callback?.({ success: false, error: 'Você já faz parte deste servidor!' });
    }

    server.members.push(session.userId);
    saveDB(db);

    socket.emit('server:joined', server);
    callback?.({ success: true, server });
  });

  // 10. CONVIDAR AMIGO DIRETO (Envia convite com botão de Aceitar/Recusar pelo Chat Privado de DM)
  socket.on('server:invite-friend', ({ serverId, friendUserId }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);

    if (!server) return callback?.({ success: false, error: 'Servidor não encontrado.' });
    if (!server.members.includes(session.userId)) {
      return callback?.({ success: false, error: 'Sem permissão.' });
    }

    const inviter = db.users.find((u) => u.id === session.userId);
    const friend = db.users.find((u) => u.id === friendUserId);

    if (!friend) return callback?.({ success: false, error: 'Amigo não encontrado.' });

    if (server.members.includes(friendUserId)) {
      return callback?.({ success: false, error: 'Esse amigo já faz parte do servidor!' });
    }

    const inviterName = inviter?.name || (inviter as any)?.displayName || 'Um amigo';

    // Cria a mensagem de DM com o convite interativo
    const inviteMessage: DBDMMessage = {
      id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      fromUserId: session.userId,
      toUserId: friendUserId,
      text: `Te convidei para entrar no servidor **${server.name}**!`,
      serverInvite: {
        serverId: server.id,
        serverName: server.name,
        iconColor: server.iconColor,
        inviteCode: server.inviteCode,
        inviterName,
        status: 'pending',
      },
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString(),
    };

    if (!db.dmMessages) db.dmMessages = [];
    db.dmMessages.push(inviteMessage);
    saveDB(db);

    // Enviar mensagem para o remetente (quem convidou) e para o amigo
    socket.emit('dm:message', inviteMessage);

    for (const [sId, sSession] of onlineSessions.entries()) {
      if (sSession.userId === friendUserId) {
        io.to(sId).emit('dm:message', inviteMessage);
      }
    }

    callback?.({ success: true, message: `Convite enviado no chat de ${friend.name || 'amigo'}!` });
  });

  // 10.1 RESPONDER AO CONVITE DE SERVIDOR (Aceitar ou Recusar)
  socket.on('server:respond-invite', ({ messageId, action }: { messageId: string; action: 'accept' | 'decline' }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const dmMsg = (db.dmMessages || []).find((m) => m.id === messageId);

    if (!dmMsg || !dmMsg.serverInvite) {
      return callback?.({ success: false, error: 'Convite não encontrado.' });
    }

    if (dmMsg.toUserId !== session.userId) {
      return callback?.({ success: false, error: 'Apenas quem recebeu o convite pode responder.' });
    }

    const server = db.servers.find((s) => s.id === dmMsg.serverInvite?.serverId);

    if (action === 'accept') {
      if (!server) {
        return callback?.({ success: false, error: 'Este servidor não existe mais.' });
      }

      if (!server.members.includes(session.userId)) {
        server.members.push(session.userId);
      }

      dmMsg.serverInvite.status = 'accepted';
      saveDB(db);

      // Notificar quem aceitou com o novo servidor
      socket.emit('server:joined', server);

      // Atualizar a mensagem de DM para ambos os usuários
      socket.emit('dm:invite-updated', { messageId, status: 'accepted' });
      for (const [sId, sSession] of onlineSessions.entries()) {
        if (sSession.userId === dmMsg.fromUserId) {
          io.to(sId).emit('dm:invite-updated', { messageId, status: 'accepted' });
        }
      }

      callback?.({ success: true, server });
    } else {
      dmMsg.serverInvite.status = 'declined';
      saveDB(db);

      socket.emit('dm:invite-updated', { messageId, status: 'declined' });
      for (const [sId, sSession] of onlineSessions.entries()) {
        if (sSession.userId === dmMsg.fromUserId) {
          io.to(sId).emit('dm:invite-updated', { messageId, status: 'declined' });
        }
      }

      callback?.({ success: true });
    }
  });

  // 10.2 ATUALIZAR CONFIGURAÇÕES DO SERVIDOR (Nome, Cor, Foto, Banner, Descrição)
  socket.on('server:update-settings', ({ serverId, name, iconColor, iconUrl, bannerUrl, description }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);
    if (!server) return callback?.({ success: false, error: 'Servidor não encontrado.' });

    if (!isServerAdminOrOwner(server, session.userId)) {
      return callback?.({ success: false, error: 'Você não tem permissão para editar este servidor.' });
    }

    if (name && name.trim()) server.name = name.trim();
    if (iconColor) server.iconColor = iconColor;
    if (iconUrl !== undefined) server.iconUrl = iconUrl || undefined;
    if (bannerUrl !== undefined) server.bannerUrl = bannerUrl || undefined;
    if (description !== undefined) server.description = description ? description.trim() : undefined;

    saveDB(db);
    broadcastServerUpdated(server);
    callback?.({ success: true, server });
  });

  // 10.3 CRIAR / EDITAR CARGOS
  socket.on('server:create-role', ({ serverId, name, color, isAdmin }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);
    if (!server) return callback?.({ success: false, error: 'Servidor não encontrado.' });

    if (!isServerAdminOrOwner(server, session.userId)) {
      return callback?.({ success: false, error: 'Você não tem permissão para gerenciar cargos.' });
    }

    if (!server.roles) {
      server.roles = [
        { id: 'role-admin', name: 'Administrador', color: '#ef4444', isAdmin: true },
        { id: 'role-mod', name: 'Moderador', color: '#3b82f6', isAdmin: false },
        { id: 'role-member', name: 'Membro', color: '#94a3b8', isAdmin: false },
      ];
    }

    const cleanName = (name || '').trim();
    if (!cleanName) return callback?.({ success: false, error: 'Nome do cargo é obrigatório.' });

    const newRole: ServerRole = {
      id: `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      color: color || '#818cf8',
      isAdmin: !!isAdmin,
    };

    server.roles.push(newRole);
    saveDB(db);
    broadcastServerUpdated(server);
    callback?.({ success: true, server, role: newRole });
  });

  socket.on('server:delete-role', ({ serverId, roleId }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);
    if (!server) return callback?.({ success: false, error: 'Servidor não encontrado.' });

    if (!isServerAdminOrOwner(server, session.userId)) {
      return callback?.({ success: false, error: 'Você não tem permissão para gerenciar cargos.' });
    }

    server.roles = (server.roles || []).filter((r) => r.id !== roleId);
    if (server.memberRoles) {
      for (const mId in server.memberRoles) {
        server.memberRoles[mId] = server.memberRoles[mId].filter((id) => id !== roleId);
      }
    }

    saveDB(db);
    broadcastServerUpdated(server);
    callback?.({ success: true, server });
  });

  // 10.4 ATRIBUIR OU REMOVER CARGO DE MEMBRO
  socket.on('server:assign-role', ({ serverId, targetUserId, roleId }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);
    if (!server) return callback?.({ success: false, error: 'Servidor não encontrado.' });

    if (!isServerAdminOrOwner(server, session.userId)) {
      return callback?.({ success: false, error: 'Você não tem permissão para atribuir cargos.' });
    }

    if (!server.memberRoles) server.memberRoles = {};
    if (!server.memberRoles[targetUserId]) server.memberRoles[targetUserId] = [];

    const existingIndex = server.memberRoles[targetUserId].indexOf(roleId);
    if (existingIndex !== -1) {
      server.memberRoles[targetUserId].splice(existingIndex, 1);
    } else {
      server.memberRoles[targetUserId].push(roleId);
    }

    saveDB(db);
    broadcastServerUpdated(server);
    callback?.({ success: true, server });
  });

  // 10.5 TIMEOUT / SILENCIAR MEMBRO
  socket.on('server:timeout-member', ({ serverId, targetUserId, durationMinutes }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);
    if (!server) return callback?.({ success: false, error: 'Servidor não encontrado.' });

    if (!isServerAdminOrOwner(server, session.userId)) {
      return callback?.({ success: false, error: 'Você não tem permissão para moderar membros.' });
    }

    if (targetUserId === server.ownerId) {
      return callback?.({ success: false, error: 'Não é possível dar timeout no dono do servidor.' });
    }

    const targetUser = db.users.find((u) => u.id === targetUserId);
    const targetName = targetUser?.name || 'Membro';

    if (!server.timeouts) server.timeouts = {};

    if (durationMinutes && durationMinutes > 0) {
      server.timeouts[targetUserId] = Date.now() + durationMinutes * 60 * 1000;
    } else {
      delete server.timeouts[targetUserId];
    }

    saveDB(db);
    broadcastServerUpdated(server);

    // Anúncio no chat geral
    const defaultChannel = server.channels.find((c) => c.type === 'text') || server.channels[0];
    if (defaultChannel) {
      const sysMsg: DBMessage = {
        id: Math.random().toString(36).substring(2, 9),
        serverId: server.id,
        channelId: defaultChannel.id,
        userId: 'system',
        userName: '🛡️ Janjacord Moderação',
        avatarColor: '#ef4444',
        text: durationMinutes > 0
          ? `⏳ **${targetName}** foi silenciado temporariamente por **${durationMinutes} minutos**.`
          : `🔊 O silenciamento de **${targetName}** foi removido.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      db.messages.push(sysMsg);
      saveDB(db);

      for (const [sId, sSession] of onlineSessions.entries()) {
        if (server.members.includes(sSession.userId)) {
          io.to(sId).emit('chat:message', sysMsg);
        }
      }
    }

    callback?.({ success: true, server });
  });

  // 10.6 EXPULSAR MEMBRO (KICK)
  socket.on('server:kick-member', ({ serverId, targetUserId }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);
    if (!server) return callback?.({ success: false, error: 'Servidor não encontrado.' });

    if (!isServerAdminOrOwner(server, session.userId)) {
      return callback?.({ success: false, error: 'Você não tem permissão para expulsar membros.' });
    }

    if (targetUserId === server.ownerId) {
      return callback?.({ success: false, error: 'Não é possível expulsar o dono do servidor.' });
    }

    server.members = server.members.filter((id) => id !== targetUserId);
    if (server.memberRoles) delete server.memberRoles[targetUserId];
    if (server.timeouts) delete server.timeouts[targetUserId];

    saveDB(db);

    // Notificar o membro expulso
    for (const [sId, sSession] of onlineSessions.entries()) {
      if (sSession.userId === targetUserId) {
        io.to(sId).emit('server:kicked', { serverId });
      }
    }

    broadcastServerUpdated(server);
    callback?.({ success: true, server });
  });

  // 10.7 SAIR DO SERVIDOR
  socket.on('server:leave', ({ serverId }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const server = db.servers.find((s) => s.id === serverId);
    if (!server) return callback?.({ success: false, error: 'Servidor não encontrado.' });

    if (server.ownerId === session.userId) {
      return callback?.({ success: false, error: 'O dono do servidor não pode sair. Exclua o servidor se desejar apagá-lo.' });
    }

    server.members = server.members.filter((id) => id !== session.userId);
    if (server.memberRoles) delete server.memberRoles[session.userId];
    if (server.timeouts) delete server.timeouts[session.userId];

    saveDB(db);
    socket.emit('server:left', { serverId });
    broadcastServerUpdated(server);
    callback?.({ success: true });
  });

  // 10.8 EXCLUIR SERVIDOR
  socket.on('server:delete', ({ serverId }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const sIndex = db.servers.findIndex((s) => s.id === serverId);
    if (sIndex === -1) return callback?.({ success: false, error: 'Servidor não encontrado.' });

    const server = db.servers[sIndex];
    if (server.ownerId !== session.userId) {
      return callback?.({ success: false, error: 'Apenas o dono pode excluir o servidor.' });
    }

    db.servers.splice(sIndex, 1);
    db.messages = db.messages.filter((m) => m.serverId !== serverId);
    saveDB(db);

    for (const [sId] of onlineSessions.entries()) {
      io.to(sId).emit('server:deleted', { serverId });
    }
    callback?.({ success: true });
  });

  // 11. AMIZADES (Adicionar amigos via nome#tag, ex: fulaninho#001)
  socket.on('friend:request', ({ targetUsername, targetIdentifier }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const rawInput = (targetIdentifier || targetUsername || '').trim();
    if (!rawInput) return callback?.({ success: false, error: 'Informe o nome e a # do seu amigo (ex: fulaninho#001).' });

    const db = loadDB();

    let targetUser: DBUser | undefined;

    if (rawInput.includes('#')) {
      const parts = rawInput.split('#');
      const targetName = parts[0].trim().toLowerCase();
      const targetTag = parts[1].trim();

      targetUser = db.users.find(
        (u) =>
          (u.name || (u as any).displayName || (u as any).username || '').toLowerCase() === targetName &&
          (u.tag === targetTag || u.tag === targetTag.padStart(3, '0'))
      );
    } else {
      // Se digitou sem #, tenta achar por nome ou retrocompatibilidade
      const matches = db.users.filter(
        (u) =>
          (u.name || (u as any).displayName || (u as any).username || '').toLowerCase() === rawInput.toLowerCase()
      );
      if (matches.length === 1) {
        targetUser = matches[0];
      } else if (matches.length > 1) {
        return callback?.({
          success: false,
          error: `Existem múltiplos usuários com o nome "${rawInput}". Especifique a # (ex: ${rawInput}#${matches[0].tag}).`,
        });
      }
    }

    if (!targetUser) return callback?.({ success: false, error: 'Usuário não encontrado. Verifique se o nome e a # estão corretos.' });
    if (targetUser.id === session.userId) return callback?.({ success: false, error: 'Você não pode adicionar a si mesmo.' });

    const existing = db.friendships.find(
      (f) =>
        (f.fromUserId === session.userId && f.toUserId === targetUser.id) ||
        (f.fromUserId === targetUser.id && f.toUserId === session.userId)
    );

    if (existing) {
      if (existing.status === 'accepted') return callback?.({ success: false, error: 'Vocês já são amigos!' });
      if (existing.fromUserId === targetUser.id) {
        existing.status = 'accepted';
        saveDB(db);
        updateUserFriends(session.userId);
        updateUserFriends(targetUser.id);
        return callback?.({ success: true, message: 'Pedido de amizade aceito!' });
      }
      return callback?.({ success: false, error: 'Pedido já enviado anteriormente.' });
    }

    const newFriendship: DBFriendship = {
      id: `fr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      fromUserId: session.userId,
      toUserId: targetUser.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    db.friendships.push(newFriendship);
    saveDB(db);

    updateUserFriends(session.userId);
    updateUserFriends(targetUser.id);

    const targetDisplayName = targetUser.name || (targetUser as any).displayName || 'amigo';
    callback?.({ success: true, message: `Pedido de amizade enviado para ${targetDisplayName}#${targetUser.tag}!` });
  });

  socket.on('friend:accept', ({ friendshipId }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const friendship = db.friendships.find((f) => f.id === friendshipId);
    if (!friendship || friendship.toUserId !== session.userId) {
      return callback?.({ success: false, error: 'Pedido não encontrado.' });
    }

    friendship.status = 'accepted';
    saveDB(db);

    updateUserFriends(friendship.fromUserId);
    updateUserFriends(friendship.toUserId);

    callback?.({ success: true });
  });

  socket.on('friend:remove', ({ friendshipId }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const index = db.friendships.findIndex((f) => f.id === friendshipId && (f.fromUserId === session.userId || f.toUserId === session.userId));
    if (index === -1) return callback?.({ success: false, error: 'Amizade não encontrada.' });

    const [removed] = db.friendships.splice(index, 1);
    saveDB(db);

    updateUserFriends(removed.fromUserId);
    updateUserFriends(removed.toUserId);

    callback?.({ success: true });
  });

  // 12. CHAT DE SERVIDOR
  socket.on('chat:send', ({ serverId, channelId, text, attachment }: { serverId: string; channelId: string; text?: string; attachment?: any }) => {
    const session = onlineSessions.get(socket.id);
    if (!session || (!text?.trim() && !attachment)) return;

    const db = loadDB();
    const user = db.users.find((u) => u.id === session.userId);
    const server = db.servers.find((s) => s.id === serverId);

    if (!user || !server || !server.members.includes(session.userId)) return;

    // Verificar se o usuário está com Timeout ativo no servidor
    const timeoutExpiry = server.timeouts?.[session.userId];
    if (timeoutExpiry && timeoutExpiry > Date.now()) {
      const remainingMinutes = Math.ceil((timeoutExpiry - Date.now()) / 60000);
      socket.emit('chat:error', {
        message: `Você está silenciado temporariamente neste servidor por mais ${remainingMinutes} minuto(s).`,
      });
      return;
    }

    const newMessage: DBMessage = {
      id: Math.random().toString(36).substring(2, 9),
      serverId,
      channelId,
      userId: user.id,
      userName: user.displayName || user.username || user.name,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      text: (text || '').trim(),
      attachment: attachment || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    db.messages.push(newMessage);
    if (db.messages.length > 500) db.messages.shift();
    saveDB(db);

    for (const [sId, sSession] of onlineSessions.entries()) {
      if (server.members.includes(sSession.userId)) {
        io.to(sId).emit('chat:message', newMessage);
      }
    }
  });

  // 13. VOZ & WEBRTC (Suporta salas de servidor e DM calls)
  socket.on('voice:join', ({ channelId, serverId }: { channelId: string; serverId?: string }) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return;

    const db = loadDB();

    if (typeof channelId !== 'string' || !channelId) return;

    if (channelId.startsWith('dm-call-')) {
      // Chamada privada: o id é `dm-call-<idA>-<idB>`, só os dois participantes podem entrar
      if (!channelId.includes(session.userId)) return;
    } else {
      // Canal de servidor: precisa ser membro e o canal precisa pertencer ao servidor
      const server = serverId
        ? db.servers.find((s) => s.id === serverId)
        : db.servers.find((s) => s.channels.some((c) => c.id === channelId));
      if (!server || !server.members.includes(session.userId)) return;
      if (!server.channels.some((c) => c.id === channelId)) return;
    }

    if (session.currentVoiceChannel) {
      socket.leave(session.currentVoiceChannel);
      socket.to(session.currentVoiceChannel).emit('voice:peer-left', { peerId: socket.id });
    }

    session.currentVoiceChannel = channelId;
    session.currentServerId = serverId || null;
    socket.join(channelId);

    const peersInRoom = Array.from(onlineSessions.values())
      .filter((s) => s.currentVoiceChannel === channelId && s.socketId !== socket.id)
      .map((s) => {
        const u = db.users.find((dbU) => dbU.id === s.userId);
        return {
          id: s.userId,
          socketId: s.socketId,
          name: u?.displayName || u?.username || u?.name || 'Gamer',
          avatarColor: u?.avatarColor || '#6366f1',
          avatarUrl: u?.avatarUrl,
          isMuted: s.isMuted,
          isDeafened: s.isDeafened,
          isScreenSharing: s.isScreenSharing,
        };
      });

    socket.emit('voice:room-users', {
      channelId,
      peers: peersInRoom,
    });

    const u = db.users.find((dbU) => dbU.id === session.userId);
    socket.to(channelId).emit('voice:peer-joined', {
      peer: {
        id: session.userId,
        socketId: socket.id,
        name: u?.displayName || u?.username || u?.name || 'Gamer',
        avatarColor: u?.avatarColor || '#6366f1',
        avatarUrl: u?.avatarUrl,
        isMuted: session.isMuted,
        isDeafened: session.isDeafened,
        isScreenSharing: session.isScreenSharing,
      },
    });

    broadcastOnlineList();
  });

  socket.on('voice:leave', () => {
    const session = onlineSessions.get(socket.id);
    if (!session || !session.currentVoiceChannel) return;

    const channelId = session.currentVoiceChannel;
    socket.leave(channelId);
    session.currentVoiceChannel = null;
    session.isScreenSharing = false;

    socket.to(channelId).emit('voice:peer-left', { peerId: socket.id, socketId: socket.id });
    broadcastOnlineList();
  });

  socket.on('user:update-state', (rawUpdates: Partial<OnlineSession>) => {
    const session = onlineSessions.get(socket.id);
    if (!session || !rawUpdates || typeof rawUpdates !== 'object') return;

    // Apenas campos de estado de voz. Antes era Object.assign(session, updates) direto,
    // o que permitia mandar { userId: '<outro>' } e assumir a identidade de outra conta.
    const updates: Partial<OnlineSession> = {};
    if (typeof rawUpdates.isMuted === 'boolean') updates.isMuted = rawUpdates.isMuted;
    if (typeof rawUpdates.isDeafened === 'boolean') updates.isDeafened = rawUpdates.isDeafened;
    if (typeof rawUpdates.isScreenSharing === 'boolean') updates.isScreenSharing = rawUpdates.isScreenSharing;
    if (
      rawUpdates.streamQuality === 'potato' ||
      rawUpdates.streamQuality === 'balanced' ||
      rawUpdates.streamQuality === 'gamer'
    ) {
      updates.streamQuality = rawUpdates.streamQuality;
    }
    if (Object.keys(updates).length === 0) return;

    Object.assign(session, updates);
    broadcastOnlineList();

    if (session.currentVoiceChannel) {
      socket.to(session.currentVoiceChannel).emit('voice:peer-state-change', {
        peerId: socket.id,
        socketId: socket.id,
        updates,
      });
    }
  });

  socket.on('webrtc:offer', (payload: { toPeerId?: string; targetSocketId?: string; offer: RTCSessionDescriptionInit }) => {
    const target = payload.targetSocketId || payload.toPeerId;
    if (target) {
      io.to(target).emit('webrtc:offer', { fromPeerId: socket.id, fromSocketId: socket.id, offer: payload.offer });
    }
  });

  socket.on('webrtc:answer', (payload: { toPeerId?: string; targetSocketId?: string; answer: RTCSessionDescriptionInit }) => {
    const target = payload.targetSocketId || payload.toPeerId;
    if (target) {
      io.to(target).emit('webrtc:answer', { fromPeerId: socket.id, fromSocketId: socket.id, answer: payload.answer });
    }
  });

  // Pedido de refazer a conexão do zero com um colega (auto-recuperação / botão "recarregar")
  socket.on('webrtc:reset', (payload: { targetSocketId?: string }) => {
    const target = payload?.targetSocketId;
    if (typeof target === 'string' && target) {
      io.to(target).emit('webrtc:reset', { fromSocketId: socket.id });
    }
  });

  socket.on('webrtc:ice-candidate', (payload: { toPeerId?: string; targetSocketId?: string; candidate: RTCIceCandidateInit }) => {
    const target = payload.targetSocketId || payload.toPeerId;
    if (target) {
      io.to(target).emit('webrtc:ice-candidate', { fromPeerId: socket.id, fromSocketId: socket.id, candidate: payload.candidate });
    }
  });

  // 14. SALA DE MÚSICA & VÍDEO COMPARTILHADO (YouTube Sincronizado & Votação)
  socket.on('media:get-state', ({ channelId }: { channelId: string }, callback) => {
    let state = mediaRooms.get(channelId);
    if (!state) {
      state = {
        channelId,
        currentTrack: null,
        queue: [],
        isPlaying: false,
        currentTime: 0,
        updatedAt: Date.now(),
        skipVotes: [],
        listeners: [],
      };
      mediaRooms.set(channelId, state);
    } else if (state.isPlaying && state.currentTrack) {
      const elapsed = Math.max(0, (Date.now() - state.updatedAt) / 1000);
      state.currentTime = (state.currentTime || 0) + elapsed;
      state.updatedAt = Date.now();
    }
    callback?.({ success: true, state });
  });

  socket.on('media:join-room', ({ channelId }: { channelId: string }) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return;

    let state = mediaRooms.get(channelId);
    if (!state) {
      state = {
        channelId,
        currentTrack: null,
        queue: [],
        isPlaying: false,
        currentTime: 0,
        updatedAt: Date.now(),
        skipVotes: [],
        listeners: [],
      };
      mediaRooms.set(channelId, state);
    } else if (state.isPlaying && state.currentTrack) {
      const elapsed = Math.max(0, (Date.now() - state.updatedAt) / 1000);
      state.currentTime = (state.currentTime || 0) + elapsed;
      state.updatedAt = Date.now();
    }

    if (!state.listeners.includes(session.userId)) {
      state.listeners.push(session.userId);
    }
    io.emit('media:state-updated', state);
  });

  socket.on('media:leave-room', ({ channelId }: { channelId: string }) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return;

    const state = mediaRooms.get(channelId);
    if (state) {
      state.listeners = state.listeners.filter((id) => id !== session.userId);
      state.skipVotes = state.skipVotes.filter((id) => id !== session.userId);

      // Se a contagem de ouvintes diminuiu, verifica se os votos existentes já batem 50% + 1
      if (state.currentTrack && state.listeners.length > 0) {
        const needed = Math.floor(state.listeners.length / 2) + 1;
        if (state.skipVotes.length >= needed) {
          state.currentTrack = state.queue.shift() || null;
          state.isPlaying = !!state.currentTrack;
          state.currentTime = 0;
          state.updatedAt = Date.now();
          state.skipVotes = [];
        }
      }
      io.emit('media:state-updated', state);
    }
  });

  socket.on('media:vote-skip', ({ channelId }: { channelId: string }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const user = db.users.find((u) => u.id === session.userId);
    if (!user) return callback?.({ success: false, error: 'Usuário não encontrado.' });

    const state = mediaRooms.get(channelId);
    if (!state || !state.currentTrack) {
      return callback?.({ success: false, error: 'Nenhuma música tocando no momento.' });
    }

    // Garante que o usuário está contado nos ouvintes
    if (!state.listeners.includes(user.id)) {
      state.listeners.push(user.id);
    }

    const userName = user.name || (user as any).displayName || 'Membro';
    const totalListeners = Math.max(1, state.listeners.length);
    // Regra da Votação: 50% + 1 das pessoas ouvindo/assistindo
    const neededVotes = Math.floor(totalListeners / 2) + 1;

    const alreadyVoted = state.skipVotes.includes(user.id);
    if (alreadyVoted) {
      state.skipVotes = state.skipVotes.filter((id) => id !== user.id);
    } else {
      state.skipVotes.push(user.id);
    }

    const currentVotes = state.skipVotes.length;
    const targetChannel = db.servers.flatMap((s) => s.channels).find((c) => c.id === channelId);
    const server = targetChannel ? db.servers.find((s) => s.id === targetChannel.serverId) : null;

    if (currentVotes >= neededVotes) {
      // 50% + 1 alcançado! Pula para a próxima música
      const skippedTrackTitle = state.currentTrack.title;
      state.currentTrack = state.queue.shift() || null;
      state.isPlaying = !!state.currentTrack;
      state.currentTime = 0;
      state.updatedAt = Date.now();
      state.skipVotes = [];

      if (server) {
        const sysMsg: DBMessage = {
          id: Math.random().toString(36).substring(2, 9),
          serverId: server.id,
          channelId,
          userId: 'system',
          userName: '🎵 Janjacord DJ',
          avatarColor: '#f59e0b',
          text: `⏭️ **Votação Aprovada (${currentVotes}/${neededVotes})!** A música "${skippedTrackTitle}" foi pulada pela maioria (50%+1).`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        db.messages.push(sysMsg);
        saveDB(db);

        for (const [sId, sSession] of onlineSessions.entries()) {
          if (server.members.includes(sSession.userId)) {
            io.to(sId).emit('chat:message', sysMsg);
          }
        }
      }
    } else {
      if (server) {
        const actionText = alreadyVoted ? 'retirou o voto para pular' : 'votou para pular a música';
        const sysMsg: DBMessage = {
          id: Math.random().toString(36).substring(2, 9),
          serverId: server.id,
          channelId,
          userId: 'system',
          userName: '🎵 Janjacord DJ',
          avatarColor: '#6366f1',
          text: `🗳️ **${userName}** ${actionText} (**${currentVotes}/${neededVotes}** votos necessários para 50%+1).`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        db.messages.push(sysMsg);
        saveDB(db);

        for (const [sId, sSession] of onlineSessions.entries()) {
          if (server.members.includes(sSession.userId)) {
            io.to(sId).emit('chat:message', sysMsg);
          }
        }
      }
    }

    io.emit('media:state-updated', state);
    callback?.({ success: true, state, voted: !alreadyVoted });
  });

  socket.on('media:play', async ({ channelId, url, inputUrl, title }: { channelId: string; url?: string; inputUrl?: string; title?: string }, callback) => {
    const session = onlineSessions.get(socket.id);
    if (!session) return callback?.({ success: false, error: 'Não autenticado.' });

    const db = loadDB();
    const user = db.users.find((u) => u.id === session.userId);
    if (!user) return callback?.({ success: false, error: 'Usuário não encontrado.' });

    const rawUrl = (url || inputUrl || '').trim();
    if (!rawUrl) {
      return callback?.({ success: false, error: 'Cole um link válido do YouTube.' });
    }

    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      return callback?.({ success: false, error: 'Link do YouTube não reconhecido. Ex: https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    }

    let state = mediaRooms.get(channelId);
    if (!state) {
      state = {
        channelId,
        currentTrack: null,
        queue: [],
        isPlaying: false,
        currentTime: 0,
        updatedAt: Date.now(),
        skipVotes: [],
        listeners: [],
      };
      mediaRooms.set(channelId, state);
    }

    // Tentar obter o título real do vídeo via oEmbed oficial do YouTube
    let videoTitle = title || `Vídeo do YouTube (${videoId})`;
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData: any = await oembedRes.json();
        if (oembedData?.title) {
          videoTitle = oembedData.title;
        }
      }
    } catch (e) {
      // Ignora erro de rede e usa fallback
    }

    const userName = user.name || (user as any).displayName || 'Membro';
    const trackItem: PlaylistItem = {
      id: Math.random().toString(36).substring(2, 9),
      url: rawUrl,
      videoId,
      title: videoTitle,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      addedBy: {
        id: user.id,
        name: userName,
        avatarColor: user.avatarColor || '#6366f1',
        avatarUrl: user.avatarUrl,
      },
    };

    // Se não tiver nada tocando, toca imediatamente
    if (!state.currentTrack) {
      state.currentTrack = trackItem;
      state.isPlaying = true;
      state.currentTime = 0;
      state.updatedAt = Date.now();
    } else {
      // Caso contrário, adiciona à fila de reprodução
      state.queue.push(trackItem);
    }

    // Transmite o novo estado para todos os usuários conectados no canal
    io.emit('media:state-updated', state);

    // Também envia uma mensagem no chat do canal avisando da adição
    const targetChannel = db.servers.flatMap((s) => s.channels).find((c) => c.id === channelId);
    if (targetChannel) {
      const server = db.servers.find((s) => s.id === targetChannel.serverId);
      if (server) {
        const sysMsg: DBMessage = {
          id: Math.random().toString(36).substring(2, 9),
          serverId: server.id,
          channelId,
          userId: 'system',
          userName: '🎵 Janjacord DJ',
          avatarColor: '#10b981',
          text: `▶️ **${userName}** adicionou: [${videoTitle}](https://youtu.be/${videoId})`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        db.messages.push(sysMsg);
        saveDB(db);

        for (const [sId, sSession] of onlineSessions.entries()) {
          if (server.members.includes(sSession.userId)) {
            io.to(sId).emit('chat:message', sysMsg);
          }
        }
      }
    }

    callback?.({ success: true, state });
  });

  socket.on('media:sync-action', ({ channelId, action, time }: { channelId: string; action: 'play' | 'pause' | 'skip' | 'seek'; time?: number }) => {
    // O userId enviado pelo cliente não é confiável: só vale o da sessão autenticada
    const session = onlineSessions.get(socket.id);
    const callerUserId = session?.userId;
    if (!callerUserId) return;

    const state = mediaRooms.get(channelId);
    if (!state || !state.currentTrack) return;

    const isTrackOwner = state.currentTrack.addedBy.id === callerUserId;
    const ownerOnlineInRoom = state.listeners.includes(state.currentTrack.addedBy.id);

    // Apenas a pessoa que adicionou o vídeo/música atual pode pausar, retomar ou avançar o tempo
    if ((action === 'play' || action === 'pause' || action === 'seek') && !isTrackOwner) {
      return;
    }

    if (action === 'play') {
      state.isPlaying = true;
      if (typeof time === 'number' && !isNaN(time) && (time > 0.5 || state.currentTime < 2)) {
        state.currentTime = Math.max(0, time);
      }
      state.updatedAt = Date.now();
      (state as any).actionSeq = Date.now();
    } else if (action === 'pause') {
      if (typeof time === 'number' && !isNaN(time) && (time > 0.5 || state.currentTime < 2)) {
        state.currentTime = Math.max(0, time);
      } else if (state.isPlaying) {
        const elapsed = Math.max(0, (Date.now() - state.updatedAt) / 1000);
        state.currentTime = (state.currentTime || 0) + elapsed;
      }
      state.isPlaying = false;
      state.updatedAt = Date.now();
      (state as any).actionSeq = Date.now();
    } else if (action === 'seek' && typeof time === 'number' && !isNaN(time)) {
      state.currentTime = Math.max(0, time);
      state.updatedAt = Date.now();
      (state as any).actionSeq = Date.now();
    } else if (action === 'skip') {
      // Skip automático ao fim do vídeo: aceita do dono da faixa (ou de qualquer ouvinte se o dono saiu da sala)
      if (!isTrackOwner && ownerOnlineInRoom) {
        return;
      }
      state.skipVotes = [];
      if (state.queue.length > 0) {
        state.currentTrack = state.queue.shift() || null;
        state.isPlaying = true;
        state.currentTime = 0;
        state.updatedAt = Date.now();
      } else {
        state.currentTrack = null;
        state.isPlaying = false;
        state.currentTime = 0;
        state.updatedAt = Date.now();
      }
      (state as any).actionSeq = Date.now();
    }

    io.emit('media:state-updated', state);
  });

  // Heartbeat contínuo enviado pelo dono do vídeo atual para manter o tempo e play/pause de todo mundo 100% sincronizado
  socket.on('media:heartbeat', ({ channelId, currentTime, isPlaying }: { channelId: string; currentTime: number; isPlaying: boolean }) => {
    const session = onlineSessions.get(socket.id);
    const callerUserId = session?.userId;
    if (!callerUserId) return;

    const state = mediaRooms.get(channelId);
    if (!state || !state.currentTrack) return;

    // Apenas o responsável por colocar o vídeo atual é a referência de tempo
    if (state.currentTrack.addedBy.id !== callerUserId) return;

    if (typeof currentTime !== 'number' || isNaN(currentTime)) return;
    // Evita zerar o tempo caso o YouTube reporte 0 durante buffering
    if (currentTime <= 0.5 && state.currentTime > 3) return;

    state.currentTime = Math.max(0, currentTime);
    if (typeof isPlaying === 'boolean') {
      state.isPlaying = isPlaying;
    }
    state.updatedAt = Date.now();

    // Envia para todos os espectadores exceto o próprio dono que enviou o heartbeat
    socket.broadcast.emit('media:state-updated', state);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Desconectado: ${socket.id}`);
    const session = onlineSessions.get(socket.id);
    if (session) {
      if (session.currentVoiceChannel) {
        socket.to(session.currentVoiceChannel).emit('voice:peer-left', { peerId: socket.id, socketId: socket.id });
      }

      // Remover usuário de ouvintes de salas de mídia
      for (const [, mState] of mediaRooms.entries()) {
        if (mState.listeners.includes(session.userId)) {
          mState.listeners = mState.listeners.filter((id) => id !== session.userId);
          mState.skipVotes = mState.skipVotes.filter((id) => id !== session.userId);
          if (mState.currentTrack && mState.listeners.length > 0) {
            const needed = Math.floor(mState.listeners.length / 2) + 1;
            if (mState.skipVotes.length >= needed) {
              mState.currentTrack = mState.queue.shift() || null;
              mState.isPlaying = !!mState.currentTrack;
              mState.currentTime = 0;
              mState.updatedAt = Date.now();
              mState.skipVotes = [];
            }
          }
          io.emit('media:state-updated', mState);
        }
      }
    }
    onlineSessions.delete(socket.id);
    broadcastOnlineList();
  });
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await initDatabase();
  } catch (e: any) {
    console.error('Falha na inicialização do banco Supabase:', e.message);
  }

  httpServer.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Janjacord Server rodando na porta ${PORT}`);
    console.log(`✨ Canais dinâmicos, DM calls e perfis ativos`);
    console.log(`=========================================`);
  });
}

startServer();

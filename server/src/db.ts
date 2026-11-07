import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DBUser {
  id: string;
  name: string; // ex: fulaninho
  tag: string;  // ex: 001 ou 4 dígitos
  password: string; // hash scrypt (formato scrypt$salt$hash); contas antigas migram no login
  sessionTokens?: string[]; // sha256 dos tokens de login automático
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
  username?: string;
  displayName?: string;
}

export interface DBChannel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice' | 'media';
}

export interface ServerRole {
  id: string;
  name: string;
  color: string;
  isAdmin?: boolean;
}

export interface DBServer {
  id: string;
  name: string;
  iconColor: string;
  iconUrl?: string;
  bannerUrl?: string;
  description?: string;
  ownerId: string;
  inviteCode: string;
  members: string[];
  channels: DBChannel[];
  roles?: ServerRole[];
  memberRoles?: Record<string, string[]>; // userId -> roleIds
  timeouts?: Record<string, number>; // userId -> timestamp expiry
}

export interface DBFriendship {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted';
  createdAt: string;
}

export interface DBAttachment {
  name: string;
  type: 'image' | 'file';
  url: string;
  size?: number;
}

export interface DBMessage {
  id: string;
  serverId: string;
  channelId: string;
  userId: string;
  userName: string;
  avatarColor: string;
  avatarUrl?: string;
  text: string;
  attachment?: DBAttachment;
  timestamp: string;
}

export interface DBServerInvite {
  serverId: string;
  serverName: string;
  iconColor: string;
  iconUrl?: string;
  inviteCode: string;
  inviterName: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface DBDMMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  attachment?: DBAttachment;
  serverInvite?: DBServerInvite;
  timestamp: string;
  createdAt: string;
}

export interface DatabaseSchema {
  users: DBUser[];
  servers: DBServer[];
  friendships: DBFriendship[];
  messages: DBMessage[];
  dmMessages: DBDMMessage[];
}

const DB_FILE = path.resolve(__dirname, '..', 'data', 'janjacord.db.json');

const INITIAL_DB: DatabaseSchema = {
  users: [],
  servers: [],
  friendships: [],
  messages: [],
  dmMessages: [],
};

// Configuração do Supabase PostgreSQL
const SUPABASE_DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres.qboxsieiqfnkvlracktc:3Kp34%2B_pxBBV%2Byb@aws-0-us-east-2.pooler.supabase.com:6543/postgres';

let pool: pg.Pool | null = null;
try {
  pool = new Pool({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => {
    console.error('[Supabase Pool Error]:', err.message);
  });
} catch (e) {
  console.warn('[Supabase] Falha ao instanciar Pool:', e);
}

// Cache local em memória para leitura ultrarrápida (latência zero no Socket.IO)
let memoryCache: DatabaseSchema | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;
// Só sincroniza com o Supabase depois de ter carregado os dados de lá com sucesso.
// Se o boot falhasse (timeout/cold start), o primeiro saveDB sobrescrevia a nuvem com o JSON local
// desatualizado do repositório, apagando contas, servidores e mensagens.
let remoteLoaded = false;
let remoteRetryTimer: NodeJS.Timeout | null = null;

function ensureDataDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DB, null, 2), 'utf-8');
  }
}

function loadLocalFile(): DatabaseSchema {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.dmMessages) parsed.dmMessages = [];
    return parsed as DatabaseSchema;
  } catch (err) {
    console.error('[DB Local] Erro ao carregar arquivo:', err);
    return INITIAL_DB;
  }
}

function saveLocalFile(data: DatabaseSchema): void {
  ensureDataDir();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB Local] Erro ao salvar arquivo:', err);
  }
}

// Inicializa a conexão com o Supabase e sincroniza no boot
export async function initDatabase(): Promise<void> {
  // Carrega inicialmente do disco como fallback rápido
  memoryCache = loadLocalFile();

  if (!pool) return;

  try {
    // Garante que a tabela existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS janjacord_store (
        id VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Busca dados do Supabase
    const res = await pool.query("SELECT data FROM janjacord_store WHERE id = 'main';");
    remoteLoaded = true;
    if (remoteRetryTimer) {
      clearTimeout(remoteRetryTimer);
      remoteRetryTimer = null;
    }
    if (res.rows.length > 0 && res.rows[0].data) {
      const remoteData = res.rows[0].data as DatabaseSchema;
      if (!remoteData.dmMessages) remoteData.dmMessages = [];
      memoryCache = remoteData;
      saveLocalFile(remoteData);
      console.log(`[Supabase DB] Carregado com sucesso! ${memoryCache.users.length} usuários, ${memoryCache.servers.length} servidores.`);
    } else {
      // Se a tabela estiver vazia na nuvem, faz o seed com os dados locais
      await pool.query(`
        INSERT INTO janjacord_store (id, data, updated_at)
        VALUES ('main', $1, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
      `, [JSON.stringify(memoryCache)]);
      console.log('[Supabase DB] Banco inicializado com os dados locais.');
    }
  } catch (err: any) {
    console.error('[Supabase DB] Erro de inicialização (usando fallback local, nova tentativa em 30s):', err.message);
    if (!remoteRetryTimer) {
      remoteRetryTimer = setTimeout(() => {
        remoteRetryTimer = null;
        initDatabase().catch(() => {});
      }, 30000);
    }
  }
}

// Leitura síncrona instantânea (retorna da memória)
export function loadDB(): DatabaseSchema {
  if (!memoryCache) {
    memoryCache = loadLocalFile();
  }
  return memoryCache;
}

// Grava imediatamente no cache de memória, salva localmente e sincroniza no Supabase
export function saveDB(data: DatabaseSchema): void {
  memoryCache = data;
  saveLocalFile(data);

  // Debounce para gravar no Supabase sem sobrecarregar a conexão
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    if (!pool || !remoteLoaded) return;
    try {
      await pool.query(`
        INSERT INTO janjacord_store (id, data, updated_at)
        VALUES ('main', $1, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
      `, [JSON.stringify(data)]);
    } catch (err: any) {
      console.error('[Supabase DB] Erro ao sincronizar dados na nuvem:', err.message);
    }
  }, 100);
}

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { DMChatArea } from './components/DMChatArea';
import { VoiceRoom } from './components/VoiceRoom';
import { MediaRoom } from './components/MediaRoom';
import { HomeView } from './components/HomeView';
import { LoginModal } from './components/LoginModal';
import { CreateServerModal } from './components/CreateServerModal';
import { CreateChannelModal } from './components/CreateChannelModal';
import { InviteModal } from './components/InviteModal';
import { UserSettingsModal } from './components/UserSettingsModal';
import { ServerSettingsModal } from './components/ServerSettingsModal';
import { UserProfileCard } from './components/UserProfileCard';
import { ServerMemberList } from './components/ServerMemberList';
import { ScreenShareModal } from './components/ScreenShareModal';
import { WebRTCManager } from './services/webrtc';
import { sounds } from './services/soundEffects';
import {
  Phone,
  PhoneOff,
  Plus,
  Download,
  X,
  Check,
  Monitor,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  APP_VERSION,
  DEFAULT_AUDIO_SETTINGS,
  type Channel,
  type Message,
  type DMMessage,
  type User,
  type ServerItem,
  type FriendItem,
  type OnlineUser,
  type StreamQualityPreset,
  type MessageAttachment,
  type ServerMemberInfo,
  type MediaRoomState,
  type AudioSettings,
  type SavedAuthData,
} from './types';

interface RemoteStreamItem {
  peerId: string;
  stream: MediaStream;
  isScreen: boolean;
  updatedAt?: number;
}

// Sempre aponta para o .exe da release mais recente (publicada pela GitHub Action)
const DESKTOP_APP_DOWNLOAD_URL =
  'https://github.com/ErickSantana10/jolt/releases/latest/download/Jolt-Windows.exe';
const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/ErickSantana10/jolt/releases/latest';
// A API pública do GitHub permite 60 consultas/hora por IP: checar a cada 15 min é seguro
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Botão quadrado do trilho lateral, com marcador amarelo quando ativo. */
const RailButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ active, onClick, title, children }) => (
  <div className="relative w-full flex justify-center shrink-0 group">
    <span
      className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-volt transition-all duration-200 ${
        active ? 'h-6 opacity-100' : 'h-2 opacity-0 group-hover:opacity-40'
      }`}
    />
    <button
      onClick={onClick}
      title={title}
      className={`w-11 h-11 rounded-xl overflow-hidden transition-all duration-200 cursor-pointer ${
        active ? 'ring-1 ring-volt/60 ring-offset-2 ring-offset-ink-950' : 'opacity-70 hover:opacity-100'
      }`}
    >
      {children}
    </button>
  </div>
);

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [allServerMembers, setAllServerMembers] = useState<ServerMemberInfo[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dmMessages, setDmMessages] = useState<DMMessage[]>([]);

  // Navigation
  const [currentServerId, setCurrentServerId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [activeDMFriend, setActiveDMFriend] = useState<FriendItem['friend'] | null>(null);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState<string | null>(null);
  const [dmVoiceTarget, setDmVoiceTarget] = useState<FriendItem['friend'] | null>(null);

  // View mode when in voice: 'stage' (voice/screen grid) or 'chat' (browsing text channel)
  const [voiceViewMode, setVoiceViewMode] = useState<'stage' | 'chat'>('stage');

  // Call states with sound
  const [callingFriend, setCallingFriend] = useState<FriendItem['friend'] | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ fromUser: User; channelId: string } | null>(null);

  // Audio / Stream state
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remoteSpeakingPeers, setRemoteSpeakingPeers] = useState<string[]>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [streamQuality, setStreamQuality] = useState<StreamQualityPreset>('balanced');
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamItem[]>([]);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => {
    try {
      const saved = localStorage.getItem('janjacord_audio_settings');
      if (saved) return { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_AUDIO_SETTINGS;
  });

  // Modals
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [savedLoginName, setSavedLoginName] = useState<string>('');
  const [savedLoginPassword, setSavedLoginPassword] = useState<string>('');
  const [savedRememberMe, setSavedRememberMe] = useState<boolean>(true);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState<boolean>(false);
  const autoReconnectCancelledRef = useRef<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState<'text' | 'voice' | 'media'>('text');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | ServerMemberInfo | null>(null);
  const [isScreenPickerOpen, setIsScreenPickerOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [latestGitHubVersion, setLatestGitHubVersion] = useState<string>(APP_VERSION);
  const [hasUpdateAvailable, setHasUpdateAvailable] = useState(false);
  const [latestDownloadUrl, setLatestDownloadUrl] = useState<string>(DESKTOP_APP_DOWNLOAD_URL);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatePercent, setUpdatePercent] = useState(0);
  const [updateTransferredMB, setUpdateTransferredMB] = useState('0.0');
  const [updateTotalMB, setUpdateTotalMB] = useState('0.0');
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Media Room State (Watch together / Music DJ)
  const [mediaRoomState, setMediaRoomState] = useState<MediaRoomState | null>(null);

  // Toast Notification customizada
  const [toast, setToast] = useState<{ text: string; type: 'error' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const isElectron = Boolean(window.electronAPI?.isElectron);

  const deduplicateOnlineUsers = (list: OnlineUser[]): OnlineUser[] => {
    const byId = new Map<string, OnlineUser>();
    for (const u of list || []) {
      const existing = byId.get(u.id);
      if (
        !existing ||
        (!existing.currentVoiceChannel && u.currentVoiceChannel) ||
        (!existing.isScreenSharing && u.isScreenSharing)
      ) {
        byId.set(u.id, u);
      }
    }
    return Array.from(byId.values());
  };

  const showToast = (text: string, type: 'error' | 'info' = 'error') => {
    setToast({ text, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const socketRef = useRef<Socket | null>(null);
  const rtcManagerRef = useRef<WebRTCManager | null>(null);
  const activeChannelRef = useRef<Channel | null>(null);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateProgress) return;
    const unsubscribe = window.electronAPI.onUpdateProgress((data) => {
      setUpdatePercent(data.percent);
      setUpdateTransferredMB(data.transferredMB);
      setUpdateTotalMB(data.totalMB);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const compareSemver = (remote: string, local: string): boolean => {
    const r = remote.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
    const l = local.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
      const rv = r[i] || 0;
      const lv = l[i] || 0;
      if (rv > lv) return true;
      if (rv < lv) return false;
    }
    return false;
  };

  /**
   * Consulta a última release publicada no GitHub (não o package.json do main): assim o app só
   * avisa de atualização quando o .exe novo já existe para download — antes, ao subir a versão no
   * main, o botão baixava o .exe antigo e ficava pedindo atualização em loop.
   */
  const fetchLatestRelease = async (): Promise<{ version: string; downloadUrl: string } | null> => {
    try {
      const res = await fetch(GITHUB_LATEST_RELEASE_API, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return null;
      const release = await res.json();
      const asset = (release?.assets || []).find((a: any) => a?.name === 'Jolt-Windows.exe');
      if (typeof release?.tag_name !== 'string' || !asset?.browser_download_url) return null;
      return { version: release.tag_name.replace(/^v/i, '').trim(), downloadUrl: asset.browser_download_url };
    } catch {
      return null;
    }
  };

  const handleInstallAppUpdate = async () => {
    setUpdateError(null);
    if (isElectron && window.electronAPI?.installUpdate) {
      setIsUpdating(true);
      setUpdatePercent(1);
      const res = await window.electronAPI.installUpdate(latestDownloadUrl);
      if (!res.success) {
        setIsUpdating(false);
        setUpdateError(res.error || 'Erro ao baixar atualização.');
      }
    } else {
      // No navegador web, recarrega limpando cache para puxar a versão mais recente
      window.location.reload();
    }
  };

  const handleCheckAndAutoUpdate = async () => {
    setUpdateError(null);
    setIsUpdateModalOpen(true);
    if (isUpdating) return;

    setIsCheckingUpdate(true);
    const latest = await fetchLatestRelease();
    setIsCheckingUpdate(false);
    if (!latest) {
      setUpdateError('Não foi possível consultar o GitHub agora. Tente novamente em alguns minutos.');
      return;
    }
    setLatestGitHubVersion(latest.version);
    setLatestDownloadUrl(latest.downloadUrl);
    const newer = compareSemver(latest.version, APP_VERSION);
    setHasUpdateAvailable(newer);

    // Se houver uma versão mais nova no GitHub, já inicia o download e substituição automática!
    if (newer) {
      await handleInstallAppUpdate();
    }
  };

  useEffect(() => {
    // Atualização automática só existe no app desktop; o site já recebe a versão nova a cada deploy
    if (!window.electronAPI?.isElectron) return;
    let mounted = true;
    const checkBg = async () => {
      const latest = await fetchLatestRelease();
      if (!mounted || !latest) return;
      setLatestGitHubVersion(latest.version);
      setLatestDownloadUrl(latest.downloadUrl);
      setHasUpdateAvailable(compareSemver(latest.version, APP_VERSION));
    };
    checkBg();
    const timer = window.setInterval(checkBg, UPDATE_CHECK_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const serverUrl =
      import.meta.env.VITE_SERVER_URL ||
      (window.location.hostname === 'localhost' ? 'http://localhost:3001' : 'https://janjacord.onrender.com');
    const socket = io(serverUrl);
    socketRef.current = socket;

    const rtc = new WebRTCManager(socket, audioSettings);
    rtcManagerRef.current = rtc;

    rtc.onSpeakingChange = (speaking) => {
      setIsSpeaking(speaking);
    };

    rtc.onRemoteSpeakingChange = (speakingPeerIds) => {
      setRemoteSpeakingPeers(speakingPeerIds);
    };

    rtc.onRemoteStream = (peerId, stream, isScreen) => {
      setRemoteStreams((prev) => {
        const filtered = prev.filter((item) => !(item.peerId === peerId && item.isScreen === isScreen));
        return [...filtered, { peerId, stream, isScreen, updatedAt: Date.now() }];
      });
      sounds.stopOutgoingRing();
      setCallingFriend(null);
    };

    rtc.onRemoteScreenRemoved = (peerId) => {
      setRemoteStreams((prev) => prev.filter((item) => !(item.peerId === peerId && item.isScreen)));
    };

    rtc.onPeerDisconnected = (peerId) => {
      setRemoteStreams((prev) => prev.filter((item) => item.peerId !== peerId));
    };

    rtc.onScreenShareEnded = () => {
      setIsScreenSharing(false);
      setLocalScreenStream(null);
      socket.emit('user:update-state', { isScreenSharing: false });
    };

    const applyAuthenticatedResponse = (res: { user: any; state: any }) => {
      const u: User = {
        ...res.user,
        name: res.user.name || res.user.displayName || res.user.username,
        tag: res.user.tag || '001',
      };
      setCurrentUser(u);
      setServers(res.state.servers || []);
      setAllServerMembers(res.state.allServerMembers || []);
      setMessages(res.state.messages || []);
      setDmMessages(res.state.dmMessages || []);
      setFriends(res.state.friends || []);
      setOnlineUsers(deduplicateOnlineUsers(res.state.onlineUsers || []));
      setIsAuthenticated(true);
      setIsAutoReconnecting(false);

      if (activeChannelRef.current?.type === 'media') {
        socket.emit('media:join-room', { channelId: activeChannelRef.current.id });
        socket.emit('media:get-state', { channelId: activeChannelRef.current.id }, (mRes: any) => {
          if (mRes?.success && mRes.state) {
            setMediaRoomState(mRes.state);
          }
        });
      }
    };

    const loadSavedAuth = async (): Promise<SavedAuthData | null> => {
      try {
        if (window.electronAPI?.getSavedAuth) {
          const diskAuth = await window.electronAPI.getSavedAuth();
          if (diskAuth && (diskAuth.userId || diskAuth.name)) {
            return diskAuth;
          }
        }
      } catch {}

      try {
        const raw = localStorage.getItem('jolt_saved_auth');
        if (raw) {
          return JSON.parse(raw);
        }
      } catch {}

      const legacyUserId = localStorage.getItem('janjacord_user_id');
      if (legacyUserId) {
        return { userId: legacyUserId, rememberMe: true, autoLogin: true };
      }
      return null;
    };

    const restoreSession = async () => {
      if (autoReconnectCancelledRef.current) return;
      const savedAuth = await loadSavedAuth();
      if (!savedAuth) return;

      if (savedAuth.name) setSavedLoginName(savedAuth.name);
      if (savedAuth.password) setSavedLoginPassword(savedAuth.password);
      if (savedAuth.rememberMe !== undefined) setSavedRememberMe(savedAuth.rememberMe);

      // Se o usuário clicou em Sair manualmente, deixa nome/senha preenchidos mas não força entrada automática
      if (savedAuth.autoLogin === false) {
        setIsAutoReconnecting(false);
        return;
      }

      const tryPasswordAutoLogin = () => {
        if (autoReconnectCancelledRef.current) {
          setIsAutoReconnecting(false);
          return;
        }
        if (savedAuth.name && savedAuth.password) {
          setIsAutoReconnecting(true);
          socket.emit(
            'auth:login',
            { name: savedAuth.name, password: savedAuth.password },
            async (loginRes: { success: boolean; user?: any; state?: any; sessionToken?: string }) => {
              if (loginRes.success && loginRes.user && loginRes.state) {
                const updatedAuth: SavedAuthData = {
                  ...savedAuth,
                  userId: loginRes.user.id,
                  sessionToken: loginRes.sessionToken,
                  autoLogin: true,
                };
                localStorage.setItem('janjacord_user_id', loginRes.user.id);
                localStorage.setItem('jolt_saved_auth', JSON.stringify(updatedAuth));
                await window.electronAPI?.saveAuth?.(updatedAuth);
                applyAuthenticatedResponse({ user: loginRes.user, state: loginRes.state });
              } else {
                setIsAutoReconnecting(false);
              }
            }
          );
        } else {
          setIsAutoReconnecting(false);
        }
      };

      if (savedAuth.userId) {
        setIsAutoReconnecting(true);
        socket.emit(
          'auth:session',
          // O servidor exige o token de sessão (só o userId permitia entrar na conta de qualquer um)
          { userId: savedAuth.userId, sessionToken: savedAuth.sessionToken },
          (res: { success: boolean; user?: any; state?: any }) => {
            if (res.success && res.user && res.state) {
              applyAuthenticatedResponse({ user: res.user, state: res.state });
            } else {
              // Se a sessão rápida por ID não encontrar ou tiver reiniciado, faz login automático com a senha salva!
              tryPasswordAutoLogin();
            }
          }
        );
      } else if (savedAuth.name && savedAuth.password) {
        tryPasswordAutoLogin();
      }
    };

    restoreSession();
    socket.on('connect', restoreSession);

    socket.on('online:list', (list: OnlineUser[]) => {
      setOnlineUsers(deduplicateOnlineUsers(list));
      // Remove apenas se o colega desconectou totalmente da sala de voz
      setRemoteStreams((prev) =>
        prev.filter((item) => {
          const peer = list.find((u) => u.socketId === item.peerId);
          if (!peer || !peer.currentVoiceChannel) return false;
          if (item.isScreen && !peer.isScreenSharing) {
            const hasLiveVideo = item.stream
              .getVideoTracks()
              .some((t) => t.readyState === 'live');
            return hasLiveVideo;
          }
          return true;
        })
      );
    });

    socket.on(
      'voice:peer-state-change',
      ({ peerId, socketId, updates }: { peerId?: string; socketId?: string; updates: any }) => {
        const targetId = socketId || peerId;
        if (targetId && updates && updates.isScreenSharing === false) {
          setRemoteStreams((prev) => prev.filter((item) => !(item.peerId === targetId && item.isScreen)));
        }
      }
    );

    socket.on('server:created', (newServer: ServerItem) => {
      setServers((prev) => [...prev.filter((s) => s.id !== newServer.id), newServer]);
      setCurrentServerId(newServer.id);
      setActiveDMFriend(null);
      const textChannel = newServer.channels.find((c) => c.type === 'text') || null;
      setActiveChannel(textChannel);
      setVoiceViewMode('chat');
    });

    socket.on('server:channel-created', ({ serverId, channel }: { serverId: string; channel: Channel }) => {
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? { ...s, channels: [...s.channels, channel] } : s))
      );
    });

    socket.on('server:joined', (joinedServer: ServerItem) => {
      setServers((prev) => [...prev.filter((s) => s.id !== joinedServer.id), joinedServer]);
    });

    socket.on('server:updated', (updatedServer: ServerItem) => {
      setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
    });

    socket.on('server:kicked', ({ serverId }: { serverId: string }) => {
      showToast('Você foi removido deste servidor.', 'error');
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      setCurrentServerId((prev) => (prev === serverId ? null : prev));
      setActiveChannel(null);
    });

    socket.on('server:left', ({ serverId }: { serverId: string }) => {
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      setCurrentServerId((prev) => (prev === serverId ? null : prev));
      setActiveChannel(null);
    });

    socket.on('server:deleted', ({ serverId }: { serverId: string }) => {
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      setCurrentServerId((prev) => (prev === serverId ? null : prev));
      setActiveChannel(null);
    });

    socket.on('chat:error', ({ message }: { message: string }) => {
      showToast(message, 'error');
    });

    socket.on('friend:list', (updatedFriends: FriendItem[]) => {
      setFriends(updatedFriends);
    });

    socket.on('chat:message', (newMessage: Message) => {
      setMessages((prev) => [...prev, newMessage]);
      sounds.playMessagePop();
    });

    socket.on('media:state-updated', (updatedState: MediaRoomState) => {
      if (activeChannelRef.current?.id === updatedState.channelId) {
        setMediaRoomState(updatedState);
      }
    });

    socket.on('dm:message', (newDM: DMMessage) => {
      setDmMessages((prev) => [...prev, newDM]);
      sounds.playMessagePop();
    });

    socket.on('dm:invite-updated', ({ messageId, status }: { messageId: string; status: 'accepted' | 'declined' }) => {
      setDmMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.serverInvite
            ? { ...m, serverInvite: { ...m.serverInvite, status } }
            : m
        )
      );
    });

    socket.on('dm:incoming-call', ({ fromUser, channelId }: { fromUser: User; channelId: string }) => {
      setIncomingCall({ fromUser, channelId });
      sounds.startIncomingRingtone();
    });

    socket.on('dm:call-ended', () => {
      setIncomingCall(null);
      sounds.stopIncomingRingtone();
      sounds.stopOutgoingRing();
      setCallingFriend(null);
    });

    socket.on('user:profile-updated', (updatedUser: any) => {
      const u: User = {
        ...updatedUser,
        name: updatedUser.name || updatedUser.displayName || updatedUser.username,
        tag: updatedUser.tag || '001',
      };
      setCurrentUser(u);
    });

    socket.on('voice:room-users', async ({ channelId, peers }: { channelId: string; peers: any[] }) => {
      setCurrentVoiceChannelId(channelId);
      setVoiceViewMode('stage');
      sounds.playJoinVoice();

      if (peers.length > 0) {
        sounds.stopOutgoingRing();
        setCallingFriend(null);
      }

      // Ao trocar de sala sem desconectar, encerra as conexões com quem ficou na sala anterior
      // (antes continuavam abertas e a tela seguia sendo enviada para a sala antiga).
      rtc.closePeersExcept(peers.map((p) => p?.socketId).filter(Boolean));

      try {
        await rtc.startMicrophone();
      } catch (err) {
        console.warn('Microfone não concedido:', err);
      }

      peers.forEach((peer) => {
        if (peer?.socketId) {
          rtc.connectToPeer(peer.socketId);
        }
      });
    });

    socket.on('voice:peer-joined', ({ peer }: { peer?: { socketId?: string } } = {}) => {
      sounds.stopOutgoingRing();
      sounds.playJoinVoice();
      setCallingFriend(null);
      if (peer?.socketId) {
        setTimeout(() => {
          rtc.connectToPeer(peer.socketId!);
        }, 350);
      }
    });

    return () => {
      sounds.stopIncomingRingtone();
      sounds.stopOutgoingRing();
      rtc.leaveAll();
      socket.disconnect();
    };
  }, []);

  // Auth Handlers
  const persistCredentials = async (
    userId: string,
    name: string,
    password: string,
    rememberMe: boolean,
    sessionToken?: string
  ) => {
    setSavedRememberMe(rememberMe);
    if (rememberMe) {
      setSavedLoginName(name);
      setSavedLoginPassword(password);
      const data: SavedAuthData = {
        userId,
        sessionToken,
        name,
        password,
        rememberMe: true,
        autoLogin: true,
      };
      localStorage.setItem('janjacord_user_id', userId);
      localStorage.setItem('jolt_saved_auth', JSON.stringify(data));
      try {
        await window.electronAPI?.saveAuth?.(data);
      } catch {}
    } else {
      setSavedLoginName('');
      setSavedLoginPassword('');
      localStorage.removeItem('janjacord_user_id');
      localStorage.removeItem('jolt_saved_auth');
      try {
        await window.electronAPI?.clearSavedAuth?.();
      } catch {}
    }
  };

  const handleLogin = (
    name: string,
    password: string,
    rememberMe: boolean,
    callback: (error?: string) => void
  ) => {
    autoReconnectCancelledRef.current = false;
    socketRef.current?.emit('auth:login', { name, password }, async (res: { success: boolean; error?: string; user?: any; state?: any; sessionToken?: string }) => {
      if (res.success && res.user && res.state) {
        await persistCredentials(res.user.id, name, password, rememberMe, res.sessionToken);
        const u: User = { ...res.user, name: res.user.name || res.user.displayName || res.user.username, tag: res.user.tag || '001' };
        setCurrentUser(u);
        setServers(res.state.servers || []);
        setAllServerMembers(res.state.allServerMembers || []);
        setMessages(res.state.messages || []);
        setDmMessages(res.state.dmMessages || []);
        setFriends(res.state.friends || []);
        setOnlineUsers(deduplicateOnlineUsers(res.state.onlineUsers || []));
        setIsAuthenticated(true);
        setIsAutoReconnecting(false);
        callback();
      } else {
        callback(res.error || 'Erro ao entrar na conta.');
      }
    });
  };

  const handleRegister = (
    name: string,
    password: string,
    avatarColor: string,
    rememberMe: boolean,
    callback: (error?: string) => void
  ) => {
    autoReconnectCancelledRef.current = false;
    socketRef.current?.emit(
      'auth:register',
      { name, password, avatarColor },
      async (res: { success: boolean; error?: string; user?: any; state?: any; sessionToken?: string }) => {
        if (res.success && res.user && res.state) {
          await persistCredentials(res.user.id, name, password, rememberMe, res.sessionToken);
          const u: User = { ...res.user, name: res.user.name || res.user.displayName || res.user.username, tag: res.user.tag || '001' };
          setCurrentUser(u);
          setServers(res.state.servers || []);
          setAllServerMembers(res.state.allServerMembers || []);
          setMessages(res.state.messages || []);
          setDmMessages(res.state.dmMessages || []);
          setFriends(res.state.friends || []);
          setOnlineUsers(deduplicateOnlineUsers(res.state.onlineUsers || []));
          setIsAuthenticated(true);
          setIsAutoReconnecting(false);
          callback();
        } else {
          callback(res.error || 'Erro ao criar conta.');
        }
      }
    );
  };

  const handleLogout = async () => {
    autoReconnectCancelledRef.current = true;
    setIsAutoReconnecting(false);
    localStorage.removeItem('janjacord_user_id');
    try {
      const raw = localStorage.getItem('jolt_saved_auth');
      if (raw) {
        const parsed: SavedAuthData = JSON.parse(raw);
        // Revoga o token no servidor para que ele não possa mais ser usado
        if (parsed.userId && parsed.sessionToken) {
          socketRef.current?.emit('auth:logout', { userId: parsed.userId, sessionToken: parsed.sessionToken });
        }
        const updated: SavedAuthData = { ...parsed, userId: undefined, sessionToken: undefined, autoLogin: false };
        localStorage.setItem('jolt_saved_auth', JSON.stringify(updated));
        await window.electronAPI?.saveAuth?.(updated);
      } else if (window.electronAPI?.getSavedAuth) {
        const disk = await window.electronAPI.getSavedAuth();
        if (disk) {
          if (disk.userId && disk.sessionToken) {
            socketRef.current?.emit('auth:logout', { userId: disk.userId, sessionToken: disk.sessionToken });
          }
          await window.electronAPI.saveAuth?.({ ...disk, userId: undefined, sessionToken: undefined, autoLogin: false });
        }
      }
    } catch {}
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentServerId(null);
    setActiveChannel(null);
    setActiveDMFriend(null);
    setDmVoiceTarget(null);
    handleCancelOutgoingCall();
    handleLeaveVoice();
  };

  const handleSaveProfile = (updates: { name: string; avatarColor: string; avatarUrl?: string; bio?: string }) => {
    socketRef.current?.emit('user:update-profile', updates, (res: { success: boolean; error?: string; user?: any }) => {
      if (res?.success && res.user) {
        const u: User = { ...res.user, name: res.user.name || res.user.displayName || res.user.username, tag: res.user.tag || '001' };
        setCurrentUser(u);
      } else if (res?.error) {
        showToast(res.error, 'error');
      }
    });
  };

  const handleUpdateAudioSettings = (newSettings: AudioSettings) => {
    setAudioSettings(newSettings);
    try {
      localStorage.setItem('janjacord_audio_settings', JSON.stringify(newSettings));
    } catch {}
    rtcManagerRef.current?.updateAudioSettings(newSettings);
  };

  const currentServer = servers.find((s) => s.id === currentServerId) || null;

  const getServerInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const handleSelectHome = () => {
    setCurrentServerId(null);
    setActiveDMFriend(null);
    if (!currentVoiceChannelId) setVoiceViewMode('chat');
  };

  const handleSelectDM = (friend: FriendItem['friend']) => {
    setCurrentServerId(null);
    setActiveDMFriend(friend);
    setVoiceViewMode('chat');
  };

  const handleSelectServer = (server: ServerItem) => {
    setCurrentServerId(server.id);
    setActiveDMFriend(null);
    const defaultTextChannel = server.channels.find((c) => c.type === 'text') || null;
    setActiveChannel(defaultTextChannel);
    setVoiceViewMode('chat');
  };

  const handleSelectChannel = (channel: Channel) => {
    setActiveChannel(channel);
    setVoiceViewMode('chat');
    if (channel.type === 'media') {
      socketRef.current?.emit('media:get-state', { channelId: channel.id }, (res: any) => {
        if (res?.success && res.state) {
          setMediaRoomState(res.state);
        }
      });
    }
  };

  const handleViewVoiceRoom = () => {
    setVoiceViewMode('stage');
  };

  const handleCreateServer = (
    name: string,
    iconColor: string,
    callback?: (error?: string) => void,
    extra?: { iconUrl?: string; description?: string }
  ) => {
    socketRef.current?.emit(
      'server:create',
      { name, iconColor, iconUrl: extra?.iconUrl, description: extra?.description },
      (res: { success: boolean; error?: string; server?: ServerItem }) => {
        if (res.success && res.server) {
          callback?.();
        } else {
          callback?.(res.error || 'Erro ao criar servidor.');
        }
      }
    );
  };

  const handleCreateChannel = (name: string, type: 'text' | 'voice' | 'media') => {
    if (!currentServer) return;
    socketRef.current?.emit('channel:create', { serverId: currentServer.id, name, type }, (res: { success: boolean; channel?: Channel }) => {
      if (res.success && res.channel && (type === 'text' || type === 'media')) {
        setActiveChannel(res.channel);
        setVoiceViewMode('chat');
        if (type === 'media') {
          socketRef.current?.emit('media:get-state', { channelId: res.channel.id }, (r: any) => {
            if (r?.success && r.state) {
              setMediaRoomState(r.state);
            }
          });
        }
      }
    });
  };

  const handleUpdateServerSettings = (
    name: string,
    iconColor: string,
    extra?: { iconUrl?: string; bannerUrl?: string; description?: string }
  ) => {
    if (!currentServer) return;
    socketRef.current?.emit(
      'server:update-settings',
      {
        serverId: currentServer.id,
        name,
        iconColor,
        iconUrl: extra?.iconUrl,
        bannerUrl: extra?.bannerUrl,
        description: extra?.description,
      },
      (res: any) => {
        if (res?.error) showToast(res.error, 'error');
      }
    );
  };

  const handleCreateRole = (name: string, color: string, isAdmin: boolean) => {
    if (!currentServer) return;
    socketRef.current?.emit('server:create-role', { serverId: currentServer.id, name, color, isAdmin }, (res: any) => {
      if (res?.error) showToast(res.error, 'error');
    });
  };

  const handleDeleteRole = (roleId: string) => {
    if (!currentServer) return;
    socketRef.current?.emit('server:delete-role', { serverId: currentServer.id, roleId }, (res: any) => {
      if (res?.error) showToast(res.error, 'error');
    });
  };

  const handleAssignRole = (targetUserId: string, roleId: string) => {
    if (!currentServer) return;
    socketRef.current?.emit('server:assign-role', { serverId: currentServer.id, targetUserId, roleId }, (res: any) => {
      if (res?.error) showToast(res.error, 'error');
    });
  };

  const handleTimeoutMember = (targetUserId: string, durationMinutes: number) => {
    if (!currentServer) return;
    socketRef.current?.emit('server:timeout-member', { serverId: currentServer.id, targetUserId, durationMinutes }, (res: any) => {
      if (res?.error) showToast(res.error, 'error');
    });
  };

  const handleKickMember = (targetUserId: string) => {
    if (!currentServer) return;
    socketRef.current?.emit('server:kick-member', { serverId: currentServer.id, targetUserId }, (res: any) => {
      if (res?.error) showToast(res.error, 'error');
    });
  };

  const handleLeaveServer = (serverId: string) => {
    socketRef.current?.emit('server:leave', { serverId }, (res: any) => {
      if (res?.error) showToast(res.error, 'error');
    });
  };

  const handleDeleteServer = (serverId: string) => {
    socketRef.current?.emit('server:delete', { serverId }, (res: any) => {
      if (res?.error) showToast(res.error, 'error');
    });
  };

  useEffect(() => {
    if (activeChannel?.type === 'media') {
      socketRef.current?.emit('media:join-room', { channelId: activeChannel.id });
      return () => {
        socketRef.current?.emit('media:leave-room', { channelId: activeChannel.id });
      };
    }
  }, [activeChannel?.id, activeChannel?.type]);

  const handlePlayMedia = (url: string, title?: string) => {
    if (!activeChannel) return;
    socketRef.current?.emit('media:play', { channelId: activeChannel.id, url, inputUrl: url, title }, (res: any) => {
      if (res?.error) {
        showToast(res.error, 'error');
      }
    });
  };

  const handleMediaSyncAction = (action: 'play' | 'pause' | 'skip' | 'seek', time?: number) => {
    if (!activeChannel) return;
    socketRef.current?.emit('media:sync-action', {
      channelId: activeChannel.id,
      action,
      time,
      userId: currentUser?.id,
    });
  };

  const handleMediaHeartbeat = (currentTime: number, isPlaying: boolean) => {
    if (!activeChannel) return;
    socketRef.current?.emit('media:heartbeat', {
      channelId: activeChannel.id,
      currentTime,
      isPlaying,
      userId: currentUser?.id,
    });
  };

  const handleVoteSkip = () => {
    if (!activeChannel) return;
    socketRef.current?.emit('media:vote-skip', { channelId: activeChannel.id }, (res: any) => {
      if (res?.error) {
        showToast(res.error, 'error');
      }
    });
  };

  const handleJoinByInvite = (inviteCode: string, callback?: (error?: string) => void) => {
    socketRef.current?.emit('server:join-by-invite', { inviteCode }, (res: { success: boolean; error?: string; server?: ServerItem }) => {
      if (res.success && res.server) {
        setCurrentServerId(res.server.id);
        setActiveDMFriend(null);
        const textChannel = res.server.channels.find((c) => c.type === 'text') || null;
        setActiveChannel(textChannel);
        setVoiceViewMode('chat');
        callback?.();
      } else {
        callback?.(res.error || 'Código de convite inválido.');
      }
    });
  };

  const handleInviteFriend = (serverId: string, friendUserId: string) => {
    socketRef.current?.emit('server:invite-friend', { serverId, friendUserId }, (res: any) => {
      if (res?.error) {
        showToast(res.error, 'error');
      }
    });
  };

  const handleRespondServerInvite = (messageId: string, action: 'accept' | 'decline') => {
    socketRef.current?.emit('server:respond-invite', { messageId, action }, (res: any) => {
      if (res?.error) {
        showToast(res.error, 'error');
      } else if (res?.server && action === 'accept') {
        setCurrentServerId(res.server.id);
        setActiveDMFriend(null);
        const textChannel = res.server.channels.find((c: any) => c.type === 'text') || null;
        setActiveChannel(textChannel);
        setVoiceViewMode('chat');
      }
    });
  };

  const handleSendFriendRequest = (
    targetIdentifier: string,
    callback: (res: { success: boolean; message?: string; error?: string }) => void
  ) => {
    socketRef.current?.emit('friend:request', { targetIdentifier }, callback);
  };

  const handleAcceptFriend = (friendshipId: string) => {
    socketRef.current?.emit('friend:accept', { friendshipId });
  };

  const handleRemoveFriend = (friendshipId: string) => {
    socketRef.current?.emit('friend:remove', { friendshipId });
    if (activeDMFriend) {
      const removed = friends.find((f) => f.friendshipId === friendshipId);
      if (removed && removed.friend.id === activeDMFriend.id) {
        setActiveDMFriend(null);
      }
    }
  };

  const handleSendDM = (text: string, attachment?: MessageAttachment) => {
    const recipientId = activeDMFriend ? activeDMFriend.id : dmVoiceTarget ? dmVoiceTarget.id : null;
    if (!recipientId) return;
    socketRef.current?.emit('dm:send', { toUserId: recipientId, text, attachment });
  };

  const handleSendMessage = (text: string, attachment?: MessageAttachment) => {
    if (!currentServer || !activeChannel) return;
    socketRef.current?.emit('chat:send', {
      serverId: currentServer.id,
      channelId: activeChannel.id,
      text,
      attachment,
    });
  };

  const handleStartDMCall = (friend: FriendItem['friend']) => {
    if (!currentUser) return;
    const channelId = `dm-call-${[currentUser.id, friend.id].sort().join('-')}`;
    setDmVoiceTarget(friend);
    setCallingFriend(friend);
    setVoiceViewMode('stage');

    sounds.startOutgoingRing();

    socketRef.current?.emit('dm:call-start', { toUserId: friend.id, channelId });
    socketRef.current?.emit('voice:join', { channelId });
  };

  const handleCancelOutgoingCall = () => {
    sounds.stopOutgoingRing();
    if (callingFriend) {
      socketRef.current?.emit('dm:call-end', { toUserId: callingFriend.id });
      setCallingFriend(null);
    }
    handleLeaveVoice();
  };

  const handleAnswerCall = () => {
    if (!incomingCall) return;
    sounds.stopIncomingRingtone();

    const friend = friends.find((f) => f.friend.id === incomingCall.fromUser.id)?.friend;
    if (friend) setDmVoiceTarget(friend);
    setVoiceViewMode('stage');

    socketRef.current?.emit('voice:join', { channelId: incomingCall.channelId });
    setIncomingCall(null);
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    sounds.stopIncomingRingtone();

    socketRef.current?.emit('dm:call-end', { toUserId: incomingCall.fromUser.id });
    setIncomingCall(null);
  };

  const handleJoinVoice = (channelId: string, serverId: string) => {
    if (currentVoiceChannelId === channelId) {
      setVoiceViewMode('stage');
      return;
    }
    setDmVoiceTarget(null);
    setVoiceViewMode('stage');
    socketRef.current?.emit('voice:join', { channelId, serverId });
  };

  const handleLeaveVoice = () => {
    sounds.playLeaveVoice();
    sounds.stopIncomingRingtone();
    sounds.stopOutgoingRing();
    setCallingFriend(null);

    if (dmVoiceTarget) {
      socketRef.current?.emit('dm:call-end', { toUserId: dmVoiceTarget.id });
    }

    rtcManagerRef.current?.leaveAll();
    socketRef.current?.emit('voice:leave');
    setCurrentVoiceChannelId(null);
    setDmVoiceTarget(null);
    setIsScreenSharing(false);
    setLocalScreenStream(null);
    setRemoteStreams([]);
  };

  const handleToggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    rtcManagerRef.current?.setMicrophoneMuted(nextState);
    socketRef.current?.emit('user:update-state', { isMuted: nextState });
  };

  const handleToggleDeafen = () => {
    const nextState = !isDeafened;
    setIsDeafened(nextState);
    if (!isMuted && nextState) {
      handleToggleMute();
    }
    socketRef.current?.emit('user:update-state', { isDeafened: nextState });
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      rtcManagerRef.current?.stopScreenShare();
      setIsScreenSharing(false);
      setLocalScreenStream(null);
      socketRef.current?.emit('user:update-state', { isScreenSharing: false });
    } else {
      if (window.electronAPI?.isElectron) {
        // No app desktop Electron, abre o seletor customizado de Telas / Jogos com áudio nativo!
        setIsScreenPickerOpen(true);
      } else {
        try {
          const stream = await rtcManagerRef.current?.startScreenShare(streamQuality);
          if (stream) {
            setIsScreenSharing(true);
            setLocalScreenStream(stream);
            socketRef.current?.emit('user:update-state', {
              isScreenSharing: true,
              streamQuality,
            });
            if (stream.getAudioTracks().length === 0) {
              showToast(
                'Transmissão iniciada sem áudio. No navegador, escolha "Tela Cheia" ou "Guia" e marque "Compartilhar áudio do sistema".',
                'info'
              );
            }
          }
        } catch (e) {
          console.warn('Compartilhamento cancelado:', e);
        }
      }
    }
  };

  const handleConfirmElectronScreenShare = async (
    sourceId: string,
    chosenQuality: StreamQualityPreset,
    shareAudio: boolean
  ) => {
    setIsScreenPickerOpen(false);
    setStreamQuality(chosenQuality);
    try {
      const stream = await rtcManagerRef.current?.startScreenShare(chosenQuality, sourceId, shareAudio);
      if (stream) {
        setIsScreenSharing(true);
        setLocalScreenStream(stream);
        socketRef.current?.emit('user:update-state', {
          isScreenSharing: true,
          streamQuality: chosenQuality,
        });
      }
    } catch (e) {
      console.error('Erro ao iniciar transmissão no Electron:', e);
      showToast('Não foi possível iniciar a captura desta janela/tela.', 'error');
    }
  };

  const handleChangeQuality = (preset: StreamQualityPreset) => {
    setStreamQuality(preset);
    rtcManagerRef.current?.updateScreenQuality(preset);
    socketRef.current?.emit('user:update-state', { streamQuality: preset });
  };

  let activeVoiceChannel: Channel | null = null;
  if (currentVoiceChannelId) {
    if (currentVoiceChannelId.startsWith('dm-call-')) {
      activeVoiceChannel = {
        id: currentVoiceChannelId,
        serverId: '',
        name: `📞 Chamada com ${dmVoiceTarget?.displayName || 'Amigo'}`,
        type: 'voice',
      };
    } else {
      for (const server of servers) {
        const found = server.channels.find((c) => c.id === currentVoiceChannelId);
        if (found) {
          activeVoiceChannel = found;
          break;
        }
      }
    }
  }

  const usersInVoiceRoom = onlineUsers.filter((u) => u.currentVoiceChannel === currentVoiceChannelId);
  const isAtHome = currentServer === null;

  return (
    <div className="flex h-screen w-screen bg-ink-950 text-zinc-100 overflow-hidden font-sans">
      {/* 1. Login/Register Modal */}
      {!isAuthenticated && (
        <LoginModal
          onLogin={handleLogin}
          onRegister={handleRegister}
          initialName={savedLoginName}
          initialPassword={savedLoginPassword}
          initialRememberMe={savedRememberMe}
          isAutoReconnecting={isAutoReconnecting}
          onCancelAutoReconnect={() => {
            autoReconnectCancelledRef.current = true;
            setIsAutoReconnecting(false);
          }}
          downloadUrl={DESKTOP_APP_DOWNLOAD_URL}
        />
      )}

      {/* Toast Notification Customizada */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] bg-ink-700 border border-white/[0.07] rounded-xl px-4 py-3 shadow-2xl shadow-black/70 flex items-center gap-3 animate-in fade-in duration-150 select-none">
          <span
            className={`w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ${
              toast.type === 'error' ? 'bg-rose-500' : 'bg-volt text-ink-950'
            }`}
          />
          <span className="text-xs font-bold text-white">{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            className="text-xs text-zinc-400 hover:text-white font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Outgoing Call Animated Overlay */}
      {callingFriend && (
        <div className="fixed inset-0 z-50 bg-ink-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 space-y-8 select-none">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-44 h-44 rounded-full bg-white/[0.08] animate-ping" />
            <div className="absolute w-36 h-36 rounded-full bg-white/[0.08] animate-pulse" />

            {callingFriend.avatarUrl ? (
              <img
                src={callingFriend.avatarUrl}
                alt={callingFriend.displayName}
                className="w-28 h-28 rounded-full object-cover shadow-2xl relative border-4 border-volt/40 z-10"
              />
            ) : (
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center font-bold text-white text-4xl shadow-2xl relative border-4 border-volt/40 z-10"
                style={{ backgroundColor: callingFriend.avatarColor }}
              >
                {callingFriend.displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="text-center space-y-1.5 z-10">
            <div className="text-xs uppercase tracking-widest text-zinc-400 font-bold flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-volt text-ink-950 animate-ping" />
              Chamando...
            </div>
            <h3 className="text-2xl font-bold text-white">{callingFriend.displayName}</h3>
            <p className="text-xs text-zinc-500 font-mono">#{callingFriend.tag || '001'}</p>
          </div>

          <button
            onClick={handleCancelOutgoingCall}
            className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-xl flex items-center gap-2.5 font-bold text-sm transition cursor-pointer z-10"
          >
            <PhoneOff className="w-5 h-5" />
            <span>Cancelar Chamada</span>
          </button>
        </div>
      )}

      {/* 3. Incoming Call Ringing Banner */}
      {incomingCall && (
        <div className="fixed top-6 right-6 z-50 bg-ink-700 border-2 border-volt/40 rounded-2xl p-4 shadow-2xl flex items-center gap-4 animate-bounce">
          <div className="relative">
            {incomingCall.fromUser.avatarUrl ? (
              <img
                src={incomingCall.fromUser.avatarUrl}
                alt={incomingCall.fromUser.displayName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-base"
                style={{ backgroundColor: incomingCall.fromUser.avatarColor }}
              >
                {incomingCall.fromUser.displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-ink-700 flex items-center justify-center animate-ping" />
          </div>

          <div>
            <div className="text-xs text-zinc-400 font-bold">Chamada recebida...</div>
            <div className="text-sm font-semibold text-white">{incomingCall.fromUser.displayName}</div>
            <div className="text-[11px] text-zinc-500 font-mono">#{incomingCall.fromUser.tag || '001'}</div>
          </div>

          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={handleAnswerCall}
              className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg transition cursor-pointer"
              title="Atender Chamada"
            >
              <Phone className="w-5 h-5" />
            </button>
            <button
              onClick={handleDeclineCall}
              className="p-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-lg transition cursor-pointer"
              title="Recusar"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 4. TRILHO DE NAVEGAÇÃO (design Volt): Início, servidores, criar e atualizar */}
      <nav className="w-[68px] shrink-0 flex flex-col items-center py-3 gap-2 select-none">
        <RailButton active={isAtHome} onClick={handleSelectHome} title="Início — amigos e mensagens">
          <img src="/logo.jpg" alt="Jolt" className="w-full h-full object-cover" />
        </RailButton>

        <div className="w-6 h-px bg-white/[0.08] my-1 shrink-0" />

        <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto no-scrollbar py-0.5">
          {servers.map((server) => (
            <RailButton
              key={server.id}
              active={currentServer?.id === server.id}
              onClick={() => handleSelectServer(server)}
              title={server.name}
            >
              {server.iconUrl ? (
                <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover" />
              ) : (
                <span
                  className="w-full h-full flex items-center justify-center text-[13px] font-semibold text-white"
                  style={{ backgroundColor: server.iconColor }}
                >
                  {getServerInitials(server.name)}
                </span>
              )}
            </RailButton>
          ))}

          <button
            onClick={() => setIsCreateServerOpen(true)}
            className="w-11 h-11 shrink-0 rounded-xl border border-dashed border-white/[0.12] text-zinc-500 hover:text-volt hover:border-volt/50 hover:bg-volt/[0.06] flex items-center justify-center transition cursor-pointer"
            title="Criar ou entrar em um servidor"
          >
            <Plus className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Atualizar App — só no desktop. Com versão nova: faixa verde passando + selo "novo" */}
        {isElectron && (
          <button
            onClick={handleCheckAndAutoUpdate}
            className={`relative w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center transition cursor-pointer ${
              hasUpdateAvailable
                ? 'jolt-update-shimmer bg-emerald-500/10 border-emerald-400/50 text-emerald-300'
                : 'border-white/[0.06] text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.05]'
            }`}
            title={
              isUpdating
                ? `Atualizando ${updatePercent}%`
                : hasUpdateAvailable
                ? `Nova versão v${latestGitHubVersion} disponível — clique para atualizar`
                : `Jolt v${APP_VERSION} — verificar atualizações`
            }
          >
            <RefreshCw className={`w-[18px] h-[18px] ${isUpdating || isCheckingUpdate ? 'animate-spin' : ''}`} />
            {hasUpdateAvailable && !isUpdating && (
              <span className="absolute -top-1.5 -right-1.5 px-1 rounded-md bg-emerald-400 text-ink-950 text-[9px] font-bold leading-[14px]">
                novo
              </span>
            )}
          </button>
        )}

        {/* Baixar App — só no site */}
        {!isElectron && (
          <button
            onClick={() => setIsDownloadModalOpen(true)}
            className="w-11 h-11 shrink-0 rounded-xl bg-volt text-ink-950 hover:brightness-110 flex items-center justify-center transition cursor-pointer"
            title="Baixar o Jolt para Windows"
          >
            <Download className="w-[18px] h-[18px]" />
          </button>
        )}
      </nav>

      {/* 5. ÁREA DE TRABALHO: sidebar + palco */}
      <div className="flex-1 flex gap-2 py-2 pr-2 overflow-hidden min-h-0 min-w-0">
        {/* Left Context Panel */}
        <Sidebar
          currentUser={currentUser}
          servers={servers}
          currentServer={currentServer}
          activeChannel={activeChannel}
          currentVoiceChannelId={currentVoiceChannelId}
          activeDMFriendId={activeDMFriend?.id || null}
          friends={friends}
          onlineUsers={onlineUsers}
          isMuted={isMuted}
          isDeafened={isDeafened}
          isSpeaking={isSpeaking}
          remoteSpeakingPeers={remoteSpeakingPeers}
          onSelectHome={handleSelectHome}
          onSelectDM={handleSelectDM}
          onSelectServer={handleSelectServer}
          onOpenCreateServer={() => setIsCreateServerOpen(true)}
          onOpenCreateChannel={(type) => {
            setCreateChannelType(type);
            setIsCreateChannelOpen(true);
          }}
          onOpenInviteModal={() => setIsInviteModalOpen(true)}
          onOpenServerSettings={() => setIsServerSettingsOpen(true)}
          onLeaveServer={handleLeaveServer}
          onSelectChannel={handleSelectChannel}
          onJoinVoice={handleJoinVoice}
          onViewVoiceRoom={handleViewVoiceRoom}
          onLeaveVoice={handleLeaveVoice}
          onToggleMute={handleToggleMute}
          onToggleDeafen={handleToggleDeafen}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={handleToggleScreenShare}
          voiceChannelName={activeVoiceChannel?.name || null}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLogout={handleLogout}
        />

        {/* Palco principal */}
        <main className="flex-1 bg-ink-900 border border-white/[0.06] rounded-2xl flex overflow-hidden min-w-0">
          {currentVoiceChannelId && activeVoiceChannel && (
            <div
              className={
                voiceViewMode === 'stage'
                  ? 'flex-1 flex overflow-hidden min-w-0'
                  : 'hidden'
              }
            >
              <VoiceRoom
                channel={activeVoiceChannel}
                currentUser={currentUser}
                usersInRoom={usersInVoiceRoom}
                isMuted={isMuted}
                isDeafened={isDeafened}
                isSpeaking={isSpeaking}
                remoteSpeakingPeers={remoteSpeakingPeers}
                isScreenSharing={isScreenSharing}
                streamQuality={streamQuality}
                localScreenStream={localScreenStream}
                remoteStreams={remoteStreams}
                audioSettings={audioSettings}
                isDMCall={!!dmVoiceTarget}
                targetDMFriend={dmVoiceTarget}
                dmMessages={dmMessages}
                channelMessages={activeChannel ? messages.filter((m) => m.channelId === activeChannel.id) : []}
                onSendMessage={(text, attachment) => {
                  if (dmVoiceTarget) {
                    handleSendDM(text, attachment);
                  } else if (currentServer && activeChannel) {
                    handleSendMessage(text, attachment);
                  }
                }}
                onToggleMute={handleToggleMute}
                onToggleDeafen={handleToggleDeafen}
                onToggleScreenShare={handleToggleScreenShare}
                onLeaveVoice={handleLeaveVoice}
                onChangeQuality={handleChangeQuality}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </div>
          )}
          {!(currentVoiceChannelId && activeVoiceChannel && voiceViewMode === 'stage') && (
            currentServer && activeChannel?.type === 'media' ? (
            <MediaRoom
              channel={activeChannel}
              currentUser={currentUser}
              mediaState={mediaRoomState}
              messages={messages.filter((m) => m.serverId === currentServer.id)}
              onSendMessage={handleSendMessage}
              onPlayMedia={handlePlayMedia}
              onSyncAction={handleMediaSyncAction}
              onHeartbeat={handleMediaHeartbeat}
              onVoteSkip={handleVoteSkip}
              onSelectUser={(u) => setSelectedProfileUser(u)}
            />
          ) : currentServer && activeChannel ? (
            <ChatArea
              channel={activeChannel}
              currentUser={currentUser}
              messages={messages.filter((m) => m.serverId === currentServer.id)}
              onSendMessage={handleSendMessage}
              onSelectUser={(u) => setSelectedProfileUser(u)}
            />
          ) : activeDMFriend ? (
            <DMChatArea
              currentUser={currentUser}
              targetFriend={activeDMFriend}
              messages={dmMessages}
              onSendMessage={handleSendDM}
              onStartCall={handleStartDMCall}
              onRespondServerInvite={handleRespondServerInvite}
            />
          ) : (
            <HomeView
              currentUser={currentUser}
              onlineUsers={onlineUsers}
              servers={servers}
              friends={friends}
              onOpenCreateServer={() => setIsCreateServerOpen(true)}
              onSelectServer={handleSelectServer}
              onJoinVoice={handleJoinVoice}
              onSendFriendRequest={handleSendFriendRequest}
              onAcceptFriend={handleAcceptFriend}
              onRemoveFriend={handleRemoveFriend}
              downloadUrl={DESKTOP_APP_DOWNLOAD_URL}
            />
          ))}

          {/* Server Members Sidebar */}
          {currentServer && activeChannel?.type !== 'media' && !(currentVoiceChannelId && voiceViewMode === 'stage') && (
            <ServerMemberList
              server={currentServer}
              currentUser={currentUser}
              onlineUsers={onlineUsers}
              allMembersInfo={allServerMembers}
              onSelectMember={(member) => setSelectedProfileUser(member)}
            />
          )}
        </main>
      </div>

      {/* 6. Modals */}
      <ScreenShareModal
        isOpen={isScreenPickerOpen}
        currentQuality={streamQuality}
        onClose={() => setIsScreenPickerOpen(false)}
        onConfirm={handleConfirmElectronScreenShare}
      />

      {/* Modal de Download do Aplicativo Desktop (.exe) */}
      {isDownloadModalOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setIsDownloadModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-ink-800 border border-white/[0.07] rounded-2xl p-6 shadow-2xl space-y-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsDownloadModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-4">
              <img
                src="/logo.jpg"
                alt="Jolt"
                className="w-16 h-16 rounded-xl object-cover border-2 border-volt/40 shadow-xl"
              />
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.08] text-zinc-400 border border-white/[0.07]">
                  Windows 10 / 11 (64-bit)
                </span>
                <h3 className="text-lg font-bold text-white mt-1">Jolt para Windows</h3>
                <p className="text-xs text-zinc-500">Versão Desktop Oficial v{APP_VERSION} (.exe)</p>
              </div>
            </div>

            <div className="bg-ink-900 border border-white/[0.07] rounded-xl p-4 space-y-2.5 text-xs text-zinc-200">
              <div className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Seletor nativo de Telas Inteiras, Janelas e Jogos</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Compartilhamento de Áudio do Sistema integrado</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Transmissão em até 1080p 60 FPS com baixo uso de CPU</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Botão de atualização em 1 clique direto pelo aplicativo</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <a
                href={DESKTOP_APP_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsDownloadModalOpen(false)}
                className="w-full py-3.5 px-5 rounded-xl bg-volt text-ink-950 text-sm font-bold tracking-wide shadow-xl flex items-center justify-center gap-2.5 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Jolt-Windows.exe</span>
              </a>
              <div className="text-[11px] text-center text-zinc-500 flex items-center justify-center gap-1.5">
                <Monitor className="w-3.5 h-3.5" />
                <span>Executável portátil — basta baixar e abrir, sem instalação complexa!</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Atualização Automática do App (Atualizar App) */}
      {isElectron && isUpdateModalOpen && (
        <div
          className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => {
            if (!isUpdating) setIsUpdateModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md bg-ink-800 border border-white/[0.07] rounded-2xl p-6 shadow-2xl space-y-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {!isUpdating && (
              <button
                onClick={() => setIsUpdateModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-4">
              <div className="relative">
                <img
                  src="/logo.jpg"
                  alt="Jolt"
                  className="w-16 h-16 rounded-xl object-cover border-2 border-volt/40 shadow-xl"
                />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-volt text-ink-950 border-2 border-ink-800 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Versão Atual: v{APP_VERSION}
                </span>
                <h3 className="text-lg font-bold text-white mt-1">Central de Atualização Jolt</h3>
                <p className="text-xs text-zinc-500">
                  {isElectron
                    ? 'Baixe e instale a versão mais recente sem precisar fechar manualmente'
                    : 'Sincronize seu navegador ou baixe a última versão do App Desktop'}
                </p>
              </div>
            </div>

            <div className="bg-ink-900 border border-white/[0.07] rounded-xl p-4 space-y-2 text-xs text-zinc-200">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Novidades desta versão (v{APP_VERSION}):
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Transmissão de tela mais estável (sem tela preta e sem travar ao reiniciar a live)</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Login e senha salvos com criptografia no PC</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Atualizador baixa sempre a última versão publicada no GitHub</span>
              </div>
            </div>

            {updateError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-300 font-semibold">
                {updateError}
              </div>
            )}

            {isCheckingUpdate ? (
              <div className="p-4 rounded-xl bg-ink-900 border border-white/[0.07] flex items-center justify-center gap-2.5 text-xs font-bold text-zinc-400">
                <RefreshCw className="w-4 h-4 animate-spin text-volt" />
                <span>Consultando GitHub por novas versões...</span>
              </div>
            ) : !isUpdating && !hasUpdateAvailable ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs font-bold text-emerald-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Seu Jolt já está na versão mais recente do GitHub (v{APP_VERSION})!
                </span>
              </div>
            ) : !isUpdating && hasUpdateAvailable ? (
              <div className="p-3.5 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-between text-xs font-bold text-zinc-200">
                <span>Nova versão encontrada no GitHub:</span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  v{latestGitHubVersion}
                </span>
              </div>
            ) : null}

            {isUpdating ? (
              <div className="space-y-2.5 bg-ink-900 p-4 rounded-xl border border-white/[0.07]">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-zinc-400 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-volt" />
                    Baixando Jolt v{latestGitHubVersion} do GitHub...
                  </span>
                  <span className="text-white font-mono">{updatePercent}%</span>
                </div>
                <div className="w-full h-3 bg-ink-700 rounded-full overflow-hidden border border-white/[0.07]">
                  <div
                    className="h-full bg-volt text-ink-950 transition-all duration-150"
                    style={{ width: `${Math.max(4, updatePercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <span>
                    {updateTransferredMB} MB / {updateTotalMB !== '0.0' ? `${updateTotalMB} MB` : '...'}
                  </span>
                  <span>Substituirá o .exe e reiniciará sozinho</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleInstallAppUpdate}
                  className="w-full py-3.5 px-5 rounded-xl bg-volt text-ink-950 text-sm font-bold tracking-wide shadow-xl flex items-center justify-center gap-2.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>
                    {isElectron
                      ? hasUpdateAvailable
                        ? `Baixar e Instalar v${latestGitHubVersion} Agora`
                        : `Reinstalar / Forçar Atualização (v${latestGitHubVersion})`
                      : 'Recarregar Última Versão Web'}
                  </span>
                </button>

                {!isElectron && (
                  <a
                    href={DESKTOP_APP_DOWNLOAD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-ink-700 hover:bg-ink-600 border border-white/[0.07] text-zinc-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-volt" />
                    <span>Baixar Jolt-Windows.exe Atualizado</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <CreateServerModal
        isOpen={isCreateServerOpen}
        onClose={() => setIsCreateServerOpen(false)}
        onCreate={handleCreateServer}
        onJoinByInvite={handleJoinByInvite}
      />

      <CreateChannelModal
        isOpen={isCreateChannelOpen}
        serverName={currentServer?.name || 'Servidor'}
        initialType={createChannelType}
        onClose={() => setIsCreateChannelOpen(false)}
        onCreateChannel={handleCreateChannel}
      />

      <InviteModal
        isOpen={isInviteModalOpen}
        server={currentServer}
        friends={friends}
        onClose={() => setIsInviteModalOpen(false)}
        onInviteFriend={handleInviteFriend}
      />

      <UserSettingsModal
        currentUser={currentUser}
        isOpen={isSettingsOpen}
        audioSettings={audioSettings}
        streamQuality={streamQuality}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveProfile}
        onUpdateAudioSettings={handleUpdateAudioSettings}
        onChangeStreamQuality={handleChangeQuality}
        onLogout={handleLogout}
      />

      {currentServer && (
        <ServerSettingsModal
          isOpen={isServerSettingsOpen}
          server={currentServer}
          currentUser={currentUser}
          allMembersInfo={allServerMembers}
          onClose={() => setIsServerSettingsOpen(false)}
          onUpdateSettings={handleUpdateServerSettings}
          onCreateRole={handleCreateRole}
          onDeleteRole={handleDeleteRole}
          onAssignRole={handleAssignRole}
          onTimeoutMember={handleTimeoutMember}
          onKickMember={handleKickMember}
          onDeleteServer={() => handleDeleteServer(currentServer.id)}
        />
      )}

      {selectedProfileUser && (
        <UserProfileCard
          user={selectedProfileUser}
          currentUser={currentUser}
          server={currentServer}
          friends={friends}
          onlineUsers={onlineUsers}
          onClose={() => setSelectedProfileUser(null)}
          onSendFriendRequest={handleSendFriendRequest}
          onStartDMCall={handleStartDMCall}
          onSelectDM={handleSelectDM}
          onSendDM={(toUserId, text) => {
            socketRef.current?.emit('dm:send', { toUserId, text });
          }}
          onAssignRole={handleAssignRole}
          onTimeoutMember={handleTimeoutMember}
          onKickMember={handleKickMember}
        />
      )}
    </div>
  );
};

export default App;

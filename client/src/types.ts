export const APP_VERSION = '1.9.0';

export type StreamQualityPreset = 'potato' | 'balanced' | 'gamer';

export interface DesktopSource {
  id: string;
  name: string;
  display_id: string;
  isScreen: boolean;
  thumbnail: string;
  appIcon: string | null;
}

export interface UpdateProgressInfo {
  percent: number;
  transferredMB: string;
  totalMB: string;
}

export interface SavedAuthData {
  userId?: string;
  name?: string;
  password?: string;
  rememberMe?: boolean;
  autoLogin?: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getDesktopSources: () => Promise<DesktopSource[]>;
      selectDesktopSource: (options: { sourceId: string; shareAudio: boolean }) => Promise<{ success: boolean }>;
      openExternal: (url: string) => Promise<void>;
      installUpdate?: (downloadUrl?: string) => Promise<{ success: boolean; error?: string }>;
      onUpdateProgress?: (callback: (data: UpdateProgressInfo) => void) => () => void;
      getSavedAuth?: () => Promise<SavedAuthData | null>;
      saveAuth?: (data: SavedAuthData) => Promise<{ success: boolean }>;
      clearSavedAuth?: () => Promise<{ success: boolean }>;
    };
  }
}

export interface User {
  id: string;
  name: string;
  tag: string;
  username: string; // retrocompat
  displayName: string; // retrocompat
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
}

export interface OnlineUser extends User {
  socketId: string;
  currentVoiceChannel: string | null;
  currentServerId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  streamQuality: StreamQualityPreset;
}

export interface ServerMemberInfo {
  id: string;
  name: string;
  tag: string;
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice' | 'media';
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

export interface ServerRole {
  id: string;
  name: string;
  color: string;
  isAdmin?: boolean;
}

export interface ServerItem {
  id: string;
  name: string;
  iconColor: string;
  iconUrl?: string;
  bannerUrl?: string;
  description?: string;
  ownerId: string;
  inviteCode: string;
  members: string[];
  channels: Channel[];
  roles?: ServerRole[];
  memberRoles?: Record<string, string[]>;
  timeouts?: Record<string, number>;
}

export interface FriendItem {
  friendshipId: string;
  status: 'pending' | 'accepted';
  isInitiator: boolean;
  friend: {
    id: string;
    name: string;
    tag: string;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl?: string;
    bio?: string;
    isOnline: boolean;
  };
}

export interface MessageAttachment {
  name: string;
  type: 'image' | 'file';
  url: string;
  size?: number;
}

export interface Message {
  id: string;
  serverId: string;
  channelId: string;
  userId: string;
  userName: string;
  avatarColor: string;
  avatarUrl?: string;
  text: string;
  attachment?: MessageAttachment;
  timestamp: string;
}

export interface ServerInviteAttachment {
  serverId: string;
  serverName: string;
  iconColor: string;
  iconUrl?: string;
  inviteCode: string;
  inviterName: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface DMMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  attachment?: MessageAttachment;
  serverInvite?: ServerInviteAttachment;
  timestamp: string;
  createdAt: string;
}

export interface QualityConfig {
  name: string;
  label: string;
  description: string;
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
}

export const QUALITY_PRESETS: Record<StreamQualityPreset, QualityConfig> = {
  potato: {
    name: 'potato',
    label: '🥔 Modo Batata (Ultra Leve)',
    description: '480p @ 20 FPS (600 Kbps) - Zero travamentos em PCs fracos',
    width: 854,
    height: 480,
    fps: 20,
    bitrateKbps: 600,
  },
  balanced: {
    name: 'balanced',
    label: '⚖️ Modo Equilibrado',
    description: '720p @ 30 FPS (1.8 Mbps) - Qualidade limpa e estável',
    width: 1280,
    height: 720,
    fps: 30,
    bitrateKbps: 1800,
  },
  gamer: {
    name: 'gamer',
    label: '🚀 Modo Gamer Pro (60 FPS)',
    description: '1080p @ 60 FPS (5.0 Mbps) - Fluidez máxima para jogos de ação',
    width: 1920,
    height: 1080,
    fps: 60,
    bitrateKbps: 5000,
  },
};

export type InputAudioProfile = 'isolation' | 'studio' | 'custom';

export interface AudioSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  inputVolume: number; // 0 - 200
  outputVolume: number; // 0 - 100
  inputProfile: InputAudioProfile;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  autoSensitivity: boolean;
  sensitivityThreshold: number; // 1 - 80
  soundEffectsEnabled: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  inputVolume: 100,
  outputVolume: 100,
  inputProfile: 'isolation',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  autoSensitivity: true,
  sensitivityThreshold: 14,
  soundEffectsEnabled: true,
};


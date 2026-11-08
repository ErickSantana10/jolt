import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  ListMusic,
  MessageSquare,
  Plus,
  Send,
  Maximize2,
  Music2,
  Users,
  Lock,
  Crown,
  RotateCcw,
  RotateCw,
  PanelRightClose,
  PanelRightOpen,
  Link2
} from 'lucide-react';
import type { Channel, Message, User, MediaRoomState, MessageAttachment } from '../types';

interface MediaRoomProps {
  channel: Channel;
  currentUser?: User | null;
  mediaState: MediaRoomState | null;
  messages: Message[];
  onSendMessage: (text: string, attachment?: MessageAttachment) => void;
  onPlayMedia: (url: string, title?: string) => void;
  onSyncAction: (action: 'play' | 'pause' | 'skip' | 'seek', time?: number) => void;
  onHeartbeat?: (currentTime: number, isPlaying: boolean) => void;
  onVoteSkip: () => void;
  onSelectUser?: (user: any) => void;
}

export const MediaRoom: React.FC<MediaRoomProps> = ({
  channel,
  currentUser,
  mediaState,
  messages,
  onSendMessage,
  onPlayMedia,
  onSyncAction,
  onHeartbeat,
  onVoteSkip,
  onSelectUser,
}) => {
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'chat'>('chat');
  const [urlInput, setUrlInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState(0);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastVideoIdRef = useRef<string | null>(null);
  const volumeRef = useRef<number>(80);
  const isMutedRef = useRef<boolean>(false);
  const mediaStateRef = useRef<MediaRoomState | null>(mediaState);

  // Refs de proteção contra loop de seek / buffering do YouTube e diferença de relógio entre PCs
  const lastOwnerSeekAtRef = useRef<number>(0);
  const lastOwnerSeekTargetRef = useRef<number>(0);
  const lastViewerSeekAtRef = useRef<number>(0);
  const lastViewerSeekTargetRef = useRef<number>(0);
  const stateReceivedAtRef = useRef<number>(Date.now());
  const lastActionSeqRef = useRef<number>(0);

  useEffect(() => {
    mediaStateRef.current = mediaState;
    stateReceivedAtRef.current = Date.now();
  }, [mediaState]);

  // Verifica se o usuário atual foi quem colocou o vídeo/música que está tocando
  const isTrackOwner = Boolean(
    currentUser &&
      mediaState?.currentTrack &&
      mediaState.currentTrack.addedBy.id === currentUser.id
  );
  const isTrackOwnerRef = useRef<boolean>(isTrackOwner);
  useEffect(() => {
    isTrackOwnerRef.current = isTrackOwner;
  }, [isTrackOwner]);

  // Votação para pular (50% + 1)
  const skipVotes = mediaState?.skipVotes || [];
  const listeners = mediaState?.listeners || [];
  const totalListeners = Math.max(1, listeners.length);
  const requiredVotes = Math.floor(totalListeners / 2) + 1;
  const currentVoteCount = skipVotes.length;
  const hasUserVoted = currentUser ? skipVotes.includes(currentUser.id) : false;

  // Filter messages for this media channel
  const channelMessages = messages.filter((m) => m.channelId === channel.id);

  // Auto-scroll chat
  useEffect(() => {
    if (isSidePanelOpen && activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages, activeTab, isSidePanelOpen]);

  // Load YouTube IFrame API script tag once
  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Synchronize or initialize player whenever mediaState changes
  const syncPlayerWithState = (state: MediaRoomState | null) => {
    if (!state || !state.currentTrack) {
      if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
        try {
          playerRef.current.stopVideo();
        } catch (e) {}
      }
      lastVideoIdRef.current = null;
      lastOwnerSeekTargetRef.current = 0;
      lastViewerSeekTargetRef.current = 0;
      setPlayerCurrentTime(0);
      setPlayerDuration(0);
      return;
    }

    const { videoId } = state.currentTrack;
    // Usa diretamente o state.currentTime enviado pelo servidor no instante em que o pacote chega,
    // sem somar (Date.now() - state.updatedAt), pois o relógio do Windows de cada PC pode ter minutos de diferença!
    const targetTime = Math.max(0, state.currentTime || 0);
    const actionSeq = (state as any).actionSeq || 0;
    const isExplicitOwnerAction = actionSeq > 0 && actionSeq !== lastActionSeqRef.current;
    if (actionSeq > 0) {
      lastActionSeqRef.current = actionSeq;
    }

    if (!(window as any).YT || !(window as any).YT.Player) {
      return;
    }

    // Se a instância do player já existe
    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
      if (lastVideoIdRef.current !== videoId) {
        // Novo vídeo entrou!
        lastVideoIdRef.current = videoId;
        lastOwnerSeekTargetRef.current = targetTime;
        lastViewerSeekTargetRef.current = targetTime;
        setPlayerCurrentTime(targetTime);
        try {
          playerRef.current.loadVideoById({
            videoId,
            startSeconds: targetTime,
          });
          playerRef.current.setVolume?.(isMutedRef.current ? 0 : volumeRef.current);
          if (state.isPlaying) {
            playerRef.current.playVideo?.();
          } else {
            playerRef.current.pauseVideo?.();
          }
        } catch (err) {
          console.warn('Erro ao carregar vídeo no player existente:', err);
        }
      } else {
        // Mesmo vídeo:
        // Se este cliente é o DONO do vídeo (isTrackOwner), NÃO fazemos seekTo em resposta ao eco do servidor
        if (isTrackOwnerRef.current) {
          return;
        }

        // Espectadores (!isTrackOwner): sincroniza imediatamente com o estado oficial do DJ
        try {
          const curTime = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
          const playerState = playerRef.current.getPlayerState ? playerRef.current.getPlayerState() : -1;

          if (!state.isPlaying) {
            // Se o DJ pausou o vídeo, pausa imediatamente no espectador e crava no segundo exato (ex: 2:20)!
            if (playerState === 1) {
              playerRef.current.pauseVideo?.();
            }
            setPlayerCurrentTime(targetTime);
            if (Math.abs(curTime - targetTime) > 0.8 && (isExplicitOwnerAction || Date.now() - lastViewerSeekAtRef.current > 1800)) {
              lastViewerSeekAtRef.current = Date.now();
              lastViewerSeekTargetRef.current = targetTime;
              playerRef.current.seekTo(targetTime, true);
              setTimeout(() => playerRef.current?.pauseVideo?.(), 150);
            }
          } else {
            // Vídeo está tocando: se o DJ deu play/seek explícito ou se desviou > 1.8s, sincroniza
            const cooldownPassed = Date.now() - lastViewerSeekAtRef.current > 2500;
            if (isExplicitOwnerAction || (Math.abs(curTime - targetTime) > 1.8 && cooldownPassed)) {
              lastViewerSeekAtRef.current = Date.now();
              lastViewerSeekTargetRef.current = targetTime;
              setPlayerCurrentTime(targetTime);
              playerRef.current.seekTo(targetTime, true);
            }
            if (playerState !== 1 && playerState !== 3) {
              playerRef.current.playVideo?.();
            }
          }
        } catch (err) {
          console.warn('Erro ao sincronizar player:', err);
        }
      }
      return;
    }

    // Instancia o player pela primeira vez
    if (!playerContainerRef.current) return;
    playerContainerRef.current.innerHTML = '<div id="youtube-media-element" style="width:100%;height:100%"></div>';
    lastVideoIdRef.current = videoId;
    lastOwnerSeekTargetRef.current = targetTime;
    lastViewerSeekTargetRef.current = targetTime;

    try {
      playerRef.current = new (window as any).YT.Player('youtube-media-element', {
        height: '100%',
        width: '100%',
        videoId,
        playerVars: {
          autoplay: state.isPlaying ? 1 : 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          start: Math.floor(targetTime),
        },
        events: {
          onReady: (event: any) => {
            try {
              event.target.setVolume(isMutedRef.current ? 0 : volumeRef.current);
              const latestState = mediaStateRef.current;
              if (latestState?.currentTrack) {
                const localElapsed = latestState.isPlaying
                  ? Math.max(0, (Date.now() - stateReceivedAtRef.current) / 1000)
                  : 0;
                const syncTarget = Math.max(0, (latestState.currentTime || 0) + localElapsed);
                lastOwnerSeekTargetRef.current = syncTarget;
                lastViewerSeekTargetRef.current = syncTarget;
                setPlayerCurrentTime(syncTarget);
                event.target.seekTo(syncTarget, true);
                if (latestState.isPlaying) {
                  event.target.playVideo();
                } else {
                  event.target.pauseVideo();
                }
              }
            } catch (e) {}
          },
          onStateChange: (event: any) => {
            // YT.PlayerState.ENDED === 0
            if (event.data === 0) {
              onSyncAction('skip');
              return;
            }
            // Se o vídeo estava pausado na sala e o YouTube tentou dar play sozinho após um seekTo, mantém pausado!
            if (event.data === 1 && mediaStateRef.current && !mediaStateRef.current.isPlaying) {
              try {
                event.target.pauseVideo();
              } catch (e) {}
            }
          },
          onError: (err: any) => {
            console.warn('YouTube Player Error:', err);
          },
        },
      });
    } catch (err) {
      console.warn('Erro ao instanciar YT.Player:', err);
    }
  };

  // Watch for state changes and trigger sync
  useEffect(() => {
    syncPlayerWithState(mediaState);
  }, [mediaState]);

  // Periodic check if YouTube API loaded in case it was slow
  useEffect(() => {
    const checkYT = setInterval(() => {
      if ((window as any).YT && (window as any).YT.Player) {
        if (!playerRef.current && mediaState?.currentTrack) {
          syncPlayerWithState(mediaState);
        }
      }
    }, 300);

    return () => clearInterval(checkYT);
  }, [mediaState]);

  // Loop de atualização da barra de tempo e verificação de sincronia dos espectadores (a cada 1s)
  useEffect(() => {
    const syncTimer = setInterval(() => {
      const player = playerRef.current;
      const state = mediaStateRef.current;
      if (!player || typeof player.getCurrentTime !== 'function' || !state?.currentTrack) return;

      try {
        const cur = player.getCurrentTime() || 0;
        const dur = player.getDuration ? player.getDuration() || 0 : 0;
        const playerState = player.getPlayerState ? player.getPlayerState() : -1;

        if (dur > 0) {
          setPlayerDuration(dur);
        }

        if (isTrackOwnerRef.current) {
          // Para o dono do vídeo:
          // Se acabou de fazer um seek nos últimos 2.5s (ou está arrastando a barra), mantém o valor escolhido na tela
          // para não piscar 0:00 enquanto o YouTube carrega o frame novo
          const recentlySeeked = Date.now() - lastOwnerSeekAtRef.current < 2500;
          if (!isSeeking && !recentlySeeked) {
            if (cur > 0.5 || lastOwnerSeekTargetRef.current < 1) {
              setPlayerCurrentTime(cur);
              lastOwnerSeekTargetRef.current = cur;
            }
          }
          return;
        }

        // Para espectadores (!isTrackOwner):
        // Calcula o tempo decorrido usando APENAS o relógio local desde que o pacote chegou (zero erro de fuso/relógio entre PCs!)
        const localElapsed = state.isPlaying ? Math.max(0, (Date.now() - stateReceivedAtRef.current) / 1000) : 0;
        const expectedTime = Math.max(0, (state.currentTime || 0) + localElapsed);

        if (!state.isPlaying) {
          // Quando pausado pelo dono, mostra exatamente o tempo em que o dono pausou (ex: 2:20)
          setPlayerCurrentTime(state.currentTime || 0);
          if (playerState === 1) {
            player.pauseVideo?.();
          }
          if (
            playerState !== 3 &&
            Date.now() - lastViewerSeekAtRef.current > 2000 &&
            Math.abs(cur - (state.currentTime || 0)) > 1.2
          ) {
            lastViewerSeekAtRef.current = Date.now();
            lastViewerSeekTargetRef.current = state.currentTime || 0;
            player.seekTo(state.currentTime || 0, true);
            setTimeout(() => player.pauseVideo?.(), 150);
          }
        } else {
          // Quando reproduzindo
          if (!isSeeking) {
            setPlayerCurrentTime(cur > 0.5 ? cur : expectedTime);
          }
          if (playerState !== 1 && playerState !== 3) {
            player.playVideo?.();
          }
          if (
            playerState !== 3 &&
            Date.now() - lastViewerSeekAtRef.current > 3000 &&
            dur > 0 &&
            expectedTime < dur - 1.5 &&
            Math.abs(cur - expectedTime) > 2.0
          ) {
            lastViewerSeekAtRef.current = Date.now();
            lastViewerSeekTargetRef.current = expectedTime;
            player.seekTo(expectedTime, true);
          }
        }
      } catch (e) {}
    }, 1000);

    return () => clearInterval(syncTimer);
  }, [isSeeking]);

  // Heartbeat do dono do vídeo: envia o tempo exato (tanto tocando quanto pausado) a cada 2s para manter todos cravados
  useEffect(() => {
    if (!isTrackOwner || !mediaState?.currentTrack) return;

    const heartbeatTimer = setInterval(() => {
      const player = playerRef.current;
      const state = mediaStateRef.current;
      if (!player || !state?.currentTrack) return;
      if (isSeeking || Date.now() - lastOwnerSeekAtRef.current < 2500) return;

      try {
        const playerState = player.getPlayerState ? player.getPlayerState() : -1;
        const cur = player.getCurrentTime ? player.getCurrentTime() : 0;

        if (state.isPlaying) {
          if (playerState === 1 && cur > 0.5) {
            lastOwnerSeekTargetRef.current = cur;
            onHeartbeat?.(cur, true);
          }
        } else {
          // Quando pausado pelo dono, envia o tempo pausado confiável para que qualquer amigo fique cravado no mesmo segundo
          const pausedTime = cur > 0.5 ? cur : lastOwnerSeekTargetRef.current;
          onHeartbeat?.(pausedTime, false);
        }
      } catch (e) {}
    }, 2000);

    return () => clearInterval(heartbeatTimer);
  }, [isTrackOwner, mediaState?.currentTrack?.id, isSeeking]);

  const handleAddTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    setIsSubmitting(true);
    onPlayMedia(url);
    setUrlInput('');
    setTimeout(() => setIsSubmitting(false), 1200);
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    // Check for /play or /tocar command
    const playMatch = text.match(/^\/(?:play|tocar)\s+(.+)$/i);
    if (playMatch) {
      const url = playMatch[1].trim();
      onPlayMedia(url);
      setChatInput('');
      return;
    }

    // Check for /skip or /pular or /voteskip command
    if (/^\/(?:skip|pular|voteskip)$/i.test(text)) {
      onVoteSkip();
      setChatInput('');
      return;
    }

    onSendMessage(text);
    setChatInput('');
  };

  // Obtém o tempo confiável atual do dono (nunca retorna 0 se o vídeo estava em 03:09 e o YouTube está em buffering)
  const getReliableOwnerTime = (): number => {
    const player = playerRef.current;
    const rawCur = player && typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
    if (Date.now() - lastOwnerSeekAtRef.current < 3000) {
      return lastOwnerSeekTargetRef.current;
    }
    if (rawCur <= 0.5 && lastOwnerSeekTargetRef.current > 1) {
      return lastOwnerSeekTargetRef.current;
    }
    return rawCur || playerCurrentTime || 0;
  };

  const handleTogglePlayPause = () => {
    if (!isTrackOwner || !mediaState?.currentTrack) return;
    const reliableTime = getReliableOwnerTime();
    lastOwnerSeekAtRef.current = Date.now();
    lastOwnerSeekTargetRef.current = reliableTime;
    setPlayerCurrentTime(reliableTime);

    const player = playerRef.current;
    if (mediaState.isPlaying) {
      player?.pauseVideo?.();
      onSyncAction('pause', reliableTime);
    } else {
      player?.seekTo?.(reliableTime, true);
      player?.playVideo?.();
      onSyncAction('play', reliableTime);
    }
  };

  const handleSeekOffset = (deltaSeconds: number) => {
    if (!isTrackOwner || !mediaState?.currentTrack) return;
    const baseTime = getReliableOwnerTime();
    const nextTime = Math.max(0, Math.min(playerDuration || 99999, baseTime + deltaSeconds));
    lastOwnerSeekAtRef.current = Date.now();
    lastOwnerSeekTargetRef.current = nextTime;
    setPlayerCurrentTime(nextTime);

    const player = playerRef.current;
    player?.seekTo?.(nextTime, true);
    if (!mediaState.isPlaying) {
      setTimeout(() => player?.pauseVideo?.(), 150);
    }
    onSyncAction('seek', nextTime);
  };

  const handleSeekInput = (newTime: number) => {
    if (!isTrackOwner) return;
    setIsSeeking(true);
    setSeekPreviewTime(newTime);
  };

  const handleSeekCommit = (newTime: number) => {
    if (!isTrackOwner) return;
    setIsSeeking(false);
    lastOwnerSeekAtRef.current = Date.now();
    lastOwnerSeekTargetRef.current = newTime;
    setPlayerCurrentTime(newTime);

    const player = playerRef.current;
    if (player && typeof player.seekTo === 'function') {
      player.seekTo(newTime, true);
      if (!mediaState?.isPlaying) {
        setTimeout(() => player?.pauseVideo?.(), 150);
      }
    }
    onSyncAction('seek', newTime);
  };

  const handleSkip = () => {
    onVoteSkip();
  };

  // Volume 100% local e isolado: nunca altera o estado de tempo do vídeo
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    volumeRef.current = newVol;
    const muted = newVol === 0;
    setIsMuted(muted);
    isMutedRef.current = muted;
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      try {
        playerRef.current.setVolume(newVol);
      } catch (e) {}
    }
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      isMutedRef.current = false;
      const restored = volume || 50;
      setVolume(restored);
      volumeRef.current = restored;
      if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
        try {
          playerRef.current.setVolume(restored);
        } catch (e) {}
      }
    } else {
      setIsMuted(true);
      isMutedRef.current = true;
      if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
        try {
          playerRef.current.setVolume(0);
        } catch (e) {}
      }
    }
  };

  const formatSeconds = (sec: number) => {
    const safeSec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(safeSec / 60);
    const s = safeSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  const displayedTime = isSeeking ? seekPreviewTime : playerCurrentTime;
  const progressPercent = playerDuration > 0 ? Math.min(100, (displayedTime / playerDuration) * 100) : 0;

  return (
    <div className="flex-1 flex overflow-hidden bg-transparent">
      {/* 1. Main Left Screen: Video Stage & Controls (Expands when Chat/Queue is closed!) */}
      <div className="flex-1 flex flex-col h-full min-w-0 transition-all duration-200">
        {/* Header */}
        <div className="h-14 px-5 border-b border-white/[0.07] flex items-center justify-between bg-ink-800/85 backdrop-blur-md gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-volt shrink-0">
              <Film className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2.5 min-w-0 truncate">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
                <span>{channel.name}</span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white/[0.08] text-zinc-400 border border-white/[0.07]">
                  Sala Sincronizada
                </span>
              </h2>

              {/* Resumo da música tocando agora no cabeçalho */}
              {mediaState?.currentTrack && (
                <div className="flex items-center gap-2 pl-2 border-l border-white/[0.07] min-w-0 truncate">
                  <img
                    src={mediaState.currentTrack.thumbnailUrl}
                    alt={mediaState.currentTrack.title}
                    className="w-7 h-5 rounded object-cover border border-white/10 shrink-0"
                  />
                  <span className="text-xs font-bold text-zinc-400 truncate" title={mediaState.currentTrack.title}>
                    {mediaState.currentTrack.title}
                  </span>
                  <span className="text-[11px] text-zinc-400 shrink-0">
                    (por <strong className="text-zinc-200">{mediaState.currentTrack.addedBy.name}</strong>)
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400 shrink-0">
            {/* Badge de quem controla o vídeo atual */}
            {mediaState?.currentTrack && (
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-semibold border ${
                  isTrackOwner
                    ? 'bg-white/[0.05] border-white/[0.07] text-zinc-400'
                    : 'bg-ink-700 border-white/[0.07] text-zinc-300'
                }`}
                title={
                  isTrackOwner
                    ? 'Você adicionou este vídeo e pode pausar ou avançar o tempo para todos'
                    : `Apenas ${mediaState.currentTrack.addedBy.name} pode pausar ou avançar este vídeo`
                }
              >
                {isTrackOwner ? (
                  <>
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span>Você controla</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-volt" />
                    <span>DJ: {mediaState.currentTrack.addedBy.name}</span>
                  </>
                )}
              </span>
            )}

            {/* Active Listeners count */}
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-ink-700 border border-white/[0.07] text-zinc-300 font-semibold"
              title="Pessoas sincronizadas nesta sala"
            >
              <Users className="w-3.5 h-3.5 text-volt" />
              <span>{totalListeners} ouvindo</span>
            </span>

            {/* Botão de Abrir / Fechar Chat & Fila (Aumenta ou diminui o player) */}
            <button
              onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs border transition cursor-pointer ${
                isSidePanelOpen
                  ? 'bg-white/[0.08] border-white/[0.07] text-zinc-200 hover:bg-white/[0.08]'
                  : 'bg-ink-700 border-white/[0.07] text-zinc-200 hover:bg-white/[0.05]'
              }`}
              title={isSidePanelOpen ? 'Fechar Chat/Fila para aumentar o player' : 'Abrir Chat e Fila na lateral'}
            >
              {isSidePanelOpen ? (
                <>
                  <PanelRightClose className="w-4 h-4 text-volt" />
                  <span>Ocultar Chat</span>
                </>
              ) : (
                <>
                  <PanelRightOpen className="w-4 h-4 text-volt" />
                  <span>Abrir Chat & Fila ({mediaState?.queue?.length || 0})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Video Canvas Container */}
        <div ref={containerRef} className="flex-1 bg-black relative flex flex-col justify-center items-center overflow-hidden group select-none">
          {/* YouTube Player Element */}
          <div
            ref={playerContainerRef}
            className={`w-full h-full absolute inset-0 pointer-events-none select-none ${
              mediaState?.currentTrack ? 'block z-10' : 'hidden'
            }`}
          >
            <div id="youtube-media-element" className="w-full h-full pointer-events-none" />
          </div>

          {/* Camada protetora sobre o vídeo */}
          {mediaState?.currentTrack && (
            <div
              onClick={() => {
                if (isTrackOwner) {
                  handleTogglePlayPause();
                }
              }}
              className={`absolute inset-0 z-20 ${isTrackOwner ? 'cursor-pointer' : 'cursor-default'}`}
              title={
                isTrackOwner
                  ? 'Clique para Pausar / Reproduzir para todos'
                  : `Sincronizado com ${mediaState.currentTrack.addedBy.name}`
              }
            />
          )}

          {/* Placeholder quando nenhum vídeo está tocando */}
          {!mediaState?.currentTrack && (
            <div className="z-20 text-center max-w-md p-6 space-y-4">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center shadow-2xl relative">
                <Music2 className="w-10 h-10 text-amber-400 animate-bounce" />
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 animate-ping" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-white">Nenhum som tocando</h3>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  Cole o link do YouTube na caixinha do <span className="text-amber-400 font-bold">canto inferior esquerdo</span> abaixo para assistir e ouvir sincronizado com todo mundo!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Barra de Progresso / Tempo Customizada */}
        {mediaState?.currentTrack && (
          <div className="px-4 pt-2.5 pb-1 bg-ink-800/90 border-t border-white/[0.07] flex items-center gap-3 select-none">
            <span className="text-[11px] font-mono text-zinc-300 font-semibold w-10 text-right">
              {formatSeconds(displayedTime)}
            </span>

            <div className="relative flex-1 flex items-center h-4">
              <div className="w-full h-1.5 bg-ink-600 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    isTrackOwner ? 'bg-volt text-ink-950' : 'bg-volt text-ink-950'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(playerDuration))}
                value={Math.floor(displayedTime)}
                disabled={!isTrackOwner || playerDuration <= 0}
                onChange={(e) => handleSeekInput(Number(e.target.value))}
                onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                className={`absolute inset-0 w-full h-full opacity-0 ${
                  isTrackOwner ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
                title={
                  isTrackOwner
                    ? 'Arraste para avançar ou voltar o vídeo para todo mundo'
                    : `Apenas ${mediaState.currentTrack.addedBy.name} pode avançar ou voltar o tempo`
                }
              />
            </div>

            <span className="text-[11px] font-mono text-zinc-400 w-10">
              {formatSeconds(playerDuration)}
            </span>
          </div>
        )}

        {/* Media Controls Bar */}
        <div className="h-16 px-4 bg-ink-800/90 border-t border-white/[0.07] flex items-center justify-between gap-4 select-none">
          {/* ESQUERDA: Caixinha de colar o link da música/vídeo */}
          <form onSubmit={handleAddTrack} className="flex items-center gap-2 w-full max-w-[360px]">
            <div className="relative flex-1 flex items-center">
              <Link2 className="w-3.5 h-3.5 text-volt absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Cole o link do YouTube aqui..."
                className="w-full bg-ink-900 border border-white/[0.07] focus:border-volt/40 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-500 outline-none transition select-text"
              />
            </div>
            <button
              type="submit"
              disabled={!urlInput.trim() || isSubmitting}
              className="px-3.5 py-2 bg-volt text-ink-950 disabled:opacity-40 font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              title="Colocar vídeo para tocar ou adicionar à fila"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isSubmitting ? 'Adicionando...' : mediaState?.currentTrack ? 'Na Fila' : 'Tocar'}</span>
            </button>
          </form>

          {/* CENTRO: Play / Pause / Seek / Vote Skip Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* -10s button (Track Owner Only) */}
            <button
              onClick={() => handleSeekOffset(-10)}
              disabled={!mediaState?.currentTrack || !isTrackOwner}
              className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed transition cursor-pointer"
              title={
                isTrackOwner
                  ? 'Voltar 10 segundos para todos'
                  : `Apenas ${mediaState?.currentTrack?.addedBy.name || 'o DJ'} pode voltar o vídeo`
              }
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Play / Pause (Track Owner Only) */}
            <button
              onClick={handleTogglePlayPause}
              disabled={!mediaState?.currentTrack || !isTrackOwner}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition shadow-lg ${
                isTrackOwner
                  ? 'bg-volt text-ink-950 cursor-pointer'
                  : 'bg-ink-700 text-zinc-400 border border-white/[0.07] opacity-60 cursor-not-allowed'
              }`}
              title={
                !mediaState?.currentTrack
                  ? 'Nenhum vídeo tocando'
                  : isTrackOwner
                  ? mediaState.isPlaying
                    ? 'Pausar para todos'
                    : 'Reproduzir para todos'
                  : `Somente ${mediaState.currentTrack.addedBy.name} pode pausar ou despausar`
              }
            >
              {mediaState?.isPlaying ? (
                <Pause className={`w-5 h-5 ${isTrackOwner ? 'fill-white' : ''}`} />
              ) : (
                <Play className={`w-5 h-5 ml-0.5 ${isTrackOwner ? 'fill-white' : ''}`} />
              )}
            </button>

            {/* +10s button (Track Owner Only) */}
            <button
              onClick={() => handleSeekOffset(10)}
              disabled={!mediaState?.currentTrack || !isTrackOwner}
              className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.05] disabled:opacity-25 disabled:cursor-not-allowed transition cursor-pointer"
              title={
                isTrackOwner
                  ? 'Avançar 10 segundos para todos'
                  : `Apenas ${mediaState?.currentTrack?.addedBy.name || 'o DJ'} pode avançar o vídeo`
              }
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Vote Skip (Everyone can vote 50%+1) */}
            <button
              onClick={handleSkip}
              disabled={!mediaState?.currentTrack}
              className={`px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-bold transition cursor-pointer disabled:opacity-30 ${
                hasUserVoted
                  ? 'bg-volt text-ink-950 shadow-lg'
                  : 'text-zinc-300 hover:text-white hover:bg-white/[0.05]'
              }`}
              title={`Votação para pular música (50% + 1): ${currentVoteCount} de ${requiredVotes} votos necessários`}
            >
              <SkipForward className="w-4 h-4" />
              <span>
                {hasUserVoted ? 'Votado' : 'Pular'} ({currentVoteCount}/{requiredVotes})
              </span>
            </button>
          </div>

          {/* DIREITA: Volume Local, Abrir/Fechar Chat & Tela Cheia */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-2 bg-ink-900 px-2.5 py-1.5 rounded-xl border border-white/[0.07]">
              <button
                onClick={handleToggleMute}
                className="text-zinc-400 hover:text-white transition cursor-pointer"
                title={isMuted ? 'Ativar som (apenas para você)' : 'Mutar som (apenas para você)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-volt" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  e.stopPropagation();
                  handleVolumeChange(Number(e.target.value));
                }}
                className="w-20 accent-volt cursor-pointer h-1.5 bg-ink-600 rounded-lg"
                title={`Volume local: ${isMuted ? 0 : volume}%`}
              />
              <span className="text-[10px] font-mono text-zinc-400 w-7 text-right">
                {isMuted ? '0%' : `${volume}%`}
              </span>
            </div>

            <button
              onClick={handleFullscreen}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/[0.05] rounded-lg transition cursor-pointer"
              title="Tela Cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Right Side Panel: Retrátil */}
      {isSidePanelOpen && (
        <div className="w-80 bg-ink-800/90 border-l border-white/[0.07] flex flex-col h-full shrink-0 animate-in fade-in duration-150">
          {/* Navigation Tabs */}
          <div className="h-14 border-b border-white/[0.07] flex items-center gap-1 px-2 bg-ink-900">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-white/[0.08] text-zinc-200 border border-white/[0.07] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat da Sala</span>
            </button>

            <button
              onClick={() => setActiveTab('queue')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'queue'
                  ? 'bg-white/[0.08] text-zinc-200 border border-white/[0.07] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ListMusic className="w-4 h-4" />
              <span>Fila ({mediaState?.queue ? mediaState.queue.length : 0})</span>
            </button>

            <button
              onClick={() => setIsSidePanelOpen(false)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition cursor-pointer"
              title="Fechar painel lateral para expandir o player"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>

          {/* Tab 1: Fila de Reprodução */}
          {activeTab === 'queue' ? (
            <div className="flex-1 flex flex-col p-3 overflow-hidden">
              {/* Currently Playing Card */}
              {mediaState?.currentTrack && (
                <div className="mb-3 bg-white/[0.07] border border-white/[0.07] rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-volt text-ink-950 animate-pulse" />
                      <span>Tocando Agora</span>
                    </div>
                    <span className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1">
                      {isTrackOwner ? (
                        <span className="text-zinc-400 font-bold">👑 Seu vídeo</span>
                      ) : (
                        <span>🔒 Controle do DJ</span>
                      )}
                    </span>
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <img
                      src={mediaState.currentTrack.thumbnailUrl}
                      alt={mediaState.currentTrack.title}
                      className="w-16 h-12 rounded-lg object-cover shadow shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white line-clamp-2" title={mediaState.currentTrack.title}>
                        {mediaState.currentTrack.title}
                      </div>
                      <div className="text-[10px] text-zinc-400 flex items-center gap-1 mt-1 truncate">
                        <span>por</span>
                        <span className="font-semibold text-zinc-200">
                          {mediaState.currentTrack.addedBy.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Votação para Pular (50% + 1) */}
              {mediaState?.currentTrack && (
                <div className="mb-3 p-3 bg-ink-900 border border-white/[0.07] rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                      <span>🗳️ Votação para Pular</span>
                    </span>
                    <span className="text-[11px] font-mono font-bold text-volt">
                      {currentVoteCount} de {requiredVotes} votos
                    </span>
                  </div>

                  {/* Barra de progresso */}
                  <div className="w-full bg-ink-700 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-volt text-ink-950 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (currentVoteCount / requiredVotes) * 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[10px] text-zinc-400">
                      Regra: 50% + 1 ({totalListeners} {totalListeners === 1 ? 'pessoa' : 'pessoas'} na sala)
                    </span>
                    <button
                      onClick={onVoteSkip}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        hasUserVoted
                          ? 'bg-volt text-ink-950 hover:brightness-110'
                          : 'bg-ink-700 text-zinc-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      {hasUserVoted ? 'Retirar Voto' : 'Votar para Pular'}
                    </button>
                  </div>
                </div>
              )}

              {/* Queue List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                  <span>Próximos na Fila</span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {mediaState?.queue.length || 0} vídeos
                  </span>
                </div>

                {(!mediaState?.queue || mediaState.queue.length === 0) ? (
                  <div className="text-center py-8 text-zinc-500 space-y-1">
                    <ListMusic className="w-8 h-8 mx-auto text-volt mb-2" />
                    <p className="text-xs font-medium">A fila está vazia!</p>
                    <p className="text-[11px] text-zinc-600">
                      Use o campo no canto inferior esquerdo para adicionar links.
                    </p>
                  </div>
                ) : (
                  mediaState.queue.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 p-2 bg-ink-900 hover:bg-ink-700 border border-white/[0.07] rounded-xl transition group"
                    >
                      <span className="text-xs font-mono font-bold text-volt w-4 text-center">
                        {index + 1}
                      </span>
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-12 h-9 rounded-lg object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-zinc-200 truncate" title={item.title}>
                          {item.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {item.addedBy.name}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Tab 2: Chat Integrado da Sala */
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Messages Scroll Area */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {channelMessages.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-xs">
                    Nenhuma mensagem ainda. Converse com a galera enquanto assistem!
                  </div>
                ) : (
                  channelMessages.map((msg) => {
                    const isDJ = msg.userId === 'system';
                    return (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-2 text-xs ${
                          isDJ ? 'bg-white/[0.05] border border-white/[0.07] p-2 rounded-xl' : ''
                        }`}
                      >
                        <div
                          onClick={() => !isDJ && onSelectUser?.({ id: msg.userId, name: msg.userName, avatarColor: msg.avatarColor, avatarUrl: msg.avatarUrl })}
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-[11px] shrink-0 ${!isDJ ? 'cursor-pointer hover:opacity-90' : ''}`}
                          style={{ backgroundColor: msg.avatarColor || '#8b5cf6' }}
                        >
                          {msg.userName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span
                              onClick={() => !isDJ && onSelectUser?.({ id: msg.userId, name: msg.userName, avatarColor: msg.avatarColor, avatarUrl: msg.avatarUrl })}
                              className={`font-bold ${isDJ ? 'text-volt' : 'text-zinc-200 cursor-pointer hover:underline'}`}
                            >
                              {msg.userName}
                            </span>
                            <span className="text-[9px] text-zinc-500 font-mono">
                              {msg.timestamp}
                            </span>
                          </div>
                          <div className="text-zinc-300 mt-0.5 break-words select-text">
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChatMessage} className="p-2.5 border-t border-white/[0.07] bg-ink-900">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Conversar na sala..."
                    className="w-full bg-ink-700 border border-white/[0.07] rounded-xl pl-3 pr-9 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-volt/40 transition select-text"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="absolute right-1.5 p-1.5 text-volt hover:text-white disabled:opacity-30 transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

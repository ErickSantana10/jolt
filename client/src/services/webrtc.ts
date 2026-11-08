import { Socket } from 'socket.io-client';
import {
  QUALITY_PRESETS,
  DEFAULT_AUDIO_SETTINGS,
  type StreamQualityPreset,
  type AudioSettings,
} from '../types';

export class WebRTCManager {
  private socket: Socket;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private peerMicStreamIds: Map<string, string> = new Map();
  private peerScreenStreams: Map<string, MediaStream> = new Map();
  private makingOffer: Map<string, boolean> = new Map();
  private ignoreOffer: Map<string, boolean> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  // Peers que precisam de nova oferta assim que a negociação atual terminar (evita perder tracks em corridas)
  private pendingRenegotiation: Set<string> = new Set();
  // Timers de tolerância para reconexão ICE antes de derrubar o peer
  private iceFailureTimers: Map<string, number> = new Map();
  // Preset ativo da transmissão (aplicado também em quem entra na sala depois)
  private currentScreenPreset: StreamQualityPreset | null = null;

  private rawMicStream: MediaStream | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private rawScreenStream: MediaStream | null = null;
  private isMuted: boolean = false;

  private audioSettings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };

  private audioContext: AudioContext | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micGainNode: GainNode | null = null;
  private micDestinationNode: MediaStreamAudioDestinationNode | null = null;
  private analyser: AnalyserNode | null = null;
  private speakingInterval: number | null = null;

  // Anti-Eco e Detector de Fala Remota
  private remoteVoiceAnalysers: Map<string, { source: MediaStreamAudioSourceNode; analyser: AnalyserNode }> =
    new Map();
  private antiEchoInterval: number | null = null;
  private remoteSpeakingInterval: number | null = null;
  private lastRemoteSpeakingKey: string = '';

  // Captura de áudio do sistema com exclusão nativa do Discord (VAD\Process_Loopback)
  private screenAudioContext: AudioContext | null = null;
  private screenAudioWorkletNode: AudioWorkletNode | null = null;
  private screenAudioUnsubscribe: (() => void) | null = null;

  public onSpeakingChange?: (isSpeaking: boolean) => void;
  public onRemoteSpeakingChange?: (speakingPeerIds: string[]) => void;
  public onMicLevelChange?: (level: number) => void;
  public onRemoteStream?: (peerId: string, stream: MediaStream, isScreen: boolean) => void;
  public onRemoteScreenRemoved?: (peerId: string) => void;
  public onPeerDisconnected?: (peerId: string) => void;
  public onScreenShareEnded?: () => void;
  // Estado da conexão com cada pessoa (para a UI mostrar "sem conexão" / "conectando")
  public onPeerConnectionState?: (peerId: string, state: RTCPeerConnectionState) => void;

  // STUN públicos (resolvem redes simples). O TURN — necessário quando a rede de alguém bloqueia
  // conexão direta (CGNAT, 4G, roteador restrito) — vem do servidor via /api/turn (setIceServers).
  // O antigo TURN gratuito openrelay.metered.ca parou de funcionar e foi removido.
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    iceCandidatePoolSize: 4,
  };

  // Auto-recuperação: quem deveria estar conectado / transmitindo, e quando tentamos reparar
  private expectedPeers: Map<string, { sharing: boolean; since: number; sharingSince: number }> = new Map();
  private lastHealAt: Map<string, number> = new Map();

  constructor(socket: Socket, initialAudioSettings?: AudioSettings) {
    this.socket = socket;
    if (initialAudioSettings) {
      this.audioSettings = { ...initialAudioSettings };
    }
    this.setupSignaling();
    this.startRemoteSpeakingMonitor();
    window.setInterval(() => this.healConnections(), 4000);
  }

  /** Recebe a lista de ICE servers (STUN + TURN) do servidor. Vale para as próximas conexões. */
  public setIceServers(servers: RTCIceServer[]) {
    if (!Array.isArray(servers) || servers.length === 0) return;
    this.rtcConfig = { ...this.rtcConfig, iceServers: servers };
  }

  /**
   * Informa quem está na sala (socketIds) e quem está transmitindo. Usado pela auto-recuperação:
   * se a conexão com alguém falhar, ou a tela de quem transmite não chegar, o par é refeito sozinho.
   */
  public setExpectedPeers(peers: { socketId: string; isScreenSharing: boolean }[]) {
    const now = Date.now();
    const next = new Map<string, { sharing: boolean; since: number; sharingSince: number }>();
    for (const p of peers) {
      if (!p.socketId || p.socketId === this.socket.id) continue;
      const prev = this.expectedPeers.get(p.socketId);
      next.set(p.socketId, {
        sharing: p.isScreenSharing,
        since: prev?.since ?? now,
        sharingSince: p.isScreenSharing ? (prev?.sharing ? prev.sharingSince : now) : 0,
      });
    }
    this.expectedPeers = next;
  }

  /** Alguma track local ainda não está sendo enviada nesta conexão (falta negociar)? */
  private hasUnnegotiatedTracks(pc: RTCPeerConnection): boolean {
    return pc.getTransceivers().some(
      (t) =>
        !!t.sender.track &&
        t.direction !== 'stopped' &&
        (t.currentDirection === null || t.currentDirection === 'recvonly' || t.currentDirection === 'inactive')
    );
  }

  private hasLiveScreenFrom(peerId: string): boolean {
    const stream = this.peerScreenStreams.get(peerId);
    return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  private healConnections() {
    const now = Date.now();
    for (const [peerId, info] of this.expectedPeers.entries()) {
      const last = this.lastHealAt.get(peerId) || 0;
      if (now - last < 25000) continue;
      const pc = this.peerConnections.get(peerId);
      const state = pc?.connectionState;

      // 1) Sem conexão (nunca conectou, caiu, ou falhou) por mais de 12s
      const brokenConnection =
        now - info.since > 12000 && (!pc || state === 'failed' || state === 'closed' || state === 'new');
      // 2) Conectado, a pessoa diz que está transmitindo, mas a tela não chegou em 10s
      const missingScreen =
        info.sharing && now - info.sharingSince > 10000 && state === 'connected' && !this.hasLiveScreenFrom(peerId);

      if (brokenConnection || missingScreen) {
        console.warn(`[WebRTC] Reparando conexão com ${peerId} (${brokenConnection ? 'sem conexão' : 'tela não chegou'})`);
        this.resetPeer(peerId);
      }
    }
  }

  /**
   * Refaz do zero a conexão com uma pessoa (dos dois lados): avisa o colega via 'webrtc:reset',
   * fecha a conexão antiga e manda uma oferta nova. Resolve pares travados em negociação.
   */
  public resetPeer(peerId: string) {
    if (!peerId || peerId === this.socket.id) return;
    this.lastHealAt.set(peerId, Date.now());
    this.socket.emit('webrtc:reset', { targetSocketId: peerId });
    this.closePeerConnection(peerId);
    this.onPeerDisconnected?.(peerId);
    window.setTimeout(() => {
      this.connectToPeer(peerId);
    }, 600);
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  private async flushPendingCandidates(peerId: string, pc: RTCPeerConnection) {
    const queue = this.pendingCandidates.get(peerId);
    if (!queue || queue.length === 0) return;
    this.pendingCandidates.set(peerId, []);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignora candidato obsoleto
      }
    }
  }

  // Fila de sinalização por colega: offer/answer/candidatos de uma mesma pessoa são processados
  // um de cada vez, na ordem de chegada. Antes os handlers async rodavam em paralelo e, com duas
  // ofertas seguidas, uma atropelava a outra ("setLocalDescription em estado errado") e a tela
  // de quem transmitia não chegava para quem entrou depois.
  private signalChains: Map<string, Promise<void>> = new Map();

  private enqueueSignal(peerId: string, task: () => Promise<void>) {
    const prev = this.signalChains.get(peerId) || Promise.resolve();
    const next = prev.then(task, task).catch(() => {});
    this.signalChains.set(peerId, next);
  }

  private setupSignaling() {
    this.socket.on(
      'webrtc:offer',
      (payload: { fromSocketId?: string; fromPeerId?: string; offer: RTCSessionDescriptionInit }) => {
        const fromId = payload.fromSocketId || payload.fromPeerId;
        const offer = payload.offer;
        if (!fromId || !offer) return;

        this.enqueueSignal(fromId, async () => {
        try {
          const pc = this.getOrCreatePeerConnection(fromId);
          const isPolite = (this.socket.id || '') < fromId;
          const offerCollision = this.makingOffer.get(fromId) || pc.signalingState !== 'stable';

          this.ignoreOffer.set(fromId, !isPolite && offerCollision);
          if (this.ignoreOffer.get(fromId)) {
            return;
          }

          // Lado "polite": desfaz a própria oferta pendente antes de aceitar a do colega.
          // A track que estava na oferta desfeita volta a ser negociada via onnegotiationneeded/pendingRenegotiation.
          if (offerCollision && pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({ type: 'rollback' });
            this.pendingRenegotiation.add(fromId);
          }
          await pc.setRemoteDescription(new RTCSessionDescription(offer));

          await this.flushPendingCandidates(fromId, pc);

          const answer = await pc.createAnswer();
          if (answer.sdp) {
            answer.sdp = this.enhanceOpusSdp(answer.sdp);
          }
          await pc.setLocalDescription(answer);

          this.socket.emit('webrtc:answer', {
            targetSocketId: fromId,
            toPeerId: fromId,
            answer: pc.localDescription || answer,
          });
          // Obs: se estivermos transmitindo e a oferta do colega não tinha m-lines de vídeo,
          // o onnegotiationneeded dispara sozinho ao voltar para 'stable' e envia a tela.
          // (O antigo setTimeout de 250ms aqui criava um loop infinito de ofertas quando 2 pessoas transmitiam.)
        } catch (err) {
          console.warn(`[WebRTC] Erro ao processar offer de ${fromId}: ${(err as Error)?.name} ${(err as Error)?.message}`);
        }
        });
      }
    );

    this.socket.on(
      'webrtc:answer',
      (payload: { fromSocketId?: string; fromPeerId?: string; answer: RTCSessionDescriptionInit }) => {
        const fromId = payload.fromSocketId || payload.fromPeerId;
        const answer = payload.answer;
        if (!fromId || !answer) return;

        this.enqueueSignal(fromId, async () => {
        try {
          const pc = this.peerConnections.get(fromId);
          if (pc && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await this.flushPendingCandidates(fromId, pc);
          }
        } catch (err) {
          console.warn(`[WebRTC] Erro ao processar answer de ${fromId}: ${(err as Error)?.name} ${(err as Error)?.message}`);
        }
        });
      }
    );

    this.socket.on(
      'webrtc:ice-candidate',
      (payload: { fromSocketId?: string; fromPeerId?: string; candidate: RTCIceCandidateInit }) => {
        const fromId = payload.fromSocketId || payload.fromPeerId;
        const candidate = payload.candidate;
        if (!fromId || !candidate) return;

        this.enqueueSignal(fromId, async () => {
        // Nunca descarta candidatos só porque uma oferta foi ignorada: o flag ignoreOffer
        // continuava true depois da colisão e todos os candidatos seguintes eram jogados fora,
        // deixando espectadores sem conexão (tela preta) em alguns pares.
        const pc = this.peerConnections.get(fromId);
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {
            // Candidato obsoleto (ex.: pertencia a uma oferta ignorada durante colisão)
          }
        } else {
          const list = this.pendingCandidates.get(fromId) || [];
          list.push(candidate);
          this.pendingCandidates.set(fromId, list);
        }
        });
      }
    );

    // O colega pediu para refazer a conexão: descarta a nossa e aguarda a oferta nova dele
    this.socket.on('webrtc:reset', (payload: { fromSocketId?: string }) => {
      const fromId = payload?.fromSocketId;
      if (!fromId) return;
      this.lastHealAt.set(fromId, Date.now());
      this.closePeerConnection(fromId);
      this.onPeerDisconnected?.(fromId);
    });

    this.socket.on('voice:peer-left', (payload: { socketId?: string; peerId?: string }) => {
      const leftId = payload.socketId || payload.peerId;
      if (!leftId) return;
      this.closePeerConnection(leftId);
      this.onPeerDisconnected?.(leftId);
    });
  }

  public async connectToPeer(targetSocketId: string) {
    if (!targetSocketId || targetSocketId === this.socket.id) return;
    const pc = this.getOrCreatePeerConnection(targetSocketId);
    // Sem microfone nem tela, a oferta sairia sem nenhuma mídia e o ICE nem começaria:
    // pede só para receber, assim quem não tem microfone ainda vê e ouve os outros.
    if (pc.getTransceivers().length === 0) {
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    }
    // A oferta sai pelo onnegotiationneeded (disparado ao adicionar tracks/transceivers).
    // Chamar renegotiate aqui também gerava ofertas duplicadas, que colidiam com a do colega.
  }

  /**
   * Fecha conexões com peers que não estão mais na sala atual (ex.: ao trocar de canal de voz
   * sem desconectar, as conexões da sala antiga continuavam abertas recebendo/enviando a tela).
   */
  public closePeersExcept(keepPeerIds: string[]) {
    const keep = new Set(keepPeerIds);
    for (const peerId of Array.from(this.peerConnections.keys())) {
      if (!keep.has(peerId)) {
        this.closePeerConnection(peerId);
        this.onPeerDisconnected?.(peerId);
      }
    }
  }

  private startRemoteSpeakingMonitor() {
    if (this.remoteSpeakingInterval) clearInterval(this.remoteSpeakingInterval);
    const freqData = new Uint8Array(128);

    this.remoteSpeakingInterval = window.setInterval(() => {
      if (this.remoteVoiceAnalysers.size === 0) {
        if (this.lastRemoteSpeakingKey !== '') {
          this.lastRemoteSpeakingKey = '';
          this.onRemoteSpeakingChange?.([]);
        }
        return;
      }

      const speakingPeers: string[] = [];
      for (const [peerId, { analyser }] of this.remoteVoiceAnalysers.entries()) {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const avg = sum / freqData.length;
        if (avg > 12) {
          speakingPeers.push(peerId);
        }
      }

      const key = speakingPeers.sort().join(',');
      if (key !== this.lastRemoteSpeakingKey) {
        this.lastRemoteSpeakingKey = key;
        this.onRemoteSpeakingChange?.(speakingPeers);
      }
    }, 100);
  }

  private registerRemoteVoiceForAntiEcho(peerId: string, stream: MediaStream) {
    try {
      if (stream.getAudioTracks().length === 0) return;
      const ctx = this.getAudioContext();
      const existing = this.remoteVoiceAnalysers.get(peerId);
      if (existing) {
        try {
          existing.source.disconnect();
        } catch {}
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.remoteVoiceAnalysers.set(peerId, { source, analyser });
    } catch {
      // Ignora caso o stream ainda não possua áudio ativo
    }
  }

  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId)!;
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(peerId, pc);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        const already = pc.getSenders().some((s) => s.track === track);
        if (!already) {
          pc.addTrack(track, this.localStream!);
        }
      });
    }

    if (this.screenStream) {
      // Adiciona o vídeo primeiro e o áudio da tela em seguida para manter o agrupamento do MediaStream
      const orderedScreenTracks = [
        ...this.screenStream.getVideoTracks(),
        ...this.screenStream.getAudioTracks(),
      ];
      orderedScreenTracks.forEach((track) => {
        const already = pc.getSenders().some((s) => s.track === track);
        if (!already) {
          const sender = pc.addTrack(track, this.screenStream!);
          // Quem entra na sala depois também recebe o bitrate/FPS do preset escolhido
          if (track.kind === 'video' && this.currentScreenPreset) {
            const preset = QUALITY_PRESETS[this.currentScreenPreset];
            this.applyBitrateLimit(sender, preset.bitrateKbps, preset.fps);
          }
        }
      });
    }

    // Toda mudança de tracks (mic, tela, ICE restart) dispara uma nova oferta automaticamente
    pc.onnegotiationneeded = () => {
      this.renegotiate(peerId, pc);
    };

    // Se uma oferta foi pedida enquanto outra negociação estava em andamento, envia assim que estabilizar
    pc.onsignalingstatechange = () => {
      if (pc.signalingState !== 'stable') return;
      // Reenvia se havia pedido pendente OU se alguma track nossa (ex.: a tela) ainda não foi negociada.
      // O segundo caso cobre quem entra na sala com a live já rolando: o navegador nem sempre dispara
      // onnegotiationneeded de novo depois de responder a oferta do recém-chegado.
      if (this.pendingRenegotiation.delete(peerId) || this.hasUnnegotiatedTracks(pc)) {
        window.setTimeout(() => this.renegotiate(peerId, pc), 0);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice-candidate', {
          targetSocketId: peerId,
          toPeerId: peerId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      event.track.enabled = true;

      const existingScreenStream = this.peerScreenStreams.get(peerId);

      // Identifica o primeiro stream somente de áudio (que não pertença ao stream de tela) como o microfone
      if (
        event.track.kind === 'audio' &&
        remoteStream.getVideoTracks().length === 0 &&
        !this.peerMicStreamIds.has(peerId) &&
        (!existingScreenStream || existingScreenStream.id !== remoteStream.id)
      ) {
        this.peerMicStreamIds.set(peerId, remoteStream.id);
      }

      const isMicStream =
        this.peerMicStreamIds.get(peerId) === remoteStream.id &&
        remoteStream.getVideoTracks().length === 0;
      const isScreen =
        event.track.kind === 'video' ||
        remoteStream.getVideoTracks().length > 0 ||
        !isMicStream;

      if (isScreen) {
        let targetScreenStream = remoteStream;
        if (event.track.kind === 'video') {
          this.peerScreenStreams.set(peerId, remoteStream);
        } else if (event.track.kind === 'audio' && existingScreenStream) {
          if (!existingScreenStream.getAudioTracks().some((t) => t.id === event.track.id)) {
            existingScreenStream.addTrack(event.track);
          }
          targetScreenStream = existingScreenStream;
        }
        // Passa a instância NAtiva de MediaStream do WebRTC para o Chromium renderizar o áudio sem bloqueio!
        this.onRemoteStream?.(peerId, targetScreenStream, true);
      } else {
        this.onRemoteStream?.(peerId, remoteStream, false);
        if (event.track.kind === 'audio') {
          this.registerRemoteVoiceForAntiEcho(peerId, remoteStream);
        }
      }

      if (event.track.kind === 'video') {
        event.track.onended = () => {
          this.peerScreenStreams.delete(peerId);
          this.onRemoteScreenRemoved?.(peerId);
        };
        event.track.onunmute = () => {
          const activeScreen = this.peerScreenStreams.get(peerId) || remoteStream;
          this.onRemoteStream?.(peerId, activeScreen, true);
        };
      }

      if (event.track.kind === 'audio' && isScreen) {
        event.track.onunmute = () => {
          const activeScreen = this.peerScreenStreams.get(peerId) || remoteStream;
          this.onRemoteStream?.(peerId, activeScreen, true);
        };
      }

      remoteStream.onaddtrack = (e) => {
        e.track.enabled = true;
        const nowHasVideo = e.track.kind === 'video' || remoteStream.getVideoTracks().length > 0;
        const streamIsScreen =
          nowHasVideo || this.peerMicStreamIds.get(peerId) !== remoteStream.id;
        if (streamIsScreen) {
          this.peerScreenStreams.set(peerId, remoteStream);
        }
        this.onRemoteStream?.(peerId, remoteStream, streamIsScreen);
      };

      remoteStream.onremovetrack = (e) => {
        if (e.track.kind === 'video' && remoteStream.getVideoTracks().length === 0) {
          this.peerScreenStreams.delete(peerId);
          this.onRemoteScreenRemoved?.(peerId);
        }
      };
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try {
          // restartIce() dispara onnegotiationneeded, que envia a oferta de reconexão
          pc.restartIce();
        } catch {}
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (this.peerConnections.get(peerId) === pc) {
        this.onPeerConnectionState?.(peerId, state);
      }
      if (state === 'connected') {
        const timer = this.iceFailureTimers.get(peerId);
        if (timer) {
          clearTimeout(timer);
          this.iceFailureTimers.delete(peerId);
        }
      } else if (state === 'failed') {
        // Antes o peer era fechado na hora, matando o ICE restart que acabou de começar.
        // Agora dá 15s para a reconexão funcionar antes de desistir.
        if (!this.iceFailureTimers.has(peerId)) {
          const timer = window.setTimeout(() => {
            this.iceFailureTimers.delete(peerId);
            if (this.peerConnections.get(peerId) === pc && pc.connectionState !== 'connected') {
              this.closePeerConnection(peerId);
              this.onPeerDisconnected?.(peerId);
            }
          }, 15000);
          this.iceFailureTimers.set(peerId, timer);
        }
      } else if (state === 'closed') {
        this.closePeerConnection(peerId);
        this.onPeerDisconnected?.(peerId);
      }
    };

    return pc;
  }

  private buildAudioConstraints(): MediaTrackConstraints {
    const s = this.audioSettings;
    const isIsolation = s.inputProfile === 'isolation';
    const isStudio = s.inputProfile === 'studio';

    const constraints: MediaTrackConstraints = {
      echoCancellation: isIsolation ? true : isStudio ? false : s.echoCancellation,
      noiseSuppression: isIsolation ? true : isStudio ? false : s.noiseSuppression,
      autoGainControl: isIsolation ? true : isStudio ? false : s.autoGainControl,
      channelCount: isStudio ? 2 : 1,
      sampleRate: 48000,
    };

    if (s.inputDeviceId && s.inputDeviceId !== 'default') {
      constraints.deviceId = { ideal: s.inputDeviceId };
    }

    return constraints;
  }

  public async startMicrophone(): Promise<MediaStream> {
    if (this.localStream && this.localStream.getAudioTracks().some((t) => t.readyState === 'live')) {
      return this.localStream;
    }

    try {
      this.rawMicStream = await navigator.mediaDevices.getUserMedia({
        audio: this.buildAudioConstraints(),
        video: false,
      });
    } catch {
      this.rawMicStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    }

    this.setupMicProcessingPipeline(this.rawMicStream);

    for (const pc of this.peerConnections.values()) {
      const audioTrack = this.localStream?.getAudioTracks()[0];
      if (audioTrack && this.localStream) {
        const screenAudioTracks = this.screenStream ? this.screenStream.getAudioTracks() : [];
        const existingAudioSender = pc
          .getSenders()
          .find((s) => s.track && s.track.kind === 'audio' && !screenAudioTracks.includes(s.track));
        if (existingAudioSender) {
          await existingAudioSender.replaceTrack(audioTrack);
        } else {
          // onnegotiationneeded envia a oferta com o microfone novo
          pc.addTrack(audioTrack, this.localStream);
        }
      }
    }

    return this.localStream!;
  }

  private setupMicProcessingPipeline(rawStream: MediaStream) {
    try {
      const ctx = this.getAudioContext();

      if (this.micSourceNode) {
        try {
          this.micSourceNode.disconnect();
        } catch {}
      }

      this.micSourceNode = ctx.createMediaStreamSource(rawStream);
      if (!this.micGainNode) {
        this.micGainNode = ctx.createGain();
      }
      this.micGainNode.gain.value = this.isMuted ? 0 : this.audioSettings.inputVolume / 100;

      if (!this.analyser) {
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;
      }

      if (!this.micDestinationNode) {
        this.micDestinationNode = ctx.createMediaStreamDestination();
      }

      this.micSourceNode.connect(this.analyser);
      this.micSourceNode.connect(this.micGainNode);
      this.micGainNode.connect(this.micDestinationNode);

      this.localStream = this.micDestinationNode.stream;
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !this.isMuted;
      });

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      let lastState = false;

      if (this.speakingInterval) clearInterval(this.speakingInterval);
      this.speakingInterval = window.setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;

        this.onMicLevelChange?.(Math.min(100, Math.round((average / 65) * 100)));

        const threshold = this.audioSettings.autoSensitivity ? 14 : this.audioSettings.sensitivityThreshold;
        const isSpeaking = !this.isMuted && average > threshold;

        if (this.micGainNode && this.audioContext) {
          const baseGain = this.isMuted ? 0 : this.audioSettings.inputVolume / 100;
          const targetGain =
            this.isMuted || (!this.audioSettings.autoSensitivity && !isSpeaking) ? 0 : baseGain;
          this.micGainNode.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.015);
        }

        if (isSpeaking !== lastState) {
          lastState = isSpeaking;
          this.onSpeakingChange?.(isSpeaking);
        }
      }, 80);
    } catch (e) {
      console.warn('Fallback para stream de microfone direto:', e);
      this.localStream = rawStream;
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !this.isMuted;
      });
    }
  }

  public async updateAudioSettings(newSettings: AudioSettings) {
    const prev = this.audioSettings;
    this.audioSettings = { ...newSettings };

    if (this.micGainNode && this.audioContext) {
      const targetGain = this.isMuted ? 0 : newSettings.inputVolume / 100;
      this.micGainNode.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.02);
    }

    const needHardwareRestart =
      prev.inputDeviceId !== newSettings.inputDeviceId ||
      prev.inputProfile !== newSettings.inputProfile ||
      prev.echoCancellation !== newSettings.echoCancellation ||
      prev.noiseSuppression !== newSettings.noiseSuppression ||
      prev.autoGainControl !== newSettings.autoGainControl;

    if (needHardwareRestart && this.rawMicStream) {
      try {
        const oldRaw = this.rawMicStream;
        this.rawMicStream = await navigator.mediaDevices.getUserMedia({
          audio: this.buildAudioConstraints(),
          video: false,
        });
        oldRaw.getTracks().forEach((t) => t.stop());
        this.setupMicProcessingPipeline(this.rawMicStream);

        const newProcessedTrack = this.localStream?.getAudioTracks()[0];
        if (newProcessedTrack) {
          const screenAudioTracks = this.screenStream ? this.screenStream.getAudioTracks() : [];
          for (const pc of this.peerConnections.values()) {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === 'audio' && !screenAudioTracks.includes(s.track));
            if (sender) {
              await sender.replaceTrack(newProcessedTrack);
            }
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Erro ao trocar dispositivo de microfone:', err);
      }
    }
  }

  public setMicrophoneMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (this.rawMicStream) {
      this.rawMicStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (this.micGainNode && this.audioContext) {
      this.micGainNode.gain.setTargetAtTime(
        muted ? 0 : this.audioSettings.inputVolume / 100,
        this.audioContext.currentTime,
        0.015
      );
    }
    if (muted) {
      this.onSpeakingChange?.(false);
    }
  }

  /**
   * Mantém a track nativa de áudio do sistema sempre ativa e desativa filtros de cancelamento de eco
   * na track de loopback (evitando que o Chromium subtraia o próprio som do jogo/sistema!)
   */
  private setupAntiEchoOnScreenStream(rawStream: MediaStream): MediaStream {
    if (this.antiEchoInterval) {
      clearInterval(this.antiEchoInterval);
      this.antiEchoInterval = null;
    }

    const audioTracks = rawStream.getAudioTracks();
    for (const track of audioTracks) {
      track.enabled = true;
      if ('contentHint' in track) {
        try {
          (track as any).contentHint = 'music';
        } catch {}
      }
    }

    // Mantém a track de áudio da tela sempre habilitada enquanto a transmissão estiver ativa
    this.antiEchoInterval = window.setInterval(() => {
      if (!this.screenStream) return;
      for (const track of this.screenStream.getAudioTracks()) {
        if (!track.enabled) {
          track.enabled = true;
        }
      }
    }, 1000);

    return rawStream;
  }

  /**
   * Inicia captura nativa de áudio do Windows (48kHz Estéreo) EXCLUINDO o Discord (VAD\Process_Loopback)
   */
  private async startDiscordFreeAudioTrack(): Promise<MediaStreamTrack | null> {
    this.stopDiscordFreeAudioTrack();

    if (!window.electronAPI?.startProcessAudioCapture || !window.electronAPI?.onProcessAudioData) {
      return null;
    }

    try {
      const res = await window.electronAPI.startProcessAudioCapture();
      if (!res?.success) {
        console.warn('[WebRTC] Helper de áudio sem Discord não iniciou:', res?.error);
        return null;
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
      this.screenAudioContext = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      const workletCode = `
        class JoltPcmProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.maxFrames = 48000;
            this.leftBuf = new Float32Array(this.maxFrames);
            this.rightBuf = new Float32Array(this.maxFrames);
            this.readIdx = 0;
            this.writeIdx = 0;
            this.available = 0;
            this.port.onmessage = (e) => {
              const bytes = e.data;
              if (!bytes || !bytes.byteLength) return;
              const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
              const frames = Math.floor(int16.length / 2);
              if (this.available + frames > 4320) {
                const drop = (this.available + frames) - 2400;
                if (drop > 0 && drop <= this.available) {
                  this.readIdx = (this.readIdx + drop) % this.maxFrames;
                  this.available -= drop;
                }
              }
              for (let i = 0; i < frames; i++) {
                this.leftBuf[this.writeIdx] = int16[i * 2] / 32768.0;
                this.rightBuf[this.writeIdx] = int16[i * 2 + 1] / 32768.0;
                this.writeIdx = (this.writeIdx + 1) % this.maxFrames;
              }
              this.available = Math.min(this.maxFrames, this.available + frames);
            };
          }
          process(_inputs, outputs) {
            const out = outputs[0];
            if (!out || out.length === 0) return true;
            const outL = out[0];
            const outR = out.length > 1 ? out[1] : null;
            const len = outL.length;
            for (let i = 0; i < len; i++) {
              if (this.available > 0) {
                outL[i] = this.leftBuf[this.readIdx];
                if (outR) outR[i] = this.rightBuf[this.readIdx];
                this.readIdx = (this.readIdx + 1) % this.maxFrames;
                this.available--;
              } else {
                outL[i] = 0;
                if (outR) outR[i] = 0;
              }
            }
            return true;
          }
        }
        registerProcessor('jolt-pcm-processor', JoltPcmProcessor);
      `;

      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        await ctx.audioWorklet.addModule(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }

      const workletNode = new AudioWorkletNode(ctx, 'jolt-pcm-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.screenAudioWorkletNode = workletNode;

      const destNode = ctx.createMediaStreamDestination();
      destNode.channelCount = 2;
      workletNode.connect(destNode);

      this.screenAudioUnsubscribe = window.electronAPI.onProcessAudioData((chunk) => {
        if (this.screenAudioContext?.state === 'suspended') {
          this.screenAudioContext.resume().catch(() => {});
        }
        // Copia para um ArrayBuffer próprio (offset 0): o Buffer do Node pode chegar com byteOffset ímpar
        // vindo do pool interno, e `new Int16Array(buffer, offsetÍmpar)` lança RangeError no worklet,
        // descartando o pacote (estalos/silêncio no som da live). Transferir evita outra cópia.
        const aligned = new Uint8Array(chunk);
        workletNode.port.postMessage(aligned, [aligned.buffer]);
      });

      const track = destNode.stream.getAudioTracks()[0] || null;
      if (track) {
        track.enabled = true;
      }
      return track;
    } catch (err) {
      console.warn('[WebRTC] Erro ao iniciar captura de áudio sem Discord:', err);
      this.stopDiscordFreeAudioTrack();
      return null;
    }
  }

  private stopDiscordFreeAudioTrack() {
    if (this.screenAudioUnsubscribe) {
      try {
        this.screenAudioUnsubscribe();
      } catch {}
      this.screenAudioUnsubscribe = null;
    }
    if (this.screenAudioWorkletNode) {
      try {
        this.screenAudioWorkletNode.disconnect();
      } catch {}
      this.screenAudioWorkletNode = null;
    }
    if (this.screenAudioContext) {
      try {
        this.screenAudioContext.close().catch(() => {});
      } catch {}
      this.screenAudioContext = null;
    }
    if (window.electronAPI?.stopProcessAudioCapture) {
      window.electronAPI.stopProcessAudioCapture().catch(() => {});
    }
  }

  /**
   * Inicia o compartilhamento de tela com suporte completo a Áudio do Sistema (Desktop e Navegador)
   */
  public async startScreenShare(
    presetKey: StreamQualityPreset,
    sourceId?: string,
    shareAudio: boolean = true
  ): Promise<MediaStream> {
    const preset = QUALITY_PRESETS[presetKey];

    if (this.screenStream) {
      this.stopScreenShare();
    }

    let acquiredStream: MediaStream | null = null;

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: preset.width, max: preset.width },
      height: { ideal: preset.height, max: preset.height },
      frameRate: { ideal: preset.fps, max: preset.fps },
    };

    if (window.electronAPI?.isElectron) {
      // 1. Tenta iniciar a captura nativa do Windows que EXCLUI o Discord (VAD\Process_Loopback)
      let discordFreeAudioTrack: MediaStreamTrack | null = null;
      if (shareAudio) {
        discordFreeAudioTrack = await this.startDiscordFreeAudioTrack();
      }

      const needFallbackSystemAudio = shareAudio && !discordFreeAudioTrack;

      try {
        if (sourceId) {
          await window.electronAPI.selectDesktopSource({
            sourceId,
            shareAudio: needFallbackSystemAudio,
          });
        }

        const loopbackAudioConstraints: MediaTrackConstraints | false = needFallbackSystemAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : false;

        try {
          // Pede a resolução/FPS do preset já na captura: sem isso o capturador inicia a 30 FPS
          // e o applyConstraints posterior nem sempre consegue subir a taxa.
          acquiredStream = await navigator.mediaDevices.getDisplayMedia({
            video: videoConstraints,
            audio: loopbackAudioConstraints,
          });
        } catch (err1) {
          console.warn('[WebRTC Electron] getDisplayMedia com constraints falhou, tentando sem:', err1);
          try {
            // Mesma captura (com o áudio loopback, se pedido), mas sem constraints de vídeo
            acquiredStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: loopbackAudioConstraints,
            });
          } catch (err2) {
            console.warn('[WebRTC Electron] getDisplayMedia falhou, tentando só vídeo:', err2);
            try {
              await window.electronAPI.selectDesktopSource({ sourceId: sourceId || '', shareAudio: false });
              acquiredStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
              });
            } catch (err3) {
              if (!sourceId) throw err3;
              acquiredStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    maxWidth: preset.width,
                    maxHeight: preset.height,
                    maxFrameRate: preset.fps,
                  },
                } as any,
              });
            }
          }
        }
      } catch (captureErr) {
        // Não deixa o helper nativo de áudio rodando se a captura de vídeo falhou de vez
        this.stopDiscordFreeAudioTrack();
        throw captureErr;
      }

      // Anexa a track de áudio estéreo limpa (sem Discord!) ao stream de vídeo
      if (acquiredStream && discordFreeAudioTrack) {
        acquiredStream.getAudioTracks().forEach((oldTrack) => {
          acquiredStream?.removeTrack(oldTrack);
          oldTrack.stop();
        });
        discordFreeAudioTrack.enabled = true;
        acquiredStream.addTrack(discordFreeAudioTrack);
      } else if (acquiredStream && needFallbackSystemAudio && acquiredStream.getAudioTracks().length === 0) {
        try {
          const loopbackStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                echoCancellation: false,
                googEchoCancellation: false,
                googAutoGainControl: false,
                googNoiseSuppression: false,
                googHighpassFilter: false,
              },
            } as any,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                maxWidth: 16,
                maxHeight: 16,
                maxFrameRate: 1,
              },
            } as any,
          });
          loopbackStream.getVideoTracks().forEach((vt) => vt.stop());
          const loopbackAudioTrack = loopbackStream.getAudioTracks()[0];
          if (loopbackAudioTrack) {
            loopbackAudioTrack.enabled = true;
            acquiredStream.addTrack(loopbackAudioTrack);
          }
        } catch (loopbackErr) {
          console.warn('[WebRTC Electron] Aviso ao capturar loopback complementar:', loopbackErr);
        }
      }
    } else {
      acquiredStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: preset.fps, max: preset.fps },
        },
        audio: shareAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              suppressLocalAudioPlayback: false,
              googEchoCancellation: false,
              googAutoGainControl: false,
              googNoiseSuppression: false,
              googHighpassFilter: false,
            }
          : false,
        systemAudio: 'include',
        windowAudio: 'system',
        selfBrowserSurface: 'exclude',
      } as any);
    }

    if (!acquiredStream) {
      throw new Error('Não foi possível obter a transmissão de tela.');
    }

    this.currentScreenPreset = presetKey;
    this.rawScreenStream = acquiredStream;
    this.screenStream = this.setupAntiEchoOnScreenStream(acquiredStream);

    const videoTrack = this.screenStream.getVideoTracks()[0];
    if (videoTrack) {
      if ('contentHint' in videoTrack) {
        videoTrack.contentHint = 'motion';
      }

      try {
        await videoTrack.applyConstraints({
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: preset.fps, max: preset.fps },
        });
      } catch (constraintErr) {
        console.warn('[WebRTC] Aviso ao aplicar constraints na captura:', constraintErr);
      }

      videoTrack.onended = () => {
        this.stopScreenShare();
        this.onScreenShareEnded?.();
      };
    }

    // Adiciona o vídeo primeiro e depois o áudio da tela em cada PeerConnection
    const orderedTracks = [
      ...this.screenStream.getVideoTracks(),
      ...this.screenStream.getAudioTracks(),
    ];

    // addTrack dispara onnegotiationneeded, que envia uma única oferta por peer
    for (const pc of this.peerConnections.values()) {
      for (const track of orderedTracks) {
        const sender = pc.addTrack(track, this.screenStream);
        if (track.kind === 'video') {
          await this.applyBitrateLimit(sender, preset.bitrateKbps, preset.fps);
        }
      }
    }

    return this.screenStream;
  }

  public async updateScreenQuality(presetKey: StreamQualityPreset) {
    if (!this.screenStream) return;
    const preset = QUALITY_PRESETS[presetKey];
    this.currentScreenPreset = presetKey;

    const videoTrack = this.screenStream.getVideoTracks()[0];
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: preset.fps, max: preset.fps },
        });
      } catch (e) {
        console.warn('[WebRTC] Aviso ao atualizar qualidade:', e);
      }
    }

    for (const pc of this.peerConnections.values()) {
      const senders = pc.getSenders();
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'video') {
          await this.applyBitrateLimit(sender, preset.bitrateKbps, preset.fps);
        }
      }
    }
  }

  private async applyBitrateLimit(sender: RTCRtpSender, maxBitrateKbps: number, maxFps: number) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = maxBitrateKbps * 1000;
      params.encodings[0].maxFramerate = maxFps;
      params.degradationPreference = 'maintain-framerate';
      await sender.setParameters(params);
    } catch (e) {
      console.warn('Aviso ao configurar bitrate WebRTC:', e);
    }
  }

  public stopScreenShare() {
    this.stopDiscordFreeAudioTrack();

    if (this.antiEchoInterval) {
      clearInterval(this.antiEchoInterval);
      this.antiEchoInterval = null;
    }

    this.currentScreenPreset = null;
    if (!this.screenStream && !this.rawScreenStream) return;

    const screenTracks = new Set([
      ...(this.screenStream ? this.screenStream.getTracks() : []),
      ...(this.rawScreenStream ? this.rawScreenStream.getTracks() : []),
    ]);

    screenTracks.forEach((track) => {
      track.onended = null;
      track.stop();
    });

    // removeTrack dispara onnegotiationneeded, que avisa o colega que a tela saiu
    for (const pc of this.peerConnections.values()) {
      const senders = pc.getSenders();
      senders.forEach((sender) => {
        if (sender.track && (screenTracks.has(sender.track) || sender.track.kind === 'video')) {
          try {
            pc.removeTrack(sender);
          } catch {}
        }
      });
    }

    this.screenStream = null;
    this.rawScreenStream = null;
  }

  private enhanceOpusSdp(sdp: string): string {
    return sdp.replace(/a=fmtp:111 (.*)/g, (_match, params) => {
      let updated = params;
      if (!updated.includes('stereo=')) updated += ';stereo=1;sprop-stereo=1';
      if (!updated.includes('maxaveragebitrate=')) updated += ';maxaveragebitrate=128000';
      if (!updated.includes('usedtx=')) updated += ';usedtx=0';
      return `a=fmtp:111 ${updated}`;
    });
  }

  private async renegotiate(peerId: string, pc?: RTCPeerConnection) {
    const conn = pc || this.peerConnections.get(peerId);
    if (!conn || conn.signalingState === 'closed') return;

    // Se já existe uma oferta em andamento (ou estamos respondendo o colega), não descarta o pedido:
    // marca como pendente e reenvia quando a conexão voltar a 'stable'. Antes, parar e iniciar a
    // transmissão em sequência fazia a segunda oferta ser abortada e o espectador nunca recebia a tela.
    if (this.makingOffer.get(peerId) || conn.signalingState !== 'stable') {
      this.pendingRenegotiation.add(peerId);
      return;
    }

    try {
      this.makingOffer.set(peerId, true);
      const offer = await conn.createOffer();
      if (conn.signalingState !== 'stable') {
        this.pendingRenegotiation.add(peerId);
        return;
      }
      if (offer.sdp) {
        offer.sdp = this.enhanceOpusSdp(offer.sdp);
      }
      await conn.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', {
        targetSocketId: peerId,
        toPeerId: peerId,
        offer: conn.localDescription || offer,
      });
    } catch (e) {
      // Colisão: a oferta do colega chegou entre o createOffer e o setLocalDescription.
      // ANTES a oferta era perdida — e com ela as tracks da tela —, e o navegador não dispara
      // onnegotiationneeded de novo, então aquele par ficava sem ver a transmissão para sempre.
      // Agora ela volta para a fila e é reenviada assim que a conexão estabilizar.
      if ((e as Error)?.name === 'InvalidStateError' && (conn.signalingState as RTCSignalingState) !== 'closed') {
        this.pendingRenegotiation.add(peerId);
        if (conn.signalingState === 'stable') {
          window.setTimeout(() => {
            if (this.pendingRenegotiation.delete(peerId)) this.renegotiate(peerId, conn);
          }, 150);
        }
      } else {
        console.error(`[WebRTC] Erro na renegociação com ${peerId}: ${(e as Error)?.name} ${(e as Error)?.message}`);
      }
    } finally {
      this.makingOffer.set(peerId, false);
    }
  }

  private closePeerConnection(peerId: string) {
    const analyserEntry = this.remoteVoiceAnalysers.get(peerId);
    if (analyserEntry) {
      try {
        analyserEntry.source.disconnect();
      } catch {}
      this.remoteVoiceAnalysers.delete(peerId);
    }

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.peerMicStreamIds.delete(peerId);
    this.peerScreenStreams.delete(peerId);
    this.makingOffer.delete(peerId);
    this.ignoreOffer.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.pendingRenegotiation.delete(peerId);
    this.signalChains.delete(peerId);
    const timer = this.iceFailureTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.iceFailureTimers.delete(peerId);
    }
  }

  public leaveAll() {
    this.expectedPeers.clear();
    this.lastHealAt.clear();
    this.stopDiscordFreeAudioTrack();

    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    if (this.antiEchoInterval) {
      clearInterval(this.antiEchoInterval);
      this.antiEchoInterval = null;
    }
    this.currentScreenPreset = null;
    this.remoteVoiceAnalysers.clear();
    this.peerMicStreamIds.clear();
    this.peerScreenStreams.clear();
    this.onRemoteSpeakingChange?.([]);

    if (this.rawScreenStream) {
      this.rawScreenStream.getTracks().forEach((t) => t.stop());
      this.rawScreenStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    if (this.rawMicStream) {
      this.rawMicStream.getTracks().forEach((t) => t.stop());
      this.rawMicStream = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.micSourceNode = null;
    this.micGainNode = null;
    this.micDestinationNode = null;
    this.analyser = null;

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    for (const peerId of this.peerConnections.keys()) {
      this.closePeerConnection(peerId);
    }
  }
}

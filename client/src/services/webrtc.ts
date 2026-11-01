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
  private makingOffer: Map<string, boolean> = new Map();
  private ignoreOffer: Map<string, boolean> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

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

  public onSpeakingChange?: (isSpeaking: boolean) => void;
  public onRemoteSpeakingChange?: (speakingPeerIds: string[]) => void;
  public onMicLevelChange?: (level: number) => void;
  public onRemoteStream?: (peerId: string, stream: MediaStream, isScreen: boolean) => void;
  public onRemoteScreenRemoved?: (peerId: string) => void;
  public onPeerDisconnected?: (peerId: string) => void;
  public onScreenShareEnded?: () => void;

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    iceCandidatePoolSize: 10,
  };

  constructor(socket: Socket, initialAudioSettings?: AudioSettings) {
    this.socket = socket;
    if (initialAudioSettings) {
      this.audioSettings = { ...initialAudioSettings };
    }
    this.setupSignaling();
    this.startRemoteSpeakingMonitor();
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

  private setupSignaling() {
    this.socket.on(
      'webrtc:offer',
      async (payload: { fromSocketId?: string; fromPeerId?: string; offer: RTCSessionDescriptionInit }) => {
        const fromId = payload.fromSocketId || payload.fromPeerId;
        const offer = payload.offer;
        if (!fromId || !offer) return;

        try {
          const pc = this.getOrCreatePeerConnection(fromId);
          const isPolite = (this.socket.id || '') < fromId;
          const offerCollision = this.makingOffer.get(fromId) || pc.signalingState !== 'stable';

          this.ignoreOffer.set(fromId, !isPolite && offerCollision);
          if (this.ignoreOffer.get(fromId)) {
            return;
          }

          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }),
              pc.setRemoteDescription(new RTCSessionDescription(offer)),
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
          }

          await this.flushPendingCandidates(fromId, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          this.socket.emit('webrtc:answer', {
            targetSocketId: fromId,
            toPeerId: fromId,
            answer: pc.localDescription || answer,
          });

          // Se estivermos compartilhando tela e o offer inicial do colega não tinha vídeo/áudio extra,
          // renegociamos em seguida para enviar nossa transmissão completa (vídeo + som da tela)!
          if (this.screenStream) {
            setTimeout(() => {
              if (pc.signalingState === 'stable') {
                this.renegotiate(fromId, pc);
              }
            }, 250);
          }
        } catch (err) {
          console.warn('[WebRTC] Erro ao processar offer:', err);
        }
      }
    );

    this.socket.on(
      'webrtc:answer',
      async (payload: { fromSocketId?: string; fromPeerId?: string; answer: RTCSessionDescriptionInit }) => {
        const fromId = payload.fromSocketId || payload.fromPeerId;
        const answer = payload.answer;
        if (!fromId || !answer) return;

        try {
          const pc = this.peerConnections.get(fromId);
          if (pc && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await this.flushPendingCandidates(fromId, pc);
          }
        } catch (err) {
          console.warn('[WebRTC] Erro ao processar answer:', err);
        }
      }
    );

    this.socket.on(
      'webrtc:ice-candidate',
      async (payload: { fromSocketId?: string; fromPeerId?: string; candidate: RTCIceCandidateInit }) => {
        const fromId = payload.fromSocketId || payload.fromPeerId;
        const candidate = payload.candidate;
        if (!fromId || !candidate) return;

        try {
          if (this.ignoreOffer.get(fromId)) return;
          const pc = this.getOrCreatePeerConnection(fromId);
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            const list = this.pendingCandidates.get(fromId) || [];
            list.push(candidate);
            this.pendingCandidates.set(fromId, list);
          }
        } catch {
          // Ignora candidatos ICE obsoletos durante renegociação
        }
      }
    );

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
    await this.renegotiate(targetSocketId, pc);
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
          pc.addTrack(track, this.screenStream!);
        }
      });
    }

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

      // Identifica o primeiro stream somente de áudio como o microfone do participante;
      // qualquer outro stream ou stream com vídeo é a transmissão de tela (com seu respectivo áudio!)
      if (
        event.track.kind === 'audio' &&
        remoteStream.getVideoTracks().length === 0 &&
        !this.peerMicStreamIds.has(peerId)
      ) {
        this.peerMicStreamIds.set(peerId, remoteStream.id);
      }

      const isMicStream = this.peerMicStreamIds.get(peerId) === remoteStream.id && remoteStream.getVideoTracks().length === 0;
      const isScreen =
        event.track.kind === 'video' ||
        remoteStream.getVideoTracks().length > 0 ||
        !isMicStream;

      // Criamos uma nova instância MediaStream com todas as tracks atuais para que o React
      // detecte imediatamente quando a track de áudio da tela se junta à track de vídeo!
      const freshStream = new MediaStream(remoteStream.getTracks());
      this.onRemoteStream?.(peerId, freshStream, isScreen);

      if (!isScreen && event.track.kind === 'audio') {
        this.registerRemoteVoiceForAntiEcho(peerId, freshStream);
      }

      if (event.track.kind === 'video') {
        event.track.onended = () => {
          this.onRemoteScreenRemoved?.(peerId);
        };
        event.track.onmute = () => {
          if (remoteStream.getVideoTracks().every((t) => t.readyState === 'ended' || t.muted)) {
            setTimeout(() => {
              if (remoteStream.getVideoTracks().every((t) => t.readyState === 'ended' || t.muted)) {
                this.onRemoteScreenRemoved?.(peerId);
              }
            }, 900);
          }
        };
        event.track.onunmute = () => {
          this.onRemoteStream?.(peerId, new MediaStream(remoteStream.getTracks()), true);
        };
      }

      remoteStream.onaddtrack = (e) => {
        const nowHasVideo = e.track.kind === 'video' || remoteStream.getVideoTracks().length > 0;
        const streamIsScreen =
          nowHasVideo || this.peerMicStreamIds.get(peerId) !== remoteStream.id;
        this.onRemoteStream?.(peerId, new MediaStream(remoteStream.getTracks()), streamIsScreen);
      };

      remoteStream.onremovetrack = (e) => {
        if (e.track.kind === 'video' && remoteStream.getVideoTracks().length === 0) {
          this.onRemoteScreenRemoved?.(peerId);
        }
      };
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try {
          pc.restartIce();
          this.renegotiate(peerId, pc);
        } catch {}
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
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

    for (const [peerId, pc] of this.peerConnections.entries()) {
      const audioTrack = this.localStream?.getAudioTracks()[0];
      if (audioTrack && this.localStream) {
        const screenAudioTracks = this.screenStream ? this.screenStream.getAudioTracks() : [];
        const existingAudioSender = pc
          .getSenders()
          .find((s) => s.track && s.track.kind === 'audio' && !screenAudioTracks.includes(s.track));
        if (existingAudioSender) {
          await existingAudioSender.replaceTrack(audioTrack);
        } else {
          pc.addTrack(audioTrack, this.localStream);
          await this.renegotiate(peerId, pc);
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
   * Mantém a track nativa de áudio do sistema intacta (para evitar o bug de silêncio do WebAudio no Chromium)
   * e aplica o gate Anti-Eco diretamente em `rawAudioTrack.enabled` sempre que um colega na call falar!
   */
  private setupAntiEchoOnScreenStream(rawStream: MediaStream): MediaStream {
    const audioTracks = rawStream.getAudioTracks();
    if (audioTracks.length === 0) {
      return rawStream;
    }

    const screenAudioTrack = audioTracks[0];

    if (this.antiEchoInterval) {
      clearInterval(this.antiEchoInterval);
    }

    const freqData = new Uint8Array(128);
    this.antiEchoInterval = window.setInterval(() => {
      if (screenAudioTrack.readyState !== 'live') return;

      let remoteSpeakingNow = false;
      for (const { analyser } of this.remoteVoiceAnalysers.values()) {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const avg = sum / freqData.length;
        if (avg > 12) {
          remoteSpeakingNow = true;
          break;
        }
      }

      // Silencia instantaneamente o loopback enquanto um amigo fala na call para não dar eco da voz dele
      const shouldEnable = !remoteSpeakingNow;
      if (screenAudioTrack.enabled !== shouldEnable) {
        screenAudioTrack.enabled = shouldEnable;
      }
    }, 40);

    return rawStream;
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

    if (window.electronAPI?.isElectron) {
      if (sourceId) {
        await window.electronAPI.selectDesktopSource({ sourceId, shareAudio });
      }

      try {
        // No Electron, passamos `audio: shareAudio` (boolean) para que o setDisplayMediaRequestHandler
        // conecte o loopback nativo do Windows sem rejeitar as constraints!
        acquiredStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: shareAudio,
        });
      } catch (err1) {
        console.warn('[WebRTC Electron] Tentativa com áudio falhou, tentando vídeo e capturando áudio em separado:', err1);
        try {
          await window.electronAPI.selectDesktopSource({ sourceId: sourceId || '', shareAudio: false });
          acquiredStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });
        } catch (err2) {
          if (sourceId) {
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
          } else {
            throw err2;
          }
        }
      }

      // Se o usuário pediu para compartilhar áudio e por algum motivo a captura de janela veio sem track de áudio,
      // captura explicitamente a track de loopback desktop do Windows e junta ao stream!
      if (acquiredStream && shareAudio && acquiredStream.getAudioTracks().length === 0) {
        try {
          const loopbackStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
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
            }
          : false,
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
      } as any);
    }

    if (!acquiredStream) {
      throw new Error('Não foi possível obter a transmissão de tela.');
    }

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

    for (const [peerId, pc] of this.peerConnections.entries()) {
      for (const track of orderedTracks) {
        const sender = pc.addTrack(track, this.screenStream);
        if (track.kind === 'video') {
          await this.applyBitrateLimit(sender, preset.bitrateKbps, preset.fps);
        }
      }
      await this.renegotiate(peerId, pc);
    }

    return this.screenStream;
  }

  public async updateScreenQuality(presetKey: StreamQualityPreset) {
    if (!this.screenStream) return;
    const preset = QUALITY_PRESETS[presetKey];

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
    if (this.antiEchoInterval) {
      clearInterval(this.antiEchoInterval);
      this.antiEchoInterval = null;
    }

    if (!this.screenStream && !this.rawScreenStream) return;

    const screenTracks = new Set([
      ...(this.screenStream ? this.screenStream.getTracks() : []),
      ...(this.rawScreenStream ? this.rawScreenStream.getTracks() : []),
    ]);

    screenTracks.forEach((track) => {
      track.onended = null;
      track.stop();
    });

    for (const [peerId, pc] of this.peerConnections.entries()) {
      const senders = pc.getSenders();
      senders.forEach((sender) => {
        if (sender.track && (screenTracks.has(sender.track) || sender.track.kind === 'video')) {
          try {
            pc.removeTrack(sender);
          } catch {}
        }
      });
      this.renegotiate(peerId, pc);
    }

    this.screenStream = null;
    this.rawScreenStream = null;
  }

  private async renegotiate(peerId: string, pc?: RTCPeerConnection) {
    const conn = pc || this.peerConnections.get(peerId);
    if (!conn) return;

    try {
      this.makingOffer.set(peerId, true);
      const offer = await conn.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      if (conn.signalingState !== 'stable') return;
      await conn.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', {
        targetSocketId: peerId,
        toPeerId: peerId,
        offer: conn.localDescription || offer,
      });
    } catch (e) {
      console.error('Erro na renegociação WebRTC:', e);
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
    this.makingOffer.delete(peerId);
    this.ignoreOffer.delete(peerId);
    this.pendingCandidates.delete(peerId);
  }

  public leaveAll() {
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    if (this.antiEchoInterval) {
      clearInterval(this.antiEchoInterval);
      this.antiEchoInterval = null;
    }
    this.remoteVoiceAnalysers.clear();
    this.peerMicStreamIds.clear();
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

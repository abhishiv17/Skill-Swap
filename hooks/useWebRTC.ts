'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/* ─── Types ─── */
export interface UseWebRTCOptions {
  sessionId: string;
  userId: string;
  /** true = this user creates the offer (caller) */
  isCaller: boolean;
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  screenSharing: boolean;
  connectionState: RTCPeerConnectionState | 'new';
  toggleCamera: () => void;
  toggleMic: () => void;
  toggleScreenShare: () => Promise<void>;
  hangUp: () => void;
  reconnect: () => void;
}

/* ─── ICE config with STUN + TURN (multiple protocols for firewall bypass) ─── */
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'e8dd65c092bfccf46b5c1953',
      credential: 'sPaZ8oMLkLfTYDgf',
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'e8dd65c092bfccf46b5c1953',
      credential: 'sPaZ8oMLkLfTYDgf',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'e8dd65c092bfccf46b5c1953',
      credential: 'sPaZ8oMLkLfTYDgf',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'e8dd65c092bfccf46b5c1953',
      credential: 'sPaZ8oMLkLfTYDgf',
    },
  ],
  iceCandidatePoolSize: 10,
  // Prefer relay to guarantee connectivity on campus/public WiFi
  iceTransportPolicy: 'all',
};

/* ─── Signaling message types ─── */
type SignalType = 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'ready' | 'renegotiate';

interface SignalPayload {
  type: SignalType;
  sender: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
}

/* ─── Hook ─── */
export function useWebRTC({
  sessionId,
  userId,
  isCaller,
}: UseWebRTCOptions): UseWebRTCReturn {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const supabaseRef = useRef(createClient());
  const makingOfferRef = useRef(false);
  const peerReadyRef = useRef(false);
  const isCleanedUpRef = useRef(false);
  const reconnectTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState | 'new'>('new');

  /* ── Clear all pending reconnect timers ── */
  const clearTimers = useCallback(() => {
    reconnectTimersRef.current.forEach(clearTimeout);
    reconnectTimersRef.current = [];
  }, []);

  /* ── Safe timer helper (auto-tracked for cleanup) ── */
  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    reconnectTimersRef.current.push(id);
    return id;
  }, []);

  /* ── Broadcast signal via Supabase channel ── */
  const broadcast = useCallback(
    (payload: SignalPayload) => {
      if (isCleanedUpRef.current) return;
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload,
      });
    },
    [],
  );

  /* ── Create offer (called by polite/impolite negotiation) ── */
  const createAndSendOffer = useCallback(
    async (pc: RTCPeerConnection) => {
      if (isCleanedUpRef.current) return;
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer();
        // Check state hasn't changed while we awaited
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        broadcast({ type: 'offer', sender: userId, data: pc.localDescription!.toJSON() });
      } catch (err) {
        console.error('[WebRTC] createOffer error:', err);
      } finally {
        makingOfferRef.current = false;
      }
    },
    [broadcast, userId],
  );

  /* ── initialise media + peer connection ── */
  useEffect(() => {
    if (!sessionId || !userId) return;

    let isMounted = true;
    isCleanedUpRef.current = false;
    const supabase = supabaseRef.current;
    const pendingCandidates: RTCIceCandidateInit[] = [];

    async function init() {
      /* 1. Get local media — graceful fallback chain */
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 360, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (mediaErr) {
        console.warn('[WebRTC] Camera+mic failed, trying audio-only…', mediaErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          if (isMounted) setCameraOn(false);
        } catch {
          console.warn('[WebRTC] No media devices — proceeding as receive-only');
          stream = new MediaStream();
          if (isMounted) {
            setCameraOn(false);
            setMicOn(false);
          }
        }
      }

      if (!isMounted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setLocalStream(stream);

      /* 2. Create peer connection */
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      /* Add local tracks */
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      /* Remote stream container */
      const remote = new MediaStream();
      if (isMounted) setRemoteStream(remote);

      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => {
          if (!remote.getTracks().find((rt) => rt.id === t.id)) {
            remote.addTrack(t);
          }
        });
        // Force React to see new tracks by creating a new MediaStream reference
        if (isMounted) setRemoteStream(new MediaStream(remote.getTracks()));
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          broadcast({
            type: 'ice-candidate',
            sender: userId,
            data: e.candidate.toJSON(),
          });
        }
      };

      /* ── Connection state monitoring with auto-recovery ── */
      pc.onconnectionstatechange = () => {
        if (!isMounted) return;
        const state = pc.connectionState;
        setConnectionState(state);
        console.log('[WebRTC] Connection state:', state);

        if (state === 'failed') {
          console.warn('[WebRTC] Connection failed — restarting ICE');
          pc.restartIce();
          if (isCaller) createAndSendOffer(pc);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (!isMounted) return;
        const state = pc.iceConnectionState;
        console.log('[WebRTC] ICE state:', state);

        if (state === 'disconnected') {
          // Wait 5s for natural ICE recovery before forcing restart
          safeTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              console.warn('[WebRTC] ICE still down — forcing restart');
              pc.restartIce();
              if (isCaller) createAndSendOffer(pc);
            }
          }, 5000);
        }

        if (state === 'failed') {
          pc.restartIce();
          if (isCaller) createAndSendOffer(pc);
        }
      };

      /* Perfect negotiation: handle renegotiation needs */
      pc.onnegotiationneeded = async () => {
        if (isCaller && peerReadyRef.current) {
          await createAndSendOffer(pc);
        }
      };

      /* 3. Supabase Broadcast channel for signaling */
      const channel = supabase.channel(`webrtc-${sessionId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'signal' }, async ({ payload }) => {
          if (isCleanedUpRef.current) return;
          const msg = payload as SignalPayload;
          if (msg.sender === userId) return;

          try {
            /* ── Peer ready ── */
            if (msg.type === 'ready') {
              peerReadyRef.current = true;
              if (isCaller && pc.signalingState === 'stable') {
                await createAndSendOffer(pc);
              }
              return;
            }

            /* ── Renegotiation request ── */
            if (msg.type === 'renegotiate') {
              if (isCaller) await createAndSendOffer(pc);
              return;
            }

            /* ── Offer ── */
            if (msg.type === 'offer' && msg.data) {
              const offerCollision =
                makingOfferRef.current || pc.signalingState !== 'stable';
              const isPolite = !isCaller;

              if (offerCollision && !isPolite) return; // Impolite ignores

              if (offerCollision && isPolite) {
                try {
                  await pc.setLocalDescription({ type: 'rollback' });
                } catch {
                  // Rollback may fail on some browsers — safe to ignore
                }
              }

              await pc.setRemoteDescription(
                new RTCSessionDescription(msg.data as RTCSessionDescriptionInit),
              );

              // Flush buffered ICE candidates
              for (const c of pendingCandidates) {
                try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* skip stale */ }
              }
              pendingCandidates.length = 0;

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              broadcast({ type: 'answer', sender: userId, data: answer });
            }

            /* ── Answer ── */
            if (msg.type === 'answer' && msg.data) {
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(msg.data as RTCSessionDescriptionInit),
                );
                for (const c of pendingCandidates) {
                  try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* skip stale */ }
                }
                pendingCandidates.length = 0;
              }
            }

            /* ── ICE candidate ── */
            if (msg.type === 'ice-candidate' && msg.data) {
              try {
                if (pc.remoteDescription) {
                  await pc.addIceCandidate(new RTCIceCandidate(msg.data as RTCIceCandidateInit));
                } else {
                  pendingCandidates.push(msg.data as RTCIceCandidateInit);
                }
              } catch {
                // Non-fatal — candidate may be for a previous generation
              }
            }

            /* ── Hangup ── */
            if (msg.type === 'hangup') {
              pc.close();
              if (isMounted) setConnectionState('closed' as RTCPeerConnectionState);
            }
          } catch (err) {
            console.error('[WebRTC] Signal handler error:', err);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Tell the peer we're here
            broadcast({ type: 'ready', sender: userId, data: null });

            if (isCaller) {
              // Attempt offer after 1s (peer may already be subscribed)
              safeTimeout(async () => {
                if (pc.signalingState === 'stable' && !pc.remoteDescription) {
                  await createAndSendOffer(pc);
                }
              }, 1000);

              // Retry after 5s if still not connected (late-joiner race)
              safeTimeout(async () => {
                if (pc.iceConnectionState === 'new' || pc.iceConnectionState === 'checking') {
                  console.warn('[WebRTC] Not connected after 5s — retrying offer');
                  peerReadyRef.current = true;
                  await createAndSendOffer(pc);
                }
              }, 5000);

              // Final retry at 12s — absolute fallback
              safeTimeout(async () => {
                if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
                  console.warn('[WebRTC] Not connected after 12s — final retry');
                  pc.restartIce();
                  await createAndSendOffer(pc);
                }
              }, 12000);
            } else {
              // Callee: if not connected after 8s, ask caller to re-offer
              safeTimeout(() => {
                if (pc.iceConnectionState === 'new' || pc.iceConnectionState === 'checking') {
                  console.warn('[WebRTC] Callee not connected after 8s — requesting renegotiation');
                  broadcast({ type: 'renegotiate', sender: userId, data: null });
                }
              }, 8000);
            }
          }
        });

      channelRef.current = channel;
    }

    init().catch(console.error);

    return () => {
      isMounted = false;
      isCleanedUpRef.current = true;
      clearTimers();
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, isCaller]);

  /* ── toggle camera ── */
  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCameraOn(videoTrack.enabled);
    }
  }, []);

  /* ── toggle mic ── */
  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
    }
  }, []);

  /* ── toggle screen share (replaceTrack — no renegotiation needed) ── */
  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    const videoSender = pc
      .getSenders()
      .find((s) => s.track?.kind === 'video');
    if (!videoSender) return;

    if (!screenSharing) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as any,
          audio: false,
        });
        const screenTrack = displayStream.getVideoTracks()[0];

        // When user stops sharing via browser UI
        screenTrack.onended = () => {
          if (cameraTrackRef.current) {
            videoSender.replaceTrack(cameraTrackRef.current);
          }
          setScreenSharing(false);
        };

        await videoSender.replaceTrack(screenTrack);
        setScreenSharing(true);
      } catch {
        // User cancelled the screen picker — not an error
      }
    } else {
      if (cameraTrackRef.current) {
        await videoSender.replaceTrack(cameraTrackRef.current);
      }
      setScreenSharing(false);
    }
  }, [screenSharing]);

  /* ── hang up ── */
  const hangUp = useCallback(() => {
    clearTimers();
    broadcast({ type: 'hangup', sender: userId, data: null });
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    setConnectionState('closed' as RTCPeerConnectionState);
  }, [broadcast, userId, clearTimers]);

  /* ── reconnect (manual — from the UI button) ── */
  const reconnect = useCallback(() => {
    const pc = pcRef.current;
    if (!pc || pc.connectionState === 'closed') {
      // PC is fully dead — need a full re-init
      // Trigger by toggling sessionId (not ideal, but the only way without full refactor)
      console.warn('[WebRTC] PC is closed, needs full re-init');
      return;
    }
    console.log('[WebRTC] Manual reconnect');
    setConnectionState('connecting' as RTCPeerConnectionState);
    pc.restartIce();
    if (isCaller) {
      createAndSendOffer(pc);
    } else {
      broadcast({ type: 'renegotiate', sender: userId, data: null });
    }
  }, [isCaller, createAndSendOffer, broadcast, userId]);

  return {
    localStream,
    remoteStream,
    cameraOn,
    micOn,
    screenSharing,
    connectionState,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
    hangUp,
    reconnect,
  };
}

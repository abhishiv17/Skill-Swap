import { SupabaseClient } from "@supabase/supabase-js";

type SignalData = {
  type: "offer" | "answer" | "ice-candidate";
  payload: any;
  from: string;
};

type SignalingCallbacks = {
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onError: (error: Error) => void;
};

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "e8dd65c092bfccf46b5c1953",
      credential: "sPaZ8oMLkLfTYDgf",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "e8dd65c092bfccf46b5c1953",
      credential: "sPaZ8oMLkLfTYDgf",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "e8dd65c092bfccf46b5c1953",
      credential: "sPaZ8oMLkLfTYDgf",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "e8dd65c092bfccf46b5c1953",
      credential: "sPaZ8oMLkLfTYDgf",
    },
  ],
};

export class WebRTCSignaling {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private channel: ReturnType<SupabaseClient["channel"]> | null = null;
  private supabase: SupabaseClient;
  private sessionId: string;
  private userId: string;
  private callbacks: SignalingCallbacks;

  constructor(
    supabase: SupabaseClient,
    sessionId: string,
    userId: string,
    callbacks: SignalingCallbacks
  ) {
    this.supabase = supabase;
    this.sessionId = sessionId;
    this.userId = userId;
    this.callbacks = callbacks;
  }

  /**
   * Initialize local media (camera + microphone) and set up the peer connection.
   */
  async initialize(): Promise<MediaStream> {
    // Get local camera + mic
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 360, max: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: true,
    });

    // Create RTCPeerConnection
    this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to the connection
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    // Listen for remote tracks
    this.peerConnection.ontrack = (event) => {
      if (event.streams[0]) {
        this.callbacks.onRemoteStream(event.streams[0]);
      }
    };

    // Listen for ICE candidates and broadcast them
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcast({
          type: "ice-candidate",
          payload: event.candidate.toJSON(),
          from: this.userId,
        });
      }
    };

    // Monitor connection state
    this.peerConnection.onconnectionstatechange = () => {
      this.callbacks.onConnectionStateChange(
        this.peerConnection!.connectionState
      );
    };

    // Subscribe to Supabase Realtime channel for signaling
    this.channel = this.supabase.channel(`session-${this.sessionId}`);

    this.channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        const signal = payload as SignalData;
        // Ignore our own messages
        if (signal.from === this.userId) return;
        this.handleSignal(signal);
      })
      .subscribe();

    return this.localStream;
  }

  /**
   * Start a call (caller creates an SDP offer and broadcasts it).
   */
  async createOffer(): Promise<void> {
    if (!this.peerConnection) throw new Error("Not initialized");

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.broadcast({
      type: "offer",
      payload: offer,
      from: this.userId,
    });
  }

  /**
   * Handle incoming signaling messages from the remote peer.
   */
  private async handleSignal(signal: SignalData): Promise<void> {
    if (!this.peerConnection) return;

    try {
      switch (signal.type) {
        case "offer": {
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(signal.payload)
          );
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          this.broadcast({
            type: "answer",
            payload: answer,
            from: this.userId,
          });
          break;
        }

        case "answer": {
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(signal.payload)
          );
          break;
        }

        case "ice-candidate": {
          await this.peerConnection.addIceCandidate(
            new RTCIceCandidate(signal.payload)
          );
          break;
        }
      }
    } catch (error) {
      this.callbacks.onError(error as Error);
    }
  }

  /**
   * Broadcast a signaling message via Supabase Realtime.
   */
  private broadcast(signal: SignalData): void {
    this.channel?.send({
      type: "broadcast",
      event: "signal",
      payload: signal,
    });
  }

  /**
   * Toggle mute/unmute for audio.
   */
  toggleAudio(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return audioTrack.enabled;
    }
    return false;
  }

  /**
   * Toggle video on/off.
   */
  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return videoTrack.enabled;
    }
    return false;
  }

  /**
   * Clean up all resources: close the peer connection, stop media tracks,
   * and unsubscribe from the Supabase Realtime channel.
   */
  async cleanup(): Promise<void> {
    // Stop all local media tracks
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;

    // Close peer connection
    this.peerConnection?.close();
    this.peerConnection = null;

    // Unsubscribe from Supabase channel
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

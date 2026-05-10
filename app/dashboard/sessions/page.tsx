'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/hooks/useUser';
import Image from 'next/image';
import {
  Calendar,
  Clock,
  Coins,
  Video,
  CheckCircle2,
  Loader2,
  Check,
  X,
  Trash2,
  Sparkles,
  Users,
  Zap,
  ArrowRight,
  PhoneCall,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SessionRow {
  id: string;
  teacher_id: string;
  learner_id: string;
  status: string;
  created_at: string;
  ended_at: string | null;
}

interface ProfileMap {
  [id: string]: { username: string };
}

const statusStyles: Record<string, string> = {
  pending: 'bg-accent-amber/10 text-accent-amber border-accent-amber/20',
  active: 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20',
  completed: 'bg-accent-violet/10 text-accent-violet border-accent-violet/20',
  rejected: 'bg-accent-coral/10 text-accent-coral border-accent-coral/20',
  cancelled: 'bg-[var(--bg-surface-solid)] text-[var(--text-muted)] border-[var(--glass-border)]',
};

function timeAgo(dateString: string) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SessionsPage() {
  const { user } = useUser();
  const [supabase] = useState(() => createClient());
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isCreatingTest, setIsCreatingTest] = useState(false);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['sessions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .or(`teacher_id.eq.${user!.id},learner_id.eq.${user!.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load sessions');
        throw error;
      }

      let profileMap: ProfileMap = {};
      if (data && data.length > 0) {
        const peerIds = Array.from(new Set(
          data.flatMap((s) => [s.teacher_id, s.learner_id]).filter((id) => id !== user!.id)
        ));
        if (peerIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', peerIds);
          profilesData?.forEach((p) => { profileMap[p.id] = { username: p.username }; });
        }
      }
      return { sessions: (data || []) as SessionRow[], profiles: profileMap };
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('session-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `teacher_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sessions', user.id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `learner_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sessions', user.id] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, supabase, queryClient]);

  async function handleUpdateStatus(sessionId: string, newStatus: string, peerId: string, isAccepting: boolean = false) {
    try {
      const res = await fetch('/api/sessions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, status: newStatus })
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed to update session');
      }

      if (isAccepting) {
        const myProfile = await supabase.from('profiles').select('username').eq('id', user!.id).single();
        await supabase.from('notifications').insert({
          user_id: peerId,
          type: 'session_accepted',
          title: 'Session Accepted!',
          message: `${myProfile.data?.username || 'Your peer'} accepted your session request.`,
          link: '/dashboard/sessions',
        });
      }

      toast.success(`Session ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: ['sessions', user?.id] });
      // Update useUser hook to refresh credits if refunded
      if (newStatus === 'cancelled' || newStatus === 'rejected') {
         setTimeout(() => window.location.reload(), 1000); // Quick hack to refresh credits in context
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update session');
    }
  }

  async function handleCreateTestSession() {
    if (!user) return;
    setIsCreatingTest(true);
    try {
      const { data: otherUser, error: peerErr } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', user.id)
        .limit(1)
        .single();

      if (peerErr || !otherUser) {
        toast.error('Could not find another user to test with.');
        setIsCreatingTest(false);
        return;
      }

      const { data: session, error } = await supabase
        .from('sessions')
        .insert({ teacher_id: user.id, learner_id: otherUser.id, status: 'active' })
        .select()
        .single();

      if (error) throw error;

      toast.success('Test session created! Redirecting...');
      router.push(`/dashboard/sessions/${session.id}`);
    } catch (err: any) {
      toast.error('Failed to create test session');
      setIsCreatingTest(false);
    }
  }

  async function handleDelete(sessionId: string, peerId: string) {
    // Instead of hard delete, we cancel it so escrow triggers
    await handleUpdateStatus(sessionId, 'cancelled', peerId);
  }

  const sessions = data?.sessions || [];
  const profiles = data?.profiles || {};

  const pending = sessions.filter((s) => s.status === 'pending');
  const active = sessions.filter((s) => s.status === 'active');
  const completed = sessions.filter((s) => s.status === 'completed' || s.status === 'rejected');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={28} className="animate-spin text-accent-violet" />
        <p className="text-sm text-[var(--text-muted)]">Loading sessions…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-page-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-1">
            Sessions
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Manage your skill-swap video sessions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCreateTestSession}
            disabled={isCreatingTest}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent-violet hover:bg-accent-violet/90 text-white rounded-xl text-sm font-semibold transition-all shadow-lg disabled:opacity-50"
          >
            {isCreatingTest ? <Loader2 size={16} className="animate-spin" /> : <PhoneCall size={16} />}
            Test Video Call
          </button>
          <Link
            href="/dashboard/matches"
            className="flex items-center gap-2 px-5 py-2.5 border border-[var(--border-soft)] hover:bg-[var(--glass-bg)] rounded-xl text-sm font-semibold text-[var(--text-primary)] transition-all"
          >
            <Sparkles size={14} className="text-accent-violet" />
            Find Matches
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: active.length, icon: Zap, color: 'text-accent-emerald', bg: 'bg-accent-emerald/10' },
          { label: 'Pending', value: pending.length, icon: Clock, color: 'text-accent-amber', bg: 'bg-accent-amber/10' },
          { label: 'Completed', value: sessions.filter(s => s.status === 'completed').length, icon: CheckCircle2, color: 'text-accent-violet', bg: 'bg-accent-violet/10' },
          { label: 'Total', value: sessions.length, icon: Users, color: 'text-[var(--text-secondary)]', bg: 'bg-[var(--bg-surface-solid)]' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl glass p-4 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', stat.bg)}>
              <stat.icon size={18} className={stat.color} />
            </div>
            <div>
              <p className="text-xl font-heading font-bold text-[var(--text-primary)]">{stat.value}</p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Active Sessions */}
      {active.length > 0 && (
        <div>
          <h2 className="font-heading text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Zap size={18} className="text-accent-emerald" />
            Ready to Join
            <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
          </h2>
          <div className="space-y-3">
            {active.map((session) => {
              const isTeaching = session.teacher_id === user!.id;
              const peerId = isTeaching ? session.learner_id : session.teacher_id;
              const peerName = profiles[peerId]?.username || 'Unknown';
              const peerAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${peerName}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

              return (
                <div key={session.id} className="rounded-2xl glass p-5 sm:p-6 relative overflow-hidden border-accent-emerald/20">
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-accent-emerald/5 rounded-full blur-3xl" />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 relative">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="relative shrink-0">
                        <Image src={peerAvatar} alt={peerName} width={48} height={48} className="w-12 h-12 rounded-full bg-[var(--bg-surface-solid)] ring-2 ring-accent-emerald/20" />
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-accent-emerald rounded-full border-2 border-[var(--bg-surface)] flex items-center justify-center">
                          <Video size={8} className="text-white" />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn('text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full', isTeaching ? 'bg-accent-emerald/10 text-accent-emerald' : 'bg-accent-violet/10 text-accent-violet')}>
                            {isTeaching ? 'Teaching' : 'Learning'}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20">
                            ● Active
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          Session with <span className="text-accent-violet">{peerName}</span>
                        </p>
                        <p className="text-xs text-[var(--text-muted)] flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1"><Clock size={10} /> {timeAgo(session.created_at)}</span>
                          <span className="flex items-center gap-1"><Coins size={10} className="text-accent-amber" /> 1 credit</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Link
                        href={`/dashboard/sessions/${session.id}`}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-accent-violet hover:bg-accent-violet/90 text-white font-bold rounded-xl shadow-lg transition-all"
                      >
                        <PhoneCall size={16} />
                        Join Video Call
                        <ArrowRight size={14} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(session.id, 'cancelled', peerId)}
                        className="flex items-center justify-center gap-1.5 px-4 py-3 bg-[var(--bg-surface-solid)] hover:bg-accent-coral/10 text-[var(--text-muted)] hover:text-accent-coral border border-[var(--glass-border)] text-xs font-bold rounded-xl transition-all"
                        title="Cancel this session"
                      >
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Sessions */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-accent-amber" />
          Pending Requests
          {pending.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent-amber/10 text-accent-amber font-medium">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-2xl glass p-6 sm:p-8 text-center">
            <Clock size={32} className="mx-auto mb-3 text-[var(--text-muted)] opacity-20" />
            <p className="text-sm text-[var(--text-muted)] mb-1">No pending requests</p>
            <p className="text-xs text-[var(--text-muted)]">Find matches and request a session to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((session) => {
              const isTeaching = session.teacher_id === user!.id;
              const peerId = isTeaching ? session.learner_id : session.teacher_id;
              const peerName = profiles[peerId]?.username || 'Unknown';
              const peerAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${peerName}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

              return (
                <div key={session.id} className="rounded-2xl glass p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Image src={peerAvatar} alt={peerName} width={44} height={44} className="w-11 h-11 rounded-full bg-[var(--bg-surface-solid)] shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn('text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full', isTeaching ? 'bg-accent-emerald/10 text-accent-emerald' : 'bg-accent-violet/10 text-accent-violet')}>
                          {isTeaching ? 'Teaching' : 'Learning'}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-accent-amber/10 text-accent-amber border border-accent-amber/20">
                          ⏳ Pending
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {isTeaching ? `${peerName} wants to learn from you` : `Waiting for ${peerName} to accept`}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                        <Clock size={10} /> {timeAgo(session.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {isTeaching ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(session.id, 'active', peerId, true)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-accent-emerald/10 hover:bg-accent-emerald/20 text-accent-emerald text-xs font-bold rounded-xl transition-all border border-accent-emerald/20"
                        >
                          <Check size={14} /> Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(session.id, 'rejected', peerId)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[var(--bg-surface-solid)] hover:bg-accent-coral/10 text-[var(--text-muted)] hover:text-accent-coral border border-[var(--glass-border)] text-xs font-bold rounded-xl transition-all"
                        >
                          <X size={14} /> Decline
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelete(session.id, peerId)}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[var(--bg-surface-solid)] hover:bg-accent-coral/10 text-[var(--text-muted)] hover:text-accent-coral border border-[var(--glass-border)] text-xs font-bold rounded-xl transition-all"
                      >
                        <Trash2 size={14} /> Cancel Request
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed & Past */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-accent-emerald" />
          Completed &amp; Past
        </h2>
        {completed.length === 0 ? (
          <div className="rounded-2xl glass p-6 sm:p-8 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-[var(--text-muted)] opacity-20" />
            <p className="text-sm text-[var(--text-muted)]">No completed sessions yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {completed.map((session) => {
              const isTeaching = session.teacher_id === user!.id;
              const peerId = isTeaching ? session.learner_id : session.teacher_id;
              const peerName = profiles[peerId]?.username || 'Unknown';
              const peerAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${peerName}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

              return (
                <div key={session.id} className="rounded-2xl glass p-5 sm:p-6 flex items-center gap-4 opacity-80">
                  <Image src={peerAvatar} alt={peerName} width={40} height={40} className="w-10 h-10 rounded-full bg-[var(--bg-surface-solid)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-surface-solid)] text-[var(--text-muted)]">
                        {isTeaching ? 'Taught' : 'Learned'}
                      </span>
                      <span className={cn('text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border', statusStyles[session.status] || statusStyles.cancelled)}>
                        {session.status}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] font-medium truncate">with {peerName}</p>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-0.5">
                      <span className="flex items-center gap-1"><Clock size={10} /> {timeAgo(session.created_at)}</span>
                      {session.status === 'completed' && (
                        <span className="flex items-center gap-1"><Coins size={10} className="text-accent-amber" /> {isTeaching ? '+1' : '-1'} credit</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.status === 'completed' && (
                      <Link href={`/dashboard/reviews?sessionId=${session.id}`} className="px-3 py-2 rounded-lg border border-[var(--border-soft)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all">
                        Review
                      </Link>
                    )}
                    {session.status === 'rejected' && (
                      <button
                        type="button"
                        onClick={() => handleDelete(session.id, peerId)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--bg-surface-solid)] hover:bg-accent-coral/10 text-[var(--text-muted)] hover:text-accent-coral border border-[var(--glass-border)] text-xs font-semibold rounded-lg transition-colors"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How it works (when empty) */}
      {sessions.length === 0 && (
        <div className="rounded-2xl glass p-6 sm:p-8">
          <h3 className="font-heading text-base font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Video size={18} className="text-accent-violet" />
            How Video Sessions Work
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: '1', title: 'Find a Match', desc: 'Use AI matching to find peers with complementary skills', icon: Sparkles, color: 'text-accent-violet', bg: 'bg-accent-violet/10' },
              { step: '2', title: 'Request Session', desc: 'Send a request — they accept and both of you join a video call', icon: PhoneCall, color: 'text-accent-emerald', bg: 'bg-accent-emerald/10' },
              { step: '3', title: 'Swap & Earn', desc: 'Teach to earn credits, learn to spend them. Screen share, chat, and more!', icon: Coins, color: 'text-accent-amber', bg: 'bg-accent-amber/10' },
            ].map((item) => (
              <div key={item.step} className="flex flex-col items-center text-center p-4 rounded-xl bg-[var(--bg-surface-solid)]/50">
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-3', item.bg)}>
                  <item.icon size={22} className={item.color} />
                </div>
                <p className="text-sm font-heading font-bold text-[var(--text-primary)] mb-1">{item.title}</p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-center">
            <Link
              href="/dashboard/matches"
              className="flex items-center gap-2 px-6 py-3 bg-accent-violet hover:bg-accent-violet/90 text-white font-bold rounded-xl shadow-lg transition-all"
            >
              <Sparkles size={16} /> Find Your First Match
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

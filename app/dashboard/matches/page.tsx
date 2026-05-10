'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase/client';
import { SkillBadge } from '@/components/shared/SkillBadge';
import {
  ArrowRightLeft,
  Sparkles,
  Loader2,
  CheckCircle2,
  Users,
  Zap,
  Brain,
  TrendingUp,
  Target,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { authFetch } from '@/lib/authFetch';
import Link from 'next/link';

interface MatchResult {
  peer_id: string;
  username: string;
  offered_skill: string;
  compatibility_score: number;
  reasoning: string;
}

export default function MatchesPage() {
  const { skills, profile } = useUser();
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [requestingSession, setRequestingSession] = useState<string | null>(null);
  const [requestedSessions, setRequestedSessions] = useState<Set<string>>(new Set());

  const desiredSkills = skills.filter((s) => s.type === 'desired');
  const offeredSkills = skills.filter((s) => s.type === 'offered');

  async function handleFindMatches() {
    if (desiredSkills.length === 0) {
      toast.error('Add some desired skills in your profile first!');
      return;
    }

    setLoading(true);
    setMatches([]);
    setRequestedSessions(new Set());

    try {
      const allMatches: MatchResult[] = [];

      try {
        const res = await authFetch('/api/ai/match', {
          method: 'POST',
          body: JSON.stringify({ desiredSkills: desiredSkills.map(s => s.skill_name) }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.matches && Array.isArray(data.matches)) {
            allMatches.push(...data.matches);
          }
        } else {
          const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
          toast.error(`Error matching skills: ${errData.error || res.statusText}`);
        }
      } catch (fetchErr) {
        toast.error(`Network error while searching for matches`);
      }

      // Deduplicate
      const seen = new Set<string>();
      const unique = allMatches.filter((m) => {
        const key = `${m.peer_id || m.username}-${m.offered_skill}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      unique.sort((a, b) => b.compatibility_score - a.compatibility_score);
      setMatches(unique);
      setSearched(true);

      if (unique.length > 0) {
        toast.success(`Found ${unique.length} match${unique.length > 1 ? 'es' : ''}!`);
      } else {
        toast.info('No matches found yet.');
      }
    } catch (err) {
      toast.error('Failed to find matches. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestSession(match: MatchResult) {
    if (!match.peer_id) {
      toast.error('Unable to identify this user.');
      return;
    }

    const matchKey = `${match.peer_id}-${match.offered_skill}`;
    setRequestingSession(matchKey);

    try {
      const res = await authFetch('/api/sessions/create', {
        method: 'POST',
        body: JSON.stringify({ teacherId: match.peer_id }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create session');
        return;
      }

      // Send notification to the matched peer
      const supabase = createClient();
      await supabase.from('notifications').insert({
        user_id: match.peer_id,
        type: 'session_request',
        title: 'New Session Request!',
        message: `${profile?.username || 'Someone'} wants to learn ${match.offered_skill} from you.`,
        link: '/dashboard/sessions',
      });

      // Send automated message to initiate scheduling
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await supabase.from('messages').insert({
        sender_id: profile!.id,
        receiver_id: match.peer_id,
        content: `Hi! I'd like to request a session to learn ${match.offered_skill} from you. Please let me know what day and time works best for you! (My timezone is ${timezone})`
      });

      // Send Email
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: match.peer_id,
          subject: 'New Session Request!',
          message: `${profile?.username || 'Someone'} wants to learn ${match.offered_skill} from you. Login to CodeCarnage to accept the session request.`
        })
      }).catch(console.error);

      toast.success(`Session requested with ${match.username}! They've been notified.`);
      setRequestedSessions((prev) => new Set(prev).add(matchKey));
    } catch (err) {
      toast.error('Something went wrong.');
    } finally {
      setRequestingSession(null);
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-accent-emerald';
    if (score >= 70) return 'text-accent-amber';
    return 'text-accent-coral';
  };

  const getScoreBg = (score: number) => {
    if (score >= 85) return 'bg-accent-emerald/10 border-accent-emerald/20';
    if (score >= 70) return 'bg-accent-amber/10 border-accent-amber/20';
    return 'bg-accent-coral/10 border-accent-coral/20';
  };

  return (
    <div className="space-y-8 animate-page-in">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-1">
          AI Skill Matching
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Our AI engine finds compatible skill-swap partners based on your desired skills
        </p>
      </div>


      {/* Your skills overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Skills you offer */}
        <div className="rounded-2xl glass p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-accent-emerald/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-accent-emerald" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-accent-emerald">You Teach</p>
              <p className="text-[10px] text-[var(--text-muted)]">{offeredSkills.length} skill{offeredSkills.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {offeredSkills.length > 0 ? (
              offeredSkills.map((s) => (
                <SkillBadge key={s.id} skill={s.skill_name} variant="have" size="sm" />
              ))
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic">No skills offered yet</p>
            )}
          </div>
        </div>

        {/* Skills you want */}
        <div className="rounded-2xl glass p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-accent-violet/10 flex items-center justify-center">
              <Target size={16} className="text-accent-violet" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-accent-violet">You Want</p>
              <p className="text-[10px] text-[var(--text-muted)]">{desiredSkills.length} skill{desiredSkills.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {desiredSkills.length > 0 ? (
              desiredSkills.map((s) => (
                <SkillBadge key={s.id} skill={s.skill_name} variant="want" size="sm" />
              ))
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic">
                No desired skills set —{' '}
                <Link href="/dashboard/profile" className="text-accent-violet hover:underline">add some</Link>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ===== FIND MATCHES BUTTON ===== */}
      <div className="rounded-2xl bg-[var(--bg-surface-solid)] border border-[var(--border-soft)] p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-violet/10 flex items-center justify-center">
              <Brain size={20} className="text-accent-violet" />
            </div>
            <div>
              <p className="text-sm font-heading font-bold text-[var(--text-primary)]">
                AI Match Engine
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {desiredSkills.length > 0
                  ? `Searching across ${desiredSkills.length} desired skill${desiredSkills.length > 1 ? 's' : ''}`
                  : 'Add desired skills in your profile first'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFindMatches}
            disabled={loading || desiredSkills.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-accent-violet hover:bg-accent-violet/90 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles size={16} /> Find Matches ({desiredSkills.length} skills)</>
            )}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-accent-violet/20 border-t-accent-violet animate-spin" />
            <Brain size={24} className="absolute inset-0 m-auto text-accent-violet" />
          </div>
          <div className="text-center">
            <p className="text-sm font-heading font-semibold text-[var(--text-primary)]">
              AI is analyzing skill compatibility…
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1 animate-pulse">
              Matching you with the best partners
            </p>
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && searched && matches.length === 0 && (
        <div className="rounded-2xl glass p-6 sm:p-8 text-center">
          <Users size={40} className="mx-auto mb-4 text-[var(--text-muted)] opacity-20" />
          <p className="text-sm font-heading font-semibold text-[var(--text-primary)] mb-1">
            No matches found yet
          </p>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto mb-4">
            More users joining the platform will improve results.
          </p>
          <Link
            href="/dashboard/feed"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-soft)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all"
          >
            Visit Campus Feed
          </Link>
        </div>
      )}

      {/* Match results */}
      {!loading && matches.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-heading font-semibold text-[var(--text-primary)]">
              Found {matches.length} match{matches.length > 1 ? 'es' : ''}
            </p>
            <span className="text-xs text-[var(--text-muted)]">Sorted by compatibility</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {matches.map((match, idx) => {
              const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${match.username}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
              const wantedSkill = desiredSkills.find((s) =>
                match.reasoning?.toLowerCase().includes(s.skill_name.toLowerCase())
              )?.skill_name || desiredSkills[0]?.skill_name || '';

              const matchKey = `${match.peer_id}-${match.offered_skill}`;
              const isRequesting = requestingSession === matchKey;
              const isRequested = requestedSessions.has(matchKey);

              return (
                <div
                  key={`${match.username}-${match.offered_skill}-${idx}`}
                  className="rounded-2xl glass p-5 sm:p-6 relative overflow-hidden hover:shadow-md transition-all"
                >
                  {/* Rank badge */}
                  {idx < 3 && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-accent-amber/20 border border-accent-amber/30 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-accent-amber">#{idx + 1}</span>
                    </div>
                  )}

                  {/* Score */}
                  <div className={`absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full border ${getScoreBg(match.compatibility_score)}`}>
                    <Zap size={12} className={getScoreColor(match.compatibility_score)} />
                    <span className={`text-xs font-heading font-bold ${getScoreColor(match.compatibility_score)}`}>
                      {match.compatibility_score}%
                    </span>
                  </div>

                  {/* User info */}
                  <div className="flex items-center gap-3 mb-5 mt-1">
                    <Image
                      src={avatarUrl}
                      alt={match.username || 'User'}
                      width={56}
                      height={56}
                      className="w-14 h-14 rounded-full bg-[var(--bg-surface-solid)] ring-2 ring-[var(--glass-border)]"
                    />
                    <div>
                      <span className="font-heading font-semibold text-base text-[var(--text-primary)]">
                        {match.username}
                      </span>
                      <p className="text-xs text-[var(--text-muted)]">SkillSwap Student</p>
                    </div>
                  </div>

                  {/* Skill exchange */}
                  <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-[var(--bg-surface-solid)]">
                    <div className="flex-1 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-accent-emerald font-bold mb-1.5">They Teach</p>
                      <SkillBadge skill={match.offered_skill} variant="have" size="md" />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-surface)] flex items-center justify-center shrink-0 border border-[var(--glass-border)]">
                      <ArrowRightLeft size={14} className="text-[var(--text-muted)]" />
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-accent-violet font-bold mb-1.5">You Want</p>
                      <SkillBadge skill={wantedSkill} variant="want" size="md" />
                    </div>
                  </div>

                  {/* Reasoning */}
                  <p className="text-sm text-[var(--text-muted)] mb-4 line-clamp-2 leading-relaxed">
                    {match.reasoning}
                  </p>

                  {/* Action button */}
                  {isRequested ? (
                    <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-emerald/10 border border-accent-emerald/20 text-accent-emerald text-sm font-medium">
                      <CheckCircle2 size={16} />
                      <span>Session Requested!</span>
                      <Link href="/dashboard/sessions" className="ml-2 text-xs underline opacity-70 hover:opacity-100">
                        View →
                      </Link>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRequestSession(match)}
                      disabled={isRequesting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-violet hover:bg-accent-violet/90 text-white text-sm font-semibold transition-all disabled:opacity-50"
                    >
                      {isRequesting ? (
                        <><Loader2 size={14} className="animate-spin" /> Sending...</>
                      ) : (
                        <><Video size={14} /> Request Video Session</>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

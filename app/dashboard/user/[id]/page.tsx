'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/shared/GlassCard';
import { GradientButton } from '@/components/shared/GradientButton';
import { useUser } from '@/hooks/useUser';
import { toast } from 'sonner';
import { MapPin, GraduationCap, Star, Clock, UserPlus, MessageSquare, Check, Sparkles, BookOpen, Link as LinkIcon, Github, Linkedin, Award, ThumbsUp, Users } from 'lucide-react';
import Image from 'next/image';

export default function UserProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile: currentUser } = useUser();
  
  const [userProfile, setUserProfile] = useState<any>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [endorsements, setEndorsements] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [connectionsCount, setConnectionsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Connection states
  const [followStatus, setFollowStatus] = useState<'none' | 'pending' | 'accepted' | 'rejected'>('none');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [isReceiver, setIsReceiver] = useState(false);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      if (!id) return;
      const supabase = createClient();
      
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', id).single();
      const { data: userSkills } = await supabase.from('skills').select('*').eq('user_id', id);
      const { data: userEndorsements } = await supabase.from('endorsements').select('*').eq('endorsed_id', id);
      const { data: userBadges } = await supabase.from('user_badges').select('*').eq('user_id', id);
      const { count: connCount } = await supabase.from('connections').select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${id},receiver_id.eq.${id}`);

      setUserProfile(profile);
      setSkills(userSkills || []);
      setEndorsements(userEndorsements || []);
      setBadges(userBadges || []);
      setConnectionsCount(connCount || 0);
      setLoading(false);
    }
    fetchUser();
  }, [id]);

  useEffect(() => {
    // Fetch connection status if we have both users
    async function fetchConnectionStatus() {
      if (!id || !currentUser?.id || id === currentUser.id) return;
      
      const supabase = createClient();
      const { data: connection } = await supabase
        .from('connections')
        .select('*')
        .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${id}),and(requester_id.eq.${id},receiver_id.eq.${currentUser.id})`)
        .maybeSingle();

      if (connection) {
        setConnectionId(connection.id);
        setFollowStatus(connection.status as 'pending' | 'accepted' | 'rejected');
        setIsReceiver(connection.receiver_id === currentUser.id);
      }
    }
    fetchConnectionStatus();
  }, [id, currentUser]);

  const handleFollow = async () => {
    if (!currentUser) {
      toast.error('You must be logged in to follow users.');
      return;
    }
    if (id === currentUser.id) {
      toast.error("You can't follow yourself.");
      return;
    }

    setIsUpdatingFollow(true);
    const supabase = createClient();

    try {
      if (followStatus === 'none' || followStatus === 'rejected') {
        // Send new request
        const { error } = await supabase
          .from('connections')
          .insert({ 
            requester_id: currentUser.id, 
            receiver_id: id, 
            status: 'pending' 
          });
          
        if (error) throw error;
        
        // Send notification to the receiver
        await supabase.from('notifications').insert({
          user_id: id,
          type: 'connection_request',
          title: 'New Connection Request',
          message: `${currentUser.full_name || currentUser.username || 'Someone'} wants to connect with you!`,
          link: `/dashboard/messages`
        });

        // Send Email
        fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiverId: id,
            subject: 'New Connection Request on CodeCarnage',
            message: `${currentUser.full_name || currentUser.username || 'Someone'} wants to connect with you! Login to CodeCarnage to accept or decline.`
          })
        }).catch(console.error);

        setFollowStatus('pending');
        toast.success('Follow request sent!');
      } else if (followStatus === 'pending') {
        if (isReceiver) {
          // Accept request
          const { error } = await supabase
            .from('connections')
            .update({ status: 'accepted' })
            .eq('id', connectionId);
            
          if (error) throw error;
          
          // Notify the requester that their request was accepted
          await supabase.from('notifications').insert({
            user_id: id,
            type: 'connection_accepted',
            title: 'Connection Accepted',
            message: `${currentUser.full_name || currentUser.username || 'Someone'} accepted your connection request!`,
            link: `/dashboard/messages`
          });

          // Send Email
          fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              receiverId: id,
              subject: 'Connection Request Accepted!',
              message: `${currentUser.full_name || currentUser.username || 'Someone'} accepted your connection request! You can now message them.`
            })
          }).catch(console.error);

          setFollowStatus('accepted');
          toast.success('Connection accepted! You can now message them.');
        } else {
          // Cancel request (if we were the requester)
          const { error } = await supabase
            .from('connections')
            .delete()
            .eq('id', connectionId);
            
          if (error) throw error;
          setFollowStatus('none');
          setConnectionId(null);
          toast.info('Follow request cancelled.');
        }
      } else if (followStatus === 'accepted') {
        // Unfollow
        const { error } = await supabase
          .from('connections')
          .delete()
          .eq('id', connectionId);
          
        if (error) throw error;
        setFollowStatus('none');
        setConnectionId(null);
        toast.info('Unfollowed user.');
      }
    } catch (err: any) {
      toast.error('Action failed: ' + err.message);
      console.error(err);
    } finally {
      setIsUpdatingFollow(false);
    }
  };

  const handleEndorse = async (skill_name: string) => {
    if (!currentUser || id === currentUser.id) return;
    const supabase = createClient();
    const { error } = await supabase.from('endorsements').insert({
      endorser_id: currentUser.id,
      endorsed_id: id,
      skill_name
    });
    if (!error) {
      toast.success(`Endorsed for ${skill_name}!`);
      setEndorsements(prev => [...prev, { endorser_id: currentUser.id, endorsed_id: id, skill_name }]);
    } else {
      toast.error('You already endorsed this skill or an error occurred.');
    }
  };

  const handleMessageClick = () => {
    if (followStatus !== 'accepted') {
      toast.error(`You must connect with ${userProfile.full_name || userProfile.username} before messaging them. Send a follow request first!`);
      return;
    }
    router.push(`/dashboard/messages?chat=${userProfile.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="w-8 h-8 border-4 border-accent-violet border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="text-center py-20 text-[var(--text-muted)]">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">User not found</h2>
        <p>The profile you are looking for does not exist or has been deleted.</p>
      </div>
    );
  }

  const offeredSkills = skills.filter(s => s.type === 'offered');
  const desiredSkills = skills.filter(s => s.type === 'desired');
  const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${userProfile.username || 'User Avatar'}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  const isSelf = currentUser?.id === id;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-page-in">
      {/* Header Profile Card */}
      <GlassCard padding="lg" className="relative overflow-hidden">
        {/* Background Banner */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-r from-accent-violet/20 via-accent-amber/20 to-accent-coral/20"></div>
        
        <div className="relative pt-16 flex flex-col md:flex-row gap-6 items-start md:items-end">
          <div className="w-32 h-32 rounded-2xl border-4 border-[var(--bg-surface-solid)] bg-white overflow-hidden shadow-xl shrink-0">
            <Image src={avatarUrl} alt={userProfile.username || 'User Avatar'} width={128} height={128} className="w-full h-full object-cover" />
          </div>
          
          <div className="flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-[var(--text-primary)] font-heading">{userProfile.full_name || userProfile.username}</h1>
                <p className="text-[var(--text-muted)] font-medium mb-2">@{userProfile.username}</p>
                
                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)]">
                  <div className="flex items-center gap-1.5"><MapPin size={14} className="text-accent-coral" /> {userProfile.city || 'Location hidden'}</div>
                  <div className="flex items-center gap-1.5"><GraduationCap size={14} className="text-accent-violet" /> {userProfile.college_name || 'College hidden'}</div>
                </div>
              </div>
              
              {!isSelf && (
                <div className="flex gap-2">
                  <GradientButton 
                    onClick={handleFollow}
                    disabled={isUpdatingFollow}
                    variant={followStatus !== 'none' && followStatus !== 'rejected' && !(followStatus === 'pending' && isReceiver) ? 'outline' : 'primary'}
                    className="flex items-center gap-2"
                  >
                    {(followStatus === 'none' || followStatus === 'rejected') && <><UserPlus size={16} /> Follow</>}
                    {followStatus === 'pending' && !isReceiver && <><Clock size={16} /> Requested</>}
                    {followStatus === 'pending' && isReceiver && <><Check size={16} /> Accept Request</>}
                    {followStatus === 'accepted' && <><Check size={16} /> Following</>}
                  </GradientButton>
                  <button 
                    onClick={handleMessageClick}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-surface-solid)] text-[var(--text-primary)] font-medium hover:bg-[var(--glass-bg)] transition-colors"
                  >
                    <MessageSquare size={16} /> Message
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="md:col-span-1 space-y-6">
          <GlassCard padding="lg">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Star size={16} className="text-accent-amber" /> Stats
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Average Rating</span>
                <span className="font-medium text-[var(--text-primary)] flex items-center gap-1">
                  {userProfile.average_rating} <Star size={12} className="fill-accent-amber text-accent-amber" />
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Total Sessions</span>
                <span className="font-medium text-[var(--text-primary)]">{userProfile.total_sessions || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Credits Earned</span>
                <span className="font-medium text-accent-amber">{userProfile.credits} 🪙</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Connections</span>
                <span className="font-medium text-[var(--text-primary)] flex items-center gap-1">
                  <Users size={14} className="text-accent-violet" /> {connectionsCount}
                </span>
              </div>
              
              {/* Badges Section */}
              {badges.length > 0 && (
                <div className="pt-4 border-t border-[var(--glass-border)]">
                  <span className="text-sm text-[var(--text-muted)] block mb-2">Badges</span>
                  <div className="flex flex-wrap gap-2">
                    {badges.map(b => (
                      <span key={b.id} title={b.badge_name} className="flex items-center gap-1.5 px-2.5 py-1 bg-accent-mustard/10 text-accent-mustard text-xs font-semibold rounded-full border border-accent-mustard/20">
                        <Award size={14} /> {b.badge_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>

          <GlassCard padding="lg">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4">About</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
              {userProfile.about_me || userProfile.bio || "This user hasn't added a bio yet."}
            </p>
            
            {/* Portfolio Links */}
            {(userProfile.github_url || userProfile.linkedin_url || userProfile.portfolio_url) && (
              <div className="space-y-2 pt-4 border-t border-[var(--glass-border)]">
                {userProfile.github_url && (
                  <a href={userProfile.github_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-accent-slate transition-colors">
                    <Github size={16} /> GitHub Profile
                  </a>
                )}
                {userProfile.linkedin_url && (
                  <a href={userProfile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-accent-slate transition-colors">
                    <Linkedin size={16} /> LinkedIn
                  </a>
                )}
                {userProfile.portfolio_url && (
                  <a href={userProfile.portfolio_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-accent-slate transition-colors">
                    <LinkIcon size={16} /> Personal Portfolio
                  </a>
                )}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right Column */}
        <div className="md:col-span-2 space-y-6">
          <GlassCard padding="lg">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Sparkles size={16} className="text-accent-violet" /> Skills They Teach
            </h3>
            {offeredSkills.length > 0 ? (
              <div className="flex flex-col gap-3">
                {offeredSkills.map(s => {
                  const skillEndorsements = endorsements.filter(e => e.skill_name === s.skill_name);
                  const hasEndorsed = skillEndorsements.some(e => e.endorser_id === currentUser?.id);
                  return (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--glass-border)]">
                      <span className="font-medium text-[var(--text-primary)]">{s.skill_name}</span>
                      <div className="flex items-center gap-3">
                        {skillEndorsements.length > 0 && (
                          <span className="flex items-center gap-1 text-sm text-accent-violet bg-accent-violet/10 px-2 py-0.5 rounded-full font-medium">
                            <ThumbsUp size={12} /> {skillEndorsements.length}
                          </span>
                        )}
                        {!isSelf && followStatus === 'accepted' && (
                          <button 
                            onClick={() => handleEndorse(s.skill_name)}
                            disabled={hasEndorsed}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors ${hasEndorsed ? 'bg-[var(--glass-bg)] text-[var(--text-muted)] cursor-not-allowed' : 'bg-accent-violet/10 hover:bg-accent-violet/20 text-accent-violet'}`}
                          >
                            <ThumbsUp size={12} /> {hasEndorsed ? 'Endorsed' : 'Endorse'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No skills offered yet.</p>
            )}
          </GlassCard>

          <GlassCard padding="lg">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <BookOpen size={16} className="text-accent-coral" /> Skills They Want to Learn
            </h3>
            {desiredSkills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {desiredSkills.map(s => (
                  <span key={s.id} className="px-3 py-1.5 rounded-lg bg-accent-coral/10 text-accent-coral text-sm font-medium border border-accent-coral/20">
                    {s.skill_name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No desired skills yet.</p>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

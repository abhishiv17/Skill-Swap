'use client';

import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  phone: string | null;
  gender: string | null;
  age: number | null;
  college_name: string | null;
  degree: string | null;
  branch: string | null;
  year_of_study: number | null;
  graduation_year: number | null;
  city: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  preferred_mode: string | null;
  languages: string[] | null;
  profile_completed: boolean;
  credits: number;
  average_rating: number;
  total_sessions: number;
  created_at: string;
}

export interface UserSkill {
  id: string;
  skill_name: string;
  type: 'offered' | 'desired';
}

interface UseUserReturn {
  user: User | null;
  profile: UserProfile | null;
  skills: UserSkill[];
  loading: boolean;
  connectionsCount: number;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UseUserReturn | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [connectionsCount, setConnectionsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [supabase] = useState(() => createClient());
  const profileFetchedRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const [profileRes, skillsRes, connectionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('skills').select('*').eq('user_id', userId),
      supabase.from('connections').select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${userId},receiver_id.eq.${userId}`),
    ]);

    if (profileRes.data) setProfile(profileRes.data as UserProfile);
    if (skillsRes.data) setSkills(skillsRes.data as UserSkill[]);
    if (connectionsRes.count !== null) setConnectionsCount(connectionsRes.count);
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    // getSession() reads from localStorage — instant, no network call.
    // This is the ONLY thing that blocks `loading`. Everything else is background.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        // Fire profile fetch in background — do NOT await
        profileFetchedRef.current = true;
        fetchProfile(session.user.id);
      }
      // Auth is determined. Unblock the entire app.
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null);
          setProfile(null);
          setSkills([]);
          profileFetchedRef.current = false;
          return;
        }

        setUser(session.user);

        // Fetch profile on sign-in. Skip INITIAL_SESSION since init() handles it.
        if (event === 'SIGNED_IN') {
          profileFetchedRef.current = true;
          fetchProfile(session.user.id);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile, supabase.auth]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSkills([]);
  }, [supabase.auth]);

  return (
    <UserContext.Provider value={{ user, profile, skills, loading, connectionsCount, signOut, refreshProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UseUserReturn {
  const context = useContext(UserContext);
  if (context === null) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}


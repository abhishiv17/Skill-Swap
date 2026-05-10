'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/useUser';
import { GlassCard } from '@/components/shared/GlassCard';
import { GradientButton } from '@/components/shared/GradientButton';
import { SkillBadge } from '@/components/shared/SkillBadge';
import {
  Coins, Star, Calendar, Loader2, Save, User, GraduationCap,
  MapPin, Globe, Phone, Github, Linkedin, Languages, Monitor,
  ChevronDown, X, Plus, Trash2, AlertTriangle, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ALL_SKILLS } from '@/lib/constants';
import { authFetch } from '@/lib/authFetch';
import { BadgesSection } from '@/components/dashboard/BadgesSection';

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const DEGREE_OPTIONS = ['B.Tech', 'B.E.', 'B.Sc', 'BBA', 'BCA', 'B.Com', 'BA', 'M.Tech', 'M.Sc', 'MBA', 'MCA', 'PhD', 'Other'];
const SESSION_MODES = ['Online', 'In-person', 'Both'];
const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu', 'Odia', 'Assamese', 'French', 'German', 'Spanish', 'Japanese', 'Korean', 'Mandarin'];
const YEAR_OPTIONS = [1, 2, 3, 4, 5];

// Defined outside ProfilePage to prevent focus loss on re-renders
function FormInput({ label, icon: Icon, value, onChange, placeholder, type = 'text' }: {
  label: string; icon: React.ElementType; value: string;
  onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--glass-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-accent-violet/50 focus:ring-1 focus:ring-accent-violet/30 transition-all"
        />
      </div>
    </div>
  );
}

function FormSelect({ label, icon: Icon, value, onChange, options, placeholder }: {
  label: string; icon: React.ElementType; value: string;
  onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--glass-border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-accent-violet/50 focus:ring-1 focus:ring-accent-violet/30 transition-all appearance-none cursor-pointer"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { profile, skills, loading, refreshProfile, connectionsCount } = useUser();

  // Form state
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [phoneNum, setPhoneNum] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [degree, setDegree] = useState('');
  const [branch, setBranch] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [city, setCity] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [preferredMode, setPreferredMode] = useState('Both');
  const [languages, setLanguages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [langInput, setLangInput] = useState('');
  
  // Real-time skill editing state
  const [offeredSkillInput, setOfferedSkillInput] = useState('');
  const [desiredSkillInput, setDesiredSkillInput] = useState('');
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Populate form when profile loads
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || '');
    setBio(profile.bio || '');
    setPhoneNum(profile.phone || '');
    setGender(profile.gender || '');
    setAge(profile.age?.toString() || '');
    setCollegeName(profile.college_name || '');
    setDegree(profile.degree || '');
    setBranch(profile.branch || '');
    setYearOfStudy(profile.year_of_study?.toString() || '');
    setGradYear(profile.graduation_year?.toString() || '');
    setCity(profile.city || '');
    setGithubUrl(profile.github_url || '');
    setLinkedinUrl(profile.linkedin_url || '');
    setPreferredMode(profile.preferred_mode || 'Both');
    setLanguages(profile.languages || []);
  }, [profile]);

  // Calculate profile completion
  const fields = [fullName, bio, phoneNum, gender, collegeName, degree, branch, yearOfStudy, gradYear, city];
  const filledCount = fields.filter((f) => f.trim().length > 0).length;
  const completionPercent = Math.round((filledCount / fields.length) * 100);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    const updates = {
      full_name: fullName || null,
      bio: bio || null,
      phone: phoneNum || null,
      gender: gender || null,
      age: age ? parseInt(age) : null,
      college_name: collegeName || null,
      degree: degree || null,
      branch: branch || null,
      year_of_study: yearOfStudy ? parseInt(yearOfStudy) : null,
      graduation_year: gradYear ? parseInt(gradYear) : null,
      city: city || null,
      github_url: githubUrl || null,
      linkedin_url: linkedinUrl || null,
      preferred_mode: preferredMode || 'Both',
      languages: languages.length > 0 ? languages : null,
      profile_completed: completionPercent >= 70,
    };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile!.id);

    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      toast.success('Profile updated! 🎉');
      await refreshProfile();
    }
    setSaving(false);
  };

  const addLanguage = (lang: string) => {
    if (lang && !languages.includes(lang)) {
      setLanguages([...languages, lang]);
    }
    setLangInput('');
  };

  const removeLanguage = (lang: string) => {
    setLanguages(languages.filter((l) => l !== lang));
  };

  const handleAddSkill = async (skillName: string, type: 'offered' | 'desired') => {
    if (!skillName.trim() || !profile) return;
    
    // Check if they already have it in the same category
    const alreadyHas = skills.some((s) => s.skill_name.toLowerCase() === skillName.toLowerCase() && s.type === type);
    if (alreadyHas) {
      toast.error('Skill already added!');
      return;
    }

    // Prevent adding a skill that's already in the opposite category
    const oppositeType = type === 'offered' ? 'desired' : 'offered';
    const inOpposite = skills.some((s) => s.skill_name.toLowerCase() === skillName.toLowerCase() && s.type === oppositeType);
    if (inOpposite) {
      toast.error(
        type === 'offered'
          ? `"${skillName.trim()}" is already in your "Want to Learn" list — you can\'t teach and learn the same skill!`
          : `"${skillName.trim()}" is already in your "Teach" list — you can\'t learn and teach the same skill!`
      );
      return;
    }

    setIsAddingSkill(true);
    const supabase = createClient();
    const { error } = await supabase.from('skills').insert([
      { user_id: profile.id, skill_name: skillName.trim(), type }
    ]);

    if (error) {
      toast.error('Failed to add skill: ' + error.message);
    } else {
      toast.success(`Added ${skillName.trim()}`);
      if (type === 'offered') setOfferedSkillInput('');
      else setDesiredSkillInput('');
      await refreshProfile();
    }
    setIsAddingSkill(false);
  };

  const handleRemoveSkill = async (skillId: string, skillName: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('skills').delete().eq('id', skillId);
    
    if (error) {
      toast.error('Failed to remove skill: ' + error.message);
    } else {
      toast.success(`Removed ${skillName}`);
      await refreshProfile();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="animate-spin text-accent-violet" />
      </div>
    );
  }

  const offeredSkills = skills.filter((s) => s.type === 'offered');
  const desiredSkills = skills.filter((s) => s.type === 'desired');
  const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${profile?.username || 'User'}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-1">Profile Settings</h1>
          <p className="text-sm text-[var(--text-muted)]">Manage your skill exchange profile</p>
        </div>
      </div>

      {/* Profile header card */}
      <GlassCard gradient padding="lg">
        <div className="flex items-start gap-5">
          <Image src={avatarUrl} alt={profile?.username || 'User'} width={80} height={80} className="w-20 h-20 rounded-2xl bg-[var(--bg-surface-solid)]" />
          <div className="flex-1">
            <h2 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-0.5">
              {fullName || profile?.username || 'Unknown'}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-1">@{profile?.username}</p>
            {(collegeName || degree) && (
              <p className="text-sm text-[var(--text-secondary)]">
                {degree && `${degree} `}{branch && `in ${branch} `}{collegeName && `• ${collegeName}`}
              </p>
            )}

            <div className="flex items-center gap-4 mt-3 text-sm text-[var(--text-muted)] flex-wrap">
              <span className="flex items-center gap-1"><Users size={14} className="text-accent-violet" />{connectionsCount} Connections</span>
              <span className="flex items-center gap-1"><Coins size={14} className="text-accent-amber" />{profile?.credits ?? 0} credits</span>
              <span className="flex items-center gap-1"><Star size={14} className="text-accent-amber fill-accent-amber" />{profile?.average_rating?.toFixed(1) ?? '0.0'}</span>
              <span className="flex items-center gap-1"><Calendar size={14} />Joined {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}</span>
            </div>
          </div>

          {/* Completion indicator */}
          <div className="text-center shrink-0">
            <div className="relative w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="var(--bg-surface-solid)" strokeWidth="4" />
                <circle
                  cx="28" cy="28" r="24" fill="none"
                  stroke={completionPercent >= 70 ? '#10b981' : completionPercent >= 40 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="4"
                  strokeDasharray={`${(completionPercent / 100) * 150.8} 150.8`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--text-primary)]">
                {completionPercent}%
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Complete</p>
          </div>
        </div>
      </GlassCard>

      {/* Badges & Milestones */}
      <BadgesSection />

      {/* Personal Info */}
      <GlassCard padding="lg">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-accent-violet mb-5 flex items-center gap-2">
          <User size={15} /> Personal Info
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="Full Name" icon={User} value={fullName} onChange={setFullName} placeholder="Arjun Raghavan" />
          <FormInput label="Phone" icon={Phone} value={phoneNum} onChange={setPhoneNum} placeholder="+91 98765 43210" type="tel" />
          <FormSelect label="Gender" icon={User} value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="Select gender" />
          <FormInput label="Age" icon={Calendar} value={age} onChange={setAge} placeholder="20" type="number" />
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="MERN developer, chess nerd, love teaching..."
              maxLength={300}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-[var(--glass-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-accent-violet/50 focus:ring-1 focus:ring-accent-violet/30 transition-all resize-none h-20"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1 text-right">{bio.length}/300</p>
          </div>
        </div>
      </GlassCard>

      {/* Academic Info */}
      <GlassCard padding="lg">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-accent-emerald mb-5 flex items-center gap-2">
          <GraduationCap size={15} /> Academic Info
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="College Name" icon={GraduationCap} value={collegeName} onChange={setCollegeName} placeholder="IIT Bombay" />
          <FormSelect label="Degree" icon={GraduationCap} value={degree} onChange={setDegree} options={DEGREE_OPTIONS} placeholder="Select degree" />
          <FormInput label="Branch / Major" icon={GraduationCap} value={branch} onChange={setBranch} placeholder="Computer Science" />
          <FormSelect label="Year of Study" icon={Calendar} value={yearOfStudy} onChange={setYearOfStudy} options={YEAR_OPTIONS.map(String)} placeholder="Select year" />
          <FormInput label="Graduation Year" icon={Calendar} value={gradYear} onChange={setGradYear} placeholder="2027" type="number" />
          <FormInput label="City / Campus" icon={MapPin} value={city} onChange={setCity} placeholder="Mumbai" />
        </div>
      </GlassCard>

      {/* Social Links */}
      <GlassCard padding="lg">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-accent-amber mb-5 flex items-center gap-2">
          <Globe size={15} /> Social Links
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="GitHub" icon={Github} value={githubUrl} onChange={setGithubUrl} placeholder="https://github.com/username" type="url" />
          <FormInput label="LinkedIn" icon={Linkedin} value={linkedinUrl} onChange={setLinkedinUrl} placeholder="https://linkedin.com/in/username" type="url" />
        </div>
      </GlassCard>

      {/* Preferences */}
      <GlassCard padding="lg">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-accent-coral mb-5 flex items-center gap-2">
          <Monitor size={15} /> Preferences
        </h3>
        <div className="space-y-5">
          {/* Session mode */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">Preferred Session Mode</label>
            <div className="flex gap-2">
              {SESSION_MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPreferredMode(mode)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-all border',
                    preferredMode === mode
                      ? 'bg-accent-violet/10 border-accent-violet/30 text-accent-violet'
                      : 'bg-[var(--bg-surface-solid)] border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Languages */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">Languages</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {languages.map((lang) => (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent-amber/10 border border-accent-amber/20 text-sm text-accent-amber font-medium"
                >
                  {lang}
                  <button onClick={() => removeLanguage(lang)} className="hover:text-red-400 transition-colors">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Languages size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  list="language-options"
                  value={langInput}
                  onChange={(e) => setLangInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLanguage(langInput.trim()); } }}
                  placeholder="Add a language..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-dashed border-[var(--glass-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-accent-violet/50 focus:border-solid transition-all"
                />
                <datalist id="language-options">
                  {LANGUAGE_OPTIONS.filter((l) => !languages.includes(l)).map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </div>
              <button
                onClick={() => addLanguage(langInput.trim())}
                disabled={!langInput.trim()}
                className={cn(
                  'px-3 py-2.5 rounded-xl text-sm border transition-all',
                  langInput.trim()
                    ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber hover:bg-accent-amber/20'
                    : 'bg-[var(--bg-surface-solid)] border-[var(--glass-border)] text-[var(--text-muted)] cursor-not-allowed'
                )}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Skills — Editable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <GlassCard padding="lg">
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-accent-emerald mb-4">Skills I Teach</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {offeredSkills.length > 0 ? (
              offeredSkills.map((s) => (
                <SkillBadge 
                  key={s.id} 
                  skill={s.skill_name} 
                  variant="have" 
                  size="md" 
                  onRemove={() => handleRemoveSkill(s.id, s.skill_name)} 
                />
              ))
            ) : (
              <p className="text-sm text-[var(--text-muted)] w-full">No skills added yet.</p>
            )}
          </div>
          
          <div className="flex gap-2 mt-auto">
            <div className="relative flex-1">
              <input
                id="offered-skill-input"
                list="all-skills-offered"
                value={offeredSkillInput}
                onChange={(e) => setOfferedSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSkill(offeredSkillInput, 'offered'); } }}
                placeholder="Type a skill you can teach..."
                className="w-full pl-3 pr-4 py-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-dashed border-[var(--glass-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-accent-emerald/50 focus:border-solid transition-all"
              />
              <datalist id="all-skills-offered">
                {ALL_SKILLS
                  .filter((skill) => !desiredSkills.some((s) => s.skill_name.toLowerCase() === skill.name.toLowerCase()))
                  .map((skill) => (
                    <option key={skill.id} value={skill.name} />
                  ))}
              </datalist>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!offeredSkillInput.trim()) {
                  document.getElementById('offered-skill-input')?.focus();
                  return;
                }
                handleAddSkill(offeredSkillInput, 'offered');
              }}
              disabled={isAddingSkill}
              className={cn(
                'px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer',
                isAddingSkill
                  ? 'bg-[var(--bg-surface-solid)] border-[var(--glass-border)] text-[var(--text-muted)] cursor-not-allowed'
                  : offeredSkillInput.trim()
                    ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald hover:bg-accent-emerald/20 hover:scale-105 active:scale-95'
                    : 'bg-[var(--bg-surface-solid)] border-[var(--glass-border)] text-[var(--text-muted)] hover:border-accent-emerald/30 hover:text-accent-emerald'
              )}
            >
              {isAddingSkill ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            </button>
          </div>
        </GlassCard>

        <GlassCard padding="lg">
          <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-accent-violet mb-4">Skills I Want</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {desiredSkills.length > 0 ? (
              desiredSkills.map((s) => (
                <SkillBadge 
                  key={s.id} 
                  skill={s.skill_name} 
                  variant="want" 
                  size="md" 
                  onRemove={() => handleRemoveSkill(s.id, s.skill_name)} 
                />
              ))
            ) : (
              <p className="text-sm text-[var(--text-muted)] w-full">No skills added yet.</p>
            )}
          </div>

          <div className="flex gap-2 mt-auto">
            <div className="relative flex-1">
              <input
                id="desired-skill-input"
                list="all-skills-desired"
                value={desiredSkillInput}
                onChange={(e) => setDesiredSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSkill(desiredSkillInput, 'desired'); } }}
                placeholder="Type a skill you want to learn..."
                className="w-full pl-3 pr-4 py-2.5 rounded-xl bg-[var(--bg-surface-solid)] border border-dashed border-[var(--glass-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-accent-violet/50 focus:border-solid transition-all"
              />
              <datalist id="all-skills-desired">
                {ALL_SKILLS
                  .filter((skill) => !offeredSkills.some((s) => s.skill_name.toLowerCase() === skill.name.toLowerCase()))
                  .map((skill) => (
                    <option key={skill.id} value={skill.name} />
                  ))}
              </datalist>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!desiredSkillInput.trim()) {
                  document.getElementById('desired-skill-input')?.focus();
                  return;
                }
                handleAddSkill(desiredSkillInput, 'desired');
              }}
              disabled={isAddingSkill}
              className={cn(
                'px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer',
                isAddingSkill
                  ? 'bg-[var(--bg-surface-solid)] border-[var(--glass-border)] text-[var(--text-muted)] cursor-not-allowed'
                  : desiredSkillInput.trim()
                    ? 'bg-accent-violet/10 border-accent-violet/30 text-accent-violet hover:bg-accent-violet/20 hover:scale-105 active:scale-95'
                    : 'bg-[var(--bg-surface-solid)] border-[var(--glass-border)] text-[var(--text-muted)] hover:border-accent-violet/30 hover:text-accent-violet'
              )}
            >
              {isAddingSkill ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            </button>
          </div>
        </GlassCard>
      </div>

      {/* Danger Zone — Delete Account */}
      <GlassCard padding="lg" className="border-red-500/20 bg-red-500/[0.03]">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-red-400 mb-2 flex items-center gap-2">
          <AlertTriangle size={15} /> Danger Zone
        </h3>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          id="delete-account-btn"
          onClick={async () => {
            const confirmed = window.confirm(
              'Are you absolutely sure? This will permanently delete your account, all your skills, sessions, and reviews. This cannot be undone.'
            );
            if (!confirmed) return;

            setDeleting(true);
            try {
              const res = await authFetch('/api/account/delete', { method: 'DELETE' });
              if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || 'Failed to delete account');
                return;
              }
              const supabase = createClient();
              await supabase.auth.signOut();
              toast.success('Account deleted. Goodbye!');
              window.location.href = '/signup';
            } catch (err) {
              console.error('Delete account error:', err);
              toast.error('Something went wrong. Please try again.');
            } finally {
              setDeleting(false);
            }
          }}
          disabled={deleting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deleting ? <><Loader2 size={16} className="animate-spin" /> Deleting...</> : <><Trash2 size={16} /> Delete My Account</>}
        </button>
      </GlassCard>

      {/* Bottom save button */}
      <div className="flex justify-end pb-8">
        <GradientButton onClick={handleSave} disabled={saving} size="lg">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Save size={16} /> Save All Changes</>}
        </GradientButton>
      </div>
    </div>
  );
}

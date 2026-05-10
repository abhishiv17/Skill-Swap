import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: Missing Service Role Key' }, { status: 500 });
    }

    // We need an admin client to bypass Row Level Security when updating another user's credits
    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Normal client to check if the caller is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Fetch the session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'completed') {
      return NextResponse.json({ error: 'Session is already completed' }, { status: 400 });
    }

    // End the session
    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update session status' }, { status: 500 });
    }

    // --- CREDIT ECONOMY LOGIC ---
    // Learner already paid when the session was created (escrow).
    const { data: learnerData } = await supabaseAdmin.from('profiles').select('total_sessions').eq('id', session.learner_id).single();
    if (learnerData) {
      await supabaseAdmin.from('profiles').update({ 
        total_sessions: (learnerData.total_sessions || 0) + 1
      }).eq('id', session.learner_id);
    }

    // Add 1 credit to teacher
    const { data: teacherData } = await supabaseAdmin.from('profiles').select('credits, total_sessions').eq('id', session.teacher_id).single();
    if (teacherData) {
      await supabaseAdmin.from('profiles').update({ 
        credits: teacherData.credits + 1,
        total_sessions: (teacherData.total_sessions || 0) + 1
      }).eq('id', session.teacher_id);
    }

    return NextResponse.json({ success: true, message: "Session ended. Credits processed." });
  } catch (error) {
    console.error("End Session Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

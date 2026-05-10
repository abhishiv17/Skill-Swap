import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: Missing Service Role Key' }, { status: 500 });
    }

    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, status } = await req.json();
    if (!sessionId || !status) {
      return NextResponse.json({ error: 'sessionId and status are required' }, { status: 400 });
    }

    // Fetch the session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Only authorized users can update the session
    if (session.teacher_id !== user.id && session.learner_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Validate state transitions
    if (session.status === 'completed' || session.status === 'cancelled' || session.status === 'rejected') {
      return NextResponse.json({ error: 'Session is already in a final state' }, { status: 400 });
    }

    // Update session status
    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({ status })
      .eq('id', sessionId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update session status' }, { status: 500 });
    }

    // --- ESCROW REFUND LOGIC ---
    // If the session is cancelled or rejected, refund the 1 credit to the learner
    if (status === 'cancelled' || status === 'rejected') {
      const { data: learnerData } = await supabaseAdmin.from('profiles').select('credits').eq('id', session.learner_id).single();
      if (learnerData) {
        await supabaseAdmin.from('profiles').update({ 
          credits: learnerData.credits + 1 
        }).eq('id', session.learner_id);
      }
    }

    return NextResponse.json({ success: true, message: `Session ${status}.` });
  } catch (error) {
    console.error("Session Status Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Only instantiate Resend if the API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize Supabase with Service Role Key to bypass RLS and read auth.users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { receiverId, subject, message } = await req.json();

    if (!receiverId || !subject || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Get the receiver's email from auth.users
    const { data: userAdminData, error: adminError } = await supabaseAdmin.auth.admin.getUserById(receiverId);

    if (adminError || !userAdminData?.user?.email) {
      console.error('Failed to get receiver email:', adminError);
      return NextResponse.json({ error: 'Receiver email not found' }, { status: 404 });
    }

    const receiverEmail = userAdminData.user.email;

    // 2. Send email via Resend
    if (resend) {
      const { error: resendError } = await resend.emails.send({
        from: 'CodeCarnage <notifications@resend.dev>', // Update this if you have a custom domain
        to: receiverEmail,
        subject: subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${subject}</h2>
            <p>${message}</p>
            <hr style="border: 1px solid #eaeaea; margin-top: 20px;" />
            <p style="font-size: 12px; color: #666;">
              You are receiving this email because of your account activity on CodeCarnage.
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/messages">View in Dashboard</a>
            </p>
          </div>
        `,
      });

      if (resendError) {
        console.error('Resend error:', resendError);
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Email sent successfully' });
    } else {
      // Fallback/Mock if RESEND_API_KEY is not configured
      console.log('--- EMAIL MOCK ---');
      console.log(`To: ${receiverEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(`Message: ${message}`);
      console.log('------------------');
      return NextResponse.json({ 
        success: true, 
        message: 'Mock email sent. Please add RESEND_API_KEY to your .env.local to send real emails.' 
      });
    }

  } catch (error) {
    console.error('Email API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

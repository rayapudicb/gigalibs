import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_LOCALES, resolveSupportedLocale } from '@gigalibs/i18n';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const current = cookieStore.get('gigalibs_locale')?.value || 'en-US';
  const resolved = resolveSupportedLocale(current);
  return NextResponse.json({
    locale: resolved.code,
    meta: resolved,
    supportedLocales: SUPPORTED_LOCALES,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const targetLocale = typeof body?.locale === 'string' ? body.locale : 'en-US';
    const resolved = resolveSupportedLocale(targetLocale);

    const response = NextResponse.json({
      success: true,
      locale: resolved.code,
      meta: resolved,
    });

    response.cookies.set('gigalibs_locale', resolved.code, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // Accessible to client-side scripts
      maxAge: 31536000, // 1 year
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: 400 },
    );
  }
}

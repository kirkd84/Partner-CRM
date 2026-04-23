import { auth } from './auth';

export default auth((req) => {
  const isLogin = req.nextUrl.pathname.startsWith('/login');
  const isAuthApi = req.nextUrl.pathname.startsWith('/api/auth');
  const isHealth = req.nextUrl.pathname === '/api/health';
  const isLoggedIn = !!req.auth;

  if (!isLoggedIn && !isLogin && !isAuthApi && !isHealth) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', req.nextUrl.pathname);
    return Response.redirect(url);
  }
  if (isLoggedIn && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/radar';
    url.search = '';
    return Response.redirect(url);
  }
});

export const config = {
  matcher: [
    // Run on everything except static assets and _next internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};

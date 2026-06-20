# ResyBot Setup Guide

## 1. Generate secrets

```bash
openssl rand -hex 32   # run twice: once for NEXTAUTH_SECRET, once for ENCRYPTION_KEY
openssl rand -hex 16   # for CRON_SECRET
```

## 2. Set up Neon Postgres (free)

1. Go to vercel.com → your project → Storage → Marketplace → Neon Postgres → Add
2. Copy the `DATABASE_URL` connection string

## 3. Google OAuth

1. Go to console.cloud.google.com → New Project
2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Authorized redirect URIs: `https://your-domain.vercel.app/api/auth/callback/google`
4. Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

## 4. Resend (free email notifications)

1. Sign up at resend.com (free tier: 3,000 emails/month)
2. Add & verify your domain (or use `onboarding@resend.dev` for testing)
3. Create an API key and copy it as `RESEND_API_KEY`

## 5. Fill in .env.local

```
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="https://your-domain.vercel.app"
NEXTAUTH_SECRET="<generated>"
GOOGLE_CLIENT_ID="<from google>"
GOOGLE_CLIENT_SECRET="<from google>"
RESEND_API_KEY="re_..."
NOTIFICATION_FROM_EMAIL="resybot@yourdomain.com"
ENCRYPTION_KEY="<generated 64-char hex>"
CRON_SECRET="<generated>"
```

## 6. Run database migrations

```bash
npx prisma migrate dev --name init
```

## 7. Deploy to Vercel

```bash
vercel --prod
```

Add all env vars in Vercel dashboard → Project → Settings → Environment Variables.
The cron job (every 1 minute) is automatically configured via vercel.json.

## 8. Use the app

1. Sign in with Google
2. Click "Connect Resy" → enter your Resy email + password (verified + encrypted immediately)
3. Click "Add Target" → search for a restaurant
4. Pick your reservation date — the snipe time is auto-suggested based on the restaurant's known release schedule
5. Click "Add Target" → the bot will fire at the exact snipe time and email you when it books

## Finding a Venue ID manually

Open resy.com, go to any restaurant, open browser DevTools → Network tab, look for a `/find` API call.
The `venue_id` query parameter is the number you need.

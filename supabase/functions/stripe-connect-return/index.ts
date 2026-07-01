/**
 * stripe-connect-return
 *
 * A tiny redirect page that Stripe sends the creator to after onboarding.
 * Stripe requires https:// return URLs, so we use this as an intermediate
 * hop that immediately redirects back into the app via deep link.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const url    = new URL(req.url)
  const status = url.searchParams.get('status') || 'complete'
  const deepLink = `stacklog://stripe-return?status=${status}`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${deepLink}">
  <title>Returning to StackLog...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #000;
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
      box-sizing: border-box;
    }
    p { color: #aaa; margin-bottom: 24px; }
    a {
      display: inline-block;
      background: #635BFF;
      color: #fff;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 999px;
      font-size: 16px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <p>Redirecting you back to StackLog...</p>
  <a href="${deepLink}">Tap here to return to the app</a>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
})

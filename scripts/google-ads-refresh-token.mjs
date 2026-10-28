// ===========================================
// Mint a new GOOGLE_ADS_REFRESH_TOKEN
// ===========================================
// Uses GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET from .env.local.
// Opens a local listener, prints a Google sign-in link, and when you approve
// it, exchanges the code and prints the refresh token for you to paste into
// .env.local yourself. This script writes no files.
//
//   node scripts/google-ads-refresh-token.mjs            (port 8085)
//   node scripts/google-ads-refresh-token.mjs 9000       (another port)
//
// Sign in with the Google account that has access to the MCC
// (GOOGLE_ADS_MCC_ID). If Google says "redirect_uri_mismatch", the OAuth
// client is a Web client: add http://localhost:<port> under Authorized
// redirect URIs in the Cloud console, or use a Desktop client.

import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { config } from 'dotenv'

config({ path: '.env.local' })

const clientId = process.env.GOOGLE_ADS_CLIENT_ID
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET must be set in .env.local')
  process.exit(1)
}

const port = Number(process.argv[2] || 8085)
const redirectUri = `http://localhost:${port}`
const state = randomBytes(16).toString('hex')
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    // offline + consent makes Google return a refresh token every time.
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

function page(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(text)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri)
  if (url.pathname !== '/') return page(res, 404, 'Not found')

  const error = url.searchParams.get('error')
  if (error) {
    page(res, 400, `Google returned an error: ${error}. You can close this tab.`)
    console.error(`\nGoogle returned an error: ${error}`)
    return server.close()
  }
  if (url.searchParams.get('state') !== state) return page(res, 400, 'State did not match. Start the script again.')
  const code = url.searchParams.get('code')
  if (!code) return page(res, 400, 'No code in the response.')

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.refresh_token) {
      page(res, 500, 'The token exchange failed. See the terminal. You can close this tab.')
      console.error('\nToken exchange failed:', tokenRes.status, tokens.error, tokens.error_description ?? '')
      if (tokenRes.ok) console.error('Google sent no refresh token. Remove the app at https://myaccount.google.com/permissions and run this again.')
      return server.close()
    }

    // Prove the new token works before you paste it.
    const check = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    page(res, 200, 'Done. The refresh token is in your terminal. You can close this tab.')
    console.log('\nScope granted:', tokens.scope)
    console.log('Refresh check:', check.ok ? 'OK, the token mints access tokens' : `FAILED (HTTP ${check.status})`)
    console.log('\nPaste this line into .env.local, replacing the old one:\n')
    console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}\n`)
    console.log('Update the same variable in Vercel too, or production keeps the old token.')
  } catch (err) {
    page(res, 500, 'Something went wrong. See the terminal.')
    console.error('\nFailed:', err instanceof Error ? err.message : err)
  }
  server.close()
})

server.on('error', (err) => {
  console.error(`Could not listen on port ${port}: ${err.message}. Pass another port as the first argument.`)
  process.exit(1)
})

server.listen(port, () => {
  console.log(`Listening on ${redirectUri}`)
  console.log('\nOpen this link, sign in with the account that manages the MCC, and approve:\n')
  console.log(authUrl + '\n')
})

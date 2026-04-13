# 🎫 Corrosive Cheats — Auto Ticket Bot Setup Guide

## STEP 1 — Create the Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it "Corrosive Tickets" → Create
3. Go to **Bot** tab → Click **Add Bot** → Confirm
4. Under **Token** → click **Reset Token** → copy and save it (this is your BOT_TOKEN)
5. Scroll down, enable these under **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
6. Go to **OAuth2 → URL Generator**:
   - Scopes: ✅ `bot`
   - Bot Permissions: ✅ Manage Channels, ✅ Send Messages, ✅ View Channels, ✅ Read Message History
7. Copy the generated URL → open it in browser → add bot to your server


## STEP 2 — Get Your Discord IDs

Enable Developer Mode in Discord:
Settings → Advanced → Developer Mode ✅

- **GUILD_ID**: Right-click your server name → Copy Server ID
- **CATEGORY_ID**: Right-click the ticket category → Copy Category ID
  (Create a category called "TICKETS" in your server first)
- **STAFF_ROLE_ID**: Right-click your staff role in a message or Server Settings → Copy Role ID


## STEP 3 — Deploy to Railway

1. Go to https://railway.app → Sign up / Log in
2. Click **New Project** → **Deploy from GitHub repo**
   - Or use **Deploy from local** → upload the `corrosive-ticket-bot` folder
3. Once deployed, go to your project → **Variables** tab
4. Add these environment variables:

   ```
   BOT_TOKEN        = (from Step 1)
   GUILD_ID         = (from Step 2)
   CATEGORY_ID      = (from Step 2)
   STAFF_ROLE_ID    = (from Step 2)
   ALLOWED_ORIGIN   = https://corrosivecheats.netlify.app
   ```

5. Railway will give you a deployment URL like:
   `https://corrosive-ticket-bot.up.railway.app`


## STEP 4 — Update Your Website

In `index.html`, find this line:
```js
const BACKEND_URL = 'https://YOUR-RAILWAY-APP.up.railway.app/create-ticket';
```

Replace `YOUR-RAILWAY-APP` with your actual Railway app name.
Then re-upload `index.html` to Netlify.


## STEP 5 — Test It

1. Fill out your website form and submit
2. A new private channel like `#ticket-username-1234` should appear in your Discord server
3. It will contain the order details + a 🔒 Close Ticket button


## How Tickets Work

- Each form submission creates a **private channel** only staff can see
- Staff role is automatically mentioned/pinged
- Clicking **🔒 Close Ticket** deletes the channel after 5 seconds
- Channel name format: `ticket-[discordname]-[id]`

const { Client, GatewayIntentBits, PermissionsBitField, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const BOT_TOKEN            = process.env.BOT_TOKEN;
const GUILD_ID             = process.env.GUILD_ID;
const CATEGORY_ID          = process.env.CATEGORY_ID;
const STAFF_ROLE_ID        = process.env.STAFF_ROLE_ID;
const DISCORD_CLIENT_ID    = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET= process.env.DISCORD_CLIENT_SECRET;
const SESSION_SECRET       = process.env.SESSION_SECRET || 'changeme';
const FRONTEND_URL         = process.env.FRONTEND_URL || 'https://corrosive-cheats.vercel.app';
const PORT                 = process.env.PORT || 3000;
const REDIRECT_URI         = `https://corrosive-ticket-bot-production.up.railway.app/auth/callback`;

// Simple in-memory session store (resets on redeploy, fine for this use case)
const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── DISCORD CLIENT ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

client.once('clientReady', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

// ─── EXPRESS SERVER ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true,
}));

// Health check
app.get('/', (req, res) => res.json({ status: 'online' }));

// ─── AUTH: Step 1 — Redirect to Discord login ─────────────────────────────────
app.get('/auth/login', (req, res) => {
  const state = generateToken();
  // Store state temporarily to prevent CSRF
  sessions.set(`state_${state}`, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.join',
    state,
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// ─── AUTH: Step 2 — Discord redirects back here ───────────────────────────────
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}?auth=error`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');

    // Get user info from Discord
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // Add user to the guild automatically
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      await guild.members.add(user.id, {
        accessToken: tokenData.access_token,
        nick: user.username,
      });
      console.log(`✅ Added ${user.username} to guild`);
    } catch (e) {
      // User might already be in server, that's fine
      console.log(`ℹ️ Could not add to guild (may already be member): ${e.message}`);
    }

    // Create a session token
    const sessionToken = generateToken();
    sessions.set(sessionToken, {
      userId: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      accessToken: tokenData.access_token,
      createdAt: Date.now(),
    });

    // Redirect back to frontend with session token
    res.redirect(`${FRONTEND_URL}?session=${sessionToken}&username=${encodeURIComponent(user.username)}&avatar=${user.avatar || ''}&id=${user.id}`);

  } catch (err) {
    console.error('❌ Auth error:', err);
    res.redirect(`${FRONTEND_URL}?auth=error`);
  }
});

// ─── AUTH: Get current user ────────────────────────────────────────────────────
app.get('/auth/me', (req, res) => {
  const token = req.headers['x-session-token'];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const session = sessions.get(token);
  res.json({
    userId: session.userId,
    username: session.username,
    avatar: session.avatar,
  });
});

// ─── TICKET ENDPOINT ───────────────────────────────────────────────────────────
app.post('/create-ticket', async (req, res) => {
  const { discord, game, message, sessionToken } = req.body;

  if (!discord || !game) {
    return res.status(400).json({ error: 'Missing discord or game field.' });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);

    // Try to find member - first by session userId, then by username
    let member = null;

    if (sessionToken && sessions.has(sessionToken)) {
      const session = sessions.get(sessionToken);
      try {
        member = await guild.members.fetch(session.userId);
      } catch (e) {}
    }

    if (!member) {
      await guild.members.fetch();
      member = guild.members.cache.find(m =>
        m.user.username.toLowerCase() === discord.toLowerCase() ||
        m.user.tag.toLowerCase() === discord.toLowerCase()
      );
    }

    const safeName = discord.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 20) || 'user';
    const channelName = `ticket-${safeName}-${Date.now().toString().slice(-4)}`;

    const permissionOverwrites = [
      {
        id: guild.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      ...(STAFF_ROLE_ID ? [{
        id: STAFF_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      }] : []),
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
        ],
      },
    ];

    if (member) {
      permissionOverwrites.push({
        id: member.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      });
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID || null,
      permissionOverwrites,
    });

    const embed = new EmbedBuilder()
      .setTitle('🎫 New Order Ticket')
      .setColor(0xFF1F1F)
      .addFields(
        { name: '👤 Discord Username', value: discord, inline: true },
        { name: '🎮 Game', value: game, inline: true },
        { name: '💬 Message', value: message || '*(no message provided)*', inline: false },
      )
      .setFooter({ text: 'Corrosive Cheats • corrosivecheats.vercel.app' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('🔒 Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    const staffMention = STAFF_ROLE_ID ? `<@&${STAFF_ROLE_ID}>` : '@here';
    const userMention = member ? `<@${member.id}>` : `**${discord}**`;

    await ticketChannel.send({
      content: `${staffMention} — New ticket from ${userMention}`,
      embeds: [embed],
      components: [row],
    });

    if (member) {
      await ticketChannel.send({
        content: `👋 Welcome ${userMention}! Our staff will be with you shortly.`,
      });
    }

    console.log(`✅ Ticket created: #${channelName} for ${discord}`);
    res.json({ success: true, channel: channelName, channelId: ticketChannel.id });

  } catch (err) {
    console.error('❌ Error creating ticket:', err);
    res.status(500).json({ error: 'Failed to create ticket. Check bot permissions.' });
  }
});

// ─── CLOSE TICKET BUTTON ──────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'close_ticket') return;
  const channel = interaction.channel;
  await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...', ephemeral: false });
  setTimeout(() => channel.delete().catch(console.error), 5000);
});

// ─── START ────────────────────────────────────────────────────────────────────
client.login(BOT_TOKEN).then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
}).catch(err => {
  console.error('❌ Failed to login bot:', err.message);
  process.exit(1);
});

const { Client, GatewayIntentBits, PermissionsBitField, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const cors = require('cors');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const BOT_TOKEN       = process.env.BOT_TOKEN;
const GUILD_ID        = process.env.GUILD_ID;
const CATEGORY_ID     = process.env.CATEGORY_ID;
const STAFF_ROLE_ID   = process.env.STAFF_ROLE_ID;
const PORT            = process.env.PORT || 3000;

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
}));

app.get('/', (req, res) => res.json({ status: 'online' }));

// ─── TICKET ENDPOINT ───────────────────────────────────────────────────────────
app.post('/create-ticket', async (req, res) => {
  const { discord, game, message } = req.body;

  if (!discord || !game) {
    return res.status(400).json({ error: 'Missing discord or game field.' });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);

    // Try to find the member in the server by username
    await guild.members.fetch(); // fetch all members
    const member = guild.members.cache.find(m =>
      m.user.username.toLowerCase() === discord.toLowerCase() ||
      m.user.tag.toLowerCase() === discord.toLowerCase() ||
      `${m.user.username}#${m.user.discriminator}`.toLowerCase() === discord.toLowerCase()
    );

    const safeName = discord.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 20) || 'user';
    const channelName = `ticket-${safeName}-${Date.now().toString().slice(-4)}`;

    // Build permission overwrites
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

    // If member found in server, add them to the channel
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
      .setFooter({ text: 'Corrosive Cheats • corrosivecheats.netlify.app' })
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

    // Send a welcome message to the customer if they're in the server
    if (member) {
      await ticketChannel.send({
        content: `👋 Welcome ${userMention}! Our staff will be with you shortly. Please describe your inquiry here.`,
      });
    }

    console.log(`✅ Ticket created: #${channelName} for ${discord} (member found: ${!!member})`);
    res.json({ success: true, channel: channelName });

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

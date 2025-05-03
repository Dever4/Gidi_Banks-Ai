/**
 * Command to help users fix session errors by providing guidance
 * This command provides instructions on how to fix session errors
 */

module.exports.execute = async (client, flag, arg, M) => {
    // Check if the user is a mod (admin)
    const isMod = client.config.mods.includes(M.sender.split('@')[0]);
    
    // Create a helpful message for users
    let message = `*🔧 Session Error Troubleshooting*\n\n`;
    message += `If you're experiencing "No sessions" errors, here are some solutions:\n\n`;
    message += `1️⃣ *For regular users:*\n`;
    message += `• Wait a few minutes and try again\n`;
    message += `• Try with fewer mentions (for tagall command)\n`;
    message += `• Ask a bot admin to restart the bot\n\n`;
    
    // If the user is a mod, provide restart instructions
    if (isMod) {
        message += `2️⃣ *Admin commands:*\n`;
        message += `• Use \`${client.config.prefix}restart\` to restart the bot\n`;
        message += `• Or restart from the admin panel at http://localhost:3000\n\n`;
        
        // Add a button to restart directly
        await client.sendMessage(
            M.from,
            {
                text: message,
                footer: '🤖 Krypton Bot',
                buttons: [
                    {
                        buttonId: `${client.config.prefix}restart`,
                        buttonText: { displayText: '🔄 Restart Bot' },
                        type: 1
                    }
                ]
            },
            { quoted: M }
        );
    } else {
        // For regular users, just send the message
        await M.reply(message);
    }
};

module.exports.command = {
    name: 'fixsession',
    aliases: ['fix', 'session', 'repair'],
    category: 'general',
    exp: 0,
    usage: '',
    description: 'Provides guidance on how to fix session errors'
};

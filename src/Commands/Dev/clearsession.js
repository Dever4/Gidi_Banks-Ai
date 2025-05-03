/**
 * Command to clear the session folder and restart the bot
 * This can help fix "No sessions" errors
 */

const fs = require('fs-extra');
const path = require('path');

module.exports.execute = async (client, flag, arg, M) => {
    try {
        // Inform the user that the process has started
        await M.reply('🔄 *Clearing session data and restarting bot...*\n\nThis will fix most session errors. Please wait about 30 seconds for the bot to restart.');
        
        // Path to the session folder
        const sessionPath = path.join(process.cwd(), 'session');
        
        // Check if the session folder exists
        if (fs.existsSync(sessionPath)) {
            // Schedule the session clearing and restart after sending the reply
            setTimeout(async () => {
                try {
                    // Empty the session directory
                    await fs.emptyDir(sessionPath);
                    console.log('✅ Session folder cleared successfully');
                    
                    // Restart the bot
                    client.utils.restart();
                } catch (error) {
                    console.error('Error during session clearing:', error);
                }
            }, 2000);
        } else {
            // If session folder doesn't exist, just restart
            setTimeout(() => {
                client.utils.restart();
            }, 2000);
        }
    } catch (error) {
        console.error('Error in clearsession command:', error);
        return M.reply('🟥 *An error occurred while trying to clear the session!*');
    }
};

module.exports.command = {
    name: 'clearsession',
    aliases: ['clearses', 'fixsession', 'fixses'],
    category: 'dev',
    exp: 0,
    usage: '',
    description: 'Clears the session folder and restarts the bot to fix session errors'
};

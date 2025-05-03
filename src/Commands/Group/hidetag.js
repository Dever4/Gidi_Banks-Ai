/**
 * Command to send a message that notifies all members in a group without visibly tagging them
 * This is more efficient than tagall and less likely to cause session errors
 */

module.exports.execute = async (client, flag, arg, M) => {
    // Check if the message is from a group
    if (!M.isGroup) {
        return M.reply('🟥 *This command can only be used in groups!*');
    }

    try {
        // Get group metadata
        const groupMetadata = await client.groupMetadata(M.from);
        const participants = groupMetadata.participants;

        // Check if the user provided a message
        const message = arg.trim() ? arg.trim() : 'Hello everyone!';

        // Maximum number of participants to tag at once to avoid session errors
        const MAX_PARTICIPANTS = 5;

        // If the group is small enough, tag everyone at once
        if (participants.length <= MAX_PARTICIPANTS) {
            try {
                await client.sendMessage(
                    M.from,
                    {
                        text: message,
                        mentions: participants.map(p => p.id)
                    },
                    { quoted: M }
                );
                return;
            } catch (smallGroupError) {
                console.error('Error in hidetag (small group):', smallGroupError);
                // If it fails, try the alternative method below
            }
        }

        // For larger groups or if the above method failed, use a more reliable approach
        // First send the message without mentions
        await client.sendMessage(
            M.from,
            {
                text: message
            },
            { quoted: M }
        );

        // Then send an empty message with mentions
        // This is less likely to cause session errors
        await client.sendMessage(
            M.from,
            {
                text: '',
                mentions: participants.map(p => p.id)
            }
        );

    } catch (error) {
        console.error('Error in hidetag command:', error);

        // Provide more specific error messages based on the error type
        if (error.message && error.message.includes('No sessions')) {
            return M.reply('🟥 *Session error occurred!*\n\nPlease try using the command again later or ask the admin to restart the bot.');
        } else {
            return M.reply('🟥 *An error occurred while sending the hidetag message!*');
        }
    }
};

module.exports.command = {
    name: 'hidetag',
    aliases: ['htag', 'hidden', 'h'],
    category: 'group',
    exp: 10,
    usage: '[message]',
    description: 'Notifies all members in the group without visibly tagging them'
};

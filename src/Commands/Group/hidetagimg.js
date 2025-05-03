/**
 * Command to send an image with a caption that notifies all members in a group without visibly tagging them
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

        // Check if there's a quoted message with an image
        if (M.quoted && (M.quoted.type === 'imageMessage' || M.quoted.type === 'videoMessage')) {
            // Download the media from the quoted message
            const media = await M.quoted.download();

            // Check if the user provided a caption
            const caption = arg.trim() ? arg.trim() : 'Hello everyone!';

            try {
                // Send the image with caption and mentions
                await client.sendMessage(
                    M.from,
                    {
                        image: media,
                        caption: caption,
                        mentions: participants.map(p => p.id)
                    },
                    { quoted: M }
                );
            } catch (mediaError) {
                console.error('Error sending image with mentions:', mediaError);

                // If that fails, try the two-step approach
                // First send the image with caption
                await client.sendMessage(
                    M.from,
                    {
                        image: media,
                        caption: caption
                    },
                    { quoted: M }
                );

                // Then send an empty message with mentions
                await client.sendMessage(
                    M.from,
                    {
                        text: '',
                        mentions: participants.map(p => p.id)
                    }
                );
            }

            return;
        }

        // If no image is quoted, inform the user
        return M.reply('🟨 *Please quote an image or video with this command!*');

    } catch (error) {
        console.error('Error in hidetagimg command:', error);

        // Provide more specific error messages based on the error type
        if (error.message && error.message.includes('No sessions')) {
            return M.reply('🟥 *Session error occurred!*\n\nPlease try using the command again later or ask the admin to restart the bot.');
        } else {
            return M.reply('🟥 *An error occurred while sending the hidetag image!*');
        }
    }
};

module.exports.command = {
    name: 'hidetagimg',
    aliases: ['himg', 'hiddenimg', 'hi'],
    category: 'group',
    exp: 10,
    usage: '[caption] (quote an image)',
    description: 'Sends an image with a caption that notifies all members without visibly tagging them'
};

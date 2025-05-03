/**
 * Command to tag all members in a group
 * This command will mention all members in the group in a single message
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

        // Create the message with all mentions
        let text = `*「 TAG ALL 」*\n\n${message}\n\n`;

        // Create a counter for numbering
        let counter = 1;

        // Add each participant to the text with a tag
        participants.forEach((participant) => {
            // Skip adding the bot itself to the tag list
            if (participant.id !== client.user.id.split(':')[0] + '@s.whatsapp.net') {
                text += `${counter}. @${participant.id.split('@')[0]}\n`;
                counter++;
            }
        });

        // Filter out the bot from the mentions list
        const mentionsArray = participants
            .filter(p => p.id !== client.user.id.split(':')[0] + '@s.whatsapp.net')
            .map(p => p.id);

        // If there are too many participants, split them into smaller groups
        // This helps avoid session errors by not trying to tag too many people at once
        const CHUNK_SIZE = 5; // Maximum number of mentions per message (reduced from 15 to avoid session errors)

        if (mentionsArray.length <= CHUNK_SIZE) {
            // Send the message with mentions if the group is small enough
            await client.sendMessage(
                M.from,
                {
                    text,
                    mentions: mentionsArray
                },
                { quoted: M }
            );
        } else {
            // For larger groups, split the mentions into chunks
            // First send a message without mentions
            await client.sendMessage(
                M.from,
                {
                    text: `*「 TAG ALL 」*\n\n${message}\n\nTagging ${mentionsArray.length} members in smaller groups to avoid errors...`
                },
                { quoted: M }
            );

            // Split the text into chunks
            const textChunks = [];
            let currentChunk = "";
            let currentCounter = 1;

            participants.forEach((participant) => {
                // Skip the bot
                if (participant.id !== client.user.id.split(':')[0] + '@s.whatsapp.net') {
                    const line = `${currentCounter}. @${participant.id.split('@')[0]}\n`;

                    if (currentCounter % CHUNK_SIZE === 1) {
                        // Start a new chunk
                        currentChunk = line;
                    } else {
                        // Add to current chunk
                        currentChunk += line;
                    }

                    // If we've reached the chunk size or the last participant, save the chunk
                    if (currentCounter % CHUNK_SIZE === 0 || currentCounter === mentionsArray.length) {
                        textChunks.push(currentChunk);
                        currentChunk = "";
                    }

                    currentCounter++;
                }
            });

            // Send each chunk with its mentions
            for (let i = 0; i < textChunks.length; i++) {
                const startIdx = i * CHUNK_SIZE;
                const endIdx = Math.min(startIdx + CHUNK_SIZE, mentionsArray.length);
                const chunkMentions = mentionsArray.slice(startIdx, endIdx);

                try {
                    await client.sendMessage(
                        M.from,
                        {
                            text: `*Group ${i+1}/${textChunks.length}*\n\n${textChunks[i]}`,
                            mentions: chunkMentions
                        }
                    );

                    // Add a longer delay between messages to avoid rate limiting and session errors
                    if (i < textChunks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 3000)); // Increased from 1000ms to 3000ms
                    }
                } catch (chunkError) {
                    console.error(`Error sending chunk ${i+1}:`, chunkError);

                    // Check if it's a session error and provide more specific feedback
                    if (chunkError.message && chunkError.message.includes('No sessions')) {
                        await client.sendMessage(
                            M.from,
                            {
                                text: `⚠️ *Session error detected while tagging group ${i+1}/${textChunks.length}*\n\nTrying to continue with remaining groups...`
                            }
                        );
                    }

                    // Continue with other chunks even if one fails
                }
            }
        }

    } catch (error) {
        console.error('Error in tagall command:', error);

        // Provide more specific error messages based on the error type
        if (error.message && error.message.includes('No sessions')) {
            return M.reply('🟥 *Session error occurred!*\n\nThis usually happens when:\n1. The bot needs to be restarted\n2. There are too many members to tag at once\n\nPlease try again later or ask the admin to restart the bot.');
        } else {
            return M.reply('🟥 *An error occurred while tagging members! Try again with fewer members or without tagging.*');
        }
    }
};

module.exports.command = {
    name: 'tagall',
    aliases: ['everyone', 'all', 'tag'],
    category: 'group',
    exp: 10,
    usage: '[message]',
    description: 'Tags all members in the group with an optional message'
};

/**
 * Command to send a message to multiple groups
 * This command allows admins to send a message to multiple specified groups
 */

module.exports.execute = async (client, flag, arg, M) => {
    // Check if a message is provided
    if (!arg) {
        return M.reply('🟥 *No message provided!*');
    }

    try {
        // Get all groups the bot is in
        const allGroups = await client.getAllGroups();

        // Check if specific group IDs were provided
        let targetGroups = [];
        let message = arg;

        // If --groups flag is provided, extract the group IDs
        if (flag.some(f => f.startsWith('--groups='))) {
            const groupsFlag = flag.find(f => f.startsWith('--groups='));
            const groupIds = groupsFlag.replace('--groups=', '').split(',');

            // Validate and filter group IDs
            targetGroups = groupIds.filter(id => {
                // Convert short format to full JID if needed
                if (!id.includes('@g.us')) {
                    id = `${id}@g.us`;
                }
                return allGroups.includes(id);
            });

            // Remove the groups flag from the message
            message = arg.replace(groupsFlag, '').trim();

            if (targetGroups.length === 0) {
                return M.reply('🟨 *No valid group IDs provided or bot is not in those groups!*');
            }
        } else {
            // If no specific groups provided, use all groups
            targetGroups = allGroups;
        }

        // Check if we should tag all members
        const shouldTag = flag.includes('--tag');

        // Counter for successful messages
        let successCount = 0;

        // Send the message to each target group
        for (const groupId of targetGroups) {
            try {
                // Format the message
                const formattedMessage = `*「 ${client.config.name.toUpperCase()} ANNOUNCEMENT 」*\n\n${message}\n\n`;

                if (shouldTag) {
                    // Get group metadata to tag all members
                    const groupMetadata = await client.groupMetadata(groupId);

                    // Filter out the bot itself from the participants list
                    const participants = groupMetadata.participants.filter(
                        p => p.id !== client.user.id.split(':')[0] + '@s.whatsapp.net'
                    );

                    // Get mentions array
                    const mentionsArray = participants.map(p => p.id);

                    // If there are too many participants, send without tagging to avoid session errors
                    const CHUNK_SIZE = 15; // Maximum number of mentions per message

                    if (mentionsArray.length <= CHUNK_SIZE) {
                        // Send message with mentions if the group is small enough
                        await client.sendMessage(
                            groupId,
                            {
                                text: formattedMessage,
                                mentions: mentionsArray
                            }
                        );
                    } else {
                        // For larger groups, first send without mentions
                        await client.sendMessage(
                            groupId,
                            {
                                text: formattedMessage + `\n\n_Note: This message was sent to all ${mentionsArray.length} members, but mentions were disabled to avoid errors._`
                            }
                        );

                        // Then send a follow-up message with chunks of mentions if needed
                        // This is optional and can be enabled if you want to tag everyone despite the group size
                        /*
                        // Split the mentions into chunks and send multiple messages
                        for (let i = 0; i < mentionsArray.length; i += CHUNK_SIZE) {
                            const chunkMentions = mentionsArray.slice(i, i + CHUNK_SIZE);
                            try {
                                await client.sendMessage(
                                    groupId,
                                    {
                                        text: `*Tagging members ${i+1} to ${Math.min(i+CHUNK_SIZE, mentionsArray.length)}*`,
                                        mentions: chunkMentions
                                    }
                                );
                                // Add a small delay between messages
                                if (i + CHUNK_SIZE < mentionsArray.length) {
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                }
                            } catch (chunkError) {
                                console.error(`Error tagging chunk in group ${groupId}:`, chunkError);
                                // Continue with other chunks even if one fails
                            }
                        }
                        */
                    }
                } else {
                    // Send message without mentions
                    await client.sendMessage(
                        groupId,
                        {
                            text: formattedMessage
                        }
                    );
                }

                successCount++;
            } catch (groupError) {
                console.error(`Error sending to group ${groupId}:`, groupError);
                // Continue with other groups even if one fails
            }
        }

        return M.reply(`🟩 *Successfully sent message to ${successCount} out of ${targetGroups.length} groups!*`);

    } catch (error) {
        console.error('Error in multicast command:', error);
        return M.reply('🟥 *An error occurred while sending messages!*');
    }
};

module.exports.command = {
    name: 'multicast',
    aliases: ['multi', 'sendmulti'],
    category: 'dev',
    exp: 0,
    usage: '[message] [--groups=id1,id2,id3] [--tag]',
    description: 'Sends a message to multiple groups. Use --groups=id1,id2 to specify groups or omit to send to all groups. Use --tag to tag all members in the groups.'
};

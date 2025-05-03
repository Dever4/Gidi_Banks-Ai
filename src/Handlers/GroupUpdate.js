/**
 * Handler for group participant updates, including join requests.
 * This handler automatically approves join requests for groups.
 */

module.exports = async (update, client) => {
    try {
        // Log the update for debugging
        console.log(`🔄 Group update received: ${JSON.stringify(update, null, 2)}`);

        // Handle join requests
        if (update.type === 'request') {
            console.log(`👥 Join request received for group: ${update.id}`);

            // Check if auto-approval is enabled in settings
            const configTable = client.DB.table('config');
            const autoApproveJoinRequests = await configTable.get('autoApproveJoinRequests');

            // If auto-approval is explicitly disabled, don't proceed
            if (autoApproveJoinRequests === false) {
                console.log('⚠️ Auto-approval of join requests is disabled in settings');
                return;
            }

            // Get the group metadata to check if the bot is an admin
            try {
                const groupMetadata = await client.groupMetadata(update.id);
                console.log(`📋 Group name: ${groupMetadata.subject}`);

                // Check if the bot is an admin in the group
                const botId = client.user.id.split(':')[0] + '@s.whatsapp.net';
                const botIsAdmin = groupMetadata.participants.some(
                    participant => participant.id === botId && (participant.admin === 'admin' || participant.admin === 'superadmin')
                );

                if (!botIsAdmin) {
                    console.log(`⚠️ Bot is not an admin in group ${groupMetadata.subject}, cannot approve join requests`);
                    return;
                }

                // Approve all join requests
                try {
                    console.log(`✅ Approving join requests for: ${update.participants.join(', ')}`);

                    // Use the correct method as provided in the example
                    const response = await client.groupRequestParticipantsUpdate(
                        update.id, // group id
                        update.participants, // array of participant JIDs
                        'approve' // action: 'approve' or 'reject'
                    );

                    console.log(`✅ Approval response:`, response);

                    // No welcome message - just log the approval
                    console.log(`✅ Join requests approved successfully`)
                } catch (approvalError) {
                    console.error(`🚨 Error approving join requests:`, approvalError);
                }
            } catch (metadataError) {
                console.error(`🚨 Error getting group metadata for ${update.id}:`, metadataError);
            }
        }

        // Handle when participants join (after approval)
        if (update.type === 'add') {
            console.log(`👥 New participants joined group: ${update.id}`);

            try {
                const groupMetadata = await client.groupMetadata(update.id);

                // Get the group link from QuickDB to include in welcome message
                const configTable = client.DB.table('config');
                const groupLink = await configTable.get('groupLink');

                // Send welcome message to new participants
                for (const participant of update.participants) {
                    // Skip if the new participant is the bot itself
                    if (participant === client.user.id.split(':')[0] + '@s.whatsapp.net') continue;

                    console.log(`🎉 Sending welcome message to: ${participant}`);

                    // Send a welcome message to the group
                    await client.sendMessage(update.id, {
                        text: `Welcome to *${groupMetadata.subject}* @${participant.split('@')[0]}! 🎉\n\nPlease read the group rules and enjoy your stay.`,
                        mentions: [participant]
                    });
                }
            } catch (error) {
                console.error(`🚨 Error handling new participants in group ${update.id}:`, error);
            }
        }
    } catch (error) {
        console.error('🚨 Error in GroupUpdateHandler:', error);
    }
};

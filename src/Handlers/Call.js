/**
 * Handler for call events.
 * Sends a human-like warning on first call and blocks on second call.
 */

module.exports = async (call, client) => {
    try {
        // Only process incoming calls
        if (call.status !== 'offer') return;

        // Get the caller's JID
        const caller = call.from;

        // Skip if the caller is a group
        if (caller.includes('@g.us')) return;

        console.log(`📞 Call received from: ${caller}`);

        // Check if this user has called before
        const callsTable = client.DB.table('calls');
        const callCount = await callsTable.get(caller) || 0;

        // Reject the call
        await client.rejectCall(call.id, call.from);
        console.log(`📞 Call rejected from: ${caller}`);

        if (callCount === 0) {
            // First call - send warning (human-like message)
            console.log(`⚠️ First call from ${caller} - sending warning`);

            // Get random human-like warning message
            const warningMessages = [
                `Hey there! Sorry I couldn't answer your call right now. I'm currently unavailable for calls, but you can text me instead. Please don't call again as I won't be able to pick up. Thanks for understanding!`,

                `Hi! I noticed you tried to call me. I'm not available to take calls at the moment, but feel free to send me a message instead. Please don't call again as I'm usually busy. Thanks!`,

                `Hello! Thanks for trying to reach me. I don't take calls on this number, but I'm very responsive to messages. Could you text me instead? Please avoid calling again. Thanks!`,

                `Hey! Sorry I missed your call. I'm actually not able to take calls on this number, but I'm always checking messages. Would you mind texting me instead? Please don't call again. Thanks!`,

                `Hi there! I saw your call but I can't answer calls on this number. If you need to reach me, please send a message and I'll get back to you quickly. Please don't call again. Thanks!`
            ];

            const warningMessage = warningMessages[Math.floor(Math.random() * warningMessages.length)];

            // Add a small delay before responding (like a human would take time to type)
            await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));

            // Show typing indicator
            await client.sendPresenceUpdate('composing', caller);
            await new Promise(resolve => setTimeout(resolve, 4000 + Math.random() * 3000));

            // Send the message
            await client.sendMessage(caller, {
                text: warningMessage
            });

            // Update the call count
            await callsTable.set(caller, 1);
            console.log(`✅ Warning sent to ${caller} and call count updated`);
        } else {
            // Second or subsequent call - block the user
            console.log(`🚫 Blocking ${caller} after multiple calls`);

            // Get random human-like blocking message
            const blockingMessages = [
                `I asked you not to call this number again. I only communicate through messages. Since you've continued calling, I'll have to block this number. Sorry it had to come to this.`,

                `I mentioned before that I don't take calls on this number. Since you've called again, I'll need to block your number now. If you need to reach me, please use a different number and text only.`,

                `I previously requested that you don't call this number. Since you've called again, I'll have to block you now. I'm sorry, but I specifically asked for no calls.`,

                `I specifically asked you not to call again, but you did. I'll have to block your number now. If there's an emergency, please contact me through someone else via text.`,

                `I don't appreciate you calling again after I asked you not to. I'll have to block this number now. Please respect people's communication preferences in the future.`
            ];

            const blockingMessage = blockingMessages[Math.floor(Math.random() * blockingMessages.length)];

            // Add a small delay before responding (like a human would take time to notice and respond)
            await new Promise(resolve => setTimeout(resolve, 4000 + Math.random() * 3000));

            // Show typing indicator (appear annoyed by typing for a while)
            await client.sendPresenceUpdate('composing', caller);
            await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 3000));

            // Pause typing briefly (like thinking about what to say)
            await client.sendPresenceUpdate('paused', caller);
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

            // Resume typing
            await client.sendPresenceUpdate('composing', caller);
            await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));

            // Send a message before blocking
            await client.sendMessage(caller, {
                text: blockingMessage
            });

            // Block the user
            await client.updateBlockStatus(caller, "block");
            console.log(`✅ User ${caller} has been blocked`);

            // Reset the call count (in case they get unblocked later)
            await callsTable.set(caller, 0);
        }
    } catch (error) {
        console.error('🚨 Error in CallHandler:', error);
    }
};

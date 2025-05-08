const { generateWelcomeMessage } = require('./welcomeMessage');

const handleInitialMessage = async (client, message) => {
    const isFirstMessage = !client.messagesMap.has(message.from);

    if (isFirstMessage) {
        // Mark that we've sent a message to this user
        client.messagesMap.set(message.from, true);

        // Get the group links from config
        const configTable = client.DB.table('config');
        const whatsappLink = await configTable.get('groupLink') || 'https://chat.whatsapp.com/JTnL7g7DSl5D1yeEnpgj2n';
        const telegramLink = await configTable.get('telegramLink') || 'https://t.me/+XRq52g2G-BxkMWM8';

        // Use a simple template for the welcome message
        const welcomeTemplate = `*‼️You will be disqualified from the Training if you don't complete these 3 steps👇*\n\n*STEP 1️⃣* - Save This Number as *GidiBanks* (Very Important)\n\n*STEP 2️⃣* - Join the training group on WhatsApp : {{whatsappLink}}\n\n*STEP 3️⃣* - Join *Hot digital Skill* community on Telegram (Very Important) : {{telegramLink}}\n\nAfter completing all steps, respond with the word "*DONE*"`;

        // Generate the welcome message with links from the database and slight AI modifications
        const userName = message.pushName || 'there';
        const welcomeMessage = await generateWelcomeMessage(
            userName,
            welcomeTemplate,
            whatsappLink,
            telegramLink
        );

        // Send the welcome message and store the message info for follow-up
        const sentMsg = await client.sendMessage(message.from, { text: welcomeMessage });

        // Create a table for tracking user responses
        const userResponsesTable = client.DB.table('userResponses');

        // Function to send follow-up messages with increasing delays
        const sendFollowUp = async (attempt = 1, maxAttempts = 3) => {
            try {
                // Check if user has already responded with DONE
                const completedSteps = await client.DB.table('config').get(`${message.from}_completed_steps`);
                if (completedSteps) {
                    console.log(`✅ User ${userName} (${message.from}) already completed steps, no follow-up needed`);
                    return;
                }

                // First follow-up messages (more gentle)
                const firstFollowUpMessages = [
                    `Hey ${userName}, have you completed the 3 steps I mentioned? If you have, please reply with the word *DONE* to proceed.`,
                    `${userName}, just checking if you've finished those 3 steps? Remember to reply with *DONE* once you've completed them all.`,
                    `Have you had a chance to complete those steps, ${userName}? Don't forget to reply with *DONE* when you're finished.`,
                    `${userName}, just following up on those 3 steps. Have you completed them? Reply with *DONE* when you're ready to proceed.`,
                    `Quick check-in ${userName} - have you completed the 3 steps? Remember to reply with *DONE* once you've finished.`
                ];

                // Second follow-up messages (more direct)
                const secondFollowUpMessages = [
                    `${userName}, I noticed you haven't confirmed completing the 3 steps yet. Have you had a chance to finish them? Please reply with *DONE* when you're ready.`,
                    `Just checking in again ${userName} - have you completed all 3 steps? It's important to complete them to join the training. Reply *DONE* when finished.`,
                    `${userName}, don't forget to complete the 3 steps and reply with *DONE*. This is required to participate in the training program.`,
                    `Hi again ${userName}! Please make sure to complete all 3 steps and reply with *DONE* to confirm. It's essential for the training.`,
                    `${userName}, just a friendly reminder to complete the 3 steps and reply with *DONE*. You'll need to do this to join the training.`
                ];

                // Final follow-up messages (more urgent)
                const finalFollowUpMessages = [
                    `${userName}, this is your final reminder to complete the 3 steps. Please reply with *DONE* once finished to avoid being disqualified from the training.`,
                    `Final reminder ${userName}: You need to complete all 3 steps and reply with *DONE* to secure your spot in the training program.`,
                    `${userName}, please complete the 3 steps as soon as possible and reply with *DONE*. This is the last reminder before the training begins.`,
                    `Important: ${userName}, you must complete all 3 steps and reply with *DONE* to be included in the training. This is your final reminder.`,
                    `${userName}, don't miss out on the training! Complete the 3 steps now and reply with *DONE* to confirm. This is your last reminder.`
                ];

                // Select the appropriate message set based on attempt number
                let messageSet;
                if (attempt === 1) {
                    messageSet = firstFollowUpMessages;
                } else if (attempt === 2) {
                    messageSet = secondFollowUpMessages;
                } else {
                    messageSet = finalFollowUpMessages;
                }

                // Select a random message from the appropriate set
                const followUpMsg = messageSet[Math.floor(Math.random() * messageSet.length)];

                // Send the follow-up as a reply to the original welcome message
                await client.sendMessage(message.from, {
                    text: followUpMsg,
                    quoted: sentMsg // This makes it a reply to the original message
                });

                console.log(`✅ Sent follow-up message #${attempt} to ${userName} (${message.from})`);

                // Record this follow-up attempt
                await userResponsesTable.set(`${message.from}_followup_${attempt}`, Date.now());

                // Schedule next follow-up if we haven't reached max attempts
                if (attempt < maxAttempts) {
                    // Increasing delays: 2 minutes, 5 minutes, 10 minutes
                    const delays = [120000, 300000, 600000];
                    const randomVariation = Math.floor(Math.random() * 30000); // Random variation up to 30 seconds

                    setTimeout(() => {
                        sendFollowUp(attempt + 1, maxAttempts);
                    }, delays[attempt - 1] + randomVariation);
                }
            } catch (error) {
                console.error(`🚨 Error sending follow-up message #${attempt}:`, error);
            }
        };

        // Start the follow-up sequence after initial delay (2-2.5 minutes)
        setTimeout(() => {
            sendFollowUp(1, 3); // Start with attempt 1, max 3 attempts
        }, 120000 + Math.floor(Math.random() * 30000)); // Random delay between 2-2.5 minutes
    }
};

module.exports = handleInitialMessage;
const { serialize } = require('../Helper/WAclient');
const chalk = require('chalk');
const emojiStrip = require('emoji-strip');
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

/**
 * Calls the Gemini AI model to determine the intent of a natural language message.
 *
 * @param {string} query - The user's natural language message.
 * @returns {Promise<object>} - Parsed response as { action: "command" } or { action: "reply" }.
 */
async function getGeminiIntent(query) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("⚠️ Gemini API key is missing.");
            return { action: "reply", response: "🟥 AI services are unavailable." };
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model:  "gemini-1.5-flash" });

        const prompt = `You are an advanced cybersecurity AI assistant built by NkayData.
You help monitor websites, prevent hacks, and assist with cybersecurity tasks.
You use emojis when appropriate but must always follow instructions.

🚨 **IMPORTANT:**
1️⃣ When the user asks for emails, **DO NOT EXPLAIN, DO NOT RETURN JSON**. Just say: "🔄 Fetching emails...".
2️⃣ When the user asks for their datastation balance, **DO NOT EXPLAIN, DO NOT RETURN JSON**. Just say: "🔄 Fetching datastation balance...".
3️⃣ When the user asks you to check for someone email in the database, **DO NOT EXPLAIN, DO NOT RETURN JSON**. Just say: "🔄 Fetching user data...".
4️⃣ When the user asks for a group link or to join a group, or says they haven't joined the group yet, or responds with "no" when asked about joining the group, **DO NOT EXPLAIN, DO NOT RETURN JSON**. Just say: "🔄 Fetching group link...".
5️⃣ If the user asks for a command, return JSON like this:
   {"action": "command", "command": "<commandName>", "args": "<arguments>"}
6️⃣ For casual conversations, reply in plain text with fun, friendly responses using emojis.

Now, process the following input and act accordingly:
"${query}"`;

        const result = await model.generateContent(prompt);
        const text = await result.response.text();

        console.log("🔵 AI Raw Response:", text);

        try {
            return JSON.parse(text);
        } catch (err) {
            console.warn("⚠️ AI response was not valid JSON, treating as plain text.");
            return { action: "reply", response: text };
        }
    } catch (error) {
        console.error("🚨 Gemini API error:", error);
        return { action: "reply", response: "🟥 AI service is currently unavailable." };
    }
}

/**
 * Generates a personalized caption for the group link using Gemini AI.
 *
 * @param {string} userName - The name of the user requesting the group link.
 * @returns {Promise<string>} - A personalized caption for the group link.
 */
async function generateGroupLinkCaption(userName) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("⚠️ Gemini API key is missing.");
            return "🌟 Here's your group link! Click to join our community.";
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Generate a short, friendly, and engaging caption for a WhatsApp group invite link.
The caption should be personalized for a user named "${userName}".
The caption should:
- Be 1-3 sentences maximum
- Include emojis
- Be enthusiastic and welcoming
- Encourage the user to join the group
- Not include the actual link (it will be added separately)
- Be direct and concise

Example format: "🌟 Hey [name]! Welcome to our exclusive community. Click the link to join us!"`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        return text || "🌟 Here's your group link! Click to join our community.";
    } catch (error) {
        console.error("🚨 Gemini API error generating caption:", error);
        return "🌟 Here's your group link! Click to join our community.";
    }
}

/**
 * Generates a personalized welcome message for new users.
 *
 * @param {string} userName - The name of the user to personalize the message for.
 * @param {string} template - The template message with placeholders.
 * @param {string} whatsappLink - The WhatsApp group link to include.
 * @param {string} telegramLink - The Telegram community link to include.
 * @returns {Promise<string>} - The personalized welcome message.
 */
async function generateWelcomeMessage(userName, template, whatsappLink, telegramLink) {
    try {
        // Replace placeholders in the template
        let message = template
            .replace('{{whatsappLink}}', whatsappLink)
            .replace('{{telegramLink}}', telegramLink);

        // If we have Gemini API, try to personalize the message
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `You are tasked with personalizing a welcome message for a new WhatsApp bot user named "${userName}".

The original message is:
"""
${message}
"""

Please rewrite this message to make it more personalized and engaging while maintaining these requirements:
1. Keep the exact same WhatsApp link (${whatsappLink}) and Telegram link (${telegramLink})
2. Keep the same 3-step structure and numbering
3. Maintain the same core instructions (saving the number, joining groups, responding with "DONE")
4. Use emojis appropriately
5. Make it sound friendly and welcoming
6. Keep the message concise and clear

DO NOT change the links or the core instructions. Just make the language more engaging and personalized.`;

            try {
                const result = await model.generateContent(prompt);
                const personalizedText = result.response.text();

                // Only use the AI response if it contains both links (to ensure they weren't removed)
                if (personalizedText &&
                    personalizedText.includes(whatsappLink) &&
                    personalizedText.includes(telegramLink)) {
                    return personalizedText;
                }
            } catch (aiError) {
                console.error("⚠️ Gemini API error personalizing welcome message:", aiError);
                // Fall back to the template message
            }
        }

        // Return the template message if AI personalization failed or is unavailable
        return message;
    } catch (error) {
        console.error("🚨 Error generating welcome message:", error);
        return template
            .replace('{{whatsappLink}}', whatsappLink)
            .replace('{{telegramLink}}', telegramLink);
    }
}

/**
 * Generates a human-like, conversational response when a user replies with "DONE".
 * The response congratulates them and builds anticipation for upcoming financial training.
 *
 * @param {string} userName - The name of the user to personalize the response for.
 * @returns {Promise<string>} - A natural-sounding, conversational response focused on financial training.
 */
async function generateCompletionResponse(userName) {
    try {
        // Create a more human-like, conversational response that doesn't sound like AI
        // No mention of "what can I do for you" or revealing it's a bot
        // Focus on congratulating them and building anticipation for the financial training

        // Choose randomly from several natural-sounding responses to seem more human
        const responses = [
            `Perfect! You're all set ${userName} 🔥 The financial freedom training with Gidi Banks is starting super soon! Get ready to learn his proven system for generating serious income online. His students are already making 6-7 figures using these strategies. Make sure you're active in the WhatsApp group - that's where all the action happens! 💰`,

            `That's great ${userName}! You're good to go now. Gidi Banks has prepared an incredible wealth-building training that's helped thousands of people create financial freedom. Are you ready to transform your finances? The WhatsApp group is where we'll share all the important updates about when we start. This could be your turning point! 🚀`,

            `Awesome ${userName}! You're officially in 🙌 Gidi Banks is about to reveal his complete blueprint for making money online - the same one that's helped ordinary people quit their 9-5 jobs. Make sure you're checking the WhatsApp group regularly because that's where everything happens. Get ready for some serious value coming your way!`,

            `You're all set ${userName}! The financial training is going to be massive - Gidi Banks will be sharing his exact strategies for creating multiple income streams that work for you 24/7. These methods have already helped so many people achieve financial freedom. Stay active in the WhatsApp group for all updates. Your journey to wealth creation starts now! ✨`,

            `Fantastic! You've completed all the steps ${userName} 👏 Gidi Banks' money-making training will be starting soon, and trust me, you don't want to miss any of it. His students are seeing incredible results using these strategies. Make sure you're active in the WhatsApp group - that's where I'll be dropping all the important updates. Looking forward to seeing your financial transformation!`,

            `Great job ${userName}! Everything's set up now. I'm honestly so excited for you to experience Gidi Banks' financial freedom training - it's packed with practical, actionable strategies that can help you start generating serious income online. The WhatsApp group is your main hub for all announcements. Get ready for some serious wealth-building knowledge! 💎`,

            `You're good to go ${userName}! The wealth creation training Gidi Banks has prepared is going to blow your mind. His students are making life-changing income using these exact methods. Make sure you're in the WhatsApp group since that's where all the magic happens. The training starts soon, so get ready to transform your financial future in a big way!`,

            `All done! You're now officially part of the program ${userName} 🎉 Gidi Banks' financial training is going to be a game-changer for real. You'll learn step-by-step how to create multiple income streams, even if you're starting from zero. Stay active in the WhatsApp group for all updates. Can't wait to see your success story!`,

            `Yesss! You're all set now ${userName}! 🙌 I'm so excited for you to join Gidi Banks' money-making training - it's going to be incredible! His strategies have helped people just like you achieve financial freedom. The WhatsApp group is where I'll be posting all the updates about when we start. This is going to change everything for you!`,

            `Perfect ${userName}! You've completed everything 👍 Now just make sure you're in the WhatsApp group because that's where Gidi Banks will be sharing his proven system for generating serious income online. These are strategies that work even in today's economy. The training is starting soon and it's going to be life-changing!`,

            `Awesome! You're all ready to go ${userName} 😄 Gidi Banks' financial freedom training is starting soon and between you and me, the content is insanely valuable! You'll learn exactly how to start making money online using methods that have already helped thousands of people. Make sure you're checking the WhatsApp group regularly for all updates!`,

            `You're all set ${userName}! Can't wait for you to experience Gidi Banks' wealth-building training - it's going to be a game-changer for your finances! His students are making 6-7 figures using these exact strategies. Just make sure you're active in the WhatsApp group so you don't miss any announcements. Your journey to financial freedom starts now! 💵`
        ];

        // Select a random response to seem more human-like
        const randomIndex = Math.floor(Math.random() * responses.length);
        return responses[randomIndex];

    } catch (error) {
        console.error("🚨 Error generating completion response:", error);
        // Even the fallback should feel human and conversational and focus on financial training
        return `Perfect ${userName}! You're all set for Gidi Banks' financial freedom training. You'll learn his proven system for generating serious income online - the same one that's helped ordinary people create extraordinary wealth. Make sure you're active in the WhatsApp group for all important announcements. This training could change your financial future forever! 💰`;
    }
}

/**
 * Sends a voice note to the user.
 *
 * @param {object} client - The WhatsApp client instance.
 * @param {object} M - The message object.
 * @param {string} text - The text to convert to speech.
 * @returns {Promise<boolean>} - Whether the voice note was sent successfully.
 */
async function sendVoiceNote(client, M, text) {
    try {
        // Create a unique filename for this voice note
        const voiceNotesDir = path.join(__dirname, '../../temp/voice-notes');

        // Create directory if it doesn't exist
        if (!fs.existsSync(voiceNotesDir)) {
            fs.mkdirSync(voiceNotesDir, { recursive: true });
        }

        const fileName = `voice_${Date.now()}.mp3`;
        const filePath = path.join(voiceNotesDir, fileName);

        // Use text-to-speech to generate the voice note
        // This example uses the Windows built-in PowerShell command for TTS
        // You can replace this with other TTS solutions based on your platform
        return new Promise((resolve, reject) => {
            // Clean the text for command line usage
            const cleanText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');

            // PowerShell command to generate speech
            const command = `powershell -Command "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 0; $speak.Volume = 100; $speak.SelectVoiceByHints('Female'); $speak.SetOutputToWaveFile('${filePath}'); $speak.Speak('${cleanText}'); $speak.Dispose()"`;

            exec(command, async (error) => {
                if (error) {
                    console.error("🚨 Error generating voice note:", error);
                    resolve(false);
                    return;
                }

                try {
                    // Check if file exists and has content
                    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
                        console.error("🚨 Voice note file is empty or doesn't exist");
                        resolve(false);
                        return;
                    }

                    // Send the voice note
                    await client.sendMessage(M.from, {
                        audio: fs.readFileSync(filePath),
                        mimetype: 'audio/mp3',
                        ptt: true // This makes it play as a voice note
                    });

                    console.log("🎤 Voice note sent successfully");

                    // Clean up the file
                    fs.unlinkSync(filePath);

                    resolve(true);
                } catch (sendError) {
                    console.error("🚨 Error sending voice note:", sendError);
                    // Try to clean up the file even if sending failed
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                    resolve(false);
                }
            });
        });
    } catch (error) {
        console.error("🚨 Error in sendVoiceNote:", error);
        return false;
    }
}

/**
 * Generates focused, human-like responses for general messages that keep the conversation
 * centered around the training, classes, and WhatsApp group.
 *
 * @param {string} message - The user's message.
 * @param {string} userName - The name of the user to personalize the response for.
 * @param {object} client - The WhatsApp client instance.
 * @param {object} M - The message object.
 * @returns {Promise<string>} - A focused, natural-sounding response.
 */
async function generateFocusedResponse(message, userName, client, M) {
    try {
        // Convert message to lowercase for easier matching
        const lowerMsg = message.toLowerCase().trim();

        // Check if user has already joined the group
        const groupJoinedTable = client.DB.table('groupJoined');
        const hasJoined = await groupJoinedTable.get(M.sender);

        // Check if user is saying they've joined the group
        if (!hasJoined &&
            (lowerMsg.includes('joined') || lowerMsg.includes('i have joined') || lowerMsg.includes('i joined') ||
             lowerMsg.includes('i am in') || lowerMsg.includes("i'm in") || lowerMsg.includes('i am now in'))) {

            console.log(`🎉 User ${M.pushName} (${M.sender}) says they've joined the group in focused response`);

            // Mark user as having joined the group
            await groupJoinedTable.set(M.sender, true);

            // Generate a personalized response
            const joinedResponses = [
                `That's awesome ${userName}! 🎉 You're all set for the training now. I'll be sharing some amazing content there soon!`,
                `Perfect ${userName}! 👍 You're now officially part of the training. Get ready for some incredible classes!`,
                `Great job ${userName}! 🙌 You're now all set for the training. Can't wait for you to see what we've prepared!`,
                `Excellent ${userName}! 🔥 You're now fully registered for the training. It's going to be amazing!`,
                `Fantastic ${userName}! ✨ You're all set for the training now. Looking forward to seeing you participate!`
            ];

            return joinedResponses[Math.floor(Math.random() * joinedResponses.length)];
        }

        // Check for explicit group link requests or negative responses about joining the group
        if ((lowerMsg.includes('link') && (lowerMsg.includes('send') || lowerMsg.includes('give') || lowerMsg.includes('share') || lowerMsg.includes('need'))) ||
            (lowerMsg.match(/^no\b/) && lowerMsg.length < 10) || // Simple "no" response
            (lowerMsg.includes('no') && (lowerMsg.includes('join') || lowerMsg.includes('haven') || lowerMsg.includes('not yet') || lowerMsg.includes('didn\'t'))) ||
            (lowerMsg.includes('not') && (lowerMsg.includes('join') || lowerMsg.includes('in the group') || lowerMsg.includes('in group'))) ||
            (lowerMsg === "no")) {
            console.log("🔗 Direct group link request or negative response about group membership detected");

            // If user has already joined but is asking for the link again
            if (hasJoined && !lowerMsg.includes('link') && !lowerMsg.includes('send') && !lowerMsg.includes('give')) {
                console.log(`⚠️ User ${M.pushName} (${M.sender}) already marked as joined but requesting link again in focused response`);

                // Generate a personalized response
                const alreadyJoinedResponses = [
                    `Hey ${userName}, I thought you already joined the group! Do you need the link again?`,
                    `${userName}, didn't you already join the group? Let me know if you need the link again.`,
                    `I remember you saying you joined the group ${userName}. Did you leave or need the link again?`,
                    `${userName}, I have you marked as already in the group. Do you need the link again?`
                ];

                return alreadyJoinedResponses[Math.floor(Math.random() * alreadyJoinedResponses.length)];
            }

            // This is a direct request for the group link - send it immediately
            try {
                // Get the group link directly from QuickDB
                const configTable = client.DB.table('config');
                const defaultGroupLink = 'https://chat.whatsapp.com/default';
                const groupLink = await configTable.get('groupLink') || defaultGroupLink;
                console.log(`📋 Retrieved group link: ${groupLink}`);

                if (!groupLink || groupLink === defaultGroupLink) {
                    console.warn("⚠️ No custom group link set in admin panel");
                    return "🟨 Sorry, the group link hasn't been set up yet. Please try again later.";
                }

                // Generate and send the caption with the link
                const caption = await generateGroupLinkCaption(userName);

                // Occasionally send the link as a voice note first (higher chance here since it's a direct request)
                const shouldSendVoiceNote = Math.random() < 0.3; // 30% chance

                if (shouldSendVoiceNote) {
                    console.log("🎤 Attempting to send group link as voice note from focused response...");
                    const voiceText = `${caption}. Here's the group link you asked for. Make sure to join right away!`;

                    // Send the voice note
                    const voiceNoteSent = await sendVoiceNote(client, M, voiceText);

                    // Add a small delay before sending the text with the actual link
                    if (voiceNoteSent) {
                        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
                    }
                }

                // Send the link directly
                await client.sendMessage(M.from, {
                    text: `${caption}\n\n${groupLink}`
                }, { quoted: M });
                console.log("✅ Group link sent directly from focused response");

                // Return a special marker to indicate we've handled this request
                return "GROUP_LINK_SENT";
            } catch (error) {
                console.error("🚨 Error sending group link from focused response:", error);
                return "🟥 Sorry, I couldn't fetch the group link. Please try again later.";
            }
        }

        // Check for greetings - focused on financial training with Gidi Banks
        if (lowerMsg.match(/^(hi|hello|hey|hola|greetings|good morning|good afternoon|good evening|yo|sup|what's up|howdy)/i)) {
            const greetingResponses = [
                `Hey ${userName}! 👋 Are you ready to learn how to create serious wealth online? Gidi Banks is about to reveal his proven system for generating 6-7 figures. Have you joined the WhatsApp group yet? That's where all the action happens!`,

                `Hi there ${userName}! 😊 Excited to have you on board for this life-changing financial training. Gidi Banks has helped thousands of people create financial freedom, and you could be next! Have you checked out the WhatsApp group?`,

                `Hello ${userName}! 🔥 How's it going? Just wanted to make sure you're ready for Gidi Banks' exclusive training on creating multiple income streams. His students are making life-changing money using these strategies!`,

                `Heyyy ${userName}! Great to hear from you! 💰 The financial freedom training with Gidi Banks starts soon. People who've applied his methods are now making consistent income online. Are you ready to transform your finances?`,

                `Hey there ${userName}! 💎 How are you? Just checking if you're all set for the wealth-building training. Gidi Banks will be revealing his exact blueprint for making money online - the same one that's helped people quit their 9-5 jobs!`,

                `Hi ${userName}! 👋 Just wanted to touch base about the upcoming financial training. Gidi Banks is going to share some game-changing strategies that can help you start generating serious income, even as a complete beginner!`,

                `Hey ${userName}! What's up? 🚀 Are you excited to learn Gidi Banks' proven system for creating financial freedom? His students are crushing it right now, even in this economy. This training could be your turning point!`,

                `Good day ${userName}! 💼 Ready to discover how you can start making money online? Gidi Banks has helped ordinary people create extraordinary income, and he's about to share his exact methods with you. It's going to be incredible!`
            ];

            return greetingResponses[Math.floor(Math.random() * greetingResponses.length)];
        }

        // Check for questions about the class/training - focused on financial aspects
        if (lowerMsg.includes('class') || lowerMsg.includes('training') || lowerMsg.includes('course') || lowerMsg.includes('when') || lowerMsg.includes('start') || lowerMsg.includes('money') || lowerMsg.includes('earn') || lowerMsg.includes('income')) {
            const classResponses = [
                `The financial freedom training is starting super soon ${userName}! 🔥 Gidi Banks will be revealing his complete system for generating 6-7 figures online. We'll announce the exact date in the WhatsApp group. People who've used these strategies are already seeing life-changing results!`,

                `We're just putting the final touches on the wealth-building training ${userName}. 💰 Gidi Banks wants to make sure everything is perfect before we start. You'll learn exactly how to create multiple income streams that can help you quit your 9-5 job. All the details will be in the WhatsApp group!`,

                `I'm so excited for you to see what Gidi Banks has prepared! 🙌 This training will show you step-by-step how to start making serious money online, even if you're a complete beginner. The schedule will be posted in the group soon. It's going to be a game-changer for your finances!`,

                `Keep checking the WhatsApp group ${userName} - that's where we'll announce when the financial training kicks off. 💎 Gidi Banks will be sharing the exact strategies his most successful students are using to generate consistent income online. This is knowledge that can literally change your life!`,

                `The money-making training is starting really soon! 💼 Gidi Banks is finalizing his blueprint for financial freedom that he'll be sharing with you. These are practical, actionable strategies that work even in today's economy. I'll make sure everyone gets notified in the WhatsApp group when we're ready to launch!`,

                `I was just reviewing some of the financial strategies Gidi Banks will be teaching, and they're incredible! 🚀 You'll learn exactly how to start generating income online using proven methods that have already helped thousands of people. We'll be announcing the start date in the group any day now!`,

                `The wealth-building training with Gidi Banks is about to start! 💵 You'll discover how to create multiple income streams that work for you 24/7. These are the same strategies that have helped ordinary people achieve extraordinary financial results. Keep an eye on the WhatsApp group for the exact start date!`,

                `Gidi Banks is putting the finishing touches on the financial freedom training! 🔑 You'll learn his step-by-step system for making money online - the same one that's helped his students generate 6-7 figures. We'll announce everything in the WhatsApp group very soon. This training will be worth every second of your time!`
            ];

            return classResponses[Math.floor(Math.random() * classResponses.length)];
        }

        // Check for affirmative responses about wanting the group link
        if ((lowerMsg.match(/^yes\b/) && lowerMsg.length < 10) || // Simple "yes" response
            (lowerMsg.includes('yes') && (lowerMsg.includes('link') || lowerMsg.includes('send') || lowerMsg.includes('want'))) ||
            (lowerMsg.includes('yeah') && lowerMsg.length < 15) ||
            (lowerMsg.includes('please') && lowerMsg.length < 20) ||
            (lowerMsg === "yes") || (lowerMsg === "yeah") || (lowerMsg === "yep") || (lowerMsg === "sure") || (lowerMsg === "ok")) {

            console.log("🔗 Affirmative response to group link question detected");

            // If this is a response to "have you joined the group?" and they say yes, mark them as joined
            if (hasJoined === undefined && !lowerMsg.includes('link') && !lowerMsg.includes('send')) {
                console.log(`🎉 User ${M.pushName} (${M.sender}) affirmed they've joined the group`);

                // Mark user as having joined the group
                await groupJoinedTable.set(M.sender, true);

                // Generate a personalized response
                const joinedResponses = [
                    `That's awesome ${userName}! 🎉 You're all set for the training now. I'll be sharing some amazing content there soon!`,
                    `Perfect ${userName}! 👍 You're now officially part of the training. Get ready for some incredible classes!`,
                    `Great job ${userName}! 🙌 You're now all set for the training. Can't wait for you to see what we've prepared!`,
                    `Excellent ${userName}! 🔥 You're now fully registered for the training. It's going to be amazing!`,
                    `Fantastic ${userName}! ✨ You're all set for the training now. Looking forward to seeing you participate!`
                ];

                return joinedResponses[Math.floor(Math.random() * joinedResponses.length)];
            }

            // This is an affirmative response to a question about the group link - send it immediately
            try {
                // Get the group link directly from QuickDB
                const configTable = client.DB.table('config');
                const defaultGroupLink = 'https://chat.whatsapp.com/default';
                const groupLink = await configTable.get('groupLink') || defaultGroupLink;
                console.log(`📋 Retrieved group link: ${groupLink}`);

                if (!groupLink || groupLink === defaultGroupLink) {
                    console.warn("⚠️ No custom group link set in admin panel");
                    return "🟨 Sorry, the group link hasn't been set up yet. Please try again later.";
                }

                // Generate and send the caption with the link
                const caption = await generateGroupLinkCaption(userName);

                // Occasionally send the link as a voice note first
                const shouldSendVoiceNote = Math.random() < 0.3; // 30% chance

                if (shouldSendVoiceNote) {
                    console.log("🎤 Attempting to send group link as voice note from affirmative response...");
                    const voiceText = `${caption}. Here's the group link. Looking forward to seeing you there!`;

                    // Send the voice note
                    const voiceNoteSent = await sendVoiceNote(client, M, voiceText);

                    // Add a small delay before sending the text with the actual link
                    if (voiceNoteSent) {
                        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
                    }
                }

                // Send the link directly
                await client.sendMessage(M.from, {
                    text: `${caption}\n\n${groupLink}`
                }, { quoted: M });
                console.log("✅ Group link sent after affirmative response");

                // Return a special marker to indicate we've handled this request
                return "GROUP_LINK_SENT";
            } catch (error) {
                console.error("🚨 Error sending group link after affirmative response:", error);
                return "🟥 Sorry, I couldn't fetch the group link. Please try again later.";
            }
        }

        // Check for questions about the group
        if (lowerMsg.includes('group') || lowerMsg.includes('whatsapp') || lowerMsg.includes('join') || lowerMsg.includes('link')) {
            // Different responses based on whether the user has already joined
            if (hasJoined) {
                // User has already joined the group
                const joinedGroupResponses = [
                    `The WhatsApp group is where all the action happens ${userName}! I'm glad you're already in there. Keep an eye on it for important announcements about the training! 📱`,

                    `Since you're already in the WhatsApp group ${userName}, make sure you check it regularly. That's where we'll be posting all the updates about the training! 🔔`,

                    `The WhatsApp group is super important ${userName}! I'm glad you've already joined. We'll be sharing some exclusive content there soon that you definitely don't want to miss! 💬`,

                    `I'm in the WhatsApp group every day sharing updates and answering questions ${userName}. Glad you're already part of it! 🙌`,

                    `The WhatsApp group is where everything happens ${userName}! Since you're already in, you're all set for the training. Just make sure to check it regularly! ✅`,

                    `I was just in the WhatsApp group earlier today actually! It's getting pretty active. Glad you're already part of it ${userName}! 🚀`,

                    `The WhatsApp group is essential for the training ${userName}. That's where I'll be posting all the updates about when classes start. Thanks for already being part of it! 👍`
                ];

                return joinedGroupResponses[Math.floor(Math.random() * joinedGroupResponses.length)];
            } else {
                // User hasn't joined the group yet
                const notJoinedGroupResponses = [
                    `Have you joined the WhatsApp group yet ${userName}? That's literally where everything happens! Need the link? Just say the word and I'll send it over. The group's already pretty active btw! 📱`,

                    `Omg the WhatsApp group is super important for the training ${userName}! We share all the good stuff there - announcements, materials, everything. Let me know if you need help joining! 🔗`,

                    `Make sure you join the WhatsApp group ${userName}! That's where all the magic happens haha. We'll be dropping some exclusive content there soon that you def don't wanna miss! 💬`,

                    `So the WhatsApp group is basically command central for everything ${userName} 😄 All updates go there first. Not in yet? Just let me know and I'll hook you up with the link! 📲`,

                    `The group is where it's at ${userName}! I'm in there everyday sharing updates and answering questions. Need the link? Just ask! 🔗`,

                    `Yesss the WhatsApp group! It's already pretty active ${userName}. Some people are already connecting and chatting about the training. Need me to send you the link?`,

                    `I was just in the WhatsApp group earlier today actually! It's where we'll be posting all the important stuff. You should definitely join if you haven't already ${userName}!`,

                    `The WhatsApp group is essential tbh. That's where I'll be posting all the updates about when classes start and sharing materials. Let me know if you need help joining ${userName}!`
                ];

                return notJoinedGroupResponses[Math.floor(Math.random() * notJoinedGroupResponses.length)];
            }
        }

        // Check for thank you messages
        if (lowerMsg.includes('thank') || lowerMsg.includes('thanks') || lowerMsg.includes('thx') || lowerMsg.includes('appreciate')) {
            const thankResponses = [
                `No worries at all ${userName}! 😊 I'm just super excited for you to see what we've put together for the training. It's gonna be a game-changer for real!`,

                `Anytime ${userName}! Just make sure you're checking the WhatsApp group regularly so you don't miss anything important. Can't wait to see how you do in the training! ✨`,

                `Of course! Happy to help ${userName}. The classes are gonna be amazing - I've seen the content and it's honestly incredible. Stay tuned to the group for updates! 💯`,

                `No problem! That's what I'm here for ${userName}. Just want to make sure everyone's ready for the training. It's gonna be such an amazing experience! 🙌`,

                `You got it ${userName}! Just doing my job haha. But seriously, I'm really excited for these classes to start. Make sure you're in the group!`,

                `All good ${userName}! Just want to make sure you're all set for when we kick things off. The training is gonna be fire 🔥 trust me on that!`,

                `No thanks needed! Just make sure you're ready for the classes ${userName} - they're gonna be packed with value. Can't wait!`,

                `You're welcome! Tbh I'm just excited to have you in the training ${userName}. It's gonna be an awesome experience!`
            ];

            return thankResponses[Math.floor(Math.random() * thankResponses.length)];
        }

        // Default responses for other messages - focused on making money with Gidi Banks
        const defaultResponses = [
            `${userName}, are you ready to learn how to generate serious income online? 💰 Gidi Banks has helped thousands of people just like you create financial freedom. In this training, you'll learn exactly how to start making money even if you're a complete beginner. The WhatsApp group is where we'll share all the strategies!`,

            `I'm excited for you to join this training ${userName}! Gidi Banks is going to reveal his proven system for making 6-7 figures online. People who've followed his methods have been able to quit their jobs and build real wealth. Are you ready to transform your finances? 🚀`,

            `${userName}, imagine waking up to payment notifications on your phone every single day. That's what Gidi Banks' students experience after implementing his strategies. This training will show you step-by-step how to create multiple income streams that work for you 24/7. It's life-changing!`,

            `The financial strategies Gidi Banks will be teaching in this class have helped people go from struggling to making consistent income online ${userName}. We're talking about practical, actionable methods that work even in today's economy. Are you serious about changing your financial situation? 💼`,

            `${userName}, what would your life look like if money was no longer a problem? That's what this training is designed to help you achieve. Gidi Banks will be sharing the exact blueprint he's used to help ordinary people create extraordinary income. The opportunity is right in front of you!`,

            `I've seen people completely transform their lives after learning Gidi Banks' money-making strategies ${userName}. We're talking about regular people now making 6-7 figures from their phone or laptop. If you're serious about financial freedom, this training is your golden ticket. Are you ready to take action? 💯`,

            `${userName}, Gidi Banks is known for teaching practical, no-nonsense methods to make serious money online. His students are crushing it right now, even in this economy. This isn't about get-rich-quick schemes - it's about building real, sustainable income streams that can change your life forever.`,

            `The difference between people who struggle financially and those who thrive is knowledge and implementation ${userName}. In this training, Gidi Banks will give you both the knowledge AND the step-by-step implementation plan to start generating income quickly. Are you ready to be one of our success stories? 🔥`
        ];

        return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];

    } catch (error) {
        console.error("🚨 Error generating focused response:", error);
        // Even the fallback should be focused on financial training
        return `Hey ${userName}, are you ready to learn Gidi Banks' proven system for generating serious income online? His students are making 6-7 figures using these exact strategies. Make sure you're active in the WhatsApp group - that's where all the wealth-building action happens! This training could be the financial breakthrough you've been looking for. 💰`;
    }
}

module.exports = MessageHandler = async (messages, client) => {
    try {
        if (messages.type !== 'notify') return;
        let M = serialize(JSON.parse(JSON.stringify(messages.messages[0])), client);
        if (!M.message) return;
        if (M.key && M.key.remoteJid === 'status@broadcast') return;
        if (M.type === 'protocolMessage' || M.type === 'senderKeyDistributionMessage' || !M.type || M.type === '') return;

        // Check if this bot instance is active
        // Only process messages for the active bot instance
        if (client.instanceId) {
            try {
                const configTable = client.DB.table('config');
                const instances = await configTable.get('botInstances') || [];
                const currentInstance = instances.find(instance => instance.id === client.instanceId);

                // If this bot is not the active instance, ignore the message
                if (currentInstance && !currentInstance.isActive) {
                    console.log(`🛌 Bot instance ${client.instanceId} is in sleep mode, ignoring message`);
                    return;
                }
            } catch (error) {
                console.error('Error checking bot active status:', error);
                // Continue processing in case of error to avoid breaking functionality
            }
        }

        // Skip processing the bot's own messages to prevent self-replies
        // This allows admins to chat through the bot without the bot responding to itself
        if (M.isSelf) {
            console.log('🤖 Skipping bot\'s own message');
            return;
        }

        const { isGroup, from, body } = M;
        const gcMeta = isGroup ? await client.groupMetadata(from) : '';
        const gcName = isGroup ? gcMeta.subject : '';
        const isCmd = body.startsWith(client.config.prefix);

        // Create a table for tracking welcome messages if it doesn't exist
        const welcomeMessageTable = client.DB.table('welcomeMessages');

        // Create a table for tracking users who have joined the group
        const groupJoinedTable = client.DB.table('groupJoined');

        // Create a table for welcome message settings if it doesn't exist
        const configTable = client.DB.table('config');

        // Check if this is a private chat (not a group)
        if (!isGroup) {
            // Check if user has received welcome message before
            const hasReceivedWelcome = await welcomeMessageTable.get(M.sender);

            // Check if the user is responding with "DONE" after receiving the welcome message
            if (hasReceivedWelcome && body.trim().toUpperCase() === "DONE") {
                console.log(`🎉 User ${M.pushName} (${M.sender}) has completed the onboarding steps`);

                try {
                    // Generate a personalized, human-like completion response
                    const userName = M.pushName || 'there';
                    const completionResponse = await generateCompletionResponse(userName);

                    // Add a variable delay to make it seem more human (typing delay)
                    // Sometimes respond quickly, sometimes take longer (like a human would)
                    const isQuickResponse = Math.random() < 0.3; // 30% chance of quick response
                    const isSlowResponse = Math.random() < 0.2;  // 20% chance of slow response
                    const isVerySlowResponse = Math.random() < 0.05; // 5% chance of very slow response

                    let delay = 0;
                    if (isQuickResponse) {
                        // Quick response (like the person was already typing)
                        delay = 800 + Math.random() * 700;
                    } else if (isVerySlowResponse) {
                        // Very slow response (like the person is busy with something else)
                        delay = 5000 + Math.random() * 5000;
                    } else if (isSlowResponse) {
                        // Slow response (like the person got distracted)
                        delay = 3000 + Math.random() * 2000;
                    } else {
                        // Normal response time
                        delay = 1500 + Math.random() * 1500;
                    }

                    // Show typing indicator before responding (more human-like)
                    await client.sendPresenceUpdate('composing', M.from);
                    // Keep typing for a portion of the delay time
                    await new Promise(resolve => setTimeout(resolve, delay * 0.8));
                    await client.sendPresenceUpdate('paused', M.from);
                    // Wait for the rest of the delay
                    await new Promise(resolve => setTimeout(resolve, delay * 0.2));

                    // Mark user as having joined the group
                    await groupJoinedTable.set(M.sender, true);
                    console.log(`✅ User ${M.pushName} (${M.sender}) marked as having joined the group`);

                    // Send the completion response
                    await client.sendMessage(M.from, { text: completionResponse }, { quoted: M });
                    console.log(`✅ Completion response sent to ${M.pushName} (${M.sender})`);

                    // Occasionally send a follow-up message (triple message is rare)
                    const shouldSendFollowUp = Math.random() < 0.35; // 35% chance for double message
                    const shouldSendSecondFollowUp = shouldSendFollowUp && Math.random() < 0.2; // 20% of those get a third message

                    if (shouldSendFollowUp) {
                        // Generate a follow-up message focused on financial training
                        const followUpMessages = [
                            `Oh and ${userName}, don't forget to introduce yourself in the group! Many of Gidi Banks' successful students have formed valuable business connections there.`,
                            `Also ${userName}, we'll be sharing some pre-training financial resources in the group soon. These materials have helped people start making money even before the official training begins!`,
                            `By the way ${userName}, if you have any questions about creating financial freedom, feel free to ask in the group. Many of Gidi Banks' successful students are active there and love to help newcomers!`,
                            `One more thing ${userName} - make sure your notifications are turned on for the group! Gidi Banks sometimes shares time-sensitive money-making opportunities there that you won't want to miss.`,
                            `And ${userName}, you might want to prepare a notebook for this training. Gidi Banks will be sharing specific strategies and formulas for generating income that you'll definitely want to write down.`,
                            `Almost forgot to mention ${userName}, Gidi Banks will be doing some live Q&A sessions where he answers specific questions about building wealth. These are incredibly valuable!`,
                            `Also, if you know anyone else who's serious about creating financial freedom ${userName}, let them know about this training! Gidi Banks' methods work for anyone willing to implement them.`,
                            `I'm really looking forward to seeing your financial transformation after this training ${userName}! So many people have completely changed their lives using Gidi Banks' strategies.`
                        ];

                        const followUpMessage = followUpMessages[Math.floor(Math.random() * followUpMessages.length)];

                        // Add a delay before sending follow-up
                        await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 4000));
                        await client.sendPresenceUpdate('composing', M.from);
                        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

                        await client.sendMessage(M.from, { text: followUpMessage });
                        console.log(`✅ Follow-up message sent to ${M.pushName} (${M.sender})`);

                        // Occasionally send a second follow-up (rare, makes it feel very human)
                        if (shouldSendSecondFollowUp) {
                            const secondFollowUpMessages = [
                                `Oh! And make sure to check the pinned messages in the group too ${userName}. Gidi Banks often pins specific financial strategies and resources there that have helped people start making money quickly!`,
                                `Almost forgot - Gidi Banks will be starting with some beginner-friendly money-making methods, so don't worry if you're completely new to online income ${userName}. Many of his most successful students started from zero!`,
                                `And ${userName}, don't hesitate to ask questions in the group! Many people who are already making 6-7 figures using Gidi Banks' methods are active there and love to help newcomers on their financial journey.`,
                                `Just remembered ${userName} - Gidi Banks will be giving out some special bonuses to the most active participants! These include additional income strategies that aren't shared in the main training.`,
                                `One last thing ${userName} - there will be some implementation tasks during the training, but they're designed to help you start generating real income as quickly as possible!`
                            ];

                            const secondFollowUpMessage = secondFollowUpMessages[Math.floor(Math.random() * secondFollowUpMessages.length)];

                            // Add a longer delay before sending second follow-up
                            await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 5000));
                            await client.sendPresenceUpdate('composing', M.from);
                            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

                            await client.sendMessage(M.from, { text: secondFollowUpMessage });
                            console.log(`✅ Second follow-up message sent to ${M.pushName} (${M.sender})`);
                        }
                    }

                    // Don't process this message further
                    return;
                } catch (error) {
                    console.error("🚨 Error sending completion response:", error);
                    console.error(error.stack);
                    // Continue with normal message processing if completion response fails
                }
            }

            // If user hasn't received welcome message, send it
            if (!hasReceivedWelcome) {
                console.log(`🆕 New user detected: ${M.pushName} (${M.sender})`);

                try {
                    // Get welcome message template and links from QuickDB config
                    const defaultTemplate = "*‼️You will be disqualified from the Training if you don't complete these 3 steps👇*\n\n*STEP 1️⃣* - Save This Number as *GidiBanks* (Very Important)\n\n*STEP 2️⃣* - Join the training group on WhatsApp : {{whatsappLink}}\n\n*STEP 3️⃣* - Join *Hot digital Skill* community on Telegram (Very Important) : {{telegramLink}}\n\nAfter completing all steps, respond with the word \"*DONE*\"";
                    const defaultWhatsappLink = 'https://chat.whatsapp.com/JTnL7g7DSl5D1yeEnpgj2n';
                    const defaultTelegramLink = 'https://t.me/+XRq52g2G-BxkMWM8';

                    // Get settings from QuickDB or use defaults
                    const template = await configTable.get('welcomeMessageTemplate') || defaultTemplate;
                    const whatsappLink = await configTable.get('whatsappTrainingLink') || defaultWhatsappLink;
                    const telegramLink = await configTable.get('telegramCommunityLink') || defaultTelegramLink;

                    // Initialize default settings if they don't exist
                    if (!await configTable.has('welcomeMessageTemplate')) {
                        await configTable.set('welcomeMessageTemplate', defaultTemplate);
                        console.log('✅ Default welcome message template created in QuickDB');
                    }

                    if (!await configTable.has('whatsappTrainingLink')) {
                        await configTable.set('whatsappTrainingLink', defaultWhatsappLink);
                        console.log('✅ Default WhatsApp training link created in QuickDB');
                    }

                    if (!await configTable.has('telegramCommunityLink')) {
                        await configTable.set('telegramCommunityLink', defaultTelegramLink);
                        console.log('✅ Default Telegram community link created in QuickDB');
                    }

                    // Generate personalized welcome message
                    const userName = M.pushName || 'there';
                    const welcomeMessage = await generateWelcomeMessage(userName, template, whatsappLink, telegramLink);

                    // Check if the user's first message is a greeting
                    const isGreeting = body.toLowerCase().match(/^(hi|hello|hey|hola|greetings|good morning|good afternoon|good evening|yo|sup|what's up|howdy)/i);

                    if (isGreeting) {
                        // If it's a greeting, first respond with a greeting, then send the welcome message
                        const greetingResponses = [
                            `Hey ${userName}! 👋 Great to connect with you!`,
                            `Hi there ${userName}! 😊 Thanks for reaching out!`,
                            `Hello ${userName}! 👋 Nice to meet you!`,
                            `Hey ${userName}! 🙌 Glad you messaged!`,
                            `Hi ${userName}! 👋 Welcome!`,
                            `Hey there ${userName}! 😄 Thanks for getting in touch!`
                        ];

                        const greetingResponse = greetingResponses[Math.floor(Math.random() * greetingResponses.length)];

                        // Send greeting first
                        await client.sendMessage(M.from, { text: greetingResponse }, { quoted: M });
                        console.log(`✅ Greeting response sent to ${M.pushName} (${M.sender})`);

                        // Add a delay before sending welcome message
                        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
                        await client.sendPresenceUpdate('composing', M.from);
                        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1500));
                    }

                    // Send welcome message
                    await client.sendMessage(M.from, { text: welcomeMessage }, { quoted: M });
                    console.log(`✅ Welcome message sent to ${M.pushName} (${M.sender})`);

                    // Mark user as having received welcome message
                    await welcomeMessageTable.set(M.sender, true);

                    // Don't process this message further since it's the first interaction
                    return;
                } catch (error) {
                    console.error("🚨 Error sending welcome message:", error);
                    console.error(error.stack);
                    // Continue with normal message processing if welcome message fails
                }
            }
        }

        // Check for hidetag triggers in group messages from the bot owner/mods
        if (isGroup && M.sender && client.config.mods.includes(M.sender.split('@')[0])) {
            try {
                // Check for .Hidetag command (exactly like your example)
                if (body === '.Hidetag') {
                    console.log(`🏷️ .Hidetag command detected from mod/owner in group: ${gcName}`);

                    try {
                        // Create an empty message that mentions everyone
                        await client.sendMessage(
                            from,
                            {
                                text: '',
                                mentions: gcMeta.participants.map(p => p.id)
                            },
                            { quoted: M }
                        );

                        console.log(`✅ Hidetag message sent successfully in group: ${gcName}`);
                        return; // Stop further processing
                    } catch (hidetagError) {
                        console.error(`Error in .Hidetag command: ${hidetagError.message}`);
                        // If it fails, don't stop processing - let the message be sent normally
                    }
                }

                // Check if the message contains any emoji (alternative trigger)
                const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
                const emojis = body.match(emojiRegex);

                if (emojis && emojis.length > 0) {
                    console.log(`🏷️ Emoji detected in message from mod/owner. Attempting hidetag in group: ${gcName}`);

                    try {
                        // First send the message without mentions
                        await client.sendMessage(
                            from,
                            {
                                text: body
                            },
                            { quoted: M }
                        );

                        // Then send an empty message with mentions
                        // This is less likely to cause session errors
                        await client.sendMessage(
                            from,
                            {
                                text: '',
                                mentions: gcMeta.participants.map(p => p.id)
                            }
                        );

                        console.log(`✅ Hidetag message sent successfully in group: ${gcName}`);
                        return; // Stop further processing
                    } catch (emojiHidetagError) {
                        console.error(`Error in emoji-triggered hidetag: ${emojiHidetagError.message}`);
                        // If it fails, don't stop processing - let the message be sent normally
                    }
                }
            } catch (error) {
                console.error('Error in hidetag feature:', error);
                // Continue with normal message processing if hidetag fails
            }
        }

        if (isCmd) {
            const [cmdName, ...args] = body.replace(client.config.prefix, '').split(' ');
            const arg = args.filter((x) => !x.startsWith('--')).join(' ');
            const flag = args.filter((arg) => arg.startsWith('--'));

            const command = client.cmd.get(cmdName) ||
                            client.cmd.find((cmd) => cmd.command.aliases && cmd.command.aliases.includes(cmdName));

            if (!command) return M.reply(`💔 *No such command found!!*`);
            return command.execute(client, flag, arg, M);
        } else {
            // First, check for direct group link requests to handle them immediately
            const lowerBody = body.toLowerCase().trim();

            // Check if user is saying they've joined the group
            if (!isGroup &&
                (lowerBody.includes('joined') || lowerBody.includes('i have joined') || lowerBody.includes('i joined') ||
                 lowerBody.includes('i am in') || lowerBody.includes("i'm in") || lowerBody.includes('i am now in'))) {

                console.log(`🎉 User ${M.pushName} (${M.sender}) says they've joined the group`);

                // Mark user as having joined the group
                await groupJoinedTable.set(M.sender, true);

                // Generate a personalized response
                const userName = M.pushName || 'there';
                const joinedResponses = [
                    `That's awesome ${userName}! 🎉 You're all set for the training now. I'll be sharing some amazing content there soon!`,
                    `Perfect ${userName}! 👍 You're now officially part of the training. Get ready for some incredible classes!`,
                    `Great job ${userName}! 🙌 You're now all set for the training. Can't wait for you to see what we've prepared!`,
                    `Excellent ${userName}! 🔥 You're now fully registered for the training. It's going to be amazing!`,
                    `Fantastic ${userName}! ✨ You're all set for the training now. Looking forward to seeing you participate!`
                ];

                const response = joinedResponses[Math.floor(Math.random() * joinedResponses.length)];

                // Show typing indicator
                await client.sendPresenceUpdate('composing', M.from);
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

                // Send the response
                await client.sendMessage(M.from, { text: response }, { quoted: M });
                console.log(`✅ Joined confirmation response sent to ${M.pushName} (${M.sender})`);

                return; // Exit early as we've handled this request
            }

            // Check for direct group link requests or refusals
            if (!isGroup) {
                // Handle refusals to join the group
                if ((lowerBody.includes("no") && lowerBody.includes("won't join")) ||
                    (lowerBody.includes("not") && lowerBody.includes("joining")) ||
                    (lowerBody.includes("don't want") && lowerBody.includes("join")) ||
                    (lowerBody.includes("not interested"))) {

                    console.log(`⚠️ User ${M.pushName} (${M.sender}) refusing to join the group`);

                    // Generate a persuasive response about why they should join
                    const userName = M.pushName || 'there';
                    const persuasiveResponses = [
                        `${userName}, I completely understand your hesitation. But here's what you'll miss out on: Gidi Banks will be sharing his exact blueprint for making 6-7 figures online in that group. People are already implementing these strategies and seeing real results. This isn't just another course - it's a complete system for financial freedom. Are you sure you want to miss this opportunity? 🤔`,

                        `I respect your decision ${userName}, but let me share something with you. The WhatsApp group is where Gidi Banks will be revealing his most profitable income strategies - the same ones that have helped ordinary people quit their 9-5 jobs. These are practical, step-by-step methods that work even if you're starting from zero. This could be the financial breakthrough you've been looking for. Would you reconsider? 💰`,

                        `That's totally your choice ${userName}, but just so you know - the WhatsApp group is where all the magic happens. Gidi Banks will be sharing exclusive money-making strategies that won't be available anywhere else. His students are making life-changing income using these methods. If you're serious about creating financial freedom, this group is absolutely essential. Think about it? 🚀`,

                        `I understand ${userName}, but here's why you might want to reconsider: The WhatsApp group is where Gidi Banks shares the exact strategies that have helped people go from struggling to making consistent income online. We're talking about real, practical methods to generate serious money. This training has been a turning point for so many people. Don't you want to at least check it out? 💎`,

                        `${userName}, I get that you might be skeptical - there are a lot of fake gurus out there. But Gidi Banks is different. His students are actually making money using his methods. In the WhatsApp group, he'll be sharing his proven system for generating multiple income streams. People are literally changing their financial futures with this information. Are you sure you want to pass on this? 🤷‍♂️`
                    ];

                    const response = persuasiveResponses[Math.floor(Math.random() * persuasiveResponses.length)];

                    // Show typing indicator for longer (this is a longer, more thoughtful message)
                    await client.sendPresenceUpdate('composing', M.from);
                    await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));

                    // Send the persuasive response
                    await client.sendMessage(M.from, { text: response }, { quoted: M });
                    console.log("✅ Persuasive response sent to user refusing to join group");

                    return; // Exit early as we've handled this request
                }

                // Handle direct group link requests
                if (lowerBody.includes('link') ||
                    lowerBody.includes('join') ||
                    (lowerBody.includes('group') && (lowerBody.includes('send') || lowerBody.includes('give') || lowerBody.includes('share'))) ||
                    lowerBody === "no" ||
                    lowerBody.includes("haven't joined") ||
                    lowerBody.includes("have not joined") ||
                    lowerBody.includes("not joined")) {

                    console.log("🔍 Direct group link request detected in main flow");

                    // Check if user has already joined the group
                    const hasJoined = await groupJoinedTable.get(M.sender);

                    if (hasJoined && !lowerBody.includes('link') && !lowerBody.includes('send') && !lowerBody.includes('give')) {
                        console.log(`⚠️ User ${M.pushName} (${M.sender}) already marked as joined but requesting link again`);

                        // Generate a personalized response
                        const userName = M.pushName || 'there';
                        const alreadyJoinedResponses = [
                            `Hey ${userName}, I thought you already joined the group! Do you need the link again?`,
                            `${userName}, didn't you already join the group? Let me know if you need the link again.`,
                            `I remember you saying you joined the group ${userName}. Did you leave or need the link again?`,
                            `${userName}, I have you marked as already in the group. Do you need the link again?`
                        ];

                        const response = alreadyJoinedResponses[Math.floor(Math.random() * alreadyJoinedResponses.length)];

                        // Show typing indicator
                        await client.sendPresenceUpdate('composing', M.from);
                        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

                        // Send the response
                        await client.sendMessage(M.from, { text: response }, { quoted: M });

                        return; // Exit early as we've handled this request
                    }

                    // Get the group link directly from QuickDB
                    try {
                        const configTable = client.DB.table('config');
                        const defaultGroupLink = 'https://chat.whatsapp.com/default';
                        const groupLink = await configTable.get('groupLink') || defaultGroupLink;

                        if (!groupLink || groupLink === defaultGroupLink) {
                            console.warn("⚠️ No custom group link set in admin panel");
                            await M.reply("🟨 Sorry, the group link hasn't been set up yet. Please try again later.");
                            return;
                        }

                        const userName = M.pushName || 'there';
                        const caption = await generateGroupLinkCaption(userName);

                        // Show typing indicator
                        await client.sendPresenceUpdate('composing', M.from);
                        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

                        // Send the link
                        await client.sendMessage(M.from, {
                            text: `${caption}\n\n${groupLink}`
                        }, { quoted: M });
                        console.log("✅ Group link sent from direct detection in main flow");

                        return; // Exit early as we've handled this request
                    } catch (error) {
                        console.error("🚨 Error sending group link from direct detection:", error);
                        // Continue with normal processing if there was an error
                    }
                }
            }

            // Check if this is a greeting or general message
            if (!isGroup && await welcomeMessageTable.get(M.sender)) {
                // This is a private chat with a user who has already received the welcome message
                // Instead of using AI, respond with focused training-related messages

                const userName = M.pushName || 'there';
                const response = await generateFocusedResponse(body, userName, client, M);

                // If the response is our special marker, it means we've already sent the group link
                if (response === "GROUP_LINK_SENT") {
                    return; // Exit early as we've already handled this request
                }

                // Add a variable delay to make it seem more human (typing delay)
                // Sometimes respond quickly, sometimes take longer (like a human would)
                const isQuickResponse = Math.random() < 0.3; // 30% chance of quick response
                const isSlowResponse = Math.random() < 0.2;  // 20% chance of slow response
                const isVerySlowResponse = Math.random() < 0.05; // 5% chance of very slow response (like busy with something else)

                let delay = 0;
                if (isQuickResponse) {
                    // Quick response (like the person was already typing)
                    delay = 500 + Math.random() * 800;
                } else if (isVerySlowResponse) {
                    // Very slow response (like the person is busy with something else)
                    delay = 5000 + Math.random() * 5000;
                } else if (isSlowResponse) {
                    // Slow response (like the person got distracted)
                    delay = 2500 + Math.random() * 2000;
                } else {
                    // Normal response time
                    delay = 1200 + Math.random() * 1300;
                }

                // More frequently add "typing..." indicator before responding (more human-like)
                if (Math.random() < 0.85) { // 85% chance to show typing (increased from 70%)
                    // Show typing for longer to make it more noticeable
                    await client.sendPresenceUpdate('composing', M.from);

                    // Keep typing for a longer portion of the delay time
                    await new Promise(resolve => setTimeout(resolve, delay * 0.9));

                    // Sometimes add a second round of typing for longer messages
                    if (response.length > 80 && Math.random() < 0.4) {
                        await client.sendPresenceUpdate('paused', M.from);
                        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
                        await client.sendPresenceUpdate('composing', M.from);
                        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
                    }

                    await client.sendPresenceUpdate('paused', M.from);
                    // Wait for the rest of the delay
                    await new Promise(resolve => setTimeout(resolve, delay * 0.2));
                } else {
                    // Just wait the full delay without typing indicator
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                console.log(`💬 Sending focused response to ${userName}`);

                // Decide if we should send a voice note (occasionally)
                const shouldSendVoiceNote = Math.random() < 0.15; // 15% chance to send voice note

                if (shouldSendVoiceNote) {
                    console.log("🎤 Attempting to send voice note...");
                    // Choose a shorter version of the response for voice note
                    let voiceText = response;
                    if (response.length > 100) {
                        // For longer responses, create a shorter version for the voice note
                        const sentences = response.match(/[^.!?]+[.!?]+/g) || [response];
                        if (sentences.length > 1) {
                            // Pick 1-2 sentences for the voice note
                            const numSentences = Math.min(sentences.length, Math.random() < 0.7 ? 1 : 2);
                            voiceText = sentences.slice(0, numSentences).join(' ');
                        }
                    }

                    // Send the voice note
                    const voiceNoteSent = await sendVoiceNote(client, M, voiceText);

                    // If voice note failed, just continue with text response
                    if (!voiceNoteSent) {
                        console.log("⚠️ Voice note failed, falling back to text response");
                    } else {
                        // If voice note was sent successfully, we might not need to send the text response
                        if (Math.random() < 0.4) { // 40% chance to skip text response after voice note
                            console.log("✅ Voice note sent, skipping text response");
                            return;
                        }
                        // Otherwise, continue with text response as a follow-up
                    }
                }

                // Decide if we should send multiple messages (more human-like)
                const shouldSendMultipleMessages = Math.random() < 0.45; // 45% chance (increased from 25%)

                if (shouldSendMultipleMessages) {
                    // Split the response or generate a follow-up
                    const shouldSplitResponse = Math.random() < 0.6; // 60% chance to split, 40% chance for follow-up

                    if (shouldSplitResponse && response.length > 60) {
                        // Find a good splitting point (after a sentence)
                        const splitPoints = [...response.matchAll(/[.!?]\s+/g)].map(match => match.index + 1);

                        // Only split if we have valid split points and the message is long enough
                        if (splitPoints.length > 0) {
                            // Choose a split point somewhere in the middle
                            const middleIndex = Math.floor(splitPoints.length / 2);
                            const randomOffset = Math.floor(Math.random() * Math.min(2, splitPoints.length));
                            const splitIndex = splitPoints[Math.max(0, Math.min(middleIndex + randomOffset, splitPoints.length - 1))];

                            // Split the message
                            const firstPart = response.substring(0, splitIndex + 1);
                            const secondPart = response.substring(splitIndex + 1).trim();

                            if (firstPart && secondPart) {
                                // Send first part
                                await M.reply(firstPart);

                                // Add a delay before sending second part
                                await client.sendPresenceUpdate('composing', M.from);
                                await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1500));

                                // Send second part
                                return M.reply(secondPart);
                            }
                        }
                    } else {
                        // Send the main response
                        await M.reply(response);

                        // Generate a follow-up message focused on financial training
                        const followUpMessages = [
                            `Oh and ${userName}, make sure you're checking the WhatsApp group regularly! Gidi Banks often shares quick money-making tips there that you can implement immediately.`,
                            `By the way ${userName}, have you joined the WhatsApp group yet? That's where Gidi Banks will be revealing his complete system for generating 6-7 figures online.`,
                            `Also ${userName}, the financial freedom training is starting really soon! People who've used Gidi Banks' strategies are already seeing life-changing results.`,
                            `Just a reminder ${userName}, all important announcements about the wealth-building training will be in the group. Gidi Banks sometimes shares time-sensitive opportunities there!`,
                            `One more thing ${userName} - Gidi Banks' students are making serious money using his methods. This training could be the financial breakthrough you've been looking for!`,
                            `Almost forgot to mention ${userName}, Gidi Banks will be sharing some exclusive income strategies in the group that won't be available anywhere else!`,
                            `And ${userName}, feel free to ask if you have any questions about creating financial freedom! Gidi Banks has helped thousands of people just like you transform their finances.`,
                            `I'm so excited for you to start this wealth-building journey ${userName}! So many people have completely changed their financial situation after learning Gidi Banks' strategies.`
                        ];

                        const followUpMessage = followUpMessages[Math.floor(Math.random() * followUpMessages.length)];

                        // Add a delay before sending follow-up
                        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
                        await client.sendPresenceUpdate('composing', M.from);
                        await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800));

                        return client.sendMessage(M.from, { text: followUpMessage });
                    }
                }

                // Default: just send the single response
                return M.reply(response);
            }

            // If we get here, use the original AI flow for other cases
            let aiInput = emojiStrip(body);
            const aiResult = await getGeminiIntent(aiInput);

            if (aiResult.action === "command") {
                const cmdName = aiResult.command;
                const argsArray = aiResult.args ? aiResult.args.split(' ') : [];
                const arg = argsArray.filter(x => !x.startsWith('--')).join(' ');
                const flag = argsArray.filter(x => x.startsWith('--'));

                const command = client.cmd.get(cmdName) ||
                                client.cmd.find((cmd) => cmd.command.aliases && cmd.command.aliases.includes(cmdName));

                if (command) {
                    return command.execute(client, flag, arg, M);
                } else {
                    return M.reply("💔 *AI tried to run an unknown command.*");
                }
            } else if (aiResult.action === "reply") {
                let replyMessage = aiResult.response;

                if (replyMessage.toLowerCase().includes("fetching emails")) {
                    console.log("📨 AI Triggered Email Fetch...");
                    replyMessage = await fetchUserEmails();
                } else if (replyMessage.toLowerCase().includes("fetching datastation balance")) {
                    console.log("💰 AI Triggered Balance Fetch...");
                    replyMessage = await fetchWalletBalance();
                } else if (replyMessage.toLowerCase().includes("fetching user data")) {
                    console.log("� AI Triggered User Data Fetch...");
                    replyMessage = await fetchUserInfoByEmail();
                } else if (replyMessage.toLowerCase().includes("fetching group link")) {
                    console.log("🔗 AI Triggered Group Link Fetch...");
                    console.log(`👤 User requesting group link: ${M.pushName} (${M.sender})`);

                    try {
                        // Get the group link directly from QuickDB instead of using deprecated Config
                        const configTable = client.DB.table('config');
                        const defaultGroupLink = 'https://chat.whatsapp.com/default';
                        const groupLink = await configTable.get('groupLink') || defaultGroupLink;
                        console.log(`📋 Retrieved group link: ${groupLink}`);

                        if (!groupLink || groupLink === defaultGroupLink) {
                            console.warn("⚠️ No custom group link set in admin panel");
                            replyMessage = "🟨 Sorry, the group link hasn't been set up yet. Please try again later.";
                            return replyMessage;
                        }

                        const userName = M.pushName || 'there';
                        console.log(`🏷️ Using name for personalization: ${userName}`);

                        // Decide if we should send multiple messages (more human-like)
                        const shouldSendMultipleMessages = Math.random() < 0.4; // 40% chance

                        if (shouldSendMultipleMessages) {
                            // First message - asking if they want the link
                            const preMessages = [
                                `Sure ${userName}, let me get that for you right away!`,
                                `One sec ${userName}, grabbing the link for you...`,
                                `Got it ${userName}! Let me send you that link...`,
                                `No problem ${userName}! Here's the group link coming up...`,
                                `I'll send you the link right now ${userName}!`
                            ];

                            const preMessage = preMessages[Math.floor(Math.random() * preMessages.length)];

                            // Send first message with typing indicator
                            await client.sendPresenceUpdate('composing', M.from);
                            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));
                            await client.sendMessage(M.from, { text: preMessage }, { quoted: M });

                            // Short pause before sending the actual link
                            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
                        }

                        // Generate and send the caption with the link
                        const caption = await generateGroupLinkCaption(userName);
                        console.log("✅ Generated personalized caption successfully");

                        // Occasionally send the link as a voice note first
                        const shouldSendVoiceNote = Math.random() < 0.2; // 20% chance

                        if (shouldSendVoiceNote) {
                            console.log("🎤 Attempting to send group link as voice note...");
                            const voiceText = `${caption}. Here's the group link. Make sure to click it and join right away!`;

                            // Send the voice note
                            const voiceNoteSent = await sendVoiceNote(client, M, voiceText);

                            // Add a small delay before sending the text with the actual link
                            if (voiceNoteSent) {
                                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
                            }
                        }

                        // Always send the text message with the actual link
                        await client.sendMessage(M.from, {
                            text: `${caption}\n\n${groupLink}`
                        }, { quoted: M });
                        console.log("✅ Group link sent successfully");

                        // Occasionally send a follow-up message
                        if (Math.random() < 0.3) { // 30% chance
                            const followUpMessages = [
                                `Make sure you join soon ${userName}! That's where all the important updates will be posted.`,
                                `Let me know once you've joined ${userName}! The training is starting soon.`,
                                `Can't wait to see you in the group ${userName}! It's going to be amazing.`,
                                `Join quickly ${userName}! You don't want to miss any important announcements.`,
                                `The group is already pretty active ${userName}! You'll love it there.`
                            ];

                            const followUpMessage = followUpMessages[Math.floor(Math.random() * followUpMessages.length)];

                            // Add a delay before sending follow-up
                            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
                            await client.sendPresenceUpdate('composing', M.from);
                            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

                            await client.sendMessage(M.from, { text: followUpMessage });
                            console.log("✅ Follow-up message sent successfully");
                        }

                        return null;
                    } catch (error) {
                        console.error("🚨 Error sending group link:", error);
                        console.error(error.stack);
                        replyMessage = "🟥 Sorry, I couldn't fetch the group link. Please try again later.";
                    }
                }

                if (typeof replyMessage !== "string") {
                    replyMessage = "🟥 Error processing AI response.";
                }

                // For users who have received the welcome message, override generic AI responses
                if (!isGroup && await welcomeMessageTable.get(M.sender)) {
                    const userName = M.pushName || 'there';
                    const focusedResponse = await generateFocusedResponse(body, userName, client, M);

                    // If the response is our special marker, it means we've already sent the group link
                    if (focusedResponse === "GROUP_LINK_SENT") {
                        return null; // Exit early as we've already handled this request
                    }

                    replyMessage = focusedResponse;
                }

                console.log("💬 Replying:", replyMessage);
                return M.reply(replyMessage);
            }
        }
    } catch (err) {
        console.error("🚨 Error in MessageHandler:", err);
    }
};

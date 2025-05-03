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
 * The response congratulates them and builds anticipation for upcoming classes.
 *
 * @param {string} userName - The name of the user to personalize the response for.
 * @returns {Promise<string>} - A natural-sounding, conversational response.
 */
async function generateCompletionResponse(userName) {
    try {
        // Create a more human-like, conversational response that doesn't sound like AI
        // No mention of "what can I do for you" or revealing it's a bot
        // Focus on congratulating them and building anticipation for the class

        // Choose randomly from several natural-sounding responses to seem more human
        const responses = [
            `Perfect! You're all set ${userName} 🔥 Have you joined our WhatsApp group yet? The classes are starting super soon and they're gonna be massive! Get ready to take some notes - we'll be covering some game-changing stuff. See you in class! 💯`,

            `That's great ${userName}! You're good to go now. The upcoming classes are gonna be incredible - we've put together some amazing content for you. Are you in the WhatsApp group? That's where all the action happens. Can't wait for you to see what we've prepared! 🚀`,

            `Awesome ${userName}! You're officially in 🙌 The classes we've prepared are gonna be mind-blowing - make sure you're in the WhatsApp group cuz that's where everything happens. Get ready for some serious value coming your way! Looking forward to seeing how you do.`,

            `You're all set ${userName}! The training is gonna be massive - we've put together some incredible content that's gonna change how you approach this whole field. Have you joined our WhatsApp group? That's where we post all updates. Get ready for an amazing journey! ✨`,

            `Fantastic! You've completed all the steps ${userName} 👏 The classes will be starting soon, and trust me, you don't wanna miss any of them. Make sure you're active in the WhatsApp group - that's where I'll be dropping all the important updates. Looking forward to seeing you shine!`,

            `Great job ${userName}! Everything's set up now. I'm honestly so excited for you to experience these upcoming classes - they're packed with valuable content. Have you joined the WhatsApp group? That's your main hub for all class announcements. Get ready for some serious knowledge bombs! 💣`,

            `You're good to go ${userName}! The training we've prepared is gonna blow your mind (not even exaggerating lol). Make sure you're in the WhatsApp group since that's where all the magic happens. The classes are starting soon, so get ready to level up your skills in a big way!`,

            `All done! You're now officially part of the program ${userName} 🎉 The classes we've lined up are gonna be game-changers for real. Have you joined the WhatsApp group? That's essential cuz all updates will be shared there. Can't wait to see your transformation through this journey!`,

            `Yesss! You're all set now ${userName}! 🙌 I'm so excited for you to join the classes - they're gonna be amazing! Have you joined the WhatsApp group yet? That's where I'll be posting all the updates about when we start. Can't wait!`,

            `Perfect ${userName}! You've completed everything 👍 Now just make sure you're in the WhatsApp group because that's where all the important stuff gets posted. The training is starting soon and it's gonna be incredible!`,

            `Awesome! You're all ready to go ${userName} 😄 The classes are starting soon and between you and me, the content is insanely good! Make sure you're checking the WhatsApp group regularly - that's where I post all the important updates.`,

            `You're all set ${userName}! Can't wait for you to experience the training - it's gonna be a game-changer for sure! Just make sure you're active in the WhatsApp group so you don't miss any announcements. See you in class! 🔥`
        ];

        // Select a random response to seem more human-like
        const randomIndex = Math.floor(Math.random() * responses.length);
        return responses[randomIndex];

    } catch (error) {
        console.error("🚨 Error generating completion response:", error);
        // Even the fallback should feel human and conversational
        return `Perfect ${userName}! You're all set for the training now. The classes are starting soon and they're going to be incredible! Make sure you're in our WhatsApp group - that's where all the action will happen. Looking forward to seeing you in class! 🔥`;
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

        // Check for explicit group link requests or negative responses about joining the group
        if ((lowerMsg.includes('link') && (lowerMsg.includes('send') || lowerMsg.includes('give') || lowerMsg.includes('share') || lowerMsg.includes('need'))) ||
            (lowerMsg.match(/^no\b/) && lowerMsg.length < 10) || // Simple "no" response
            (lowerMsg.includes('no') && (lowerMsg.includes('join') || lowerMsg.includes('haven') || lowerMsg.includes('not yet') || lowerMsg.includes('didn\'t'))) ||
            (lowerMsg.includes('not') && (lowerMsg.includes('join') || lowerMsg.includes('in the group') || lowerMsg.includes('in group'))) ||
            (lowerMsg === "no")) {
            console.log("🔗 Direct group link request or negative response about group membership detected");

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

        // Check for greetings
        if (lowerMsg.match(/^(hi|hello|hey|hola|greetings|good morning|good afternoon|good evening|yo|sup|what's up|howdy)/i)) {
            const greetingResponses = [
                `Hey ${userName}! 👋 Hope ur getting ready for the upcoming classes. Have you checked out the WhatsApp group yet? That's where we post all the important stuff.`,

                `Hi there ${userName}! Just checking in to see if you're all set for the training. The classes are gonna be packed with amazing content! Excited? 🔥`,

                `Hello ${userName}! How's it going? Make sure you're in the WhatsApp group - we'll be dropping some pre-class materials there soon 📝`,

                `Heyyy ${userName}! Good to hear from you 😊 The training starts soon and it's going to be incredible. Joined our WhatsApp group yet?`,

                `Hey there ${userName}! How are you? Just wanted to make sure you're ready for the classes. They're gonna be awesome!`,

                `Hi ${userName}! 👋 Just checking in. Have you joined the WhatsApp group? That's where all the action happens haha`,

                `Hey ${userName}! What's up? Hope you're getting excited for the training. Make sure to join the group if you haven't already!`,

                `Morning/Afternoon ${userName}! (depending on when you're reading this lol) 😄 Ready for the classes? They're gonna be game-changers!`
            ];

            return greetingResponses[Math.floor(Math.random() * greetingResponses.length)];
        }

        // Check for questions about the class/training
        if (lowerMsg.includes('class') || lowerMsg.includes('training') || lowerMsg.includes('course') || lowerMsg.includes('when') || lowerMsg.includes('start')) {
            const classResponses = [
                `The classes are starting super soon ${userName}! 🔥 We'll announce everything in the WhatsApp group, so keep an eye out there. Trust me, the content we've prepared is gonna blow your mind!`,

                `We're just putting the final touches on everything for the training ${userName}. I'm personally making sure it's all perfect before we start! All the details will be in the WhatsApp group - it's def worth the wait 😉`,

                `Ahh I'm so excited for you to see what we've prepared! 🙌 The schedule will be posted in the group soon ${userName}. We're just making sure everything is 100% ready. It's gonna be epic!`,

                `Keep checking the WhatsApp group ${userName} - that's where we'll announce when everything kicks off. Between you and me, the content is insanely good! Can't wait for you to see it 🤩`,

                `Honestly, I can't wait to get started! The classes are gonna be amazing ${userName}. We're just finalizing some stuff and then we'll announce dates in the group. You're gonna love it!`,

                `So the training is starting really soon! Just wrapping up a few things. I'll make sure everyone gets notified in the WhatsApp group ${userName}. The content is fire 🔥 seriously!`,

                `I was just working on the training materials yesterday actually! They're looking great ${userName}. We'll be announcing the start date in the group any day now. Make sure you're in there!`,

                `Can't give you the exact date yet (still finalizing some things) but it's SOON! 😄 Keep an eye on the WhatsApp group ${userName} - that's where I'll post all the details first.`
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
            const groupResponses = [
                `Have you joined the WhatsApp group yet ${userName}? That's literally where everything happens! Need the link again? Just say the word and I'll send it over. The group's already pretty active btw! 📱`,

                `Omg the WhatsApp group is super important for the training ${userName}! We share all the good stuff there - announcements, materials, everything. Let me know if you need help joining! 🔗`,

                `Make sure you're in the WhatsApp group ${userName}! That's where all the magic happens haha. We'll be dropping some exclusive content there soon that you def don't wanna miss! 💬`,

                `So the WhatsApp group is basically command central for everything ${userName} 😄 All updates go there first. Not in yet? Just let me know and I'll hook you up with the link! 📲`,

                `The group is where it's at ${userName}! I'm in there everyday sharing updates and answering questions. Let me know if you need the link again - no problem at all!`,

                `Yesss the WhatsApp group! It's already pretty active ${userName}. Some people are already connecting and chatting about the training. Need me to resend the link?`,

                `I was just in the WhatsApp group earlier today actually! It's where we'll be posting all the important stuff. You should definitely join if you haven't already ${userName}!`,

                `The WhatsApp group is essential tbh. That's where I'll be posting all the updates about when classes start and sharing materials. Let me know if you need help joining ${userName}!`
            ];

            return groupResponses[Math.floor(Math.random() * groupResponses.length)];
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

        // Default responses for other messages
        const defaultResponses = [
            `Hey ${userName}! Just checking in to see how you're doing. Remember to stay active in the WhatsApp group - that's where I post all the important stuff about the training. It's starting soon and it's gonna be amazing! 🔥`,

            `${userName}! I'm honestly so excited for you to experience this training. We've put together some incredible content that's gonna transform your skills. Make sure you're in the WhatsApp group for all the updates! 📚`,

            `Sooo the training is starting soon ${userName}! You ready? 😄 Make sure you're checking the WhatsApp group regularly - that's where all the announcements will be. We've got some amazing classes lined up!`,

            `Just wanted to check in and make sure you're all set for the training ${userName}. The WhatsApp group is where everything happens, so keep an eye on it! The classes are gonna be game-changers for real! ✨`,

            `Hey there! Just a quick reminder about the WhatsApp group ${userName} - that's where you'll get all the updates about the training. Don't wanna miss anything important!`,

            `${userName}! How's it going? Just making sure you're ready for the classes. They're starting soon and I'm so excited for you to see what we've prepared!`,

            `I was just thinking about the upcoming training and wanted to check in ${userName}. Have you joined the WhatsApp group yet? That's where all the important stuff gets posted first.`,

            `Hey! Just wanted to say I'm looking forward to having you in the training ${userName}. It's gonna be such a great experience. Make sure you're in the WhatsApp group!`
        ];

        return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];

    } catch (error) {
        console.error("🚨 Error generating focused response:", error);
        // Even the fallback should be focused on the training
        return `Hey ${userName}, just making sure you're ready for the upcoming classes! They're going to be incredible. Make sure you're active in the WhatsApp group for all the important announcements. 🚀`;
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

                    // Send the completion response
                    await client.sendMessage(M.from, { text: completionResponse }, { quoted: M });
                    console.log(`✅ Completion response sent to ${M.pushName} (${M.sender})`);

                    // Occasionally send a follow-up message (triple message is rare)
                    const shouldSendFollowUp = Math.random() < 0.35; // 35% chance for double message
                    const shouldSendSecondFollowUp = shouldSendFollowUp && Math.random() < 0.2; // 20% of those get a third message

                    if (shouldSendFollowUp) {
                        // Generate a follow-up message
                        const followUpMessages = [
                            `Oh and ${userName}, don't forget to introduce yourself in the group! It's a great way to connect with everyone.`,
                            `Also ${userName}, we'll be sharing some pre-class materials in the group soon, so keep an eye out!`,
                            `By the way ${userName}, if you have any questions before we start, feel free to ask in the group or message me directly.`,
                            `One more thing ${userName} - make sure your notifications are turned on for the group so you don't miss anything!`,
                            `And ${userName}, you might want to save some space on your phone for the training materials we'll be sharing.`,
                            `Almost forgot to mention ${userName}, we'll be doing some live sessions too, so get ready!`,
                            `Also, if you know anyone else who might be interested in this training ${userName}, let them know! The more the merrier.`,
                            `I'm really looking forward to seeing your progress in this training ${userName}!`
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
                                `Oh! And make sure to check the pinned messages in the group too ${userName}. Important stuff there!`,
                                `Almost forgot - we'll be starting with some basics, so don't worry if you're new to this ${userName}.`,
                                `And ${userName}, don't be shy in the group! Everyone's super friendly and helpful.`,
                                `Just remembered ${userName} - we'll be giving out some bonuses to the most active participants!`,
                                `One last thing ${userName} - there'll be some homework too, but I promise it'll be fun!`
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
            if (!isGroup &&
                (lowerBody.includes('link') ||
                 lowerBody.includes('join') ||
                 (lowerBody.includes('group') && (lowerBody.includes('send') || lowerBody.includes('give') || lowerBody.includes('share'))) ||
                 (lowerBody === "no" && await welcomeMessageTable.get(M.sender)))) {

                console.log("🔍 Direct group link request detected in main flow");

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

                        // Generate a follow-up message
                        const followUpMessages = [
                            `Oh and ${userName}, make sure you're checking the WhatsApp group regularly!`,
                            `By the way ${userName}, have you joined the WhatsApp group yet?`,
                            `Also ${userName}, the training is starting really soon so stay tuned!`,
                            `Just a reminder ${userName}, all important announcements will be in the group.`,
                            `One more thing ${userName} - don't forget to save this number!`,
                            `Almost forgot to mention ${userName}, we'll be sharing some exclusive content in the group soon!`,
                            `And ${userName}, feel free to ask if you have any questions about the training!`,
                            `I'm so excited for you to start this journey ${userName}!`
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

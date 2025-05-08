const { serialize } = require('../Helper/WAclient');
const chalk = require('chalk');
const emojiStrip = require('emoji-strip');
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { learnFromUserMessage, adaptResponseBasedOnLearning } = require('./learning');
const { simpleSplitMessage, enforceMaxParts, calculateTypingDelays } = require('./simpleSplitter');
const ChatSessionManager = require('./chatSession');
const { exec } = require('child_process');
const handleInitialMessage = require('./InitialMessage');

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

        const prompt = `You are an advanced AI assistant for Gidi Banks' financial training program.
You help users learn about making money online and guide them to join the training WhatsApp group.
You use emojis when appropriate but must always follow instructions.

🚨 **IMPORTANT:**
1️⃣ When the user asks for emails, **DO NOT EXPLAIN, DO NOT RETURN JSON**. Just say: "🔄 Fetching emails...".
2️⃣ When the user asks for their datastation balance, **DO NOT EXPLAIN, DO NOT RETURN JSON**. Just say: "🔄 Fetching datastation balance...".
3️⃣ When the user asks you to check for someone email in the database, **DO NOT EXPLAIN, DO NOT RETURN JSON**. Just say: "🔄 Fetching user data...".
4️⃣ When the user asks for a group link or to join a group, or says they haven't joined the group yet, or responds with "no" when asked about joining the group, **DO NOT EXPLAIN, DO NOT RETURN JSON**. Just say: "🔄 Fetching group link...".
5️⃣ If the user asks for a command, return JSON like this:
   {"action": "command", "command": "<commandName>", "args": "<arguments>"}
6️⃣ For casual conversations, reply in plain text with short, focused responses about financial training and making money online.

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
 * @param {boolean} isRefusal - Whether the user initially refused to join.
 * @returns {Promise<string>} - A personalized caption for the group link.
 */
async function generateGroupLinkCaption(userName, isRefusal = false) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("⚠️ Gemini API key is missing.");
            return isRefusal
                ? `Here's the group link ${userName}. I really think you'll find a lot of value in joining - it's where all the financial training happens!`
                : `🌟 Here's your group link! Click to join our community.`;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let prompt;

        if (isRefusal) {
            prompt = `Generate a short, persuasive caption for a WhatsApp group invite link for someone who initially refused to join.
The caption should be personalized for a user named "${userName}".
The caption should:
- Be 1-3 sentences maximum
- Include emojis
- Be persuasive but respectful
- Focus on the financial benefits of joining the group
- Mention that this is where Gidi Banks shares money-making strategies
- Not include the actual link (it will be added separately)
- Be direct and concise

Example format: "Here's the link ${userName}. I really think you'll benefit from the financial strategies Gidi Banks shares in this group. Many people are already using these methods to create serious income! 💰"`;
        } else {
            prompt = `Generate a short, friendly, and engaging caption for a WhatsApp group invite link focused on financial training.
The caption should be personalized for a user named "${userName}".
The caption should:
- Be 1-3 sentences maximum
- Include emojis
- Be enthusiastic and welcoming
- Mention that this is where Gidi Banks shares money-making strategies
- Focus on financial freedom and making money online
- Not include the actual link (it will be added separately)
- Be direct and concise

Example format: "🌟 Here's the group link ${userName}! This is where Gidi Banks shares all his wealth-building strategies. Join now to start your journey to financial freedom! 💰"`;
        }

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        if (!text) {
            return isRefusal
                ? `Here's the group link ${userName}. I really think you'll find a lot of value in joining - it's where all the financial training happens!`
                : `🌟 Here's your group link ${userName}! Join Gidi Banks' financial training group to learn how to create serious income online! 💰`;
        }

        return text;
    } catch (error) {
        console.error("🚨 Gemini API error generating caption:", error);
        return isRefusal
            ? `Here's the group link ${userName}. I really think you'll find a lot of value in joining - it's where all the financial training happens!`
            : `🌟 Here's your group link ${userName}! Join Gidi Banks' financial training group to learn how to create serious income online! 💰`;
    }
}

/**
 * Generates a welcome message for new users with links from the database.
 * Uses AI to slightly modify the text to avoid sending identical messages.
 *
 * @param {string} userName - The name of the user to personalize the message for.
 * @param {string} template - The template message with placeholders.
 * @param {string} whatsappLink - The WhatsApp group link to include.
 * @param {string} telegramLink - The Telegram community link to include.
 * @returns {Promise<string>} - The welcome message with links.
 */
async function generateWelcomeMessage(userName, template, whatsappLink, telegramLink) {
    // Import the function from welcomeMessage.js to avoid code duplication
    const { generateWelcomeMessage: generateMessage } = require('./welcomeMessage');
    return generateMessage(userName, template, whatsappLink, telegramLink);
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
        const customVoiceDir = path.join(__dirname, '../../custom-voice');

        // Create directories if they don't exist
        if (!fs.existsSync(voiceNotesDir)) {
            fs.mkdirSync(voiceNotesDir, { recursive: true });
        }

        if (!fs.existsSync(customVoiceDir)) {
            fs.mkdirSync(customVoiceDir, { recursive: true });
        }

        const fileName = `voice_${Date.now()}.mp3`;
        const filePath = path.join(voiceNotesDir, fileName);

        // Check if we should use custom voice
        const configTable = client.DB ? client.DB.table('config') : null;
        const useCustomVoice = configTable ? await configTable.get('useCustomVoice') : false;

        if (useCustomVoice) {
            try {
                // Check if we have custom voice samples
                const customVoiceSamples = fs.readdirSync(customVoiceDir)
                    .filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));

                if (customVoiceSamples.length > 0) {
                    console.log(`🎤 Using custom voice from ${customVoiceSamples.length} available samples`);

                    // Select a random sample from the available custom voice files
                    const randomSample = customVoiceSamples[Math.floor(Math.random() * customVoiceSamples.length)];
                    const samplePath = path.join(customVoiceDir, randomSample);

                    // Copy the sample to our output file
                    fs.copyFileSync(samplePath, filePath);

                    // Send the voice note
                    await client.sendMessage(M.from, {
                        audio: fs.readFileSync(filePath),
                        mimetype: 'audio/mp3',
                        ptt: true // This makes it play as a voice note
                    });

                    console.log("🎤 Custom voice note sent successfully");

                    // Clean up the file
                    fs.unlinkSync(filePath);

                    return true;
                } else {
                    console.log("⚠️ Custom voice enabled but no samples found, falling back to TTS");
                }
            } catch (customVoiceError) {
                console.error("🚨 Error using custom voice:", customVoiceError);
                console.log("⚠️ Falling back to standard TTS");
            }
        }

        // If custom voice failed or is disabled, use text-to-speech
        // First try to use google-tts-api if available
        try {
            const googleTTS = require('google-tts-api');

            // Get voice gender and language from config or use defaults
            const voiceGender = configTable ? await configTable.get('voiceGender') || 'male' : 'male';
            const voiceLanguage = configTable ? await configTable.get('voiceLanguage') || 'en' : 'en';

            console.log(`🎤 Using Google TTS with ${voiceGender} voice in language: ${voiceLanguage}`);

            // Get audio as base64
            const base64Audio = await googleTTS.getAudioBase64(text, {
                lang: voiceLanguage,
                slow: false,
                host: 'https://translate.google.com',
                timeout: 10000,
            });

            // Convert base64 to file
            fs.writeFileSync(filePath, Buffer.from(base64Audio, 'base64'));

            // Send the voice note
            await client.sendMessage(M.from, {
                audio: fs.readFileSync(filePath),
                mimetype: 'audio/mp3',
                ptt: true // This makes it play as a voice note
            });

            console.log("🎤 Google TTS voice note sent successfully");

            // Clean up the file
            fs.unlinkSync(filePath);

            return true;
        } catch (googleTTSError) {
            console.error("⚠️ Google TTS failed, falling back to Windows TTS:", googleTTSError);

            // Fallback to Windows TTS
            return new Promise((resolve, reject) => {
                // Clean the text for command line usage
                const cleanText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');

                // Get voice gender from config or use default
                const voiceGender = configTable ? configTable.get('voiceGender') || 'Male' : 'Male';

                // PowerShell command to generate speech
                const command = `powershell -Command "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 0; $speak.Volume = 100; $speak.SelectVoiceByHints('${voiceGender}'); $speak.SetOutputToWaveFile('${filePath}'); $speak.Speak('${cleanText}'); $speak.Dispose()"`;

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

                        console.log("🎤 Windows TTS voice note sent successfully");

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
        }
    } catch (error) {
        console.error("🚨 Error in sendVoiceNote:", error);
        return false;
    }
}

// Initialize chat session manager
let chatSessionManager = null;
let chatSessionInitialized = false;
let chatSessionError = null;

/**
 * Initializes the chat session manager if it hasn't been initialized yet
 *
 * @param {object} client - The WhatsApp client instance
 * @returns {ChatSessionManager} - The chat session manager instance
 */
function getChatSessionManager(client) {
    // If we've already tried to initialize and failed, don't keep trying
    if (chatSessionError) {
        console.warn("⚠️ Chat session manager previously failed to initialize:", chatSessionError);
        return null;
    }

    // If we haven't initialized yet, try to do so
    if (!chatSessionManager && !chatSessionInitialized) {
        try {
            chatSessionInitialized = true; // Mark as initialized to prevent multiple attempts

            // Check if GEMINI_API_KEY is available
            if (!process.env.GEMINI_API_KEY) {
                chatSessionError = new Error("GEMINI_API_KEY is missing");
                console.error("🚨 Cannot initialize chat session manager: GEMINI_API_KEY is missing");
                return null;
            }

            // Initialize the chat session manager
            chatSessionManager = new ChatSessionManager(client);
            console.log("✅ Chat session manager initialized successfully");

            // Test the connection to Gemini API
            setTimeout(async () => {
                try {
                    const testMessage = "Hello, this is a test message.";
                    const testResponse = await chatSessionManager._fallbackToSingleMessage(
                        testMessage,
                        "TestUser",
                        { hasJoinedGroup: false }
                    );
                    console.log("✅ Gemini API test successful:", testResponse ? "Response received" : "No response");
                } catch (testError) {
                    console.error("🚨 Gemini API test failed:", testError);
                    chatSessionError = testError;
                }
            }, 1000);
        } catch (error) {
            chatSessionError = error;
            console.error("🚨 Error initializing chat session manager:", error);
            return null;
        }
    }

    return chatSessionManager;
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
        // Create a table for tracking conversation context
        const conversationContextTable = client.DB.table('conversationContext');

        // Get previous messages to maintain context (up to 3 recent messages)
        const previousContext = await conversationContextTable.get(M.sender) || [];

        // Add current message to context
        previousContext.push({
            role: 'user',
            content: message,
            timestamp: Date.now()
        });

        // Keep only the 3 most recent messages
        while (previousContext.length > 3) {
            previousContext.shift();
        }

        // Save updated context
        await conversationContextTable.set(M.sender, previousContext);

        // Extract context for better responses
        let contextualInfo = '';
        if (previousContext.length > 1) {
            // We have previous messages to use as context
            contextualInfo = `Previous messages in this conversation:\n`;
            for (let i = 0; i < previousContext.length - 1; i++) { // Exclude current message
                const prevMsg = previousContext[i];
                contextualInfo += `- ${prevMsg.role === 'user' ? 'User' : 'Bot'}: ${prevMsg.content}\n`;
            }
        }

        const lowerMsg = message.toLowerCase();

        // Check for greetings - send a direct financial training message
        if (lowerMsg.match(/^(hi|hello|hey|hola|greetings|good morning|good afternoon|good evening|yo|sup|what's up|howdy)/i)) {
            console.log(`👋 Greeting detected from ${userName} (${M.sender}), sending direct financial training message`);

            // Direct financial training messages with follow-up questions
            const financialMessages = [
                `Hey ${userName}! 👋 Ready to learn how to make serious money online? Gidi Banks' training starts soon! Have you joined the WhatsApp group yet?`,
                `Hi ${userName}! 💰 Excited to have you here for Gidi Banks' financial freedom training! Did you save the number as GidiBanks?`,
                `Hello ${userName}! 🔥 Gidi Banks is about to reveal his system for making 6-7 figures online! Have you checked out the Telegram community?`,
                `Hey there ${userName}! 💎 Ready to transform your finances with Gidi Banks' proven strategies? Which step are you on right now?`,
                `Hi ${userName}! 🚀 Gidi Banks' wealth-building training is about to start. Have you completed all the steps?`
            ];

            // Select a random message
            const response = financialMessages[Math.floor(Math.random() * financialMessages.length)];

            // Schedule a follow-up message after 2-3 minutes
            setTimeout(async () => {
                const followUpMessages = [
                    `Hey ${userName}! Just checking in - have you had a chance to join the WhatsApp group? That's where all the action happens!`,
                    `Hi ${userName}! Quick reminder - make sure to save the number as GidiBanks to stay updated with the training!`,
                    `Hey there ${userName}! Don't forget to join the Telegram community - Gidi Banks shares exclusive content there!`,
                    `Hi ${userName}! Just wanted to make sure you're all set for the training. Need any help with the steps?`,
                    `Hey ${userName}! The training is about to start - have you completed all the steps? Let me know if you need any assistance!`
                ];

                const followUp = followUpMessages[Math.floor(Math.random() * followUpMessages.length)];
                await client.sendMessage(M.from, { text: followUp });
            }, 120000 + Math.random() * 60000); // Random delay between 2-3 minutes

            return response;
        }

        // Check if user has already joined the group
        const groupJoinedTable = client.DB.table('groupJoined');
        const hasJoined = await groupJoinedTable.get(M.sender);

        // Learn from the user's message
        await learnFromUserMessage(M.sender, userName, message, client);
        console.log(`🧠 Learning from message from ${userName} (${M.sender})`);

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

            // Check if user is explicitly saying they're not in the group or haven't joined
            const explicitlyNotJoined =
                (lowerMsg.includes('not') && (lowerMsg.includes('in the group') || lowerMsg.includes('in group') || lowerMsg.includes('joined'))) ||
                lowerMsg.includes("haven't joined") ||
                lowerMsg.includes("have not joined") ||
                lowerMsg.includes("not joined") ||
                lowerMsg.includes("am not in") ||
                (lowerMsg.includes("no") && lowerMsg.includes("group")) ||
                (lowerMsg.includes("i") && lowerMsg.includes("not") && lowerMsg.includes("group"));

            // If user explicitly says they're not in the group, reset their status and send the link
            if (explicitlyNotJoined) {
                // If they were previously marked as joined, reset their status
                if (hasJoined) {
                    console.log(`🔄 User ${M.pushName} (${M.sender}) says they're not in the group despite being marked as joined. Resetting status.`);
                    // Reset their joined status
                    await groupJoinedTable.delete(M.sender);
                } else {
                    console.log(`🔍 User ${M.pushName} (${M.sender}) confirms they have not joined the group.`);
                }

                // Always send the group link when they explicitly say they're not in the group
                // Continue to the code below that sends the link
            }
            // If user has already joined but is asking for the link again (without explicitly saying they're not in the group)
            else if (hasJoined && !explicitlyNotJoined && !lowerMsg.includes('link') && !lowerMsg.includes('send') && !lowerMsg.includes('give')) {
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

                // Check if this is a refusal to join
                const isRefusal = lowerMsg.includes("won't join") ||
                                 lowerMsg.includes("will not join") ||
                                 lowerMsg.includes("don't want to join") ||
                                 lowerMsg.includes("not interested") ||
                                 (lowerMsg.includes("no") && lowerMsg.length < 5);

                // Generate and send the caption with the link
                const caption = await generateGroupLinkCaption(userName, isRefusal);

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
        // First check if the previous message was asking about the group link
        // Use the existing conversation context from earlier in the function
        let conversationContextForLinks = await client.DB.table('conversationContext').get(M.sender) || [];

        // Check if the previous message was about the group link
        let previousMessageWasAboutLink = false;
        if (conversationContextForLinks.length >= 2) {
            const prevBotMessage = conversationContextForLinks[conversationContextForLinks.length - 2]; // Get the bot's previous message
            if (prevBotMessage && prevBotMessage.role === 'bot') {
                const prevBotText = prevBotMessage.content.toLowerCase();
                previousMessageWasAboutLink =
                    prevBotText.includes('group link') ||
                    prevBotText.includes('need the link') ||
                    prevBotText.includes('send you the link') ||
                    prevBotText.includes('hook you up with the link');

                if (previousMessageWasAboutLink) {
                    console.log(`🔍 Previous bot message was about the group link: "${prevBotMessage.content.substring(0, 50)}..."`);
                }
            }
        }

        // Only treat affirmative responses as link requests if the previous message was about the link
        // or if they explicitly mention "link"
        const isExplicitLinkRequest = lowerMsg.includes('link') || lowerMsg.includes('send') || lowerMsg.includes('group');

        if ((previousMessageWasAboutLink &&
             ((lowerMsg.match(/^yes\b/) && lowerMsg.length < 10) || // Simple "yes" response
              (lowerMsg.includes('yes')) ||
              (lowerMsg.includes('yeah') && lowerMsg.length < 15) ||
              (lowerMsg.includes('please') && lowerMsg.length < 20) ||
              (lowerMsg === "yes") || (lowerMsg === "yeah") || (lowerMsg === "yep") || (lowerMsg === "sure") || (lowerMsg === "ok"))) ||
            isExplicitLinkRequest) {

            console.log("🔗 Affirmative response to group link question detected");

            // If this is a response to "have you joined the group?" and they say yes, mark them as joined
            if (hasJoined === undefined && !isExplicitLinkRequest) {
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

                // Check if this is a refusal to join
                const isRefusal = lowerMsg.includes("won't join") ||
                                 lowerMsg.includes("will not join") ||
                                 lowerMsg.includes("don't want to join") ||
                                 lowerMsg.includes("not interested") ||
                                 (lowerMsg.includes("no") && lowerMsg.length < 5);

                // Generate and send the caption with the link
                const caption = await generateGroupLinkCaption(userName, isRefusal);

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

        // Try to use the chat session for a more personalized response
        try {
            // Get the chat session manager
            const sessionManager = getChatSessionManager(client);

            // If chat session manager is not available, throw an error to fall back to default responses
            if (!sessionManager) {
                throw new Error("Chat session manager is not available");
            }

            // Context for the AI
            const context = {
                hasJoinedGroup: hasJoined === true,
                isNewUser: false,
                lastInteraction: null
            };

            // Add conversation context to the AI request
            if (contextualInfo) {
                context.conversationHistory = contextualInfo;
                console.log(`📚 Using conversation context for ${userName} (${M.sender})`);
            }

            // Use the chat session to generate a response
            console.log(`🤖 Generating AI response using chat session for ${userName} (${M.sender})`);
            const aiResponse = await sessionManager.sendMessage(M.sender, userName, message, context);

            // If we didn't get a response, throw an error
            if (!aiResponse) {
                throw new Error("No response received from AI service");
            }

            // Adapt the response based on what we've learned about the user
            const adaptedResponse = await adaptResponseBasedOnLearning(M.sender, aiResponse, client);
            console.log(`🧠 Adapted response based on learning for ${userName}`);

            // Store the bot's response in the conversation context
            const conversationContextTable = client.DB.table('conversationContext');
            const previousContext = await conversationContextTable.get(M.sender) || [];

            previousContext.push({
                role: 'bot',
                content: adaptedResponse,
                timestamp: Date.now()
            });

            // Keep only the 3 most recent messages
            while (previousContext.length > 3) {
                previousContext.shift();
            }

            // Save updated context
            await conversationContextTable.set(M.sender, previousContext);

            return adaptedResponse;
        } catch (aiError) {
            console.error("🚨 Error using chat session:", aiError);

            // Fall back to default responses if chat session fails
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
        }

    } catch (error) {
        console.error("🚨 Error in generateFocusedResponse:", error);
        return "I'm having trouble processing your message right now. Please try again or ask about joining the WhatsApp group for more information.";
    }
}

// Export the sendVoiceNote function so it can be used by other modules
module.exports.sendVoiceNote = sendVoiceNote;

// Export the main message handler
module.exports.MessageHandler = async (messages, client) => {
    try {
        if (messages.type !== 'notify') return;
        let M = serialize(JSON.parse(JSON.stringify(messages.messages[0])), client);
        if (!M.message) return;
        if (M.key && M.key.remoteJid === 'status@broadcast') return;
        if (M.type === 'protocolMessage' || M.type === 'senderKeyDistributionMessage' || !M.type || M.type === '') return;

        // Check if this bot instance is active
        if (client.instanceId) {
            try {
                const configTable = client.DB.table('config');
                const instances = await configTable.get('botInstances') || [];
                const currentInstance = instances.find(instance => instance.id === client.instanceId);

                if (currentInstance && !currentInstance.isActive) {
                    console.log(`🛌 Bot instance ${client.instanceId} is in sleep mode, ignoring message`);
                    return;
                }
            } catch (error) {
                console.error('Error checking bot active status:', error);
            }
        }

        // Skip processing the bot's own messages
        if (M.isSelf) {
            console.log('🤖 Skipping bot\'s own message');
            return;
        }

        // Handle initial message for private chats or reset conversation after inactivity
        if (!M.isGroup) {
            // Create a table for tracking last activity time
            const lastActivityTable = client.DB.table('lastActivity');

            // Get the last activity timestamp for this user
            const lastActivity = await lastActivityTable.get(M.from);
            const currentTime = Date.now();

            // Update the last activity time for this user
            await lastActivityTable.set(M.from, currentTime);

            // Check if this is the first message or if user has been inactive for 5+ minutes
            const isFirstMessage = !client.messagesMap.has(M.from);
            const isInactiveUser = lastActivity && (currentTime - lastActivity > 5 * 60 * 1000); // 5 minutes in milliseconds

            if (isFirstMessage || isInactiveUser) {
                // If user was inactive, log it
                if (isInactiveUser) {
                    console.log(`🔄 User ${M.pushName} (${M.sender}) was inactive for ${Math.floor((currentTime - lastActivity) / 60000)} minutes, resetting conversation`);

                    // Reset the messagesMap for this user to trigger welcome message
                    client.messagesMap.delete(M.from);
                }

                // Show typing indicator before sending welcome message
                await client.sendPresenceUpdate('composing', M.from);
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

                await handleInitialMessage(client, M);
                return; // Don't process the message further
            }
        }

        // Check if the user is responding with "DONE" after receiving the welcome message
        if (!M.isGroup && M.body.trim().toUpperCase() === "DONE") {
            // Check if user has received the initial message
            const hasReceivedWelcome = client.messagesMap.has(M.from);

            // Get the last activity timestamp for this user
            const lastActivityTable = client.DB.table('lastActivity');
            const lastActivity = await lastActivityTable.get(M.from);
            const currentTime = Date.now();

            // Check if user has been inactive for 5+ minutes
            const isInactiveUser = lastActivity && (currentTime - lastActivity > 5 * 60 * 1000); // 5 minutes in milliseconds

            // Update the last activity time for this user
            await lastActivityTable.set(M.from, currentTime);

            if (hasReceivedWelcome && !isInactiveUser) {
                console.log(`🎉 User ${M.pushName} (${M.sender}) completed the initial steps`);

                // Show typing indicator
                await client.sendPresenceUpdate('composing', M.from);
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

                // Generate a completion response
                const completionResponse = await generateCompletionResponse(M.pushName);

                // Send the completion response
                await client.sendMessage(M.from, { text: completionResponse });

                // Mark user as having completed initial steps
                const configTable = client.DB.table('config');
                await configTable.set(`${M.sender}_completed_steps`, true);

                return;
            } else {
                if (isInactiveUser) {
                    console.log(`⚠️ User ${M.pushName} (${M.sender}) sent DONE after inactivity period, resending welcome message`);
                } else {
                    console.log(`⚠️ User ${M.pushName} (${M.sender}) sent DONE without receiving welcome message`);
                }

                // Reset the messagesMap for this user to trigger welcome message
                client.messagesMap.delete(M.from);

                // Send the initial message again
                await handleInitialMessage(client, M);
                return;
            }
        }

        // Continue with existing message handling
        const { isGroup, from, body } = M;
        // Only get group metadata if needed
        if (isGroup) {
            await client.groupMetadata(from);
        }

        // Get the user's name
        const userName = M.pushName || 'there';

        // Show typing indicator before generating response
        await client.sendPresenceUpdate('composing', M.from);
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

        // Update the last activity time for this user
        const lastActivityTable = client.DB.table('lastActivity');
        await lastActivityTable.set(M.from, Date.now());

        // Generate a focused response
        const response = await generateFocusedResponse(body, userName, client, M);

        // If we got a response, send it
        if (response && response !== "GROUP_LINK_SENT") {
            // Always quote the user's message (100% chance)
            try {
                // Send as a reply to the user's message to maintain conversation context
                await client.sendMessage(M.from, {
                    text: response,
                    quoted: M // This makes it a reply to the user's message
                });
                console.log(`💬 Sent response as reply to ${userName} (${M.sender})`);
            } catch (sendError) {
                // If quoting fails for any reason, fall back to regular message
                console.error("⚠️ Error sending quoted message, falling back to regular message:", sendError);
                try {
                    // Try one more time with a different approach
                    await client.sendMessage(M.from, {
                        text: response
                    }, { quoted: M });
                    console.log(`💬 Sent response with alternative quoting method to ${userName} (${M.sender})`);
                } catch (fallbackError) {
                    // If all quoting methods fail, send without quoting
                    console.error("⚠️ All quoting methods failed, sending without quote:", fallbackError);
                    await client.sendMessage(M.from, { text: response });
                    console.log(`💬 Sent fallback regular response to ${userName} (${M.sender})`);
                }
            }

            // Randomly decide if we should send a follow-up message to keep conversation going (10% chance)
            // Significantly reduced probability to avoid overwhelming the user with questions
            const shouldSendFollowUp = Math.random() < 0.1;

            if (shouldSendFollowUp) {
                // Wait 2-4 seconds before sending follow-up
                setTimeout(async () => {
                    try {
                        // Show typing indicator
                        await client.sendPresenceUpdate('composing', M.from);
                        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

                        // Create a table for tracking used follow-up questions
                        const usedQuestionsTable = client.DB.table('usedFollowUpQuestions');

                        // Get previously used questions for this user
                        const usedQuestions = await usedQuestionsTable.get(M.sender) || [];

                        // Get conversation context for this user
                        const conversationContextTable = client.DB.table('conversationContext');
                        const previousContext = await conversationContextTable.get(M.sender) || [];

                        // Get the last bot message to avoid repetition
                        const lastBotMessage = previousContext.find(msg => msg.role === 'bot')?.content?.toLowerCase() || '';

                        // Get the current message topic to make relevant follow-up questions
                        const lowerBody = body.toLowerCase();

                        // Determine message topic based on keywords
                        let messageTopic = 'general';
                        if (lowerBody.includes('money') || lowerBody.includes('income') || lowerBody.includes('earn') ||
                            lowerBody.includes('profit') || lowerBody.includes('revenue') || lowerBody.includes('financial')) {
                            messageTopic = 'money';
                        } else if (lowerBody.includes('strategy') || lowerBody.includes('method') ||
                                  lowerBody.includes('technique') || lowerBody.includes('approach')) {
                            messageTopic = 'strategy';
                        } else if (lowerBody.includes('learn') || lowerBody.includes('training') ||
                                  lowerBody.includes('course') || lowerBody.includes('class')) {
                            messageTopic = 'learning';
                        } else if (lowerBody.includes('time') || lowerBody.includes('when') ||
                                  lowerBody.includes('start') || lowerBody.includes('schedule')) {
                            messageTopic = 'timing';
                        } else if (lowerBody.includes('group') || lowerBody.includes('join') ||
                                  lowerBody.includes('telegram') || lowerBody.includes('whatsapp')) {
                            messageTopic = 'group';
                        } else if (lowerBody.includes('goal') || lowerBody.includes('dream') ||
                                  lowerBody.includes('aspire') || lowerBody.includes('hope')) {
                            messageTopic = 'goals';
                        } else if (lowerBody.includes('skill') || lowerBody.includes('experience') ||
                                  lowerBody.includes('knowledge') || lowerBody.includes('background')) {
                            messageTopic = 'skills';
                        }

                        console.log(`🔍 Detected message topic: ${messageTopic}`);

                        // Topic-specific follow-up questions - expanded with more variety
                        const topicQuestions = {
                            money: [
                                `What would you do with your first $1,000 of online income, ${userName}?`,
                                `${userName}, what's your current financial situation like? Are you starting from scratch or looking to scale?`,
                                `What's your income goal for the next 6 months, ${userName}?`,
                                `Have you had any success making money online before, ${userName}?`,
                                `${userName}, what financial obstacles are you trying to overcome right now?`,
                                `If you could solve one financial problem right now, what would it be, ${userName}?`,
                                `What's the biggest financial challenge you're facing currently, ${userName}?`,
                                `${userName}, how would consistent online income change your day-to-day life?`
                            ],
                            strategy: [
                                `Which money-making strategies have you tried before, ${userName}?`,
                                `${userName}, are you more interested in quick results or building something long-term?`,
                                `What type of online business model appeals to you most, ${userName}?`,
                                `Do you prefer active income strategies or more passive approaches, ${userName}?`,
                                `${userName}, have you ever tried affiliate marketing or dropshipping before?`,
                                `What's your take on digital products versus services, ${userName}?`,
                                `${userName}, do you prefer working with clients or selling products?`,
                                `Have you ever considered creating your own digital product, ${userName}?`
                            ],
                            learning: [
                                `${userName}, how do you learn best? Videos, reading, or hands-on practice?`,
                                `What's the most valuable skill you've learned so far, ${userName}?`,
                                `Are there specific areas of online business you want to learn more about, ${userName}?`,
                                `${userName}, what's your background? Any skills that might help with making money online?`,
                                `What's one skill you'd like to develop to boost your earning potential, ${userName}?`,
                                `${userName}, do you prefer learning in groups or self-study?`,
                                `Have you taken any online courses before, ${userName}? How was your experience?`,
                                `${userName}, what's your learning style? Visual, auditory, or hands-on?`
                            ],
                            timing: [
                                `How much time can you dedicate to this training each week, ${userName}?`,
                                `${userName}, are you looking to replace your income quickly or build something on the side?`,
                                `What's your timeline for achieving financial freedom, ${userName}?`,
                                `${userName}, do you prefer to work on this full-time or as a side project?`,
                                `Are you looking for a quick win or building something for the long term, ${userName}?`,
                                `${userName}, how soon are you hoping to see results from this training?`,
                                `Do you have a specific financial deadline you're working toward, ${userName}?`,
                                `${userName}, how do you plan to balance this with your other commitments?`
                            ],
                            group: [
                                `What are you hoping to get from the WhatsApp group, ${userName}?`,
                                `${userName}, have you been part of any similar training groups before?`,
                                `What made you interested in joining Gidi Banks' training group, ${userName}?`,
                                `Are you looking forward to connecting with other members in the group, ${userName}?`,
                                `${userName}, do you enjoy learning from others' experiences?`,
                                `What kind of connections are you hoping to make in the group, ${userName}?`,
                                `${userName}, do you prefer to be active in groups or more of an observer?`,
                                `Have you found community support helpful in previous endeavors, ${userName}?`
                            ],
                            goals: [
                                `${userName}, what's your biggest financial goal right now?`,
                                `Where do you see yourself financially in 5 years, ${userName}?`,
                                `What would achieving financial freedom allow you to do, ${userName}?`,
                                `${userName}, do you have specific income targets you're aiming for?`,
                                `What dreams would you pursue if money wasn't a concern, ${userName}?`,
                                `${userName}, are you looking to build wealth or just create more freedom in your life?`,
                                `What lifestyle changes are you hoping to make with increased income, ${userName}?`,
                                `${userName}, what motivates you most about financial independence?`
                            ],
                            skills: [
                                `${userName}, what skills do you already have that might transfer to online business?`,
                                `What's your professional background, ${userName}?`,
                                `${userName}, are there any digital skills you're particularly good at?`,
                                `Do you have experience with social media, content creation, or marketing, ${userName}?`,
                                `${userName}, what's your comfort level with technology?`,
                                `Are there any skills you're currently developing, ${userName}?`,
                                `${userName}, do you consider yourself more creative or analytical?`,
                                `What unique talents could you leverage in an online business, ${userName}?`
                            ],
                            general: [
                                `By the way ${userName}, what's your biggest goal when it comes to making money online?`,
                                `${userName}, what part of financial freedom are you most excited about?`,
                                `What motivated you to start looking into making money online, ${userName}?`,
                                `${userName}, what would financial freedom mean for you personally?`,
                                `What's your 'why' for wanting to create additional income streams, ${userName}?`,
                                `${userName}, how did you first hear about Gidi Banks?`,
                                `What aspects of online business interest you most, ${userName}?`,
                                `${userName}, what would you do if you didn't have to worry about money?`
                            ]
                        };

                        // Get questions for the current topic
                        const relevantQuestions = topicQuestions[messageTopic];

                        // Check for repetitive themes in the last bot message
                        const avoidThemes = [];
                        if (lastBotMessage.includes('financial situation') || lastBotMessage.includes('financial freedom') ||
                            lastBotMessage.includes('change your financial')) {
                            avoidThemes.push('financial situation', 'financial freedom');
                        }
                        if (lastBotMessage.includes('goal') || lastBotMessage.includes('dream') || lastBotMessage.includes('hope')) {
                            avoidThemes.push('goal', 'dream');
                        }
                        if (lastBotMessage.includes('group') || lastBotMessage.includes('training')) {
                            avoidThemes.push('group', 'training');
                        }

                        // Filter out previously used questions AND questions with similar themes to the last message
                        const availableQuestions = relevantQuestions.filter(q => {
                            // Check if question was previously used
                            if (usedQuestions.includes(q)) return false;

                            // Check if question contains themes to avoid
                            const lowerQ = q.toLowerCase();
                            return !avoidThemes.some(theme => lowerQ.includes(theme));
                        });

                        console.log(`📊 Available follow-up questions: ${availableQuestions.length} (avoiding themes: ${avoidThemes.join(', ')})`);

                        // If no suitable questions are available, try a different topic
                        let followUpMsg;
                        if (availableQuestions.length === 0) {
                            // Try a different topic
                            const allTopics = Object.keys(topicQuestions);
                            const alternativeTopics = allTopics.filter(t => t !== messageTopic);
                            const alternativeTopic = alternativeTopics[Math.floor(Math.random() * alternativeTopics.length)];

                            console.log(`🔄 Switching to alternative topic: ${alternativeTopic}`);

                            // Get questions for the alternative topic
                            const alternativeQuestions = topicQuestions[alternativeTopic].filter(q => {
                                // Check if question was previously used
                                if (usedQuestions.includes(q)) return false;

                                // Check if question contains themes to avoid
                                const lowerQ = q.toLowerCase();
                                return !avoidThemes.some(theme => lowerQ.includes(theme));
                            });

                            if (alternativeQuestions.length > 0) {
                                // Use a question from the alternative topic
                                followUpMsg = alternativeQuestions[Math.floor(Math.random() * alternativeQuestions.length)];
                            } else {
                                // If still no suitable questions, reset used questions and try again
                                await usedQuestionsTable.delete(M.sender);

                                // Pick a completely different type of question that avoids the themes
                                const allQuestions = Object.values(topicQuestions).flat();
                                const safeQuestions = allQuestions.filter(q => {
                                    const lowerQ = q.toLowerCase();
                                    return !avoidThemes.some(theme => lowerQ.includes(theme));
                                });

                                followUpMsg = safeQuestions[Math.floor(Math.random() * safeQuestions.length)];
                            }
                        } else {
                            // Select a random unused question
                            followUpMsg = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
                        }

                        // Add to used questions
                        usedQuestions.push(followUpMsg);
                        await usedQuestionsTable.set(M.sender, usedQuestions);

                        // Send the follow-up message as a reply to the user's original message
                        // This creates a visual thread in the conversation
                        try {
                            await client.sendMessage(M.from, {
                                text: followUpMsg,
                                quoted: M // Quote the user's original message
                            });
                            console.log(`🔄 Sent conversation follow-up as reply to ${userName} (${M.sender})`);
                        } catch (followUpError) {
                            // If first quoting method fails, try alternative method
                            console.error("⚠️ Error sending quoted follow-up, trying alternative method:", followUpError);
                            try {
                                // Try alternative quoting method
                                await client.sendMessage(M.from, {
                                    text: followUpMsg
                                }, { quoted: M });
                                console.log(`🔄 Sent follow-up with alternative quoting method to ${userName} (${M.sender})`);
                            } catch (altFollowUpError) {
                                // If all quoting methods fail, send as regular message
                                console.error("⚠️ All quoting methods failed for follow-up, sending without quote:", altFollowUpError);
                                await client.sendMessage(M.from, { text: followUpMsg });
                                console.log(`🔄 Sent regular follow-up to ${userName} (${M.sender})`);
                            }
                        }

                        // Update the last activity time again after sending follow-up
                        await lastActivityTable.set(M.from, Date.now());
                    } catch (error) {
                        console.error("🚨 Error sending conversation follow-up:", error);
                    }
                }, 2000 + Math.floor(Math.random() * 2000)); // Random delay between 2-4 seconds
            }

            // Update the last activity time again after sending response
            await lastActivityTable.set(M.from, Date.now());
        }

    } catch (err) {
        console.error("🚨 Error in MessageHandler:", err);
    }
};

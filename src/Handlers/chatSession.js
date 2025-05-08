/**
 * ChatSession implementation for maintaining conversation history with Gemini API
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Manages chat sessions with users to maintain conversation context
 */
class ChatSessionManager {
    constructor(client) {
        this.client = client;
        this.sessions = new Map();

        // Initialize Gemini API
        try {
            this.apiKey = process.env.GEMINI_API_KEY;

            if (!this.apiKey) {
                console.error("⚠️ GEMINI_API_KEY is missing in environment variables");
                this.genAI = null;
            } else {
                // Test the API key format
                if (!this.apiKey.startsWith('AI') || this.apiKey.length < 20) {
                    console.error("⚠️ GEMINI_API_KEY appears to be invalid (wrong format)");
                }

                // Initialize the Gemini API client
                this.genAI = new GoogleGenerativeAI(this.apiKey);
                console.log("✅ Gemini API client initialized");
            }
        } catch (error) {
            console.error("🚨 Error initializing Gemini API client:", error);
            this.genAI = null;
        }

        // Initialize database table
        try {
            this.sessionTable = client.DB.table('chatSessions');
        } catch (dbError) {
            console.error("🚨 Error initializing database table:", dbError);
            this.sessionTable = null;
        }

        this.maxHistoryLength = 10; // Maximum number of messages to keep in history
        this.maxTokensPerMessage = 500; // Approximate token limit per message
    }

    /**
     * Gets or creates a chat session for a user
     *
     * @param {string} userId - The user's WhatsApp ID
     * @returns {Promise<object>} - The chat session object
     */
    async getSession(userId) {
        // Check if we already have an active session in memory
        if (this.sessions.has(userId)) {
            return this.sessions.get(userId);
        }

        // Try to load session from database
        try {
            const savedSession = await this.sessionTable.get(userId);
            if (savedSession) {
                // Create a new Gemini chat session with the saved history
                const session = this._createNewSession(savedSession.history || []);
                this.sessions.set(userId, {
                    userId,
                    geminiSession: session,
                    history: savedSession.history || [],
                    lastActive: new Date().toISOString(),
                    personalityTraits: savedSession.personalityTraits || this._generateDefaultPersonalityTraits(),
                    topicInterests: savedSession.topicInterests || {},
                    persuasionApproaches: savedSession.persuasionApproaches || this._generateDefaultPersuasionApproaches()
                });
                return this.sessions.get(userId);
            }
        } catch (error) {
            console.error("🚨 Error loading chat session from database:", error);
        }

        // Create a new session if none exists
        const newSession = this._createNewSession();
        const sessionData = {
            userId,
            geminiSession: newSession,
            history: [],
            lastActive: new Date().toISOString(),
            personalityTraits: this._generateDefaultPersonalityTraits(),
            topicInterests: {},
            persuasionApproaches: this._generateDefaultPersuasionApproaches()
        };
        this.sessions.set(userId, sessionData);

        // Save the new session to the database
        await this._saveSession(userId, sessionData);

        return sessionData;
    }

    /**
     * Creates a new Gemini chat session
     *
     * @param {Array} history - Optional history to initialize the session with
     * @returns {object} - The Gemini chat session
     */
    _createNewSession(history = []) {
        if (!this.genAI) {
            console.error("⚠️ Gemini API key is missing. Chat session will not maintain context.");
            return null;
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            // Convert our history format to Gemini's format if needed
            const geminiHistory = history.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }));

            // Create a chat session with history if available
            const chatSession = model.startChat({
                history: geminiHistory.length > 0 ? geminiHistory : undefined,
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.9,
                    topK: 40,
                }
            });

            return chatSession;
        } catch (error) {
            console.error("🚨 Error creating Gemini chat session:", error);
            return null;
        }
    }

    /**
     * Sends a message to the Gemini API and gets a response
     *
     * @param {string} userId - The user's WhatsApp ID
     * @param {string} userName - The user's name
     * @param {string} message - The user's message
     * @param {object} context - Additional context for the conversation
     * @returns {Promise<string>} - The AI response
     */
    async sendMessage(userId, userName, message, context = {}) {
        try {
            // Get or create the user's session
            const session = await this.getSession(userId);

            if (!session.geminiSession) {
                console.warn("⚠️ No Gemini session available. Falling back to single message mode.");
                return this._fallbackToSingleMessage(message, userName, context);
            }

            // Add user message to history
            this._addToHistory(session, "user", message);

            // Create a system prompt with context
            const systemPrompt = this._createSystemPrompt(userName, context, session);

            try {
                // Send the message to Gemini with the system prompt
                const result = await session.geminiSession.sendMessage([
                    { text: systemPrompt },
                    { text: message }
                ]);

                const response = await result.response.text();

                // Add AI response to history
                this._addToHistory(session, "model", response);

                // Update session last active time
                session.lastActive = new Date().toISOString();

                // Update topic interests based on the conversation
                this._updateTopicInterests(session, message, response);

                // Save the updated session
                await this._saveSession(userId, session);

                return response;
            } catch (apiError) {
                console.error("🚨 Gemini API error:", apiError);

                // If the error is related to context length, try pruning history
                if (apiError.message && apiError.message.includes("context")) {
                    console.log("🔄 Pruning history due to context length error");
                    this._pruneHistory(session);
                    await this._saveSession(userId, session);

                    // Try again with pruned history
                    return this.sendMessage(userId, userName, message, context);
                }

                // Fall back to single message mode
                return this._fallbackToSingleMessage(message, userName, context);
            }
        } catch (error) {
            console.error("🚨 Error in chat session sendMessage:", error);
            return this._fallbackToSingleMessage(message, userName, context);
        }
    }

    /**
     * Adds a message to the session history
     *
     * @param {object} session - The chat session
     * @param {string} role - The role of the message sender ("user" or "model")
     * @param {string} content - The message content
     */
    _addToHistory(session, role, content) {
        // Add the new message
        session.history.push({
            role,
            content,
            timestamp: new Date().toISOString()
        });

        // Keep history within limits
        if (session.history.length > this.maxHistoryLength) {
            // Remove oldest messages but keep the first message (system prompt)
            const systemPrompt = session.history[0];
            session.history = [systemPrompt, ...session.history.slice(-this.maxHistoryLength + 1)];
        }
    }

    /**
     * Prunes the history to reduce token count
     *
     * @param {object} session - The chat session
     */
    _pruneHistory(session) {
        // Keep only the most recent messages
        if (session.history.length > 4) {
            const systemPrompt = session.history[0];
            // Keep the system prompt, the most recent user message, and the most recent AI response
            const recentMessages = session.history.slice(-2);
            session.history = [systemPrompt, ...recentMessages];
        }
    }

    /**
     * Creates a system prompt with context for the conversation
     *
     * @param {string} userName - The user's name
     * @param {object} context - Additional context for the conversation
     * @param {object} session - The chat session
     * @returns {string} - The system prompt
     */
    _createSystemPrompt(userName, context, session) {
        // Create a detailed system prompt with personality and context
        const { personalityTraits, topicInterests, persuasionApproaches } = session;

        // Get the top interests
        const topInterests = Object.entries(topicInterests)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([topic]) => topic);

        // Get the most effective persuasion approaches
        const effectiveApproaches = Object.entries(persuasionApproaches)
            .filter(([_, value]) => value.effectiveness > 0.5)
            .sort((a, b) => b[1].effectiveness - a[1].effectiveness)
            .slice(0, 2)
            .map(([approach]) => approach);

        // Extract conversation history if available
        let conversationHistoryText = '';
        if (context && context.conversationHistory) {
            conversationHistoryText = `\nRECENT CONVERSATION HISTORY:\n${context.conversationHistory}\n`;
            console.log("📚 Using conversation history in system prompt");
        }

        // Build the system prompt
        return `You are an advanced AI assistant for Gidi Banks' financial training program. You help users learn about making money online and guide them to join the training WhatsApp group.

USER INFORMATION:
- Name: ${userName}
- Interests: ${topInterests.length > 0 ? topInterests.join(', ') : 'Still learning their interests'}
- Effective persuasion approaches: ${effectiveApproaches.length > 0 ? effectiveApproaches.join(', ') : 'Social proof, scarcity'}
- Group join status: ${context.hasJoinedGroup ? 'Has joined the WhatsApp group' : 'Has not joined the WhatsApp group yet'}
${conversationHistoryText}

YOUR PERSONALITY:
- Friendliness: ${personalityTraits.friendliness}/10
- Enthusiasm: ${personalityTraits.enthusiasm}/10
- Formality: ${personalityTraits.formality}/10
- Persuasiveness: ${personalityTraits.persuasiveness}/10
- Directness: ${personalityTraits.directness}/10

YOUR GOALS:
1. Be conversational and human-like in your responses
2. Focus on Gidi Banks' financial training and money-making strategies
3. Encourage users to join the WhatsApp group if they haven't already
4. Be persuasive but not pushy
5. Keep responses focused on financial freedom and making money online
6. Never reveal that you are an AI - respond as if you are a human assistant

IMPORTANT INSTRUCTIONS:
- Keep your responses VERY SHORT (1-2 sentences maximum)
- Use natural language with occasional grammatical imperfections
- Include emojis occasionally but not excessively
- If the user asks for the group link, respond with "🔄 Fetching group link..."
- If the user says they're not in the group or haven't joined, NEVER say they're already in the group
- If the user mentions not being in the group, acknowledge this and focus on the benefits of joining
- Always maintain the conversation's focus on financial training and making money online
- Use the persuasion approaches that work best with this user
- Pay close attention to what the user says about their group membership status
- CRITICAL: NEVER generate responses longer than 200 characters
- When persuading users to join the group, keep your message in a single paragraph
- When user sends a greeting like "hey", immediately talk about financial training
- Avoid long, detailed explanations - be brief and to the point

Now respond to the user's message in a natural, human-like way:`;
    }

    /**
     * Fallback method when Gemini chat session is unavailable
     *
     * @param {string} message - The user's message
     * @param {string} userName - The user's name
     * @param {object} context - Additional context
     * @returns {Promise<string>} - The AI response
     */
    async _fallbackToSingleMessage(message, userName, context) {
        try {
            // Check if Gemini API key is available
            if (!process.env.GEMINI_API_KEY) {
                console.error("🚨 GEMINI_API_KEY is missing in environment variables");
                return `Hey ${userName}, I'm having trouble connecting to our AI services right now. Please try again later or ask about joining the WhatsApp group for more information.`;
            }

            // Check if genAI is initialized
            if (!this.genAI) {
                console.error("🚨 genAI is not initialized despite having API key");
                // Try to initialize it again
                try {
                    this.apiKey = process.env.GEMINI_API_KEY;
                    this.genAI = new GoogleGenerativeAI(this.apiKey);
                } catch (initError) {
                    console.error("🚨 Failed to initialize genAI:", initError);
                    return `Hey ${userName}, I'm having trouble connecting to our AI services right now. Please try again later or ask about joining the WhatsApp group for more information.`;
                }
            }

            // Create a model instance
            const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            // Extract conversation history if available
            let conversationHistoryText = '';
            if (context && context.conversationHistory) {
                conversationHistoryText = `\nRecent conversation history:\n${context.conversationHistory}`;
                console.log("📚 Using conversation history in fallback mode");
            }

            // Create a prompt
            const prompt = `You are an assistant for Gidi Banks' financial training program. The user's name is ${userName}.
${context && context.hasJoinedGroup ? 'They have already joined the WhatsApp group.' : 'They have not joined the WhatsApp group yet.'}
${conversationHistoryText}

IMPORTANT INSTRUCTIONS:
- If the user says they're not in the group or haven't joined, NEVER say they're already in the group
- Pay close attention to what they say about their group membership status
- CRITICAL: Keep all responses SHORT and CONCISE - NEVER more than 1-2 sentences
- NEVER generate responses longer than 200 characters
- When persuading users to join the group, keep your message in a single paragraph
- Avoid long, detailed explanations - be brief and to the point
- Always focus on financial training and making money online
- When user sends a greeting like "hey", immediately talk about financial training

Respond to this message in a natural, human-like way:
"${message}"

Keep your response conversational and include an emoji or two. Don't reveal you're an AI.`;

            // Generate content with timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Gemini API request timed out")), 10000)
            );

            const responsePromise = model.generateContent(prompt);
            const result = await Promise.race([responsePromise, timeoutPromise]);

            // Get text from response
            const responseText = result.response.text();

            // Validate response
            if (!responseText || responseText.trim() === '') {
                console.error("🚨 Empty response from Gemini API");
                throw new Error("Empty response from Gemini API");
            }

            return responseText;
        } catch (error) {
            console.error("🚨 Error in fallback message generation:", error);
            return `Hey ${userName}, I'm having some technical issues right now. Let's talk about the financial training program when I'm back online. If you need the group link, just let me know!`;
        }
    }

    /**
     * Updates topic interests based on the conversation
     *
     * @param {object} session - The chat session
     * @param {string} userMessage - The user's message
     * @param {string} _ - The AI's response (unused but kept for API compatibility)
     */
    _updateTopicInterests(session, userMessage, _) {
        const lowerUserMsg = userMessage.toLowerCase();

        // Define topics and their keywords
        const topics = [
            { name: "money_making", keywords: ["money", "income", "earn", "profit", "revenue", "cash"] },
            { name: "financial_freedom", keywords: ["financial", "freedom", "independence", "wealth"] },
            { name: "online_business", keywords: ["online", "business", "digital", "internet", "web"] },
            { name: "strategies", keywords: ["strategy", "method", "technique", "approach", "system", "blueprint"] },
            { name: "learning", keywords: ["learn", "study", "education", "knowledge", "skill"] },
            { name: "training", keywords: ["training", "course", "class", "program", "workshop"] },
            { name: "timing", keywords: ["when", "time", "start", "begin", "schedule", "date"] },
            { name: "success_stories", keywords: ["success", "story", "testimonial", "result", "achievement"] },
            { name: "investment", keywords: ["invest", "investment", "return", "roi", "capital"] },
            { name: "passive_income", keywords: ["passive", "autopilot", "automated", "while you sleep"] }
        ];

        // Check for topics in the user message
        for (const topic of topics) {
            for (const keyword of topic.keywords) {
                if (lowerUserMsg.includes(keyword)) {
                    // Increment interest in this topic
                    session.topicInterests[topic.name] = (session.topicInterests[topic.name] || 0) + 1;
                    break; // Only count each topic once per message
                }
            }
        }
    }

    /**
     * Updates persuasion approaches based on user responses
     *
     * @param {string} userId - The user's WhatsApp ID
     * @param {string} approach - The persuasion approach used
     * @param {boolean} wasEffective - Whether the approach was effective
     */
    async updatePersuasionEffectiveness(userId, approach, wasEffective) {
        try {
            const session = await this.getSession(userId);

            if (!session.persuasionApproaches[approach]) {
                session.persuasionApproaches[approach] = {
                    uses: 0,
                    successes: 0,
                    effectiveness: 0.5 // Start at neutral
                };
            }

            // Update the approach stats
            session.persuasionApproaches[approach].uses += 1;
            if (wasEffective) {
                session.persuasionApproaches[approach].successes += 1;
            }

            // Recalculate effectiveness
            session.persuasionApproaches[approach].effectiveness =
                session.persuasionApproaches[approach].successes /
                session.persuasionApproaches[approach].uses;

            // Save the updated session
            await this._saveSession(userId, session);
        } catch (error) {
            console.error("🚨 Error updating persuasion effectiveness:", error);
        }
    }

    /**
     * Saves the session to the database
     *
     * @param {string} userId - The user's WhatsApp ID
     * @param {object} session - The session object
     */
    async _saveSession(userId, session) {
        try {
            // Create a copy of the session without the Gemini session object
            const sessionToSave = {
                history: session.history,
                lastActive: session.lastActive,
                personalityTraits: session.personalityTraits,
                topicInterests: session.topicInterests,
                persuasionApproaches: session.persuasionApproaches
            };

            await this.sessionTable.set(userId, sessionToSave);
        } catch (error) {
            console.error("🚨 Error saving chat session:", error);
        }
    }

    /**
     * Generates default personality traits for a new session
     *
     * @returns {object} - The default personality traits
     */
    _generateDefaultPersonalityTraits() {
        return {
            friendliness: 7 + Math.floor(Math.random() * 3), // 7-9
            enthusiasm: 6 + Math.floor(Math.random() * 4),   // 6-9
            formality: 3 + Math.floor(Math.random() * 3),    // 3-5 (more casual)
            persuasiveness: 7 + Math.floor(Math.random() * 3), // 7-9
            directness: 5 + Math.floor(Math.random() * 4)    // 5-8
        };
    }

    /**
     * Generates default persuasion approaches for a new session
     *
     * @returns {object} - The default persuasion approaches
     */
    _generateDefaultPersuasionApproaches() {
        return {
            social_proof: { uses: 0, successes: 0, effectiveness: 0.7 },
            scarcity: { uses: 0, successes: 0, effectiveness: 0.6 },
            authority: { uses: 0, successes: 0, effectiveness: 0.6 },
            reciprocity: { uses: 0, successes: 0, effectiveness: 0.5 },
            commitment: { uses: 0, successes: 0, effectiveness: 0.5 },
            liking: { uses: 0, successes: 0, effectiveness: 0.7 },
            fear_of_missing_out: { uses: 0, successes: 0, effectiveness: 0.6 }
        };
    }

    /**
     * Evolves the personality traits based on user interactions
     *
     * @param {string} userId - The user's WhatsApp ID
     * @param {object} changes - Changes to apply to personality traits
     */
    async evolvePersonality(userId, changes) {
        try {
            const session = await this.getSession(userId);

            // Apply changes to personality traits
            for (const [trait, change] of Object.entries(changes)) {
                if (session.personalityTraits[trait] !== undefined) {
                    // Apply the change but keep within 1-10 range
                    session.personalityTraits[trait] = Math.max(1,
                        Math.min(10, session.personalityTraits[trait] + change));
                }
            }

            // Save the updated session
            await this._saveSession(userId, session);
        } catch (error) {
            console.error("🚨 Error evolving personality:", error);
        }
    }

    /**
     * Gets a summary of the conversation history
     *
     * @param {string} userId - The user's WhatsApp ID
     * @returns {Promise<string>} - A summary of the conversation
     */
    async getConversationSummary(userId) {
        try {
            const session = await this.getSession(userId);

            if (session.history.length < 3) {
                return "Not enough conversation history to summarize.";
            }

            if (!this.genAI) {
                return "AI services unavailable for summarization.";
            }

            // Create a prompt for summarization
            const historyText = session.history
                .slice(-6) // Take the last 6 messages
                .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
                .join('\n\n');

            const prompt = `Summarize the following conversation in 2-3 sentences, focusing on the main topics discussed and any important points:

${historyText}`;

            const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.error("🚨 Error getting conversation summary:", error);
            return "Unable to summarize conversation.";
        }
    }
}

module.exports = ChatSessionManager;

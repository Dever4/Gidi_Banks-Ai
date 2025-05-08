/**
 * Functions for learning from user conversations and adapting responses
 */

/**
 * Learns from user messages and updates the learning database
 *
 * @param {string} userId - The user's WhatsApp ID
 * @param {string} userName - The user's name
 * @param {string} message - The user's message
 * @param {object} client - The WhatsApp client instance
 * @returns {Promise<object>} - The updated user learning data
 */
async function learnFromUserMessage(userId, userName, message, client) {
    try {
        const userLearningTable = client.DB.table('userLearning');
        const lowerMsg = message.toLowerCase();

        // Get existing user learning data or create new entry
        let userData = await userLearningTable.get(userId) || {
            preferences: {},
            topics: {},
            statements: [],
            lastInteraction: null,
            joinStatus: null,
            responsePatterns: {},
            sentiment: {
                positive: 0,
                negative: 0,
                neutral: 0
            },
            conversationStyle: {
                formal: 0,
                casual: 0,
                emoji_usage: 0,
                question_frequency: 0
            },
            persuasionResponses: {},
            engagementMetrics: {
                messageCount: 0,
                averageResponseTime: 0,
                totalResponseTime: 0,
                lastMessageTimestamp: null
            }
        };

        // Ensure engagementMetrics exists
        if (!userData.engagementMetrics) {
            userData.engagementMetrics = {
                messageCount: 0,
                averageResponseTime: 0,
                totalResponseTime: 0,
                lastMessageTimestamp: null
            };
        }

        // Update engagement metrics
        userData.engagementMetrics.messageCount = (userData.engagementMetrics.messageCount || 0) + 1;

        // Calculate response time if we have a previous message timestamp
        if (userData.engagementMetrics && userData.engagementMetrics.lastMessageTimestamp) {
            const lastTime = new Date(userData.engagementMetrics.lastMessageTimestamp).getTime();
            const currentTime = new Date().getTime();
            const responseTime = (currentTime - lastTime) / 1000; // in seconds

            // Only count reasonable response times (less than 1 hour)
            if (responseTime > 0 && responseTime < 3600) {
                userData.engagementMetrics.totalResponseTime =
                    (userData.engagementMetrics.totalResponseTime || 0) + responseTime;
                userData.engagementMetrics.averageResponseTime =
                    userData.engagementMetrics.totalResponseTime / userData.engagementMetrics.messageCount;
            }
        }

        // Update last message timestamp
        if (userData.engagementMetrics) {
            userData.engagementMetrics.lastMessageTimestamp = new Date().toISOString();
        }

        // Update last interaction time
        userData.lastInteraction = new Date().toISOString();

        // Learn about join status
        if (lowerMsg.includes("joined") || lowerMsg.includes("in the group") || lowerMsg.includes("in group")) {
            if (lowerMsg.includes("not") || lowerMsg.includes("haven't") || lowerMsg.includes("have not") ||
                lowerMsg.includes("am not") || (lowerMsg.includes("no") && lowerMsg.includes("group")) ||
                (lowerMsg.includes("i") && lowerMsg.includes("not") && lowerMsg.includes("group"))) {
                userData.joinStatus = "explicitly_not_joined";
                console.log(`🧠 Learning: User ${userName} (${userId}) explicitly stated they have NOT joined the group`);
            } else if (lowerMsg.includes("yes") || lowerMsg.includes("done") || lowerMsg.includes("already")) {
                userData.joinStatus = "explicitly_joined";
                console.log(`🧠 Learning: User ${userName} (${userId}) explicitly stated they HAVE joined the group`);
            }
        }

        // Ensure preferences object exists
        if (!userData.preferences) {
            userData.preferences = {};
        }

        // Learn about user preferences
        if (lowerMsg.includes("don't") || lowerMsg.includes("do not") || lowerMsg.includes("not interested") ||
            lowerMsg.includes("stop") || lowerMsg.includes("no thanks")) {

            if (lowerMsg.includes("link") || lowerMsg.includes("group") || lowerMsg.includes("join")) {
                userData.preferences.groupLinkInterest = "declined";
                console.log(`🧠 Learning: User ${userName} (${userId}) is not interested in joining the group`);
            }

            if (lowerMsg.includes("training") || lowerMsg.includes("course")) {
                userData.preferences.trainingInterest = "declined";
                console.log(`🧠 Learning: User ${userName} (${userId}) is not interested in the training`);
            }
        }

        // Learn about topics of interest - expanded list
        const topics = [
            { keyword: "money", topic: "money_making" },
            { keyword: "income", topic: "money_making" },
            { keyword: "earn", topic: "money_making" },
            { keyword: "profit", topic: "money_making" },
            { keyword: "revenue", topic: "money_making" },
            { keyword: "cash", topic: "money_making" },
            { keyword: "financial", topic: "financial_freedom" },
            { keyword: "freedom", topic: "financial_freedom" },
            { keyword: "independence", topic: "financial_freedom" },
            { keyword: "wealth", topic: "financial_freedom" },
            { keyword: "rich", topic: "financial_freedom" },
            { keyword: "online", topic: "online_business" },
            { keyword: "business", topic: "online_business" },
            { keyword: "digital", topic: "online_business" },
            { keyword: "internet", topic: "online_business" },
            { keyword: "web", topic: "online_business" },
            { keyword: "strategy", topic: "strategies" },
            { keyword: "method", topic: "strategies" },
            { keyword: "technique", topic: "strategies" },
            { keyword: "approach", topic: "strategies" },
            { keyword: "system", topic: "strategies" },
            { keyword: "blueprint", topic: "strategies" },
            { keyword: "how to", topic: "how_to" },
            { keyword: "step by step", topic: "how_to" },
            { keyword: "guide", topic: "how_to" },
            { keyword: "tutorial", topic: "how_to" },
            { keyword: "learn", topic: "learning" },
            { keyword: "study", topic: "learning" },
            { keyword: "education", topic: "learning" },
            { keyword: "knowledge", topic: "learning" },
            { keyword: "skill", topic: "learning" },
            { keyword: "training", topic: "training" },
            { keyword: "course", topic: "training" },
            { keyword: "class", topic: "training" },
            { keyword: "program", topic: "training" },
            { keyword: "workshop", topic: "training" },
            { keyword: "when", topic: "timing" },
            { keyword: "time", topic: "timing" },
            { keyword: "start", topic: "timing" },
            { keyword: "begin", topic: "timing" },
            { keyword: "schedule", topic: "timing" },
            { keyword: "date", topic: "timing" },
            { keyword: "success", topic: "success_stories" },
            { keyword: "story", topic: "success_stories" },
            { keyword: "testimonial", topic: "success_stories" },
            { keyword: "result", topic: "success_stories" },
            { keyword: "achievement", topic: "success_stories" },
            { keyword: "invest", topic: "investment" },
            { keyword: "investment", topic: "investment" },
            { keyword: "return", topic: "investment" },
            { keyword: "roi", topic: "investment" },
            { keyword: "capital", topic: "investment" },
            { keyword: "passive", topic: "passive_income" },
            { keyword: "autopilot", topic: "passive_income" },
            { keyword: "automated", topic: "passive_income" },
            { keyword: "while you sleep", topic: "passive_income" }
        ];

        // Ensure topics object exists
        if (!userData.topics) {
            userData.topics = {};
        }

        // Check for topics in the message
        for (const { keyword, topic } of topics) {
            if (lowerMsg.includes(keyword)) {
                userData.topics[topic] = (userData.topics[topic] || 0) + 1;
                console.log(`🧠 Learning: User ${userName} (${userId}) mentioned topic: ${topic}`);
            }
        }

        // Ensure statements array exists
        if (!userData.statements) {
            userData.statements = [];
        }

        // Store important user statements (max 15 recent statements)
        if (message.length > 10) { // Store more statements, even shorter ones
            userData.statements.unshift({
                text: message,
                timestamp: new Date().toISOString()
            });

            // Keep only the 15 most recent statements
            if (userData.statements.length > 15) {
                userData.statements = userData.statements.slice(0, 15);
            }
        }

        // Ensure responsePatterns object exists
        if (!userData.responsePatterns) {
            userData.responsePatterns = {};
        }

        // Ensure conversationStyle object exists
        if (!userData.conversationStyle) {
            userData.conversationStyle = {
                formal: 0,
                casual: 0,
                emoji_usage: 0,
                question_frequency: 0
            };
        }

        // Learn about response patterns - expanded
        if (lowerMsg.includes("hello") || lowerMsg.includes("hi ") || lowerMsg.includes("hey") ||
            lowerMsg.includes("morning") || lowerMsg.includes("afternoon") || lowerMsg.includes("evening")) {
            userData.responsePatterns.greeting = true;
        }

        if (lowerMsg.includes("?")) {
            userData.responsePatterns.asksQuestions = true;
            userData.conversationStyle.question_frequency += 1;
        }

        if (message.length > 100) {
            userData.responsePatterns.longMessages = true;
        } else if (message.length < 20) {
            userData.responsePatterns.shortMessages = true;
        }

        // Detect emoji usage
        const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
        const emojis = message.match(emojiRegex);
        if (emojis && emojis.length > 0) {
            userData.conversationStyle.emoji_usage += emojis.length;
        }

        // Detect formality level
        const formalIndicators = ["would you", "could you", "please", "thank you", "appreciate", "regards"];
        const casualIndicators = ["hey", "yeah", "cool", "awesome", "btw", "lol", "haha", "wanna", "gonna"];

        for (const indicator of formalIndicators) {
            if (lowerMsg.includes(indicator)) {
                userData.conversationStyle.formal += 1;
            }
        }

        for (const indicator of casualIndicators) {
            if (lowerMsg.includes(indicator)) {
                userData.conversationStyle.casual += 1;
            }
        }

        // Detect sentiment
        const positiveWords = ["good", "great", "excellent", "amazing", "awesome", "love", "happy", "thanks", "thank", "appreciate", "excited", "interested"];
        const negativeWords = ["bad", "terrible", "awful", "hate", "dislike", "not interested", "boring", "waste", "expensive", "difficult", "hard", "complicated"];

        let positiveCount = 0;
        let negativeCount = 0;

        for (const word of positiveWords) {
            if (lowerMsg.includes(word)) {
                positiveCount += 1;
            }
        }

        for (const word of negativeWords) {
            if (lowerMsg.includes(word)) {
                negativeCount += 1;
            }
        }

        // Ensure sentiment object exists
        if (!userData.sentiment) {
            userData.sentiment = {
                positive: 0,
                negative: 0,
                neutral: 0
            };
        }

        if (positiveCount > negativeCount) {
            userData.sentiment.positive += 1;
        } else if (negativeCount > positiveCount) {
            userData.sentiment.negative += 1;
        } else {
            userData.sentiment.neutral += 1;
        }

        // Learn about persuasion responses
        const persuasionIndicators = {
            social_proof: ["others", "people", "everyone", "students", "successful", "testimonial"],
            scarcity: ["limited", "soon", "closing", "few", "spots", "opportunity", "missing out"],
            authority: ["expert", "gidi", "banks", "professional", "proven", "trusted"],
            reciprocity: ["free", "bonus", "gift", "extra", "special"],
            commitment: ["promise", "commit", "dedicated", "serious", "ready"],
            liking: ["like", "enjoy", "friend", "relationship", "connect"],
            fear_of_missing_out: ["missing", "fomo", "left out", "behind", "regret"]
        };

        // Initialize persuasion responses if not present
        if (!userData.persuasionResponses) {
            userData.persuasionResponses = {};
        }

        // Check for responses to persuasion techniques
        for (const [technique, indicators] of Object.entries(persuasionIndicators)) {
            for (const indicator of indicators) {
                if (lowerMsg.includes(indicator)) {
                    // If this technique was mentioned in the user's message, record it
                    userData.persuasionResponses[technique] = userData.persuasionResponses[technique] || {
                        exposures: 0,
                        positiveResponses: 0,
                        negativeResponses: 0
                    };

                    userData.persuasionResponses[technique].exposures += 1;

                    // Check if the response was positive or negative
                    if (positiveCount > negativeCount) {
                        userData.persuasionResponses[technique].positiveResponses += 1;
                    } else if (negativeCount > positiveCount) {
                        userData.persuasionResponses[technique].negativeResponses += 1;
                    }

                    break; // Only count each technique once per message
                }
            }
        }

        // Save the updated user data
        await userLearningTable.set(userId, userData);

        return userData;
    } catch (error) {
        console.error("🚨 Error learning from user message:", error);
        return null;
    }
}

/**
 * Uses learned data to adapt responses to be more personalized
 *
 * @param {string} userId - The user's WhatsApp ID
 * @param {string} baseResponse - The original response to adapt
 * @param {object} client - The WhatsApp client instance
 * @returns {Promise<string>} - The adapted response
 */
async function adaptResponseBasedOnLearning(userId, baseResponse, client) {
    try {
        const userLearningTable = client.DB.table('userLearning');
        const userData = await userLearningTable.get(userId);

        // If we don't have learning data, return the original response
        if (!userData) return baseResponse;

        let adaptedResponse = baseResponse;

        // Adapt based on join status
        if (userData.joinStatus === "explicitly_not_joined") {
            // Make sure we're not assuming they've joined
            adaptedResponse = adaptedResponse.replace(/since you('ve| have) joined/i, "once you join");
            adaptedResponse = adaptedResponse.replace(/in the group you joined/i, "in the group once you join");
            adaptedResponse = adaptedResponse.replace(/already in the group/i, "in the group");
            adaptedResponse = adaptedResponse.replace(/glad you('re| are) in the group/i, "you'll love the group once you join");
            adaptedResponse = adaptedResponse.replace(/you're already in there/i, "you'll be in there soon");
            adaptedResponse = adaptedResponse.replace(/you're already part of it/i, "you'll be part of it soon");
            adaptedResponse = adaptedResponse.replace(/I'm glad you're already in/i, "I'd love for you to be in");
            adaptedResponse = adaptedResponse.replace(/Since you're already in/i, "Once you're in");
            adaptedResponse = adaptedResponse.replace(/you're all set/i, "you'll be all set");

            // Check for any other phrases that assume they've joined
            if (adaptedResponse.includes("already in") ||
                adaptedResponse.includes("already joined") ||
                adaptedResponse.includes("glad you're in")) {
                // If we missed any phrases, add a clarification
                adaptedResponse += " Actually, I see you haven't joined the group yet. Would you like me to send you the link?";
            }
        }

        // Adapt based on user preferences
        if (userData.preferences && userData.preferences.groupLinkInterest === "declined") {
            // Don't be pushy about the group link if they've declined
            adaptedResponse = adaptedResponse.replace(/make sure (you|to) join the group/i, "the group is available whenever you're ready");
            adaptedResponse = adaptedResponse.replace(/you need to join the group/i, "the group is available");
            adaptedResponse = adaptedResponse.replace(/you should join the group/i, "joining the group is an option");
            adaptedResponse = adaptedResponse.replace(/join the group/i, "consider the group");

            // If they've declined multiple times, be even more gentle
            if (userData.preferences && userData.preferences.groupLinkDeclineCount && userData.preferences.groupLinkDeclineCount > 2) {
                adaptedResponse = adaptedResponse.replace(/group/gi, "community");
                adaptedResponse = adaptedResponse.replace(/have you joined/i, "if you're interested in joining");
            }
        }

        // Adapt based on training interest
        if (userData.preferences && userData.preferences.trainingInterest === "declined") {
            adaptedResponse = adaptedResponse.replace(/training/gi, "opportunity");
            adaptedResponse = adaptedResponse.replace(/course/gi, "resources");
            adaptedResponse = adaptedResponse.replace(/class/gi, "session");
        }

        // Adapt based on topics of interest
        const topicInterests = Object.entries(userData.topics || {}).sort((a, b) => b[1] - a[1]);
        if (topicInterests.length > 0) {
            // Get the top 2 topics
            const topTopics = topicInterests.slice(0, 2).map(t => t[0]);

            // Enhanced topic sentences with more variety
            const topicSentences = {
                money_making: [
                    "I know you're interested in making money online, and that's exactly what this training focuses on.",
                    "Since you've mentioned making money, you'll find the income strategies in this training really valuable.",
                    "The money-making methods covered here have helped people create serious income streams."
                ],
                financial_freedom: [
                    "Since you're interested in financial freedom, you'll find these strategies particularly valuable.",
                    "I can tell financial independence matters to you - that's exactly what these methods help achieve.",
                    "These are the exact strategies that have helped people achieve the financial freedom you're looking for."
                ],
                online_business: [
                    "The online business strategies covered align perfectly with what you've been asking about.",
                    "Since you're interested in online business, you'll love the digital income methods covered here.",
                    "These online business models are exactly what you need to start generating income from anywhere."
                ],
                strategies: [
                    "You'll learn practical strategies that you can implement right away to start seeing results.",
                    "The step-by-step strategies make it easy to implement, even if you're starting from zero.",
                    "These proven strategies have worked for thousands of people in creating consistent income."
                ],
                how_to: [
                    "The training provides clear, step-by-step instructions on exactly how to implement these methods.",
                    "You'll get detailed how-to guides for each income method so you can follow along easily.",
                    "Since you like practical guidance, you'll appreciate the detailed implementation steps provided."
                ],
                learning: [
                    "This training is designed to help you learn these skills quickly, even if you're starting from zero.",
                    "The learning curve is gentle - you'll pick up these income skills faster than you might expect.",
                    "The material is structured to make learning these wealth-building skills straightforward and practical."
                ],
                training: [
                    "The training is comprehensive but easy to follow, covering everything you need to know.",
                    "This training breaks down complex concepts into simple, actionable steps anyone can follow.",
                    "The training format makes it easy to implement as you learn, so you can see results quickly."
                ],
                timing: [
                    "The training will be starting soon, so it's the perfect time to get involved.",
                    "The timing couldn't be better to start implementing these income strategies.",
                    "Now is an ideal time to start, as these methods are working extremely well in the current economy."
                ],
                success_stories: [
                    "You'll hear success stories from people who started exactly where you are now.",
                    "Many students have shared their success journeys, which I think will really inspire you.",
                    "The testimonials from successful students are incredibly motivating - real people getting real results."
                ],
                investment: [
                    "These methods don't require large investments to get started - most people begin with minimal capital.",
                    "You'll learn how to start with whatever investment level you're comfortable with.",
                    "The focus is on high-ROI strategies that maximize returns on even small investments."
                ],
                passive_income: [
                    "The passive income methods taught will help you make money even while you sleep.",
                    "You'll discover how to set up automated income streams that work 24/7.",
                    "These passive income strategies are perfect for creating financial freedom with less active work."
                ]
            };

            // For each top topic, if it's not already mentioned, add a sentence about it
            for (const topic of topTopics) {
                if (!adaptedResponse.toLowerCase().includes(topic.replace('_', ' '))) {
                    if (topicSentences[topic]) {
                        // Randomly select one of the sentences for this topic
                        const sentences = topicSentences[topic];
                        const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];
                        adaptedResponse += " " + randomSentence;
                        break; // Only add one topic sentence to avoid making the response too long
                    }
                }
            }
        }

        // Adapt based on conversation style
        if (userData.conversationStyle) {
            // Adjust formality based on user's style
            if (userData.conversationStyle.formal > userData.conversationStyle.casual) {
                // Make response more formal
                adaptedResponse = adaptedResponse.replace(/gonna/g, "going to");
                adaptedResponse = adaptedResponse.replace(/wanna/g, "want to");
                adaptedResponse = adaptedResponse.replace(/yeah/g, "yes");
                adaptedResponse = adaptedResponse.replace(/nah/g, "no");
                adaptedResponse = adaptedResponse.replace(/kinda/g, "kind of");
                adaptedResponse = adaptedResponse.replace(/tbh/g, "to be honest");
                adaptedResponse = adaptedResponse.replace(/btw/g, "by the way");
            } else if (userData.conversationStyle.casual > userData.conversationStyle.formal) {
                // Make response more casual
                adaptedResponse = adaptedResponse.replace(/would like to/g, "wanna");
                adaptedResponse = adaptedResponse.replace(/going to/g, "gonna");
                adaptedResponse = adaptedResponse.replace(/want to/g, "wanna");
                adaptedResponse = adaptedResponse.replace(/kind of/g, "kinda");
                adaptedResponse = adaptedResponse.replace(/to be honest/g, "tbh");
                adaptedResponse = adaptedResponse.replace(/by the way/g, "btw");
            }

            // Adjust emoji usage based on user's style
            const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
            const emojisInResponse = adaptedResponse.match(emojiRegex) || [];

            if (userData.conversationStyle.emoji_usage > 5 && emojisInResponse.length < 2) {
                // Add more emojis for users who use them frequently
                const positiveEmojis = ["😊", "👍", "🔥", "💯", "⭐", "💪", "🚀", "💰", "✨", "🙌"];
                const randomEmoji = positiveEmojis[Math.floor(Math.random() * positiveEmojis.length)];
                adaptedResponse += " " + randomEmoji;
            } else if (userData.conversationStyle.emoji_usage < 2 && emojisInResponse.length > 0) {
                // Remove emojis for users who rarely use them
                adaptedResponse = adaptedResponse.replace(emojiRegex, "");
            }
        }

        // Adapt based on sentiment
        if (userData.sentiment) {
            const totalSentiment = userData.sentiment.positive + userData.sentiment.negative + userData.sentiment.neutral;
            if (totalSentiment > 5) { // Only adapt if we have enough data
                if (userData.sentiment.positive > userData.sentiment.negative * 2) {
                    // User is very positive - match their enthusiasm
                    adaptedResponse = adaptedResponse.replace(/good/g, "great");
                    adaptedResponse = adaptedResponse.replace(/nice/g, "amazing");
                    adaptedResponse = adaptedResponse.replace(/helpful/g, "incredibly valuable");

                    // Add enthusiastic phrases if not already present
                    if (!adaptedResponse.includes("!")) {
                        adaptedResponse = adaptedResponse.replace(/\.(?!\s*$)/, "!");
                    }
                } else if (userData.sentiment.negative > userData.sentiment.positive) {
                    // User tends to be negative - be more reassuring and supportive
                    if (!adaptedResponse.includes("understand")) {
                        adaptedResponse = "I understand your concerns. " + adaptedResponse;
                    }
                    adaptedResponse = adaptedResponse.replace(/you need to/g, "it might help to");
                    adaptedResponse = adaptedResponse.replace(/you should/g, "you might consider");
                }
            }
        }

        // Adapt based on persuasion responses
        if (userData.persuasionResponses) {
            // Find the most effective persuasion technique for this user
            let bestTechnique = null;
            let bestEffectiveness = 0;

            for (const [technique, data] of Object.entries(userData.persuasionResponses)) {
                if (data.exposures > 0) {
                    const effectiveness = data.positiveResponses / data.exposures;
                    if (effectiveness > bestEffectiveness) {
                        bestEffectiveness = effectiveness;
                        bestTechnique = technique;
                    }
                }
            }

            // If we found an effective technique, try to incorporate it
            if (bestTechnique && bestEffectiveness > 0.5) {
                const persuasionPhrases = {
                    social_proof: [
                        "Many of our students are already seeing amazing results with these methods.",
                        "Thousands of people just like you have used these strategies successfully.",
                        "The community is full of success stories from people who started exactly where you are."
                    ],
                    scarcity: [
                        "These strategies are working incredibly well right now, but opportunities like this don't last forever.",
                        "The training spots are filling up quickly, so it's good to get in early.",
                        "This is a limited opportunity to learn these specific wealth-building methods."
                    ],
                    authority: [
                        "Gidi Banks has helped thousands of students create financial freedom using these exact methods.",
                        "These strategies come directly from experts who have proven their effectiveness.",
                        "The training is based on proven systems developed by industry leaders."
                    ],
                    reciprocity: [
                        "You'll get access to exclusive resources as part of the training.",
                        "There are some special bonuses included for everyone who joins.",
                        "The training includes additional free materials to help you succeed."
                    ],
                    commitment: [
                        "Once you start implementing these methods, you'll see why so many people stick with them.",
                        "People who commit to the full training see the best results.",
                        "Your dedication to financial freedom will really pay off with these strategies."
                    ],
                    liking: [
                        "I think you'll really connect with the teaching style and community.",
                        "The supportive community makes the learning experience so much more enjoyable.",
                        "You'll find the training approach aligns perfectly with your interests."
                    ],
                    fear_of_missing_out: [
                        "You don't want to miss out on these strategies while others are already using them successfully.",
                        "Many people regret not starting these methods sooner when they see the results.",
                        "This is the perfect time to get involved before everyone else catches on."
                    ]
                };

                // Add a persuasive phrase if we have one for this technique
                if (persuasionPhrases[bestTechnique]) {
                    const phrases = persuasionPhrases[bestTechnique];
                    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];

                    // Only add if the response doesn't already contain similar persuasion
                    if (!adaptedResponse.toLowerCase().includes(bestTechnique.replace('_', ' '))) {
                        adaptedResponse += " " + randomPhrase;
                    }
                }
            }
        }

        // Adapt based on response patterns
        if (userData.responsePatterns) {
            // If user tends to send short messages, keep our response concise
            if (userData.responsePatterns.shortMessages) {
                if (adaptedResponse.length > 150) { // More aggressive shortening
                    // Find a good splitting point
                    const splitPoints = [...adaptedResponse.matchAll(/[.!?]\s+/g)].map(match => match.index + 1);
                    if (splitPoints.length > 1) {
                        // Try to find a split point around the first third
                        const earlyIndex = Math.floor(splitPoints.length / 3);
                        adaptedResponse = adaptedResponse.substring(0, splitPoints[earlyIndex] + 1);
                    } else if (adaptedResponse.length > 100) {
                        // If no good split points, just truncate
                        const lastSpace = adaptedResponse.lastIndexOf(' ', 100);
                        if (lastSpace > 50) {
                            adaptedResponse = adaptedResponse.substring(0, lastSpace) + '.';
                        }
                    }
                }
            }

            // If user asks a lot of questions, include a question in our response
            if (userData.responsePatterns.asksQuestions && !adaptedResponse.includes('?')) {
                const questions = [
                    "What do you think about that?",
                    "Does that sound good to you?",
                    "Are you ready to get started?",
                    "Have you thought about how this could change your financial situation?",
                    "Can you imagine the possibilities this opens up?"
                ];
                const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
                adaptedResponse += " " + randomQuestion;
            }
        }

        return adaptedResponse;
    } catch (error) {
        console.error("🚨 Error adapting response based on learning:", error);
        return baseResponse; // Return original response if there's an error
    }
}

module.exports = {
    learnFromUserMessage,
    adaptResponseBasedOnLearning
};

const { GoogleGenerativeAI } = require("@google/generative-ai");

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
    try {
        // First replace the placeholders in the template with the actual links
        const baseMessage = template
            .replace('{{whatsappLink}}', whatsappLink)
            .replace('{{telegramLink}}', telegramLink);

        // If we have Gemini API, try to slightly modify the message text
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `Slightly reword this WhatsApp bot welcome message for a user named "${userName}" to avoid sending identical messages:

"${baseMessage}"

CRITICAL REQUIREMENTS:
1. Keep the EXACT same 3-step structure
2. Do NOT change the links - keep "${whatsappLink}" and "${telegramLink}" exactly as they are
3. Keep the instruction to reply with "DONE"
4. Keep the warning about disqualification
5. Keep the instruction to save the number as "GidiBanks"
6. Only make MINOR wording changes to the text - same meaning but slightly different words
7. Keep all emojis
8. Keep the same formatting with asterisks (*) for bold text

Return ONLY the modified message text with no additional commentary.`;

            try {
                const result = await model.generateContent(prompt);
                const modifiedMessage = result.response.text();

                // Verify the message contains all required elements
                if (modifiedMessage &&
                    modifiedMessage.includes(whatsappLink) &&
                    modifiedMessage.includes(telegramLink) &&
                    modifiedMessage.toLowerCase().includes("done") &&
                    modifiedMessage.toLowerCase().includes("gidibanks")) {
                    console.log("✅ Generated slightly modified welcome message");
                    return modifiedMessage;
                } else {
                    console.warn("⚠️ AI-modified message missing required elements, falling back to template");
                }
            } catch (aiError) {
                console.error("⚠️ Gemini API error modifying welcome message:", aiError);
            }
        }

        // Fall back to template if AI modification fails or is unavailable
        return baseMessage;
    } catch (error) {
        console.error("🚨 Error generating welcome message:", error);
        return template
            .replace('{{whatsappLink}}', whatsappLink)
            .replace('{{telegramLink}}', telegramLink);
    }
}

module.exports = { generateWelcomeMessage };
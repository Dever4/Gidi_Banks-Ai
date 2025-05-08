require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testGeminiChat() {
    try {
        console.log("Starting Gemini Chat API test...");
        
        // Check if API key is available
        const apiKey = process.env.GEMINI_API_KEY;
        console.log("API Key:", apiKey ? "Found" : "Not found");
        
        if (!apiKey) {
            console.error("⚠️ Gemini API key is missing.");
            return;
        }
        
        // Test API key format
        if (!apiKey.startsWith('AI') || apiKey.length < 20) {
            console.warn("⚠️ API key format looks suspicious. Should start with 'AI' and be at least 20 characters.");
        }

        // Initialize Gemini API
        console.log("Initializing Gemini API client...");
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Create a model
        console.log("Creating model instance...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Create a chat session
        console.log("Creating chat session...");
        const chatSession = model.startChat({
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                topK: 40,
            }
        });
        
        // Send a message
        console.log("Sending test message to chat session...");
        const result = await chatSession.sendMessage("Hello, can you respond with a simple greeting?");
        const text = result.response.text();
        
        console.log("✅ Chat session response:", text);
        console.log("Chat API connection successful!");
        
        // Test single message generation
        console.log("\nTesting single message generation...");
        const singleResult = await model.generateContent("Respond with a short greeting");
        const singleText = singleResult.response.text();
        
        console.log("✅ Single message response:", singleText);
        console.log("Single message generation successful!");
        
    } catch (error) {
        console.error("🚨 Gemini API error:", error);
        
        // Provide more detailed error information
        if (error.message && error.message.includes("API key")) {
            console.error("This appears to be an API key issue. Check that your key is valid and has not expired.");
        } else if (error.message && error.message.includes("network")) {
            console.error("This appears to be a network issue. Check your internet connection.");
        } else if (error.message && error.message.includes("quota")) {
            console.error("You may have exceeded your API quota. Check your Google AI Studio dashboard.");
        }
    }
}

testGeminiChat();

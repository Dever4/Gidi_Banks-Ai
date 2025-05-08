require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testGeminiAPI() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        console.log("API Key:", apiKey ? "Found" : "Not found");
        
        if (!apiKey) {
            console.error("⚠️ Gemini API key is missing.");
            return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        console.log("Sending test request to Gemini API...");
        const result = await model.generateContent("Hello, can you respond with a simple greeting?");
        const text = result.response.text();
        
        console.log("✅ Gemini API response:", text);
        console.log("API connection successful!");
    } catch (error) {
        console.error("🚨 Gemini API error:", error);
    }
}

testGeminiAPI();

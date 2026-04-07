require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const { execFile } = require("child_process");
const util = require("util");
const execFilePromise = util.promisify(execFile);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- TOOL 1: Autoresearch ---
async function performResearch(topic) {
    console.log(`\n🔍 [Autoresearch] Searching database for: ${topic}...`);
    return `Facts about ${topic}: Revenue is up 20%. The new architecture is serverless. Launch date is Q4.`;
}

// --- TOOL 2: Skills Execution ---
async function runSkillsScript(fileType, title, content) {
    console.log(`\n⚙️ [Agent] Executing skills.bat for a .${fileType}...`);
    const flags = ["--type", fileType, "--title", title, "--content", content];
    
    try {
        // Points to skills.bat for Windows compatibility!
        const { stdout } = await execFilePromise('skills.bat', flags); 
        console.log(`   ${stdout.trim()}`);
        return "File generated successfully.";
    } catch (error) {
        console.error("❌ Error running script:", error);
        return "Failed to generate file.";
    }
}

// --- MAIN AGENT LOOP ---
async function runAgent(userPrompt) {
    console.log("🤖 Gemini Agent initialized. Processing request...");

    // Here is the tools array that went missing!
    const tools = [{
        functionDeclarations: [
            {
                name: "research_topic",
                description: "Gather facts about a topic before writing.",
                parameters: {
                    type: "OBJECT",
                    properties: { topic: { type: "STRING" } },
                    required: ["topic"]
                }
            },
            {
                name: "execute_skills_script",
                description: "Generates the final file. ONLY use after researching.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        fileType: { type: "STRING", description: "Must be docx, pptx, pdf, or excel" },
                        title: { type: "STRING" },
                        content: { type: "STRING" }
                    },
                    required: ["fileType", "title", "content"]
                }
            }
        ]
    }];

    try {
        // Using the 2.0-flash model to avoid the 503 traffic jam
        const chat = ai.chats.create({
            model: "gemini-2.0-flash",
            config: {
                systemInstruction: "You are a brand-aware document agent. ALWAYS use 'research_topic' first. Then use 'execute_skills_script' to build the file. Tone: Professional.",
                tools: tools
            }
        });

        const response1 = await chat.sendMessage({ message: userPrompt });

        // Check if the AI decided to use a tool
        if (response1.functionCalls) {
            for (const call of response1.functionCalls) {
                if (call.name === "research_topic") {
                    
                    const researchResult = await performResearch(call.args.topic);
                    
                    // Send research back to the AI
                    const response2 = await chat.sendMessage({ 
                        message: [{ functionResponse: { name: call.name, response: { result: researchResult } } }]
                    });
                    
                    // Check if it's ready to generate the file
                    if (response2.functionCalls) {
                        for (const finalCall of response2.functionCalls) {
                            if (finalCall.name === "execute_skills_script") {
                                await runSkillsScript(
                                    finalCall.args.fileType, 
                                    finalCall.args.title, 
                                    finalCall.args.content
                                );
                            }
                        }
                    }
                }
            }
        } else {
            console.log("Agent responded without tools:", response1.text);
        }
    } catch (error) {
        // The safety net!
        console.error("\n⚠️ Agent encountered an API error. It did not crash Node.");
        console.error(`Error Details: ${error.message}`);
        console.log("Tip: If it says 503 High Demand, just wait a minute and try again.");
    }
}

// Trigger the Agent
runAgent("Create a quick pptx presentation about our new architecture.");
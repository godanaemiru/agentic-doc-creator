require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const { execFile } = require("child_process");
const util = require("util");
const fs = require("fs");

const execFilePromise = util.promisify(execFile);
const app = express();

app.use(express.json());
app.use(express.static("public")); 

const MEMORY_FILE = "./memory.json";

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPEN_ROUTER_KEY,
    defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Kolaborate Agent",
    }
});

function loadLearnedRules() {
    if (!fs.existsSync(MEMORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
}

async function performResearch(topic) {
    console.log(`\n🔍 [Autoresearch] Scraping Wikipedia for: "${topic}"...`);
    try {
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${topic.replace(/\s+/g, '_')}`);
        if (!response.ok) return "No web data found.";
        const data = await response.json();
        return data.extract ? `REAL DATA: ${data.extract}` : "No summary found.";
    } catch (e) { 
        return "Search failed."; 
    }
}

async function runSkillsScript(fileType, title, content) {
    console.log(`\n⚙️ [Factory] Building a .${fileType} file...`);
    const flags = ["--type", fileType, "--title", title, "--content", content];
    try {
        const { stdout } = await execFilePromise('node', ['generator.js', ...flags]);
        return stdout.trim(); 
    } catch (error) { 
        console.error("🔥 GENERATOR CRASHED:", error);
        throw new Error("File generation failed. Check terminal."); 
    }
}

async function executeAgent(messages, tools) {
    const FREE_MODELS = [
        "meta-llama/llama-3.3-70b-instruct:free", 
        "qwen/qwen-2.5-coder-32b-instruct:free",  
        "mistralai/mistral-nemo:free",
        "openrouter/free" 
    ];

    for (const model of FREE_MODELS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`\n📡 Routing to: ${model} (Attempt ${attempt})...`);
                const response = await openai.chat.completions.create({
                    model: model,
                    messages: messages,
                    tools: tools,
                    tool_choice: "auto" 
                });

                const msg = response.choices[0].message;
                
                if (!msg.tool_calls) {
                    console.log(`   ❌ ${model} went rogue and ignored tools.`);
                    if (attempt === 2) console.log(`   ⏭️ Moving to next model...`);
                    continue; 
                }

                console.log(`   ✅ ${model} successfully triggered tools!`);
                return msg; 
            } catch (error) {
                console.log(`   ⚠️ ${model} failed (Error: ${error.status || 'Offline'}). Trying next...`);
                break; 
            }
        }
    }
    throw new Error("All free endpoints are currently down or refused to use tools.");
}

function safeParse(jsonString) {
    try {
        let cleaned = jsonString.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("🔥 Raw Bad JSON from AI:", jsonString);
        return null;
    }
}

app.post("/api/generate", async (req, res) => {
    const { prompt, fileType } = req.body; 
    
    const learnedRules = loadLearnedRules();
    let memoryPrompt = learnedRules.length > 0 
        ? `\nCRITICAL LEARNED RULES:\n${learnedRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}` 
        : "";

    const systemInstruction = `You are a brand-aware document agent for Kolaborate. YOU MUST USE TOOLS. 
    The user wants to generate a .${fileType} file. 
    CRITICAL FORMATTING RULES: 
    - Separate major sections or slides using exactly two blank lines (hit Enter twice).
    - Do not use markdown headers (like ##) unless strictly necessary.
    Tone: Professional. ${memoryPrompt}`;

    const tools = [
        { type: "function", function: { name: "research_topic", description: "Search Wikipedia. Exact broad noun only.", parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } } },
        { type: "function", function: { name: "execute_skills_script", description: "Create the file.", parameters: { type: "object", properties: { fileType: { type: "string", enum: [fileType] }, title: { type: "string" }, content: { type: "string" } }, required: ["fileType", "title", "content"] } } }
    ];

    try {
        let messages = [{ role: "system", content: systemInstruction }, { role: "user", content: prompt }];

        const msg1 = await executeAgent(messages, tools);
        const toolTriggered = msg1.tool_calls[0].function.name;
        
        if (toolTriggered === "execute_skills_script") {
            const args = safeParse(msg1.tool_calls[0].function.arguments);
            if (!args) throw new Error("AI output invalid JSON.");
            const fileName = await runSkillsScript(fileType, args.title, args.content);
            return res.json({ success: true, fileName: fileName, message: "Document ready!" });
        }
        
        if (toolTriggered === "research_topic") {
            const args1 = safeParse(msg1.tool_calls[0].function.arguments);
            const researchResult = await performResearch(args1.topic);
            
            messages.push(msg1);
            messages.push({ role: "tool", tool_call_id: msg1.tool_calls[0].id, content: researchResult });

            const msg2 = await executeAgent(messages, tools);

            if (msg2.tool_calls && msg2.tool_calls[0].function.name === "execute_skills_script") {
                const args2 = safeParse(msg2.tool_calls[0].function.arguments);
                const fileName = await runSkillsScript(fileType, args2.title, args2.content);
                return res.json({ success: true, fileName: fileName, message: "Document ready!" });
            }
        }
        res.json({ success: false, message: "Agent failed to sequence." });
    } catch (error) { 
        res.status(500).json({ success: false, message: error.message }); 
    }
});

app.post("/api/feedback", (req, res) => {
    const { feedback } = req.body;
    const currentMemory = loadLearnedRules();
    currentMemory.push(feedback);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(currentMemory, null, 2));
    res.json({ success: true });
});

app.listen(3000, () => {
    console.log("\n=============================================");
    console.log("🚀 KOLABORATE HACKATHON SERVER RUNNING!");
    console.log("👉 Open http://localhost:3000 in your browser");
    console.log("=============================================\n");
});
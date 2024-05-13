require('dotenv').config();
const express = require('express');
const http = require('http');
const axios = require('axios');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 3000;
let processImageMsg = (process.env.processImageMsg === 'true');
let callSign = process.env.callSign;

app.use(express.json());

// LINE Bot Webhook
app.post('/webhook', async (req, res) => {
    const events = req.body.events;
    
    // 處理收到的事件
    for (const event of events) {
        if (event.type === 'message') {
            const message = event.message;

            if (message.type === 'text') {
                // 處理文字訊息
                const text = message.text;
                const userId = event.source.userId;

                if (text.startsWith(callSign)) {
                    // 文字訊息以「魚酥」開頭，處理文字訊息...
                    const escapedCallSign = callSign.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const userInput = text.replace(new RegExp('^' + escapedCallSign + '\\s*'), '').trim();
                    console.log(`UserInput: [${userId}] ${userInput}`);
                    try {
                        const processedText = await processText(userInput);
                        console.log(`Response: [${userId}] ${processedText}`);
                        await pushMessage(userId, processedText);
                    } catch (error) {
                        console.error('Error replying message:', error);
                        await pushMessage(userId, '對不起，處理消息時出錯。');
                    }
                }
            } else if (message.type === 'image' && processImageMsg) {
                // 處理圖片訊息
                const userId = event.source.userId;
                const imageMessageId = message.id;

                try {
                    // 取得圖片二進制資料
                    const imageBinary = await getImageBinary(imageMessageId);
                    console.log(`UserInput: [${userId}] 使用者上傳一張圖片`);
                    // 使用 Google Generative AI 處理圖片訊息
                    const processedText = await processImage(imageBinary);

                    // 回覆訊息給使用者
                    await pushMessage(userId, processedText);
                    console.log(`Response: [${userId}] ${processedText}`);
                } catch (error) {
                    console.error('Error processing image:', error);
                    await pushMessage(userId, '對不起，處理圖片時出錯。');
                }
            }
        }
    }

    // 回覆 LINE 伺服器，表示訊息已成功接收
    res.sendStatus(200);
});

// 使用 Google Generative AI 處理文字訊息
async function processText(userInput) {
    const MODEL_NAME = "gemini-1.0-pro";
    const API_KEY = process.env.GGAI_API_KEY;
    
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    
    const generationConfig = {
        temperature: 0.5,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
        stopSequences: [
            "bbu",
        ],
    };

    const safetySettings = [
        {
            "category": "HARM_CATEGORY_HARASSMENT",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_HATE_SPEECH",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
            "threshold": "BLOCK_NONE"
        },
    ];

    const chat = model.startChat({
        generationConfig,
        safetySettings,
        history: [],
    });

    const result = await chat.sendMessage(userInput);
    const response = result.response;

    // 返回回覆給使用者的訊息
    return response.text();
}

// 使用 Google Generative AI 處理圖片訊息
async function processImage(imageBinary) {
    // 在這裡添加您對圖片訊息的處理邏輯
    // 例如：使用 Google Generative AI 進行圖像識別、圖像生成等
    // 返回處理後的文字訊息

    const genAI = new GoogleGenerativeAI(process.env.GGAI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    const prompt = "請描述圖片內容";
    const mimeType = "image/png";

    // 將圖片轉換成 GoogleGenerativeAI.Part 物件
    const imageParts = [
        {
            inlineData: {
                data: Buffer.from(imageBinary, "binary").toString("base64"),
                mimeType
            }
        }
    ];

    // 設定安全性設定
    const safetySettings = [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
    ];

    // 使用 Google Generative AI 處理圖片
    const result = await model.generateContent([prompt, ...imageParts], safetySettings);
    const text = result.response.text();
    return text;
}

// 向使用者發送主動訊息的函式
async function pushMessage(userId, text) {
    const accessToken = process.env.CHANNEL_ACCESS_TOKEN;
    const url = 'https://api.line.me/v2/bot/message/push';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
    };
    const data = {
        to: userId,
        messages: [{
            type: 'text',
            text: text
        }]
    };

    await axios.post(url, data, { headers: headers });
}

// 取得圖片二進制資料
async function getImageBinary(messageId) {
    const LINE_HEADER = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
    };

    const originalImage = await axios({
        method: "get",
        headers: LINE_HEADER,
        url: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        responseType: "arraybuffer"
    });

    return originalImage.data;
}

// 啟動伺服器
const server = http.createServer(app);
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { Message } from "../types";

// Initialize the API client
// Note: We strictly use process.env.API_KEY as per security guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = "gemini-2.5-flash";

export const createChatSession = (): Chat => {
  return ai.chats.create({
    model: MODEL_NAME,
    config: {
      temperature: 0.7,
      systemInstruction: "You are a helpful, professional, and intelligent AI assistant. Your interface is designed with a sleek Red and Black aesthetic. You answer concisely and accurately. You support all languages, including Arabic, with excellent proficiency.",
    },
  });
};

export const sendMessageStream = async (
  chat: Chat,
  message: string,
  onChunk: (text: string) => void
): Promise<void> => {
  try {
    const resultStream = await chat.sendMessageStream({ message });
    
    for await (const chunk of resultStream) {
      const c = chunk as GenerateContentResponse;
      if (c.text) {
        onChunk(c.text);
      }
    }
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to send message");
  }
};

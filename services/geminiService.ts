import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const rewriteSocialPost = async (originalContent: string, instruction: string): Promise<string> => {
  if (!apiKey) {
    console.warn("API Key is missing. Returning mock response.");
    return `[Mock AI Response]: Here is a rewritten version of "${originalContent}" based on "${instruction}".`;
  }

  try {
    const prompt = `
      You are a social media expert for a furniture company called "Furniture Distributors".
      Please rewrite the following social media post content based on the user's specific instruction.
      
      Original Content: "${originalContent}"
      Instruction: "${instruction}"
      
      Return ONLY the rewritten content text, no conversational filler.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || originalContent;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return originalContent; // Fallback to original
  }
};

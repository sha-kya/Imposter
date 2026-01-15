import { GoogleGenAI, Type } from "@google/genai";
import { Difficulty } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

interface GameContent {
  secretWord: string;
  imposterHint?: string;
}

interface UndercoverContent {
  secretWord: string;
  imposterWord: string;
}

export const generateGameContent = async (
  category: string, 
  difficulty: Difficulty, 
  includeImposterHint: boolean
): Promise<GameContent> => {
  try {
    const ai = getAI();
    
    let difficultyInstruction = "";
    switch (difficulty) {
      case 'EASY':
        difficultyInstruction = "The word should be very common, simple, and widely known.";
        break;
      case 'MEDIUM':
        difficultyInstruction = "The word should be standard vocabulary. Common knowledge.";
        break;
      case 'HARD':
        difficultyInstruction = "The word should be challenging, specific, or abstract.";
        break;
      case 'INSANE':
        difficultyInstruction = "The word should be obscure, highly specific, or complex.";
        break;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a secret word for the category "${category}". 
      ${difficultyInstruction}
      ${includeImposterHint ? 'Also generate a short, vague hint about the secret word that helps the imposter blend in without revealing the word explicitly (e.g. if word is "Apple", hint might be "It is a fruit" or "It is red").' : ''}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            secretWord: { type: Type.STRING },
            imposterHint: { type: Type.STRING },
          },
          required: includeImposterHint ? ["secretWord", "imposterHint"] : ["secretWord"],
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    
    return {
      secretWord: json.secretWord || "Banana",
      imposterHint: json.imposterHint,
    };
  } catch (error) {
    console.error("Error generating content:", error);
    return { secretWord: "Banana", imposterHint: "It is a fruit" };
  }
};

export const generateUndercoverContent = async (
  category: string, 
  difficulty: Difficulty
): Promise<UndercoverContent> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate two distinct but related words for the category "${category}". 
      1. "secretWord": The main word for the majority.
      2. "imposterWord": A different word for the imposter.
      The words should be related enough to allow for a confusing conversation (e.g. "Apple" vs "Orange", "Guitar" vs "Violin", "Beach" vs "Pool").
      Difficulty level: ${difficulty}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            secretWord: { type: Type.STRING },
            imposterWord: { type: Type.STRING },
          },
          required: ["secretWord", "imposterWord"],
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    
    return {
      secretWord: json.secretWord || "Apple",
      imposterWord: json.imposterWord || "Pear",
    };
  } catch (error) {
    console.error("Error generating undercover content:", error);
    return { secretWord: "Apple", imposterWord: "Orange" };
  }
};

export const generateHint = async (category: string, secretWord: string): Promise<string> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a single, short, vague discussion question about the secret word "${secretWord}" in the category "${category}" to help find the imposter.
      CRITICAL RULE: Do NOT include the word "${secretWord}" itself or any close variations in the question. The goal is to discuss attributes without naming it.`,
    });
    return response.text?.trim() || "Ask about the size.";
  } catch (error) {
    return "Ask about the color or material.";
  }
};

export const generateImposterHintOnly = async (category: string, secretWord: string): Promise<string> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a short, subtle hint for an imposter who doesn't know the secret word is "${secretWord}" in the category "${category}". 
      The hint should describe a general attribute (like color, usage, size, or category type) so they can blend in. 
      Do NOT mention the word "${secretWord}".`,
    });
    return response.text?.trim() || "It is a common item.";
  } catch (error) {
    console.error("Error generating imposter hint:", error);
    return "It relates to " + category;
  }
};
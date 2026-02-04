/**
 * Intent Classifier Service
 * 
 * Analyzes user prompts to determine the type of modification needed
 * and the affected areas of the project.
 * 
 * Requirements: 3.3, 4.1
 */

import type { IntentClassification, ProjectState } from '@ai-app-builder/shared';
import { GeminiClient, createGeminiClient } from '../ai';
import { config } from '../config';

/**
 * System prompt for intent classification.
 */
const CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for an AI-powered application builder.
Your job is to analyze user prompts and determine:
1. The type of modification requested
2. Which files or components are likely affected
3. A confidence score for your classification

You must respond with ONLY valid JSON in this exact format:
{
  "type": "add_component" | "modify_component" | "add_route" | "modify_style" | "refactor" | "delete" | "other",
  "confidence": 0.0-1.0,
  "affectedAreas": ["list", "of", "affected", "file", "paths", "or", "component", "names"],
  "description": "Brief description of what the user wants to do"
}

Classification types:
- "add_component": User wants to add a new React component
- "modify_component": User wants to change an existing component
- "add_route": User wants to add a new API route or page
- "modify_style": User wants to change styling/CSS
- "refactor": User wants to restructure or reorganize code
- "delete": User wants to remove files or components
- "other": Any other type of modification

Rules:
- Output ONLY the JSON object, no markdown, no explanation
- Be specific about affected areas when possible
- Use file paths from the project context when available
- Set confidence lower if the intent is ambiguous`;

/**
 * Build the classification prompt with project context.
 */
function buildClassificationPrompt(
  userPrompt: string,
  projectState: ProjectState
): string {
  const fileList = Object.keys(projectState.files).join('\n');

  return `Project: ${projectState.name}
Description: ${projectState.description}

Current project files:
${fileList}

User request: "${userPrompt}"

Analyze this request and classify the intent. Respond with JSON only.`;
}

/**
 * Parse the classification response from Gemini.
 */
function parseClassificationResponse(response: string): IntentClassification | null {
  try {
    // Try to extract JSON from the response
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      const lines = jsonStr.split('\n');
      jsonStr = lines.slice(1, -1).join('\n');
    }

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (
      typeof parsed.type !== 'string' ||
      typeof parsed.confidence !== 'number' ||
      !Array.isArray(parsed.affectedAreas) ||
      typeof parsed.description !== 'string'
    ) {
      return null;
    }

    // Validate type is one of the allowed values
    const validTypes = [
      'generate',
      'add_component',
      'modify_component',
      'add_route',
      'modify_style',
      'refactor',
      'delete',
      'other',
    ];

    if (!validTypes.includes(parsed.type)) {
      parsed.type = 'other';
    }

    // Clamp confidence to 0-1
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

    return {
      type: parsed.type,
      confidence: parsed.confidence,
      affectedAreas: parsed.affectedAreas.map(String),
      description: parsed.description,
    };
  } catch {
    return null;
  }
}

/**
 * Intent Classifier service for analyzing user modification requests.
 */
export class IntentClassifier {
  private geminiClient: GeminiClient;

  constructor(geminiClient?: GeminiClient) {
    // Use Flash model for classification as it is a reasoning task that requires less creativity
    // and is significantly cheaper/faster
    this.geminiClient = geminiClient ?? createGeminiClient(config.ai.easyModel);
  }

  /**
   * Classify the intent of a user prompt.
   */
  async classify(
    prompt: string,
    projectState: ProjectState
  ): Promise<IntentClassification> {
    // Build the classification prompt
    const classificationPrompt = buildClassificationPrompt(prompt, projectState);

    // Call Gemini API
    const response = await this.geminiClient.generate({
      prompt: classificationPrompt,
      systemInstruction: CLASSIFICATION_SYSTEM_PROMPT,
      temperature: 0.3, // Lower temperature for more consistent classification
      maxOutputTokens: 1024,
    });

    if (!response.success || !response.content) {
      // Return a fallback classification on API failure
      return this.createFallbackClassification(prompt, projectState);
    }

    // Parse the response
    const classification = parseClassificationResponse(response.content);

    if (!classification) {
      // Return a fallback classification on parse failure
      return this.createFallbackClassification(prompt, projectState);
    }

    return classification;
  }

  /**
   * Create a fallback classification using heuristics when AI fails.
   */
  private createFallbackClassification(
    prompt: string,
    projectState: ProjectState
  ): IntentClassification {
    const lowerPrompt = prompt.toLowerCase();
    const files = Object.keys(projectState.files);

    // Simple keyword-based classification
    let type: IntentClassification['type'] = 'other';
    let description = 'Modification request';
    const affectedAreas: string[] = [];

    // Check for add patterns
    if (
      lowerPrompt.includes('add') ||
      lowerPrompt.includes('create') ||
      lowerPrompt.includes('new')
    ) {
      if (lowerPrompt.includes('component')) {
        type = 'add_component';
        description = 'Add a new component';
      } else if (
        lowerPrompt.includes('route') ||
        lowerPrompt.includes('api') ||
        lowerPrompt.includes('endpoint')
      ) {
        type = 'add_route';
        description = 'Add a new route or API endpoint';
      }
    }

    // Check for modify patterns
    if (
      lowerPrompt.includes('change') ||
      lowerPrompt.includes('update') ||
      lowerPrompt.includes('modify') ||
      lowerPrompt.includes('edit')
    ) {
      if (
        lowerPrompt.includes('style') ||
        lowerPrompt.includes('css') ||
        lowerPrompt.includes('color') ||
        lowerPrompt.includes('layout')
      ) {
        type = 'modify_style';
        description = 'Modify styling';
      } else if (lowerPrompt.includes('component')) {
        type = 'modify_component';
        description = 'Modify an existing component';
      }
    }

    // Check for delete patterns
    if (
      lowerPrompt.includes('delete') ||
      lowerPrompt.includes('remove') ||
      lowerPrompt.includes('drop')
    ) {
      type = 'delete';
      description = 'Delete files or components';
    }

    // Check for refactor patterns
    if (
      lowerPrompt.includes('refactor') ||
      lowerPrompt.includes('reorganize') ||
      lowerPrompt.includes('restructure')
    ) {
      type = 'refactor';
      description = 'Refactor code structure';
    }

    // Try to find mentioned files
    for (const file of files) {
      const fileName = file.split('/').pop()?.toLowerCase() ?? '';
      if (lowerPrompt.includes(fileName.replace(/\.[^.]+$/, ''))) {
        affectedAreas.push(file);
      }
    }

    return {
      type,
      confidence: 0.5, // Low confidence for fallback
      affectedAreas,
      description,
    };
  }
}

/**
 * Create an IntentClassifier instance.
 */
export function createIntentClassifier(geminiClient?: GeminiClient): IntentClassifier {
  return new IntentClassifier(geminiClient);
}

import { inject, Injectable } from '@angular/core';
import type { ChatMessage } from '@models/chat';
import { ChatAdaptersService } from '@features/chat/data/chat-adapters.service';
import { ChatThreadsService } from '@features/chat/data/chat-threads.service';
import { SystemPromptsService } from './system-prompts.service';
import { ChatTurn } from '@features/chat/adapters/llm-adapter';

export interface GeneratedMetadata {
  title: string;
  tags: string[];
  summary: string;
}

@Injectable({
  providedIn: 'root'
})
export class MetadataGeneratorService {
  private readonly adapters = inject(ChatAdaptersService);
  private readonly threads = inject(ChatThreadsService);
  private readonly systemPromptsService = inject(SystemPromptsService);

  async generateMetadata(threadId: string, messages: ChatMessage[]): Promise<GeneratedMetadata | null> {
    console.log('[MetadataGenerator] Starting metadata generation', { threadId, messageCount: messages.length });
    
    if (!messages.length) {
      console.warn('[MetadataGenerator] No messages provided, returning null');
      return null;
    }

    const metadataSettings = this.systemPromptsService.metadata();
    console.log('[MetadataGenerator] Metadata settings', { 
      modelId: metadataSettings.modelId, 
      temperature: metadataSettings.temperature,
      maxTokens: metadataSettings.maxTokens 
    });
    
    // Determine which model to use
    let modelId: string | null = null;
    if (metadataSettings.modelId === 'default') {
      const activeThread = this.threads.getThreadSnapshot(threadId);
      if (activeThread) {
        const available = this.adapters.models();
        const candidate = activeThread.preferredModelId;
        if (candidate && available.some((model) => model.id === candidate)) {
          modelId = candidate;
        } else {
          modelId = available[0]?.id ?? null;
        }
      } else {
        modelId = this.adapters.models()[0]?.id ?? null;
      }
    } else {
      modelId = metadataSettings.modelId;
    }

    const availableModels = this.adapters.models();
    if (availableModels.length === 0 || !modelId) {
      console.error('[MetadataGenerator] No available models or modelId is null', { 
        availableModelsCount: availableModels.length, 
        modelId 
      });
      return null;
    }
    
    console.log('[MetadataGenerator] Selected model', { modelId });

    try {
      // Convert messages to ChatTurn format
      const turns: ChatTurn[] = messages
        .map((message): ChatTurn | null => {
          let role: 'system' | 'user' | 'assistant' | 'tool';
          if (message.role === 'system') {
            role = 'system';
          } else if (message.role === 'assistant') {
            role = 'assistant';
          } else if (message.role === 'tool') {
            role = 'tool';
          } else {
            role = 'user';
          }
          const content = message.rawMd ?? '';
          if (!content.trim()) {
            return null;
          }
          return { role, content };
        })
        .filter((turn): turn is ChatTurn => turn !== null);

      if (turns.length === 0) {
        console.warn('[MetadataGenerator] No valid turns after conversion, returning null');
        return null;
      }

      // Sandwich strategy: Re-inject instructions at the end to prevent context leaking
      turns.push({
        role: 'system',
        content: `IMPORTANT REMINDER: ${metadataSettings.prompt}`
      });

      console.log('[MetadataGenerator] Calling LLM with', { 
        turnCount: turns.length, 
        systemPromptLength: metadataSettings.prompt.length 
      });

      // Call the new non-streaming method
      const response = await this.adapters.generateText(modelId, turns, {
        system: metadataSettings.prompt,
        temperature: metadataSettings.temperature,
        maxTokens: metadataSettings.maxTokens
      });

      if (!response) {
        console.error('[MetadataGenerator] LLM returned an empty response for metadata generation.');
        return null;
      }

      console.log('[MetadataGenerator] Raw LLM response received', { 
        responseLength: response.length,
        responsePreview: response.substring(0, 200) + (response.length > 200 ? '...' : '')
      });

      // Parse JSON response
      const trimmed = response.trim();
      console.log('[MetadataGenerator] Trimmed response', { 
        trimmedLength: trimmed.length,
        trimmedPreview: trimmed.substring(0, 200) + (trimmed.length > 200 ? '...' : '')
      });

      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      console.log('[MetadataGenerator] Regex match result', { 
        matched: !!jsonMatch,
        matchGroups: jsonMatch ? jsonMatch.length : 0,
        regexPattern: '/```(?:json)?\\s*(\\{[\\s\\S]*?\\})\\s*```/'
      });

      const jsonStr = jsonMatch ? jsonMatch[1] : trimmed;
      console.log('[MetadataGenerator] Extracted JSON string', { 
        jsonStrLength: jsonStr.length,
        jsonStrPreview: jsonStr.substring(0, 200) + (jsonStr.length > 200 ? '...' : ''),
        isFromMatch: !!jsonMatch
      });
      
      try {
        const parsed = JSON.parse(jsonStr) as Partial<GeneratedMetadata>;
        console.log('[MetadataGenerator] Successfully parsed JSON', { parsed });
        
        const result = {
          title: parsed.title?.trim() || 'Untitled Conversation',
          tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [],
          summary: parsed.summary?.trim() || ''
        };
        
        console.log('[MetadataGenerator] Final metadata result', { result });
        return result;
      } catch (parseError) {
        console.error('[MetadataGenerator] JSON parsing failed, falling back to heuristic parser', { 
          error: parseError,
          jsonStr: jsonStr.substring(0, 500)
        });
        // If JSON parsing fails, try to extract fields manually
        const fallbackResult = this.fallbackParseMetadata(trimmed);
        console.log('[MetadataGenerator] Fallback parser result', { fallbackResult });
        return fallbackResult;
      }
    } catch (error) {
      console.error('[MetadataGenerator] Error generating metadata with LLM', { 
        error,
        threadId,
        messageCount: messages.length,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }

  private fallbackParseMetadata(text: string): GeneratedMetadata {
    console.log('[MetadataGenerator] Using fallback parser', { textLength: text.length });
    
    // Fallback: try to extract title, tags, and summary from text
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    console.log('[MetadataGenerator] Fallback parser - split into lines', { lineCount: lines.length });
    
    const title = lines[0] || 'Untitled Conversation';
    const tags: string[] = [];
    let summary = '';

    // Look for tags (lines starting with # or containing "tags:")
    for (const line of lines) {
      if (line.toLowerCase().includes('tags:')) {
        const tagPart = line.split(':')[1]?.trim() || '';
        tags.push(...tagPart.split(',').map(t => t.trim()).filter(t => t));
      } else if (line.toLowerCase().startsWith('tag:')) {
        tags.push(line.substring(4).trim());
      }
    }

    // Summary is everything else
    summary = lines.slice(1).filter(l => !l.toLowerCase().includes('tag')).join(' ');

    const result = {
      title: title.length > 60 ? title.substring(0, 57) + '...' : title,
      tags: tags.length > 0 ? tags : [],
      summary: summary || 'No summary available.'
    };
    
    console.log('[MetadataGenerator] Fallback parser result', { result });
    return result;
  }
}


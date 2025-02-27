
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PromptInputProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  disabled?: boolean;
}

export const PromptInput = ({ prompt, setPrompt, disabled = false }: PromptInputProps) => {
  return (
    <div className="space-y-2 w-full">
      <Label htmlFor="prompt">Drum Generation Prompt</Label>
      <Input
        id="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Create a cool drum pattern"
        disabled={disabled}
        className="w-full"
      />
      <p className="text-xs text-gray-500">
        Customize how the AI generates drum patterns from your recording.
      </p>
    </div>
  );
};

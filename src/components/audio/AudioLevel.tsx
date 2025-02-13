
import { useEffect, useRef } from "react";

interface AudioLevelProps {
  level: number;
  isRecording: boolean;
}

export const AudioLevel = ({ level, isRecording }: AudioLevelProps) => {
  // Prevent negative or invalid values
  const normalizedLevel = Math.max(0, Math.min(level, 255));
  const percentage = Math.round((normalizedLevel / 255) * 100);

  if (!isRecording) return null;

  return (
    <div className="w-full space-y-2">
      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-100 ${
            percentage > 80 ? 'bg-red-500' : 
            percentage > 60 ? 'bg-yellow-500' : 
            'bg-blue-500'
          }`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-sm text-gray-500">
        {percentage > 80 ? 'Too loud!' : 
         percentage < 20 ? 'Speak louder' : 
         `Level: ${percentage}%`}
      </p>
    </div>
  );
};

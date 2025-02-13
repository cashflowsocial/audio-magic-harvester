
import { useEffect, useRef } from "react";

interface AudioLevelProps {
  level: number;
  isRecording: boolean;
}

export const AudioLevel = ({ level, isRecording }: AudioLevelProps) => {
  if (!isRecording) return null;

  return (
    <>
      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
        <div 
          className="h-full bg-blue-500 transition-all duration-100"
          style={{ width: `${(level / 255) * 100}%` }}
        />
      </div>
      <p className="text-sm text-gray-500 mb-2">
        Audio Level: {Math.round((level / 255) * 100)}%
      </p>
    </>
  );
};


import { Midi } from 'https://esm.sh/jsmidgen@0.1.5';
import { Note } from './audioAnalyzer.ts';

export function generateMidiFile(notes: Note[], tempo: number): Uint8Array {
  const file = new Midi();
  const track = file.addTrack();
  
  // Set tempo
  track.setTempo(tempo);
  
  // Add notes
  notes.forEach(note => {
    const duration = Math.round((note.endTime - note.startTime) * 4); // Convert to quarter notes
    track.addNote(0, note.pitch, duration, note.velocity);
  });
  
  return new Uint8Array(file.toBytes());
}
